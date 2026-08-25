import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  ANALYTICS_FORWARD_URL,
  ANALYTICS_ALLOWED_ORIGINS,
  isTokenValid,
} from "@/lib/analytics-store";
import type { AnalyticsEvent } from "@/lib/analytics-store";

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const origin = request.headers.get("origin");
  if (ANALYTICS_ALLOWED_ORIGINS) {
    if (origin && ANALYTICS_ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    } else if (ANALYTICS_ALLOWED_ORIGINS.includes("*")) {
      headers["Access-Control-Allow-Origin"] = "*";
    }
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1].trim() : null;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  if (!isTokenValid(getBearerToken(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  let body: Partial<AnalyticsEvent> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
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

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
