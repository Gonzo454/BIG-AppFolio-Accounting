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

export const ANALYTICS_ALLOWED_ORIGINS =
  process.env.ANALYTICS_ALLOWED_ORIGINS
    ? process.env.ANALYTICS_ALLOWED_ORIGINS
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : null;

const rawMax = parseInt(process.env.ANALYTICS_MAX_EVENTS || "10000", 10);
export const ANALYTICS_MAX_EVENTS = Number.isNaN(rawMax)
  ? 10000
  : Math.max(1, rawMax);

function loadTokens(): Set<string> {
  const values: (string | undefined)[] = [
    process.env.ANALYTICS_API_TOKEN,
    process.env.NEXT_PUBLIC_ANALYTICS_API_TOKEN,
    process.env.EXPO_PUBLIC_ANALYTICS_API_TOKEN,
  ];

  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(",")) {
      const token = part.trim();
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

export const ANALYTICS_API_TOKENS = loadTokens();

export function isTokenValid(token: string | null): boolean {
  if (ANALYTICS_API_TOKENS.size === 0) {
    return process.env.ANALYTICS_DISABLE_AUTH === "true";
  }
  if (!token) return false;
  return ANALYTICS_API_TOKENS.has(token);
}

export function ensureStoreDirectory(): void {
  const dir = path.dirname(ANALYTICS_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function appendEvent(event: AnalyticsEvent): void {
  ensureStoreDirectory();
  const line = JSON.stringify(event) + "\n";

  if (ANALYTICS_MAX_EVENTS > 0 && fs.existsSync(ANALYTICS_STORE_PATH)) {
    const raw = fs.readFileSync(ANALYTICS_STORE_PATH, "utf-8").trim();
    const existingLines = raw ? raw.split("\n") : [];
    if (existingLines.length >= ANALYTICS_MAX_EVENTS) {
      const keepCount = ANALYTICS_MAX_EVENTS - 1;
      if (keepCount <= 0) {
        fs.writeFileSync(ANALYTICS_STORE_PATH, "");
      } else {
        const keep = existingLines.slice(-keepCount);
        fs.writeFileSync(
          ANALYTICS_STORE_PATH,
          keep.map((l) => (l ? l + "\n" : "")).join("")
        );
      }
    }
  }

  fs.appendFileSync(ANALYTICS_STORE_PATH, line);
}

export function readEvents(): AnalyticsEvent[] {
  if (!fs.existsSync(ANALYTICS_STORE_PATH)) {
    return [];
  }
  const lines = fs
    .readFileSync(ANALYTICS_STORE_PATH, "utf-8")
    .trim()
    .split("\n");
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
