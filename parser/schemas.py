from pydantic import BaseModel, Field
from typing import Optional


class MedicalReceipt(BaseModel):
    patient_name: str = Field(default="")
    date: str = Field(default="")
    amount: float = Field(default=0.0)
    diagnosis: str = Field(default="")
    provider: str = Field(default="")


class ClinicalPdf(BaseModel):
    patient_id: str = Field(default="")
    date: str = Field(default="")
    diagnosis: str = Field(default="")
    medication: str = Field(default="")
    physician: str = Field(default="")


class PatientLedger(BaseModel):
    account_id: str = Field(default="")
    date: str = Field(default="")
    debit: float = Field(default=0.0)
    credit: float = Field(default=0.0)
    balance: float = Field(default=0.0)


DOC_TYPE_MAP = {
    "receipt": MedicalReceipt,
    "clinical": ClinicalPdf,
    "ledger": PatientLedger,
}


def detect_doc_type(file_name: str) -> str:
    lower = file_name.lower()
    if lower.startswith("receipt"):
        return "receipt"
    if lower.startswith("clinical"):
        return "clinical"
    if lower.startswith("ledger"):
        return "ledger"
    if lower.endswith((".png", ".jpg", ".jpeg", ".tiff")):
        return "receipt"
    if lower.endswith(".pdf"):
        return "clinical"
    if lower.endswith((".xlsx", ".xls")):
        return "ledger"
    return "clinical"
