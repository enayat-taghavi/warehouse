"""
گزارش‌های حسابداری نسخهٔ اول (طرح ۴.۷، د۱ تا د۴): تابع‌های خالص جمع‌زنی.

ورودی هر تابع queryset های «دامنه‌دار» است که نما (views_domains/report_views.py) با همان قاعدهٔ فهرست فاکتور و تنخواه
ساخته است؛ این‌جا دامنه باز یا تنگ نمی‌شود. همهٔ جمع‌ها در پایگاه داده (values().annotate) و تعداد پرس‌وجو مستقل از
تعداد ردیف است (ق۱۸)؛ فقط پخش تخفیف فاکتور میان سرفصل‌ها در پایتون است، با همان قاعدهٔ گرد کردن سند (split_discount).
"""
from dataclasses import dataclass
from datetime import date as dt_date, datetime as dt_datetime, time as dt_time, timedelta
from decimal import Decimal, ROUND_HALF_UP

import jdatetime
from django.db.models import Case, Count, DecimalField, F, IntegerField, Min, OuterRef, Q, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce, Substr
from django.utils import timezone

ZERO = Decimal('0')
MONEY = DecimalField(max_digits=18, decimal_places=0)
APPROVED_INVOICE_STATUSES = ('ready_to_pay', 'partially_paid', 'paid')
UNPAID_INVOICE_STATUSES = ('ready_to_pay', 'partially_paid')
OPEN_STATEMENT_STATUSES = ('draft', 'submitted', 'approved')
PAYABLE_OWNERSHIP = ('contract', 'personal')
NO_HEAD_LABEL = 'بدون سرفصل'
NO_GROUP_LABEL = 'بدون گروه'
NO_SECTION_LABEL = 'بدون بخش'
NO_PROJECT_LABEL = 'بدون پروژه'
NO_COUNTERPARTY_LABEL = 'بدون طرف‌حساب'
NO_BANK_ACCOUNT_LABEL = 'بدون حساب بانکی شرکت'
MAX_RANGE_DAYS = 366
EXPENSE_GROUP_BY = ('head', 'section', 'project', 'counterparty', 'month')
AGE_BUCKETS = (('age_0_30', 0, 30), ('age_31_60', 31, 60), ('age_61_90', 61, 90), ('age_over_90', 91, None))


class ReportParamError(ValueError):
    """ورودی نادرست گزارش (پیام فارسی برای پاسخ 400)."""


# ── پخش تخفیف (د۱ طرح ۴.۱، د۴ طرح ۴.۷) ─────────────────────────────────────────────────────────────────
def split_discount(items, discount):
    """
    items: [(key, amount)] به ترتیب نخستین ردیف هر سرفصل ← [(key, net)]. سهم تخفیف به نسبت مبلغ و گرد به نزدیک‌ترین
    ریال؛ باقی‌ماندهٔ گرد کردن به آخرین سرفصل می‌رود. سند (ExpenseInvoice.head_amounts) و گزارش هزینه هر دو از این می‌خوانند.
    """
    items = [(key, Decimal(str(amt or 0))) for key, amt in items]
    subtotal = sum((amt for _, amt in items), ZERO)
    discount = Decimal(str(discount or 0))
    out = []
    given = ZERO
    for idx, (key, amt) in enumerate(items):
        if idx == len(items) - 1:
            share = discount - given
        elif subtotal > 0:
            share = (discount * amt / subtotal).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        else:
            share = ZERO
        given += share
        out.append((key, amt - share))
    return out


# ── بازهٔ تاریخ ────────────────────────────────────────────────────────────────────────────────────────
@dataclass
class DateRange:
    s_from: str
    s_to: str
    g_from: dt_date
    g_to: dt_date

    @property
    def start_dt(self):
        return timezone.make_aware(dt_datetime.combine(self.g_from, dt_time.min))

    @property
    def end_dt(self):
        """مرز باز پایان (آغاز روز پس از g_to)."""
        return timezone.make_aware(dt_datetime.combine(self.g_to + timedelta(days=1), dt_time.min))

    @property
    def m_from(self):
        return self.s_from[:7]

    @property
    def m_to(self):
        return self.s_to[:7]

    def as_dict(self):
        return {'date_from': self.s_from, 'date_to': self.s_to}


