"""
پروتکل منبع سند حسابداری و ساختار آرتیکل‌های دفتر کل — فاز ۸ طرح جداسازی.
مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۸

پلتفرم فقط پروتکل را تعریف می‌کند نه جداول دفتر کل را (تسک ۷۲).
مدل‌هایی که رویداد مالی تولید می‌کنند (فاکتور هزینه، حقوق، خزانه‌داری، ناوگان)
این پروتکل را پیاده‌سازی می‌کنند تا سامانه دفتر کل دوطرفه آینده (wh-accounting-gl)
بتواند به سادگی و بدون وابستگی مستقیم، اسناد حسابداری را تولید کند.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import List, Optional, Protocol, runtime_checkable
import datetime


@dataclass(frozen=True)
class JournalLine:
    """
    سطر یا آرتیکل استاندارد سند دوبل حسابداری (Double-Entry Journal Line).
    """
    account_code: str               # کد حساب معین/کل (مثلاً '6101' برای هزینه حقوق یا '4101' برای بستانکاران)
    side: str                       # 'debit' (بدهکار) | 'credit' (بستانکار)
    amount: Decimal                 # مبلغ به ریال — قفل شده با دقت DecimalField(15, 0) (تسک ۷۶)
    cost_center_code: Optional[str] = None  # کد مرکز هزینه (بُعد پروژه/بخش — تسک ۷۵)
    detail_code: Optional[str] = None       # کد حساب تفصیلی (طرف‌حساب/پرسنل/بانک — تسک ۷۵)
    description: str = ''                   # شرح آرتیکل سند


@runtime_checkable
class AccountingDocumentSource(Protocol):
    """
    پروتکل منبع سند حسابداری — فاز ۸ (تسک ۷۲).
    هر مدلی که رویداد مالی ایجاد می‌کند متد `to_journal_lines()` را پیاده‌سازی می‌نماید.
    """
    def to_journal_lines(self) -> List[JournalLine]:
        """تولید فهرست آرتیکل‌های تراز سند حسابداری."""
        ...
