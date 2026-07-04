#!/usr/bin/env python3
"""Connector registry — remote data sources that land files into bronze.

Registration is a module-level dict keyed by connector ``type`` (mirroring the
``DOC_TYPE_MAP`` pattern in schemas.py). Add a connector by importing its class
here and adding it to ``_CONNECTORS``.

High-level ``pull`` downloads selected objects into the bronze layer and returns
lightweight descriptors the caller can register in the files table.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict, List, Optional, Type

from .azure_blob import AzureBlobConnector
from .base import Connector, ConnectorError, RemoteObject
from .gcs import GCSConnector
from .gdrive import GoogleDriveConnector
from .s3 import S3Connector

_CONNECTORS: Dict[str, Type[Connector]] = {
    S3Connector.type: S3Connector,
    GCSConnector.type: GCSConnector,
    AzureBlobConnector.type: AzureBlobConnector,
    GoogleDriveConnector.type: GoogleDriveConnector,
}

__all__ = [
    "Connector",
    "ConnectorError",
    "RemoteObject",
    "get_connector",
    "list_connector_types",
    "pull",
]


def list_connector_types() -> List[Dict[str, object]]:
    """Return metadata + config schema for every registered connector."""
    return [
        {"type": cls.type, "label": cls.label, "configSchema": cls.config_schema()}
        for cls in _CONNECTORS.values()
    ]


def get_connector(connector_type: str, config: Optional[Dict[str, object]] = None) -> Connector:
    cls = _CONNECTORS.get(connector_type)
    if cls is None:
        known = ", ".join(sorted(_CONNECTORS)) or "(none)"
        raise ConnectorError(f"unknown connector type '{connector_type}'. Known: {known}")
    return cls(config or {})


def pull(
    connector_type: str,
    config: Dict[str, object],
    bronze_dir: Path,
    keys: Optional[List[str]] = None,
    prefix: str = "",
) -> List[Dict[str, object]]:
    """Download objects into ``bronze_dir`` as ``{uuid}_{name}`` files.

    If ``keys`` is given, exactly those objects are fetched; otherwise every
    object under ``prefix`` (or the connector's configured prefix) is fetched.
    Returns one descriptor per file: documentId, filename, bronzePath, bytes,
    sourceUri, connector.
    """
    connector = get_connector(connector_type, config)

    if keys:
        targets = [connector.resolve_object(k) for k in keys]
    else:
        targets = connector.list_objects(prefix)

    bronze_dir.mkdir(parents=True, exist_ok=True)
    results: List[Dict[str, object]] = []
    for obj in targets:
        doc_id = str(uuid.uuid4())
        dest = bronze_dir / f"{doc_id}_{obj.name}"
        connector.fetch(obj.key, dest)
        results.append(
            {
                "documentId": doc_id,
                "filename": obj.name,
                "bronzePath": str(dest),
                "bytes": dest.stat().st_size,
                "sourceUri": obj.uri,
                "connector": connector_type,
            }
        )
    return results
