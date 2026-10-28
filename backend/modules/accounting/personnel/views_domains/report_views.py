"""
گزارش‌های حسابداری نسخهٔ اول (طرح ۴.۷، د۱ تا د۵): GET /api/personnel/reports/<key>/ و .../export-excel/.

مجوز: perm_accounting_reports (بی آن 403)؛ labor-cost افزون بر آن view_sys_payroll و fleet-cost
view_sys_fleet_settlement. قلمرو (د۳، ق۶): همان قلمرو فهرست فاکتور و تنخواه (scope_*_for_user در treasury_views)،
بریده با بخش‌هایی که کاربر مجوز گزارش را در آن‌ها دارد؛ شرکت فقط از شرکت‌های مجاز کاربر؛ شرکت، بخش یا پروژهٔ بیرون
از قلمرو ← 404. پوشیدگی (ق۱۶) در پاسخ و اکسل یکی است (اکسل از همان خروجی تابع گزارش ساخته می‌شود).
"""
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.scoped_permissions import can, can_at_company_level, section_q, sections_where
from common.date_utils import normalize_digits
from companies.access import get_request_company_id

from .. import accounting_reports as R
from ..excel_utils import build_report_workbook
from .scope_helpers import readable_company_ids, scope_personnel_for_user, scope_trips_for_user
from .treasury_views import (
    _petty_tx_company_q, scope_invoices_for_user, scope_petty_accounts_for_user, scope_petty_transactions_for_user,
)

REPORT_PERM = 'perm_accounting_reports'
PAYROLL_PERM = 'view_sys_payroll'
FLEET_PERM = 'view_sys_fleet_settlement'
EXTRA_PERMS = {'labor-cost': PAYROLL_PERM, 'fleet-cost': FLEET_PERM}
REPORT_KEYS = ('expense', 'unpaid-invoices', 'petty-cash', 'bank-payments', 'labor-cost', 'fleet-cost',
               'dashboard-summary')
EXPORT_KEYS = REPORT_KEYS[:-1]
FULL_BANK_PERMS = ('perm_treasury_disburse_action', 'perm_manager_payment_authorize')
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
NOT_FOUND_MSG = 'شرکت، بخش یا پروژهٔ خواسته‌شده در قلمرو شما نیست.'


def _int(raw, label):
    if raw in (None, ''):
        return None
    text = normalize_digits(str(raw)).strip()
    if not (text.isascii() and text.isdigit()):
        raise R.ReportParamError(f'{label} نامعتبر است.')
    return int(text)


