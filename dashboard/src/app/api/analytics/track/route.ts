import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  ANALYTICS_FORWARD_URL,
  ANALYTICS_API_TOKEN,
} from "@/lib/analytics-store";
import type { AnalyticsEvent } from "@/lib/analytics-store";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function isAuthorized(request: NextRequest): boolean {
  if (!ANALYTICS_API_TOKEN) return true;
  return getBearerToken(request) === ANALYTICS_API_TOKEN;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  let body: Partial<AnalyticsEvent> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const event: AnalyticsEvent = {
    ...body,
    event: body.event || "unknown",
    receivedAt: new Date().toISOString(),
  };

  if (ANALYTICS_FORWARD_URL) {
    // Fire-and-forget with a 3-second timeout so a slow upstream cannot stall
    // the analytics response or the local append.
    fetch(ANALYTICS_FORWARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Forwarding is best-effort.
    });
  }

  appendEvent(event);

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
