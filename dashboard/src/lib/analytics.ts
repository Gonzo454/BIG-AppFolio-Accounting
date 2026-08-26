export type AnalyticsEvent = {
  event: "app_open" | "screen_view";
  screen?: string;
  path?: string;
  platform?: string;
  timestamp?: string;
  sessionId?: string;
};

let sessionId: string | null = null;

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

  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Analytics are best-effort; never block the UI on a failed ping.
  }
}
