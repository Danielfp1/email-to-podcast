import { isRssToken } from "./auth.js";
import { blobConfigured } from "./blob.js";
import {
  getEpisodes,
  getRefreshToken,
  redisConfigured,
} from "./redis.js";
import { renderRss } from "./rss.js";
import { ensureDemo } from "./run-feed.js";

export async function handleFeedGet(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }
  if (!process.env.RSS_TOKEN) {
    return Response.json({ error: "Servidor sem RSS_TOKEN" }, { status: 500 });
  }
  const token = new URL(request.url).searchParams.get("token");
  if (!isRssToken(token)) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    let items = redisConfigured() ? await getEpisodes() : [];
    if (
      redisConfigured() &&
      blobConfigured() &&
      items.length === 0 &&
      !(await getRefreshToken())
    ) {
      await ensureDemo();
      items = await getEpisodes();
    }

    const xml = renderRss(items, request.url);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Falha no feed" }, { status: 502 });
  }
}
