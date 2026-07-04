# Person 2 — Parser & AI (Full Stack · Wow #1 Owner)

**You own:** "AI once → deterministic forever" — the killer demo moment.

**Time:** 2:00 PM → 6:00 PM demo  
**Wow moment:** Unknown annual report → OpenRouter learns DSL → re-drop same file → instant parse, **0 LLM calls**

**Demo plugin:** **Finance (Banking)** — not Healthcare.

---

## Your stack

- **OpenRouter** API — default model `google/gemini-2.5-flash` (multimodal via OpenAI SDK; `*-preview` IDs may 404 on OpenRouter)
- Python — `parser/gemini_client.py` handles OpenRouter calls
- Python (recommended) or Node — whatever integrates fastest with Person 1
- Pydantic schemas for **Banking** plugin
- SQLite `parser_registry` table (or share Person 1's DB)

---

## Demo data

Primary batch (real PDFs):

```
data/external/annual reports/
  Infosys Integrated Annual Report 2024-25 - Consolidated P&L.pdf
  piramal-finance-ltd-annual-report-2024-2025 - Consolidated Balance Sheet.pdf
  PL.pdf, BS.pdf, CF.pdf
  ...
```

18 PDFs today — P&L, Balance Sheet, Cash Flow statements. All map to **FinancialReport** schema.

Dev / fallback synthetics still in `samples/good/` until ledger Excel + bank statement images are added.

---

## Schemas (Banking · 3 types)

Define 3 schemas (5–8 fields each). **Target field names** (update `parser/schemas.py` to match):

| Schema | doc_type | File types | Fields |
|--------|----------|------------|--------|
| `FinancialReport` | `report` | PDF | company_name, report_type, fiscal_period, revenue, net_income |
| `AccountLedger` | `ledger` | Excel | account_id, date, debit, credit, balance |
| `BankStatement` | `statement` | Image | account_holder, date, amount, description, balance |

**Fingerprint:** SHA256 of `(doc_type + first_500_bytes_of_file)`. Prefixes `report_`, `ledger_`, `statement_` for doc-type detection (`clinical_` / `receipt_` legacy aliases OK).

**Registry table:** `fingerprint`, `doc_type`, `dsl_json`, `created_at` (PK = fingerprint).

---

## Hour-by-hour

### 2:00–2:30 — Schemas + registry

- [x] Pick **Finance (Banking)** plugin
- [ ] Align Pydantic models in `schemas.py` to banking field names above
- [x] `parser_registry` SQLite table
- [x] Fingerprint implemented in `registry.py`

### 2:30–3:30 — OpenRouter → DSL (first run)

- [x] Prompt: doc + target schema → **Extraction DSL JSON** via OpenRouter
- [x] Images: multimodal `image_url`
- [x] PDF/Excel: text preview (pdfplumber / openpyxl)
- [x] `generate_dsl(file_path, doc_type)` — one OpenRouter call per new fingerprint

### 3:30–4:30 — Deterministic executor (second run)

- [x] `execute_parser(file_path, dsl_json)` — zero LLM calls
- [x] Regex / openpyxl / pdfplumber per DSL
- [x] Pydantic validate → `{ silverJson, parserPath }` or `SCHEMA_MISMATCH`

- [x] Entry point for Person 1: `parser/cli.py` → `parse_document()`

```python
def parse_document(file_path: str, doc_type: str) -> dict:
    fp = compute_fingerprint(file_path, doc_type)
    existing = registry.lookup(fp)
    if existing:
        result = execute_parser(file_path, existing.dsl_json)
        return { **result, "parserPath": "deterministic" }
    else:
        dsl = generate_dsl(file_path, doc_type)  # OpenRouter
        registry.save(fp, doc_type, dsl)
        result = execute_parser(file_path, dsl)
        return { **result, "parserPath": "ai" }
```

### 4:30–5:00 — Accuracy for dashboard

- [ ] Expected JSON in `samples/expected/{filename}.json` for files we score
- [x] `compute_accuracy(extracted, expected) → float` in `cli.py`
- [ ] Golden set for 2–3 annual reports (company_name, report_type, fiscal_period at minimum)

### 5:00–5:30 — Demo prep (critical)

- [ ] **Pre-seed registry** for 2 PDF templates before demo (e.g. one Infosys + one Piramal report)
- [ ] Leave **1 PDF unseeded** for live OpenRouter learn on stage (e.g. `PL.pdf` or Punjab coop report)
- [x] Test: parse same file twice → second call `LLM_CALL: no`

### 5:30–6:00 — Standby

- [ ] Pair with Person 1 — wire `parse_document` into `process_batch`
- [x] OpenRouter fallback: `registry/backup_dsl.json`

---

## Demo script (you narrate 4–8 min segment)

1. Drop **unknown annual report PDF** → logs `LLM_CALL: yes` → DSL saved
2. Drop **same file again** → logs `LLM_CALL: no` → badge "Deterministic ⚡"
3. Optional: batch-drop `data/external/annual reports/` → mix of pre-seeded + first-time learns
4. Line: "Production saves LLM cost — learn once, run forever"

---

## File ownership

```
parser/
  schemas.py          # Pydantic models (→ banking fields)
  gemini_client.py    # generate_dsl
  executor.py         # execute_parser (deterministic)
  registry.py         # fingerprint + SQLite
  cli.py              # parse_document entry point (Person 1 calls this)
data/external/
  annual reports/     # Demo PDF batch (real public filings)
registry/backup_dsl.json   # fallback if API fails
```

---

## Do NOT build

- Tauri commands (Person 1 wraps yours)
- Dashboard UI
- MCP server
- More than 3 schemas
- Perfect table extraction on 40-page PDFs — best-effort on first page / header block OK

---

## Done by 6 PM

- [x] 1 live-learn + 1 deterministic re-parse proven with log output
- [ ] PDF annual reports parse reliably (≥3 fields on short reports like `PL.pdf`)
- [ ] Excel ledger + bank statement image when samples available
- [x] Validation errors return `SCHEMA_MISMATCH` not crash
- [x] `parserPath` correctly reported to Person 1

---

## If blocked

| Blocker | Fallback |
|---------|----------|
| OpenRouter slow/down | Pre-generate DSLs; live demo = re-parse only via `backup_dsl.json` |
| Long PDF parsing hard | OpenRouter regex on first-page text; pdfplumber page 0 only |
| Excel nested tabs | Sheet1 only for demo |
| Bank statement OCR bad | Use printed statement screenshot, not handwritten |
| Annual report field mismatch | Score accuracy on subset: company_name, report_type, fiscal_period |
