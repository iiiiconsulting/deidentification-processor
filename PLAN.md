# Deidentification Processor — Plan

## Overview

A CLI tool that processes financial CSV exports from clinic management software, deidentifies patient PHI, and outputs clean data to Google Sheets. Designed for multi-location Gameday clinic financial modeling.

## Architecture

```
CSV Files (5 types)
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Pre-processor │ ──▶ │ Deidentifier │ ──▶ │ Sheet Writer │
│ (DSL rules)  │     │ (hash/strip) │     │ (Google API) │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Reiden Map   │
                     │ (Google Sheet)│
                     └──────────────┘
```

## Pipeline Stages

### 1. Pre-processor (Rule Engine)

Applies ordered transformation rules before deidentification. Each sheet type has a config with 0+ rules.

**DSL Design (YAML):**
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

- **match:** AND across all specified columns (case-insensitive)
- **set:** Overwrite column value
- **append:** Append to existing column value
- Rules processed in order; earlier rules affect later matches

### 2. Deidentifier (Core Engine)

Each column is classified as one of three actions:

| Action | Behavior |
|--------|----------|
| **hash** | SHA-256 of `lower(trim(value))` with target salt → truncated hex (e.g., first 12 chars) |
| **strip** | Column removed from output entirely |
| **pass** | Column passed through unchanged |

**Identity hash function:**
```
hash_id = sha256(salt + lower(trim(name_value)))[0:12]
```

For the Customers sheet (split name fields):
```
hash_id = sha256(salt + lower(trim(firstName + ' ' + lastName)))[0:12]
```

The hash replaces the original name column(s). In the Customers sheet, `firstName` and `lastName` are replaced with a single `patientId` column.

### 3. Deduplication

On upsert to existing sheets:
- Each row gets a **content hash** (hash of all passthrough columns + patientId) for dedup
- Before writing, check existing sheet rows for matching content hashes
- Skip duplicates, append new rows
- Handles the re-export overlap problem (multiple CSVs with `(#)` suffix)

### 4. Google Sheets Writer

- **OAuth2 per user** — CLI triggers browser-based OAuth on first run, stores refresh token locally
- **Direct creation** — first run for a target creates a new Google Sheet with 5 tabs (one per export type) + reiden map sheet
- **Upsert mode** — subsequent runs append/dedup against existing data

## Sheet Schemas (Output)

### ProductSalesReport
| Output Column | Source | Action |
|---|---|---|
| patientId | customerName | hash |
| productname | productname | pass |
| variantName | variantName | pass |
| count | count | pass |
| amount | amount | pass |
| profit | profit | pass |
| dateCreated | dateCreated | pass |
| ~~Username~~ | Username | strip |

### Payments
| Output Column | Source | Action |
|---|---|---|
| patientId | Customer | hash |
| Reference | Reference | pass |
| Tran Type | Tran Type | pass |
| Tender | Tender | pass |
| Amount | Amount | pass |
| Status | Status | pass |
| Source | Source | pass |
| Date/Time | Date/Time | pass |
| Invoice | Invoice | pass |
| Tax | Tax | pass |
| ~~Customer Number~~ | Customer Number | strip |
| ~~Auth Code~~ | Auth Code | strip |
| ~~Memo~~ | Memo | strip |

### Invoices
| Output Column | Source | Action |
|---|---|---|
| patientId | customerName | hash |
| invoiceNumber | invoiceNumber | pass |
| totalAmount | totalAmount | pass |
| type | type | pass |
| invoiceDate | invoiceDate | pass |
| dueDate | dueDate | pass |
| terms | terms | pass |

