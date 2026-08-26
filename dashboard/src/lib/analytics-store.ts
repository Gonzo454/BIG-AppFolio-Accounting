import fs from "fs";
import path from "path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getScreenName, scrubPath } from "./analytics-scrub";

const MAX_BODY_SIZE = 8192;
const MAX_SCREEN_LENGTH = 100;
const MAX_PATH_LENGTH = 200;
const MAX_PLATFORM_LENGTH = 20;
const MAX_SESSION_ID_LENGTH = 100;
const MAX_TIMESTAMP_LENGTH = 64;
const MAX_AGGREGATE_KEYS = 100;

export type AnalyticsEvent = {
  event: "app_open" | "screen_view";
  screen: string;
  path: string;
  platform: string;
  operator_id?: string;
  sessionId?: string;
  timestamp?: string;
  receivedAt?: string;
};

export interface AnalyticsStats {
  total: number;
  eventsLast7Days: number;
  eventsLast30Days: number;
  topScreens: { key: string; count: number }[];
  byPlatform: { key: string; count: number }[];
  byOperator: { key: string; count: number }[];
  lastEventReceived: string | null;
}

const ALLOWED_EVENTS = ["app_open", "screen_view"] as const;

export const ANALYTICS_API_TOKEN = process.env.ANALYTICS_API_TOKEN?.trim() ?? "";
export const ANALYTICS_INGEST_TOKEN =
  process.env.ANALYTICS_INGEST_TOKEN?.trim() ?? "";
export const ANALYTICS_FORWARD_URL =
  process.env.ANALYTICS_FORWARD_URL?.trim();
export const ANALYTICS_ALLOWED_ORIGINS = process.env.ANALYTICS_ALLOWED_ORIGINS
  ? process.env.ANALYTICS_ALLOWED_ORIGINS
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : null;

export const ANALYTICS_STORE =
  process.env.ANALYTICS_STORE ?? (process.env.VERCEL ? "postgres" : "jsonl");
export const ANALYTICS_STORE_PATH =
  process.env.ANALYTICS_STORE_PATH || "/tmp/analytics.jsonl";

function tokenSet(value: string): Set<string> {
  const set = new Set<string>();
  for (const part of value.split(",")) {
    const token = part.trim();
    if (token) set.add(token);
  }
  return set;
}

export const INGEST_TOKENS = ANALYTICS_INGEST_TOKEN
  ? tokenSet(ANALYTICS_INGEST_TOKEN)
  : new Set<string>();

export const ADMIN_TOKENS = ANALYTICS_API_TOKEN
  ? tokenSet(ANALYTICS_API_TOKEN)
  : new Set<string>();

if (ANALYTICS_FORWARD_URL && ADMIN_TOKENS.size === 0) {
  console.error(
    "[analytics] ANALYTICS_API_TOKEN is required when ANALYTICS_FORWARD_URL is set. Forwarding disabled."
  );
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function isIngestTokenValid(token: string | null): boolean {
  if (!token) return false;
  for (const candidate of INGEST_TOKENS) {
    if (constantTimeEquals(token, candidate)) return true;
  }
  return false;
}

export function isAdminTokenValid(token: string | null): boolean {
  if (!token) return false;
  for (const candidate of ADMIN_TOKENS) {
    if (constantTimeEquals(token, candidate)) return true;
  }
  return false;
}

export function parseBearerToken(request: {
  headers: Headers;
}): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function sanitizeString(
  value: unknown,
  maxLength: number
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function deriveOperatorId(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const salt = ANALYTICS_API_TOKEN || "analytics-operator-salt";
  return createHmac("sha256", salt).update(sessionId).digest("base64url");
}

export function sanitizeEvent(body: unknown): AnalyticsEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;

  if (
    typeof input.event !== "string" ||
    !ALLOWED_EVENTS.includes(input.event as typeof ALLOWED_EVENTS[number])
  ) {
    return null;
  }

  const rawPath = sanitizeString(input.path, MAX_PATH_LENGTH);
  const path = scrubPath(rawPath ?? "");
  const screen = getScreenName(path).slice(0, MAX_SCREEN_LENGTH);
  const platform =
    sanitizeString(input.platform, MAX_PLATFORM_LENGTH) ?? "unknown";
  const sessionId = sanitizeString(input.sessionId, MAX_SESSION_ID_LENGTH);
  const timestamp = sanitizeString(input.timestamp, MAX_TIMESTAMP_LENGTH);

  return {
    event: input.event as AnalyticsEvent["event"],
    screen,
    path,
    platform,
    operator_id: deriveOperatorId(sessionId),
    sessionId,
    timestamp,
  };
}

export function validateBodySize(size: number): boolean {
  return size <= MAX_BODY_SIZE;
}

export function storeAvailable(): { ok: boolean; reason?: string } {
  if (process.env.VERCEL && ANALYTICS_STORE !== "postgres") {
    return {
      ok: false,
      reason:
        "JSONL store is not durable on Vercel. Set ANALYTICS_STORE=postgres and POSTGRES_URL.",
    };
  }
  if (ANALYTICS_STORE === "postgres" && !process.env.POSTGRES_URL) {
    return {
      ok: false,
      reason: "Postgres store selected but POSTGRES_URL is not set.",
    };
  }
  return { ok: true };
}

// --- JSONL store (dev / non-Vercel fallback) ---

function ensureJsonlDirectory(): void {
  const dir = path.dirname(ANALYTICS_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appendJsonl(event: AnalyticsEvent): void {
  ensureJsonlDirectory();
  const line = JSON.stringify(event) + "\n";
  fs.appendFileSync(ANALYTICS_STORE_PATH, line);
}

function readJsonlEvents(): AnalyticsEvent[] {
  if (!fs.existsSync(ANALYTICS_STORE_PATH)) return [];
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
      // skip corrupt lines
    }
  }
  return events;
}

function sortAggregate(
  counts: Record<string, number>
): { key: string; count: number }[] {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_AGGREGATE_KEYS);
}

