export type AnalyticsEvent = {
  event: "app_launch" | "page_view";
  screen?: string;
  path?: string;
  platform?: string;
  timestamp?: string;
  sessionId?: string;
};

let sessionId: string | null = null;

const ANALYTICS_API_TOKEN = process.env.NEXT_PUBLIC_ANALYTICS_API_TOKEN;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return sessionId;
}

export async function trackEvent(
  event: AnalyticsEvent["event"],
  properties: Omit<AnalyticsEvent, "event" | "timestamp" | "sessionId"> = {}
): Promise<void> {
  const payload: AnalyticsEvent = {
    event,
    ...properties,
    platform: "web",
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ANALYTICS_API_TOKEN) {
    headers["Authorization"] = `Bearer ${ANALYTICS_API_TOKEN}`;
  }

  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    // Analytics are best-effort; never block the UI on a failed ping.
  }
}
