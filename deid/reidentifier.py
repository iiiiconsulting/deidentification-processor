"""Reidentifier: reverse deidentification using the reiden map.

Reads the ReidentificationMap from Google Sheets and replaces hashed
patientId values with their original names.
"""

from datetime import datetime
from pathlib import Path

import click
import gspread
import pandas as pd

from .auth import authorize_gspread
from .config import REIDEN_TAB_NAME, SHEET_TAB_NAMES
from .sheets import REIDEN_HEADERS


def _load_reiden_map(reiden_spreadsheet_id: str) -> dict[str, str]:
    """Load the reiden map from Google Sheets.

    Returns:
        Dict mapping patientId (hash) → originalName.
    """
    gc = authorize_gspread()
    spreadsheet = gc.open_by_key(reiden_spreadsheet_id)
    ws = spreadsheet.worksheet(REIDEN_TAB_NAME)
    data = ws.get_all_values()

    if not data or len(data) <= 1:
        return {}

    headers = data[0]
    pid_idx = headers.index("patientId") if "patientId" in headers else 0
    name_idx = headers.index("originalName") if "originalName" in headers else 1

    mapping = {}
    for row in data[1:]:
        if len(row) > max(pid_idx, name_idx):
            pid = row[pid_idx].strip()
            name = row[name_idx].strip()
            if pid and name:
                mapping[pid] = name

    return mapping


def reidentify_file(
    input_path: Path,
    reiden_spreadsheet_id: str,
) -> tuple[pd.DataFrame, dict]:
    """Reidentify a deidentified CSV file.

    Args:
        input_path: Path to the deidentified CSV.
        reiden_spreadsheet_id: Google Sheet ID containing the reiden map.

    Returns:
        Tuple of (reidentified DataFrame, stats dict).
    """
    click.echo(f"Loading reiden map...")
    mapping = _load_reiden_map(reiden_spreadsheet_id)
    click.echo(f"  Loaded {len(mapping)} patient mappings")

    df = pd.read_csv(input_path)

    if "patientId" not in df.columns:
        raise ValueError("Input CSV has no 'patientId' column")

    # Replace patientId hashes with original names
    matched = 0
    unmatched = 0
    unmatched_ids = set()

    def replace_id(pid):
        nonlocal matched, unmatched
        pid_str = str(pid).strip()
        if pid_str in mapping:
            matched += 1
            return mapping[pid_str]
        else:
            unmatched += 1
            unmatched_ids.add(pid_str)
            return pid_str  # Keep hash if not found

    df["patientId"] = df["patientId"].apply(replace_id)

    # Rename column to reflect reidentification
    df = df.rename(columns={"patientId": "patientName"})

    # Remove _contentHash column if present
    if "_contentHash" in df.columns:
        df = df.drop(columns=["_contentHash"])

    if unmatched_ids and len(unmatched_ids) <= 10:
        for uid in list(unmatched_ids)[:10]:
            click.echo(f"  ⚠ Unmatched ID: {uid[:16]}...")

    stats = {
        "total": matched + unmatched,
        "matched": matched,
        "unmatched": unmatched,
    }

    return df, stats


def reidentify_sheets(
    target_config: dict,
    *,
    tab_name: str | None = None,
) -> str:
    """Reidentify data in Google Sheets by creating a new reidentified spreadsheet.

    Args:
        target_config: Target configuration dict.
        tab_name: Specific tab to reidentify, or None for all.

    Returns:
        URL of the new reidentified spreadsheet.
    """
    name = target_config["name"]
    spreadsheet_id = target_config["spreadsheet_id"]
    reiden_spreadsheet_id = target_config["reiden_spreadsheet_id"]

    click.echo(f"Loading reiden map...")
    mapping = _load_reiden_map(reiden_spreadsheet_id)
    click.echo(f"  Loaded {len(mapping)} patient mappings")

    gc = authorize_gspread()
    source = gc.open_by_key(spreadsheet_id)

    # Create new spreadsheet for reidentified data
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_spreadsheet = gc.create(f"Deid — {name} — Reidentified ({timestamp})")

    tabs_to_process = []
    if tab_name:
        tabs_to_process.append(tab_name)
    else:
        tabs_to_process = [SHEET_TAB_NAMES[k] for k in SHEET_TAB_NAMES]

    first_tab = True
    total_matched = 0
    total_unmatched = 0

    for tab in tabs_to_process:
        try:
            ws = source.worksheet(tab)
        except gspread.WorksheetNotFound:
            click.echo(f"  Skipping {tab} (not found)")
            continue

        data = ws.get_all_values()
        if not data or len(data) <= 1:
            click.echo(f"  Skipping {tab} (empty)")
            continue

        headers = data[0]
        rows = data[1:]

        # Find patientId and _contentHash columns
        pid_col = headers.index("patientId") if "patientId" in headers else None
        hash_col = headers.index("_contentHash") if "_contentHash" in headers else None

        if pid_col is None:
            click.echo(f"  Skipping {tab} (no patientId column)")
            continue

        # Build new headers (rename patientId, remove _contentHash)
        new_headers = []
        keep_cols = []
        for i, h in enumerate(headers):
            if i == hash_col:
                continue  # Skip content hash
            if i == pid_col:
                new_headers.append("patientName")
            else:
                new_headers.append(h)
            keep_cols.append(i)

        # Build new rows with reidentified names
        new_rows = []
        tab_matched = 0
        tab_unmatched = 0
        for row in rows:
            new_row = []
            for i in keep_cols:
                val = row[i] if i < len(row) else ""
                if i == pid_col:
                    if val in mapping:
                        val = mapping[val]
                        tab_matched += 1
                    else:
                        tab_unmatched += 1
                new_row.append(val)
            new_rows.append(new_row)

        total_matched += tab_matched
        total_unmatched += tab_unmatched

        # Create/reuse worksheet
        if first_tab:
            out_ws = new_spreadsheet.sheet1
            out_ws.update_title(tab)
            first_tab = False
        else:
            out_ws = new_spreadsheet.add_worksheet(title=tab, rows=1, cols=len(new_headers))

        # Write data
        out_ws.resize(rows=len(new_rows) + 1, cols=len(new_headers))
        out_ws.update("A1", [new_headers] + new_rows)

        click.echo(f"  {tab}: {tab_matched} matched, {tab_unmatched} unmatched, {len(new_rows)} rows")

    click.echo(f"\nTotals: {total_matched} matched, {total_unmatched} unmatched")
    return new_spreadsheet.url
