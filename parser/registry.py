from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

REGISTRY_PATH = Path(__file__).parent / "registry.db"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(REGISTRY_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS parser_registry (
            fingerprint TEXT PRIMARY KEY,
            doc_type TEXT NOT NULL,
            dsl_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    return conn


def fingerprint(file_path: Path, doc_type: str) -> str:
    content = file_path.read_bytes()[:500]
    raw = f"{doc_type}:{content.hex()}".encode()
    return hashlib.sha256(raw).hexdigest()


def lookup(fp: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT dsl_json FROM parser_registry WHERE fingerprint = ?",
            (fp,),
        ).fetchone()
    if not row:
        return None
    return json.loads(row[0])


def save(fp: str, doc_type: str, dsl: dict) -> None:
    from datetime import datetime, timezone

    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO parser_registry (fingerprint, doc_type, dsl_json, created_at) VALUES (?, ?, ?, ?)",
            (fp, doc_type, json.dumps(dsl), datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()


def list_all() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT fingerprint, doc_type, dsl_json, created_at FROM parser_registry ORDER BY created_at DESC"
        ).fetchall()

    templates = []
    for fp, doc_type, dsl_json, created_at in rows:
        dsl = json.loads(dsl_json)
        if isinstance(dsl.get("fields"), dict):
            fields = list(dsl["fields"].keys())
        elif isinstance(dsl.get("columns"), dict):
            fields = list(dsl["columns"].keys())
        elif isinstance(dsl.get("extracted"), dict):
            fields = list(dsl["extracted"].keys())
        else:
            fields = []
        templates.append(
            {
                "templateId": fp[:16],
                "fingerprint": fp,
                "name": f"{doc_type.title()} Template",
                "documentType": doc_type,
                "fields": fields,
                "createdAt": created_at,
            }
        )
    return templates
