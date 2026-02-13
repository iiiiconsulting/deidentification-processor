"""Google Sheets integration: create targets, write data with dedup."""

import click
import gspread
import pandas as pd

from .auth import authorize_gspread
from .config import SHEET_TAB_NAMES, create_target_config, save_target
from .deidentifier import content_hash

REIDEN_HEADERS = ["patientId", "originalName", "source", "dateAdded"]


def create_target_sheet(name: str) -> dict:
    """Create a new Google Sheet with tabs for all export types + reiden map.

    Returns the target config dict (also saved to disk).
    """
    gc = authorize_gspread()
    spreadsheet = gc.create(f"Deid — {name}")

    # Rename the default sheet and create additional tabs
    tab_keys = list(SHEET_TAB_NAMES.keys())
    worksheets = {}

    # Rename first sheet
    first_ws = spreadsheet.sheet1
    first_tab = tab_keys[0]
    first_ws.update_title(SHEET_TAB_NAMES[first_tab])
    worksheets[first_tab] = first_ws

    # Create remaining tabs
    for tab_key in tab_keys[1:]:
        ws = spreadsheet.add_worksheet(
            title=SHEET_TAB_NAMES[tab_key], rows=1000, cols=26
        )
        worksheets[tab_key] = ws

    config = create_target_config(name, spreadsheet.id)
    save_target(name, config)

    click.echo(f"Created Google Sheet: {spreadsheet.url}")
    click.echo(f"Spreadsheet ID: {spreadsheet.id}")
    return config


def write_to_sheet(
    spreadsheet_id: str,
    sheet_type: str,
    df: pd.DataFrame,
    reiden_entries: list[dict],
):
    """Write deidentified data to the appropriate tab with dedup.

    Also appends new reiden map entries.
    """
    gc = authorize_gspread()
    spreadsheet = gc.open_by_key(spreadsheet_id)

    tab_name = SHEET_TAB_NAMES[sheet_type]
    reiden_tab_name = SHEET_TAB_NAMES["reiden_map"]

    # --- Write data sheet ---
    try:
        ws = spreadsheet.worksheet(tab_name)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=tab_name, rows=1000, cols=26)

    existing_data = ws.get_all_values()

    if not existing_data:
        # Empty sheet — write headers + all data
        headers = df.columns.tolist()
        ws.update("A1", [headers])
        existing_hashes = set()
    else:
        headers = existing_data[0]
        # Compute content hashes of existing rows for dedup
        existing_hashes = set()
        for row in existing_data[1:]:
            row_series = pd.Series(row, index=headers)
            existing_hashes.add(content_hash(row_series))

    # Filter new rows by content hash
    new_rows = []
    for _, row in df.iterrows():
        h = content_hash(row)
        if h not in existing_hashes:
            new_rows.append(row.values.tolist())
            existing_hashes.add(h)

    if new_rows:
        # Append below existing data
        start_row = len(existing_data) + 1 if existing_data else 2
        ws.update(f"A{start_row}", new_rows)
        click.echo(f"  {tab_name}: wrote {len(new_rows)} new rows ({len(df) - len(new_rows)} duplicates skipped)")
    else:
        click.echo(f"  {tab_name}: no new rows (all duplicates)")

    # --- Write reiden map ---
    try:
        reiden_ws = spreadsheet.worksheet(reiden_tab_name)
    except gspread.WorksheetNotFound:
        reiden_ws = spreadsheet.add_worksheet(title=reiden_tab_name, rows=1000, cols=10)

    reiden_data = reiden_ws.get_all_values()

    if not reiden_data:
        reiden_ws.update("A1", [REIDEN_HEADERS])
        existing_patient_ids = set()
    else:
        # Track existing patientId+source combos to avoid duplicate mappings
        existing_patient_ids = set()
        for row in reiden_data[1:]:
            if len(row) >= 3:
                existing_patient_ids.add((row[0], row[2]))  # patientId, source

    new_reiden_rows = []
    for entry in reiden_entries:
        key = (entry["patientId"], entry["source"])
        if key not in existing_patient_ids:
            new_reiden_rows.append([
                entry["patientId"],
                entry["originalName"],
                entry["source"],
                entry["dateAdded"],
            ])
            existing_patient_ids.add(key)

    if new_reiden_rows:
        start_row = len(reiden_data) + 1 if reiden_data else 2
        reiden_ws.update(f"A{start_row}", new_reiden_rows)
        click.echo(f"  ReidentificationMap: added {len(new_reiden_rows)} new mappings")
