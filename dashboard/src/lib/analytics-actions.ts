"use server";

import { aggregateEvents, type AnalyticsStats } from "@/lib/analytics-store";

export type { AnalyticsStats };

export async function getAnalyticsStats(): Promise<AnalyticsStats> {
  return aggregateEvents();
}
