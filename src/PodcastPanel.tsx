import { useId, useState } from "react";

type RunFeedResult = {
  demo: boolean;
  processed: number;
  published: number;
  pendingJobs: number;
};

type PodcastPanelProps = {
  secret: string;
};

export function PodcastPanel({ secret }: PodcastPanelProps) {
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunFeedResult | null>(null);

  async function onGenerate() {
    if (!secret) {
      setError("Informe a senha.");
      setResult(null);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/run-feed", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as
        | (Partial<RunFeedResult> & { error?: string })
        | null;
      if (!response.ok) {
        setResult(null);
        setError(payload?.error ?? `Erro ${response.status}`);
        return;
      }
      setResult({
        demo: payload?.demo === true,
        processed: payload?.processed ?? 0,
        published: payload?.published ?? 0,
        pendingJobs: payload?.pendingJobs ?? 0,
      });
    } catch {
      setResult(null);
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Podcast</h2>
      <p className="hint">Lê a pasta Feed do Outlook e publica no RSS.</p>

      {error ? (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <p className="hint" role="status">
          processed: {result.processed} · published: {result.published} · pendingJobs:{" "}
          {result.pendingJobs} · demo: {result.demo ? "true" : "false"}
        </p>
      ) : null}

      {result && result.pendingJobs > 0 ? (
        <p className="hint" role="status">
          Ainda há itens na fila. Clique de novo para continuar.
        </p>
      ) : null}

      {result?.demo ? (
        <p className="hint" role="status">
          Não há login do Outlook.
        </p>
      ) : null}

      <div className="actions">
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          aria-describedby={error ? errorId : undefined}
        >
          {busy ? "Gerando…" : "Gerar podcast"}
        </button>
      </div>
    </section>
  );
}
