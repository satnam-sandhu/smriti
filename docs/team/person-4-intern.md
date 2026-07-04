# Person 4 — Demo Data, QA & MCP (Intern)

**You own:** demo doesn't break because of bad data. You support integration — you don't block critical path.

**Time:** 2:00 PM → 6:00 PM demo  
**Wow moments you enable:** #4 (failure demo files), bonus MCP call, smooth presentation

---

## Priority order

1. **Sample docs ready by 3:00 PM** — team blocked without these
2. **Expected JSON (golden set) by 3:30 PM**
3. **Manual QA + bug list by 5:15 PM**
4. **MCP tools if time left**
5. **Demo script + intro by 5:30 PM**

---

## Hour-by-hour

### 2:00–3:00 — Sample documents (P0 · do this first)

**Primary demo batch:** `data/external/annual reports/` — 18 real PDF annual reports (already in repo).

Create / maintain `samples/` for synthetics, golden JSON, and bad files:

```
samples/
  good/
    statement_01.png        # printed bank statement
    statement_02.png
    report_01.pdf         # synthetic financial report (dev fallback)
    report_02.pdf
    ledger_01.xlsx
    ledger_02.xlsx
    statement_01.png      # synthetic bank statement
    statement_02.png
  bad/
    corrupt.pdf             # truncate a PDF (copy first 2KB of real PDF)
    bad_schema.xlsx         # wrong column names vs schema
  expected/
    statement_01.json       # expected extracted fields
    report_01.json
    PL.json                 # golden set for external annual report
    ...
  DEMO_FILES.txt            # ordered list for demo drop
```

**Rules:**
- Public annual reports in `data/external/` — OK for demo
- Synthetics: fake names only ("Jane Doe Holdings", "Test Account 9001")
- File names prefixed by type (`report_`, `ledger_`, `statement_`) for parser doc-type detection
- `corrupt.pdf` must fail gracefully
- `bad_schema.xlsx` should trigger validation error, not crash
- Do **not** rename files in `data/external/annual reports/` after Person 2 pre-seeds registry

**Quick ways to create files:**
- PDF: use `data/external/annual reports/` OR export from Google Docs
- Excel: Google Sheets → .xlsx with account_id, date, debit, credit, balance
- Bank statement image: Canva template or screenshot a fake statement
- Corrupt PDF: `head -c 2048 "data/external/annual reports/PL.pdf" > samples/bad/corrupt.pdf`

### 3:00–3:30 — Expected JSON (golden set)

For each file in `samples/good/`, create matching `samples/expected/{same_name}.json`:

```json
{
  "company_name": "Infosys Limited",
  "report_type": "Consolidated Profit and Loss",
  "fiscal_period": "2024-25",
  "revenue": "",
  "net_income": ""
}
```

- [ ] 6 good files → 6 expected JSON files
- [ ] Tell Person 2 which fields matter (match your schemas)
- [ ] Slack Person 1: "samples ready in repo"

### 3:30–4:30 — QA tester (stay useful without blocking devs)

- [ ] Run app every time Person 1 says "try now"
- [ ] Log bugs in `docs/team/BUGS.md`:

```markdown
| Time | Who | Issue | Severity |
|------|-----|-------|----------|
| 3:45 | P1  | batch stops on corrupt | P0 |
```

- [ ] Test checklist (repeat until demo):

```
[ ] Drop 6 good files → all complete
[ ] Drop corrupt.pdf alone → quarantined, no crash
[ ] Drop bad_schema.xlsx → validation error, no crash
[ ] Drop good + bad mixed → good succeed, bad fail
[ ] Re-drop annual report PDF → deterministic badge (e.g. pre-seeded Infosys P&L)
[ ] Dashboard numbers update
[ ] Extraction tab shows JSON
```

- [ ] Do NOT fix code unless asked — report bugs fast

### 4:30–5:15 — MCP (only if QA passing)

If app works, set up NitroStudio MCP with **3 tools** (copy from Person 1 commands):

| Tool | Wraps |
|------|-------|
| `upload_document` | `ingest_files` + `process_batch` for one file |
| `get_pipeline_metrics` | `get_metrics` |
| `analytics_query` | `run_analytics_query` |

- [ ] If MCP unfamiliar: skip entirely — not P0
- [ ] Person 4 can demo MCP in last 1 min OR Person 1 runs SQL instead

### 5:15–5:30 — Demo script + intro

Create `docs/team/DEMO_RUNBOOK.md`:

```markdown
# Smriti Demo Runbook — 15 min

## Before judges (5:45 PM)
- [ ] App open, maximized
- [ ] samples/good/ batch pre-staged on desktop
- [ ] corrupt.pdf separate
- [ ] OpenRouter API key in `.env` working OR backup DSL confirmed
- [ ] One pre-run completed

## Script
| Min | Speaker | Action |
|-----|---------|--------|
| 0-1 | P4 (you) | Intro problem |
| 1-2 | P3 | Drop 5 good files |
| ... | ... | ... |

## Backup if OpenRouter fails
- Say "we pre-learned this template" → drop second Infosys/Piramal report → show deterministic

## Backup if app crashes
- Show backup screen recording (record during 5:30 dry run)
```

- [ ] Write 1-min intro (you speak):
  > "Enterprises drown in PDFs, Excel, and scanned bank documents. Smriti ingests messy financial filings into a queryable data lake — AI learns each layout once, then runs deterministic forever. Local-first, no repeated LLM cost."

### 5:30–5:45 — Dry run

- [ ] Full demo once with team
- [ ] **Screen record this** (`QuickTime → New Screen Recording`) — backup if live fails
- [ ] Note any timing issues in runbook

### 5:45–6:00 — Demo support

- [ ] You speak intro (0–1 min)
- [ ] You narrate failure demo (8–10 min) if assigned
- [ ] You run MCP or backup video if needed
- [ ] Keep `BUGS.md` and `DEMO_RUNBOOK.md` open on second screen

---

## Files you own

```
samples/                  P0 — create by 3 PM
samples/expected/         P0 — create by 3:30 PM
docs/team/BUGS.md         P1 — ongoing
docs/team/DEMO_RUNBOOK.md P0 — by 5:30 PM
mcp/                      P2 — only if time
```

---

## Do NOT

- Touch parser logic or Tauri Rust unless dev asks
- Add new features
- Rename sample files after 3 PM (breaks fingerprint)
- Use real **public** annual reports in `data/external/` — OK
- No private account numbers or customer PII

---

## Done by 6 PM

- [ ] 6 good + 2 bad sample files in repo
- [ ] Expected JSON for golden set
- [ ] Full QA checklist passed once
- [ ] Demo runbook written
- [ ] Backup screen recording saved
- [ ] Intro memorized (1 min)

---

## If overwhelmed — minimum viable intern contribution

Skip MCP entirely. Just deliver:

1. `samples/` folder by **3:00 PM**
2. QA + bug reporting **3:30–5:30**
3. Intro + runbook by **5:30 PM**

That's enough. Samples late = whole team blocked — prioritize those.
