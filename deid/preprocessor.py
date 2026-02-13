"""Pre-processor: applies ordered transformation rules to a DataFrame before deidentification.

DSL:
  - match: AND across columns (case-insensitive string equality)
  - set: overwrite column value
  - append: append to column value

Rules are processed in order; earlier rules affect later matches.
"""

import pandas as pd

from .config import load_rules


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

        # Build boolean mask using vectorized operations
        mask = pd.Series(True, index=df.index)
        for col, expected in match_spec.items():
            expected_lower = str(expected).strip().lower()
            mask = mask & (df[col].astype(str).str.strip().str.lower() == expected_lower)

        if not mask.any():
            continue

        for col, val in set_spec.items():
            df.loc[mask, col] = val

        for col, val in append_spec.items():
            df.loc[mask, col] = df.loc[mask, col].fillna("").astype(str) + val

    return df
