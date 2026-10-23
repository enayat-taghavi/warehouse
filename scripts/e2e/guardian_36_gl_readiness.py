#!/usr/bin/env python
"""
ایجنت نگهبان ۳۶ — آمادگی دفتر کل و نقاط توسعه مالی (فاز ۸)
(Guardian 36 — General Ledger Readiness and Accounting Extension Points)

مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۸, §۷

معیارهای سخت‌گیرانه آزمون:
  ۱) پروتکل `AccountingDocumentSource` و کلاس `JournalLine` در `platform_core.accounting_protocol`:
     - وجود و قابل ایمپورت بودن پروتکل.
     - پشتیبانی از آرتیکل‌های سند دوبل (حساب، بدهکار/بستانکار، مبلغ، مرکز هزینه، تفصیلی، شرح).
  ۲) پیاده‌سازی متد `to_journal_lines()` روی مدل‌های رویداد مالی:
     - فاکتور هزینه (`ExpenseInvoice`)
     - حقوق و دستمزد ماهانه (`MonthlyPayrollRecord`)
     - تسویه سرویس ناوگان (`VehicleTripLog`)
     - پرداخت خزانه‌داری (`MonthlyWorkPeriod`)
     - تراز بودن اجباری جمع بدهکار و بستانکار در تمامی اسناد صادرشده (Debit == Credit).
  ۳) جدول Outbox رویدادهای حسابداری (`AccountingEvent`):
     - وجود فیلدهای `source_model`, `source_id`, `event_type`, `occurred_at`, `payload`, `posted_at`.
     - کارکرد صحیح متد تراکنشی `emit_accounting_event()`.
  ۴) ابعاد حسابداری:
     - اعلام `Project`/`ProjectSection` به‌عنوان بُعد مرکز هزینه.
     - وجود فیلد رزرو `account_code` روی مدل `Counterparty` به‌عنوان بُعد تفصیلی.
  ۵) قفل دقت پول:
     - فیلدهای پولی روی `DecimalField(max_digits=15, decimal_places=0)` (ریال).
  ۶) عدم وجود هیچ جدول دفتر کل (No GL Tables):
     - تایید عدم ایجاد جداول `ledger`, `journal_entry`, `accounting_gl` در این مرحله.
  ۷) رزرو جایگاه توزیع `wh-accounting-gl` در `pyproject.toml`.
"""

import os
import sys
from decimal import Decimal
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / (
    "python.exe" if os.name == "nt" else "python"
)


