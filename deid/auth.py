"""Google OAuth2 authentication for Sheets and Drive APIs.

Stores credentials at ~/.deid/credentials.json.
Requires a client_secrets.json (OAuth client ID) — place it at ~/.deid/client_secrets.json.
"""

import json
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from .config import CREDENTIALS_PATH, DEID_HOME

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

CLIENT_SECRETS_PATH = DEID_HOME / "client_secrets.json"


def get_credentials() -> Credentials:
    """Get valid Google OAuth2 credentials, refreshing or running auth flow as needed."""
    creds = None

    if CREDENTIALS_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(CREDENTIALS_PATH), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        if not CLIENT_SECRETS_PATH.exists():
            raise FileNotFoundError(
                f"OAuth client secrets not found at {CLIENT_SECRETS_PATH}\n"
                "Download your OAuth client ID JSON from Google Cloud Console\n"
                f"and save it as {CLIENT_SECRETS_PATH}"
            )
        flow = InstalledAppFlow.from_client_secrets_file(
            str(CLIENT_SECRETS_PATH), SCOPES
        )
        creds = flow.run_local_server(port=0)

    # Save for next time
    DEID_HOME.mkdir(parents=True, exist_ok=True)
    with open(CREDENTIALS_PATH, "w") as f:
        f.write(creds.to_json())

    return creds


def authorize_gspread():
    """Return an authorized gspread client."""
    import gspread

    creds = get_credentials()
    return gspread.authorize(creds)
