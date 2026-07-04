#!/usr/bin/env python3
"""Thin connector CLI for the Tauri app.

Unlike the connector subcommands in mcp_bridge.py (which register files in the
parser-side SQLite for the MCP server), this CLI only talks to the connectors
package: it lists types/objects and downloads objects into a caller-supplied
directory, printing JSON descriptors. The Tauri/Rust layer owns bronze-file
registration in its own DB, mirroring how dropped files are ingested.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from connectors import ConnectorError, get_connector, list_connector_types, pull


def _out(data: object) -> None:
    print(json.dumps(data, default=str))


def _fail(message: str) -> None:
    _out({"error": message})
    sys.exit(1)


def _parse_config(raw):
    if not raw:
        return {}
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        _fail(f"--config is not valid JSON: {e}")
    if not isinstance(cfg, dict):
        _fail("--config must be a JSON object")
    return cfg


def cmd_list_types(_args: argparse.Namespace) -> None:
    _out({"connectors": list_connector_types()})


def cmd_list_objects(args: argparse.Namespace) -> None:
    config = _parse_config(args.config)
    try:
        connector = get_connector(args.type, config)
        objects = [obj.to_dict() for obj in connector.list_objects(args.prefix or "")]
    except ConnectorError as e:
        _fail(str(e))
    _out({"connector": args.type, "objects": objects})


def cmd_pull(args: argparse.Namespace) -> None:
    config = _parse_config(args.config)
    keys = None
    if args.keys:
        try:
            keys = json.loads(args.keys)
        except json.JSONDecodeError as e:
            _fail(f"--keys is not valid JSON: {e}")
        if not isinstance(keys, list):
            _fail("--keys must be a JSON array of object keys")
    try:
        files = pull(
            args.type,
            config,
            bronze_dir=Path(args.dest),
            keys=keys,
            prefix=args.prefix or "",
        )
    except ConnectorError as e:
        _fail(str(e))
    _out({"connector": args.type, "pulled": len(files), "files": files})


def main() -> None:
    parser = argparse.ArgumentParser(description="Smriti connectors CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list-types")

    p = sub.add_parser("list-objects")
    p.add_argument("--type", required=True)
    p.add_argument("--config", help="JSON object of connector config")
    p.add_argument("--prefix", default="")

    p = sub.add_parser("pull")
    p.add_argument("--type", required=True)
    p.add_argument("--config", help="JSON object of connector config")
    p.add_argument("--dest", required=True, help="Directory to download objects into")
    p.add_argument("--prefix", default="")
    p.add_argument("--keys", help="JSON array of specific object keys to fetch")

    args = parser.parse_args()
    handlers = {
        "list-types": cmd_list_types,
        "list-objects": cmd_list_objects,
        "pull": cmd_pull,
    }
    handlers[args.command](args)


if __name__ == "__main__":
    main()
