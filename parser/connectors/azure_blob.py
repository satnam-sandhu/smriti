#!/usr/bin/env python3
"""Azure Blob Storage connector.

Requires the optional ``azure-storage-blob`` dependency. Auth uses either a
connection string, or an account URL + SAS token / account key.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from .base import Connector, ConnectorError, RemoteObject


class AzureBlobConnector(Connector):
    type = "azure_blob"
    label = "Azure Blob Storage"

    @classmethod
    def config_schema(cls) -> List[Dict[str, object]]:
        return [
            {"name": "container", "label": "Container", "required": True, "secret": False,
             "help": "Blob container name"},
            {"name": "prefix", "label": "Prefix", "required": False, "secret": False,
             "help": "Blob name prefix to list under"},
            {"name": "connection_string", "label": "Connection String", "required": False,
             "secret": True,
             "help": "Full connection string; falls back to "
                     "AZURE_STORAGE_CONNECTION_STRING"},
            {"name": "account_url", "label": "Account URL", "required": False, "secret": False,
             "help": "e.g. https://<account>.blob.core.windows.net (with account_key/sas)"},
            {"name": "account_key", "label": "Account Key", "required": False, "secret": True,
             "help": "Shared key, used with account_url"},
            {"name": "sas_token", "label": "SAS Token", "required": False, "secret": True,
             "help": "SAS token, used with account_url"},
        ]

    def _service_client(self):
        try:
            from azure.storage.blob import BlobServiceClient  # type: ignore
        except ImportError as e:
            raise ConnectorError(
                "azure-storage-blob is required for the Azure Blob connector. "
                "Install with: pip install azure-storage-blob"
            ) from e

        import os

        conn = self._cfg("connection_string") or os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        if conn:
            return BlobServiceClient.from_connection_string(conn)

        account_url = self._cfg("account_url")
        if not account_url:
            raise ConnectorError(
                "azure_blob: provide either connection_string or account_url"
            )
        credential = self._cfg("account_key") or self._cfg("sas_token")
        return BlobServiceClient(account_url=account_url, credential=credential)

    def _container_client(self):
        container = self._require("container")
        return self._service_client().get_container_client(container)

    def list_objects(self, prefix: str = "") -> List[RemoteObject]:
        container = self._require("container")
        eff_prefix = prefix or self._cfg("prefix", "") or ""
        client = self._container_client()

        objects: List[RemoteObject] = []
        try:
            for blob in client.list_blobs(name_starts_with=eff_prefix):
                if blob.name.endswith("/"):
                    continue
                objects.append(
                    RemoteObject(
                        key=blob.name,
                        name=blob.name.rsplit("/", 1)[-1],
                        uri=f"azure://{container}/{blob.name}",
                        size=getattr(blob, "size", None),
                    )
                )
        except Exception as e:
            raise ConnectorError(f"azure_blob: failed to list {container}/{eff_prefix}: {e}") from e
        return objects

    def fetch(self, key: str, dest: Path) -> Path:
        client = self._container_client()
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            downloader = client.download_blob(key)
            with open(dest, "wb") as f:
                downloader.readinto(f)
        except Exception as e:
            raise ConnectorError(f"azure_blob: failed to download {key}: {e}") from e
        return dest
