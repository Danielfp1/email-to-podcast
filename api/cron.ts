import { handleCron } from "../lib/handle-cron.js";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  return handleCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCron(request);
}
