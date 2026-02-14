"""Google Sheets integration: create targets, write data with dedup."""

import math
import secrets

import click
import gspread
import pandas as pd

from .auth import authorize_gspread
from .config import REIDEN_TAB_NAME, SHEET_TAB_NAMES, create_target_config, save_target
from .deidentifier import content_hash

CONFIG_TAB_NAME = "Config"

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

    # Add Config tab with salt
    salt = secrets.token_hex(32)
    config_ws = reiden_spreadsheet.add_worksheet(title=CONFIG_TAB_NAME, rows=2, cols=2)
    config_ws.update("A1", [["salt", salt]])

    config = create_target_config(name, data_spreadsheet.id, reiden_spreadsheet.id)
    save_target(name, config)

    click.echo(f"Created data sheet: {data_spreadsheet.url}")
    click.echo(f"Created reiden map sheet: {reiden_spreadsheet.url}")
    click.echo(f"Data Spreadsheet ID: {data_spreadsheet.id}")
    click.echo(f"Reiden Spreadsheet ID: {reiden_spreadsheet.id}")
    return config


def get_salt(reiden_spreadsheet_id: str) -> str:
    """Read the salt from the Config tab of the reiden spreadsheet."""
    gc = authorize_gspread()
    spreadsheet = gc.open_by_key(reiden_spreadsheet_id)
    config_ws = spreadsheet.worksheet(CONFIG_TAB_NAME)
    salt = config_ws.acell("B1").value
    if not salt:
        raise ValueError("Salt not found in reiden spreadsheet Config tab (B1 is empty)")
    return salt


def write_to_sheet(
    spreadsheet_id: str,
    reiden_spreadsheet_id: str,
    sheet_type: str,
    df: pd.DataFrame,
    reiden_entries: list[dict],
    *,
    dry_run: bool = False,
):
    """Write deidentified data to the appropriate tab with dedup."""
    if dry_run:
        click.echo(f"  [DRY RUN] {SHEET_TAB_NAMES[sheet_type]}: {len(df)} rows would be written")
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
        needed_rows = start_row + len(new_rows) - 1
        if ws.row_count < needed_rows:
            ws.resize(rows=needed_rows)
        ws.update(f"A{start_row}", new_rows)
        click.echo(f"  {tab_name}: wrote {len(new_rows)} new rows ({len(df) - len(new_rows)} duplicates skipped)")
    else:
        click.echo(f"  {tab_name}: no new rows (all duplicates)")


def write_reiden_map(
    reiden_spreadsheet_id: str,
    reiden_entries: list[dict],
    *,
    dry_run: bool = False,
):
    """Write globally-deduped reiden map entries to the reiden spreadsheet.

    Deduplicates by patientId only — same patient across multiple sheet types
    gets one entry.
    """
    if dry_run:
        click.echo(f"\n  [DRY RUN] ReidentificationMap: {len(reiden_entries)} unique patients would be mapped")
        return

    gc = authorize_gspread()
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
            if len(row) >= 1:
                existing_patient_ids.add(row[0])  # patientId only

    new_reiden_rows = []
    for entry in reiden_entries:
        pid = entry["patientId"]
        if pid not in existing_patient_ids:
            new_reiden_rows.append(_sanitize_row([
                entry["patientId"],
                entry["originalName"],
                entry["source"],
                entry["dateAdded"],
            ]))
            existing_patient_ids.add(pid)

    if new_reiden_rows:
        start_row = len(reiden_data) + 1 if reiden_data else 2
        needed_rows = start_row + len(new_reiden_rows) - 1
        if reiden_ws.row_count < needed_rows:
            reiden_ws.resize(rows=needed_rows)
        reiden_ws.update(f"A{start_row}", new_reiden_rows)
        click.echo(f"  ReidentificationMap: added {len(new_reiden_rows)} new mappings")
    else:
        click.echo(f"  ReidentificationMap: no new mappings (all patients already mapped)")
