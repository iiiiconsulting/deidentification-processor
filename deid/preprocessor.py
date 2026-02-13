"""Pre-processor: applies ordered transformation rules to a DataFrame before deidentification.

DSL:
  - match: AND across columns (case-insensitive string equality)
  - set: overwrite column value
  - append: append to column value

Rules are processed in order; earlier rules affect later matches.
"""

import pandas as pd

from .config import load_rules


def _matches_row(row: pd.Series, match_spec: dict) -> bool:
    """Check if a row matches all conditions in a match spec (case-insensitive)."""
    for col, expected in match_spec.items():
        val = str(row.get(col, "")).strip().lower()
        if val != str(expected).strip().lower():
            return False
    return True


def preprocess(df: pd.DataFrame, sheet_type: str) -> pd.DataFrame:
    """Apply pre-processing rules to a DataFrame.

    Args:
        df: Input DataFrame (modified in place and returned).
        sheet_type: Internal type key (e.g. 'product_sales').

    Returns:
        The modified DataFrame.
    """
    rules = load_rules(sheet_type)
    if not rules:
        return df

    for rule in rules:
        match_spec = rule.get("match", {})
        set_spec = rule.get("set", {})
        append_spec = rule.get("append", {})

        for idx, row in df.iterrows():
            if _matches_row(row, match_spec):
                for col, val in set_spec.items():
                    df.at[idx, col] = val
                for col, val in append_spec.items():
                    existing = str(df.at[idx, col]) if pd.notna(df.at[idx, col]) else ""
                    df.at[idx, col] = existing + val

    return df
