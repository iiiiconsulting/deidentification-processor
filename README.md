# Deidentification Processor

A client-side web app that deidentifies financial CSV exports — names are hashed, PHI is stripped, and financial data passes through unchanged. All processing happens in your browser; no data is sent to any server.

**Live app:** https://iiiiconsulting.github.io/deidentification-processor/

## How It Works

```
CSV Files → Pre-processor (rules) → Deidentifier (hash/strip/pass) → ZIP Download
```

1. Upload CSV files (drag and drop)
2. File types are auto-detected from filenames
3. Pre-processing rules are applied (optional, configurable per location)
4. Names are hashed with SHA-256 + a per-location salt into a `patientId`
5. PHI fields (addresses, emails, phone numbers) are stripped entirely
6. Financial data passes through unchanged
7. Download a ZIP containing deidentified CSVs and a reidentification map

## Privacy & Security

- **Runs entirely in your browser** — no backend, no API calls, no network requests
- **Content-Security-Policy** blocks all outbound connections (enforced by the browser, verifiable in DevTools)
- **Salt** is stored in browser localStorage, never transmitted
- **Reidentification map** is the only sensitive output — store it securely

## Supported Export Types

| Export | Identity Column(s) | Stripped | Passed Through |
|---|---|---|---|
| Customers | firstName + lastName | Id, address, email, mobile, customerNumber, etc. | spendProfile, country, lastActivity, visits, sales, refunds, etc. |
| Payments | Customer | Customer Number, Auth Code, Memo | Reference, Tran Type, Tender, Amount, Status, Source, Date/Time, Invoice, Tax |
| Invoices | customerName | *(none)* | invoiceNumber, totalAmount, type, invoiceDate, dueDate, terms |
| Product Sales Report | customerName | Username | productname, variantName, count, amount, profit, dateCreated |
| Contracts | customerName | *(none)* | name, interval, every, on, plan, amount, status, lastInvoiceDate, nextBillDate |

Filenames are matched case-insensitively. Numbered exports like `Payments (6).csv` are detected automatically.

## Pre-processing Rules

Rules apply transformations before deidentification, useful for disambiguating patients (e.g., father/son with same name). Configured per-location in the Settings page:

- **match**: AND across columns (case-insensitive)
- **set**: Overwrite a column value
- **append**: Append to a column value

## Development

```bash
npm install
npm run dev       # Start dev server
npm run build     # Production build → dist/
npm run lint      # Type-check
```

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the workflow in `.github/workflows/deploy.yml`.

To deploy manually:

```bash
npm run build
# Serve the dist/ directory with any static file server
```
