const KEYS = {
  refresh: "e2p:graph:refresh",
  folder: "e2p:graph:folder",
  cursor: "e2p:mail:cursor",
  pending: "e2p:mail:pending",
  items: "e2p:feed:items",
} as const;

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCommand(command: unknown[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis não configurado");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Redis HTTP ${response.status}`);
  }
  return payload.result ?? null;
}

export async function redisGet(key: string): Promise<string | null> {
  const result = await redisCommand(["GET", key]);
  return typeof result === "string" ? result : null;
}

export async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  if (exSeconds != null) {
    await redisCommand(["SET", key, value, "EX", String(exSeconds)]);
    return;
  }
  await redisCommand(["SET", key, value]);
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await redisGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown, exSeconds?: number): Promise<void> {
  await redisSet(key, JSON.stringify(value), exSeconds);
}

export async function getRefreshToken(): Promise<string | null> {
  return redisGet(KEYS.refresh);
}

export async function setRefreshToken(token: string): Promise<void> {
  await redisSet(KEYS.refresh, token);
}

export async function getFolderId(): Promise<string | null> {
  return redisGet(KEYS.folder);
}

export async function setFolderId(id: string): Promise<void> {
  await redisSet(KEYS.folder, id, 86_400);
}

export type MailCursor = {
  lastReceived: string;
  processedIds: string[];
};

export type PendingPart = {
  index: number;
  total: number;
  text: string;
  blobUrl?: string;
  bytes?: number;
  durationSeconds?: number;
};

export type WaitingMessage = {
  id: string;
  subject: string;
  receivedDateTime: string;
  text: string;
};

export type PendingJob = {
  id: string;
  kind: "digest" | "series";
  title: string;
  pubDate: string;
  messageIds: string[];
  receivedDates: string[];
  parts: PendingPart[];
};

export type PendingState = {
  jobs: PendingJob[];
  messages: WaitingMessage[];
};

export type RssEpisode = {
  guid: string;
  title: string;
  pubDate: string;
  url: string;
  length: number;
  durationSeconds: number;
};

export async function getCursor(): Promise<MailCursor | null> {
  return getJson<MailCursor>(KEYS.cursor);
}

export async function setCursor(cursor: MailCursor): Promise<void> {
  await setJson(KEYS.cursor, cursor);
}

export async function getPending(): Promise<PendingState> {
  return (await getJson<PendingState>(KEYS.pending)) ?? { jobs: [], messages: [] };
}

export async function setPending(state: PendingState): Promise<void> {
  await setJson(KEYS.pending, state);
}

export async function getEpisodes(): Promise<RssEpisode[]> {
  return (await getJson<RssEpisode[]>(KEYS.items)) ?? [];
}

export async function setEpisodes(items: RssEpisode[]): Promise<void> {
  await setJson(KEYS.items, items.slice(-90));
}
