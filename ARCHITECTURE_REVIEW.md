# Architecture Review — Deidentification Processor

**Reviewer:** Security-focused architecture review  
**Date:** 2026-02-13  
**Scope:** All source files in `deid/`, `schemas/`, `rules/`

---

## 1. Security Gaps in PHI Handling

### 1.1 Salt stored in plaintext on disk

**`config.py:97`** — `secrets.token_hex(32)` generates a strong salt, but it's written as plaintext YAML to `~/.deid/targets/<name>.yaml` (`config.py:88` via `yaml.dump`). Anyone with read access to `~/.deid/` can read the salt and reproduce all hashes, fully reversing the deidentification for common names via dictionary attack.

**`cli.py:56`** — The `target info` command prints the salt prefix to stdout (`config['salt'][:8]`), leaking partial salt material to terminal history, logs, and screen captures.

**Recommendation:** Encrypt target configs at rest (e.g., age, keyring, or OS keychain). At minimum, restrict file permissions to `0600` on creation — currently no `os.chmod` call exists anywhere.

### 1.2 Hash reversibility via dictionary attack

**`deidentifier.py:18-20`** — The hash is `sha256(salt + normalize(name))`. Patient names are drawn from a small namespace (~150k common US names). Even with a secret salt, if the salt leaks (see 1.1), the entire reiden map can be reconstructed in seconds. Without the salt, the lack of a key-stretching function (PBKDF2, Argon2) means brute-force is trivial if the salt is ever exposed.

**Impact:** SHA-256 is not designed for this threat model. A single GPU can compute billions of SHA-256 hashes/second.

**Recommendation:** Use HMAC-SHA256 (salt as key) at minimum, or a KDF like Argon2id for names. The performance cost is negligible for CSV-sized datasets.

### 1.3 OAuth credentials stored without protection

**`auth.py:42-43`** — Credentials (including refresh token with full Drive + Sheets scope) written as plaintext JSON to `~/.deid/credentials.json`. No file permission restriction.

**`auth.py:10-11`** — Scopes include `drive` (full access), which is overly broad. Only `drive.file` is needed (access only to files created by the app).

**Recommendation:**
- Use `https://www.googleapis.com/auth/drive.file` instead of `drive`.
- Set `0600` permissions on `credentials.json`.
- Consider using OS keychain for refresh token storage.

### 1.4 Reidentification map stored alongside deidentified data

**`sheets.py:73-105`** — The reiden map (containing original patient names paired with their hash) is written to a tab in the *same Google Sheet* as the deidentified data. This completely defeats the purpose of deidentification — anyone with access to the spreadsheet can trivially reidentify all patients.

**Recommendation:** Store the reiden map in a separate spreadsheet with distinct sharing permissions, or in a local encrypted store. This is the single most critical finding.

### 1.5 Original names transit through Google Sheets API unencrypted (in reiden map)

**`sheets.py:96-101`** — Original patient names are sent over the Sheets API as plaintext values. While the transport is TLS, the data is stored in Google's infrastructure in plaintext, accessible to anyone the sheet is shared with and to Google.

---

## 2. Hash Normalization Edge Cases

### 2.1 `str()` coercion of NaN/None produces inconsistent hashes

**`deidentifier.py:14`** — `_normalize` calls `str(value)`. If a name column is NaN (e.g., missing row in CSV), `str(float('nan'))` → `"nan"`, which then hashes to a deterministic patientId. All patients with missing names map to the same hash. This is both a correctness bug (silent collision) and a privacy issue (aggregation of unrelated records).

**`deidentifier.py:42`** — For combined fields (Customers), `str(row.get(col, ""))` would return `""` for missing columns but `"nan"` for NaN values, causing `"nan lastname"` vs `" lastname"` inconsistency.

**Recommendation:** Explicitly handle NaN/None before normalization — either skip the row or raise an error.

### 2.2 Unicode normalization not applied

**`deidentifier.py:14-16`** — No Unicode normalization (NFC/NFKC). Names like `"José"` (precomposed) vs `"José"` (decomposed `e` + combining acute) will produce different hashes. Same-looking names → different patientIds → broken joins across sheets.

