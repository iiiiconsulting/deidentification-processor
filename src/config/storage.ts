import type { LocationConfig, ExportType, PreprocessingRule } from '../core/types';

const STORAGE_KEY = 'deid-locations';

const ALL_EXPORT_TYPES: ExportType[] = [
  'customers',
  'payments',
  'invoices',
  'product_sales',
  'contracts',
];

export function getLocations(): LocationConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LocationConfig[];
  } catch {
    return [];
  }
}

export function getLocation(id: string): LocationConfig | null {
  const locations = getLocations();
  return locations.find((loc) => loc.id === id) ?? null;
}

export function saveLocation(config: LocationConfig): void {
  const locations = getLocations();
  const index = locations.findIndex((loc) => loc.id === config.id);
  if (index >= 0) {
    locations[index] = config;
  } else {
    locations.push(config);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch (e) {
    throw new Error(`Failed to save location: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function deleteLocation(id: string): void {
  const locations = getLocations().filter((loc) => loc.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch (e) {
    throw new Error(`Failed to delete location: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `loc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultLocation(name: string, salt: string): LocationConfig {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    salt,
    createdAt: now,
    updatedAt: now,
    preprocessingRules: {
      customers: [],
      payments: [],
      invoices: [],
      product_sales: [],
      contracts: [],
    },
  };
}

function ensureAllExportTypes(
  rules: Record<string, PreprocessingRule[]>
): Record<ExportType, PreprocessingRule[]> {
  const result = { ...rules } as Record<ExportType, PreprocessingRule[]>;
  for (const exportType of ALL_EXPORT_TYPES) {
    if (!Array.isArray(result[exportType])) {
      result[exportType] = [];
    }
  }
  return result;
}

function validateLocationShape(obj: unknown): asserts obj is LocationConfig {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Invalid location: expected an object');
  }
  const rec = obj as Record<string, unknown>;
  if (typeof rec.id !== 'string' || !rec.id) {
    throw new Error('Invalid location: missing or invalid "id"');
  }
  if (typeof rec.name !== 'string' || !rec.name) {
    throw new Error('Invalid location: missing or invalid "name"');
  }
  if (typeof rec.salt !== 'string') {
    throw new Error('Invalid location: missing or invalid "salt"');
  }
  if (typeof rec.preprocessingRules !== 'object' || rec.preprocessingRules === null) {
    throw new Error('Invalid location: missing or invalid "preprocessingRules"');
  }
}

export function exportConfig(locations: LocationConfig[]): string {
  return JSON.stringify(locations, null, 2);
}

export function importConfig(json: string): LocationConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: failed to parse configuration string');
  }

  // Accept both a single location object and an array of locations
  if (!Array.isArray(parsed)) {
    if (typeof parsed === 'object' && parsed !== null) {
      parsed = [parsed];
    } else {
      throw new Error('Invalid format: expected a location object or array of locations');
    }
  }

  return (parsed as unknown[]).map((item: unknown, index: number) => {
    try {
      validateLocationShape(item);
    } catch (e) {
      throw new Error(
        `Invalid location at index ${index}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const loc = item as LocationConfig;
    return {
      ...loc,
      id: generateId(),
      preprocessingRules: ensureAllExportTypes(loc.preprocessingRules),
    };
  });
}

export function exportSingleLocation(location: LocationConfig): string {
  return JSON.stringify(location, null, 2);
}

export function importSingleLocation(json: string): LocationConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: failed to parse location string');
  }

  validateLocationShape(parsed);
  const loc = parsed as LocationConfig;

  return {
    ...loc,
    id: generateId(),
    preprocessingRules: ensureAllExportTypes(loc.preprocessingRules),
  };
}
