import fs from "fs";
import path from "path";

const MAX_BODY_SIZE = 8192;
const MAX_AGGREGATE_KEYS = 100;

export type AnalyticsEvent = {
  event: "app_launch" | "page_view" | "screen_view" | "unknown";
  screen?: string;
  path?: string;
  platform?: string;
  sessionId?: string;
  timestamp?: string;
  receivedAt?: string;
};

export const ANALYTICS_STORE_PATH =
  process.env.ANALYTICS_STORE_PATH || "/tmp/analytics.jsonl";

export const ANALYTICS_FORWARD_URL = process.env.ANALYTICS_FORWARD_URL;

export const ANALYTICS_API_TOKEN = process.env.ANALYTICS_API_TOKEN;

if (ANALYTICS_FORWARD_URL && !ANALYTICS_API_TOKEN) {
  throw new Error(
    "ANALYTICS_API_TOKEN is required when ANALYTICS_FORWARD_URL is set."
  );
}

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
  if (!token) return false;
  return ANALYTICS_API_TOKENS.has(token);
}

const DYNAMIC_SEGMENT = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$|^\d+$/i;

export function scrubPath(pathname: string): string {
  if (!pathname) return "";

  return pathname
    .split("/")
    .map((segment) => (DYNAMIC_SEGMENT.test(segment) ? "[id]" : segment))
    .join("/");
}

function sanitizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, maxLength);
}

export function sanitizeEvent(body: unknown): AnalyticsEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;

  const eventValue = input.event;
  if (typeof eventValue !== "string") return null;
  const event = ["app_launch", "page_view", "screen_view"].includes(eventValue)
    ? (eventValue as AnalyticsEvent["event"])
    : "unknown";

  const screen = sanitizeString(input.screen, 100);
  const rawPath = sanitizeString(input.path, 200);
  const path = rawPath ? scrubPath(rawPath) : undefined;
  const platform = sanitizeString(input.platform, 20);
  const sessionId = sanitizeString(input.sessionId, 100);
  const timestamp = sanitizeString(input.timestamp, 64);

  return {
    event,
    screen,
    path,
    platform,
    sessionId,
    timestamp,
  };
}

export function validateBodySize(size: number): boolean {
  return size <= MAX_BODY_SIZE;
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

function capAggregate(
  counts: Record<string, number>
): Record<string, number> {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length <= MAX_AGGREGATE_KEYS) {
    return counts;
  }

  const top = entries.slice(0, MAX_AGGREGATE_KEYS);
  const otherTotal = entries
    .slice(MAX_AGGREGATE_KEYS)
    .reduce((sum, [, count]) => sum + count, 0);

  const result: Record<string, number> = {};
  for (const [key, count] of top) {
    result[key] = count;
  }
  result["other"] = otherTotal;
  return result;
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
    byScreen: capAggregate(byScreen),
    byEvent: capAggregate(byEvent),
    recent: events.slice(-100).reverse(),
  };
}
