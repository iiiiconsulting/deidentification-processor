import {
  ParsedFile,
  LocationConfig,
  ProcessingResult,
  ProcessedFile,
  ReidenEntry,
} from './types';
import { getSchema } from './schemas';
import { applyPreprocessingRules } from './preprocessor';
import { deidentifyFile } from './deidentifier';
import { buildReidenMap } from './enricher';

/**
 * Main orchestrator for the deidentification processing pipeline.
 * Coordinates schema lookup, preprocessing, deidentification, and enrichment.
 */

/**
 * Process all parsed files through the deidentification pipeline.
 *
 * For each file:
 *   1. Look up the schema for its export type
 *   2. Apply preprocessing rules from the location config
 *   3. Deidentify rows using the schema and salt
 *   4. Set source on reiden entries
 *   5. Collect warnings for skipped rows
 *
 * After all files: build the merged reiden map using the enricher.
 *
 * @param parsedFiles - Array of parsed CSV files with detected export types
 * @param location - Location configuration with salt and preprocessing rules
 * @returns Complete processing result with deidentified files, reiden map, and stats
 */
export async function processFiles(
  parsedFiles: ParsedFile[],
  location: LocationConfig,
): Promise<ProcessingResult> {
  const processedFiles: ProcessedFile[] = [];
  const allReidenEntries: ReidenEntry[] = [];
  const warnings: string[] = [];
  let totalRecords = 0;

  for (const parsedFile of parsedFiles) {
    // Skip files with no detected export type
    if (parsedFile.exportType === null) {
      warnings.push(
        `Skipped file "${parsedFile.filename}": could not detect export type`,
      );
      continue;
    }

    const schema = getSchema(parsedFile.exportType);

    // Apply preprocessing rules for this export type
    const rules = location.preprocessingRules[parsedFile.exportType] ?? [];
    const preprocessedRows = applyPreprocessingRules(parsedFile.rows, rules);

    // Deidentify
    const { deidentifiedRows, reidenEntries } = await deidentifyFile(
      preprocessedRows,
      schema,
      location.salt,
    );

    // Set source on all reiden entries
    for (const entry of reidenEntries) {
      entry.source = schema.displayName;
    }

    // Track skipped rows
    const skippedCount = parsedFile.rows.length - deidentifiedRows.length;
    if (skippedCount > 0) {
      warnings.push(
        `${parsedFile.filename}: skipped ${skippedCount} row(s) with empty identity data`,
      );
    }

    const processedFile: ProcessedFile = {
      exportType: parsedFile.exportType,
      originalFilename: parsedFile.filename,
      deidentifiedRows,
      reidenEntries,
      rowCount: deidentifiedRows.length,
      warnings: [],
    };

    processedFiles.push(processedFile);
    allReidenEntries.push(...reidenEntries);
    totalRecords += deidentifiedRows.length;
  }

  // Build the merged reiden map
  const reidenMap = buildReidenMap(allReidenEntries);

  // Count patients that were only found in non-customer files
  const customerPatientIds = new Set(
    allReidenEntries
      .filter((e) => e.source === 'Customers')
      .map((e) => e.patientId),
  );
  const enrichedFromOtherFiles = reidenMap.filter(
    (e) => !customerPatientIds.has(e.patientId),
  ).length;

  return {
    files: processedFiles,
    reidenMap,
    warnings,
    stats: {
      totalRecords,
      uniquePatients: reidenMap.length,
      enrichedFromOtherFiles,
      filesProcessed: processedFiles.length,
    },
  };
}
