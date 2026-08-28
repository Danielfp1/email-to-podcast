import { handleAuthLogin } from "../../lib/handle-auth.js";

export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  return handleAuthLogin(request);
}