def _to_jdate(text):
    y, m, d = (int(p) for p in text.split('/'))
    return jdatetime.date(y, m, d)


def parse_date_range(raw_from, raw_to, today=None):
    """
    تاریخ شمسی یا میلادی (YYYY/MM/DD یا YYYY-MM-DD، رقم فارسی هم) ← DateRange. پیش‌فرض: پایان امروز، آغاز اول سال
    شمسیِ پایان. بازهٔ وارونه یا بیش از ۳۶۶ روز ← ReportParamError.
    """
    from .fiscal import to_shamsi_str
    s_from = to_shamsi_str(raw_from) if raw_from not in (None, '') else None
    s_to = to_shamsi_str(raw_to) if raw_to not in (None, '') else None
    if raw_from not in (None, '') and not s_from:
        raise ReportParamError('تاریخ شروع نامعتبر است.')
    if raw_to not in (None, '') and not s_to:
        raise ReportParamError('تاریخ پایان نامعتبر است.')
    if not s_to:
        s_to = jdatetime.date.fromgregorian(date=today or timezone.localdate()).strftime('%Y/%m/%d')
    if not s_from:
        s_from = f'{s_to[:4]}/01/01'
    g_from, g_to = _to_jdate(s_from).togregorian(), _to_jdate(s_to).togregorian()
    if g_from > g_to:
        raise ReportParamError('تاریخ شروع پس از تاریخ پایان است.')
    if (g_to - g_from).days + 1 > MAX_RANGE_DAYS:
        raise ReportParamError(f'بازهٔ گزارش حداکثر {MAX_RANGE_DAYS} روز است.')
    return DateRange(s_from, s_to, g_from, g_to)


def current_month_range(today=None):
    s_to = jdatetime.date.fromgregorian(date=today or timezone.localdate()).strftime('%Y/%m/%d')
    return parse_date_range(f'{s_to[:7]}/01', s_to)


# ── تاریخ تأیید مدیر فاکتور (ن۳) ──────────────────────────────────────────────────────────────────────
def approved_at_subquery():
    """زمان آخرین ورود فاکتور به مرحلهٔ پرداخت خزانه (تأیید مدیر یا گذر از آستانه)؛ فاکتور بی گردش = None."""
    from workflow.models import WorkflowStep
    from .workflows import INVOICE_ENTITY
    steps = (WorkflowStep.objects.filter(instance__entity_kind=INVOICE_ENTITY, instance__entity_id=OuterRef('pk'),
                                         to_step='treasury_pay').order_by('-at').values('at')[:1])
    return Subquery(steps)


def _expense_day(approved_at, invoice_date_shamsi):
    from .fiscal import to_shamsi_str
    if approved_at is not None:
        return to_shamsi_str(approved_at)
    return to_shamsi_str(invoice_date_shamsi) or (invoice_date_shamsi or '')


def approved_invoices_in_range(invoices, rng):
    """فاکتورهای تأییدشده (آماده پرداخت، پرداخت ناقص، پرداخت‌شده) که تاریخ هزینه‌شان در بازه است."""
    return (invoices.filter(status__in=APPROVED_INVOICE_STATUSES)
            .annotate(approved_at=approved_at_subquery())
            .filter(Q(approved_at__gte=rng.start_dt, approved_at__lt=rng.end_dt)
                    | Q(approved_at__isnull=True, invoice_date_shamsi__gte=rng.s_from,
                        invoice_date_shamsi__lte=rng.s_to)))


def _i(value):
    return int(value or 0)


