import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tempStore: string;
let route: typeof import("./route");

beforeEach(async () => {
  tempStore = path.join(os.tmpdir(), `analytics-read-${Date.now()}.jsonl`);
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

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/analytics", {
    method: "GET",
    headers: {
      host: "localhost:3000",
      ...headers,
    },
  }) as unknown as import("next/server").NextRequest;
}

describe("GET /api/analytics", () => {
  it("rejects a forged Sec-Fetch-Site header", async () => {
    const res = await route.GET(
      request({ "sec-fetch-site": "same-origin" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects the ingest token", async () => {
    const res = await route.GET(
      request({ authorization: "Bearer ingest-token" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing token", async () => {
    const res = await route.GET(request());
    expect(res.status).toBe(401);
  });

  it("returns stats with a valid admin token", async () => {
    const store = await import("@/lib/analytics-store");
    await store.appendEvent({
      event: "screen_view",
      screen: "Dashboard",
      path: "/",
      platform: "web",
    });

    const res = await route.GET(
      request({ authorization: "Bearer admin-token" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.lastEventReceived).not.toBeNull();
  });
});