**Recommendation:** Apply `unicodedata.normalize("NFKC", s)` in `_normalize`.

### 2.3 Space collapsing differs between preprocessor matching and deidentifier hashing

**`preprocessor.py:14`** — Match comparison does `str(row.get(col, "")).strip().lower()` — no space collapsing.  
**`deidentifier.py:15-16`** — Hashing does `strip().lower()` then `re.sub(r"\s+", " ", s)`.

A preprocessor rule matching `"John  Doe"` (double space) would fail because the match comparison doesn't collapse spaces, but the same value would hash identically to `"John Doe"`. This means a rule intended to fix `"John  Doe"` wouldn't trigger, but the hash would silently merge them anyway.

### 2.4 Customers combined-name join uses single space

**`deidentifier.py:44`** — `" ".join(parts)` joins firstName and lastName with a space. If a Contracts row has `customerName: "John Doe"` and a Customers row has `firstName: "John", lastName: "Doe"`, they'll hash identically — which is the intent. However, if `firstName` contains a trailing space (`"John "`) or `lastName` a leading space (`" Doe"`), the join produces `"John   Doe"` which normalizes to `"John Doe"` — correct. But `str(row.get(col, "")).strip()` at line 43 strips each part individually before join, so `" John "` → `"John"`, then joined → `"John Doe"`. This is actually correct. **No bug here**, but the multi-step normalization is fragile and undocumented.

---

## 3. Dedup Strategy Robustness

### 3.1 Content hash depends on column order

**`deidentifier.py:61-63`** — `content_hash` joins `row.values` with `|`. The hash depends on the iteration order of the Series. When reading from a fresh DataFrame, column order comes from the DataFrame construction at `deidentifier.py:50-54`. When reading from Google Sheets, column order comes from the header row (`sheets.py:67`). If these orders ever diverge (e.g., schema change, manual column reorder in Sheets), all existing rows will fail to dedup and be re-appended.

**Recommendation:** Sort column names before hashing, or hash key-value pairs explicitly.

### 3.2 Numeric type coercion between pandas and Sheets

**`deidentifier.py:62`** — `str(v)` converts values. Pandas may represent a numeric column as `1234.0` (float) while Google Sheets returns `"1234"` (string). `str(1234.0)` → `"1234.0"` ≠ `"1234"`, so the content hashes won't match, causing duplicate rows on every re-run.

**`sheets.py:68-69`** — Existing rows are read via `get_all_values()` which returns all values as strings. The fresh DataFrame from `pd.read_csv` will have typed columns.

**Impact:** This is likely the most common practical bug. Any sheet with integer-like amounts, counts, or invoice numbers will accumulate duplicates on every run.

**Recommendation:** Normalize numeric strings in `content_hash` — e.g., strip trailing `.0` — or convert all values to strings consistently before hashing.

### 3.3 Content hash uses unsalted SHA-256

**`deidentifier.py:61-63`** — The content hash is not salted, which is fine for dedup (not a security function). However, the `|` delimiter is not escaped. A row with values `["a|b", "c"]` and `["a", "b|c"]` would collide. This is unlikely with real data but is a correctness deficiency.

### 3.4 Race condition on concurrent writes

**`sheets.py:63-89`** — Read-then-write is not atomic. Two concurrent `deid process` invocations against the same target could both read the existing data, compute non-overlapping "new" sets, and both append — creating duplicates. There's no locking mechanism.

---

## 4. Google Sheets API Error Handling and Rate Limits

### 4.1 No retry logic on API errors

**`sheets.py`** — Every `gspread` call (`ws.get_all_values()`, `ws.update()`, `spreadsheet.worksheet()`) can throw `gspread.exceptions.APIError` for transient failures (429 rate limit, 500/503 server errors). There is zero retry logic anywhere in the file.

Google Sheets API quota is 60 reads/min and 60 writes/min per user per project. Processing 5 file types hits at least 10 API calls (2 per type: read + write for data sheet, plus reiden map read/write), not counting the `open_by_key` call. A single run is likely fine, but batch processing or retries could hit limits.

