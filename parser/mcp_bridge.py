#!/usr/bin/env python3
"""MCP bridge — CLI subcommands for Smriti document intelligence MCP server."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from connectors import ConnectorError, get_connector, list_connector_types, pull
from executor import execute_parser
from gemini_client import generate_dsl
from registry import fingerprint, list_all, lookup, save
from schemas import ACTIVE_PLUGIN, DOC_TYPE_MAP, detect_doc_type

WORKSPACE = Path(os.getenv("SMRITI_WORKSPACE", Path(__file__).parent.parent / "data"))
PLUGIN_PATH = WORKSPACE / "plugin.json"
DB_PATH = WORKSPACE / "smriti.db"
GOLD_PARTITION = f"gold/domain={ACTIVE_PLUGIN}/year=2026/month=07"

PLUGIN_DEFINITIONS = {
    "healthcare": {
        "name": "healthcare-plugin",
        "version": "1.0.0",
        "supportedTypes": ["receipt", "clinical", "ledger"],
        "status": "active",
        "schemas": ["MedicalReceipt", "ClinicalPdf", "PatientLedger"],
    },
    "finance": {
        "name": "finance-plugin",
        "version": "1.0.0",
        "supportedTypes": ["report", "ledger", "statement"],
        "status": "active",
        "schemas": ["FinancialReport", "AccountLedger", "BankStatement"],
    },
}


def _out(data: dict | list) -> None:
    print(json.dumps(data, default=str))


def _conn() -> sqlite3.Connection:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    (WORKSPACE / "bronze").mkdir(exist_ok=True)
    (WORKSPACE / "silver").mkdir(exist_ok=True)
    (WORKSPACE / GOLD_PARTITION).mkdir(parents=True, exist_ok=True)
    (WORKSPACE / "quarantine").mkdir(exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            status TEXT NOT NULL,
            parser_path TEXT,
            bronze_path TEXT NOT NULL,
            silver_path TEXT,
            bytes INTEGER NOT NULL,
            error_code TEXT,
            error_detail TEXT,
            accuracy_pct REAL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            error_code TEXT NOT NULL,
            error_detail TEXT,
            timestamp TEXT NOT NULL
        );
        """
    )
    return conn


def cmd_identify(args: argparse.Namespace) -> None:
    file_path = Path(args.file)
    doc_type = detect_doc_type(file_path.name)
    fp = fingerprint(file_path, doc_type)
    dsl = lookup(fp)
    _out(
        {
            "fingerprint": fp,
            "docType": doc_type,
            "templateFound": dsl is not None,
            "templateId": fp[:16] if dsl else None,
            "dsl": dsl,
        }
    )


def cmd_generate(args: argparse.Namespace) -> None:
    file_path = Path(args.file)
    doc_type = detect_doc_type(file_path.name)
    fp = fingerprint(file_path, doc_type)
    dsl, _usage = generate_dsl(file_path, doc_type)
    save(fp, doc_type, dsl)
    _out(
        {
            "fingerprint": fp,
            "docType": doc_type,
            "templateId": fp[:16],
            "dsl": dsl,
            "parserUsed": "ai_generated",
        }
    )


def cmd_execute(args: argparse.Namespace) -> None:
    file_path = Path(args.file)
    doc_type = detect_doc_type(file_path.name)
    fp = fingerprint(file_path, doc_type)
    dsl = lookup(fp)
    if not dsl:
        _out(
            {
                "errorCode": "UNKNOWN_LAYOUT",
                "errorDetail": "No matching template in registry. Call generate_parser first.",
            }
        )
        sys.exit(1)

    try:
        silver = execute_parser(file_path, dsl, doc_type)
        _out(
            {
                "parserPath": "deterministic",
                "silverJson": silver,
                "templateId": fp[:16],
                "errorCode": None,
                "errorDetail": None,
            }
        )
    except Exception as e:
        _out(
            {
                "parserPath": "deterministic",
                "silverJson": {},
                "errorCode": "VALIDATION_ERROR",
                "errorDetail": str(e),
            }
        )
        sys.exit(1)


def cmd_list_templates(_args: argparse.Namespace) -> None:
    _out({"templates": list_all()})


