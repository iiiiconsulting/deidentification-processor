"""Google OAuth2 authentication for Sheets and Drive APIs.

Stores credentials at ~/.deid/credentials.json.
OAuth client ID is embedded — just run `deid auth` to authenticate.
"""

import os
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from .config import CREDENTIALS_PATH, DEID_HOME

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

# Embedded OAuth client ID for installed/desktop app.
# This is NOT a secret — per Google's docs, client IDs for installed apps
# are considered public. Users still authenticate via browser OAuth flow.
#
# TODO: Replace placeholder values with actual OAuth client ID from
# Google Cloud Console → APIs & Credentials → OAuth 2.0 Client IDs
# Project: REDACTED_PROJECT_ID
_INSTALLED_CLIENT = {
    "installed": {
        "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
        "project_id": "REDACTED_PROJECT_ID",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_secret": "YOUR_CLIENT_SECRET",
        "redirect_uris": ["http://localhost"],
    }
}


def get_credentials() -> Credentials:
    """Get valid Google OAuth2 credentials, refreshing or running auth flow as needed."""
    creds = None

    if CREDENTIALS_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(CREDENTIALS_PATH), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except RefreshError:
            creds = None  # Fall through to full auth flow

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_config(_INSTALLED_CLIENT, SCOPES)
        creds = flow.run_local_server(port=0)

    # Save for next time with restricted permissions
    DEID_HOME.mkdir(parents=True, exist_ok=True)
    with open(CREDENTIALS_PATH, "w") as f:
        f.write(creds.to_json())
    os.chmod(CREDENTIALS_PATH, 0o600)

    return creds


def authorize_gspread():
    """Return an authorized gspread client."""
    import gspread

    creds = get_credentials()
    return gspread.authorize(creds)
