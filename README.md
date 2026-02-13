# deid — Financial CSV Deidentification Tool

A CLI tool that processes financial CSV exports, deidentifies patient PHI (names, addresses, etc.), and writes clean data to Google Sheets. Designed for multi-location clinic financial modeling.

## How It Works

```
CSV Files → Pre-processor (DSL rules) → Deidentifier (hash/strip/pass) → Google Sheets
```

- **Names** are hashed with SHA-256 + a per-target salt → `patientId`
- **PHI fields** (addresses, emails, etc.) are stripped entirely
- **Financial data** passes through unchanged
- **Dedup** prevents duplicate rows on re-import
- **Reidentification map** stored in a separate tab (hash → original name)

## Setup

### 1. Install

```bash
cd projects/deidentification-processor
pip install -e .
```

### 2. Google OAuth Credentials

1. Create an OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable the Google Sheets API and Google Drive API
3. Download the client secrets JSON
4. Save it as `~/.deid/client_secrets.json`

### 3. Authenticate

```bash
deid auth
```

This opens a browser for Google OAuth. Credentials are saved to `~/.deid/credentials.json`.

## Usage

### Create a Target

A "target" is a Google Sheet with 6 tabs (5 export types + reidentification map):

```bash
deid target create "Gameday HB"
```

### Process CSV Files

```bash
# Process specific files
deid process --target "Gameday HB" ProductSalesReport.csv Payments.csv

# Process all CSVs in a directory (shell glob)
deid process --target "Gameday HB" ./exports/*.csv
```

File types are auto-detected from filenames. Supported patterns:
- `ProductSalesReport.csv`, `ProductSalesReport (13).csv`
- `Payments.csv`, `Payments (6).csv`
- `Invoices.csv`, `Customers.csv`, `Contracts.csv`

Re-importing the same data is safe — duplicate rows are skipped.

### Manage Targets

```bash
deid target list
deid target info "Gameday HB"
```

## Pre-processing Rules

Rules in `rules/<type>.yaml` apply transformations before deidentification. Useful for disambiguating patients (e.g., father/son with same name):

```yaml
rules:
  - match:
      firstName: "Edwin"
      lastName: "Jones"
      address1: "123 Main St"
    set:
      lastName: "Jones Jr."

  - match:
      customerName: "Jane Doe"
    append:
      customerName: " Sr."
```

- **match**: AND across columns (case-insensitive)
- **set**: Overwrite a column value
- **append**: Append to a column value
- Rules are processed in order

## Column Handling

| Sheet | Hashed → patientId | Stripped | Passed Through |
|---|---|---|---|
| ProductSalesReport | customerName | Username | productname, variantName, count, amount, profit, dateCreated |
| Payments | Customer | Customer Number, Auth Code, Memo | Reference, Tran Type, Tender, Amount, Status, Source, Date/Time, Invoice, Tax |
| Invoices | customerName | *(none)* | invoiceNumber, totalAmount, type, invoiceDate, dueDate, terms |
| Customers | firstName + lastName | Id, addressName, address1-2, city, state, zip, email, mobile, primaryContact, phoneIsMobile, customerNumber | spendProfile, country, lastActivity, isTaxExempt, isVip, lastVisit, visits, sales, refunds |
| Contracts | customerName | *(none)* | name, interval, every, on, plan, amount, status, lastInvoiceDate, nextBillDate |

## File Structure

```
deid/                  # Python package
├── cli.py             # CLI entry point
├── auth.py            # Google OAuth2
├── preprocessor.py    # Rule engine
├── deidentifier.py    # Hash/strip/pass engine
├── sheets.py          # Google Sheets integration
└── config.py          # Configuration management
schemas/               # Column classification per export type
rules/                 # Pre-processing rules per export type
```
