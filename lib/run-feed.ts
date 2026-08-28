import { parseBuffer } from "music-metadata";
import { CRON_BUDGET_MS, DEFAULT_TTS_VOICE, MAX_TTS_CHARS } from "../shared/limits.js";
import { blobConfigured, uploadMp3 } from "./blob.js";
import { chunkText } from "./chunk-text.js";
import {
  azureConfigured,
  listNewMessages,
  refreshAccessToken,
  resolveFolderId,
} from "./graph.js";
import {
  type MailCursor,
  type PendingJob,
  type PendingPart,
  type RssEpisode,
  type WaitingMessage,
  getCursor,
  getEpisodes,
  getPending,
  getRefreshToken,
  redisConfigured,
  setCursor,
  setEpisodes,
  setPending,
  setRefreshToken,
} from "./redis.js";
import { synthesizeMp3 } from "./tts.js";

const DEMO_TEXT =
  "Este é um episódio de exemplo do email-to-podcast. O texto é genérico e não vem de nenhuma caixa de e-mail.";

function saoPauloDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function saoPauloLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function partTitle(base: string, index: number, total: number): string {
  if (total <= 1) return base;
  return `${base} (${index}/${total})`;
}

function withPartPrefix(text: string, index: number, total: number): string {
  if (total <= 1) return text;
  return `Parte ${index} de ${total}. ${text}`;
}

async function mp3DurationSeconds(bytes: Buffer): Promise<number> {
  try {
    const meta = await parseBuffer(bytes, "audio/mpeg");
    if (typeof meta.format.duration === "number") {
      return Math.max(1, Math.round(meta.format.duration));
    }
  } catch {
    // 96 kbps ≈ 12 KB/s
  }
  return Math.max(1, Math.round(bytes.length / 12_000));
}

function makeJob(input: {
  id: string;
  kind: "digest" | "series";
  title: string;
  pubDate: string;
  messageIds: string[];
  receivedDates: string[];
  script: string;
}): PendingJob {
  const chunks = chunkText(input.script);
  const total = Math.max(1, chunks.length);
  const parts: PendingPart[] = (chunks.length ? chunks : [input.script]).map((text, index) => ({
    index: index + 1,
    total,
    text: withPartPrefix(text, index + 1, total),
  }));
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    pubDate: input.pubDate,
    messageIds: input.messageIds,
    receivedDates: input.receivedDates,
    parts,
  };
}

function jobComplete(job: PendingJob): boolean {
  return job.parts.every((part) => part.blobUrl && part.bytes != null && part.durationSeconds != null);
}

function episodesFromJob(job: PendingJob): RssEpisode[] {
  const start = new Date(job.pubDate).getTime();
  return job.parts.map((part) => ({
    guid: `${job.id}-p${part.index}`,
    title: partTitle(job.title, part.index, part.total),
    pubDate: new Date(start + (part.index - 1) * 1000).toISOString(),
    url: part.blobUrl ?? "",
    length: part.bytes ?? 0,
    durationSeconds: part.durationSeconds ?? 1,
  }));
}

function advanceCursor(cursor: MailCursor | null, done: { id: string; receivedDateTime: string }[]): MailCursor {
  let lastReceived = cursor?.lastReceived ?? "";
  const processedIds = new Set(cursor?.processedIds ?? []);
  for (const item of done) {
    processedIds.add(item.id);
    if (item.receivedDateTime > lastReceived) lastReceived = item.receivedDateTime;
  }
  return {
    lastReceived: lastReceived || new Date().toISOString(),
    processedIds: [...processedIds].slice(-200),
  };
}

async function fillParts(job: PendingJob, deadline: number): Promise<PendingJob> {
  const parts: PendingPart[] = [];
  for (const part of job.parts) {
    if (part.blobUrl) {
      parts.push(part);
      continue;
    }
    if (Date.now() >= deadline) {
      parts.push(part);
      continue;
    }
    const mp3 = await synthesizeMp3(part.text, DEFAULT_TTS_VOICE);
    const durationSeconds = await mp3DurationSeconds(mp3);
    const blobUrl = await uploadMp3(`${job.id}-p${part.index}`, mp3);
    parts.push({ ...part, blobUrl, bytes: mp3.length, durationSeconds });
  }
  return { ...job, parts };
}

