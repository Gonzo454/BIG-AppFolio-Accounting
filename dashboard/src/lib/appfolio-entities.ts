/**
 * AppFolio property IDs for entities that don't appear in the
 * account_totals report but DO exist in general_ledger and
 * check_register_detail. These are "management" entities that
 * AppFolio treats as properties internally.
 *
 * Discovered via check_register_detail → property_id field.
 */
export const ENTITY_PROPERTY_IDS = {
  big: 33, // Blackdeer Investment Group
  hotel: 26, // Badger Hotel Group
} as const;

export type ManagedEntity = keyof typeof ENTITY_PROPERTY_IDS;

/**
 * Same IDs keyed by the property name AppFolio reports for them, so
 * name-based lookups can resolve entities missing from account_totals.
 */
export const ENTITY_IDS_BY_NAME: Record<string, number> = {
  "Blackdeer Investment Group": ENTITY_PROPERTY_IDS.big,
  "Badger Hotel Group": ENTITY_PROPERTY_IDS.hotel,
};

/**
 * Entity classification by property name — mirrors the GL parser's
 * classifyEntity logic.
 */
export function classifyEntityByName(
  propertyName: string
): "big" | "hotel" | "jrw" | "pv" {
  if (propertyName.startsWith("Blackdeer Investment Group")) return "big";
  if (propertyName.startsWith("Badger Hotel Group")) return "hotel";
  if (propertyName.startsWith("Park Vista")) return "pv";
  return "jrw";
}