# ── گ۱ هزینه ─────────────────────────────────────────────────────────────────────────────────────────
def expense_report(invoices, petty_transactions, rng, group_by='head'):
    """
    هزینه به تفکیک سرفصل (گروه ← سرفصل)، بخش، پروژه، طرف‌حساب یا ماه. فاکتور: ردیف‌ها با سهم تخفیف (بی مالیات)؛
    مالیات ستون جدا (در گروه‌بندی سرفصل فقط در جمع کل). تنخواه: هزینهٔ تأییدشده، ردیف ردشده نه.
    پرس‌وجوها: فاکتورها، ردیف‌ها، تنخواه و (برای سرفصل) سرفصل‌ها — ثابت.
    """
    from .models import ExpenseHead, ExpenseInvoiceLine
    if group_by not in EXPENSE_GROUP_BY:
        raise ReportParamError('گروه‌بندی گزارش نامعتبر است.')
    inv_qs = approved_invoices_in_range(invoices, rng)
    inv_rows = list(inv_qs.order_by().values(
        'id', 'amount', 'discount_amount', 'vat_amount', 'invoice_date_shamsi', 'approved_at',
        'section_id', 'section__name', 'section__project_id', 'section__project__name',
        'counterparty_id', 'counterparty__party__name'))
    lines = (ExpenseInvoiceLine.objects.filter(invoice_id__in=inv_qs.values('id')).order_by()
             .values('invoice_id', 'expense_head_id')
             .annotate(total=Sum('line_amount'), first_pos=Min('position'), first_id=Min('id')))
    by_invoice = {}
    for ln in lines:
        by_invoice.setdefault(ln['invoice_id'], []).append(ln)

    groups = {}
    totals = {'invoice_amount': ZERO, 'petty_amount': ZERO, 'vat_amount': ZERO}

    def bucket(key, label, group_key=None, group_label=None):
        row = groups.get(key)
        if row is None:
            row = groups[key] = {'key': key, 'label': label, 'group_key': group_key, 'group_label': group_label,
                                 'invoice_amount': ZERO, 'petty_amount': ZERO, 'vat_amount': ZERO, 'invoice_count': 0}
        return row

    def plain_key(src, kind):
        """(key, label) برای گروه‌بندی غیر سرفصل؛ src ردیف فاکتور یا تنخواه با کلیدهای یکسان."""
        if kind == 'section':
            return src['section_id'], src['section__name'] or NO_SECTION_LABEL
        if kind == 'project':
            return src['project_id'], src['project_name'] or NO_PROJECT_LABEL
        if kind == 'counterparty':
            return src['counterparty_id'], src['counterparty__party__name'] or NO_COUNTERPARTY_LABEL
        return src['month'], src['month'] or '-'

    head_ids = set()
    for inv in inv_rows:
        vat = Decimal(str(inv['vat_amount'] or 0))
        totals['vat_amount'] += vat
        ls = sorted(by_invoice.get(inv['id'], []), key=lambda r: (r['first_pos'], r['first_id']))
        if ls:
            nets = split_discount([(r['expense_head_id'], r['total']) for r in ls], inv['discount_amount'])
        else:
            # فاکتور کهنهٔ بی ردیف: مبلغ بی مالیات زیر «بدون سرفصل»
            nets = [(None, Decimal(str(inv['amount'] or 0)) - vat)]
        cost = sum((n for _, n in nets), ZERO)
        totals['invoice_amount'] += cost
        if group_by == 'head':
            for head_id, net in nets:
                head_ids.add(head_id)
                row = bucket(head_id, None)
                row['invoice_amount'] += net
                row['invoice_count'] += 1
            continue
        src = dict(inv, project_id=inv['section__project_id'], project_name=inv['section__project__name'],
                   month=_expense_day(inv['approved_at'], inv['invoice_date_shamsi'])[:7])
        key, label = plain_key(src, group_by)
        row = bucket(key, label)
        row['invoice_amount'] += cost
        row['vat_amount'] += vat
        row['invoice_count'] += 1

    petty = (petty_transactions.filter(transaction_type='expense', status='approved')
             .exclude(line_status='rejected')
             .filter(transaction_date_shamsi__gte=rng.s_from, transaction_date_shamsi__lte=rng.s_to)
             .order_by()
             .values('expense_head_id', 'section_id', 'section__name', 'section__project_id', 'section__project__name',
                     'project_id', 'project__name', 'counterparty_id', 'counterparty__party__name')
             .annotate(month=Substr('transaction_date_shamsi', 1, 7), total=Sum('amount')))
    for p in petty:
        amount = Decimal(str(p['total'] or 0))
        totals['petty_amount'] += amount
        if group_by == 'head':
            head_ids.add(p['expense_head_id'])
            bucket(p['expense_head_id'], None)['petty_amount'] += amount
            continue
        src = dict(p, project_id=p['project_id'] or p['section__project_id'],
                   project_name=p['project__name'] or p['section__project__name'])
        key, label = plain_key(src, group_by)
        bucket(key, label)['petty_amount'] += amount

    if group_by == 'head':
        heads = {h['id']: h for h in ExpenseHead.objects.filter(id__in=[h for h in head_ids if h]).values(
            'id', 'code', 'title', 'parent_id', 'parent__code', 'parent__title')}
        for key, row in groups.items():
            h = heads.get(key)
            if h is None:
                row.update(label=NO_HEAD_LABEL, code='', group_key=None, group_label=NO_GROUP_LABEL, group_code='')
            elif h['parent_id']:
                row.update(label=h['title'], code=h['code'], group_key=h['parent_id'], group_label=h['parent__title'],
                           group_code=h['parent__code'])
            else:
                # سرفصل سطح اول بی پدر: خودش گروه است
                row.update(label=h['title'], code=h['code'], group_key=h['id'], group_label=h['title'],
                           group_code=h['code'])
            row['vat_amount'] = None
        ordered = sorted(groups.values(), key=lambda r: (r['key'] is None, r['group_code'] or '', r['code'] or ''))
    elif group_by == 'month':
        ordered = sorted(groups.values(), key=lambda r: r['key'] or '')
    else:
        ordered = sorted(groups.values(), key=lambda r: -(r['invoice_amount'] + r['petty_amount']))

    rows = []
    for row in ordered:
        out = dict(row)
        out['total'] = _i(row['invoice_amount'] + row['petty_amount'])
        out['invoice_amount'] = _i(row['invoice_amount'])
        out['petty_amount'] = _i(row['petty_amount'])
        out['vat_amount'] = None if row['vat_amount'] is None else _i(row['vat_amount'])
        rows.append(out)
    return {
        'group_by': group_by, **rng.as_dict(), 'rows': rows,
        'totals': {'invoice_amount': _i(totals['invoice_amount']), 'petty_amount': _i(totals['petty_amount']),
                   'total': _i(totals['invoice_amount'] + totals['petty_amount']),
                   'vat_amount': _i(totals['vat_amount']), 'invoice_count': len(inv_rows)},
    }


