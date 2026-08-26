import { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_PER_SESSION = 60;
const MAX_PER_IP = 120;

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

function isLimited(key: string, max: number, now: number): boolean {
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function isRateLimited(
  request: NextRequest,
  sessionId?: string
): { limited: boolean; status: number; message: string } {
  const ip = getClientIp(request);
  const now = Date.now();

  if (isLimited(`${ip}:${sessionId ?? "no-session"}`, MAX_PER_SESSION, now)) {
    return {
      limited: true,
      status: 429,
      message: "Rate limit exceeded for this session",
    };
  }

  if (isLimited(ip, MAX_PER_IP, now)) {
    return {
      limited: true,
      status: 429,
      message: "Rate limit exceeded for this IP",
    };
  }

  return { limited: false, status: 200, message: "" };
}
