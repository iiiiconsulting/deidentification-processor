"""Deidentifier: hashes, strips, or passes columns based on schema configuration.

Hash function: sha256(salt + normalize(value)) — full 64-char hex.
Normalization: trim, lowercase, collapse double spaces to single, NFKC unicode.

For Customers: firstName + ' ' + lastName → combined patientId.
All other sheets: single name column → patientId.
"""

import hashlib
import math
import re
import unicodedata
from datetime import datetime

import click
import pandas as pd

from .config import load_schema


def _normalize(value: str) -> str:
    """Normalize a value for hashing: NFKC unicode, trim, lowercase, collapse spaces."""
    s = str(value).strip().lower()
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _is_nan(value) -> bool:
    """Check if a value is NaN or empty-ish."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if str(value).strip().lower() == "nan":
        return True
    return False


def _hash_value(salt: str, value: str) -> str | None:
    """Compute SHA-256 hash of salt + normalized value. Returns None for NaN/empty."""
    if _is_nan(value):
        return None
    normalized = _normalize(value)
    if not normalized:
        return None
    return hashlib.sha256((salt + normalized).encode("utf-8")).hexdigest()


def _normalize_cell(v) -> str:
    """Normalize a cell value for content hashing: NaN→'', floats that are ints→int str."""
    if _is_nan(v):
        return ""
    if isinstance(v, float):
        if v == int(v):
            return str(int(v))
        return str(v)
    return str(v).strip()


def deidentify(df: pd.DataFrame, sheet_type: str, salt: str, *, dry_run: bool = False) -> tuple[pd.DataFrame, list[dict]]:
    """Deidentify a DataFrame according to its schema.

    Args:
        df: Pre-processed DataFrame.
        sheet_type: Internal type key.
        salt: Target-specific salt for hashing.
        dry_run: If True, process but don't write (caller handles).

    Returns:
        Tuple of (deidentified DataFrame, list of reiden map entries).
    """
    schema = load_schema(sheet_type)
    columns = schema["columns"]
    identity = schema["identity"]
    identity_source = identity["source"]

    # Validate required columns exist
    required_cols = set()
    if isinstance(identity_source, list):
        required_cols.update(identity_source)
    else:
        required_cols.add(identity_source)
    for col, action in columns.items():
        if action == "pass" or action == "hash":
            required_cols.add(col)
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns for {sheet_type}: {missing}")

    reiden_entries = []

    # Compute patientId
    if isinstance(identity_source, list):
        # Combined fields (Customers: firstName + lastName)
        def compute_name(row):
            parts = []
            for col in identity_source:
                v = row.get(col, "")
                if _is_nan(v):
                    v = ""
                else:
                    v = str(v).strip()
                parts.append(v)
            return " ".join(parts).strip()

        original_names = df.apply(compute_name, axis=1)
    else:
        original_names = df[identity_source].astype(str).str.strip()

    # Identify rows with missing identity fields and skip them
    skip_mask = original_names.apply(lambda n: _is_nan(n) or n.strip() == "")
    if skip_mask.any():
        count = skip_mask.sum()
        click.echo(f"  ⚠ Skipping {count} row(s) with missing identity fields in {sheet_type}")

    patient_ids = original_names.apply(lambda name: _hash_value(salt, name))

    # Build reiden map entries (unique names only, tracked by set)
    seen_ids = set()
    for pid, orig_name, skip in zip(patient_ids, original_names, skip_mask):
        if skip or pid is None:
            continue
        if pid not in seen_ids:
            seen_ids.add(pid)
            reiden_entries.append({
                "patientId": pid,
                "originalName": orig_name,
                "source": sheet_type,
                "dateAdded": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })

    # Build output DataFrame
    output_cols = {"patientId": patient_ids}
    for col, action in columns.items():
        if action == "pass":
            if col in df.columns:
                output_cols[col] = df[col]
        # hash and strip columns are excluded from output

    result = pd.DataFrame(output_cols)

    # Drop rows with missing identity
    result = result[~skip_mask].reset_index(drop=True)

    return result, reiden_entries


def content_hash(row: pd.Series) -> str:
    """Compute a content hash for dedup — hash of all column values in the row.

    Columns are sorted for order-independence. Values are normalized:
    NaN→'', float ints→int strings.
    """
    sorted_keys = sorted(row.index)
    values = "|".join(_normalize_cell(row[k]) for k in sorted_keys)
    return hashlib.sha256(values.encode("utf-8")).hexdigest()
