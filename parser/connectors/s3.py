#!/usr/bin/env python3
"""Amazon S3 (and S3-compatible) connector.

Requires the optional ``boto3`` dependency. Credentials may be passed in config
or left to boto3's standard resolution (env vars, shared config, IAM role). An
``endpoint_url`` makes this work against MinIO / other S3-compatible stores.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from .base import Connector, ConnectorError, RemoteObject


class S3Connector(Connector):
    type = "s3"
    label = "Amazon S3"

    @classmethod
    def config_schema(cls) -> List[Dict[str, object]]:
        return [
            {"name": "bucket", "label": "Bucket", "required": True, "secret": False,
             "help": "S3 bucket name"},
            {"name": "prefix", "label": "Prefix", "required": False, "secret": False,
             "help": "Key prefix to list under (e.g. invoices/2026/)"},
            {"name": "region", "label": "Region", "required": False, "secret": False,
             "help": "AWS region, e.g. us-east-1"},
            {"name": "access_key_id", "label": "Access Key ID", "required": False, "secret": False,
             "help": "Falls back to AWS_ACCESS_KEY_ID / IAM role if omitted"},
            {"name": "secret_access_key", "label": "Secret Access Key", "required": False,
             "secret": True, "help": "Falls back to AWS_SECRET_ACCESS_KEY if omitted"},
            {"name": "session_token", "label": "Session Token", "required": False, "secret": True,
             "help": "Optional temporary-credential session token"},
            {"name": "endpoint_url", "label": "Endpoint URL", "required": False, "secret": False,
             "help": "Custom endpoint for S3-compatible stores (e.g. MinIO)"},
        ]

    def _client(self):
        try:
            import boto3  # type: ignore
        except ImportError as e:
            raise ConnectorError(
                "boto3 is required for the S3 connector. Install with: pip install boto3"
            ) from e

        kwargs: Dict[str, object] = {}
        if self._cfg("region"):
            kwargs["region_name"] = self._cfg("region")
        if self._cfg("access_key_id"):
            kwargs["aws_access_key_id"] = self._cfg("access_key_id")
        if self._cfg("secret_access_key"):
            kwargs["aws_secret_access_key"] = self._cfg("secret_access_key")
        if self._cfg("session_token"):
            kwargs["aws_session_token"] = self._cfg("session_token")
        if self._cfg("endpoint_url"):
            kwargs["endpoint_url"] = self._cfg("endpoint_url")
        return boto3.client("s3", **kwargs)

    def list_objects(self, prefix: str = "") -> List[RemoteObject]:
        bucket = self._require("bucket")
        eff_prefix = prefix or self._cfg("prefix", "") or ""
        client = self._client()

        objects: List[RemoteObject] = []
        paginator = client.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=bucket, Prefix=eff_prefix):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if key.endswith("/"):  # skip folder markers
                        continue
                    objects.append(
                        RemoteObject(
                            key=key,
                            name=key.rsplit("/", 1)[-1],
                            uri=f"s3://{bucket}/{key}",
                            size=obj.get("Size"),
                        )
                    )
        except Exception as e:  # boto3 raises botocore ClientError et al.
            raise ConnectorError(f"s3: failed to list {bucket}/{eff_prefix}: {e}") from e
        return objects

    def fetch(self, key: str, dest: Path) -> Path:
        bucket = self._require("bucket")
        client = self._client()
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            client.download_file(bucket, key, str(dest))
        except Exception as e:
            raise ConnectorError(f"s3: failed to download {bucket}/{key}: {e}") from e
        return dest
