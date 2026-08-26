import { handleTtsPost } from "../lib/handle-tts.js";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleTtsPost(request);
}
