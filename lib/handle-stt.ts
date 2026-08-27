import { parseBuffer } from "music-metadata";
import { MAX_STT_BYTES, MAX_STT_SECONDS, resolveSttMediaType } from "../shared/limits.js";
import { isAuthorized } from "./auth.js";
import { SttError, transcribeAudio } from "./stt.js";

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function handleSttPost(request: Request): Promise<Response> {
  if (!process.env.APP_SECRET) {
    return jsonError(500, "Servidor sem APP_SECRET");
  }
  if (!process.env.GEMINI_API_KEY) {
    return jsonError(500, "Servidor sem GEMINI_API_KEY");
  }
  if (!isAuthorized(request)) {
    return jsonError(401, "Não autorizado");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Formulário inválido");
  }

  const uploaded = form.get("audio");
  if (!(uploaded instanceof Blob) || uploaded.size === 0) {
    return jsonError(400, "Arquivo de áudio ausente");
  }
  if (uploaded.size > MAX_STT_BYTES) {
    return jsonError(400, `Áudio acima de ${MAX_STT_BYTES} bytes`);
  }

  const filename = uploaded instanceof File ? uploaded.name : "audio";
  const mediaType = resolveSttMediaType(uploaded.type, filename);
  if (!mediaType) {
    return jsonError(400, "Tipo de áudio inválido");
  }

  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  if (bytes.byteLength === 0) {
    return jsonError(400, "Arquivo de áudio ausente");
  }

  try {
    const meta = await parseBuffer(bytes, mediaType);
    const duration = meta.format.duration;
    if (typeof duration === "number" && duration > MAX_STT_SECONDS) {
      return jsonError(400, `Áudio acima de ${MAX_STT_SECONDS} segundos`);
    }
  } catch {
    return jsonError(400, "Áudio inválido");
  }

  try {
    const text = await transcribeAudio(bytes, mediaType);
    return Response.json({ text });
  } catch (err) {
    if (err instanceof SttError) {
      return jsonError(err.status, err.message);
    }
    console.error(err instanceof Error ? err.message : err);
    return jsonError(502, "Falha ao transcrever áudio");
  }
}
