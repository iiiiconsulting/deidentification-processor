"""Configuration and target management.

Handles loading schemas, rules, and target configs from disk.
Targets are stored in ~/.deid/targets/<name>.yaml.
"""

import os
import re
import secrets
from datetime import date
from pathlib import Path

import yaml

# Directories
DEID_HOME = Path.home() / ".deid"
TARGETS_DIR = DEID_HOME / "targets"
CREDENTIALS_PATH = DEID_HOME / "credentials.json"

# Package-relative paths for schemas and rules
_PKG_ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = _PKG_ROOT / "schemas"
RULES_DIR = _PKG_ROOT / "rules"

# Mapping from CSV filename prefix to internal sheet type key
FILE_TYPE_MAP = {
    "ProductSalesReport": "product_sales",
    "Payments": "payments",
    "Invoices": "invoices",
    "Customers": "customers",
    "Contracts": "contracts",
}

# Display names for Google Sheet tabs (data sheets only — reiden is separate)
SHEET_TAB_NAMES = {
    "product_sales": "ProductSalesReport",
    "payments": "Payments",
    "invoices": "Invoices",
    "customers": "Customers",
    "contracts": "Contracts",
}

# Reiden map tab name (lives in its own spreadsheet)
REIDEN_TAB_NAME = "ReidentificationMap"


def ensure_dirs():
    """Create ~/.deid and targets directory if they don't exist."""
    TARGETS_DIR.mkdir(parents=True, exist_ok=True)


def load_schema(sheet_type: str) -> dict:
    """Load a schema YAML for the given sheet type."""
    path = SCHEMAS_DIR / f"{sheet_type}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Schema not found: {path}")
    with open(path) as f:
        return yaml.safe_load(f)


def load_rules(sheet_type: str) -> list:
    """Load pre-processing rules for a sheet type. Returns empty list if none."""
    path = RULES_DIR / f"{sheet_type}.yaml"
    if not path.exists():
        return []
    with open(path) as f:
        data = yaml.safe_load(f)
    if not data or not data.get("rules"):
        return []
    return data["rules"]


def detect_file_type(filename: str) -> str | None:
    """Detect sheet type from a CSV filename.

    Supports patterns like 'ProductSalesReport.csv', 'Payments (6).csv', etc.
    Returns the internal type key (e.g. 'product_sales') or None.
    """
    basename = Path(filename).stem  # strip .csv
    for prefix, type_key in FILE_TYPE_MAP.items():
        # Match exact name or name followed by space and parenthesized number
        if re.match(rf"^{re.escape(prefix)}(\s*\(\d+\))?$", basename):
            return type_key
    return None


def target_path(name: str) -> Path:
    """Return the config file path for a target name."""
    safe = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "-").lower()
    return TARGETS_DIR / f"{safe}.yaml"


def load_target(name: str) -> dict:
    """Load a target config by name."""
    path = target_path(name)
    if not path.exists():
        raise FileNotFoundError(f"Target '{name}' not found at {path}")
    with open(path) as f:
        data = yaml.safe_load(f)
    if not data:
        raise ValueError(f"Target '{name}' config is empty or invalid at {path}")
    return data


def save_target(name: str, config: dict):
    """Save a target config to disk with restricted permissions."""
    ensure_dirs()
    path = target_path(name)
    with open(path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)
    os.chmod(path, 0o600)
    return path


def create_target_config(name: str, spreadsheet_id: str, reiden_spreadsheet_id: str) -> dict:
    """Create a new target config dict with a random salt."""
    return {
        "name": name,
        "salt": secrets.token_hex(32),
        "created": date.today().isoformat(),
        "spreadsheet_id": spreadsheet_id,
        "reiden_spreadsheet_id": reiden_spreadsheet_id,
    }


def list_targets() -> list[dict]:
    """List all saved targets."""
    ensure_dirs()
    targets = []
    for f in TARGETS_DIR.glob("*.yaml"):
        with open(f) as fh:
            data = yaml.safe_load(fh)
            if data:
                targets.append(data)
    return targets
