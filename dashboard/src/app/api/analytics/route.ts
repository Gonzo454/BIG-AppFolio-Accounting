import { NextRequest, NextResponse } from "next/server";
import {
  readEvents,
  aggregateEvents,
  ANALYTICS_API_TOKEN,
} from "@/lib/analytics-store";

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function isAuthorized(request: NextRequest): boolean {
  if (!ANALYTICS_API_TOKEN) return true;
  return getBearerToken(request) === ANALYTICS_API_TOKEN;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = readEvents();
  const stats = aggregateEvents(events);
  return NextResponse.json(stats);
}
