import { put } from "@vercel/blob";

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "audio";
}

export async function uploadMp3(pathname: string, bytes: Buffer): Promise<string> {
  const blob = await put(`episodes/${safeName(pathname)}.mp3`, bytes, {
    access: "public",
    contentType: "audio/mpeg",
  });
  return blob.url;
}

export async function uploadJson(pathname: string, data: unknown): Promise<string> {
  const blob = await put(`episodes/${safeName(pathname)}.json`, JSON.stringify(data), {
    access: "public",
    contentType: "application/json+chapters",
  });
  return blob.url;
}
