import { SchemaDefinition, ExportType } from './types';

export const CUSTOMERS_SCHEMA: SchemaDefinition = {
  exportType: 'customers',
  displayName: 'Customers',
  filenamePatterns: ['customers'],
  identity: { source: ['firstName', 'lastName'] },
  columns: {
    firstName: 'hash',
    lastName: 'hash',
    Id: 'strip',
    addressName: 'strip',
    address1: 'strip',
    address2: 'strip',
    city: 'strip',
    state: 'strip',
    zip: 'strip',
    email: 'strip',
    mobile: 'strip',
    primaryContact: 'strip',
    phoneIsMobile: 'strip',
    customerNumber: 'strip',
    spendProfile: 'pass',
    country: 'pass',
    lastActivity: 'pass',
    isTaxExempt: 'pass',
    isVip: 'pass',
    lastVisit: 'pass',
    visits: 'pass',
    sales: 'pass',
    refunds: 'pass',
  },
};

export const PAYMENTS_SCHEMA: SchemaDefinition = {
  exportType: 'payments',
  displayName: 'Payments',
  filenamePatterns: ['payments'],
  identity: { source: 'Customer' },
  columns: {
    Customer: 'hash',
    'Customer Number': 'strip',
    'Auth Code': 'strip',
    Memo: 'strip',
    Reference: 'pass',
    'Tran Type': 'pass',
    Tender: 'pass',
    Amount: 'pass',
    Status: 'pass',
    Source: 'pass',
    'Date/Time': 'pass',
    Invoice: 'pass',
    Tax: 'pass',
  },
};

export const INVOICES_SCHEMA: SchemaDefinition = {
  exportType: 'invoices',
  displayName: 'Invoices',
  filenamePatterns: ['invoices'],
  identity: { source: 'customerName' },
  columns: {
    customerName: 'hash',
    invoiceNumber: 'pass',
    totalAmount: 'pass',
    type: 'pass',
    invoiceDate: 'pass',
    dueDate: 'pass',
    terms: 'pass',
  },
};

export const PRODUCT_SALES_SCHEMA: SchemaDefinition = {
  exportType: 'product_sales',
  displayName: 'Product Sales Report',
  filenamePatterns: ['productsalesreport', 'product_sales', 'productsales'],
  identity: { source: 'customerName' },
  columns: {
    customerName: 'hash',
    Username: 'strip',
    productname: 'pass',
    variantName: 'pass',
    count: 'pass',
    amount: 'pass',
    profit: 'pass',
    dateCreated: 'pass',
  },
};

export const CONTRACTS_SCHEMA: SchemaDefinition = {
  exportType: 'contracts',
  displayName: 'Contracts',
  filenamePatterns: ['contracts'],
  identity: { source: 'customerName' },
  columns: {
    customerName: 'hash',
    name: 'pass',
    interval: 'pass',
    every: 'pass',
    on: 'pass',
    plan: 'pass',
    amount: 'pass',
    status: 'pass',
    lastInvoiceDate: 'pass',
    nextBillDate: 'pass',
  },
};

export const ALL_SCHEMAS: SchemaDefinition[] = [
  CUSTOMERS_SCHEMA,
  PAYMENTS_SCHEMA,
  INVOICES_SCHEMA,
  PRODUCT_SALES_SCHEMA,
  CONTRACTS_SCHEMA,
];

export function getSchema(exportType: ExportType): SchemaDefinition {
  const schema = ALL_SCHEMAS.find(s => s.exportType === exportType);
  if (!schema) throw new Error(`Unknown export type: ${exportType}`);
  return schema;
}

/** Detect export type from a filename using substring matching. Returns null if unrecognized. */
export function detectExportType(filename: string): ExportType | null {
  const name = filename.replace(/\.csv$/i, '').toLowerCase().replace(/[\s_-]+/g, '');
  for (const schema of ALL_SCHEMAS) {
    for (const pattern of schema.filenamePatterns) {
      const normalizedPattern = pattern.toLowerCase().replace(/[\s_-]+/g, '');
      if (name.includes(normalizedPattern)) {
        return schema.exportType;
      }
    }
  }
  return null;
}

/**
 * Returns the column order for the reiden map CSV.
 * patientId, id_source, then all customer schema columns, then source.
 */
export function getReidenMapColumns(): string[] {
  return [
    'patientId',
    'id_source',
    ...Object.keys(CUSTOMERS_SCHEMA.columns),
    'source',
  ];
}
