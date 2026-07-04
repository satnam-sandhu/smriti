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

    try:
        conn = duckdb.connect()
        result = conn.execute(sql).fetchdf()
        columns = list(result.columns)
        rows = result.to_dict(orient="records")
        print(json.dumps({"columns": columns, "rows": rows}, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