function countWithinDays(events: AnalyticsEvent[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return events.filter((ev) => {
    const ts = ev.receivedAt || ev.timestamp;
    if (!ts) return false;
    return new Date(ts).getTime() >= cutoff;
  }).length;
}

function aggregateJsonl(events: AnalyticsEvent[]): AnalyticsStats {
  const byScreen: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  const byOperator: Record<string, number> = {};

  for (const ev of events) {
    byScreen[ev.screen] = (byScreen[ev.screen] || 0) + 1;
    byPlatform[ev.platform] = (byPlatform[ev.platform] || 0) + 1;
    if (ev.operator_id) {
      byOperator[ev.operator_id] = (byOperator[ev.operator_id] || 0) + 1;
    }
  }

  const last = events[events.length - 1];

  return {
    total: events.length,
    eventsLast7Days: countWithinDays(events, 7),
    eventsLast30Days: countWithinDays(events, 30),
    topScreens: sortAggregate(byScreen),
    byPlatform: sortAggregate(byPlatform),
    byOperator: sortAggregate(byOperator),
    lastEventReceived: last?.receivedAt || last?.timestamp || null,
  };
}

// --- Postgres store (Vercel / Neon) ---

function getSql() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  return neon(url);
}

async function ensurePostgresTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id           BIGSERIAL PRIMARY KEY,
      event        TEXT        NOT NULL,
      screen       TEXT,
      path         TEXT,
      platform     TEXT        NOT NULL,
      operator_id  TEXT,
      session_id   TEXT,
      occurred_at  TIMESTAMPTZ NOT NULL,
      received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_analytics_events_received_at ON analytics_events (received_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_analytics_events_event_screen ON analytics_events (event, screen)`;
}

async function insertPostgres(event: AnalyticsEvent): Promise<void> {
  await ensurePostgresTable();
  const sql = getSql();
  await sql`
    INSERT INTO analytics_events (
      event, screen, path, platform, operator_id, session_id, occurred_at, received_at
    ) VALUES (
      ${event.event},
      ${event.screen ?? null},
      ${event.path ?? null},
      ${event.platform},
      ${event.operator_id ?? null},
      ${event.sessionId ?? null},
      ${event.timestamp ? new Date(event.timestamp) : new Date()},
      ${event.receivedAt ? new Date(event.receivedAt) : new Date()}
    )
  `;
}

async function aggregatePostgres(): Promise<AnalyticsStats> {
  await ensurePostgresTable();
  const sql = getSql();

  const [{ total }] =
    await sql`SELECT COUNT(*)::int AS total FROM analytics_events`;

  const [{ eventsLast7Days }] = await sql`
    SELECT COUNT(*)::int AS eventsLast7Days
    FROM analytics_events
    WHERE received_at >= now() - interval '7 days'
  `;

  const [{ eventsLast30Days }] = await sql`
    SELECT COUNT(*)::int AS eventsLast30Days
    FROM analytics_events
    WHERE received_at >= now() - interval '30 days'
  `;

  const topScreenRows = (await sql`
    SELECT screen, COUNT(*)::int AS count
    FROM analytics_events
    GROUP BY screen
    ORDER BY count DESC
    LIMIT ${MAX_AGGREGATE_KEYS}
  `) as { screen: string | null; count: number }[];

  const platformRows = (await sql`
    SELECT platform, COUNT(*)::int AS count
    FROM analytics_events
    GROUP BY platform
    ORDER BY count DESC
    LIMIT ${MAX_AGGREGATE_KEYS}
  `) as { platform: string; count: number }[];

  const operatorRows = (await sql`
    SELECT operator_id, COUNT(*)::int AS count
    FROM analytics_events
    WHERE operator_id IS NOT NULL
    GROUP BY operator_id
    ORDER BY count DESC
    LIMIT ${MAX_AGGREGATE_KEYS}
  `) as { operator_id: string; count: number }[];

  const lastRow = (await sql`
    SELECT received_at
    FROM analytics_events
    ORDER BY received_at DESC
    LIMIT 1
  `) as { received_at: string }[];

  return {
    total,
    eventsLast7Days,
    eventsLast30Days,
    topScreens: topScreenRows.map((row) => ({
      key: row.screen ?? "[unmapped]",
      count: row.count,
    })),
    byPlatform: platformRows.map((row) => ({
      key: row.platform,
      count: row.count,
    })),
    byOperator: operatorRows.map((row) => ({
      key: row.operator_id,
      count: row.count,
    })),
    lastEventReceived: lastRow[0]?.received_at ?? null,
  };
}

export async function appendEvent(event: AnalyticsEvent): Promise<void> {
  const enriched = { ...event, receivedAt: new Date().toISOString() };
  if (ANALYTICS_STORE === "postgres") {
    await insertPostgres(enriched);
  } else {
    appendJsonl(enriched);
  }
}

export async function aggregateEvents(): Promise<AnalyticsStats> {
  if (ANALYTICS_STORE === "postgres") {
    return aggregatePostgres();
  }
  const events = readJsonlEvents();
  return aggregateJsonl(events);
}

export async function cleanupOldEvents(days = 90): Promise<void> {
  if (ANALYTICS_STORE !== "postgres") return;
  const sql = getSql();
  await sql`DELETE FROM analytics_events WHERE received_at < now() - interval '1 day' * ${days}`;
}
