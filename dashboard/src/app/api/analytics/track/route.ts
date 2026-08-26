export const runtime = "nodejs";

import { NextRequest, NextResponse, after } from "next/server";
import {
  appendEvent,
  ANALYTICS_FORWARD_URL,
  ANALYTICS_API_TOKEN,
  ANALYTICS_ALLOWED_ORIGINS,
  sanitizeEvent,
  validateBodySize,
  parseBearerToken,
  isIngestTokenValid,
  storeAvailable,
} from "@/lib/analytics-store";
import { isRateLimited } from "@/lib/analytics-rate-limit";

/**
 * Same-origin hint. This is caller-controlled (a non-browser can set the Origin
 * or Sec-Fetch-Site header) and is therefore NOT an authentication gate. It is
 * only a convenience for the dashboard's same-origin fetch. Cross-origin
 * requests must present a valid ingest token.
 */
function isLikelySameOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) return false;

  for (const header of ["origin", "referer"]) {
    const value = request.headers.get(header);
    if (value) {
      try {
        if (new URL(value).host === host) return true;
      } catch {
        // ignore malformed URL
      }
    }
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  return secFetchSite === "same-origin";
}

function isAuthorized(request: NextRequest): boolean {
  if (isLikelySameOrigin(request)) return true;
  return isIngestTokenValid(parseBearerToken(request));
}

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const origin = request.headers.get("origin");
  if (origin && ANALYTICS_ALLOWED_ORIGINS?.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
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

  const available = storeAvailable();
  if (!available.ok) {
    return NextResponse.json(
      { error: available.reason },
      { status: 503, headers: corsHeaders }
    );
  }

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

  const rateLimit = isRateLimited(request, event.sessionId);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: corsHeaders }
    );
  }

  await appendEvent(event);

  const forwardUrl = ANALYTICS_FORWARD_URL;
  const forwardToken = ANALYTICS_API_TOKEN;
  if (forwardUrl && forwardToken) {
    // Schedule forwarding after the response so a slow upstream cannot stall
    // the analytics ping. next/server after() keeps the instance alive until
    // the scheduled work completes.
    after(() => {
      fetch(forwardUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${forwardToken}`,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {
        // Forwarding is best-effort.
      });
    });
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
