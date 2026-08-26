import { MAX_TTS_CHARS, resolveTtsVoice } from "../shared/limits";
import { isAuthorized } from "./auth";
import { synthesizeMp3 } from "./tts";

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function handleTtsPost(request: Request): Promise<Response> {
  if (!process.env.APP_SECRET) {
    return jsonError(500, "Servidor sem APP_SECRET");
  }
  if (!isAuthorized(request)) {
    return jsonError(401, "Não autorizado");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "JSON inválido");
  }

  const payload = typeof body === "object" && body !== null ? (body as { text?: unknown; voice?: unknown }) : {};
  const trimmed = payload.text != null ? String(payload.text).trim() : "";
  if (!trimmed) {
    return jsonError(400, "Texto vazio");
  }
  if (trimmed.length > MAX_TTS_CHARS) {
    return jsonError(400, `Texto acima de ${MAX_TTS_CHARS} caracteres`);
  }
  const voice = resolveTtsVoice(payload.voice);
  if (!voice) {
    return jsonError(400, "Voz inválida");
  }

  try {
    const mp3 = await synthesizeMp3(trimmed, voice);
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="audio.mp3"',
      },
    });
  } catch (err) {
    console.error(err);
    return jsonError(502, "Falha ao gerar áudio");
  }
}
