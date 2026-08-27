import { createServer, type IncomingMessage } from "node:http";
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

const server = createServer(async (req, res) => {
  try {
    const path = req.url?.split("?")[0] ?? "";
    const isTts = req.method === "POST" && path === "/api/tts";
    const isStt = req.method === "POST" && path === "/api/stt";
    if (!isTts && !isStt) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Não encontrado" }));
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      const single = headerValue(value);
      if (single) headers.set(key, single);
    }

    const request = new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers,
      body: new Uint8Array(await readBody(req)),
    });
    const response = isStt ? await handleSttPost(request) : await handleTtsPost(request);

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
  console.log(`API em http://127.0.0.1:${PORT}/api/tts e /api/stt`);
});
