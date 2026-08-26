import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  ANALYTICS_FORWARD_URL,
  ANALYTICS_API_TOKEN,
  ANALYTICS_ALLOWED_ORIGINS,
  ANALYTICS_API_TOKENS,
  sanitizeEvent,
  validateBodySize,
} from "@/lib/analytics-store";
import type { AnalyticsEvent } from "@/lib/analytics-store";

function getOrigin(request: NextRequest): string | null {
  return request.headers.get("origin");
}

function isSameOrigin(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return true;

  const origin = getOrigin(request);
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

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const origin = getOrigin(request);
  if (ANALYTICS_ALLOWED_ORIGINS && origin) {
    if (ANALYTICS_ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
  }

  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const bodyBuffer = await request.arrayBuffer();
  if (!validateBodySize(bodyBuffer.byteLength)) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: corsHeaders }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bodyBuffer));
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  const event = sanitizeEvent(parsed);
  if (!event) {
    return NextResponse.json(
      { error: "Invalid event payload" },
      { status: 400, headers: corsHeaders }
    );
  }

  const enriched: AnalyticsEvent = {
    ...event,
    receivedAt: new Date().toISOString(),
  };

  if (ANALYTICS_FORWARD_URL) {
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ANALYTICS_API_TOKEN) {
      forwardHeaders["Authorization"] = `Bearer ${ANALYTICS_API_TOKEN}`;
    }

    // Fire-and-forget with a 3-second timeout so a slow upstream cannot stall
    // the analytics response or the local append.
    fetch(ANALYTICS_FORWARD_URL, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(enriched),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Forwarding is best-effort.
    });
  }

  appendEvent(enriched);

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
