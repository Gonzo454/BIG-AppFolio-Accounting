import { NextResponse } from "next/server";
import { readEvents, aggregateEvents } from "@/lib/analytics-store";

export async function GET() {
  const events = readEvents();
  const stats = aggregateEvents(events);
  return NextResponse.json(stats);
}