class ReportScope:
    """قلمرو یک درخواست گزارش؛ همهٔ queryset ها از این‌جا ساخته می‌شوند."""

    def __init__(self, request):
        from companies.models import Company, Project
        self.request = request
        user = self.user = request.user
        qp = request.query_params
        self.company_id = _int(qp.get('company_id'), 'شناسهٔ شرکت')
        if self.company_id is None:
            self.company_id = _int(get_request_company_id(request), 'شناسهٔ شرکت')
        self.section_id = _int(qp.get('section_id'), 'شناسهٔ بخش')
        self.project_id = _int(qp.get('project_id'), 'شناسهٔ پروژه')
        self.superuser = bool(user.is_superuser)
        self.readable = readable_company_ids(user)  # None = همه (مدیر کل)
        self.report_sections = sections_where(user, REPORT_PERM)

        if self.superuser:
            self.report_company_ids = None
            self.company_level_ids = None
        else:
            ids = set(self.report_sections.values_list('project__company_id', flat=True)) & self.readable
            self.report_company_ids = ids
            self.company_level_ids = {cid for cid in ids if can_at_company_level(user, REPORT_PERM, cid)}

        cid, sid, pid = self.company_id, self.section_id, self.project_id
        if cid is not None:
            if self.superuser:
                if not Company.objects.filter(pk=cid).exists():
                    raise NotFound(NOT_FOUND_MSG)
            elif cid not in self.report_company_ids:
                raise NotFound(NOT_FOUND_MSG)
        if pid is not None:
            project = Project.objects.filter(pk=pid).values('id', 'company_id').first()
            if (project is None or (cid is not None and project['company_id'] != cid)
                    or (not self.superuser and (project['company_id'] not in self.report_company_ids
                                                or not self.report_sections.filter(project_id=pid).exists()))):
                raise NotFound(NOT_FOUND_MSG)
        if sid is not None:
            section = self.report_sections.filter(pk=sid).values('id', 'project_id', 'project__company_id').first()
            if (section is None or (cid is not None and section['project__company_id'] != cid)
                    or (pid is not None and section['project_id'] != pid)
                    or (not self.superuser and section['project__company_id'] not in self.report_company_ids)):
                raise NotFound(NOT_FOUND_MSG)
        self._bank_cache = {}

    # ── قلمروها ──────────────────────────────────────────────────────────────────────────────────────
    def _company_filter(self, qs, *fields):
        """شرکت انتخابی یا (برای غیر مدیر کل) شرکت‌های مجاز گزارش، روی یکی از مسیرهای شرکت."""
        ids = [self.company_id] if self.company_id is not None else self.report_company_ids
        if ids is None:
            return qs
        q = Q(pk__in=[])
        for field in fields:
            q |= Q(**{f'{field}__in': ids})
        return qs.filter(q)

    def _section_filter(self, qs, section_field='section', project_fields=('section__project',)):
        if self.section_id is not None:
            qs = qs.filter(**{f'{section_field}_id': self.section_id})
        if self.project_id is not None:
            q = Q(pk__in=[])
            for field in project_fields:
                q |= Q(**{f'{field}_id': self.project_id})
            qs = qs.filter(q)
        return qs

    def invoices(self):
        from ..models import ExpenseInvoice
        qs = scope_invoices_for_user(self.user, ExpenseInvoice.objects.all(), self.company_id)
        qs = qs.filter(section_q(self.user, REPORT_PERM))
        qs = self._company_filter(qs, 'section__project__company_id')
        return self._section_filter(qs)

    def petty_transactions(self):
        from ..models import PettyCashTransaction
        qs = scope_petty_transactions_for_user(self.user, PettyCashTransaction.objects.all(), self.company_id)
        if not self.superuser:
            # سند بخش‌دار فقط در بخش‌های مجوز گزارش؛ سند بی‌بخش فقط با مجوز گزارش در سطح شرکت (ق۶)
            qs = qs.filter(Q(section_id__in=self.report_sections.values('id'))
                           | (Q(section__isnull=True) & _petty_tx_company_q(list(self.company_level_ids))))
        return self._section_filter(qs, project_fields=('project', 'section__project'))

    def petty_accounts(self):
        from ..models import PettyCashAccount
        qs = scope_petty_accounts_for_user(self.user, PettyCashAccount.objects.all(), self.company_id)
        if not self.superuser:
            qs = qs.filter(Q(company_id__in=self.company_level_ids)
                           | Q(section_id__in=self.report_sections.values('id')))
        if self.section_id is not None:
            qs = qs.filter(section_id=self.section_id)
        if self.project_id is not None:
            qs = qs.filter(section__project_id=self.project_id)
        return qs

    def payments(self):
        from ..models import InvoicePayment
        return InvoicePayment.objects.filter(invoice__in=self.invoices().values('id'))

    def bank_accounts(self, payments):
        from ..models import CompanyBankAccount
        qs = CompanyBankAccount.objects.all()
        if self.company_id is not None:
            qs = qs.filter(company_id=self.company_id)
        if not self.superuser:
            qs = qs.filter(Q(company_id__in=self.company_level_ids)
                           | Q(id__in=payments.values('company_bank_account_id')))
        if self.section_id is not None or self.project_id is not None:
            qs = qs.filter(id__in=payments.values('company_bank_account_id'))
        return qs

    def mask_for(self, company_id):
        """(دید کامل شبا و شماره حساب، دیدن موجودی اولیه): مدیر کل، سطح خواندن bank، یا خزانه‌دار/مدیر سطح شرکت."""
        if company_id not in self._bank_cache:
            from ..company_bank import can_see_opening_balance
            opening = bool(company_id) and can_see_opening_balance(self.user, company_id)
            full = self.superuser or opening or bool(company_id) and any(
                can_at_company_level(self.user, code, company_id) for code in FULL_BANK_PERMS)
            self._bank_cache[company_id] = (bool(full), bool(opening or self.superuser))
        return self._bank_cache[company_id]

    def payroll_records(self):
        from ..models import MonthlyPayrollRecord
        from .payroll_views import MonthlyPayrollViewSet
        qs = MonthlyPayrollRecord.objects.all()
        if not self.superuser:
            # همان قلمرو فهرست حقوق (_wage_row_q، بی شاخهٔ «ردیف خودم»)، فقط در بخش‌های view_sys_payroll و گزارش
            qs = qs.filter(MonthlyPayrollViewSet._wage_row_q(None, self.user))
            qs = qs.filter(section_q(self.user, PAYROLL_PERM, prefix='period__section'))
            qs = qs.filter(section_q(self.user, REPORT_PERM, prefix='period__section'))
        qs = self._company_filter(qs, 'period__company_id', 'personnel__company_id')
        return self._section_filter(qs, section_field='period__section',
                                    project_fields=('period__project', 'period__section__project'))

    def trips(self):
        from ..models import VehicleTripLog
        base = VehicleTripLog.objects.filter(is_deleted=False)
        scoped = scope_trips_for_user(self.user, base, self.company_id)
        qs = base.filter(id__in=scoped.values('id'))
        if not self.superuser:
            qs = qs.filter(section_q(self.user, FLEET_PERM)).filter(section_q(self.user, REPORT_PERM))
        return self._section_filter(qs, project_fields=('project', 'section__project'))

    def personnel(self):
        from ..models import PersonnelProfile
        qs = scope_personnel_for_user(self.user, PersonnelProfile.objects.filter(is_active=True), self.company_id)
        if not self.superuser:
            qs = qs.filter(section_q(self.user, REPORT_PERM))
        return self._section_filter(qs)

    def vehicles(self):
        from ..models import VehicleDriverProfile
        qs = VehicleDriverProfile.objects.filter(is_active=True)
        qs = self._company_filter(qs, 'company_id', 'section__project__company_id')
        if not self.superuser:
            qs = qs.filter(section_q(self.user, REPORT_PERM))
        return self._section_filter(qs)


