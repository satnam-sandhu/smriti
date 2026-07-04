#!/usr/bin/env python3
"""CLI entry point — called by Tauri pipeline for document parsing."""

import argparse
import json
import sys
from pathlib import Path

# Allow imports when invoked from project root
sys.path.insert(0, str(Path(__file__).parent))

from executor import IMAGE_EXTS, execute_parser
from gemini_client import generate_dsl
from registry import fingerprint, lookup, save
from schemas import detect_doc_type


def compute_accuracy(extracted: dict, expected_path: Path) -> float | None:
    if not expected_path.exists():
        return None
    expected = json.loads(expected_path.read_text())
    if not expected:
        return None
    total = len(expected)
    correct = sum(
        1 for k, v in expected.items() if str(extracted.get(k, "")).strip() == str(v).strip()
    )
    return round((correct / total) * 100, 1) if total else None


def parse_document(file_path: Path, expected_path: Path | None = None) -> dict:
    doc_type = detect_doc_type(file_path.name)
    fp = fingerprint(file_path, doc_type)
    existing = lookup(fp)

    if existing:
        print("LLM_CALL: no", file=sys.stderr)
        try:
            silver = execute_parser(file_path, existing, doc_type)
            accuracy = compute_accuracy(silver, expected_path) if expected_path else None
            return {
                "parserPath": "deterministic",
                "silverJson": silver,
                "accuracyPct": accuracy,
                "errorCode": None,
                "errorDetail": None,
            }
        except Exception as e:
            return {
                "parserPath": "deterministic",
                "silverJson": {},
                "accuracyPct": None,
                "errorCode": "VALIDATION_ERROR",
                "errorDetail": str(e),
            }

    print("LLM_CALL: yes", file=sys.stderr)
    dsl = generate_dsl(file_path, doc_type)

    try:
        silver = execute_parser(file_path, dsl, doc_type)
        if file_path.suffix.lower() in IMAGE_EXTS:
            dsl = {**dsl, "extracted": silver}
        save(fp, doc_type, dsl)
        accuracy = compute_accuracy(silver, expected_path) if expected_path else None
        return {
            "parserPath": "ai",
            "silverJson": silver,
            "accuracyPct": accuracy,
            "errorCode": None,
            "errorDetail": None,
        }
    except Exception as e:
        save(fp, doc_type, dsl)
        return {
            "parserPath": "ai",
            "silverJson": {},
            "accuracyPct": None,
            "errorCode": "SCHEMA_MISMATCH",
            "errorDetail": str(e),
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--expected", type=Path, default=None)
    args = parser.parse_args()

    expected = args.expected if args.expected and args.expected.is_file() else None
    result = parse_document(args.file, expected)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
