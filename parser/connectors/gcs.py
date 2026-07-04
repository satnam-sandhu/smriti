#!/usr/bin/env python3
"""Google Cloud Storage connector.

Requires the optional ``google-cloud-storage`` dependency. Auth uses a service
account JSON path from config, else GOOGLE_APPLICATION_CREDENTIALS / application
default credentials.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from .base import Connector, ConnectorError, RemoteObject


class GCSConnector(Connector):
    type = "gcs"
    label = "Google Cloud Storage"

    @classmethod
    def config_schema(cls) -> List[Dict[str, object]]:
        return [
            {"name": "bucket", "label": "Bucket", "required": True, "secret": False,
             "help": "GCS bucket name"},
            {"name": "prefix", "label": "Prefix", "required": False, "secret": False,
             "help": "Object name prefix to list under"},
            {"name": "project", "label": "Project", "required": False, "secret": False,
             "help": "GCP project id (optional; inferred from credentials)"},
            {"name": "credentials_json", "label": "Service Account JSON", "required": False,
             "secret": True,
             "help": "Path to service-account key file; falls back to "
                     "GOOGLE_APPLICATION_CREDENTIALS / ADC"},
        ]

    def _client(self):
        try:
            from google.cloud import storage  # type: ignore
        except ImportError as e:
            raise ConnectorError(
                "google-cloud-storage is required for the GCS connector. "
                "Install with: pip install google-cloud-storage"
            ) from e

        creds = self._cfg("credentials_json")
        project = self._cfg("project")
        if creds:
            return storage.Client.from_service_account_json(creds, project=project)
        return storage.Client(project=project) if project else storage.Client()

    def list_objects(self, prefix: str = "") -> List[RemoteObject]:
        bucket = self._require("bucket")
        eff_prefix = prefix or self._cfg("prefix", "") or ""
        client = self._client()

        objects: List[RemoteObject] = []
        try:
            for blob in client.list_blobs(bucket, prefix=eff_prefix):
                if blob.name.endswith("/"):  # skip folder placeholders
                    continue
                objects.append(
                    RemoteObject(
                        key=blob.name,
                        name=blob.name.rsplit("/", 1)[-1],
                        uri=f"gs://{bucket}/{blob.name}",
                        size=blob.size,
                    )
                )
        except Exception as e:
            raise ConnectorError(f"gcs: failed to list {bucket}/{eff_prefix}: {e}") from e
        return objects

    def fetch(self, key: str, dest: Path) -> Path:
        bucket = self._require("bucket")
        client = self._client()
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            blob = client.bucket(bucket).blob(key)
            blob.download_to_filename(str(dest))
        except Exception as e:
            raise ConnectorError(f"gcs: failed to download {bucket}/{key}: {e}") from e
        return dest
