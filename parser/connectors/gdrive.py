#!/usr/bin/env python3
"""Google Drive connector.

Requires the optional ``google-api-python-client`` dependency. Auth accepts
either an OAuth2 access token (quickest — paste one from the OAuth playground)
or a service-account JSON key file. Google-native docs (Docs/Sheets/Slides)
are exported to PDF/XLSX on download so the parser can read them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

from .base import Connector, ConnectorError, RemoteObject

_FOLDER_MIME = "application/vnd.google-apps.folder"

# Google-native types can't be downloaded raw — they're exported. Maps the
# native mime to (export mime, filename extension).
_EXPORT_MAP = {
    "application/vnd.google-apps.document": (
        "application/pdf", ".pdf"),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
    "application/vnd.google-apps.presentation": (
        "application/pdf", ".pdf"),
}

_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"


class GoogleDriveConnector(Connector):
    type = "gdrive"
    label = "Google Drive"

    @classmethod
    def config_schema(cls) -> List[Dict[str, object]]:
        return [
            {"name": "access_token", "label": "OAuth Access Token", "required": False,
             "secret": True,
             "help": "OAuth2 bearer token (drive.readonly scope). Quickest option."},
            {"name": "credentials_json", "label": "Service Account JSON", "required": False,
             "secret": True,
             "help": "Path to a service-account key file (alternative to token). "
                     "Falls back to GOOGLE_APPLICATION_CREDENTIALS."},
            {"name": "folder_id", "label": "Folder ID", "required": False, "secret": False,
             "help": "Limit to files in this Drive folder (optional)"},
            {"name": "prefix", "label": "Name Filter", "required": False, "secret": False,
             "help": "Only include files whose name contains this text (optional)"},
        ]

    def _service(self):
        try:
            from googleapiclient.discovery import build  # type: ignore
        except ImportError as e:
            raise ConnectorError(
                "google-api-python-client is required for the Google Drive connector. "
                "Install with: pip install google-api-python-client"
            ) from e

        import os

        token = self._cfg("access_token")
        if token:
            from google.oauth2.credentials import Credentials  # type: ignore

            creds = Credentials(token=token)
        else:
            creds_path = self._cfg("credentials_json") or os.getenv(
                "GOOGLE_APPLICATION_CREDENTIALS"
            )
            if not creds_path:
                raise ConnectorError(
                    "gdrive: provide either access_token or credentials_json"
                )
            from google.oauth2 import service_account  # type: ignore

            creds = service_account.Credentials.from_service_account_file(
                creds_path, scopes=[_READONLY_SCOPE]
            )
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    @staticmethod
    def _effective_name(name: str, mime: str) -> str:
        """Append an export extension for Google-native docs so downstream
        extension-based parsing picks the right reader."""
        export = _EXPORT_MAP.get(mime)
        if export and not name.lower().endswith(export[1]):
            return name + export[1]
        return name

    def list_objects(self, prefix: str = "") -> List[RemoteObject]:
        service = self._service()
        eff_prefix = prefix or self._cfg("prefix", "") or ""
        folder_id = self._cfg("folder_id")

        q_parts = ["trashed = false", f"mimeType != '{_FOLDER_MIME}'"]
        if folder_id:
            q_parts.append(f"'{folder_id}' in parents")
        if eff_prefix:
            escaped = eff_prefix.replace("'", "\\'")
            q_parts.append(f"name contains '{escaped}'")
        query = " and ".join(q_parts)

        objects: List[RemoteObject] = []
        page_token: Optional[str] = None
        try:
            while True:
                resp = (
                    service.files()
                    .list(
                        q=query,
                        spaces="drive",
                        fields="nextPageToken, files(id, name, size, mimeType)",
                        pageToken=page_token,
                        pageSize=100,
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    )
                    .execute()
                )
                for f in resp.get("files", []):
                    name = self._effective_name(f["name"], f["mimeType"])
                    objects.append(
                        RemoteObject(
                            key=f["id"],
                            name=name,
                            uri=f"gdrive://{f['id']}",
                            size=int(f["size"]) if f.get("size") else None,
                        )
                    )
                page_token = resp.get("nextPageToken")
                if not page_token:
                    break
        except ConnectorError:
            raise
        except Exception as e:
            raise ConnectorError(f"gdrive: failed to list files: {e}") from e
        return objects

    def resolve_object(self, key: str) -> RemoteObject:
        service = self._service()
        try:
            meta = (
                service.files()
                .get(fileId=key, fields="id, name, size, mimeType", supportsAllDrives=True)
                .execute()
            )
        except Exception as e:
            raise ConnectorError(f"gdrive: failed to read file {key}: {e}") from e
        name = self._effective_name(meta["name"], meta["mimeType"])
        return RemoteObject(
            key=key,
            name=name,
            uri=f"gdrive://{key}",
            size=int(meta["size"]) if meta.get("size") else None,
        )

    def fetch(self, key: str, dest: Path) -> Path:
        import io

        from googleapiclient.http import MediaIoBaseDownload  # type: ignore

        service = self._service()
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            meta = (
                service.files()
                .get(fileId=key, fields="mimeType", supportsAllDrives=True)
                .execute()
            )
            mime = meta["mimeType"]
            if mime.startswith("application/vnd.google-apps"):
                export = _EXPORT_MAP.get(mime)
                if not export:
                    raise ConnectorError(
                        f"gdrive: cannot export Google-native type '{mime}'"
                    )
                request = service.files().export_media(fileId=key, mimeType=export[0])
            else:
                request = service.files().get_media(fileId=key, supportsAllDrives=True)

            with io.FileIO(str(dest), "wb") as fh:
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    _status, done = downloader.next_chunk()
        except ConnectorError:
            raise
        except Exception as e:
            raise ConnectorError(f"gdrive: failed to download {key}: {e}") from e
        return dest
