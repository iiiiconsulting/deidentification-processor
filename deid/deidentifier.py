"""Deidentifier: hashes, strips, or passes columns based on schema configuration.

Hash function: sha256(salt + normalize(value)) — full 64-char hex.
Normalization: trim, lowercase, collapse double spaces to single.

For Customers: firstName + ' ' + lastName → combined patientId.
All other sheets: single name column → patientId.
"""

import hashlib
import re
from datetime import datetime

import pandas as pd

from .config import load_schema


def _normalize(value: str) -> str:
    """Normalize a value for hashing: trim, lowercase, collapse spaces."""
    s = str(value).strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _hash_value(salt: str, value: str) -> str:
    """Compute SHA-256 hash of salt + normalized value. Returns full 64-char hex."""
    normalized = _normalize(value)
    return hashlib.sha256((salt + normalized).encode("utf-8")).hexdigest()


def deidentify(df: pd.DataFrame, sheet_type: str, salt: str) -> tuple[pd.DataFrame, list[dict]]:
    """Deidentify a DataFrame according to its schema.

    Args:
        df: Pre-processed DataFrame.
        sheet_type: Internal type key.
        salt: Target-specific salt for hashing.

    Returns:
        Tuple of (deidentified DataFrame, list of reiden map entries).
    """
    schema = load_schema(sheet_type)
    columns = schema["columns"]
    identity = schema["identity"]
    identity_source = identity["source"]

    reiden_entries = []

    # Compute patientId
    if isinstance(identity_source, list):
        # Combined fields (Customers: firstName + lastName)
        def compute_name(row):
            parts = [str(row.get(col, "")).strip() for col in identity_source]
            return " ".join(parts)

        original_names = df.apply(compute_name, axis=1)
    else:
        original_names = df[identity_source].astype(str).str.strip()

    patient_ids = original_names.apply(lambda name: _hash_value(salt, name))

    # Build reiden map entries (unique names only, tracked by set)
    seen_ids = set()
    for pid, orig_name in zip(patient_ids, original_names):
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
        # (patientId replaces hash columns; strip columns are dropped)

    result = pd.DataFrame(output_cols)
    return result, reiden_entries


def content_hash(row: pd.Series) -> str:
    """Compute a content hash for dedup — hash of all column values in the row.

    All values are coerced to strings for consistency between fresh DataFrames
    and data read back from Google Sheets (which is always strings).
    """
    values = "|".join(str(v).strip() for v in row.values)
    return hashlib.sha256(values.encode("utf-8")).hexdigest()
