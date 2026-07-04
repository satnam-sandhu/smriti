from pydantic import BaseModel, Field

ACTIVE_PLUGIN = "finance"

# Internal doc_type keys used by parser registry + fingerprinting
DOC_TYPES = {
    "report": "financial report (PDF)",
    "ledger": "account ledger (Excel)",
    "statement": "bank statement (image)",
}


class BankStatement(BaseModel):
    account_holder: str = Field(default="")
    date: str = Field(default="")
    amount: float = Field(default=0.0)
    description: str = Field(default="")
    balance: float = Field(default=0.0)


class FinancialReport(BaseModel):
    company_name: str = Field(default="")
    report_type: str = Field(default="")
    fiscal_period: str = Field(default="")
    revenue: float = Field(default=0.0)
    net_income: float = Field(default=0.0)


class AccountLedger(BaseModel):
    account_id: str = Field(default="")
    date: str = Field(default="")
    debit: float = Field(default=0.0)
    credit: float = Field(default=0.0)
    balance: float = Field(default=0.0)


DOC_TYPE_MAP = {
    "statement": BankStatement,
    "report": FinancialReport,
    "ledger": AccountLedger,
}

SCHEMA_LABELS = DOC_TYPES


def detect_doc_type(file_name: str) -> str:
    lower = file_name.lower()
    if lower.startswith(("statement", "receipt")):
        return "statement"
    if lower.startswith(("report", "clinical")):
        return "report"
    if lower.startswith("ledger"):
        return "ledger"
    if lower.endswith((".png", ".jpg", ".jpeg", ".tiff")):
        return "statement"
    if lower.endswith(".pdf"):
        return "report"
    if lower.endswith((".xlsx", ".xls")):
        return "ledger"
    return "report"
