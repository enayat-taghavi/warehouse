"""
دورهٔ مالی شرکت و قفل دورهٔ بسته (طرح ۳.۲، ص۴).

تاریخ دوره‌ها و اسناد رشتهٔ شمسی یکسان `YYYY/MM/DD` است، پس مقایسهٔ رشته‌ای درست کار می‌کند.
تاریخی که در هیچ دوره‌ای نیست قفل نیست (شرکت بی‌دوره همیشه باز است).
"""
from datetime import date as dt_date, datetime as dt_datetime

import jdatetime
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from common.date_utils import normalize_digits

FISCAL_CLOSED_CODE = 'fiscal_period_closed'


def to_shamsi_str(value):
    """رشتهٔ شمسی (رقم فارسی/عربی، `-` یا `/`) یا date/datetime را به `YYYY/MM/DD` می‌برد؛ نامعتبر = None."""
    if value in (None, ''):
        return None
    if isinstance(value, dt_datetime):
        local = timezone.localtime(value) if timezone.is_aware(value) else value
        return jdatetime.date.fromgregorian(date=local.date()).strftime('%Y/%m/%d')
    if isinstance(value, dt_date):
        return jdatetime.date.fromgregorian(date=value).strftime('%Y/%m/%d')
    text = normalize_digits(str(value)).strip().replace('-', '/')
    parts = text.split(' ')[0].split('/')
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        return None
    year, month, day = (int(p) for p in parts)
    try:
        if year >= 1700:  # تاریخ میلادی
            return jdatetime.date.fromgregorian(date=dt_date(year, month, day)).strftime('%Y/%m/%d')
        return jdatetime.date(year, month, day).strftime('%Y/%m/%d')
    except ValueError:
        return None


def period_for_date(company_id, value):
    """دورهٔ همان شرکت که تاریخ داخل آن است، یا None."""
    from .models import CompanyFiscalPeriod
    day = to_shamsi_str(value)
    if not company_id or not day:
        return None
    return (CompanyFiscalPeriod.objects
            .filter(company_id=company_id, start_date__lte=day, end_date__gte=day)
            .order_by('-fiscal_year').first())


def closed_period_for(company_id, value):
    period = period_for_date(company_id, value)
    return period if period is not None and period.status == 'closed' else None


def closed_period_message(period):
    return f'دورهٔ مالی {period.fiscal_year} بسته است؛ سند با این تاریخ ثبت، ویرایش یا حذف نمی‌شود.'


def ensure_period_open(company_id, value, field):
    """سند تاریخ‌دار در دورهٔ بسته = 400 با کد `fiscal_period_closed` کنار همان فیلد تاریخ."""
    period = closed_period_for(company_id, value)
    if period is not None:
        raise ValidationError({field: [closed_period_message(period)], 'code': FISCAL_CLOSED_CODE},
                              code=FISCAL_CLOSED_CODE)


def fiscal_period_key(company_id, at):
    """کلید دورهٔ سری شماره: سال مالی دورهٔ شامل `at`؛ بی‌دوره = سال شمسی هسته."""
    period = period_for_date(company_id, at)
    if period is not None:
        return str(period.fiscal_year)
    from numbering.registry import shamsi_year
    return shamsi_year(company_id, at)
