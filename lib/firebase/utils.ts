/**
 * Slugify a system name for use in Firestore document IDs or field names.
 * Lowercases, drops ampersands, and collapses spaces/slashes to hyphens —
 * e.g. "Vehicle Modeling & Software" → "vehicle-modeling-software",
 * "Sim/Val" → "sim-val". Ampersands must not reach doc IDs or URL params.
 */
export function slugifySystem(name: string): string {
  return name.toLowerCase().replace(/&/g, '').replace(/[\s/]+/g, '-');
}