# ── گ۲ ماندهٔ پرداخت‌نشده ──────────────────────────────────────────────────────────────────────────────
def _age_bucket(days):
    for key, low, high in AGE_BUCKETS:
        if days >= low and (high is None or days <= high):
            return key
    return AGE_BUCKETS[0][0]


def unpaid_invoices_report(invoices, today=None):
    """
    مانده = مبلغ − پرداخت‌شده > ۰ برای فاکتورهای آماده پرداخت و پرداخت ناقص؛ سن از تاریخ تأیید مدیر (فاکتور بی گردش:
    تاریخ فاکتور). خروجی: جمع به تفکیک طرف‌حساب با سن بدهی و فهرست ریز (به ترتیب سن، کهنه‌ترین اول). یک پرس‌وجو.
    """
    today = today or timezone.localdate()
    qs = (invoices.filter(status__in=UNPAID_INVOICE_STATUSES)
          .annotate(remaining=F('amount') - F('paid_amount'), approved_at=approved_at_subquery())
          .filter(remaining__gt=0).order_by())
    details = []
    by_cp = {}
    totals = {'remaining': 0, 'count': 0, **{k: 0 for k, _l, _h in AGE_BUCKETS}}
    for inv in qs.values('id', 'number', 'invoice_number', 'invoice_date_shamsi', 'amount', 'paid_amount', 'remaining',
                         'approved_at', 'status', 'section_id', 'section__name', 'counterparty_id',
                         'counterparty__party__name'):
        day = _expense_day(inv['approved_at'], inv['invoice_date_shamsi'])
        try:
            age = max((today - _to_jdate(day).togregorian()).days, 0)
        except (ValueError, TypeError):
            age = 0
        age_key = _age_bucket(age)
        remaining = _i(inv['remaining'])
        details.append({
            'invoice_id': inv['id'], 'number': inv['number'] or '', 'invoice_number': inv['invoice_number'],
            'invoice_date': inv['invoice_date_shamsi'], 'approved_date': day, 'age_days': age, 'age_bucket': age_key,
            'amount': _i(inv['amount']), 'paid_amount': _i(inv['paid_amount']), 'remaining': remaining,
            'status': inv['status'], 'section_id': inv['section_id'], 'section_name': inv['section__name'] or '',
            'counterparty_id': inv['counterparty_id'],
            'counterparty_name': inv['counterparty__party__name'] or NO_COUNTERPARTY_LABEL,
        })
        cp = by_cp.setdefault(inv['counterparty_id'], {
            'counterparty_id': inv['counterparty_id'],
            'counterparty_name': inv['counterparty__party__name'] or NO_COUNTERPARTY_LABEL,
            'count': 0, 'remaining': 0, **{k: 0 for k, _l, _h in AGE_BUCKETS}})
        for target in (cp, totals):
            target['count'] += 1
            target['remaining'] += remaining
            target[age_key] += remaining
    details.sort(key=lambda r: (-r['age_days'], r['invoice_id']))
    summary = sorted(by_cp.values(), key=lambda r: -r['remaining'])
    return {'as_of': jdatetime.date.fromgregorian(date=today).strftime('%Y/%m/%d'),
            'rows': summary, 'totals': totals, 'details': details}


