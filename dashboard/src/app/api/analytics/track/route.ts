import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  ANALYTICS_FORWARD_URL,
} from "@/lib/analytics-store";
import type { AnalyticsEvent } from "@/lib/analytics-store";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
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
    try {
      await fetch(ANALYTICS_FORWARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch {
      // Forwarding is best-effort.
    }
  }

  appendEvent(event);

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
