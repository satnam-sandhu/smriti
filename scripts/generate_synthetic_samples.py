#!/usr/bin/env python3
"""Generate minimal synthetic banking demo documents for parser testing."""

from pathlib import Path

import openpyxl
from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "good"


def write_financial_report_pdf(path: Path) -> None:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    lines = [
        "Financial Report - Example Corp Ltd",
        "",
        "Company Name: Example Corp Ltd",
        "Report Type: Profit and Loss Statement",
        "Fiscal Period: FY 2024-25",
        "Revenue: 1,250,000.00",
        "Net Income: 185,500.00",
    ]
    for line in lines:
        pdf.cell(0, 10, line, new_x="LMARGIN", new_y="NEXT")
    pdf.output(str(path))


def write_ledger_xlsx(path: Path) -> None:
    wb = openpyxl.Workbook()
    sheet = wb.active
    sheet.title = "Sheet1"
    sheet.append(["account_id", "date", "debit", "credit", "balance"])
    sheet.append(["ACC-9001", "2026-03-01", 150.0, 0.0, 850.0])
    wb.save(path)


def write_bank_statement_png(path: Path) -> None:
    width, height = 420, 560
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
        font_sm = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
        font_sm = font

    y = 30
    draw.text((30, y), "First National Bank", fill="black", font=font)
    y += 40
    for line in [
        "Account Holder: John Doe",
        "Date: 2026-03-10",
        "Description: Wire Transfer In",
        "Amount: $1,250.00",
        "Balance: $8,450.00",
        "",
        "Thank you for banking with us.",
    ]:
        draw.text((30, y), line, fill="black", font=font_sm)
        y += 28

    img.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_financial_report_pdf(OUT / "report_01.pdf")
    write_ledger_xlsx(OUT / "ledger_01.xlsx")
    write_bank_statement_png(OUT / "statement_01.png")
    print(f"Wrote synthetic banking samples to {OUT}")


if __name__ == "__main__":
    main()
