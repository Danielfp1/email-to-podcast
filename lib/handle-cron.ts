import { isCronAuthorized } from "./auth.js";
import { runFeed } from "./run-feed.js";

function withElapsed<T extends Record<string, unknown>>(started: number, extra: T): T & {
  elapsedMs: number;
  elapsedSec: number;
} {
  const elapsedMs = Date.now() - started;
  return { ...extra, elapsedMs, elapsedSec: Math.round(elapsedMs / 1000) };
}

export async function handleCron(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "Servidor sem CRON_SECRET" }, { status: 500 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const result = await runFeed();
    return Response.json(withElapsed(started, result));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Falha no cron";
    return Response.json(withElapsed(started, { error: message }), { status: 502 });
  }
}
