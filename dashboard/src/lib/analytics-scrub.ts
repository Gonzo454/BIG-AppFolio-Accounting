// Pure string helpers — safe in both client and server bundles.

export type RoutePattern = {
  pattern: string;
  screen: string;
};

// Combined known route patterns for the mobile app and the web dashboard.
// Patterns use `[id]` for dynamic segments. Both apps can send paths that map
// to the same screen (e.g. mobile `/property/[id]` and web `/properties/[id]`
// both resolve to "Property Detail").
export const ROUTE_PATTERNS: RoutePattern[] = [
  // Dashboard routes
  { pattern: "/", screen: "Command Center" },
  { pattern: "/jrw/dashboard", screen: "JRW Dashboard" },
  { pattern: "/kpi-dashboard", screen: "KPI Dashboard" },
  { pattern: "/properties", screen: "Properties" },
  { pattern: "/properties/[id]", screen: "Property Detail" },
  { pattern: "/financials", screen: "Financial Reports" },
  { pattern: "/aged-receivables", screen: "Aged Receivables" },
  { pattern: "/lease-expirations", screen: "Lease Expirations" },
  { pattern: "/rent-roll", screen: "Rent Roll" },
  { pattern: "/vendors", screen: "Vendors" },
  { pattern: "/banking", screen: "Banking" },
  { pattern: "/big/dashboard", screen: "BIG Dashboard" },
  { pattern: "/big/pnl", screen: "BIG P&L" },
  { pattern: "/pv/dashboard", screen: "Park Vista Dashboard" },
  { pattern: "/pv/communities", screen: "Park Vista Communities" },
  { pattern: "/pv/financials", screen: "Park Vista Financials" },
  { pattern: "/badger-realty", screen: "Badger Realty" },
  { pattern: "/loans/station-955", screen: "Station 955 Loan" },
  { pattern: "/prospects", screen: "Prospect Dashboard" },
  { pattern: "/prospects/search", screen: "Search Prospects" },
  { pattern: "/prospects/pipeline", screen: "Sales Pipeline" },
  { pattern: "/cash-flow", screen: "Cash Flow" },
  { pattern: "/budget-vs-actuals", screen: "Budget vs Actuals" },

  // Mobile routes
  { pattern: "/", screen: "Dashboard" },
  { pattern: "/properties", screen: "Properties" },
  { pattern: "/property/[id]", screen: "Property Detail" },
  { pattern: "/hotel", screen: "Hotel" },
  { pattern: "/prospects", screen: "Prospects" },
  { pattern: "/agent-m", screen: "Joe Agent" },
  { pattern: "/big-mgmt", screen: "BIG Management" },
  { pattern: "/park-vista", screen: "Park Vista" },
  { pattern: "/kpi-dashboard", screen: "KPI Dashboard" },
  { pattern: "/badger-realty", screen: "Badger Realty" },
  { pattern: "/station-955", screen: "Station 955 Loan" },
  { pattern: "/financials", screen: "Financials" },
  { pattern: "/banking", screen: "Banking" },
  { pattern: "/receivables", screen: "Aged Receivables" },
  { pattern: "/leases", screen: "Lease Expirations" },
  { pattern: "/rent-roll", screen: "Rent Roll" },
  { pattern: "/vendors", screen: "Vendors" },
  { pattern: "/support", screen: "Support" },
  { pattern: "/privacy", screen: "Privacy" },
];

const compiledPatterns = ROUTE_PATTERNS.map(({ pattern, screen }) => ({
  pattern,
  screen,
  regex: new RegExp(
    "^" + pattern.replace(/\[[^\]]+\]/g, "[^/]+") + "$"
  ),
}));

export function scrubPath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  for (const { pattern, regex } of compiledPatterns) {
    if (regex.test(pathname)) {
      return pattern;
    }
  }

  return "/[unmapped]";
}

export function getScreenName(pathname: string): string {
  if (!pathname) {
    return "[unmapped]";
  }

  for (const { regex, screen } of compiledPatterns) {
    if (regex.test(pathname)) {
      return screen;
    }
  }

  return "[unmapped]";
}
