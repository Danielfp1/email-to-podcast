import { useEffect, useId, useState, type FormEvent } from "react";
import {
  DEFAULT_TTS_VOICE,
  MAX_TTS_CHARS,
  TTS_VOICES,
  VOICE_STORAGE_KEY,
  isTtsVoiceId,
  type TtsVoiceId,
} from "../shared/limits";

const SAMPLE =
  "Bom dia. Este é um texto de exemplo para ouvir em voz alta, testando 1, 2, 3.";

function readStoredVoice(): TtsVoiceId {
  try {
    const stored = sessionStorage.getItem(VOICE_STORAGE_KEY);
    if (stored && isTtsVoiceId(stored)) return stored;
  } catch {
    // sessionStorage pode estar bloqueado.
  }
  return DEFAULT_TTS_VOICE;
}

type TtsPanelProps = {
  secret: string;
};

export function TtsPanel({ secret }: TtsPanelProps) {
  const textId = useId();
  const voiceId = useId();
  const errorId = useId();
  const [text, setText] = useState(SAMPLE);
  const [voice, setVoice] = useState(readStoredVoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Cole um texto para gerar o áudio.");
      return;
    }
    if (trimmed.length > MAX_TTS_CHARS) {
      setError(`O texto pode ter no máximo ${MAX_TTS_CHARS} caracteres.`);
      return;
    }
    if (!secret) {
      setError("Informe a senha.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      sessionStorage.setItem(VOICE_STORAGE_KEY, voice);
    } catch {
      // sessionStorage pode estar bloqueado; a requisição ainda segue.
    }

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ text: trimmed, voice }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Erro ${response.status}`);
        return;
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  const remaining = MAX_TTS_CHARS - text.length;

  return (
    <form className="panel" onSubmit={onSubmit} noValidate>
      <h2>Texto para áudio</h2>
      <label htmlFor={textId}>Texto</label>
      <textarea
        id={textId}
        name="text"
        rows={8}
        value={text}
        maxLength={MAX_TTS_CHARS}
        onChange={(event) => setText(event.target.value)}
        aria-describedby={error ? errorId : undefined}
        disabled={busy}
      />
      <p className="hint">{remaining} caracteres restantes</p>

      <label htmlFor={voiceId}>Voz</label>
      <select
        id={voiceId}
        name="voice"
        value={voice}
        onChange={(event) => {
          const next = event.target.value;
          if (isTtsVoiceId(next)) setVoice(next);
        }}
        disabled={busy}
      >
        {TTS_VOICES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? "Gerando…" : "Gerar MP3"}
        </button>
        {audioUrl ? (
          <a className="download" href={audioUrl} download="audio.mp3">
            Baixar MP3
          </a>
        ) : null}
      </div>

      {audioUrl ? (
        <audio className="player" controls src={audioUrl} />
      ) : null}
    </form>
  );
}
