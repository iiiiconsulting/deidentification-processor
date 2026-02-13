"""CLI entry point for the deid tool."""

import sys
from pathlib import Path

import click
import pandas as pd

from .config import detect_file_type, list_targets, load_target, SHEET_TAB_NAMES
from .deidentifier import deidentify
from .preprocessor import preprocess
from .sheets import create_target_sheet, write_to_sheet


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

    try:
        get_credentials()
        click.echo("✓ Authenticated successfully. Credentials saved.")
    except FileNotFoundError as e:
        click.echo(str(e), err=True)
        sys.exit(1)


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
        click.echo(f"✓ Target '{name}' created. Salt generated and config saved.")
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

    salt = config["salt"]
    spreadsheet_id = config["spreadsheet_id"]
    reiden_spreadsheet_id = config.get("reiden_spreadsheet_id", spreadsheet_id)

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

        # Pipeline: preprocess → deidentify → write
        combined = preprocess(combined, sheet_type)
        deidentified, reiden_entries = deidentify(combined, sheet_type, salt, dry_run=dry_run)
        write_to_sheet(spreadsheet_id, reiden_spreadsheet_id, sheet_type, deidentified, reiden_entries, dry_run=dry_run)

    click.echo("\n✓ Processing complete.")


if __name__ == "__main__":
    cli()
