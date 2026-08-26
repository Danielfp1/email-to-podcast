export const MAX_TTS_CHARS = 4000;
export const SECRET_STORAGE_KEY = "app-secret";
export const VOICE_STORAGE_KEY = "tts-voice";

export const TTS_VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca" },
  { id: "pt-BR-AntonioNeural", label: "Antonio" },
  { id: "pt-BR-ThalitaNeural", label: "Thalita" },
  { id: "pt-BR-BrendaNeural", label: "Brenda" },
  { id: "pt-BR-DonatoNeural", label: "Donato" },
  { id: "pt-BR-YaraNeural", label: "Yara" },
] as const;

export type TtsVoiceId = (typeof TTS_VOICES)[number]["id"];
export const DEFAULT_TTS_VOICE: TtsVoiceId = "pt-BR-FranciscaNeural";

export function isTtsVoiceId(value: string): value is TtsVoiceId {
  return TTS_VOICES.some((voice) => voice.id === value);
}

export function resolveTtsVoice(value: unknown): TtsVoiceId | null {
  if (value == null || value === "") return DEFAULT_TTS_VOICE;
  if (typeof value !== "string") return null;
  return isTtsVoiceId(value) ? value : null;
}
