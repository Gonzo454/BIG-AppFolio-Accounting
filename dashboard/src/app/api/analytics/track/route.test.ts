import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tempStore: string;
let route: typeof import("./route");

beforeEach(async () => {
  tempStore = path.join(os.tmpdir(), `analytics-track-${Date.now()}.jsonl`);
  vi.resetModules();
  delete process.env.VERCEL;
  process.env.ANALYTICS_STORE = "jsonl";
  process.env.ANALYTICS_STORE_PATH = tempStore;
  process.env.ANALYTICS_INGEST_TOKEN = "ingest-token";
  process.env.ANALYTICS_API_TOKEN = "admin-token";
  route = await import("./route");
});

afterEach(() => {
  if (fs.existsSync(tempStore)) {
    fs.unlinkSync(tempStore);
  }
});

function request(
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost:3000/api/analytics/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost:3000",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/analytics/track", () => {
  it("rejects a request with no token and no same-origin headers", async () => {
    const res = await route.POST(request({ event: "screen_view", platform: "web" }));
    expect(res.status).toBe(401);
  });

  it("allows a same-origin request from the dashboard", async () => {
    const res = await route.POST(
      request(
        { event: "screen_view", platform: "web", path: "/properties/1609-landmark-drive" },
        { origin: "http://localhost:3000" }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("allows a request with a valid ingest token", async () => {
    const res = await route.POST(
      request(
        { event: "app_open", platform: "ios", path: "/" },
        { authorization: "Bearer ingest-token" }
      )
    );
    expect(res.status).toBe(200);
  });

  it("rejects the admin token on the ingest path", async () => {
    const res = await route.POST(
      request(
        { event: "app_open", platform: "ios" },
        { authorization: "Bearer admin-token" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const res = await route.POST(
      request(
        { event: "app_open", platform: "ios" },
        { authorization: "Bearer wrong" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("rejects an oversized body", async () => {
    const res = await route.POST(
      request(
        { event: "screen_view", platform: "web", payload: "x".repeat(10000) },
        { authorization: "Bearer ingest-token" }
      )
    );
    expect(res.status).toBe(413);
  });

  it("rejects malformed JSON", async () => {
    const res = await route.POST(
      new Request("http://localhost:3000/api/analytics/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer ingest-token",
          host: "localhost:3000",
        },
        body: "not json",
      }) as unknown as import("next/server").NextRequest
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown event names", async () => {
    const res = await route.POST(
      request(
        { event: "custom_event", platform: "ios" },
        { authorization: "Bearer ingest-token" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("scrubs slugs before storing", async () => {
    const res = await route.POST(
      request(
        { event: "screen_view", platform: "web", path: "/properties/1609-landmark-drive" },
        { authorization: "Bearer ingest-token" }
      )
    );
    expect(res.status).toBe(200);

    const store = await import("@/lib/analytics-store");
    const stats = await store.aggregateEvents();
    expect(stats.topScreens[0].key).toBe("Property Detail");
  });
});
