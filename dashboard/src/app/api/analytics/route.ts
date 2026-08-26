import { NextRequest, NextResponse } from "next/server";
import {
  readEvents,
  aggregateEvents,
  ANALYTICS_ALLOWED_ORIGINS,
  ANALYTICS_API_TOKENS,
} from "@/lib/analytics-store";

function isSameOrigin(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  const host = request.headers.get("host");
  if (!host) return false;

  const allowed = ANALYTICS_ALLOWED_ORIGINS ?? [host];
  return allowed.some((allowedOrigin) => origin === allowedOrigin);
}

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function isAuthorized(request: NextRequest): boolean {
  if (isSameOrigin(request)) return true;
  const token = getBearerToken(request);
  if (!token) return false;
  return ANALYTICS_API_TOKENS.has(token);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = readEvents();
  const stats = aggregateEvents(events);
  return NextResponse.json(stats);
}
