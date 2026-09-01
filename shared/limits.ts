export const MAX_TTS_CHARS = 7500;
/** Pare o TTS ~70 s antes do teto Hobby (300 s) para ainda gravar Redis e responder JSON. */
export const CRON_BUDGET_MS = 230_000;
/** Não começa outra fatia se faltar menos que isso até o budget. */
export const TTS_START_GUARD_MS = 45_000;
export const GRAPH_FETCH_TIMEOUT_MS = 20_000;

/** `scripts/dev-api.ts` liga isto. Na Vercel o budget de 230 s continua. */
export function isLocalDevApi(): boolean {
  return process.env.E2P_DEV_SERVER === "1";
}

export function cronDeadlineMs(): number | null {
  if (isLocalDevApi()) return null;
  return Date.now() + CRON_BUDGET_MS;
}
export const DEFAULT_OUTLOOK_FOLDER = "Feed";
export const MAX_STT_SECONDS = 180;
export const MAX_STT_BYTES = 8 * 1024 * 1024;
export const SECRET_STORAGE_KEY = "app-secret";
export const VOICE_STORAGE_KEY = "tts-voice";

export const STT_ACCEPT =
  ".mp3,.ogg,.wav,.webm,.m4a,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/mp4";

const STT_MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
};

const STT_MIME_ALIASES: Record<string, string> = {
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
  "audio/webm": "audio/webm",
  "video/webm": "audio/webm",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
};

export function resolveSttMediaType(mime: string, filename: string): string | null {
  const baseMime = mime.split(";")[0].trim().toLowerCase();
  if (baseMime && STT_MIME_ALIASES[baseMime]) return STT_MIME_ALIASES[baseMime];
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return STT_MIME_BY_EXT[ext] ?? null;
}

export const TTS_VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca" },
  { id: "pt-BR-AntonioNeural", label: "Antonio" },
  { id: "pt-BR-ThalitaNeural", label: "Thalita" },
  { id: "pt-BR-BrendaNeural", label: "Brenda" },
  { id: "pt-BR-DonatoNeural", label: "Donato" },
  { id: "pt-BR-YaraNeural", label: "Yara" },
] as const;

export type TtsVoiceId = (typeof TTS_VOICES)[number]["id"];
export const DEFAULT_TTS_VOICE: TtsVoiceId = "pt-BR-ThalitaNeural";

export function isTtsVoiceId(value: string): value is TtsVoiceId {
  return TTS_VOICES.some((voice) => voice.id === value);
}

export function resolveTtsVoice(value: unknown): TtsVoiceId | null {
  if (value == null || value === "") return DEFAULT_TTS_VOICE;
  if (typeof value !== "string") return null;
  return isTtsVoiceId(value) ? value : null;
}
