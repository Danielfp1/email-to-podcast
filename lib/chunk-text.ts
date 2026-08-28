import { MAX_TTS_CHARS } from "../shared/limits.js";

function flush(buffer: string, chunks: string[]): void {
  const trimmed = buffer.trim();
  if (trimmed) chunks.push(trimmed);
}

function splitBySize(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.5)) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

function splitSentences(text: string, max: number): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > max) {
      flush(current, chunks);
      current = "";
      for (const piece of splitBySize(sentence, max)) chunks.push(piece);
      continue;
    }
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > max) {
      flush(current, chunks);
      current = sentence;
    } else {
      current = next;
    }
  }
  flush(current, chunks);
  return chunks;
}

export function chunkText(text: string, max = MAX_TTS_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= max) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const raw of paragraphs) {
    const para = raw.trim();
    if (!para) continue;
    if (para.length > max) {
      flush(current, chunks);
      current = "";
      for (const piece of splitSentences(para, max)) chunks.push(piece);
      continue;
    }
    const next = current ? `${current}\n\n${para}` : para;
    if (next.length > max) {
      flush(current, chunks);
      current = para;
    } else {
      current = next;
    }
  }
  flush(current, chunks);
  return chunks;
}
