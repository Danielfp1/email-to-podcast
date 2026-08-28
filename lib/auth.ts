import { timingSafeEqual } from "node:crypto";

function secretsEqual(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isAuthorized(request: Request): boolean {
  const secret = process.env.APP_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return secretsEqual(header, `Bearer ${secret}`);
}

export function isAppSecretValue(value: string | null): boolean {
  const secret = process.env.APP_SECRET;
  if (!secret || value == null) return false;
  return secretsEqual(value, secret);
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return secretsEqual(header, `Bearer ${secret}`);
}

export function isRssToken(value: string | null): boolean {
  const secret = process.env.RSS_TOKEN;
  if (!secret || value == null) return false;
  return secretsEqual(value, secret);
}
