import { isAuthorized } from "./auth.js";
import { runFeed } from "./run-feed.js";

function withElapsed<T extends Record<string, unknown>>(started: number, extra: T): T & {
  elapsedMs: number;
  elapsedSec: number;
} {
  const elapsedMs = Date.now() - started;
  return { ...extra, elapsedMs, elapsedSec: Math.round(elapsedMs / 1000) };
}

export async function handleRunFeed(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }
  if (!process.env.APP_SECRET) {
    return Response.json({ error: "Servidor sem APP_SECRET" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const result = await runFeed();
    return Response.json(withElapsed(started, result));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Falha ao gerar o podcast";
    return Response.json(withElapsed(started, { error: message }), { status: 502 });
  }
}
