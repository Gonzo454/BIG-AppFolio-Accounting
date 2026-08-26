import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tempStore: string;

async function loadStore(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  return import("./analytics-store");
}

beforeEach(() => {
  tempStore = path.join(os.tmpdir(), `analytics-${Date.now()}.jsonl`);
  delete process.env.ANALYTICS_API_TOKEN;
  delete process.env.ANALYTICS_INGEST_TOKEN;
  delete process.env.ANALYTICS_STORE;
  delete process.env.ANALYTICS_STORE_PATH;
  delete process.env.VERCEL;
});

afterEach(() => {
  if (fs.existsSync(tempStore)) {
    fs.unlinkSync(tempStore);
  }
});

describe("analytics-store", () => {
  describe("token validation", () => {
    it("accepts the ingest token on the ingest path only", async () => {
      const store = await loadStore({
        ANALYTICS_INGEST_TOKEN: "ingest-token",
        ANALYTICS_API_TOKEN: "admin-token",
      });

      expect(store.isIngestTokenValid("ingest-token")).toBe(true);
      expect(store.isIngestTokenValid("admin-token")).toBe(false);
      expect(store.isIngestTokenValid("bad-token")).toBe(false);
      expect(store.isIngestTokenValid(null)).toBe(false);
    });

    it("accepts the admin token on the admin path only", async () => {
      const store = await loadStore({
        ANALYTICS_INGEST_TOKEN: "ingest-token",
        ANALYTICS_API_TOKEN: "admin-token",
      });

      expect(store.isAdminTokenValid("admin-token")).toBe(true);
      expect(store.isAdminTokenValid("ingest-token")).toBe(false);
      expect(store.isAdminTokenValid("bad-token")).toBe(false);
    });
  });

  describe("sanitizeEvent", () => {
    it("accepts a valid screen_view with normalized path and screen", async () => {
      const store = await loadStore();
      const result = store.sanitizeEvent({
        event: "screen_view",
        path: "/properties/1609-landmark-drive",
        platform: "web",
        sessionId: "abc",
        timestamp: "2026-08-25T00:00:00.000Z",
      });

      expect(result).not.toBeNull();
      expect(result?.event).toBe("screen_view");
      expect(result?.path).toBe("/properties/[id]");
      expect(result?.screen).toBe("Property Detail");
      expect(result?.operator_id).toBeDefined();
      expect(result?.sessionId).toBe("abc");
    });

    it("accepts a valid app_open", async () => {
      const store = await loadStore();
      const result = store.sanitizeEvent({
        event: "app_open",
        path: "/",
        platform: "ios",
      });

      expect(result?.event).toBe("app_open");
      expect(result?.path).toBe("/");
    });

    it("rejects unknown event names", async () => {
      const store = await loadStore();
      expect(store.sanitizeEvent({ event: "custom_event" })).toBeNull();
    });

    it("rejects malformed bodies", async () => {
      const store = await loadStore();
      expect(store.sanitizeEvent("not an object")).toBeNull();
      expect(store.sanitizeEvent({})).toBeNull();
      expect(store.sanitizeEvent({ event: 123 })).toBeNull();
    });

    it("scrubs screen using the allowlist", async () => {
      const store = await loadStore();
      const result = store.sanitizeEvent({
        event: "screen_view",
        path: "/properties/1609-landmark-drive",
        platform: "web",
        screen: "Attack String /properties/1609-landmark-drive", // attacker tries to override
      });

      expect(result?.screen).toBe("Property Detail");
    });

    it("scrubs unmapped routes", async () => {
      const store = await loadStore();
      const result = store.sanitizeEvent({
        event: "screen_view",
        path: "/sneaky/secret-path",
        platform: "web",
      });

      expect(result?.path).toBe("/[unmapped]");
      expect(result?.screen).toBe("[unmapped]");
    });
  });

  describe("store operations", () => {
    it("appends and aggregates events from the JSONL store", async () => {
      const store = await loadStore({
        ANALYTICS_STORE: "jsonl",
        ANALYTICS_STORE_PATH: tempStore,
      });

      await store.appendEvent({
        event: "app_open",
        screen: "Dashboard",
        path: "/",
        platform: "web",
        operator_id: "op-1",
      });
      await store.appendEvent({
        event: "screen_view",
        screen: "Properties",
        path: "/properties",
        platform: "ios",
        operator_id: "op-2",
      });

      const stats = await store.aggregateEvents();
      expect(stats.total).toBe(2);
      expect(stats.byPlatform.find((p) => p.key === "web")?.count).toBe(1);
      expect(stats.byPlatform.find((p) => p.key === "ios")?.count).toBe(1);
      expect(stats.topScreens.find((s) => s.key === "Properties")?.count).toBe(1);
      expect(stats.lastEventReceived).not.toBeNull();
    });
  });

  describe("storeAvailable", () => {
    it("returns 503 reason when VERCEL is set and store is jsonl", async () => {
      const store = await loadStore({
        VERCEL: "1",
        ANALYTICS_STORE: "jsonl",
      });

      expect(store.storeAvailable().ok).toBe(false);
    });

    it("returns ok for jsonl in dev", async () => {
      const store = await loadStore({
        ANALYTICS_STORE: "jsonl",
      });

      expect(store.storeAvailable().ok).toBe(true);
    });
  });
});
