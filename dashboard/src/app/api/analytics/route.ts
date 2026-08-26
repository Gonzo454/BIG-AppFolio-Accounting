export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  aggregateEvents,
  parseBearerToken,
  isAdminTokenValid,
  storeAvailable,
} from "@/lib/analytics-store";

export async function GET(request: NextRequest) {
  const available = storeAvailable();
  if (!available.ok) {
    return NextResponse.json({ error: available.reason }, { status: 503 });
  }

  // The read route is gated on the admin token until a real session/auth
  // layer is available. See Phase 1 / follow-up ticket.
  if (!isAdminTokenValid(parseBearerToken(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await aggregateEvents();
  return NextResponse.json(stats);
}