def _page(request, items_count):
    page = _int(request.query_params.get('page'), 'شمارهٔ صفحه') or 1
    size = _int(request.query_params.get('page_size'), 'اندازهٔ صفحه') or DEFAULT_PAGE_SIZE
    size = max(1, min(size, MAX_PAGE_SIZE))
    start = (page - 1) * size
    return start, start + size, {'page': page, 'page_size': size, 'count': items_count}


def _build(key, request, scope, for_export=False):
    qp = request.query_params
    if key == 'expense':
        rng = R.parse_date_range(qp.get('date_from'), qp.get('date_to'))
        return R.expense_report(scope.invoices(), scope.petty_transactions(), rng, qp.get('group_by') or 'head')
    if key == 'unpaid-invoices':
        data = R.unpaid_invoices_report(scope.invoices())
        if not for_export:
            start, end, meta = _page(request, len(data['details']))
            data['details'] = {**meta, 'results': data['details'][start:end]}
        return data
    if key == 'petty-cash':
        return R.petty_cash_report(scope.petty_accounts())
    if key == 'bank-payments':
        rng = R.parse_date_range(qp.get('date_from'), qp.get('date_to'))
        payments = scope.payments()
        data = R.bank_payments_report(payments, scope.bank_accounts(payments), rng, scope.mask_for)
        detail_qs, to_row = R.bank_payment_details(payments, rng, scope.mask_for)
        if for_export:
            data['details'] = (to_row(p) for p in detail_qs.iterator(chunk_size=2000))
        else:
            start, end, meta = _page(request, detail_qs.count())
            data['details'] = {**meta, 'results': [to_row(p) for p in detail_qs[start:end]]}
        return data
    if key == 'labor-cost':
        rng = R.parse_date_range(qp.get('date_from'), qp.get('date_to'))
        return R.labor_cost_report(scope.payroll_records(), rng)
    if key == 'fleet-cost':
        rng = R.parse_date_range(qp.get('date_from'), qp.get('date_to'))
        return R.fleet_cost_report(scope.trips(), rng)
    return R.dashboard_summary(scope.invoices(), scope.petty_transactions(), scope.personnel(), scope.vehicles())


