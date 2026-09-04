import { parseBuffer } from "music-metadata";
import {
  cronDeadlineMs,
  DEFAULT_TTS_VOICE,
  MAX_TTS_CHARS,
  TTS_START_GUARD_MS,
} from "../shared/limits.js";
import { blobConfigured, uploadJson, uploadMp3 } from "./blob.js";
import { chunkText } from "./chunk-text.js";
import { assignCueNumbers, emptyCounters, type EmailCue } from "./email-text.js";
import {
  azureConfigured,
  listNewMessages,
  refreshAccessToken,
  resolveFolderId,
} from "./graph.js";
import {
  type MailCursor,
  type PartSegment,
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
import {
  type Chapter,
  chapterFromCue,
  chaptersPayload,
  cueTimeInSegment,
  formatShownotes,
} from "./shownotes.js";
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

function emailScriptLength(message: WaitingMessage): number {
  return `Assunto: ${message.subject}.\n\n${message.text}`.length;
}

function cuesInText(cues: EmailCue[], text: string): EmailCue[] {
  return cues.filter((cue) => text.includes(cue.mark));
}

function partSegments(part: PendingPart): PartSegment[] {
  if (part.segments?.length) return part.segments;
  return [{ text: part.text, cues: [] }];
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

function packSegments(segments: PartSegment[], max = MAX_TTS_CHARS): PartSegment[][] {
  const parts: PartSegment[][] = [];
  let current: PartSegment[] = [];
  let length = 0;
  for (const segment of segments) {
    const extra = segment.text.length + (current.length ? 2 : 0);
    if (current.length && length + extra > max) {
      parts.push(current);
      current = [];
      length = 0;
    }
    current.push(segment);
    length += extra;
  }
  if (current.length) parts.push(current);
  return parts.length ? parts : [[]];
}

function makeJobFromSegments(input: {
  id: string;
  kind: "digest" | "series";
  title: string;
  pubDate: string;
  messageIds: string[];
  receivedDates: string[];
  segments: PartSegment[];
}): PendingJob {
  const packed = packSegments(input.segments);
  const total = Math.max(1, packed.length);
  const parts: PendingPart[] = packed.map((group, index) => {
    const segs = group.map((segment, segIndex) =>
      segIndex === 0
        ? { ...segment, text: withPartPrefix(segment.text, index + 1, total) }
        : segment,
    );
    if (input.kind === "series") {
      const subject = input.segments.find((segment) => segment.subject)?.subject;
      if (subject && segs[0] && !segs[0].subject) {
        segs[0] = { ...segs[0], subject };
      }
    }
    return {
      index: index + 1,
      total,
      text: segs.map((segment) => segment.text).join("\n\n"),
      segments: segs,
    };
  });
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

function digestSegments(messages: WaitingMessage[], label: string): PartSegment[] {
  const counters = emptyCounters();
  const intro = `Feed de ${label}.\n\n`;
  return messages.map((message, index) => {
    const assigned = assignCueNumbers(message.text, message.cues ?? [], counters);
    let text = `Assunto: ${message.subject}.\n\n${assigned.speech}`;
    if (index === 0 && intro.length + text.length <= MAX_TTS_CHARS) {
      text = `${intro}${text}`;
    }
    return { text, subject: message.subject, cues: assigned.cues };
  });
}

function seriesSegments(message: WaitingMessage): PartSegment[] {
  const assigned = assignCueNumbers(message.text, message.cues ?? [], emptyCounters());
  const script = `Assunto: ${message.subject}.\n\n${assigned.speech}`;
  const chunks = chunkText(script);
  const pieces = chunks.length ? chunks : [script];
  return pieces.map((text, index) => ({
    text,
    subject: index === 0 ? message.subject : undefined,
    cues: cuesInText(assigned.cues, text),
  }));
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
    description: part.description,
    chaptersUrl: part.chaptersUrl,
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

function buildChapters(segments: PartSegment[], durations: number[]): Chapter[] {
  const chapters: Chapter[] = [];
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const duration = durations[i] ?? 0;
    if (segment.subject) {
      chapters.push({ startTime: acc, title: segment.subject });
    }
    for (const cue of segment.cues ?? []) {
      chapters.push(chapterFromCue(cue, cueTimeInSegment(segment.text, cue.mark, acc, duration)));
    }
    acc += duration;
  }
  chapters.sort((a, b) => a.startTime - b.startTime);
  return chapters;
}

async function fillParts(
  job: PendingJob,
  deadline: number | null,
  onProgress?: (job: PendingJob) => Promise<void>,
): Promise<PendingJob> {
  const parts: PendingPart[] = [];
  for (let i = 0; i < job.parts.length; i++) {
    const part = job.parts[i];
    if (part.blobUrl) {
      parts.push(part);
      continue;
    }
    if (deadline != null && deadline - Date.now() < TTS_START_GUARD_MS) {
      parts.push(...job.parts.slice(i));
      break;
    }
    try {
      const segs = partSegments(part);
      if (!segs.length) {
        parts.push(...job.parts.slice(i));
        break;
      }
      const buffers: Buffer[] = [];
      const durations: number[] = [];
      for (const segment of segs) {
        if (deadline != null && deadline - Date.now() < TTS_START_GUARD_MS) {
          parts.push(...job.parts.slice(i));
          return { ...job, parts };
        }
        const ttsTimeout = deadline != null ? Math.max(5_000, deadline - Date.now() - 15_000) : undefined;
        const mp3 = await synthesizeMp3(segment.text, DEFAULT_TTS_VOICE, ttsTimeout);
        const durationSeconds = await mp3DurationSeconds(mp3);
        buffers.push(mp3);
        durations.push(durationSeconds);
      }
      const concat = Buffer.concat(buffers);
      const durationSeconds = durations.reduce((sum, value) => sum + value, 0);
      const blobUrl = await uploadMp3(`${job.id}-p${part.index}`, concat);
      const chapters = buildChapters(segs, durations);
      const description = formatShownotes(chapters);
      let chaptersUrl: string | undefined;
      if (chapters.length) {
        chaptersUrl = await uploadJson(`${job.id}-p${part.index}-chapters`, chaptersPayload(chapters));
      }
      parts.push({
        ...part,
        blobUrl,
        bytes: concat.length,
        durationSeconds: Math.max(1, durationSeconds),
        description,
        chaptersUrl,
      });
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
  const shorts = messages.filter((message) => emailScriptLength(message) <= MAX_TTS_CHARS);
  const longs = messages.filter((message) => emailScriptLength(message) > MAX_TTS_CHARS);
  const jobs: PendingJob[] = [];

  if (shorts.length) {
    const latest = shorts.reduce((acc, item) =>
      item.receivedDateTime > acc.receivedDateTime ? item : acc,
    );
    const day = saoPauloDay(latest.receivedDateTime);
    const label = saoPauloLabel(latest.receivedDateTime);
    jobs.push(
      makeJobFromSegments({
        id: `digest-${day}-${shorts[0].id.replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "batch"}`,
        kind: "digest",
        title: label,
        pubDate: latest.receivedDateTime,
        messageIds: shorts.map((message) => message.id),
        receivedDates: shorts.map((message) => message.receivedDateTime),
        segments: digestSegments(shorts, label),
      }),
    );
  }

  for (const message of longs) {
    jobs.push(
      makeJobFromSegments({
        id: `mail-${message.id.replace(/[^a-zA-Z0-9]+/g, "").slice(-24) || "msg"}`,
        kind: "series",
        title: saoPauloLabel(message.receivedDateTime),
        pubDate: message.receivedDateTime,
        messageIds: [message.id],
        receivedDates: [message.receivedDateTime],
        segments: seriesSegments(message),
      }),
    );
  }
  return jobs;
}

export async function ensureDemo(deadline: number | null = Date.now() + 50_000): Promise<boolean> {
  if (!redisConfigured() || !blobConfigured()) return false;
  const existing = await getEpisodes();
  if (existing.length) return false;
  const now = new Date().toISOString();
  const label = saoPauloLabel(now);
  const filled = await fillParts(
    makeJobFromSegments({
      id: "demo",
      kind: "digest",
      title: label,
      pubDate: now,
      messageIds: ["demo"],
      receivedDates: [now],
      segments: [
        {
          text: `Feed de ${label}.\n\nAssunto: Episódio de exemplo.\n\n${DEMO_TEXT}`,
          subject: "Episódio de exemplo",
          cues: [],
        },
      ],
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
  deadline: number | null,
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
  const deadline = cronDeadlineMs();
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
      cues: message.cues,
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
