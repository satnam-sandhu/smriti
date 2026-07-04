import re
from pathlib import Path

import openpyxl
import pdfplumber

from schemas import DOC_TYPE_MAP, detect_doc_type


def execute_parser(file_path: Path, dsl: dict, doc_type: str) -> dict:
    ext = file_path.suffix.lower()
    data: dict = {}

    if ext in {".png", ".jpg", ".jpeg", ".tiff"}:
        data = _extract_from_dsl_fields(dsl)
    elif ext == ".pdf":
        data = _parse_pdf(file_path, dsl)
    elif ext in {".xlsx", ".xls"}:
        data = _parse_excel(file_path, dsl)
    else:
        data = _extract_from_dsl_fields(dsl)

    model = DOC_TYPE_MAP[doc_type]()
    validated = model.model_validate({**model.model_dump(), **data})
    return validated.model_dump()


def _extract_from_dsl_fields(dsl: dict) -> dict:
    return dsl.get("extracted", dsl.get("fields", {}))


def _parse_pdf(file_path: Path, dsl: dict) -> dict:
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""

    result = {}
    for field, spec in dsl.get("fields", {}).items():
        if isinstance(spec, dict) and spec.get("method") == "regex":
            match = re.search(spec["pattern"], text, re.IGNORECASE | re.MULTILINE)
            result[field] = match.group(1).strip() if match else ""
        elif isinstance(spec, str):
            result[field] = spec
    return result


def _parse_excel(file_path: Path, dsl: dict) -> dict:
    wb = openpyxl.load_workbook(file_path, data_only=True)
    sheet_index = dsl.get("sheet", 0)
    sheet = wb.worksheets[sheet_index]
    columns = dsl.get("columns", {})
    result = {}

    header_row = 1
    col_map = {}
    for col_idx in range(1, sheet.max_column + 1):
        val = sheet.cell(header_row, col_idx).value
        if val is not None:
            col_map[str(val).strip().lower()] = col_idx

    data_row = 2
    for field, col_spec in columns.items():
        if isinstance(col_spec, str) and len(col_spec) == 1 and col_spec.isalpha():
            col_idx = openpyxl.utils.column_index_from_string(col_spec)
            val = sheet.cell(data_row, col_idx).value
        elif isinstance(col_spec, str):
            col_idx = col_map.get(col_spec.lower(), 0)
            val = sheet.cell(data_row, col_idx).value if col_idx else ""
        else:
            val = ""
        result[field] = val if val is not None else ""

    return result