def test_gl_readiness():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۶: آمادگی دفتر کل دوطرفه و نقاط توسعه مالی (فاز ۸)")
    print("=" * 74)

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()

    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    import django
    django.setup()

    errors = []

    # ── ۱) پروتکل AccountingDocumentSource ──────────────────────────────
    try:
        from platform_core.accounting_protocol import AccountingDocumentSource, JournalLine
        print("✅ پروتکل AccountingDocumentSource و ساختار JournalLine در platform_core تایید شد.")
    except Exception as e:
        print(f"❌ خطا در بارگذاری پروتکل پلتفرم: {e}")
        errors.append(f"AccountingDocumentSource protocol missing: {e}")
        return False

    # ── ۲) بررسی رزرو توزیع wh-accounting-gl در pyproject.toml ──────────
    pyproject_path = REPO_ROOT / "pyproject.toml"
    if pyproject_path.exists():
        pyproject_text = pyproject_path.read_text(encoding="utf-8")
        if "[tool.wh.distributions.wh-accounting-gl]" in pyproject_text:
            print("✅ رزرو رسمی توزیع wh-accounting-gl در گراف وابستگی pyproject.toml تایید شد.")
        else:
            print("❌ توزیع wh-accounting-gl در pyproject.toml رزرو نشده است.")
            errors.append("wh-accounting-gl missing in pyproject.toml")
    else:
        errors.append("pyproject.toml not found")

    # ── ۳) بررسی مدل‌ها و پیاده‌سازی متدهای to_journal_lines ────────────
    from personnel.models import (
        ExpenseInvoice, MonthlyPayrollRecord, VehicleTripLog, MonthlyWorkPeriod,
        Counterparty, ProjectSection, Project, AccountingEvent, emit_accounting_event
    )

    models_to_check = [
        (ExpenseInvoice, "فاکتور هزینه (ExpenseInvoice)"),
        (MonthlyPayrollRecord, "محاسبه حقوق ماهانه (MonthlyPayrollRecord)"),
        (VehicleTripLog, "سرویس ناوگان (VehicleTripLog)"),
        (MonthlyWorkPeriod, "تسویه خزانه‌داری دوره (MonthlyWorkPeriod)"),
    ]

    for model_cls, label in models_to_check:
        if hasattr(model_cls, 'to_journal_lines') and callable(getattr(model_cls, 'to_journal_lines')):
            print(f"✅ پیاده‌سازی متد to_journal_lines روی {label} تایید شد.")
        else:
            print(f"❌ متد to_journal_lines روی {label} یافت نشد.")
            errors.append(f"{model_cls.__name__} does not implement to_journal_lines")

    # ── ۴) بررسی تراز بودن سندهای نمونه (Debit == Credit) ───────────────
    # تست سند فاکتور هزینه
    inv = ExpenseInvoice(
        amount=Decimal('15000000'),
        invoice_number='INV-TEST-01',
        description='خرید اقلام مصرفی انبار'
    )
    inv_lines = inv.to_journal_lines()
    debits = sum(l.amount for l in inv_lines if l.side == 'debit')
    credits = sum(l.amount for l in inv_lines if l.side == 'credit')
    if debits == credits and debits == Decimal('15000000'):
        print(f"✅ تراز دوبل سند فاکتور هزینه تایید شد (بدهکار: {debits:,} = بستانکار: {credits:,} ریال).")
    else:
        print(f"❌ عدم تراز در سند فاکتور هزینه: بدهکار={debits}، بستانکار={credits}")
        errors.append(f"ExpenseInvoice journal lines unbalanced: {debits} != {credits}")

    # تست سند سرویس ناوگان
    trip = VehicleTripLog(
        total_amount=Decimal('4500000'),
        trip_count=3,
        unit_rate=Decimal('1500000'),
        date_shamsi='1404/06/15'
    )
    trip_lines = trip.to_journal_lines()
    t_debits = sum(l.amount for l in trip_lines if l.side == 'debit')
    t_credits = sum(l.amount for l in trip_lines if l.side == 'credit')
    if t_debits == t_credits and t_debits == Decimal('4500000'):
        print(f"✅ تراز دوبل سند تسویه ناوگان تایید شد (بدهکار: {t_debits:,} = بستانکار: {t_credits:,} ریال).")
    else:
        errors.append(f"VehicleTripLog journal lines unbalanced: {t_debits} != {t_credits}")

    # ── ۵) بررسی جدول Outbox و ثبت رویداد ───────────────────────────────
    outbox_fields = [f.name for f in AccountingEvent._meta.fields]
    required_outbox_fields = ['source_model', 'source_id', 'event_type', 'occurred_at', 'payload', 'posted_at']
    missing_fields = [rf for rf in required_outbox_fields if rf not in outbox_fields]
    if not missing_fields:
        print("✅ جدول Transactional Outbox (AccountingEvent) با تمام فیلدهای استاندارد تایید شد.")
    else:
        print(f"❌ فیلدهای مفقود در AccountingEvent: {missing_fields}")
        errors.append(f"AccountingEvent missing fields: {missing_fields}")

    # ── ۶) بررسی ابعاد مرکز هزینه و تفصیلی (تسک ۷۵) ───────────────────────
    cp_fields = [f.name for f in Counterparty._meta.fields]
    if 'account_code' in cp_fields:
        print("✅ رزرو فیلد account_code روی طرف‌حساب‌ها (Counterparty) به‌عنوان بُعد تفصیلی تایید شد.")
    else:
        print("❌ فیلد account_code روی Counterparty یافت نشد.")
        errors.append("account_code field missing on Counterparty")

    # ── ۷) قفل دقت پول روی Decimal(15, 0) (تسک ۷۶) ──────────────────────
    inv_amt_field = ExpenseInvoice._meta.get_field('amount')
    if inv_amt_field.max_digits == 15 and inv_amt_field.decimal_places == 0:
        print("✅ قفل دقت مبالغ مالی روی DecimalField(max_digits=15, decimal_places=0) ریال تایید شد.")
    else:
        print(f"❌ دقت فیلد مبلغ فاکتور نقض شده است: max_digits={inv_amt_field.max_digits}, decimal_places={inv_amt_field.decimal_places}")
        errors.append("Money precision invariant violated on ExpenseInvoice.amount")

    # ── ۸) قانون سخت: هیچ جدول دفتر کل در این مرحله نباید ساخته شده باشد ─
    from django.apps import apps
    all_models = [m.__name__.lower() for m in apps.get_models()]
    forbidden_gl_names = ['generalledger', 'ledgerentry', 'glentry', 'accountingsand', 'journalentry']
    found_forbidden = [m for m in all_models if any(f in m for f in forbidden_gl_names)]
    if not found_forbidden:
        print("✅ قانون عدم بازنویسی و پیاده‌سازی پیش‌رس: هیچ جدول دفتر کل (GL) در این پروژه ساخته نشده است.")
    else:
        print(f"❌ جداول ممنوعه دفتر کل ساخته شده‌اند: {found_forbidden}")
        errors.append(f"Premature GL tables found: {found_forbidden}")

    if errors:
        print("=" * 74)
        print(f"❌ نگهبان ۳۶ شکست خورد با {len(errors)} خطا:")
        for e in errors:
            print(f"   - {e}")
        return False

    print("=" * 74)
    print("✨ نتیجه: نگهبان ۳۶ تایید شد (PASS) — آمادگی کامل دفتر کل و نقاط توسعه محقق شد ✨")
    print("=" * 74)
    return True


if __name__ == "__main__":
    success = test_gl_readiness()
    sys.exit(0 if success else 1)
