# Code Review: deid/

**Reviewer:** Claude (automated)  
**Date:** 2026-02-13  
**Scope:** All files in `deid/` — cli.py, auth.py, config.py, deidentifier.py, preprocessor.py, sheets.py

---

## 1. Bug Risks

### 1.1 NaN/None values silently hash to the string `"nan"`
**File:** `deidentifier.py:14-17` (`_normalize`) and `:20-23` (`_hash_value`)

`_normalize` calls `str(value)` — if `value` is `float('nan')` (pandas NaN), it becomes `"nan"`, which then hashes to a deterministic value. Every patient with a missing name hashes to the **same patientId**, collapsing all missing-name records into one identity.

**Fix:**
```python
def _hash_value(salt: str, value: str) -> str | None:
    normalized = _normalize(value)
    if normalized in ("nan", ""):
        return None  # or raise ValueError("Cannot hash empty/NaN identity")
    return hashlib.sha256((salt + normalized).encode("utf-8")).hexdigest()
```
Then handle `None` patient IDs downstream (skip row, log warning, etc.).

### 1.2 Combined identity fields with partial NaN
**File:** `deidentifier.py:42-45`

When `identity_source` is a list (e.g. `["firstName", "lastName"]`), if one field is NaN, `str(row.get(col, ""))` yields `"nan"`, producing identities like `"John nan"`. These hash differently from `"John Smith"` but are nonsensical.

**Fix:**
```python
def compute_name(row):
    parts = []
    for col in identity_source:
        val = row.get(col, "")
        if pd.isna(val) or str(val).strip() == "":
            raise ValueError(f"Missing identity field '{col}' at index {row.name}")
        parts.append(str(val).strip())
    return " ".join(parts)
```

### 1.3 Type mismatch in content_hash dedup
**File:** `sheets.py:64-66` and `deidentifier.py:72-76`

`content_hash` converts all values via `str(v)`. Data from Google Sheets arrives as strings (`"123.45"`), but fresh DataFrame columns may be `float` or `int`. The `str()` representations can differ:
- pandas float `1234.0` → `"1234.0"` vs Sheets string `"1234"` → `"1234"` — **different hashes, dedup fails**.

**Fix:** Normalize numeric representations in `content_hash`:
```python
def content_hash(row: pd.Series) -> str:
    def norm(v):
        if pd.isna(v):
            return ""
        s = str(v).strip()
        # Normalize "1234.0" → "1234" to match Sheets string format
        try:
            f = float(s)
            if f == int(f):
                return str(int(f))
            return s
        except (ValueError, OverflowError):
            return s
    values = "|".join(norm(v) for v in row.values)
    return hashlib.sha256(values.encode("utf-8")).hexdigest()
```

### 1.4 `df[col]` KeyError when schema references missing column
**File:** `deidentifier.py:48`

`df[identity_source].astype(str)` raises an unhelpful `KeyError` if the column doesn't exist. Same at line 55: `df[col]` for `"pass"` columns.

**Fix:** Validate columns upfront:
```python
required = identity_source if isinstance(identity_source, list) else [identity_source]
missing = [c for c in required if c not in df.columns]
if missing:
    raise ValueError(f"Schema requires columns missing from data: {missing}")
```

---

## 2. pandas Anti-Patterns

### 2.1 `iterrows` in preprocessor — O(rows × rules) with Python-speed loops
**File:** `preprocessor.py:30-40`

Every rule iterates every row with `df.iterrows()`. For large files this is extremely slow.

**Fix:** Use vectorized boolean masking:
```python
for rule in rules:
    match_spec = rule.get("match", {})
    set_spec = rule.get("set", {})
    append_spec = rule.get("append", {})

    mask = pd.Series(True, index=df.index)
    for col, expected in match_spec.items():
        mask &= df[col].astype(str).str.strip().str.lower() == str(expected).strip().lower()

    for col, val in set_spec.items():
        df.loc[mask, col] = val
    for col, val in append_spec.items():
        df.loc[mask, col] = df.loc[mask, col].fillna("").astype(str) + val
```

### 2.2 `iterrows` in sheets.py dedup loop
**File:** `sheets.py:62-66`

Same pattern: iterating all rows to compute content hashes. Use `.apply()` instead:
```python
hashes = df.apply(content_hash, axis=1)
mask = ~hashes.isin(existing_hashes)
new_rows = df[mask].values.tolist()
existing_hashes.update(hashes[mask])
```

### 2.3 `df.apply(compute_name, axis=1)` is slow for simple string concat
**File:** `deidentifier.py:41-44`

**Fix:** Replace with vectorized concat:
```python
original_names = df[identity_source[0]].astype(str).str.strip()
for col in identity_source[1:]:
    original_names = original_names + " " + df[col].astype(str).str.strip()
```

### 2.4 In-place modification with ambiguous copy semantics
**File:** `preprocessor.py:24` — docstring says "modified in place and returned"

The function modifies `df` in place via `df.at[idx, col]`, which can trigger `SettingWithCopyWarning` if `df` is a slice. The caller in `cli.py:93` reassigns `combined = preprocess(combined, ...)`, which is fine, but the in-place contract is fragile.

**Fix:** Add `.copy()` at the start if mutation is intended:
```python
def preprocess(df: pd.DataFrame, sheet_type: str) -> pd.DataFrame:
    df = df.copy()
    ...
```

---

## 3. Error Handling Gaps

### 3.1 Credential refresh failure is unhandled
**File:** `auth.py:33`

