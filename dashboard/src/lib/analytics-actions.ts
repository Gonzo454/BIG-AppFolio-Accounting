"use server";

import { aggregateEvents } from "@/lib/analytics-store";
import type { AnalyticsStats } from "@/lib/analytics-store";

export async function getAnalyticsStats(): Promise<AnalyticsStats> {
  return aggregateEvents();
}
