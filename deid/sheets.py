"""Google Sheets integration: create targets, write data with dedup."""

import math

import click
import gspread
import pandas as pd

from .auth import authorize_gspread
from .config import REIDEN_TAB_NAME, SHEET_TAB_NAMES, create_target_config, save_target
from .deidentifier import content_hash

REIDEN_HEADERS = ["patientId", "originalName", "source", "dateAdded"]


def _sanitize_row(row: list) -> list:
    """Replace NaN/None values with empty string for Sheets API compatibility."""
    result = []
    for v in row:
        if v is None:
            result.append("")
        elif isinstance(v, float) and math.isnan(v):
            result.append("")
        else:
            result.append(v)
    return result


def create_target_sheet(name: str) -> dict:
    """Create TWO Google Sheets: one for data (5 tabs), one for reiden map.

    Returns the target config dict (also saved to disk).
    """
    gc = authorize_gspread()

    # Create data spreadsheet with 5 tabs
    data_spreadsheet = gc.create(f"Deid — {name}")
    tab_keys = list(SHEET_TAB_NAMES.keys())

    first_ws = data_spreadsheet.sheet1
    first_ws.update_title(SHEET_TAB_NAMES[tab_keys[0]])

    for tab_key in tab_keys[1:]:
        data_spreadsheet.add_worksheet(
            title=SHEET_TAB_NAMES[tab_key], rows=1, cols=26
        )

    # Create separate reiden map spreadsheet
    reiden_spreadsheet = gc.create(f"Deid — {name} — ReidentificationMap")
    reiden_ws = reiden_spreadsheet.sheet1
    reiden_ws.update_title(REIDEN_TAB_NAME)
    reiden_ws.update("A1", [REIDEN_HEADERS])

    config = create_target_config(name, data_spreadsheet.id, reiden_spreadsheet.id)
    save_target(name, config)

    click.echo(f"Created data sheet: {data_spreadsheet.url}")
    click.echo(f"Created reiden map sheet: {reiden_spreadsheet.url}")
    click.echo(f"Data Spreadsheet ID: {data_spreadsheet.id}")
    click.echo(f"Reiden Spreadsheet ID: {reiden_spreadsheet.id}")
    return config


def write_to_sheet(
    spreadsheet_id: str,
    reiden_spreadsheet_id: str,
    sheet_type: str,
    df: pd.DataFrame,
    reiden_entries: list[dict],
    *,
    dry_run: bool = False,
):
    """Write deidentified data to the appropriate tab with dedup.

    Also appends new reiden map entries to the separate reiden spreadsheet.
    """
    if dry_run:
        click.echo(f"  [DRY RUN] {SHEET_TAB_NAMES[sheet_type]}: {len(df)} rows would be written")
        click.echo(f"  [DRY RUN] ReidentificationMap: {len(reiden_entries)} entries would be added")
        return

    gc = authorize_gspread()

    # --- Write data sheet ---
    spreadsheet = gc.open_by_key(spreadsheet_id)
    tab_name = SHEET_TAB_NAMES[sheet_type]

    try:
        ws = spreadsheet.worksheet(tab_name)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=tab_name, rows=1, cols=26)

    existing_data = ws.get_all_values()

    if not existing_data:
        headers = df.columns.tolist()
        ws.update("A1", [headers])
        existing_hashes = set()
    else:
        headers = existing_data[0]
        existing_hashes = set()
        for row in existing_data[1:]:
            row_series = pd.Series(row, index=headers)
            existing_hashes.add(content_hash(row_series))

    new_rows = []
    for _, row in df.iterrows():
        h = content_hash(row)
        if h not in existing_hashes:
            new_rows.append(_sanitize_row(row.values.tolist()))
            existing_hashes.add(h)

    if new_rows:
        start_row = len(existing_data) + 1 if existing_data else 2
        ws.update(f"A{start_row}", new_rows)
        click.echo(f"  {tab_name}: wrote {len(new_rows)} new rows ({len(df) - len(new_rows)} duplicates skipped)")
    else:
        click.echo(f"  {tab_name}: no new rows (all duplicates)")

    # --- Write reiden map to separate spreadsheet ---
    reiden_spreadsheet = gc.open_by_key(reiden_spreadsheet_id)

    try:
        reiden_ws = reiden_spreadsheet.worksheet(REIDEN_TAB_NAME)
    except gspread.WorksheetNotFound:
        reiden_ws = reiden_spreadsheet.add_worksheet(title=REIDEN_TAB_NAME, rows=1, cols=10)

    reiden_data = reiden_ws.get_all_values()

    if not reiden_data:
        reiden_ws.update("A1", [REIDEN_HEADERS])
        existing_patient_ids = set()
    else:
        existing_patient_ids = set()
        for row in reiden_data[1:]:
            if len(row) >= 3:
                existing_patient_ids.add((row[0], row[2]))

    new_reiden_rows = []
    for entry in reiden_entries:
        key = (entry["patientId"], entry["source"])
        if key not in existing_patient_ids:
            new_reiden_rows.append(_sanitize_row([
                entry["patientId"],
                entry["originalName"],
                entry["source"],
                entry["dateAdded"],
            ]))
            existing_patient_ids.add(key)

    if new_reiden_rows:
        start_row = len(reiden_data) + 1 if reiden_data else 2
        reiden_ws.update(f"A{start_row}", new_reiden_rows)
        click.echo(f"  ReidentificationMap: added {len(new_reiden_rows)} new mappings")
