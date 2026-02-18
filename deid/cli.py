"""CLI entry point for the deid tool."""

import sys
from pathlib import Path

import click
import pandas as pd

from .config import detect_file_type, list_targets, load_target, SHEET_TAB_NAMES
from .deidentifier import deidentify
from .preprocessor import preprocess
from .sheets import create_target_sheet, get_salt, write_to_sheet


@click.group()
@click.version_option()
def cli():
    """deid — Deidentify financial CSV files and write to Google Sheets."""
    pass


# --- Auth ---

@cli.command()
def auth():
    """Authenticate with Google (opens browser for OAuth2 flow)."""
    from .auth import get_credentials

    get_credentials()
    click.echo("✓ Authenticated successfully. Credentials saved.")


# --- Target commands ---

@cli.group()
def target():
    """Manage deidentification targets (Google Sheet sets)."""
    pass


@target.command("create")
@click.argument("name")
def target_create(name):
    """Create a new target Google Sheet with all required tabs."""
    try:
        config = create_target_sheet(name)
        click.echo(f"✓ Target '{name}' created. Config saved.")
    except Exception as e:
        click.echo(f"Error creating target: {e}", err=True)
        sys.exit(1)


@target.command("list")
def target_list():
    """List all configured targets."""
    targets = list_targets()
    if not targets:
        click.echo("No targets configured. Use 'deid target create <name>' to create one.")
        return
    for t in targets:
        click.echo(f"  • {t['name']} (created {t.get('created', '?')})")


@target.command("info")
@click.argument("name")
def target_info(name):
    """Show details for a target."""
    try:
        config = load_target(name)
    except (FileNotFoundError, ValueError) as e:
        click.echo(str(e), err=True)
        sys.exit(1)

    click.echo(f"Name:                {config['name']}")
    click.echo(f"Created:             {config.get('created', '?')}")
    click.echo(f"Data Spreadsheet ID: {config.get('spreadsheet_id', '?')}")
    click.echo(f"Reiden Spreadsheet:  {config.get('reiden_spreadsheet_id', '?')}")
    # Salt intentionally not displayed


@target.command("reset")
@click.argument("name")
@click.confirmation_option(prompt="This will delete all data in the target's sheets. Are you sure?")
def target_reset(name):
    """Clear all data from a target's sheets (keeps headers and config)."""
    try:
        config = load_target(name)
    except (FileNotFoundError, ValueError) as e:
        click.echo(str(e), err=True)
        sys.exit(1)

    from .auth import authorize_gspread
    gc = authorize_gspread()

    from .sheets import REIDEN_HEADERS

    # Clear data sheets and force-write headers
    spreadsheet = gc.open_by_key(config["spreadsheet_id"])
    for ws in spreadsheet.worksheets():
        ws.clear()
        ws.resize(rows=1, cols=26)
    click.echo(f"✓ Cleared all data sheets")

    # Clear reiden map (but preserve Config tab with salt), re-write headers
    reiden = gc.open_by_key(config["reiden_spreadsheet_id"])
    for ws in reiden.worksheets():
        if ws.title == "Config":
            continue  # Don't touch the salt
        ws.clear()
        ws.resize(rows=1, cols=10)
        ws.update("A1", [REIDEN_HEADERS])
    click.echo(f"✓ Cleared reiden map (headers reset, salt preserved)")
    click.echo(f"✓ Target '{name}' reset. Ready for fresh import.")


# --- Process command ---

