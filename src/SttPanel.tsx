import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  MAX_STT_BYTES,
  MAX_STT_SECONDS,
  STT_ACCEPT,
  resolveSttMediaType,
} from "../shared/limits";

function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

type SttPanelProps = {
  secret: string;
};

export function SttPanel({ secret }: SttPanelProps) {
  const fileId = useId();
  const transcriptId = useId();
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [copied, setCopied] = useState(false);
  const recordAvailable = canRecord();

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      stopTracks();
      if (maxTimerRef.current != null) window.clearTimeout(maxTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setAudioFile(next: File | null) {
    setFile(next);
    setCopied(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.currentTarget.files?.[0] ?? null;
    if (!next) {
      setAudioFile(null);
      return;
    }
    if (next.size > MAX_STT_BYTES) {
      setError(`O áudio pode ter no máximo ${MAX_STT_BYTES} bytes.`);
      event.currentTarget.value = "";
      return;
    }
    if (!resolveSttMediaType(next.type, next.name)) {
      setError("Envie um arquivo mp3, ogg, wav, webm ou m4a.");
      event.currentTarget.value = "";
      return;
    }
    setError(null);
    setAudioFile(next);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        if (maxTimerRef.current != null) {
          window.clearTimeout(maxTimerRef.current);
          maxTimerRef.current = null;
        }
        const blobType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType.split(";")[0] });
        const recorded = new File([blob], `recado.${extensionForMime(blobType)}`, {
          type: blob.type,
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setAudioFile(recorded);
        setRecording(false);
        recorderRef.current = null;
      };
      recorder.start();
      setRecording(true);
      maxTimerRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_STT_SECONDS * 1000);
    } catch {
      stopTracks();
      setError("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recording) {
      setError("Pare a gravação antes de transcrever.");
      return;
    }
    if (!file) {
      setError("Envie ou grave um áudio curto.");
      return;
    }
    if (!secret) {
      setError("Informe a senha.");
      return;
    }
    if (file.size > MAX_STT_BYTES) {
      setError(`O áudio pode ter no máximo ${MAX_STT_BYTES} bytes.`);
      return;
    }
    if (!resolveSttMediaType(file.type, file.name)) {
      setError("Envie um arquivo mp3, ogg, wav, webm ou m4a.");
      return;
    }

    setBusy(true);
    setError(null);
    setCopied(false);

    const body = new FormData();
    body.set("audio", file);

    try {
      const response = await fetch("/api/stt", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
        body,
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; text?: string }
        | null;
      if (!response.ok) {
        setError(payload?.error ?? `Erro ${response.status}`);
        return;
      }
      setTranscript(payload?.text ?? "");
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  async function copyTranscript() {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar o texto.");
    }
  }

  const maxMinutes = MAX_STT_SECONDS / 60;

  return (
    <form className="panel" onSubmit={onSubmit} noValidate>
      <h2>Áudio para texto</h2>
      <label htmlFor={fileId}>Arquivo de áudio</label>
      <input
        ref={fileInputRef}
        id={fileId}
        name="audio"
        type="file"
        accept={STT_ACCEPT}
        onChange={onFileChange}
        disabled={busy || recording}
        aria-describedby={error ? errorId : undefined}
      />
      <p className="hint">
        mp3, ogg, wav, webm ou m4a — até {maxMinutes} minutos e {MAX_STT_BYTES / (1024 * 1024)}{" "}
        MB.
      </p>

      {recordAvailable ? (
        <div className="actions">
          {recording ? (
            <button type="button" className="secondary" onClick={stopRecording}>
              Parar gravação
            </button>
          ) : (
            <button type="button" className="secondary" onClick={startRecording} disabled={busy}>
              Gravar recado
            </button>
          )}
          {recording ? (
            <p className="recording" role="status">
              Gravando…
            </p>
          ) : null}
        </div>
      ) : null}

      {previewUrl ? <audio className="player" controls src={previewUrl} /> : null}

      <label htmlFor={transcriptId}>Transcrição</label>
      <textarea
        id={transcriptId}
        className="transcript"
        rows={5}
        value={transcript}
        readOnly
        disabled={busy}
      />

      {error ? (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" disabled={busy || recording}>
          {busy ? "Transcrevendo…" : "Transcrever"}
        </button>
        {transcript ? (
          <button type="button" className="secondary" onClick={copyTranscript} disabled={busy}>
            {copied ? "Copiado" : "Copiar texto"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
