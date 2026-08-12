/**
 * Joe-owned Park Vista buildings.
 *
 * Joe's 51% stake in Park Vista Senior Housing Management (the management
 * company) is tracked separately in ownership.ts ("Park Vista"). This table
 * covers the PV *buildings* Joe owns directly — those appear as real estate
 * holdings in the JRW section, weighted by his equity share.
 *
 * Source: Julie Lonergan (June 2026) — per-building ownership confirmed.
 * Keys must match property_name values in the PV AppFolio database.
 */

export interface PvBuildingEntry {
  /** Joe's equity share of the building, 0–1 */
  pct: number;
  /** Display label override (defaults to the property name) */
  label?: string;
}

// Per-building ownership from Julie Lonergan (June 2026).
// The 5 newest properties (Arborcreek, Arborview, Arborwood, Whispering Pines,
// The Lodge) are at 67.86% based on actual cash-out refi amounts at closing.
// Legacy at Noel Manor, Noel Manor, and Regency are not in Julie's list —
// using 0% until confirmed (Joe may not hold direct RE equity in those).
export const JOE_PV_BUILDINGS: Record<string, PvBuildingEntry> = {
  "Arborcreek Apartments": { pct: 0.6786, label: "Arborcreek Apartments" },
  "Arborview Court": { pct: 0.6786, label: "Arborview Court" },
  "Arborwood Lodge": { pct: 0.6786, label: "Arborwood Lodge" },
  "Camanche": { pct: 0.5742, label: "Camanche" },
  "Legacy": { pct: 0.60, label: "Legacy (Waupaca Legacy)" },
  "Legacy at Noel Manor": { pct: 0, label: "Legacy at Noel Manor" },
  "Legacy of DeForest": { pct: 0.5314, label: "Legacy of DeForest" },
  "Noel Manor": { pct: 0, label: "Noel Manor" },
  "North Hill": { pct: 0.80, label: "North Hill" },
  "Regency Retirement Residence of Clinton": { pct: 0, label: "Regency Retirement Residence of Clinton" },
  "The Lodge at Whispering Pines": { pct: 0.6786, label: "The Lodge at Whispering Pines" },
  "Waupaca": { pct: 0.8074, label: "Waupaca (Waubuck Seba)" },
  "Whispering Pines": { pct: 0.6786, label: "Whispering Pines" },
  "Willow Lane": { pct: 0.60, label: "Willow Lane" },
};

export function isJoePvBuilding(propertyName: string): boolean {
  return propertyName in JOE_PV_BUILDINGS;
}

/**
 * Resolve a display label (as shown in account-totals) back to the
 * property_name used in the PV AppFolio database. Also accepts the raw
 * property name. Returns undefined when the name isn't a PV building.
 */
export function resolveJoePvBuilding(
  displayName: string
): { propertyName: string; entry: PvBuildingEntry } | undefined {
  const direct = JOE_PV_BUILDINGS[displayName];
  if (direct) return { propertyName: displayName, entry: direct };
  for (const [propertyName, entry] of Object.entries(JOE_PV_BUILDINGS)) {
    if (entry.label === displayName) return { propertyName, entry };
  }
  return undefined;
}
