import { PreprocessingRule } from './types';

/**
 * Rule engine that applies preprocessing transformations before deidentification.
 * Rules apply in order; earlier rules affect later matches within the same row.
 */

/**
 * Test whether a single row matches all conditions in a rule's match config.
 * All column->regex pairs must match (AND logic). Matching is case-insensitive.
 */
function rowMatchesRule(row: Record<string, string>, match: Record<string, string>): boolean {
  for (const [column, pattern] of Object.entries(match)) {
    const value = row[column] ?? '';
    try {
      const regex = new RegExp(pattern, 'i');
      if (!regex.test(value)) {
        return false;
      }
    } catch {
      // Invalid regex pattern — treat as non-match
      return false;
    }
  }
  return true;
}

/**
 * Apply a single rule's changes to a row, returning a new row object.
 */
function applyChanges(
  row: Record<string, string>,
  action: 'set' | 'append',
  changes: Record<string, string>,
): Record<string, string> {
  const updated = { ...row };
  for (const [column, value] of Object.entries(changes)) {
    if (action === 'set') {
      updated[column] = value;
    } else {
      // append
      updated[column] = (updated[column] ?? '') + value;
    }
  }
  return updated;
}

/**
 * Apply preprocessing rules to an array of rows.
 * Rules apply in order; earlier rules affect later matches within the same row.
 * Returns a new array — input rows are not mutated.
 *
 * @param rows - The input data rows
 * @param rules - Ordered list of preprocessing rules to apply
 * @returns New array of transformed rows
 */
export function applyPreprocessingRules(
  rows: Record<string, string>[],
  rules: PreprocessingRule[],
): Record<string, string>[] {
  return rows.map((originalRow) => {
    let row = { ...originalRow };
    for (const rule of rules) {
      if (rowMatchesRule(row, rule.match)) {
        row = applyChanges(row, rule.action, rule.changes);
      }
    }
    return row;
  });
}