# ── گ۳ تنخواه ────────────────────────────────────────────────────────────────────────────────────────
def petty_cash_report(accounts):
    """
    هر حساب تنخواه: سقف، موجودی اولیه، شارژ (خالص از کسر بدهی)، هزینه، ردشده، عودت، مانده (همان قاعدهٔ
    petty_fund_level_breakdown)، بدهی (annotate_debt) و صورت‌حساب‌های باز. یک پرس‌وجو با زیرپرس‌وجوها.
    """
    from .models import PettyCashAccount, PettyCashDebtSettlement, PettyCashStatement, PettyCashTransaction
    zero = Value(ZERO, output_field=MONEY)

    def _sum(qs, field='amount'):
        agg = qs.filter(account=OuterRef('pk')).order_by().values('account').annotate(s=Sum(field)).values('s')
        return Coalesce(Subquery(agg, output_field=MONEY), zero, output_field=MONEY)

    tx = PettyCashTransaction.objects
    open_statements = (PettyCashStatement.objects.filter(account=OuterRef('pk'), status__in=OPEN_STATEMENT_STATUSES)
                       .order_by().values('account').annotate(c=Count('id')).values('c'))
    qs = PettyCashAccount.annotate_debt(accounts).annotate(
        received_total=_sum(tx.filter(transaction_type='allocation', status__in=['approved', 'paid'])),
        offset_total=_sum(PettyCashDebtSettlement.objects.filter(
            method='charge_offset', status='done', charge__status__in=['approved', 'paid'])),
        spent_total=_sum(tx.filter(transaction_type='expense', status='approved').exclude(line_status='rejected')),
        rejected_total=_sum(tx.filter(line_status='rejected')),
        refund_total=_sum(tx.filter(transaction_type='refund', status='approved')),
        open_statements=Coalesce(Subquery(open_statements, output_field=IntegerField()), Value(0)),
    ).order_by('company_id', 'custodian__last_name', 'id')
    rows = []
    totals = dict.fromkeys(('ceiling_amount', 'opening_balance', 'received_total', 'spent_total', 'rejected_total',
                            'refund_total', 'balance', 'debt', 'open_statements'), 0)
    for a in qs.values('id', 'company_id', 'company__name', 'custodian_id', 'custodian__first_name',
                       'custodian__last_name', 'custodian__username', 'ceiling_amount', 'opening_balance', 'is_active',
                       'received_total', 'offset_total', 'spent_total', 'rejected_total', 'refund_total', 'debt_amount',
                       'open_statements'):
        received = _i(a['received_total']) - _i(a['offset_total'])
        balance = (_i(a['opening_balance']) + received - _i(a['spent_total']) - _i(a['rejected_total'])
                   - _i(a['refund_total']))
        name = f"{a['custodian__first_name'] or ''} {a['custodian__last_name'] or ''}".strip() or a['custodian__username']
        row = {'account_id': a['id'], 'company_id': a['company_id'], 'company_name': a['company__name'] or '',
               'custodian_id': a['custodian_id'], 'custodian_name': name, 'is_active': a['is_active'],
               'ceiling_amount': _i(a['ceiling_amount']), 'opening_balance': _i(a['opening_balance']),
               'received_total': received, 'spent_total': _i(a['spent_total']),
               'rejected_total': _i(a['rejected_total']), 'refund_total': _i(a['refund_total']),
               'balance': balance, 'debt': _i(a['debt_amount']), 'open_statements': _i(a['open_statements'])}
        rows.append(row)
        for key in totals:
            totals[key] += row[key]
    return {'rows': rows, 'totals': totals}