def _check_access(request, key, keys):
    if key not in keys:
        raise NotFound('گزارش خواسته‌شده وجود ندارد.')
    user = request.user
    if not can(user, REPORT_PERM):
        raise PermissionDenied('شما مجوز دیدن گزارش‌های حسابداری را ندارید.')
    extra = EXTRA_PERMS.get(key)
    if extra and not can(user, extra):
        raise PermissionDenied('شما مجوز دیدن این گزارش را ندارید.')


def _bad_request(exc):
    msg = str(exc)
    return Response({'code': 'invalid_report_params', 'error': msg, 'detail': msg},
                    status=status.HTTP_400_BAD_REQUEST)


class AccountingReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, key):
        _check_access(request, key, REPORT_KEYS)
        try:
            scope = ReportScope(request)
            data = _build(key, request, scope)
        except R.ReportParamError as exc:
            return _bad_request(exc)
        scope_info = {'company_id': scope.company_id, 'section_id': scope.section_id, 'project_id': scope.project_id}
        return Response({'report': key, 'filters': scope_info, **data})


# ── اکسل (د۵) ────────────────────────────────────────────────────────────────────────────────────────
TOTAL_LABEL = 'جمع کل'
TITLES = {
    'expense': 'گزارش هزینه',
    'unpaid-invoices': 'ماندهٔ پرداخت‌نشدهٔ فاکتورها',
    'petty-cash': 'گزارش تنخواه',
    'bank-payments': 'پرداخت‌ها از حساب بانکی',
    'labor-cost': 'بهای نیروی انسانی',
    'fleet-cost': 'هزینهٔ ناوگان',
}
AGE_COLS = [('۰ تا ۳۰ روز', 'age_0_30', 'money'), ('۳۱ تا ۶۰ روز', 'age_31_60', 'money'),
            ('۶۱ تا ۹۰ روز', 'age_61_90', 'money'), ('بیش از ۹۰ روز', 'age_over_90', 'money')]


def _rows(columns, items, total=None, label_key=None):
    for item in items:
        yield [item.get(key) for _fa, key, _kind in columns]
    if total is not None:
        yield [TOTAL_LABEL if key == label_key else total.get(key) for _fa, key, _kind in columns]


