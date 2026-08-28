import { isCronAuthorized } from "./auth.js";
import { runFeed } from "./run-feed.js";

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
  try {
    const result = await runFeed();
    return Response.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Falha no cron";
    return Response.json({ error: message }, { status: 502 });
  }
}
