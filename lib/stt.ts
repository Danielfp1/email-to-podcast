const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class SttError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SttError";
    this.status = status;
  }
}

function geminiMime(mediaType: string): string {
  if (mediaType === "audio/mpeg") return "audio/mp3";
  return mediaType;
}

function extractText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (typeof parsed.error?.message === "string") return parsed.error.message;
  } catch {
    // corpo não é JSON
  }
  return body;
}

export async function transcribeAudio(audio: Uint8Array, mediaType: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new SttError(500, "Servidor sem GEMINI_API_KEY");
  }

  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: "Transcreva este áudio em português do Brasil. Responda somente com a transcrição, sem aspas nem comentários.",
            },
            {
              inline_data: {
                mime_type: geminiMime(mediaType),
                data: Buffer.from(audio).toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    const detail = errorMessage(raw);
    console.error(`Gemini STT ${response.status}: ${detail.slice(0, 300)}`);
    if (response.status === 400 && /API_KEY|api key|API key/i.test(detail)) {
      throw new SttError(502, "Chave Gemini inválida");
    }
    if (response.status === 401 || response.status === 403) {
      throw new SttError(502, "Chave Gemini inválida");
    }
    if (response.status === 429) {
      throw new SttError(503, "Limite gratuito do Gemini esgotou. Tente de novo daqui a pouco.");
    }
    throw new SttError(502, "Falha ao transcrever áudio");
  }

  const payload = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = extractText(payload);
  if (!text) {
    throw new SttError(502, "Transcrição vazia");
  }
  return text;
}