@cli.command()
@click.option("--target", "target_name", required=True, help="Target name to write to.")
@click.option("--dry-run", is_flag=True, default=False, help="Preview changes without writing to Google Sheets.")
@click.argument("files", nargs=-1, required=True, type=click.Path(exists=True))
def process(target_name, dry_run, files):
    """Process CSV files through the deidentification pipeline.

    Accepts one or more CSV file paths. File types are auto-detected from filenames.
    """
    try:
        config = load_target(target_name)
    except (FileNotFoundError, ValueError) as e:
        click.echo(str(e), err=True)
        sys.exit(1)

    spreadsheet_id = config["spreadsheet_id"]
    reiden_spreadsheet_id = config.get("reiden_spreadsheet_id", spreadsheet_id)
    salt = get_salt(reiden_spreadsheet_id)

    if dry_run:
        click.echo("⚠ DRY RUN — no data will be written to Google Sheets.\n")

    # Group files by type
    typed_files: dict[str, list[Path]] = {}
    for f in files:
        fpath = Path(f)
        ftype = detect_file_type(fpath.name)
        if ftype is None:
            click.echo(f"⚠ Skipping unknown file type: {fpath.name}", err=True)
            continue
        typed_files.setdefault(ftype, []).append(fpath)

    if not typed_files:
        click.echo("No recognized CSV files to process.", err=True)
        sys.exit(1)

    # Collect reiden entries across all sheet types, deduped globally by patientId
    all_reiden_entries = {}  # patientId → entry dict

    for sheet_type, fpaths in typed_files.items():
        tab_name = SHEET_TAB_NAMES[sheet_type]
        click.echo(f"\nProcessing {tab_name} ({len(fpaths)} file(s))...")

        # Read and concatenate all files of this type
        dfs = []
        for fpath in fpaths:
            try:
                df = pd.read_csv(fpath)
            except Exception as e:
                click.echo(f"  ✗ Error reading {fpath.name}: {e}", err=True)
                continue
            dfs.append(df)
            click.echo(f"  Read {fpath.name}: {len(df)} rows")

        if not dfs:
            click.echo(f"  ✗ No valid CSV files for {tab_name}, skipping.", err=True)
            continue

        combined = pd.concat(dfs, ignore_index=True)

        # Pipeline: preprocess → deidentify → write data sheet
        combined = preprocess(combined, sheet_type)
        deidentified, reiden_entries = deidentify(combined, sheet_type, salt, dry_run=dry_run)

        # Global dedup: only keep first occurrence of each patientId
        for entry in reiden_entries:
            pid = entry["patientId"]
            if pid not in all_reiden_entries:
                all_reiden_entries[pid] = entry

        # Write data sheet only (reiden written once at the end)
        write_to_sheet(spreadsheet_id, reiden_spreadsheet_id, sheet_type, deidentified, [], dry_run=dry_run)

    # Write all reiden entries at once, globally deduped
    reiden_list = list(all_reiden_entries.values())
    if reiden_list:
        from .sheets import write_reiden_map
        write_reiden_map(reiden_spreadsheet_id, reiden_list, dry_run=dry_run)

    click.echo("\n✓ Processing complete.")


# --- Reidentify command ---

@cli.command()
@click.option("--target", "target_name", required=True, help="Target name to read reiden map from.")
@click.option("--output", "output_path", default=None, type=click.Path(), help="Output CSV path. Defaults to <input>_reidentified.csv.")
@click.argument("file", required=True, type=click.Path(exists=True))
def reidentify(target_name, output_path, file):
    """Reidentify a deidentified CSV by replacing patientId hashes with original names.

    Reads the reidentification map from the target's Google Sheet and replaces
    all patientId values in the input file with their original names.
    """
    from .reidentifier import reidentify_file

    try:
        config = load_target(target_name)
    except (FileNotFoundError, ValueError) as e:
        click.echo(str(e), err=True)
        sys.exit(1)

    reiden_spreadsheet_id = config.get("reiden_spreadsheet_id")
    if not reiden_spreadsheet_id:
        click.echo("Target has no reiden spreadsheet configured.", err=True)
        sys.exit(1)

    input_path = Path(file)
    if output_path is None:
        output_path = input_path.parent / f"{input_path.stem}_reidentified{input_path.suffix}"
    else:
        output_path = Path(output_path)

    try:
        result_df, stats = reidentify_file(input_path, reiden_spreadsheet_id)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    result_df.to_csv(output_path, index=False)

    click.echo(f"\n✓ Reidentified {stats['matched']}/{stats['total']} patients")
    if stats["unmatched"] > 0:
        click.echo(f"  ⚠ {stats['unmatched']} patient ID(s) not found in reiden map")
    click.echo(f"  Output: {output_path}")


@cli.command("reidentify-sheet")
@click.option("--target", "target_name", required=True, help="Target name to reidentify.")
@click.option("--tab", "tab_name", default=None, help="Specific tab to reidentify. Default: all data tabs.")
def reidentify_sheet(target_name, tab_name):
    """Reidentify data directly in Google Sheets, creating a new reidentified spreadsheet.

    Creates a copy of the data spreadsheet with patientId replaced by original names
    and the _contentHash column removed.
    """
    from .reidentifier import reidentify_sheets

    try:
        config = load_target(target_name)
    except (FileNotFoundError, ValueError) as e:
        click.echo(str(e), err=True)
        sys.exit(1)

    try:
        url = reidentify_sheets(config, tab_name=tab_name)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    click.echo(f"\n✓ Reidentified spreadsheet created: {url}")


if __name__ == "__main__":
    cli()
