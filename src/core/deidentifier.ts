import { SchemaDefinition, ReidenEntry } from './types';
import { CUSTOMERS_SCHEMA } from './schemas';
import { buildIdSource } from './normalizer';
import { hashBatch } from './hasher';

/**
 * Applies schema-based deidentification to rows.
 * Replaces identity columns with a hashed patientId, removes stripped columns,
 * and builds reidentification entries for the reiden map.
 */

/**
 * Deidentify a set of rows according to a schema definition.
 *
 * For each row:
 *   1. Build id_source using normalizer
 *   2. Hash id_source with salt to produce patientId
 *   3. Build deidentified row: patientId + pass columns only
 *   4. Build reiden entry: patientId, id_source, source placeholder, plus original customer columns
 *
 * Rows with empty id_source (no name data) are skipped.
 * Uses hashBatch for performance.
 *
 * @param rows - The input data rows
 * @param schema - The schema defining column actions
 * @param salt - The salt for hashing
 * @returns Deidentified rows and reidentification entries
 */
export async function deidentifyFile(
  rows: Record<string, string>[],
  schema: SchemaDefinition,
  salt: string,
): Promise<{ deidentifiedRows: Record<string, string>[]; reidenEntries: ReidenEntry[] }> {
  // Step 1: Build all id_sources and track which rows are valid
  const idSources: string[] = [];
  const validIndices: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const idSource = buildIdSource(rows[i], schema.identity.source);
    if (idSource !== '') {
      idSources.push(idSource);
      validIndices.push(i);
    }
  }

  // Step 2: Hash all id_sources in batch
  const patientIds = await hashBatch(salt, idSources);

  // Step 3: Determine which columns to pass through
  const passColumns = Object.entries(schema.columns)
    .filter(([, action]) => action === 'pass')
    .map(([col]) => col);

  // Step 4: Get the customer schema column names for reiden entries
  const customerColumns = Object.keys(CUSTOMERS_SCHEMA.columns);

  // Step 5: Build deidentified rows and reiden entries
  const deidentifiedRows: Record<string, string>[] = [];
  const reidenEntries: ReidenEntry[] = [];

  for (let idx = 0; idx < validIndices.length; idx++) {
    const rowIndex = validIndices[idx];
    const row = rows[rowIndex];
    const patientId = patientIds[idx];
    const idSource = idSources[idx];

    // Build deidentified row: patientId + pass columns
    const deidRow: Record<string, string> = { patientId };
    for (const col of passColumns) {
      deidRow[col] = row[col] ?? '';
    }
    deidentifiedRows.push(deidRow);

    // Build reiden entry: patientId, id_source, source (placeholder), plus customer columns
    const reidenEntry: ReidenEntry = {
      patientId,
      id_source: idSource,
      source: '', // Will be set by the caller
    };

    // Include all original column values that match customer schema columns
    for (const col of customerColumns) {
      if (col in row) {
        reidenEntry[col] = row[col];
      }
    }

    reidenEntries.push(reidenEntry);
  }

  return { deidentifiedRows, reidenEntries };
}
