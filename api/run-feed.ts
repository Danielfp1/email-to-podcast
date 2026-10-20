import { handleRunFeed } from "../lib/handle-run-feed.js";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  return handleRunFeed(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleRunFeed(request);
}
