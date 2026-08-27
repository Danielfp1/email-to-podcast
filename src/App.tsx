import { useId, useState } from "react";
import { SECRET_STORAGE_KEY } from "../shared/limits";
import { SttPanel } from "./SttPanel";
import { TtsPanel } from "./TtsPanel";

function readStoredSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistSecret(value: string) {
  try {
    sessionStorage.setItem(SECRET_STORAGE_KEY, value);
  } catch {
    // sessionStorage pode estar bloqueado.
  }
}

export function App() {
  const secretId = useId();
  const [secret, setSecret] = useState(readStoredSecret);

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">email-to-podcast</p>
        <h1>Texto e áudio</h1>
        <p className="lede">
          Cole um texto para ouvir, ou envie um recado curto para transcrever.
        </p>
      </header>

      <div className="panel secret-panel">
        <label htmlFor={secretId}>Senha</label>
        <input
          id={secretId}
          name="secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(event) => {
            const next = event.target.value;
            setSecret(next);
            persistSecret(next);
          }}
        />
      </div>

      <TtsPanel secret={secret} />
      <SttPanel secret={secret} />
    </div>
  );
}