`creds.refresh(Request())` can raise `google.auth.exceptions.RefreshError` (revoked token, network error). It's not caught, producing an ugly traceback.

**Fix:**
```python
try:
    creds.refresh(Request())
except google.auth.exceptions.RefreshError:
    # Token revoked or expired beyond refresh — re-run full auth flow
    creds = None
if creds is None or not creds.valid:
    # ... run InstalledAppFlow ...
```

### 3.2 `yaml.safe_load` returns `None` for empty files — unchecked
**File:** `config.py:73` (`load_target`)

If the YAML file is empty or contains only comments, `yaml.safe_load` returns `None`. The caller then does `config["salt"]` → `TypeError: 'NoneType' object is not subscriptable`.

**Fix:**
```python
def load_target(name: str) -> dict:
    path = target_path(name)
    if not path.exists():
        raise FileNotFoundError(f"Target '{name}' not found at {path}")
    with open(path) as f:
        data = yaml.safe_load(f)
    if not data:
        raise ValueError(f"Target config at {path} is empty or invalid")
    return data
```

### 3.3 No error handling on `pd.read_csv`
**File:** `cli.py:89`

Malformed CSVs, encoding errors, or empty files will crash with an unhelpful pandas error.

**Fix:**
```python
try:
    df = pd.read_csv(fpath)
except Exception as e:
    click.echo(f"  ✗ Failed to read {fpath.name}: {e}", err=True)
    continue
```

### 3.4 Google Sheets API errors not caught in `write_to_sheet`
**File:** `sheets.py:47-48, 70-71`

`ws.update()` and `ws.get_all_values()` can raise `gspread.exceptions.APIError` (quota, permission, network). These propagate as raw exceptions.

**Fix:** Wrap API calls with retry/catch:
```python
try:
    ws.update(f"A{start_row}", new_rows)
except gspread.exceptions.APIError as e:
    raise click.ClickException(f"Failed to write to {tab_name}: {e}")
```

### 3.5 Silent skip on unknown file type — easy to miss
**File:** `cli.py:82-84`

Unknown files are logged to stderr but processing continues. If a user mistypes a filename, all files might be skipped with only the generic "No recognized CSV files" message.

**Fix:** List unrecognized files explicitly in the final error:
```python
if not typed_files:
    skipped = [Path(f).name for f in files]
    click.echo(f"No recognized CSV files. Skipped: {', '.join(skipped)}", err=True)
    sys.exit(1)
```

---

## 4. Additional Code Quality Issues

### 4.1 `reiden_entries` built with Python loop + set — use DataFrame dedup
**File:** `deidentifier.py:51-58`

The `zip` + `set` loop is fine functionally but duplicates logic already available via `pd.DataFrame.drop_duplicates`.

### 4.2 `row.values.tolist()` may include NaN as `float('nan')`
**File:** `sheets.py:65`

Google Sheets API rejects `NaN` in JSON. `float('nan')` is not valid JSON.

**Fix:**
```python
new_rows.append([("" if pd.isna(v) else v) for v in row.values.tolist()])
```

### 4.3 Hardcoded worksheet size
**File:** `sheets.py:22, 50, 76`

`rows=1000` limits sheets. If data exceeds 1000 rows, appends silently fail or error.

**Fix:** Use `rows=1` for creation (auto-expands) or check row count before appending.

---

## 5. Test Recommendations

| Priority | Test | Why |
|----------|------|-----|
| **P0** | `test_hash_nan_identity` — pass `NaN`, `None`, `""` as name fields to `deidentify()` | Validates §1.1 — currently all NaN names collide |
| **P0** | `test_content_hash_type_consistency` — hash a row with `int(1234)` vs `"1234"` | Validates §1.3 — dedup depends on this |
| **P0** | `test_deidentify_missing_column` — schema references a column not in the DataFrame | Validates §1.4 |
| **P1** | `test_preprocess_vectorized_equivalence` — compare iterrows vs vectorized output | Validates §2.1 refactor correctness |
| **P1** | `test_combined_identity_partial_nan` — one of firstName/lastName is NaN | Validates §1.2 |
| **P1** | `test_write_nan_to_sheets` — DataFrame with NaN passed to `write_to_sheet` | Validates §4.2 |
| **P2** | `test_empty_yaml_target` — load a target from an empty YAML file | Validates §3.2 |
| **P2** | `test_detect_file_type_edge_cases` — filenames with extra dots, spaces, unicode | Config robustness |
| **P2** | `test_dedup_across_runs` — simulate write, read-back, write again | End-to-end dedup consistency |

### Recommended test structure:
```
tests/
  test_deidentifier.py   # unit tests for hashing, normalize, deidentify()
  test_preprocessor.py   # rule application, edge cases
  test_config.py         # file detection, target CRUD
  test_sheets.py         # mock gspread, test dedup logic
  conftest.py            # fixtures: sample DataFrames, schemas, salts
```

---

## Summary

| Category | Critical | Moderate | Low |
|----------|----------|----------|-----|
| Bug risks | 3 (§1.1, §1.3, §4.2) | 2 (§1.2, §1.4) | — |
| Performance | — | 2 (§2.1, §2.2) | 2 (§2.3, §2.4) |
| Error handling | — | 3 (§3.1, §3.3, §3.4) | 2 (§3.2, §3.5) |

**Top 3 actions:**
1. Fix NaN handling in `_hash_value` and `content_hash` — data corruption risk
2. Add NaN→empty coercion before writing to Sheets — API errors in production
3. Add the P0 tests — these catch regressions on the above
