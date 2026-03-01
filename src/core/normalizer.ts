/**
 * Text normalization for identity matching.
 * Ensures consistent identity strings for deterministic hashing.
 */

/**
 * Normalize a string value for identity matching:
 * - NFKC unicode normalization
 * - Trim leading/trailing whitespace
 * - Lowercase
 * - Collapse multiple whitespace characters (spaces, tabs) to a single space
 */
export function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s\t]+/g, ' ');
}

/**
 * Build an identity source string from a row using the schema's identity source config.
 *
 * @param row - A single data row as key-value pairs
 * @param identitySource - Either a single column name or an array of column names
 * @returns Normalized identity string, or empty string if all source columns are empty
 *
 * If identitySource is an array (e.g. ['firstName', 'lastName']):
 *   normalize(row[firstName] + " " + row[lastName])
 *
 * If identitySource is a string (e.g. 'Customer'):
 *   normalize(row[Customer])
 */
export function buildIdSource(
  row: Record<string, string>,
  identitySource: string | string[],
): string {
  if (Array.isArray(identitySource)) {
    const parts = identitySource.map((col) => row[col] ?? '');
    const combined = parts.join(' ');
    return normalize(combined);
  }

  const value = row[identitySource] ?? '';
  return normalize(value);
}
