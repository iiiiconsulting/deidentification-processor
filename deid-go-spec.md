# deid - Deidentification CLI Tool (Go Rewrite)

## Overview

Cross-platform CLI tool for deidentifying Gameday clinic export data. Produces anonymized CSVs suitable for sharing with external parties (consultants, analysts) while maintaining referential integrity via deterministic hashing.

## Goals

1. **Zero dependencies** — Single standalone binary, no Python/Node/runtime required
2. **Cross-platform** — Windows (.exe) and macOS binaries from single codebase
3. **Simple operation** — `deid process ./exports` and done
4. **Optional cloud upload** — Google Sheets upload via `--upload` flag, not required
5. **Tenant-configurable** — Per-location preprocessing rules via config file

---

## Core Workflow

```
Input:                    Processing:                 Output:
┌─────────────────┐      ┌──────────────────────┐    ┌─────────────────────┐
│ exports/        │      │ 1. Load config       │    │ output/             │
│ ├─ Customers.csv│ ───► │ 2. Pre-process mods  │───►│ ├─ Customers.csv    │
│ ├─ Payments.csv │      │ 3. Deidentify        │    │ ├─ Payments.csv     │
│ └─ Products.csv │      │ 4. Cross-ref enrich  │    │ ├─ Products.csv     │
└─────────────────┘      │ 5. Write outputs     │    │ └─ reiden-map.csv   │
                         └──────────────────────┘    └─────────────────────┘
```

---

## Commands

### `deid process <input-dir> [output-dir]`

Main command. Processes all CSVs in input directory.

```bash
# Basic usage - outputs to ./output/
deid process ./exports

# Specify output directory
deid process ./exports ./deidentified

# With Google Sheets upload
deid process ./exports --upload

# With specific config
deid process ./exports --config ./huntington-beach.yaml
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--config, -c` | Path to tenant config file (default: `./deid-config.yaml`) |
| `--upload` | Upload results to Google Sheets after processing |
| `--output, -o` | Output directory (default: `./output`) |
| `--verbose, -v` | Verbose logging |

### `deid init`

Creates a default config file in current directory.

```bash
deid init
# Creates ./deid-config.yaml with documented defaults
```

### `deid auth`

One-time Google OAuth setup (only needed if using `--upload`).

```bash
deid auth
# Opens browser for Google OAuth
# Stores refresh token in ~/.deid/credentials.json
```

---

## Input Files

Expected CSV exports from clinic POS/CRM:

| File | Key Fields | Notes |
|------|------------|-------|
| `Customers.csv` | firstName, lastName, email, phone, customerNumber | Primary customer record |
| `Payments.csv` | customerName, amount, date, paymentMethod | References customers |
| `Products.csv` | customerName, productName, quantity, date | References customers |

Additional CSVs in the input directory will be processed if they contain customer references.

---

## Output Files

### Deidentified CSVs

Same structure as inputs, with PII fields hashed:

| Original Field | Transformed |
|----------------|-------------|
| `firstName` | `John` → `patient_a1b2c3` |
| `lastName` | Removed |
| `email` | `john@example.com` → `email_d4e5f6@example.com` |
| `phone` | `555-1234` → `555-XXX-XXXX` |
| `customerName` | `John Smith` → `patient_a1b2c3` |

### `reiden-map.csv` (Reidentification Map)

**This is the key deliverable for reidentification.**

Structure mirrors `Customers.csv` but with hash added:

```csv
patientId,firstName,lastName,email,phone,source
patient_a1b2c3,John,Smith,john@example.com,555-123-4567,Customers.csv
patient_d4e5f6,Jane,Doe,jane@example.com,555-987-6543,Customers.csv
patient_g7h8i9,Bob,Wilson,,,Payments.csv
```

**Enrichment logic:**
- All customers from `Customers.csv` are included
- Any customer references found in OTHER files (Payments, Products, etc.) that don't exist in Customers.csv are ADDED with whatever fields are available
- `source` column indicates where the customer record originated

---

## Hashing Strategy

**Deterministic hashing** — Same input always produces same hash (required for referential integrity across files).

```go
func hashPatient(firstName, lastName string) string {
    input := strings.ToLower(strings.TrimSpace(firstName + lastName))
    hash := sha256.Sum256([]byte(input + SALT))
    return "patient_" + hex.EncodeToString(hash[:])[:8]
}
```

