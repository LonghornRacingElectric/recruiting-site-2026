/**
 * Slugify a system name for use in Firestore document IDs or field names.
 * Replaces spaces and slashes with hyphens and converts to lowercase.
 */
export function slugifySystem(name: string): string {
  return name.toLowerCase().replace(/[\s/]+/g, '-');
}