function classifyMessages(messages: WaitingMessage[]): PendingJob[] {
  if (!messages.length) return [];
  const shorts = messages.filter((message) => message.text.length <= MAX_TTS_CHARS);
  const longs = messages.filter((message) => message.text.length > MAX_TTS_CHARS);
  const jobs: PendingJob[] = [];

  if (shorts.length) {
    const latest = shorts.reduce((acc, item) =>
      item.receivedDateTime > acc.receivedDateTime ? item : acc,
    );
    const day = saoPauloDay(latest.receivedDateTime);
    const label = saoPauloLabel(latest.receivedDateTime);
    const script = [
      `Feed de ${label}.`,
      ...shorts.flatMap((message) => [`Assunto: ${message.subject}.`, message.text]),
    ].join("\n\n");
    jobs.push(
      makeJob({
        id: `digest-${day}-${shorts[0].id.replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "batch"}`,
        kind: "digest",
        title: `Feed ${label}`,
        pubDate: latest.receivedDateTime,
        messageIds: shorts.map((message) => message.id),
        receivedDates: shorts.map((message) => message.receivedDateTime),
        script,
      }),
    );
  }

  for (const message of longs) {
    jobs.push(
      makeJob({
        id: `mail-${message.id.replace(/[^a-zA-Z0-9]+/g, "").slice(-24) || "msg"}`,
        kind: "series",
        title: message.subject,
        pubDate: message.receivedDateTime,
        messageIds: [message.id],
        receivedDates: [message.receivedDateTime],
        script: message.text,
      }),
    );
  }
  return jobs;
}

export async function ensureDemo(deadline = Date.now() + 50_000): Promise<boolean> {
  if (!redisConfigured() || !blobConfigured()) return false;
  const existing = await getEpisodes();
  if (existing.length) return false;
  const now = new Date().toISOString();
  const filled = await fillParts(
    makeJob({
      id: "demo",
      kind: "digest",
      title: "Episódio de exemplo",
      pubDate: now,
      messageIds: ["demo"],
      receivedDates: [now],
      script: DEMO_TEXT,
    }),
    deadline,
  );
  if (!jobComplete(filled)) return false;
  await setEpisodes(episodesFromJob(filled));
  return true;
}

async function processJobs(
  jobs: PendingJob[],
  deadline: number,
): Promise<{ done: PendingJob[]; leftover: PendingJob[] }> {
  const done: PendingJob[] = [];
  const leftover: PendingJob[] = [];
  for (const job of jobs) {
    const filled = await fillParts(job, deadline);
    if (jobComplete(filled)) done.push(filled);
    else leftover.push(filled);
  }
  return { done, leftover };
}

export async function runFeed(): Promise<{
  demo: boolean;
  processed: number;
  published: number;
  pendingJobs: number;
  pendingMessages: number;
}> {
  if (!redisConfigured()) {
    throw new Error("Redis não configurado");
  }

  const refresh = await getRefreshToken();
  if (!azureConfigured() || !refresh) {
    const created = await ensureDemo(Date.now() + CRON_BUDGET_MS);
    return {
      demo: true,
      processed: created ? 1 : 0,
      published: created ? 1 : 0,
      pendingJobs: 0,
      pendingMessages: 0,
    };
  }
  if (!blobConfigured()) {
    throw new Error("Blob não configurado");
  }

  const tokens = await refreshAccessToken(refresh);
  if (tokens.refreshToken !== refresh) {
    await setRefreshToken(tokens.refreshToken);
  }

  const folderId = await resolveFolderId(tokens.accessToken);
  const cursor = await getCursor();
  const pending = await getPending();
  const known = new Set(cursor?.processedIds ?? []);
  for (const job of pending.jobs) {
    for (const id of job.messageIds) known.add(id);
  }
  for (const message of pending.messages) known.add(message.id);

  let fetched = await listNewMessages(tokens.accessToken, folderId, cursor?.lastReceived ?? null);
  fetched = fetched.filter((message) => !known.has(message.id));
  pending.messages.push(
    ...fetched.map((message) => ({
      id: message.id,
      subject: message.subject,
      receivedDateTime: message.receivedDateTime,
      text: message.text,
    })),
  );

  const deadline = Date.now() + CRON_BUDGET_MS;
  const continued = await processJobs(pending.jobs, deadline);
  const classified = classifyMessages(pending.messages);
  const fresh = await processJobs(classified, deadline);

  const completed = [...continued.done, ...fresh.done];
  const leftoverJobs = [...continued.leftover, ...fresh.leftover];

  let episodes = await getEpisodes();
  const finishedMail: { id: string; receivedDateTime: string }[] = [];
  for (const job of completed) {
    episodes = [...episodes, ...episodesFromJob(job)];
    job.messageIds.forEach((id, index) => {
      finishedMail.push({ id, receivedDateTime: job.receivedDates[index] ?? job.pubDate });
    });
  }
  await setEpisodes(episodes);
  if (finishedMail.length) {
    await setCursor(advanceCursor(cursor, finishedMail));
  }
  await setPending({ jobs: leftoverJobs, messages: [] });

  return {
    demo: false,
    processed: finishedMail.length,
    published: completed.reduce((sum, job) => sum + job.parts.length, 0),
    pendingJobs: leftoverJobs.length,
    pendingMessages: 0,
  };
}