### Customers
| Output Column | Source | Action |
|---|---|---|
| patientId | firstName + lastName | hash (combined) |
| spendProfile | spendProfile | pass |
| country | country | pass |
| customerNumber | customerNumber | pass |
| lastActivity | lastActivity | pass |
| isTaxExempt | isTaxExempt | pass |
| isVip | isVip | pass |
| lastVisit | lastVisit | pass |
| visits | visits | pass |
| sales | sales | pass |
| refunds | refunds | pass |
| ~~addressName~~ | addressName | strip |
| ~~address1~~ | address1 | strip |
| ~~address2~~ | address2 | strip |
| ~~city~~ | city | strip |
| ~~state~~ | state | strip |
| ~~zip~~ | zip | strip |
| ~~email~~ | email | strip |
| ~~mobile~~ | mobile | strip |
| ~~primaryContact~~ | primaryContact | strip |
| ~~phoneIsMobile~~ | phoneIsMobile | strip |
| ~~Id~~ | Id | strip |

### Contracts
| Output Column | Source | Action |
|---|---|---|
| patientId | customerName | hash |
| contractHolder | name | hash |
| interval | interval | pass |
| every | every | pass |
| on | on | pass |
| plan | plan | pass |
| amount | amount | pass |
| status | status | pass |
| lastInvoiceDate | lastInvoiceDate | pass |
| nextBillDate | nextBillDate | pass |

### Reidentification Map (per target)
| Column | Description |
|---|---|
| patientId | The SHA-256 hash (truncated) |
| originalName | The original full name (post pre-processing) |
| source | Which sheet type first introduced this identity |
| dateAdded | When this mapping was created |

## Target Configuration

Each target (set of sheets for a location group) is stored as a local config file:

```yaml
# ~/.deid/targets/gameday-hb.yaml
name: "Gameday HB"
salt: "randomly-generated-on-creation"
created: "2026-02-13"
sheets:
  productSalesReport: "sheet_id_here"
  payments: "sheet_id_here"
  invoices: "sheet_id_here"
  customers: "sheet_id_here"
  contracts: "sheet_id_here"
  reidenMap: "sheet_id_here"
```

## CLI Interface

```bash
# First-time auth
deid auth

# Create a new target (clones template, generates salt)
deid target create "Gameday HB"

# Process CSV files into a target
deid process --target "Gameday HB" ./exports/*.csv

# Process with auto-detection of file types from filenames
# Filenames: ProductSalesReport (13).csv, Payments (6).csv, etc.

# List targets
deid target list

# Show target info
deid target info "Gameday HB"
```

## Tech Stack

- **Language:** Python 3 (pandas for CSV, gspread for Google Sheets)
- **Auth:** Google OAuth2 (Sheets + Drive scopes), local token storage
- **Config:** YAML (target configs, sheet schemas, pre-processor rules)
- **Hashing:** hashlib SHA-256, configurable truncation length
- **Location:** `projects/deidentification-processor/`

## File Structure

```
projects/deidentification-processor/
├── PLAN.md
├── interview.md
├── README.md
├── requirements.txt
├── deid/
│   ├── __init__.py
│   ├── cli.py              # CLI entry point
│   ├── auth.py             # Google OAuth2 flow
│   ├── preprocessor.py     # Rule engine (DSL)
│   ├── deidentifier.py     # Hash/strip/pass engine
│   ├── sheets.py           # Google Sheets read/write/dedup
│   └── config.py           # Target & schema management
├── schemas/                 # Column configs per export type
│   ├── product_sales.yaml
│   ├── payments.yaml
│   ├── invoices.yaml
│   ├── customers.yaml
│   └── contracts.yaml
└── rules/                   # Pre-processor rules per sheet
    ├── product_sales.yaml
    ├── payments.yaml
    ├── invoices.yaml
    ├── customers.yaml
    └── contracts.yaml
```

## Open Questions

1. ✅ **Contracts `name`** — numeric contract ID, passthrough. Only `customerName` gets hashed.
2. ✅ **Customers `Id`** — strip.
3. ✅ **Hash length** — full SHA-256 (64 hex chars). No truncation.
4. ✅ **Payments `Memo`** — strip.
5. ✅ **Customers `customerNumber`** — strip.
6. ✅ **Normalization** — trim, lowercase, collapse double spaces to single.
