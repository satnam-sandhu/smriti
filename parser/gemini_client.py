import base64
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-2.5-flash-preview"

SCHEMA_FIELDS = {
    "receipt": ["patient_name", "date", "amount", "diagnosis", "provider"],
    "clinical": ["patient_id", "date", "diagnosis", "medication", "physician"],
    "ledger": ["account_id", "date", "debit", "credit", "balance"],
}

MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".pdf": "application/pdf",
}


def generate_dsl(file_path: Path, doc_type: str) -> dict:
    """Generate extraction DSL via OpenRouter (Gemini multimodal), or fallback heuristics."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    fields = SCHEMA_FIELDS.get(doc_type, SCHEMA_FIELDS["clinical"])

    if api_key:
        try:
            text = _call_openrouter(api_key, model, file_path, doc_type, fields)
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception:
            pass

    return _fallback_dsl(file_path, doc_type, fields)


def _call_openrouter(
    api_key: str, model: str, file_path: Path, doc_type: str, fields: list[str]
) -> str:
    import pdfplumber
    from openai import OpenAI

    client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)

    prompt = (
        f"Analyze this document and return ONLY valid JSON for an extraction DSL.\n"
        f"Document type: {doc_type}\n"
        f"Required fields: {fields}\n"
        f'Format: {{"doc_type":"{doc_type}","fields":{{"<field>":{{"method":"regex","pattern":"..."}}}}}}\n'
        f"For Excel/ledger type use: "
        f'{{"doc_type":"{doc_type}","sheet":0,"columns":{{"field":"A"}}}}\n'
        f"Use regex patterns that match typical {doc_type} documents."
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
            doc_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        content_parts.append(
            {"type": "text", "text": f"Document text content:\n\n{doc_text[:8000]}"}
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
        messages=[{"role": "user", "content": content_parts}],
        extra_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://smriti.local"),
            "X-Title": os.getenv("OPENROUTER_APP_NAME", "Smriti"),
        },
    )

    return (response.choices[0].message.content or "").strip()


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
        "patient_name": r"Patient(?: Name)?:\s*(.+)",
        "patient_id": r"Patient ID:\s*(\S+)",
        "date": r"Date:\s*([\d\-/]+)",
        "amount": r"(?:Amount|Total):\s*\$?([\d.]+)",
        "diagnosis": r"Diagnosis:\s*(.+)",
        "medication": r"Medication:\s*(.+)",
        "physician": r"Physician:\s*(.+)",
        "provider": r"Provider:\s*(.+)",
    }

    dsl_fields = {}
    for field in fields:
        if field in patterns:
            dsl_fields[field] = {"method": "regex", "pattern": patterns[field]}

    return {"doc_type": doc_type, "fields": dsl_fields}
