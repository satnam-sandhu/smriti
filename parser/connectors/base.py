#!/usr/bin/env python3
"""Connector base interface — pull remote objects into the bronze layer.

A connector abstracts a remote data source (cloud object storage today) behind
a small interface: list the objects under a prefix, and fetch one object to a
local path. The pipeline treats fetched files exactly like locally-dropped
files, so a connector only has to land bytes on disk.

Cloud SDKs (boto3, google-cloud-storage, azure-storage-blob) are optional and
imported lazily inside each connector — mirroring the lazy pytesseract/PIL
import in executor.py — so the core parser install stays light.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional


class ConnectorError(Exception):
    """Raised for configuration, dependency, or transfer failures."""


@dataclass
class RemoteObject:
    """A single object discovered on a remote source."""

    key: str  # source-native identifier (e.g. an S3 object key)
    name: str  # basename to use for the local file
    uri: str  # canonical address, e.g. s3://bucket/key
    size: Optional[int] = None  # bytes, when the source reports it

    def to_dict(self) -> Dict[str, object]:
        return {"key": self.key, "name": self.name, "uri": self.uri, "size": self.size}


class Connector:
    """Base class for a remote data-source connector.

    Subclasses set ``type``/``label``, declare their ``config_schema``, and
    implement ``list_objects`` and ``fetch``. Missing config values fall back to
    the source SDK's standard environment variables where that makes sense.
    """

    type: str = ""  # stable id used in the registry, e.g. "s3"
    label: str = ""  # human label, e.g. "Amazon S3"

    def __init__(self, config: Optional[Dict[str, object]] = None) -> None:
        self.config: Dict[str, object] = dict(config or {})

    # -- introspection ---------------------------------------------------

    @classmethod
    def config_schema(cls) -> List[Dict[str, object]]:
        """Describe the config fields a caller may/must supply.

        Each entry: {name, label, required, secret, help}. Used by
        ``list-connectors`` so a UI (or an operator) knows what to provide.
        """
        return []

    # -- helpers ---------------------------------------------------------

    def _cfg(self, key: str, default: Optional[str] = None) -> Optional[str]:
        val = self.config.get(key)
        if val is None or val == "":
            return default
        return str(val)

    def _require(self, key: str) -> str:
        val = self._cfg(key)
        if not val:
            raise ConnectorError(f"{self.type}: missing required config '{key}'")
        return val

    # -- interface -------------------------------------------------------

    def list_objects(self, prefix: str = "") -> List[RemoteObject]:  # pragma: no cover
        raise NotImplementedError

    def resolve_object(self, key: str) -> RemoteObject:
        """Turn a bare key into a RemoteObject (name/uri) without listing.

        Object-storage keys already contain the filename, so the default just
        takes the basename. Sources with opaque ids (e.g. Google Drive file
        ids) override this to look up the real name/extension.
        """
        return RemoteObject(key=key, name=key.rsplit("/", 1)[-1], uri=key)

    def fetch(self, key: str, dest: Path) -> Path:  # pragma: no cover
        """Download ``key`` to ``dest`` (a full file path). Returns ``dest``."""
        raise NotImplementedError
