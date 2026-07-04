#!/usr/bin/env python3
"""Run DuckDB analytics queries against Gold Parquet."""

import argparse
import glob as globlib
import json
import re
import sys

import duckdb

# Add union_by_name=true to any read_parquet('...')/read_parquet("...") call that
# doesn't already pass named args. The Gold partition mixes doc types (clinical,
# ledger, receipt) with different schemas, so DuckDB must union columns by name.
_READ_PARQUET = re.compile(r"read_parquet\(\s*('[^']*'|\"[^\"]*\")\s*\)", re.IGNORECASE)


def _inject_union_by_name(sql: str) -> str:
    return _READ_PARQUET.sub(r"read_parquet(\1, union_by_name=true)", sql)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql", required=True)
    parser.add_argument("--gold-glob", required=True)
    args = parser.parse_args()

    sql = args.sql.replace("GOLD_GLOB", args.gold_glob)
    sql = _inject_union_by_name(sql)

    try:
        conn = duckdb.connect()
        # Register a convenience `gold` view so demos can `SELECT * FROM gold`.
        if globlib.glob(args.gold_glob):
            conn.execute(
                f"CREATE VIEW gold AS SELECT * FROM read_parquet('{args.gold_glob}', union_by_name=true)"
            )
        cur = conn.execute(sql)
        columns = [d[0] for d in cur.description] if cur.description else []
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]
        print(json.dumps({"columns": columns, "rows": rows}, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