# ── گ۴ پرداخت‌ها از حساب بانکی شرکت ───────────────────────────────────────────────────────────────────
def bank_payments_report(payments, bank_accounts, rng, mask_for):
    """
    پرداخت‌های فاکتور (قسط باطل‌نشده) در بازه به تفکیک حساب بانکی شرکت، با موجودی اولیه (ن۲: گردش کامل نیست).
    mask_for(company_id) ← (full_bank, show_opening). خروجی بی فهرست ریز؛ فهرست ریز با bank_payment_details.
    """
    from .counterparty_services import mask_tail
    pay = payments.filter(voided_at__isnull=True, payment_date_shamsi__gte=rng.s_from,
                          payment_date_shamsi__lte=rng.s_to)
    sums = {r['company_bank_account_id']: r for r in pay.order_by().values('company_bank_account_id')
            .annotate(total=Sum('amount'), count=Count('id'))}
    rows = []
    totals = {'total': 0, 'count': 0}
    for acc in bank_accounts.order_by('company_id', '-is_primary', 'id').values(
            'id', 'company_id', 'company__name', 'bank_name', 'account_title', 'account_number', 'sheba_number',
            'opening_balance', 'opening_balance_date', 'is_active'):
        full, show_opening = mask_for(acc['company_id'])
        s = sums.pop(acc['id'], None) or {}
        row = {'bank_account_id': acc['id'], 'company_id': acc['company_id'], 'company_name': acc['company__name'] or '',
               'bank_name': acc['bank_name'], 'account_title': acc['account_title'] or '',
               'account_number': (acc['account_number'] or '') if full else mask_tail(acc['account_number'] or ''),
               'sheba_number': acc['sheba_number'] if full else mask_tail(acc['sheba_number']),
               'opening_balance': _i(acc['opening_balance']) if show_opening else None,
               'opening_balance_date': acc['opening_balance_date'] if show_opening else None,
               'is_active': acc['is_active'], 'total': _i(s.get('total')), 'count': _i(s.get('count'))}
        rows.append(row)
        totals['total'] += row['total']
        totals['count'] += row['count']
    # پرداخت بی حساب بانکی شرکت (یا حساب بیرون از فهرست) یک ردیف جدا
    rest_total = sum(_i(r['total']) for r in sums.values())
    rest_count = sum(_i(r['count']) for r in sums.values())
    if rest_count:
        rows.append({'bank_account_id': None, 'company_id': None, 'company_name': '', 'bank_name': NO_BANK_ACCOUNT_LABEL,
                     'account_title': '', 'account_number': '', 'sheba_number': '', 'opening_balance': None,
                     'opening_balance_date': None, 'is_active': True, 'total': rest_total, 'count': rest_count})
        totals['total'] += rest_total
        totals['count'] += rest_count
    return {**rng.as_dict(), 'rows': rows, 'totals': totals}


