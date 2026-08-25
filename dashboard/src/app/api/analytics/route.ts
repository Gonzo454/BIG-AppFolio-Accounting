import { NextRequest, NextResponse } from "next/server";
import {
  readEvents,
  aggregateEvents,
  isTokenValid,
} from "@/lib/analytics-store";

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1].trim() : null;
}

export async function GET(request: NextRequest) {
  if (!isTokenValid(getBearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = readEvents();
  const stats = aggregateEvents(events);
  return NextResponse.json(stats);
}
