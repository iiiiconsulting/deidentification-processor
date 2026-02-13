# Deidentification Processor — Interview Notes

**Goal:** Build a deidentification processor for financial CSV files.

## Questions & Responses

*(Recording as we go)*

---

### Q1: What's the primary use case?

**Response:** This is for Gameday clinic financial modeling. 5 locations now, growing to 8. Need to see revenue vs expenses (excluding debt for now). Revenue data contains customer names and PHI that must be deidentified before Kevyn can work with it. Requirements: (a) reversible — Steve can reidentify via separate workflow, (b) relational consistency — linked records maintain their linkage through the deidentification. Once deidentified revenue + bank transactions/P&L from both corporations are available, we can model historical and future financial behavior. Steve has existing sheets but they contain raw PHI, so we need to rebuild with safe versions.

**Interpretation:** This is a Gameday Men's Health project. The core problem is: Steve has financial data I can't safely touch because it contains patient PHI. The processor is a **gateway** — it sits between raw data and my analytical capability. Key architectural implications:
- Must be **deterministic and consistent** — same patient maps to same pseudonym every time, across files and sessions
- Must preserve **relational integrity** — if Patient A has 12 visits, all 12 rows link to the same pseudonymized ID
- Needs a **secure mapping table** that only Steve accesses (reidentification workflow)
- Multi-location support from the start (5→8 locations)
- Two data streams: revenue/patient data (PHI-heavy) and bank/P&L (likely less PHI but still sensitive)
- This isn't a one-shot tool — it's infrastructure for an ongoing financial modeling project

---

### Q2: What does the PHI landscape look like?

**Response:** Steve will provide headers — PHI fields will be obvious. Three source exports: **Product Sales Report**, **Customers**, **Payments**. Key additions:
- **Pre-processor step** needed per sheet — e.g., appending "Jr" to a customer name across all their payments. Each sheet has slightly different pre-processing logic.
- **Reidentification mapping** is a separate output sheet, never touched by AI.
- **Deidentification is a straight processor** — deterministic transform, not interactive.
- **Duplicate handling** — re-exports of overlapping data are expected (reporting system limitations), processor must handle gracefully (idempotent).

**Interpretation:** Architecture is becoming clear:
1. **Pre-processor** (per-sheet, configurable logic) → normalizes/enriches data before deidentification
2. **Deidentifier** (core engine) → deterministic pseudonymization with consistent mapping
3. **Reidentification map** (output artifact) → stored securely, Steve-only access
4. Three distinct CSV schemas but all linked by customer identity — the pseudonymization must be **cross-file consistent** (same real customer → same fake ID across all three exports)
5. Duplicate/re-export handling means we need either content hashing or primary key dedup — can't just append blindly
6. Pre-processor is interesting — it's a data correction layer that runs before deidentification, meaning the mapping table maps from the *corrected* identity, not raw

---

### Q3: Pre-processor — hardcoded or flexible?

**Response:** Simple DSL with multi-column AND matching and column set/append operations. Conceptual example: match on multiple fields, then overwrite or append to a target column. Each sheet has an ordered list of 0+ rules, processed sequentially. Steve explicitly said NOT to use his example DSL syntax — design a proper one.

**Interpretation:** This is a lightweight rule engine, not hardcoded logic. Design implications:
- **DSL per sheet** — likely a small config file (YAML/TOML/JSON) with an ordered rule list
- **Match clause:** AND-only multi-column equality matching (sufficient for identity disambiguation)
- **Action clause:** Set (overwrite) or append to a column value
- **Order matters** — rules are applied sequentially, meaning earlier rules can affect later matches
- **Use case is data correction** — disambiguating patients (e.g., father/son with same name at same address), fixing known data quality issues before the identity gets pseudonymized
- This is elegant — keeps the deidentifier itself clean and deterministic while handling messy real-world data upstream

---

### Q4: Pseudonym strategy and mapping format?

**Response:** Previously used SHA-256 hash of `lowercase(first + ' ' + last)` with a salt. Doesn't care about fake names — opaque hashes are fine.

**Interpretation:** Hash-based approach is ideal here:
- **Deterministic** — same input always produces same hash, no need to maintain a lookup during processing
- **Cross-file consistent** by nature — same name in Payments and Customers produces same hash
- **Salt** provides security — can't rainbow table back to names without the salt
- **Mapping table** is just salt + the hash↔name pairs (or just the salt, since you can re-derive)
- No fake names needed simplifies everything — we're building an analytical tool, not a demo dataset
- The reidentification sheet just needs: hash → original name, stored where only Steve accesses it
- Other PHI fields (addresses, phone numbers, etc.) can either be hashed similarly or simply dropped depending on whether they're needed for analysis

---

### Q5: Non-name PHI — hash or strip?

**Response:** No DOB expected in the data. Other PHI (address, phone, email) — just strip them. Only name matters for linkage.

**Interpretation:** Simplifies the design significantly:
- **Name fields** → SHA-256 hash (the identity linkage key)
- **All other PHI** (address, phone, email) → drop entirely from output
- This means the column config per sheet type just needs to classify columns as: **hash** (name fields), **strip** (other PHI), or **passthrough** (financial data, dates, product info)
- DOB would be the only analytically useful PHI field and it's not present, so no loss

---

### Q6: Tech stack, runtime, output format?

**Response:** Python or TypeScript, CLI is fine. Key points:
- **Output to Google Sheets** from a template — not just CSV files
- **Upsert capability** — update existing sheets (dedup on re-export), not just create new
- **Multi-location support** — CLI should target a specific location or create new from template
- **Reidentification map** is also a Google Sheet (Steve-only access)