**Recommendation:** Add exponential backoff retry (gspread has `gspread.utils` or use `tenacity`). At minimum, catch `APIError` with status 429 and retry after `Retry-After`.

### 4.2 No batch/bulk API usage

**`sheets.py:81`** — `ws.update(f"A{start_row}", new_rows)` writes all new rows in one call, which is good. But the pattern of `get_all_values()` to read the entire sheet on every run (`sheets.py:63`) will not scale. A sheet with 100k rows will download ~50MB of data per type per run.

**Recommendation:** For large sheets, consider using a content hash column in the sheet itself, or maintain a local index.

### 4.3 Worksheet creation has no error handling

**`sheets.py:27-36`** — `spreadsheet.add_worksheet()` calls could fail if the tab name already exists or the sheet has too many tabs. The only guard is on initial creation (when tabs shouldn't exist yet), but `create_target_sheet` doesn't check for pre-existing sheets with the same name.

### 4.4 No pagination on `get_all_values()`

**`sheets.py:63, 82`** — `get_all_values()` fetches the entire sheet. Google Sheets API has a 10MB response limit. Large datasets will silently truncate or error.

---

## 5. Design Improvements

### 5.1 Separate reiden map from deidentified data (Critical)

As noted in 1.4, the reiden map must not live in the same spreadsheet. Store it locally encrypted or in a separate, restricted-access sheet. This is the fundamental purpose of the tool.

### 5.2 Add a `--dry-run` mode

The CLI has no way to preview what will be written. Add `--dry-run` to show row counts, detected types, and dedup stats without writing to Sheets.

### 5.3 Add input validation on CSV structure

**`cli.py:81`** — `pd.read_csv(fpath)` with no column validation. If a CSV has unexpected columns (renamed, missing, extra), the pipeline will silently produce wrong output or crash with an unhelpful pandas error. Validate against the schema's expected columns immediately after read.

### 5.4 Preprocessor performance

**`preprocessor.py:29-39`** — Nested loop: for each rule, iterates all rows with `df.iterrows()`. For R rules and N rows, this is O(R×N) with Python-level iteration. For large datasets, vectorize with pandas boolean indexing.

### 5.5 Logging over `click.echo`

The tool uses `click.echo` for all output. Add proper `logging` module integration for debug/info/warning levels, especially for the dedup logic where silent skips could hide data issues.

### 5.6 Target config should record schema version

**`config.py:93-99`** — Target configs don't track which schema version was used. If schemas change (columns added/removed), existing sheets will have inconsistent structure. Add a schema hash or version to the target config.

### 5.7 File permissions on sensitive files

No `os.chmod(path, 0o600)` calls anywhere. Both `~/.deid/credentials.json` and `~/.deid/targets/*.yaml` (containing salts) should be created with restrictive permissions.

### 5.8 The `name` column in Contracts schema is ambiguous

**`schemas/contracts.yaml:6-7`** — `name: pass` passes through the contract `name` field. Per PLAN.md, this is a numeric contract ID. But the column name `name` could be confused with a patient name. Consider renaming in output to `contractName` or `contractId` to avoid accidental PHI exposure if the upstream format changes.

---

## Summary of Severity

| # | Finding | Severity |
|---|---------|----------|
| 1.4 | Reiden map in same sheet as deidentified data | **Critical** |
| 1.1 | Salt in plaintext, no file permissions | High |
| 3.2 | Float/int coercion breaks dedup (duplicates every run) | High |
| 1.2 | SHA-256 without key stretching | Medium |
| 2.1 | NaN → "nan" silent hash collision | Medium |
| 3.1 | Column order dependency in content hash | Medium |
| 4.1 | No retry logic on API errors | Medium |
| 1.3 | Overly broad OAuth scope | Medium |
| 2.2 | No Unicode normalization | Low |
| 2.3 | Space normalization inconsistency | Low |
| 3.3 | Delimiter collision in content hash | Low |
| 3.4 | Race condition on concurrent writes | Low |
