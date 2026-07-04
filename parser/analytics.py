#!/usr/bin/env python3
"""Run DuckDB analytics queries against Gold Parquet."""

import argparse
import glob as glob_module
import json
import sys
from pathlib import Path

import duckdb

GOLD_VIEW = "gold_finance"


def register_gold_view(db_path: str, gold_glob: str, view_name: str = GOLD_VIEW) -> None:
    if not glob_module.glob(gold_glob):
        return

    conn = duckdb.connect(db_path)
    escaped = gold_glob.replace("'", "''")
    conn.execute(
        f"CREATE OR REPLACE VIEW {view_name} AS "
        f"SELECT * FROM read_parquet('{escaped}', union_by_name=true)"
    )
    conn.close()


def apply_union_by_name(sql: str, gold_glob: str) -> str:
    """Mixed doc types produce different Parquet schemas — union columns across files."""
    if "read_parquet(" in sql and "union_by_name" not in sql and "*" in gold_glob:
        sql = sql.replace(
            f"read_parquet('{gold_glob}')",
            f"read_parquet('{gold_glob}', union_by_name=true)",
        )
    return sql


def run_query(db_path: str | None, sql: str, gold_glob: str) -> dict:
    sql = sql.replace("GOLD_GLOB", gold_glob).replace("'GOLD_GLOB'", f"'{gold_glob}'")
    sql = apply_union_by_name(sql, gold_glob)

    if db_path and Path(db_path).exists():
        conn = duckdb.connect(db_path)
    else:
        conn = duckdb.connect()

    cursor = conn.execute(sql)
    columns = [desc[0] for desc in cursor.description]
    raw_rows = cursor.fetchall()
    rows = [dict(zip(columns, row)) for row in raw_rows]
    conn.close()
    return {"columns": columns, "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql")
    parser.add_argument("--gold-glob", required=True)
    parser.add_argument("--db-path")
    parser.add_argument("--register", action="store_true")
    parser.add_argument("--view-name", default=GOLD_VIEW)
    args = parser.parse_args()

    try:
        if args.register:
            if not args.db_path:
                print(json.dumps({"error": "--db-path required for --register"}), file=sys.stderr)
                sys.exit(1)
            register_gold_view(args.db_path, args.gold_glob, args.view_name)
            print(json.dumps({"registered": args.view_name, "dbPath": args.db_path}))
            return

        if not args.sql:
            print(json.dumps({"error": "--sql required unless --register"}), file=sys.stderr)
            sys.exit(1)

        payload = run_query(args.db_path, args.sql, args.gold_glob)
        print(json.dumps(payload, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
