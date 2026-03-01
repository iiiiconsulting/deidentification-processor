export type ExportType = 'customers' | 'payments' | 'invoices' | 'product_sales' | 'contracts';

export type ColumnAction = 'hash' | 'strip' | 'pass';

export interface SchemaDefinition {
  exportType: ExportType;
  displayName: string;
  /** Case-insensitive substrings to match against filename (without extension) */
  filenamePatterns: string[];
  identity: {
    /** Single column name or array of column names (e.g., ['firstName', 'lastName']) */
    source: string | string[];
  };
  /** Maps column name -> action. Column names are case-sensitive (must match CSV headers exactly). */
  columns: Record<string, ColumnAction>;
}

export interface PreprocessingRule {
  id: string;
  /** Column name -> regex pattern. All must match (AND logic). Case-insensitive matching. */
  match: Record<string, string>;
  action: 'set' | 'append';
  /** Column name -> value to set or append */
  changes: Record<string, string>;
}

export interface LocationConfig {
  id: string;
  name: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
  preprocessingRules: Record<ExportType, PreprocessingRule[]>;
}

export interface ParsedFile {
  file: File;
  filename: string;
  exportType: ExportType | null;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

export interface ProcessedFile {
  exportType: ExportType;
  originalFilename: string;
  /** Rows with hash columns replaced by patientId, strip columns removed */
  deidentifiedRows: Record<string, string>[];
  /** Reiden entries extracted from this file */
  reidenEntries: ReidenEntry[];
  rowCount: number;
  warnings: string[];
}

export interface ReidenEntry {
  patientId: string;
  id_source: string;
  source: string;
  /** All customer schema columns with original cleartext values */
  [key: string]: string;
}

export interface ProcessingResult {
  files: ProcessedFile[];
  /** Deduplicated reiden map (unique by patientId, customers.csv entries take priority) */
  reidenMap: ReidenEntry[];
  warnings: string[];
  stats: {
    totalRecords: number;
    uniquePatients: number;
    enrichedFromOtherFiles: number;
    filesProcessed: number;
  };
}

export type AppPage = 'process' | 'settings';