def bank_payment_details(payments, rng, mask_for):
    """queryset مرتب پرداخت‌های بازه و تابع تبدیل ردیف (برای صفحه‌بندی سرور و اکسل)."""
    from .counterparty_services import mask_tail
    qs = (payments.filter(voided_at__isnull=True, payment_date_shamsi__gte=rng.s_from,
                          payment_date_shamsi__lte=rng.s_to)
          .order_by('-payment_date_shamsi', '-id')
          .values('id', 'payment_date_shamsi', 'amount', 'tracking_code', 'method', 'invoice_id', 'invoice__number',
                  'invoice__invoice_number', 'invoice__counterparty__party__name', 'company_bank_account_id',
                  'company_bank_account__company_id', 'company_bank_account__bank_name',
                  'company_bank_account__sheba_number'))

    def to_row(p):
        sheba = p['company_bank_account__sheba_number'] or ''
        if sheba and not mask_for(p['company_bank_account__company_id'])[0]:
            sheba = mask_tail(sheba)
        return {'payment_id': p['id'], 'payment_date': p['payment_date_shamsi'], 'amount': _i(p['amount']),
                'tracking_code': p['tracking_code'], 'method': p['method'], 'invoice_id': p['invoice_id'],
                'invoice_number': p['invoice__number'] or p['invoice__invoice_number'] or '',
                'counterparty_name': p['invoice__counterparty__party__name'] or '',
                'bank_account_id': p['company_bank_account_id'],
                'bank_name': p['company_bank_account__bank_name'] or NO_BANK_ACCOUNT_LABEL, 'sheba_number': sheba}
    return qs, to_row


# ── گ۵ بهای نیروی انسانی ─────────────────────────────────────────────────────────────────────────────
def labor_cost_report(records, rng):
    """
    به تفکیک بخش و ماه، فقط جمع (بی نام و رقم فرد، ق۱۶): تعداد، حقوق پایه، اضافه‌کار، مزایا (ناخالص − پایه −
    اضافه‌کار)، سهم بیمهٔ کارفرما (جمع بیمه − سهم کارگر)، جمع هزینه (ناخالص + سهم کارفرما) و میانگین. یک پرس‌وجو.
    """
    agg = (records.filter(period__year_month__gte=rng.m_from, period__year_month__lte=rng.m_to).order_by()
           .values('period__section_id', 'period__section__name', 'period__year_month')
           .annotate(headcount=Count('personnel_id', distinct=True), base=Sum('base_salary'),
                     overtime=Sum('overtime_amount'), gross=Sum('gross_salary'), total_ins=Sum('total_insurance'),
                     worker_ins=Sum('worker_insurance')))
    rows = []
    totals = dict.fromkeys(('headcount', 'base_salary', 'overtime', 'allowances', 'employer_insurance', 'total_cost'), 0)
    for r in agg:
        base, overtime, gross = _i(r['base']), _i(r['overtime']), _i(r['gross'])
        employer = _i(r['total_ins']) - _i(r['worker_ins'])
        total = gross + employer
        head = r['headcount'] or 0
        row = {'section_id': r['period__section_id'], 'section_name': r['period__section__name'] or NO_SECTION_LABEL,
               'year_month': r['period__year_month'], 'headcount': head, 'base_salary': base, 'overtime': overtime,
               'allowances': gross - base - overtime, 'employer_insurance': employer, 'total_cost': total,
               'average_cost': int(Decimal(total) / head) if head else 0}
        rows.append(row)
        for key in totals:
            totals[key] += row[key]
    rows.sort(key=lambda r: (r['year_month'], r['section_name']))
    totals['average_cost'] = 0
    return {**rng.as_dict(), 'rows': rows, 'totals': totals}