def _sheets(key, data):
    title = TITLES[key]
    if key == 'expense':
        if data['group_by'] == 'head':
            cols = [('گروه سرفصل', 'group_label', 'right'), ('کد سرفصل', 'code', 'num'), ('سرفصل', 'label', 'right'),
                    ('هزینهٔ فاکتور', 'invoice_amount', 'money'), ('هزینهٔ تنخواه', 'petty_amount', 'money'),
                    ('جمع هزینه', 'total', 'money')]
        else:
            cols = [('عنوان', 'label', 'right'), ('هزینهٔ فاکتور', 'invoice_amount', 'money'),
                    ('هزینهٔ تنخواه', 'petty_amount', 'money'), ('جمع هزینه', 'total', 'money'),
                    ('مالیات بر ارزش افزوده', 'vat_amount', 'money'), ('تعداد فاکتور', 'invoice_count', 'num')]
        label_key = 'group_label' if data['group_by'] == 'head' else 'label'
        return [(title, cols, _rows(cols, data['rows'], data['totals'], label_key))]
    if key == 'unpaid-invoices':
        cols = [('طرف‌حساب', 'counterparty_name', 'right'), ('تعداد فاکتور', 'count', 'num'),
                ('مانده', 'remaining', 'money'), *AGE_COLS]
        detail = [('شمارهٔ داخلی', 'number', 'text'), ('شمارهٔ فاکتور', 'invoice_number', 'text'),
                  ('تاریخ فاکتور', 'invoice_date', 'text'), ('تاریخ تأیید مدیر', 'approved_date', 'text'),
                  ('سن بدهی (روز)', 'age_days', 'num'), ('بخش', 'section_name', 'right'),
                  ('طرف‌حساب', 'counterparty_name', 'right'), ('مبلغ', 'amount', 'money'),
                  ('پرداخت‌شده', 'paid_amount', 'money'), ('مانده', 'remaining', 'money')]
        return [(title, cols, _rows(cols, data['rows'], data['totals'], 'counterparty_name')),
                ('فهرست فاکتورها', detail, _rows(detail, data['details']))]
    if key == 'petty-cash':
        cols = [('تنخواه‌گردان', 'custodian_name', 'right'), ('شرکت', 'company_name', 'right'),
                ('سقف', 'ceiling_amount', 'money'), ('موجودی اولیه', 'opening_balance', 'money'),
                ('شارژ', 'received_total', 'money'), ('هزینه', 'spent_total', 'money'),
                ('ردشده', 'rejected_total', 'money'), ('عودت', 'refund_total', 'money'),
                ('مانده', 'balance', 'money'), ('بدهی', 'debt', 'money'),
                ('صورت‌حساب باز', 'open_statements', 'num')]
        return [(title, cols, _rows(cols, data['rows'], data['totals'], 'custodian_name'))]
    if key == 'bank-payments':
        cols = [('شرکت', 'company_name', 'right'), ('بانک', 'bank_name', 'right'), ('عنوان حساب', 'account_title', 'right'),
                ('شماره حساب', 'account_number', 'text'), ('شبا', 'sheba_number', 'text'),
                ('موجودی اولیه', 'opening_balance', 'money'), ('تاریخ موجودی اولیه', 'opening_balance_date', 'text'),
                ('تعداد پرداخت', 'count', 'num'), ('جمع پرداخت', 'total', 'money')]
        detail = [('تاریخ پرداخت', 'payment_date', 'text'), ('مبلغ', 'amount', 'money'),
                  ('کد رهگیری', 'tracking_code', 'text'), ('روش', 'method', 'text'),
                  ('شمارهٔ فاکتور', 'invoice_number', 'text'), ('طرف‌حساب', 'counterparty_name', 'right'),
                  ('بانک', 'bank_name', 'right'), ('شبا', 'sheba_number', 'text')]
        return [(title, cols, _rows(cols, data['rows'], data['totals'], 'company_name')),
                ('فهرست پرداخت‌ها', detail, _rows(detail, data['details']))]
    if key == 'labor-cost':
        cols = [('بخش', 'section_name', 'right'), ('ماه', 'year_month', 'text'), ('تعداد', 'headcount', 'num'),
                ('حقوق پایه', 'base_salary', 'money'), ('اضافه‌کار', 'overtime', 'money'),
                ('مزایا', 'allowances', 'money'), ('سهم بیمهٔ کارفرما', 'employer_insurance', 'money'),
                ('جمع هزینه', 'total_cost', 'money'), ('میانگین هر نفر', 'average_cost', 'money')]
        return [(title, cols, _rows(cols, data['rows'], data['totals'], 'section_name'))]
    cols = [('بخش', 'section_name', 'right'), ('ماه', 'year_month', 'text'), ('خودروی فعال', 'vehicles', 'num'),
            ('تعداد سرویس', 'services', 'num'), ('کرایه', 'rent', 'money'), ('جمع تسویه', 'settlement', 'money')]
    return [(title, cols, _rows(cols, data['rows'], data['totals'], 'section_name'))]


class AccountingReportExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, key):
        _check_access(request, key, EXPORT_KEYS)
        try:
            scope = ReportScope(request)
            data = _build(key, request, scope, for_export=True)
        except R.ReportParamError as exc:
            return _bad_request(exc)
        buf = build_report_workbook(TITLES[key], _sheets(key, data))
        response = HttpResponse(
            buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        stamp = R.jdatetime.date.today().strftime('%Y-%m-%d')
        response['Content-Disposition'] = f'attachment; filename="accounting-report-{key}-{stamp}.xlsx"'
        return response
