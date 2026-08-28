import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAppSecretValue } from "./auth.js";
import { azureConfigured, authorizeUrl, exchangeCode } from "./graph.js";
import { redisConfigured, setRefreshToken } from "./redis.js";

function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("Servidor sem APP_SECRET");
  return secret;
}

function signState(): string {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", appSecret()).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

function verifyState(state: string): boolean {
  const [nonce, sig] = state.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", appSecret()).update(nonce).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body><p>${escapeHtml(body)}</p></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export async function handleAuthLogin(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!isAppSecretValue(fromHeader) && !isAppSecretValue(url.searchParams.get("secret"))) {
    return htmlPage("Não autorizado", "Informe o APP_SECRET na query (?secret=) ou no Bearer.", 401);
  }
  if (!azureConfigured()) {
    return htmlPage("Azure", "Faltam AZURE_CLIENT_ID, AZURE_CLIENT_SECRET ou AZURE_REDIRECT_URI.", 500);
  }
  if (!redisConfigured()) {
    return htmlPage("Redis", "Faltam UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.", 500);
  }
  return Response.redirect(authorizeUrl(signState()), 302);
}

export async function handleAuthCallback(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }
  const url = new URL(request.url);
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) {
    return htmlPage("OAuth", error, 400);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyState(state)) {
    return htmlPage("OAuth", "Código ou state inválido.", 400);
  }
  try {
    const tokens = await exchangeCode(code);
    await setRefreshToken(tokens.refreshToken);
    return htmlPage("Outlook", "Outlook conectado. Pode fechar esta página.");
  } catch (err) {
    console.error(err);
    return htmlPage("OAuth", err instanceof Error ? err.message : "Falha ao conectar.", 502);
  }
}
