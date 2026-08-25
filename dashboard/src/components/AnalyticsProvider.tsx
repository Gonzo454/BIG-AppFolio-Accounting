"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

const SCREEN_NAMES: Record<string, string> = {
  "/": "Command Center",
  "/jrw/dashboard": "JRW Dashboard",
  "/kpi-dashboard": "KPI Dashboard",
  "/properties": "Properties",
  "/properties/[slug]": "Property Detail",
  "/financials": "Financial Reports",
  "/aged-receivables": "Aged Receivables",
  "/lease-expirations": "Lease Expirations",
  "/rent-roll": "Rent Roll",
  "/vendors": "Vendors",
  "/banking": "Banking",
  "/big/dashboard": "BIG Dashboard",
  "/big/pnl": "BIG P&L",
  "/pv/dashboard": "Park Vista Dashboard",
  "/pv/communities": "Park Vista Communities",
  "/pv/financials": "Park Vista Financials",
  "/badger-realty": "Badger Realty",
  "/loans/station-955": "Station 955 Loan",
  "/prospects": "Prospect Dashboard",
  "/prospects/search": "Search Prospects",
  "/prospects/pipeline": "Sales Pipeline",
  "/cash-flow": "Cash Flow",
  "/budget-vs-actuals": "Budget vs Actuals",
};

function getScreenName(pathname: string): string {
  if (pathname.startsWith("/properties/") && pathname !== "/properties") {
    return "Property Detail";
  }
  return SCREEN_NAMES[pathname] || pathname || "Unknown";
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const launched = useRef(false);

  useEffect(() => {
    if (!launched.current) {
      trackEvent("app_launch", { path: pathname });
      launched.current = true;
    }

    if (pathname) {
      trackEvent("page_view", {
        screen: getScreenName(pathname),
        path: pathname,
      });
    }
  }, [pathname]);

  return children;
}
