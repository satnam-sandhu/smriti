import base64
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

from schemas import SCHEMA_LABELS

load_dotenv(Path(__file__).parent.parent / ".env")

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-2.5-flash"

SCHEMA_FIELDS = {
    "statement": ["account_holder", "date", "amount", "description", "balance"],
    "report": ["company_name", "report_type", "fiscal_period", "revenue", "net_income"],
    "ledger": ["account_id", "date", "debit", "credit", "balance"],
}

MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".pdf": "application/pdf",
}

BACKUP_DSL_PATH = Path(__file__).parent.parent / "registry" / "backup_dsl.json"


def _estimate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    input_rate = float(os.getenv("OPENROUTER_INPUT_COST_PER_M", "0.10"))
    output_rate = float(os.getenv("OPENROUTER_OUTPUT_COST_PER_M", "0.40"))
    return (prompt_tokens / 1_000_000) * input_rate + (completion_tokens / 1_000_000) * output_rate


def _usage_from_response(response) -> dict | None:
    usage = getattr(response, "usage", None)
    if not usage:
        return None
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", 0) or (prompt_tokens + completion_tokens))
    return {
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": total_tokens,
        "costUsd": round(_estimate_cost(prompt_tokens, completion_tokens), 6),
    }


def generate_dsl(file_path: Path, doc_type: str) -> tuple[dict, dict | None]:
    """Generate extraction DSL via OpenRouter, backup file, or heuristics."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    fields = SCHEMA_FIELDS.get(doc_type, SCHEMA_FIELDS["report"])

    if api_key:
        try:
            text, usage = _call_openrouter(api_key, model, file_path, doc_type, fields)
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                print("DSL_SOURCE: openrouter", file=sys.stderr)
                return json.loads(match.group()), usage
            print("DSL_SOURCE: openrouter_invalid_json", file=sys.stderr)
        except Exception as e:
            print(f"DSL_SOURCE: openrouter_error ({e})", file=sys.stderr)

    backup = _load_backup_dsl(doc_type)
    if backup:
        print("DSL_SOURCE: backup", file=sys.stderr)
        return backup, None

    print("DSL_SOURCE: fallback", file=sys.stderr)
    return _fallback_dsl(file_path, doc_type, fields), None


def _call_openrouter(
    api_key: str, model: str, file_path: Path, doc_type: str, fields: list[str]
) -> tuple[str, dict | None]:
    import pdfplumber
    from openai import OpenAI

    client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
    schema_label = SCHEMA_LABELS.get(doc_type, doc_type)

    prompt = (
        f"Analyze this banking/finance document and return ONLY valid JSON for an extraction DSL.\n"
        f"Schema: {schema_label}\n"
        f"Document type key: {doc_type}\n"
        f"Required fields: {fields}\n"
        f'Format: {{"doc_type":"{doc_type}","fields":{{"<field>":{{"method":"regex","pattern":"..."}}}},'
        f'"extracted":{{"<field>":"<value from this document>"}}}}\n'
        f"For Excel/ledger type use: "
        f'{{"doc_type":"{doc_type}","sheet":0,"columns":{{"field":"A"}}}}\n'
        f"Always include extracted with values read from THIS document. "
        f"For images, extracted is required. "
        f"For financial PDFs, infer company_name and report_type from headers/title."
    )

    ext = file_path.suffix.lower()
    content_parts: list[dict] = [{"type": "text", "text": prompt}]

    if ext in {".png", ".jpg", ".jpeg", ".tiff"}:
        b64 = base64.standard_b64encode(file_path.read_bytes()).decode()
        mime = MIME_MAP.get(ext, "image/png")
        content_parts.append(
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
        )
    elif ext == ".pdf":
        with pdfplumber.open(file_path) as pdf:
            pages = pdf.pages[:3]
            doc_text = "\n".join(page.extract_text() or "" for page in pages)
        content_parts.append(
            {"type": "text", "text": f"Document text content (first pages):\n\n{doc_text[:8000]}"}
        )
    elif ext in {".xlsx", ".xls"}:
        import openpyxl

        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet = wb.worksheets[0]
        rows = []
        for row in sheet.iter_rows(max_row=15, values_only=True):
            rows.append("\t".join(str(c) if c is not None else "" for c in row))
        content_parts.append(
            {"type": "text", "text": f"Spreadsheet preview:\n\n" + "\n".join(rows)}
        )
    else:
        content_parts.append(
            {"type": "text", "text": file_path.read_text(errors="replace")[:8000]}
        )

    response = client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content_parts}],
        extra_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://smriti.local"),
            "X-Title": os.getenv("OPENROUTER_APP_NAME", "Smriti"),
        },
    )

    text = (response.choices[0].message.content or "").strip()
    return text, _usage_from_response(response)


def _load_backup_dsl(doc_type: str) -> dict | None:
    if not BACKUP_DSL_PATH.exists():
        return None
    try:
        data = json.loads(BACKUP_DSL_PATH.read_text())
        dsl = data.get(doc_type)
        return dsl if isinstance(dsl, dict) else None
    except (json.JSONDecodeError, OSError):
        return None


def _fallback_dsl(file_path: Path, doc_type: str, fields: list[str]) -> dict:
    """Deterministic fallback DSL when OpenRouter unavailable."""
    if doc_type == "ledger":
        return {
            "doc_type": doc_type,
            "sheet": 0,
            "columns": {
                "account_id": "A",
                "date": "B",
                "debit": "C",
                "credit": "D",
                "balance": "E",
            },
        }

    patterns = {
        "account_holder": r"Account Holder:\s*(.+)",
        "company_name": r"Company Name:\s*(.+)",
        "report_type": r"Report Type:\s*(.+)",
        "fiscal_period": r"Fiscal Period:\s*(.+)",
        "date": r"Date:\s*([\d\-/]+)",
        "amount": r"Amount:\s*\$?([\d,\.]+)",
        "description": r"Description:\s*(.+)",
        "balance": r"Balance:\s*\$?([\d,\.]+)",
        "revenue": r"Revenue:\s*\$?([\d,\.]+)",
        "net_income": r"Net Income:\s*\$?([\d,\.]+)",
    }

    dsl_fields = {}
    for field in fields:
        if field in patterns:
            dsl_fields[field] = {"method": "regex", "pattern": patterns[field]}

    if doc_type == "report" and "company_name" not in dsl_fields:
        stem = file_path.stem.replace("_", " ")
        return {
            "doc_type": doc_type,
            "fields": dsl_fields,
            "extracted": {
                "company_name": stem,
                "report_type": _guess_report_type(file_path.name),
                "fiscal_period": "",
                "revenue": 0.0,
                "net_income": 0.0,
            },
        }

    return {"doc_type": doc_type, "fields": dsl_fields}


def _guess_report_type(file_name: str) -> str:
    lower = file_name.lower()
    if "balance sheet" in lower or " bs" in lower or lower.endswith("bs.pdf"):
        return "Balance Sheet"
    if "cash flow" in lower or " cf" in lower or lower.endswith("cf.pdf"):
        return "Cash Flow Statement"
    if "p&l" in lower or "profit" in lower or lower.endswith("pl.pdf"):
        return "Profit and Loss"
    return "Financial Report"
