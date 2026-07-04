# Sample documents for demo

Person 4: add files here before 3 PM.

```
samples/
  good/
    receipt_01.png
    clinical_01.pdf
    ledger_01.xlsx
    ...
  bad/
    corrupt.pdf
    bad_schema.xlsx
  expected/
    clinical_01.json    # golden set for accuracy
    ...
```

Naming convention: prefix with `receipt_`, `clinical_`, or `ledger_` for auto doc-type detection.

All data must be **synthetic** — no real PII/PHI.
