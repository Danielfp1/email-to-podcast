import { Readable } from "node:stream";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { TtsVoiceId } from "../shared/limits.js";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function collectStream(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function synthesizeMp3(
  text: string,
  voice: TtsVoiceId,
  timeoutMs?: number,
): Promise<Buffer> {
  const run = async (): Promise<Buffer> => {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text));
    const mp3 = await collectStream(audioStream);
    if (mp3.length === 0) {
      throw new Error("Áudio vazio");
    }
    return mp3;
  };
  return timeoutMs != null ? withTimeout(run(), timeoutMs, "TTS estourou o tempo do cron") : run();
}