# ── گ۶ هزینهٔ ناوگان ─────────────────────────────────────────────────────────────────────────────────
def fleet_cost_report(trips, rng):
    """
    به تفکیک بخش و ماه: خودروی دارای تردد، تعداد سرویس، کرایه (سرویس × نرخ همهٔ خودروها) و جمع تسویه (فقط
    استیجاری و ملکی راننده، همان قاعدهٔ calculate_monthly_fleet_settlement). یک پرس‌وجو.
    """
    line = F('trip_count') * F('unit_rate')
    agg = (trips.filter(date_shamsi__gte=rng.s_from, date_shamsi__lte=rng.s_to).order_by()
           .values('section_id', 'section__name')
           .annotate(year_month=Substr('date_shamsi', 1, 7))
           .values('section_id', 'section__name', 'year_month')
           .annotate(vehicles=Count('vehicle_id', distinct=True), services=Sum('trip_count'),
                     rent=Sum(line, output_field=MONEY),
                     settlement=Sum(Case(When(vehicle__ownership_type__in=PAYABLE_OWNERSHIP, then=line),
                                         default=Value(0), output_field=MONEY))))
    rows = []
    totals = dict.fromkeys(('vehicles', 'services', 'rent', 'settlement'), 0)
    for r in agg:
        row = {'section_id': r['section_id'], 'section_name': r['section__name'] or NO_SECTION_LABEL,
               'year_month': r['year_month'], 'vehicles': r['vehicles'] or 0, 'services': _i(r['services']),
               'rent': _i(r['rent']), 'settlement': _i(r['settlement'])}
        rows.append(row)
        for key in totals:
            totals[key] += row[key]
    rows.sort(key=lambda r: (r['year_month'], r['section_name']))
    return {**rng.as_dict(), 'rows': rows, 'totals': totals}


# ── خلاصهٔ داشبورد (د۹) ──────────────────────────────────────────────────────────────────────────────
def dashboard_summary(invoices, petty_transactions, personnel, vehicles, today=None):
    """هزینهٔ ماه جاری (از گ۱ به تفکیک بخش)، تعداد پرسنل و خودروی فعال هر بخش. شمارش کارها از کارتابل فرانت است."""
    rng = current_month_range(today)
    expense = expense_report(invoices, petty_transactions, rng, group_by='section')
    by_section = {}
    for row in expense['rows']:
        by_section[row['key']] = {'section_id': row['key'], 'section_name': row['label'],
                                  'month_expense': row['total'], 'personnel_count': 0, 'vehicle_count': 0}

    def _blank(sid, name):
        return by_section.setdefault(sid, {'section_id': sid, 'section_name': name or NO_SECTION_LABEL,
                                           'month_expense': 0, 'personnel_count': 0, 'vehicle_count': 0})
    for r in personnel.order_by().values('section_id', 'section__name').annotate(c=Count('id')):
        _blank(r['section_id'], r['section__name'])['personnel_count'] = r['c']
    for r in vehicles.order_by().values('section_id', 'section__name').annotate(c=Count('id')):
        _blank(r['section_id'], r['section__name'])['vehicle_count'] = r['c']
    rows = sorted(by_section.values(), key=lambda r: (r['section_id'] is None, r['section_name']))
    return {**rng.as_dict(), 'rows': rows, 'totals': {
        'month_expense': expense['totals']['total'],
        'personnel_count': sum(r['personnel_count'] for r in rows),
        'vehicle_count': sum(r['vehicle_count'] for r in rows)}}
