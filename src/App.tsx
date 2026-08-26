import { TtsPanel } from "./TtsPanel";

export function App() {
  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">email-to-podcast</p>
        <h1>Texto para áudio</h1>
        <p className="lede">
          Cole um texto, gere o MP3 com voz em português.
        </p>
      </header>
      <TtsPanel />
    </div>
  );
}
