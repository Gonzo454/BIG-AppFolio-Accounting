"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { getScreenName, scrubPath } from "@/lib/analytics-scrub";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const launched = useRef(false);

  useEffect(() => {
    if (!pathname) return;

    const screen = getScreenName(pathname);
    const path = scrubPath(pathname);

    if (!launched.current) {
      trackEvent("app_open", { screen, path });
      launched.current = true;
    } else {
      trackEvent("screen_view", { screen, path });
    }
  }, [pathname]);

  return children;
}