def cmd_list_plugins(_args: argparse.Namespace) -> None:
    active = ACTIVE_PLUGIN
    if PLUGIN_PATH.exists():
        active = json.loads(PLUGIN_PATH.read_text()).get("active", ACTIVE_PLUGIN)

    plugins = []
    for key, plugin in PLUGIN_DEFINITIONS.items():
        plugins.append({**plugin, "active": key == active})
    _out({"plugins": plugins, "activePlugin": active})


def cmd_install_plugin(args: argparse.Namespace) -> None:
    name = args.name.lower()
    if name not in PLUGIN_DEFINITIONS:
        _out({"error": f"Unknown plugin: {name}. Choose healthcare or finance."})
        sys.exit(1)

    WORKSPACE.mkdir(parents=True, exist_ok=True)
    PLUGIN_PATH.write_text(
        json.dumps(
            {
                "active": name,
                "installedAt": datetime.now(timezone.utc).isoformat(),
                **PLUGIN_DEFINITIONS[name],
            },
            indent=2,
        )
    )
    _out({"installed": name, "plugin": PLUGIN_DEFINITIONS[name]})


def cmd_register_file(args: argparse.Namespace) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            """INSERT INTO files
               (id, file_name, status, parser_path, bronze_path, silver_path, bytes,
                error_code, error_detail, accuracy_pct, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                args.document_id,
                args.filename,
                "queued",
                None,
                args.bronze_path,
                None,
                args.bytes,
                None,
                None,
                None,
                now,
            ),
        )
        conn.commit()
    _out({"documentId": args.document_id, "status": "queued"})


def cmd_update_file(args: argparse.Namespace) -> None:
    with _conn() as conn:
        conn.execute(
            """UPDATE files SET status=?, parser_path=?, silver_path=?,
               error_code=?, error_detail=?, accuracy_pct=? WHERE id=?""",
            (
                args.status,
                args.parser_path,
                args.silver_path,
                args.error_code,
                args.error_detail,
                args.accuracy_pct,
                args.document_id,
            ),
        )
        conn.commit()
    _out({"documentId": args.document_id, "status": args.status})


def cmd_record_failure(args: argparse.Namespace) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            """INSERT INTO failures (file_id, file_name, error_code, error_detail, timestamp)
               VALUES (?, ?, ?, ?, ?)""",
            (args.document_id, args.filename, args.error_code, args.error_detail, ts),
        )
        conn.commit()
    _out({"recorded": True})


def cmd_get_document(args: argparse.Namespace) -> None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (args.document_id,)).fetchone()
    if not row:
        _out({"found": False})
        return

    silver_json = None
    if row["silver_path"] and Path(row["silver_path"]).exists():
        silver_json = json.loads(Path(row["silver_path"]).read_text())

    _out(
        {
            "found": True,
            "documentId": row["id"],
            "filename": row["file_name"],
            "status": row["status"],
            "parserPath": row["parser_path"],
            "bronzePath": row["bronze_path"],
            "silverPath": row["silver_path"],
            "extractedData": silver_json,
            "errorCode": row["error_code"],
            "errorDetail": row["error_detail"],
            "accuracyPct": row["accuracy_pct"],
            "bytes": row["bytes"],
        }
    )


def cmd_search(args: argparse.Namespace) -> None:
    query = args.query.lower()
    terms = [t for t in query.split() if t]
    results = []

    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM files WHERE status = 'completed' ORDER BY created_at DESC"
        ).fetchall()

    for row in rows:
        silver_json = None
        if row["silver_path"] and Path(row["silver_path"]).exists():
            silver_json = json.loads(Path(row["silver_path"]).read_text())

        haystack = " ".join(
            [
                row["file_name"],
                row["parser_path"] or "",
                json.dumps(silver_json or {}),
            ]
        ).lower()

        if terms and not all(term in haystack for term in terms):
            continue

        score = min(0.99, 0.7 + 0.05 * sum(1 for t in terms if t in haystack))
        results.append(
            {
                "documentId": row["id"],
                "score": round(score, 3),
                "metadata": {
                    "filename": row["file_name"],
                    "parserPath": row["parser_path"],
                    "status": row["status"],
                },
                "extractedData": silver_json or {},
            }
        )

    _out({"results": results})


def cmd_metrics(_args: argparse.Namespace) -> None:
    with _conn() as conn:
        total_files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        total_bytes = conn.execute("SELECT COALESCE(SUM(bytes), 0) FROM files").fetchone()[0]
        completed = conn.execute("SELECT COUNT(*) FROM files WHERE status='completed'").fetchone()[0]
        failed = conn.execute("SELECT COUNT(*) FROM files WHERE status='failed'").fetchone()[0]
        in_progress = conn.execute(
            "SELECT COUNT(*) FROM files WHERE status IN ('queued', 'processing')"
        ).fetchone()[0]
        ai_parsed = conn.execute("SELECT COUNT(*) FROM files WHERE parser_path='ai'").fetchone()[0]
        deterministic_parsed = conn.execute(
            "SELECT COUNT(*) FROM files WHERE parser_path='deterministic'"
        ).fetchone()[0]
        accuracy_pct = conn.execute(
            "SELECT COALESCE(AVG(accuracy_pct), 0) FROM files WHERE accuracy_pct IS NOT NULL"
        ).fetchone()[0]
        recent_failures = [
            dict(r)
            for r in conn.execute(
                "SELECT file_name as fileName, error_code as errorCode, timestamp FROM failures ORDER BY id DESC LIMIT 10"
            ).fetchall()
        ]

    validation_pass_rate = (completed / total_files * 100) if total_files else 0.0

    _out(
        {
            "totalFiles": total_files,
            "totalBytes": total_bytes,
            "completed": completed,
            "failed": failed,
            "inProgress": in_progress,
            "accuracyPct": round(accuracy_pct, 1),
            "validationPassRate": round(validation_pass_rate, 1),
            "aiParsed": ai_parsed,
            "deterministicParsed": deterministic_parsed,
            "recentFailures": recent_failures,
        }
    )


def cmd_list_failures(_args: argparse.Namespace) -> None:
    failures = []
    with _conn() as conn:
        rows = conn.execute(
            """SELECT file_id, file_name, error_code, error_detail, timestamp
               FROM failures ORDER BY id DESC LIMIT 50"""
        ).fetchall()
        failures = [dict(r) for r in rows]

    quarantine = WORKSPACE / "quarantine"
    sidecars = []
    if quarantine.exists():
        for sidecar in quarantine.glob("*.error.json"):
            sidecars.append(json.loads(sidecar.read_text()))

    _out({"failures": failures, "quarantineSidecars": sidecars})


def cmd_write_gold(args: argparse.Namespace) -> None:
    import subprocess

    script = Path(__file__).parent / "write_parquet.py"
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [sys.executable, str(script), "--input", args.input, "--output", str(output)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        _out({"error": result.stderr})
        sys.exit(1)
    _out({"goldPath": str(output)})


def cmd_classify(args: argparse.Namespace) -> None:
    file_path = Path(args.file)
    doc_type = detect_doc_type(file_path.name)
    industry = "Banking & Finance" if doc_type in {"report", "ledger", "statement"} else "General"
    confidence = 0.95 if doc_type != "report" else 0.89
    _out(
        {
            "documentType": doc_type,
            "industry": industry,
            "confidence": confidence,
            "metadata": {"filename": file_path.name},
        }
    )


def _parse_config(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        _out({"error": f"--config is not valid JSON: {e}"})
        sys.exit(1)
    if not isinstance(cfg, dict):
        _out({"error": "--config must be a JSON object"})
        sys.exit(1)
    return cfg


def cmd_list_connectors(_args: argparse.Namespace) -> None:
    _out({"connectors": list_connector_types()})


def cmd_connector_list(args: argparse.Namespace) -> None:
    config = _parse_config(args.config)
    try:
        connector = get_connector(args.type, config)
        objects = [obj.to_dict() for obj in connector.list_objects(args.prefix or "")]
    except ConnectorError as e:
        _out({"error": str(e)})
        sys.exit(1)
    _out({"connector": args.type, "objects": objects})


def cmd_connector_pull(args: argparse.Namespace) -> None:
    config = _parse_config(args.config)
    keys = None
    if args.keys:
        try:
            keys = json.loads(args.keys)
        except json.JSONDecodeError as e:
            _out({"error": f"--keys is not valid JSON: {e}"})
            sys.exit(1)
        if not isinstance(keys, list):
            _out({"error": "--keys must be a JSON array of object keys"})
            sys.exit(1)

    bronze_dir = WORKSPACE / "bronze"
    try:
        pulled = pull(
            args.type,
            config,
            bronze_dir=bronze_dir,
            keys=keys,
            prefix=args.prefix or "",
        )
    except ConnectorError as e:
        _out({"error": str(e)})
        sys.exit(1)

    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        for item in pulled:
            conn.execute(
                """INSERT INTO files
                   (id, file_name, status, parser_path, bronze_path, silver_path, bytes,
                    error_code, error_detail, accuracy_pct, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item["documentId"],
                    item["filename"],
                    "queued",
                    None,
                    item["bronzePath"],
                    None,
                    item["bytes"],
                    None,
                    None,
                    None,
                    now,
                ),
            )
        conn.commit()

    _out({"connector": args.type, "pulled": len(pulled), "files": pulled})


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("identify")
    p.add_argument("--file", required=True)

    p = sub.add_parser("generate")
    p.add_argument("--file", required=True)

    p = sub.add_parser("execute")
    p.add_argument("--file", required=True)

    p = sub.add_parser("list-templates")

    p = sub.add_parser("list-plugins")

    p = sub.add_parser("install-plugin")
    p.add_argument("--name", required=True)

    p = sub.add_parser("register-file")
    p.add_argument("--document-id", required=True)
    p.add_argument("--filename", required=True)
    p.add_argument("--bronze-path", required=True)
    p.add_argument("--bytes", type=int, required=True)

    p = sub.add_parser("update-file")
    p.add_argument("--document-id", required=True)
    p.add_argument("--status", required=True)
    p.add_argument("--parser-path")
    p.add_argument("--silver-path")
    p.add_argument("--error-code")
    p.add_argument("--error-detail")
    p.add_argument("--accuracy-pct", type=float)

    p = sub.add_parser("record-failure")
    p.add_argument("--document-id", required=True)
    p.add_argument("--filename", required=True)
    p.add_argument("--error-code", required=True)
    p.add_argument("--error-detail", default="")

    p = sub.add_parser("get-document")
    p.add_argument("--document-id", required=True)

    p = sub.add_parser("search")
    p.add_argument("--query", required=True)

    p = sub.add_parser("metrics")

    p = sub.add_parser("list-failures")

    p = sub.add_parser("write-gold")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)

    p = sub.add_parser("classify")
    p.add_argument("--file", required=True)

    p = sub.add_parser("list-connectors")

    p = sub.add_parser("connector-list")
    p.add_argument("--type", required=True)
    p.add_argument("--config", help="JSON object of connector config")
    p.add_argument("--prefix", default="")

    p = sub.add_parser("connector-pull")
    p.add_argument("--type", required=True)
    p.add_argument("--config", help="JSON object of connector config")
    p.add_argument("--prefix", default="")
    p.add_argument("--keys", help="JSON array of specific object keys to fetch")

    args = parser.parse_args()
    handlers = {
        "identify": cmd_identify,
        "generate": cmd_generate,
        "execute": cmd_execute,
        "list-templates": cmd_list_templates,
        "list-plugins": cmd_list_plugins,
        "install-plugin": cmd_install_plugin,
        "register-file": cmd_register_file,
        "update-file": cmd_update_file,
        "record-failure": cmd_record_failure,
        "get-document": cmd_get_document,
        "search": cmd_search,
        "metrics": cmd_metrics,
        "list-failures": cmd_list_failures,
        "write-gold": cmd_write_gold,
        "classify": cmd_classify,
        "list-connectors": cmd_list_connectors,
        "connector-list": cmd_connector_list,
        "connector-pull": cmd_connector_pull,
    }
    handlers[args.command](args)


if __name__ == "__main__":
    main()
