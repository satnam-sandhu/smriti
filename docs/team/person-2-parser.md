# Person 2 — Parser & AI (Full Stack · Wow #1 Owner)

**You own:** "AI once → deterministic forever" — the killer demo moment.

**Time:** 2:00 PM → 6:00 PM demo  
**Wow moment:** Unknown doc → OpenRouter learns DSL → re-drop same doc → instant parse, **0 LLM calls**

---

## Your stack

- **OpenRouter** API — default model `google/gemini-2.5-flash-preview` (multimodal via OpenAI SDK)
- Python — `parser/gemini_client.py` handles OpenRouter calls
- Python (recommended) or Node — whatever integrates fastest with Person 1
- Pydantic schemas for Healthcare plugin
- SQLite `parser_registry` table (or share Person 1's DB)

---

## Hour-by-hour

### 2:00–2:30 — Schemas + registry

- [ ] Pick **Healthcare** plugin. Define 3 schemas (keep fields minimal — 5–8 fields each):

| Schema | Doc type | Example fields |
|--------|----------|----------------|
| `MedicalReceipt` | Image | patient_name, date, amount, diagnosis, provider |
| `ClinicalPdf` | PDF | patient_id, date, diagnosis, medication, physician |
| `PatientLedger` | Excel | account_id, date, debit, credit, balance |

- [ ] `parser_registry` table:
  - `template_id`, `doc_type`, `fingerprint`, `dsl_json`, `created_at`
- [ ] **Fingerprint hackathon shortcut:** hash of `(doc_type + first_500_chars_of_text)` or filename prefix `receipt_`, `clinical_`, `ledger_` — pick one, document it

### 2:30–3:30 — OpenRouter → DSL (first run)

- [ ] Write one prompt: send doc + target schema → get back **Extraction DSL JSON** via OpenRouter
- [ ] For images: multimodal via OpenRouter `image_url` content
- [ ] For PDF/Excel: text preview sent to model (pdfplumber / openpyxl)
- [ ] Function: `generate_parser(file_path, doc_type) → dsl_json` — **calls OpenRouter once**

### 3:30–4:30 — Deterministic executor (second run)

- [ ] Function: `execute_parser(file_path, dsl_json) → dict` — **zero LLM calls**
- [ ] Apply regex / openpyxl / pdfplumber / whatever matches DSL
- [ ] Validate output with Pydantic → return `{ json, parserPath: "deterministic" }` or validation error

- [ ] Main entry point for Person 1:

```python
def parse_document(file_path: str, doc_type: str) -> dict:
    fp = compute_fingerprint(file_path, doc_type)
    existing = registry.lookup(fp)
    if existing:
        result = execute_parser(file_path, existing.dsl_json)
        return { **result, "parserPath": "deterministic" }
    else:
        dsl = generate_parser(file_path, doc_type)  # OpenRouter
        registry.save(fp, doc_type, dsl)
        result = execute_parser(file_path, dsl)
        return { **result, "parserPath": "ai" }
```

### 4:30–5:00 — Accuracy for dashboard

- [ ] Person 4 provides `samples/expected/{filename}.json`
- [ ] Function: `compute_accuracy(extracted, expected) → float` (field match %)
- [ ] Return accuracy per file; Person 1 aggregates for dashboard

### 5:00–5:30 — Demo prep (critical)

- [ ] **Pre-seed registry** for 2 doc types before demo (PDF + Excel)
- [ ] Leave **1 doc type unseeded** for live OpenRouter learn on stage (or 1 receipt image)
- [ ] Test: parse same file twice → second call must NOT hit LLM (log: `LLM_CALL: yes/no`)

### 5:30–6:00 — Standby

- [ ] Pair with Person 1 — wire `parse_document` into `process_batch`
- [ ] If OpenRouter fails live: fall back to pre-saved DSL in repo (`registry/backup_dsl.json`)

---

## Demo script (you narrate 4–8 min segment)

1. Drop unknown receipt → logs show `LLM_CALL: yes` → DSL saved
2. Drop **same file again** → logs show `LLM_CALL: no` → badge "Deterministic ⚡"
3. Mention: "Production saves LLM cost — learn once, run forever"

---

## File ownership

```
parser/
  schemas.py          # Pydantic models
  gemini_client.py    # generate_parser
  executor.py         # execute_parser (deterministic)
  registry.py         # fingerprint + SQLite
  parse.py            # parse_document entry point
registry/backup_dsl.json   # fallback if API fails
```

---

## Do NOT build

- Tauri commands (Person 1 wraps yours)
- Dashboard UI
- MCP server
- More than 3 schemas
- Perfect OCR on handwriting — best-effort OK

---

## Done by 6 PM

- [ ] 1 live-learn + 1 deterministic re-parse proven with log output
- [ ] PDF + Excel parse reliably on Person 4's samples
- [ ] Image receipt parses ≥70% fields (good enough)
- [ ] Validation errors return `SCHEMA_MISMATCH` not crash
- [ ] `parserPath` correctly reported to Person 1

---

## If blocked

| Blocker | Fallback |
|---------|----------|
| OpenRouter slow/down | Pre-generate all DSLs; live demo = re-parse only |
| PDF parsing hard | OpenRouter returns regex DSL; fallback heuristics in `gemini_client.py` |
| Excel nested tabs | Only parse Sheet1 for demo |
| Handwriting OCR bad | Use printed receipt image, not handwritten |
