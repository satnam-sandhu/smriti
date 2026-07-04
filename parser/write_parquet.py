#!/usr/bin/env python3
"""Convert Silver JSON to Gold Parquet."""

import argparse
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--meta", default="{}", help="JSON metadata merged into row")
    args = parser.parse_args()

    data = json.loads(args.input.read_text())
    meta = json.loads(args.meta)
    row = {**data, **meta}
    table = pa.Table.from_pylist([row])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, args.output, compression="snappy")


if __name__ == "__main__":
    main()