**Interpretation:** This is more than a CSV processor — it's a **sheet management pipeline**:
- CLI invocation: `deid --location "HB" --source payments.csv` (or similar)
- First run for a location: clone template → populate with deidentified data
- Subsequent runs: upsert into existing sheet, deduplicating against what's already there
- Template-based means consistent structure across all locations — great for comparative analysis
- Reidentification map as a Google Sheet means Steve can look up identities without any tooling
- We already have Google Sheets API access via `scripts/google-api.py` and OAuth token
- Need to think about dedup strategy — probably hash-based row identity (hash of key columns) to detect existing rows
- Multi-location from day one means the config/salt should be per-location or global (probably global salt so cross-location patient matching works if needed)

---

### Q7: Salt scope — global or per-location?

**Response:** Configurable salt set at sheet creation time. Everything going into one set of sheets uses the same salt. Can adjust later.

**Interpretation:** Salt is per-target (set of sheets), configured once at creation. This means:
- Default: all locations sharing a target share a salt → cross-location patient linkage possible
- Could create separate targets with different salts for isolation if needed
- Salt stored in the target config (alongside sheet IDs, template refs)
- Simple and flexible — good call

---

### Q8: Column headers and schema?

**Response:** Actually 5 exports, not 3. File naming: `<Type>[ (#)].csv` where `(#)` is an optional re-export number. Headers provided:

**ProductSalesReport:** productname, variantName, customerName, count, amount, profit, dateCreated, Username
**Payments:** Customer Number, Reference, Customer, Tran Type, Tender, Amount, Status, Auth Code, Source, Memo, Date/Time, Invoice, Tax
**Invoices:** invoiceNumber, customerName, totalAmount, type, invoiceDate, dueDate, terms
**Customers:** Id, firstName, lastName, spendProfile, addressName, address1, address2, city, state, zip, country, primaryContact, customerNumber, lastActivity, isTaxExempt, email, mobile, phoneIsMobile, isVip, lastVisit, visits, sales, refunds
**Contracts:** name, customerName, interval, every, on, plan, amount, status, lastInvoiceDate, nextBillDate

**Interpretation — Column Classification:**

| Sheet | Hash (identity linkage) | Strip (PHI) | Passthrough (analytical) |
|---|---|---|---|
| ProductSalesReport | customerName, Username | *(none obvious)* | productname, variantName, count, amount, profit, dateCreated |
| Payments | Customer, Customer Number | Memo(?), Auth Code(?) | Reference, Tran Type, Tender, Amount, Status, Source, Date/Time, Invoice, Tax |
| Invoices | customerName | *(none)* | invoiceNumber, totalAmount, type, invoiceDate, dueDate, terms |
| Customers | firstName, lastName | addressName, address1, address2, city, state, zip, email, mobile, primaryContact | Id, spendProfile, country, customerNumber, lastActivity, isTaxExempt, phoneIsMobile, isVip, lastVisit, visits, sales, refunds |
| Contracts | name, customerName | *(none)* | interval, every, on, plan, amount, status, lastInvoiceDate, nextBillDate |

Key observations:
- **customerName** is the primary linkage field across most sheets (appears in 4 of 5)
- **Customers** sheet has split first/last — hash needs to combine them to match `customerName` in other sheets
- **Customer Number** in Payments could be a secondary linkage key (also in Customers as `customerNumber`) — might want to hash this too or use it as the dedup key
- **Username** in ProductSalesReport — likely staff, not patient? Need to clarify
- **name** in Contracts — presumably customer name in a different column label
- File numbering pattern `(#)` means multiple CSVs per type get concatenated/merged
- The re-export numbers are high (Payments 6, ProductSalesReport 13) — dedup is critical

---

### Q9: Username and Customer Number clarifications

**Response:**
- **Username** in ProductSalesReport → strip it
- **Customer Number** is not useful in either sheet — can't reliably link across sheets, which is why **customer name is the linkage key**
- Important: some entries in Payments/other sheets don't exist in Customers and vice versa — **each sheet must generate its pseudonymized ID from its own content alone**, not by looking up a master list

**Interpretation:**
- The identity hash is derived **per-row from name fields in that sheet** — no cross-referencing needed during processing
- This is actually simpler architecturally: each sheet is processed independently, and the hash function + salt naturally produces consistent IDs across sheets when the same name appears
- Customer Number can be stripped or passed through — it's not useful for linkage
- The Customers sheet combines `firstName + lastName`, other sheets have `customerName` or `Customer` or `name` — the pre-processor DSL may need to handle normalization (e.g., ensuring "John Smith" matches whether it came from separate first/last fields or a combined field)
- Hash input normalization is critical: `lower(trim(firstName + ' ' + lastName))` must produce the same hash as `lower(trim(customerName))` when they refer to the same person

---

### Q10: Template design and reidentification scope

**Response:**
- One reidentification map **per target** (not global)
- **OAuth per user** — the CLI triggers Google OAuth for the user running it. Sheets live in *their* Drive, not Kevyn's. Sheets only accessible to me if explicitly shared.
- No existing template — I should design one.

**Interpretation:**
- This is designed as a **multi-user tool** — Steve runs it, sheets go to his Drive. Could share deidentified sheets with Kevyn for analysis while keeping reiden map private.
- OAuth flow in CLI: standard Google OAuth2 with local redirect, store refresh token per user profile
- Template = a Google Sheet structure I define, cloned on first run for a new target
- Per-target reiden map means the target config holds: salt, sheet IDs (one per export type + reiden map), location metadata
- This is a proper standalone tool, not a Kevyn-specific script
