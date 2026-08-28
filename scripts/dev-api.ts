import { createServer, type IncomingMessage } from "node:http";
import { handleAuthCallback, handleAuthLogin } from "../lib/handle-auth.js";
import { handleCron } from "../lib/handle-cron.js";
import { handleFeedGet } from "../lib/handle-feed.js";
import { handleSttPost } from "../lib/handle-stt.js";
import { handleTtsPost } from "../lib/handle-tts.js";

const PORT = 3001;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const single = headerValue(value);
    if (single) headers.set(key, single);
  }
  return headers;
}

function requestUrl(req: IncomingMessage): URL {
  const raw = req.url ?? "/";
  const incoming = new URL(raw, "http://127.0.0.1");
  const feed = incoming.pathname.match(/^\/feed\/([^/]+)\.xml$/);
  if (feed) {
    return new URL(`http://127.0.0.1/api/feed?token=${encodeURIComponent(feed[1])}`);
  }
  return incoming;
}

const server = createServer(async (req, res) => {
  try {
    const url = requestUrl(req);
    const path = url.pathname;
    const method = req.method ?? "GET";
    const headers = toHeaders(req);

    let response: Response | null = null;
    if (method === "POST" && path === "/api/tts") {
      const request = new Request(url, { method, headers, body: new Uint8Array(await readBody(req)) });
      response = await handleTtsPost(request);
    } else if (method === "POST" && path === "/api/stt") {
      const request = new Request(url, { method, headers, body: new Uint8Array(await readBody(req)) });
      response = await handleSttPost(request);
    } else if ((method === "GET" || method === "POST") && path === "/api/cron") {
      const init: RequestInit = { method, headers };
      if (method === "POST") init.body = new Uint8Array(await readBody(req));
      response = await handleCron(new Request(url, init));
    } else if (method === "GET" && path === "/api/feed") {
      response = await handleFeedGet(new Request(url, { method, headers }));
    } else if (method === "GET" && path === "/api/auth/login") {
      response = await handleAuthLogin(new Request(url, { method, headers }));
    } else if (method === "GET" && path === "/api/auth/callback") {
      response = await handleAuthCallback(new Request(url, { method, headers }));
    }

    if (!response) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Não encontrado" }));
      return;
    }

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Erro interno" }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`API em http://127.0.0.1:${PORT}/api/tts, /api/stt, /api/cron, /api/feed e /feed/<token>.xml`);
});