- Salt stored in config file (tenant-specific)
- Short hash (8 chars) for readability — collision risk acceptable for dataset sizes <100k

---

## Configuration File

`deid-config.yaml`:

```yaml
# Tenant/location identifier
tenant: huntington-beach

# Salt for deterministic hashing (keep secret, but consistent per tenant)
salt: "hb-2026-secret-salt"

# Field mappings (if exports use different column names)
field_mappings:
  customers:
    firstName: "First Name"
    lastName: "Last Name"
    email: "Email Address"
  payments:
    customerName: "Customer"
    amount: "Total"

# Pre-processing modifications (run before deidentification)
preprocessing:
  # Remove test/dummy records
  exclude_patterns:
    - field: email
      pattern: "@test.com$"
    - field: lastName
      pattern: "^(Test|Demo|Sample)$"
  
  # Normalize data
  transforms:
    - field: phone
      type: normalize_phone  # Strips formatting: (555) 123-4567 → 5551234567
    - field: email
      type: lowercase

# Google Sheets settings (only used with --upload flag)
google_sheets:
  spreadsheet_id: "1abc123..."  # Target spreadsheet
  credentials_path: "~/.deid/credentials.json"
```

---

## Build & Distribution

### Build Commands

```bash
# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o dist/deid-mac-arm64

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o dist/deid-mac-amd64

# Windows
GOOS=windows GOARCH=amd64 go build -o dist/deid.exe

# Linux (for server use if needed)
GOOS=linux GOARCH=amd64 go build -o dist/deid-linux
```

### Distribution

Single binary per platform. No installer needed.

**For franchisees:**
1. Download `deid.exe` (Windows) or `deid-mac` (Mac)
2. Place exports in a folder
3. Run: `deid process ./exports`
4. Send `output/` folder to analyst

---

## Project Structure

```
deid/
├── main.go              # Entry point, CLI setup
├── cmd/
│   ├── process.go       # Main processing command
│   ├── init.go          # Config initialization
│   └── auth.go          # Google OAuth flow
├── internal/
│   ├── config/
│   │   └── config.go    # Config loading/parsing
│   ├── processor/
│   │   ├── processor.go # Main processing logic
│   │   ├── hasher.go    # Hashing utilities
│   │   └── enricher.go  # Cross-file customer enrichment
│   ├── csv/
│   │   ├── reader.go    # CSV reading with field mapping
│   │   └── writer.go    # CSV output
│   └── sheets/
│       └── upload.go    # Google Sheets upload (optional)
├── go.mod
├── go.sum
└── Makefile             # Build targets for all platforms
```

---

## Dependencies

Minimal external dependencies:

```go
require (
    github.com/spf13/cobra v1.8.0      // CLI framework
    gopkg.in/yaml.v3 v3.0.1            // Config parsing
    golang.org/x/oauth2 v0.15.0        // Google OAuth (only for --upload)
    google.golang.org/api v0.150.0     // Google Sheets API (only for --upload)
)
```

Core CSV processing uses Go stdlib only.

---

## Error Handling

- Missing input files → Clear error message, list expected files
- Malformed CSV → Skip row, log warning, continue processing
- Missing config → Use sensible defaults, warn user
- OAuth failure → Clear instructions to run `deid auth`

---

## Security Considerations

1. **No PII in logs** — Hash values only, never original data
2. **Salt protection** — Config file should be kept private (not committed to git)
3. **Credentials storage** — OAuth tokens in `~/.deid/` with 600 permissions
4. **No network by default** — Only contacts Google if `--upload` flag used

---

## Example Session

```bash
$ ls exports/
Customers.csv  Payments.csv  Products.csv

$ deid process exports/
Loading config from ./deid-config.yaml
Processing Customers.csv... 1,247 records
Processing Payments.csv... 8,432 records
Processing Products.csv... 3,891 records
Enriching customer map... added 23 customers from Payments.csv
Writing output/Customers.csv
Writing output/Payments.csv
Writing output/Products.csv
Writing output/reiden-map.csv

Done! Output in ./output/
  - 1,270 unique patients in reiden-map.csv
  - Ready for analysis (deidentified)

$ ls output/
Customers.csv  Payments.csv  Products.csv  reiden-map.csv
```

---

## Future Enhancements (Out of Scope for v1)

- [ ] Watch mode for continuous processing
- [ ] Encryption of reiden-map.csv
- [ ] Direct database export (bypass CSV step)
- [ ] Web UI for non-technical users
