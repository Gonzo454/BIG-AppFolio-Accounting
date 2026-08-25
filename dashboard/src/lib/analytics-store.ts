import fs from "fs";
import path from "path";

export type AnalyticsEvent = {
  event: string;
  screen?: string;
  path?: string;
  platform?: string;
  sessionId?: string;
  timestamp?: string;
  receivedAt?: string;
  [key: string]: unknown;
};

export const ANALYTICS_STORE_PATH =
  process.env.ANALYTICS_STORE_PATH || "/tmp/analytics.jsonl";

export const ANALYTICS_FORWARD_URL = process.env.ANALYTICS_FORWARD_URL;

export function ensureStoreDirectory(): void {
  const dir = path.dirname(ANALYTICS_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function appendEvent(event: AnalyticsEvent): void {
  ensureStoreDirectory();
  const line = JSON.stringify(event) + "\n";
  fs.appendFileSync(ANALYTICS_STORE_PATH, line);
}

export function readEvents(): AnalyticsEvent[] {
  if (!fs.existsSync(ANALYTICS_STORE_PATH)) {
    return [];
  }
  const lines = fs.readFileSync(ANALYTICS_STORE_PATH, "utf-8").trim().split("\n");
  const events: AnalyticsEvent[] = [];
  for (const line of lines) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as AnalyticsEvent);
    } catch {
      // Skip corrupt lines.
    }
  }
  return events;
}

export function aggregateEvents(events: AnalyticsEvent[]) {
  const byScreen: Record<string, number> = {};
  const byEvent: Record<string, number> = {};

  for (const ev of events) {
    const key = ev.screen || ev.path || "unknown";
    byScreen[key] = (byScreen[key] || 0) + 1;
    byEvent[ev.event] = (byEvent[ev.event] || 0) + 1;
  }

  return {
    total: events.length,
    byScreen,
    byEvent,
    recent: events.slice(-100).reverse(),
  };
}
