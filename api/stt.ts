import { handleSttPost } from "../lib/handle-stt.js";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleSttPost(request);
}
