#!/usr/bin/env python3
"""Run DuckDB analytics queries against Gold Parquet."""

import argparse
import json
import sys

import duckdb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql", required=True)
    parser.add_argument("--gold-glob", required=True)
    args = parser.parse_args()

    sql = args.sql.replace("GOLD_GLOB", args.gold_glob).replace("'GOLD_GLOB'", f"'{args.gold_glob}'")

    # Mixed doc types produce different Parquet schemas — union columns across files
    if "read_parquet(" in sql and "union_by_name" not in sql and "*" in args.gold_glob:
        sql = sql.replace(
            f"read_parquet('{args.gold_glob}')",
            f"read_parquet('{args.gold_glob}', union_by_name=true)",
        )

    try:
        conn = duckdb.connect()
        cursor = conn.execute(sql)
        columns = [desc[0] for desc in cursor.description]
        raw_rows = cursor.fetchall()
        rows = [dict(zip(columns, row)) for row in raw_rows]
        print(json.dumps({"columns": columns, "rows": rows}, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
