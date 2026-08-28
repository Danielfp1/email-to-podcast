import { DEFAULT_OUTLOOK_FOLDER } from "../shared/limits.js";
import { getFolderId, setFolderId } from "./redis.js";
import { htmlToScript } from "./email-text.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type GraphMessage = {
  id: string;
  subject: string;
  receivedDateTime: string;
  text: string;
};

type FolderRow = { id?: string; displayName?: string };
type MessageRow = {
  id?: string;
  subject?: string;
  receivedDateTime?: string;
  body?: { content?: string; contentType?: string };
};

function tenant(): string {
  return process.env.AZURE_TENANT?.trim() || "consumers";
}

export function azureConfigured(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_REDIRECT_URI,
  );
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: process.env.AZURE_REDIRECT_URI ?? "",
    response_mode: "query",
    scope: "openid offline_access Mail.Read",
    state,
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`;
}

async function tokenRequest(body: URLSearchParams): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "Falha no token Microsoft");
  }
  return { access_token: payload.access_token, refresh_token: payload.refresh_token };
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID ?? "",
      client_secret: process.env.AZURE_CLIENT_SECRET ?? "",
      code,
      redirect_uri: process.env.AZURE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }),
  );
  if (!tokens.refresh_token) {
    throw new Error("A Microsoft não devolveu refresh token (falta offline_access)");
  }
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID ?? "",
      client_secret: process.env.AZURE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid offline_access Mail.Read",
    }),
  );
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
  };
}

type ODataPage<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
};

async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.body-content-type="text"',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph ${response.status}: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

async function collectFolders(accessToken: string): Promise<FolderRow[]> {
  const rows: FolderRow[] = [];
  let next: string | null = `${GRAPH}/me/mailFolders?$top=100`;
  while (next) {
    const page: ODataPage<FolderRow> = await graphGet(accessToken, next);
    rows.push(...(page.value ?? []));
    next = page["@odata.nextLink"] ?? null;
  }
  return rows;
}

export async function resolveFolderId(accessToken: string): Promise<string> {
  const cached = await getFolderId();
  if (cached) return cached;
  const name = process.env.OUTLOOK_FOLDER?.trim() || DEFAULT_OUTLOOK_FOLDER;
  const folders = await collectFolders(accessToken);
  const found = folders.find((folder) => folder.displayName === name && folder.id);
  if (!found?.id) {
    throw new Error(`Pasta Outlook "${name}" não encontrada`);
  }
  await setFolderId(found.id);
  return found.id;
}

export async function listNewMessages(
  accessToken: string,
  folderId: string,
  sinceIso: string | null,
): Promise<GraphMessage[]> {
  const since =
    sinceIso ?? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const filter = `receivedDateTime ge ${since}`;
  const select = "id,subject,receivedDateTime,body";
  let next: string | null =
    `${GRAPH}/me/mailFolders/${encodeURIComponent(folderId)}/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(select)}` +
    `&$orderby=${encodeURIComponent("receivedDateTime asc")}` +
    `&$top=25`;

  try {
    return await collectMessages(accessToken, next);
  } catch (err) {
    console.error(err);
    next =
      `${GRAPH}/me/mailFolders/${encodeURIComponent(folderId)}/messages` +
      `?$select=${encodeURIComponent(select)}` +
      `&$orderby=${encodeURIComponent("receivedDateTime desc")}` +
      `&$top=25`;
    const recent = await collectMessages(accessToken, next);
    return recent.filter((message) => message.receivedDateTime >= since);
  }
}

async function collectMessages(accessToken: string, startUrl: string): Promise<GraphMessage[]> {
  const messages: GraphMessage[] = [];
  let next: string | null = startUrl;
  while (next && messages.length < 50) {
    const page: ODataPage<MessageRow> = await graphGet(accessToken, next);
    for (const row of page.value ?? []) {
      if (!row.id || !row.receivedDateTime) continue;
      const text = htmlToScript(row.body?.content ?? "");
      if (!text) continue;
      messages.push({
        id: row.id,
        subject: (row.subject ?? "").trim() || "Sem assunto",
        receivedDateTime: row.receivedDateTime,
        text,
      });
    }
    next = page["@odata.nextLink"] ?? null;
  }
  messages.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
  return messages;
}
