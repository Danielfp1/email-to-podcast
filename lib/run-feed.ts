import { parseBuffer } from "music-metadata";
import {
  CRON_BUDGET_MS,
  DEFAULT_TTS_VOICE,
  MAX_TTS_CHARS,
  TTS_START_GUARD_MS,
} from "../shared/limits.js";
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

async function fillParts(
  job: PendingJob,
  deadline: number,
  onProgress?: (job: PendingJob) => Promise<void>,
): Promise<PendingJob> {
  const parts: PendingPart[] = [];
  for (let i = 0; i < job.parts.length; i++) {
    const part = job.parts[i];
    if (part.blobUrl) {
      parts.push(part);
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining < TTS_START_GUARD_MS) {
      parts.push(...job.parts.slice(i));
      break;
    }
    try {
      const mp3 = await synthesizeMp3(part.text, DEFAULT_TTS_VOICE, remaining - 15_000);
      const durationSeconds = await mp3DurationSeconds(mp3);
      const blobUrl = await uploadMp3(`${job.id}-p${part.index}`, mp3);
      parts.push({ ...part, blobUrl, bytes: mp3.length, durationSeconds });
      if (onProgress) await onProgress({ ...job, parts: [...parts, ...job.parts.slice(i + 1)] });
    } catch (err) {
      console.error(err);
      parts.push(...job.parts.slice(i));
      break;
    }
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

function mergeEpisodes(existing: RssEpisode[], incoming: RssEpisode[]): RssEpisode[] {
  const byGuid = new Map(existing.map((item) => [item.guid, item]));
  for (const item of incoming) byGuid.set(item.guid, item);
  return [...byGuid.values()];
}

async function persistQueue(jobs: PendingJob[]): Promise<void> {
  await setPending({ jobs, messages: [] });
}

async function publishJob(job: PendingJob, cursor: MailCursor | null): Promise<MailCursor> {
  const episodes = mergeEpisodes(await getEpisodes(), episodesFromJob(job));
  await setEpisodes(episodes);
  const finishedMail = job.messageIds.map((id, index) => ({
    id,
    receivedDateTime: job.receivedDates[index] ?? job.pubDate,
  }));
  const next = advanceCursor(cursor, finishedMail);
  await setCursor(next);
  return next;
}

async function processJobs(
  jobs: PendingJob[],
  deadline: number,
  cursor: MailCursor | null,
): Promise<{ done: PendingJob[]; leftover: PendingJob[]; cursor: MailCursor | null }> {
  const working = jobs.map((job) => ({ ...job, parts: job.parts.map((part) => ({ ...part })) }));
  const done: PendingJob[] = [];
  const leftover: PendingJob[] = [];
  let nextCursor = cursor;
  for (let i = 0; i < working.length; i++) {
    const filled = await fillParts(working[i], deadline, async (partial) => {
      working[i] = partial;
      await persistQueue([...leftover, ...working.slice(i)]);
    });
    working[i] = filled;
    if (jobComplete(filled)) {
      nextCursor = await publishJob(filled, nextCursor);
      done.push(filled);
    } else {
      leftover.push(filled);
    }
    await persistQueue([...leftover, ...working.slice(i + 1)]);
  }
  return { done, leftover, cursor: nextCursor };
}

export async function runFeed(): Promise<{
  demo: boolean;
  processed: number;
  published: number;
  pendingJobs: number;
  pendingMessages: number;
}> {
  const deadline = Date.now() + CRON_BUDGET_MS;
  if (!redisConfigured()) {
    throw new Error("Redis não configurado");
  }

  const refresh = await getRefreshToken();
  if (!azureConfigured() || !refresh) {
    const created = await ensureDemo(deadline);
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

  const classified = classifyMessages(pending.messages).filter(
    (job) => !pending.jobs.some((existing) => existing.id === job.id),
  );
  const queue = [...pending.jobs, ...classified];
  await persistQueue(queue);

  const { done: completed, leftover: leftoverJobs } = await processJobs(queue, deadline, cursor);

  return {
    demo: false,
    processed: completed.reduce((sum, job) => sum + job.messageIds.length, 0),
    published: completed.reduce((sum, job) => sum + job.parts.length, 0),
    pendingJobs: leftoverJobs.length,
    pendingMessages: 0,
  };
}
