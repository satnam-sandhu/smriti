# Sample documents

**Demo plugin: Finance (Banking).** Real PDF batch lives in `data/external/annual reports/`.

```
samples/
  good/
    report_01.pdf           # synthetic financial report (dev fallback)
    ledger_01.xlsx          # synthetic account ledger
    statement_01.png        # synthetic bank statement
  bad/
    corrupt.pdf
    bad_schema.xlsx
  expected/
    report_01.json
    PL.json                 # golden set for external annual report
```

## Naming convention

| Prefix | Schema | doc_type |
|--------|--------|----------|
| `report_` or `.pdf` | FinancialReport | `report` |
| `ledger_` | AccountLedger | `ledger` |
| `statement_` | BankStatement | `statement` |

Legacy aliases `clinical_` / `receipt_` still detected for backward compatibility.

## Primary demo source

```
data/external/annual reports/*.pdf
```

## Expected JSON example (FinancialReport)

```json
{
  "company_name": "Infosys Limited",
  "report_type": "Consolidated Profit and Loss",
  "fiscal_period": "2024-25",
  "revenue": "",
  "net_income": ""
}
```

## Data policy

- Public annual reports in `data/external/` — OK
- Synthetics: fake names only
- No private banking PII
