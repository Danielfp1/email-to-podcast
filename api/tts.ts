import { handleTtsPost } from "../lib/handle-tts";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleTtsPost(request);
}
