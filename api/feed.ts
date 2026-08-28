import { handleFeedGet } from "../lib/handle-feed.js";

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return handleFeedGet(request);
}
