import { ReidenEntry } from './types';

/**
 * Cross-file customer enrichment for the reidentification map.
 * Deduplicates entries by patientId, giving priority to customer-sourced data.
 */

/**
 * Build a deduplicated reidentification map from all reiden entries across files.
 *
 * - Entries from 'Customers' source take priority (most complete data)
 * - For patients found only in other files (payments, invoices, etc.),
 *   include them with whatever fields are available
 * - Returns sorted by patientId for consistency
 *
 * @param allReidenEntries - Combined reiden entries from all processed files
 * @returns Deduplicated, sorted array of reiden entries
 */
export function buildReidenMap(allReidenEntries: ReidenEntry[]): ReidenEntry[] {
  const entryMap = new Map<string, ReidenEntry>();

  for (const entry of allReidenEntries) {
    const existing = entryMap.get(entry.patientId);

    if (!existing) {
      // First time seeing this patientId — store it
      entryMap.set(entry.patientId, { ...entry });
    } else if (entry.source === 'Customers' && existing.source !== 'Customers') {
      // New entry is from customers and existing is not — replace
      entryMap.set(entry.patientId, { ...entry });
    }
    // Otherwise keep existing (either it's already from customers, or first-seen wins)
  }

  // Sort by patientId for consistent output
  const entries = Array.from(entryMap.values());
  entries.sort((a, b) => a.patientId.localeCompare(b.patientId));
  return entries;
}
