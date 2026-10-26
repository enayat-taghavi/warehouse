# -*- coding: utf-8 -*-
"""
ViewSets for counterparties, expense invoices, petty cash accounts/transactions, and workflow audit logs.
"""

import io
import openpyxl
from decimal import Decimal
from rest_framework import viewsets, permissions, status, parsers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.http import HttpResponse
from django.db.models import Q, Sum
from django.utils import timezone
from django.apps import apps
from django.shortcuts import get_object_or_404
from common.date_utils import normalize_digits
from accounts.views import OptionalPageNumberPagination
from companies.access import (
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access,
    ensure_scoped_write,
)
from ..models import (
    Counterparty,
    PartyBankAccount,
    ExpenseInvoice,
    PettyCashAccount,
    PettyCashTransaction,
    WorkflowAuditLog,
    ProjectSection,
    PersonnelProfile,
    PersonnelChangeRequest,
)
from ..serializers import (
    CounterpartySerializer,
    PartyBankAccountSerializer,
    ExpenseInvoiceSerializer,
    PettyCashAccountSerializer,
    PettyCashTransactionSerializer,
    WorkflowAuditLogSerializer,
)
from ..permissions import (
    IsCounterpartyManagerOrReadOnly,
    requires_company_scope,
)
from .scope_helpers import (
    broadcast_org_structure_updated,
    readable_company_ids,
    resolve_import_company,
)
from companies.org_roles import user_has_section_role
from accounts.scoped_permissions import can, section_q, sections_where
from ..counterparty_services import (
    create_bank_account,
    create_counterparty,
    delete_bank_account,
    remove_counterparty,
    update_bank_account,
    update_counterparty,
)

# مجوزهای بخشی ت۱۳ طرح ۲.۲: «چه کاری» از مجوز و «کجا» از انتساب (ق۶). فهرست‌ها با sections_where/section_q
# و کار روی هر ردیف با can(user, code, section) سنجیده می‌شود، نه has_perm (ت۸).
INVOICE_PERM = 'perm_invoice_record'
PETTY_CASH_MANAGE_PERM = 'perm_petty_cash_manage'

# فاکتور روی موتور گردش کار هسته (ت۱۷ طرح ۲.۳): نشانی و ورودی اکشن‌ها همان است، وضعیت در خود فاکتور (ت۲)
from django.db import transaction
from django.http import Http404
from workflow import engine as wf_engine
from workflow.errors import WorkflowError
from ..workflows import INVOICE_ENTITY, INVOICE_WORKFLOW
from ..workflow_engine import notify_document_changed
from ..fiscal import ensure_period_open

INVOICE_EDITABLE_STATUSES = ('draft', 'revision_required')


def _invoice_wf_call(fn, raise_drf=False):
    """اجرای یک فراخوان موتور؛ خطای موتور = پاسخ {code, error} با وضعیت همان خطا (مثلاً 409 task_already_done)."""
    try:
        fn()
    except WorkflowError as exc:
        if raise_drf:
            from rest_framework.exceptions import APIException
            err = APIException(exc.message_fa)
            err.status_code = exc.status
            raise err
        return Response({'code': exc.code, 'error': exc.message_fa, 'detail': exc.message_fa}, status=exc.status)
    return None


def _ensure_doc_period_open(section, value, field):
    """ص۵ طرح ۳.۲: سند تاریخ‌دارِ دورهٔ مالی بستهٔ شرکتِ بخش ثبت، ویرایش، حذف یا در گردش جابه‌جا نمی‌شود (400)."""
    company_id = getattr(getattr(section, 'project', None), 'company_id', None)
    ensure_period_open(company_id, value, field)


def _ensure_invoice_open(invoice):
    _ensure_doc_period_open(invoice.section, invoice.invoice_date_shamsi, 'invoice_date_shamsi')


def _ensure_petty_cash_open(tx):
    _ensure_doc_period_open(tx.section, tx.transaction_date_shamsi, 'transaction_date_shamsi')


def _section_id(value):
    try:
        return int(getattr(value, 'pk', value))
    except (TypeError, ValueError):
        return None


def _ensure_own_petty_cash_section(user, section):
    """
    تنخواه خودِ کاربر فقط در بخشی که انتساب فعال (هر نقشی، در هر سطح) آن را می‌پوشاند یا مدیر تنخواه آن است.
    """
    if user.is_superuser:
        return
    if section is None or not (
        user_has_section_role(user, section) or can(user, PETTY_CASH_MANAGE_PERM, section)
    ):
        raise PermissionDenied("شما در این بخش انتساب فعال ندارید و ثبت تنخواه در آن مجاز نیست.")


def _ensure_petty_cash_manager(user, section, message="شما مجوز مدیریت تنخواه این بخش را ندارید."):
    if not user.is_superuser and not can(user, PETTY_CASH_MANAGE_PERM, section):
        raise PermissionDenied(message)

def _tab_id(request):
    return request.headers.get('X-Client-Tab-Id') or (request.data.get('client_tab_id') if hasattr(request.data, 'get') else None)


def _broadcast_counterparty(request, action_name, cp_id, name, company_id):
    # طرف حساب سراسری دیگر نیست (ص۲ طرح ۳.۱): رویداد همیشه به شرکت خود طرف می‌رود
    broadcast_org_structure_updated('counterparty', action_name, cp_id, name, company_id=company_id,
                                    global_scope=False, client_tab_id=_tab_id(request), sender_id=request.user.id)


class CounterpartyViewSet(viewsets.ModelViewSet):
    """
    مدیریت طرف‌حساب‌های مالی (رانندگان، تعمیرگاه‌ها، جایگاه سوخت و پیمانکاران) روی طرف بیرونی هسته (ص۵ طرح ۳.۱).
    """
    queryset = Counterparty.objects.select_related('party', 'party__company').prefetch_related('party__bank_accounts')
    serializer_class = CounterpartySerializer
    permission_classes = [permissions.IsAuthenticated, IsCounterpartyManagerOrReadOnly]
    pagination_class = OptionalPageNumberPagination

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'create']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsCounterpartyManagerOrReadOnly()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        # ایزولاسیون چندمستاجری طرف‌حساب‌ها بر مبنای شرکت فعال؛ هر طرف حساب یک شرکت دارد (ق۶)
        company_param = get_request_company_id(self.request)
        try:
            cid = int(company_param) if company_param else None
        except (ValueError, TypeError):
            cid = None
        if not user.is_superuser:
            allowed_cids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if cid is not None:
                if cid not in allowed_cids:
                    raise PermissionDenied("شما به طرف‌حساب‌های این شرکت دسترسی ندارید.")
                qs = qs.filter(party__company_id=cid)
            else:
                qs = qs.filter(party__company_id__in=allowed_cids)
        elif cid is not None:
            qs = qs.filter(party__company_id=cid)

        c_type = self.request.query_params.get('counterparty_type')
        if c_type:
            qs = qs.filter(counterparty_type=c_type)
        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(party__kind=kind)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        search = self.request.query_params.get('search')
        if search:
            search_clean = normalize_digits(str(search)).strip()
            qs = qs.filter(Q(party__name__icontains=search) | Q(party__national_id__icontains=search_clean)
                           | Q(party__phone__icontains=search_clean) | Q(party__mobile__icontains=search_clean)
                           | Q(account_code__icontains=search_clean))
        return qs.order_by('party__name', 'id')

    def _resolve_company(self, explicit_company):
        """
        شرکت طرف تازه (ص۵): بدنه (اگر مجاز) ← سرآیند شرکت فعال (اگر مجاز) ← تنها شرکت مجاز ← اولین شرکت مجاز.
        شرکت غیرمجاز نادیده گرفته می‌شود و رد نمی‌شود، چون پاسخ 4xx رکورد صف آفلاین را حذف می‌کند.
        کاربر بی هیچ شرکت مجاز 403 و مدیر کل سامانهٔ بی‌شرکت 400 می‌گیرد. خروجی: (company_id, fallback).
        """
        user = self.request.user
        try:
            req_cid = get_request_company_id(self.request)
            req_cid = int(req_cid) if req_cid else None
        except (ValueError, TypeError):
            req_cid = None
        if not requires_company_scope(user):
            company_id = explicit_company.id if explicit_company else req_cid
            if not company_id:
                raise ValidationError({'company': "شرکت طرف‌حساب را انتخاب کنید."})
            return company_id, False
        allowed_cids = sorted(get_user_allowed_companies(user).values_list('id', flat=True))
        if not allowed_cids:
            raise PermissionDenied("شما به هیچ شرکتی دسترسی ندارید و نمی‌توانید طرف‌حساب ثبت کنید.")
        candidates = [explicit_company.id if explicit_company else None, req_cid]
        if len(allowed_cids) == 1:
            candidates.append(allowed_cids[0])
        company_id = next((c for c in candidates if c is not None and c in allowed_cids), None)
        if company_id is None:
            return allowed_cids[0], True
        return company_id, False

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company_id, fallback = self._resolve_company(serializer.validated_data.get('company'))
        party_data, role_data, _flat, bank_rows = serializer.split_validated()
        details = {'company_fallback': True} if fallback else None
        cp, existing = create_counterparty(company_id, party_data, role_data, bank_rows, request.user, details=details)
        cp = Counterparty.objects.select_related('party', 'party__company').prefetch_related(
            'party__bank_accounts').get(pk=cp.pk)
        if not existing:
            _broadcast_counterparty(request, 'create', cp.id, cp.name, cp.company_id)
        data = dict(self.get_serializer(cp).data)
        data['existing'] = existing
        return Response(data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        if requires_company_scope(user):
            ensure_scoped_write(user, instance.company_id, "فقط طرف‌حساب‌های شرکت‌های مجاز خود را می‌توانید ویرایش کنید.")
        party_data, role_data, flat_bank, _rows = serializer.split_validated()
        new_nid = party_data.get('national_id')
        if new_nid and new_nid != instance.party.national_id:
            from contacts.services import find_party
            other = find_party(instance.company_id, new_nid)
            if other is not None and other.pk != instance.party_id:
                raise ValidationError({'national_id': "طرف دیگری با همین کد یا شناسهٔ ملی در این شرکت هست."})
        update_counterparty(instance, party_data, role_data, flat_bank, user)
        serializer.instance = Counterparty.objects.select_related('party', 'party__company').prefetch_related(
            'party__bank_accounts').get(pk=instance.pk)
        _broadcast_counterparty(self.request, 'update', instance.id, instance.name, instance.company_id)

    def perform_destroy(self, instance):
        if requires_company_scope(self.request.user):
            ensure_scoped_write(self.request.user, instance.company_id, "فقط طرف‌حساب‌های شرکت‌های مجاز خود را می‌توانید حذف کنید.")
        instance_id, instance_name, company_id = instance.id, instance.name, instance.company_id
        # ص۵: طرف حساب دارای فاکتور یا تراکنش تنخواه فقط غیرفعال می‌شود
        result = remove_counterparty(instance, self.request.user)
        _broadcast_counterparty(self.request, 'update' if result == 'deactivated' else 'delete',
                                instance_id, instance_name, company_id)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from ..org_excel_engine import export_counterparties_excel
        section_id = request.query_params.get('section_id')
        return export_counterparties_excel(section_id, company_ids=readable_company_ids(request.user), user=request.user)

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from ..org_excel_engine import download_counterparties_template
        return download_counterparties_template()

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from ..org_excel_engine import import_counterparties_from_excel
        # غیرسوپریوزر فقط طرف‌حساب‌های شرکت فعالِ مجاز خودش را می‌سازد یا به‌روز می‌کند
        company_id = resolve_import_company(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایلی ارسال نشده است'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        if company_id is None:
            return Response({'error': 'شرکت مقصد درون‌ریزی را انتخاب کنید.'}, status=status.HTTP_400_BAD_REQUEST)
        res = import_counterparties_from_excel(file_obj, dry_run=dry_run, company_id=company_id, user=request.user)
        if not dry_run:
            _broadcast_counterparty(request, 'import', None, 'Bulk Import', company_id)
        return Response(res, status=status.HTTP_200_OK if res['success'] else status.HTTP_400_BAD_REQUEST)

class PartyBankAccountViewSet(viewsets.ModelViewSet):
    """
    حساب‌های بانکی طرف حساب (ص۵ طرح ۳.۱): `/api/personnel/party-bank-accounts/?party=<id>`.
    خواندن برای اعضای شرکت طرف (با پوشش ص۴)؛ نوشتن با حق ویرایش طرف حساب و فقط در شرکت‌های مجاز.
    """
    serializer_class = PartyBankAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsCounterpartyManagerOrReadOnly]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = PartyBankAccount.objects.select_related('party').filter(party__counterparty__isnull=False)
        if not user.is_superuser:
            qs = qs.filter(party__company_id__in=get_user_allowed_companies(user).values('id'))
        party_id = self.request.query_params.get('party')
        if party_id:
            try:
                qs = qs.filter(party_id=int(party_id))
            except (ValueError, TypeError):
                return qs.none()
        return qs.order_by('-is_primary', '-created_at')

    def _ensure_party_scope(self, party):
        if requires_company_scope(self.request.user):
            ensure_scoped_write(self.request.user, party.company_id, "فقط حساب بانکی طرف‌حساب‌های شرکت‌های مجاز خود را می‌توانید تغییر دهید.")

    def perform_create(self, serializer):
        party = serializer.validated_data.get('party')
        if party is None or not Counterparty.objects.filter(party=party).exists():
            raise ValidationError({'party': "طرف‌حساب را انتخاب کنید."})
        self._ensure_party_scope(party)
        data = {k: v for k, v in serializer.validated_data.items() if k != 'party'}
        serializer.instance = create_bank_account(party, data, self.request.user)

    def perform_update(self, serializer):
        self._ensure_party_scope(serializer.instance.party)
        data = {k: v for k, v in serializer.validated_data.items() if k != 'party'}
        serializer.instance = update_bank_account(serializer.instance, data, self.request.user)

    def perform_destroy(self, instance):
        self._ensure_party_scope(instance.party)
        delete_bank_account(instance, self.request.user)


class ExpenseInvoiceViewSet(viewsets.ModelViewSet):
    """
    مدیریت فاکتورهای هزینه‌ای بخش‌ها
    """
    queryset = ExpenseInvoice.objects.all().select_related('section', 'section__project', 'counterparty__party', 'created_by')
    serializer_class = ExpenseInvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        cid = validate_user_company_access(user, get_request_company_id(self.request))
        if cid:
            qs = qs.filter(section__project__company_id=cid)
        # فقط بخش‌هایی که کاربر در آن‌ها «ثبت و دیدن فاکتور» دارد (ت۱۳)؛ خروجی اکسل هم همین queryset است
        qs = qs.filter(section_q(user, INVOICE_PERM))
        section_id = self.request.query_params.get('section_id')
        if section_id:
            qs = qs.filter(section_id=section_id)
        project_id = self.request.query_params.get('project_id')
        if project_id:
            qs = qs.filter(section__project_id=project_id)
        inv_status = self.request.query_params.get('status')
        if inv_status:
            qs = qs.filter(status=inv_status)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(invoice_number__icontains=search) | Q(counterparty__party__name__icontains=search) | Q(description__icontains=search))
        return qs.order_by('-invoice_date_shamsi', '-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        section = serializer.validated_data.get('section')
        if section and section.project and section.project.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if section.project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ثبت فاکتور برای این شرکت نیستید.")
        if not user.is_superuser and (section is None or not can(user, INVOICE_PERM, section)):
            raise PermissionDenied("شما مجوز ثبت فاکتور در این بخش را ندارید.")
        _ensure_doc_period_open(section, serializer.validated_data.get('invoice_date_shamsi'), 'invoice_date_shamsi')
        # Guardian G2: default to draft status
        req_status = self.request.data.get('status')
        if not user.is_superuser:
            instance = serializer.save(created_by=user, status='draft')
        else:
            instance = serializer.save(created_by=user, status=req_status or 'draft')
        if req_status and req_status != 'draft':
            # ثبت مستقیم با وضعیت غیر پیش‌نویس (فقط مدیر کل) = ارسال به گردش موتور هسته
            instance.status = 'draft'
            instance.save(update_fields=['status', 'updated_at'])
            _invoice_wf_call(lambda: wf_engine.submit(INVOICE_WORKFLOW, instance, user), raise_drf=True)
        notify_document_changed(instance, 'created')

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()
        new_section = serializer.validated_data.get('section')
        if (new_section is not None and new_section.pk != instance.section_id and not user.is_superuser
                and not can(user, INVOICE_PERM, new_section)):
            raise PermissionDenied("شما مجوز ثبت فاکتور در بخش مقصد را ندارید.")
        new_status = serializer.validated_data.pop('status', None)
        if new_status and new_status != instance.status:
            # ت۲ طرح ۲.۳: وضعیت فاکتور فقط از راه گردش کار (ارسال، تأیید، عودت، رد، پرداخت، لغو) عوض می‌شود
            raise PermissionDenied("وضعیت فاکتور فقط از راه گردش کار تغییر می‌کند.")
        if instance.status not in INVOICE_EDITABLE_STATUSES and not user.is_superuser:
            raise PermissionDenied("فاکتور در جریان گردش کار یا بسته‌شده قابل ویرایش نیست.")
        # سند نه از دورهٔ بسته بیرون می‌رود و نه به آن وارد می‌شود
        _ensure_invoice_open(instance)
        _ensure_doc_period_open(new_section or instance.section,
                                serializer.validated_data.get('invoice_date_shamsi', instance.invoice_date_shamsi),
                                'invoice_date_shamsi')
        notify_document_changed(serializer.save(), 'updated')

    def perform_destroy(self, instance):
        _ensure_invoice_open(instance)
        # in a transaction, so the event goes out only after the delete commits
        with transaction.atomic():
            notify_document_changed(instance, 'deleted')
            instance.delete()

    def _workflow_invoice(self):
        """
        فاکتور برای اقدام گردش کار: از فهرست بخش‌های «ثبت و دیدن فاکتور» کاربر، یا از راه کار باز همین فاکتور
        (ت۱۱: دریافت‌کننده یا جانشینی که مجوز فهرست آن بخش را ندارد). نادیدنی = 404.
        """
        pk = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        obj = self.filter_queryset(self.get_queryset()).filter(pk=pk).first()
        if obj is None and wf_engine.task_grants_view(self.request.user, INVOICE_ENTITY, pk):
            obj = ExpenseInvoice.objects.select_related('section', 'section__project', 'counterparty__party').filter(pk=pk).first()
            if obj is not None and not self._invoice_company_visible(obj):
                obj = None
        if obj is None:
            raise Http404
        return obj

    def _invoice_company_visible(self, obj):
        """راه کار باز فقط در شرکت فعال درخواست و با عضویت زندهٔ کاربر در شرکت فاکتور (ردیف کهنهٔ دریافت‌کننده نه)."""
        company_id = obj.section.project.company_id
        active = get_request_company_id(self.request)
        if active and str(active) != str(company_id):
            return False
        try:
            validate_user_company_access(self.request.user, company_id)
        except PermissionDenied:
            return False
        return True

    def retrieve(self, request, *args, **kwargs):
        return Response(self.get_serializer(self._workflow_invoice()).data)

    def _act_on_open_task(self, request, instance, fn):
        task = wf_engine.open_task(INVOICE_WORKFLOW, instance.pk)
        if task is None:
            return Response({'code': 'task_already_done', 'error': 'این فاکتور کار بازی در گردش ندارد.'},
                            status=status.HTTP_409_CONFLICT)
        revision = request.data.get('revision')
        revision = int(revision) if str(revision or '').isdigit() else None
        return _invoice_wf_call(lambda: fn(task, revision))

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_invoice(self, request, pk=None):
        instance = self.get_object()
        _ensure_invoice_open(instance)
        if instance.status not in INVOICE_EDITABLE_STATUSES:
            return Response({'error': 'فقط فاکتورهای پیش‌نویس یا نیازمند بازنگری قابل ارسال هستند.'}, status=status.HTTP_400_BAD_REQUEST)
        # ثبت‌کننده باید در بخش فاکتور «ثبت و دیدن فاکتور» داشته باشد (get_object همین را سنجیده است)
        if not request.user.is_superuser and not can(request.user, INVOICE_PERM, instance.section):
            raise PermissionDenied("شما مجوز ثبت فاکتور در این بخش را ندارید.")
        err = _invoice_wf_call(lambda: wf_engine.submit(INVOICE_WORKFLOW, instance, request.user))
        if err is not None:
            return err
        return Response({'message': 'فاکتور با موفقیت به گردش کار ارسال شد.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_invoice(self, request, pk=None):
        instance = self._workflow_invoice()
        _ensure_invoice_open(instance)
        notes = (request.data.get('notes') or '').strip()
        err = self._act_on_open_task(request, instance, lambda task, rev: wf_engine.act(
            request.user, task, reason=notes, revision=rev, obj=instance))
        if err is not None:
            return err
        return Response({'message': 'تایید فاکتور با موفقیت ثبت شد.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_invoice(self, request, pk=None):
        instance = self._workflow_invoice()
        _ensure_invoice_open(instance)
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'درج دلیل رد فاکتور الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        err = self._act_on_open_task(request, instance, lambda task, rev: wf_engine.reject(
            request.user, task, reason, obj=instance, revision=rev))
        if err is not None:
            return err
        instance.rejection_reason = reason
        instance.save(update_fields=['rejection_reason', 'updated_at'])
        return Response({'message': 'فاکتور هزینه رد گردید.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='request-revision')
    def request_revision_invoice(self, request, pk=None):
        instance = self._workflow_invoice()
        _ensure_invoice_open(instance)
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'درج دلیل بازنگری الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        err = self._act_on_open_task(request, instance, lambda task, rev: wf_engine.return_for_fix(
            request.user, task, reason, obj=instance, revision=rev))
        if err is not None:
            return err
        instance.rejection_reason = reason
        instance.save(update_fields=['rejection_reason', 'updated_at'])
        return Response({'message': 'فاکتور با ثبت اشکال جهت بازنگری ارجاع شد.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='pay')
    def pay_invoice(self, request, pk=None):
        instance = self._workflow_invoice()
        _ensure_invoice_open(instance)
        tracking_code = (request.data.get('tracking_code') or request.data.get('payment_ref') or '').strip()
        if not tracking_code:
            return Response({'error': 'درج شماره پیگیری یا شماره سند بانکی الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        def _pay(task, rev):
            if task.step_key != 'treasury_pay':
                from workflow.errors import WorkflowError
                raise WorkflowError('not_payable', 'فاکتور هنوز به مرحلهٔ پرداخت نرسیده است', 409)
            # شمارهٔ پیگیری پیش از اقدام روی همان شیء نوشته می‌شود تا on_state_change پایان گردش آن را ببیند؛
            # خطای موتور کل تراکنش (و همین نوشتن) را برمی‌گرداند
            instance.payment_ref = tracking_code
            instance.paid_at = timezone.now()
            instance.paid_by = request.user
            instance.save(update_fields=['payment_ref', 'paid_at', 'paid_by', 'updated_at'])
            return wf_engine.act(request.user, task, reason=(request.data.get('notes') or '').strip(),
                                 revision=rev, obj=instance)

        with transaction.atomic():
            err = self._act_on_open_task(request, instance, _pay)
            if err is not None:
                transaction.set_rollback(True)
        if err is not None:
            instance.refresh_from_db()
            return err
        return Response({'message': 'تسویه فاکتور با موفقیت در خزانه‌داری ثبت گردید.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_invoice(self, request, pk=None):
        """لغو گردش به دست ثبت‌کننده، پیش از اقدام نفر دیگر (ت۸)؛ فاکتور به پیش‌نویس برمی‌گردد."""
        instance = self.get_object()
        _ensure_invoice_open(instance)
        wf_instance = wf_engine.instance_of(INVOICE_WORKFLOW, instance.pk)
        if wf_instance is None:
            return Response({'code': 'cancel_not_allowed', 'error': 'این فاکتور در گردش کار نیست.'},
                            status=status.HTTP_409_CONFLICT)
        err = _invoice_wf_call(lambda: wf_engine.cancel(request.user, wf_instance,
                                                        reason=(request.data.get('reason') or '').strip(),
                                                        obj=instance))
        if err is not None:
            return err
        return Response({'message': 'گردش فاکتور لغو شد و فاکتور به پیش‌نویس برگشت.', 'status': instance.status})

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """
        خروجی اکسل استاندارد ۲ ردیفه فاکتورهای هزینه بر اساس معماری سیستم
        """
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        qs = self.get_queryset()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "فاکتورهای هزینه"
        ws.views.sheetView[0].rightToLeft = True

        headers_fa = [
            'ردیف', 'شماره فاکتور', 'تاریخ فاکتور (شمسی)', 'پروژه', 'بخش', 
            'طرف‌حساب', 'سرفصل هزینه', 'مبلغ (ریال)', 'وضعیت', 'ثبت‌کننده', 'شرح هزینه'
        ]
        headers_en = [
            'row_num', 'invoice_number', 'invoice_date_shamsi', 'project_name', 'section_name',
            'counterparty_name', 'category', 'amount', 'status_display', 'created_by_name', 'description'
        ]

        title_font = Font(name='B Nazanin', size=11, bold=True, color='FFFFFF')
        key_font = Font(name='Segoe UI', size=8, italic=True, color='94A3B8')
        title_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        key_fill = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        ws.append(headers_fa)
        ws.append(headers_en)

        for col_idx in range(1, len(headers_fa) + 1):
            cell_fa = ws.cell(row=1, column=col_idx)
            cell_fa.font = title_font
            cell_fa.fill = title_fill
            cell_fa.alignment = Alignment(horizontal='center', vertical='center')

            cell_en = ws.cell(row=2, column=col_idx)
            cell_en.font = key_font
            cell_en.fill = key_fill
            cell_en.alignment = Alignment(horizontal='center', vertical='center')

        ws.row_dimensions[1].height = 26
        ws.row_dimensions[2].height = 16
        ws.freeze_panes = 'A3'

        data_font = Font(name='B Nazanin', size=10)
        data_font_num = Font(name='Segoe UI', size=10)

        for idx, inv in enumerate(qs, start=1):
            created_name = f"{inv.created_by.first_name} {inv.created_by.last_name}".strip() or inv.created_by.username if inv.created_by else 'سیستم'
            ws.append([
                idx,
                inv.invoice_number,
                inv.invoice_date_shamsi,
                inv.section.project.name if inv.section and inv.section.project else '',
                inv.section.name if inv.section else '',
                inv.counterparty.name if inv.counterparty else '',
                inv.category,
                inv.amount,
                inv.get_status_display(),
                created_name,
                inv.description or ''
            ])
            curr_row = idx + 2
            ws.row_dimensions[curr_row].height = 20
            for col_idx in range(1, len(headers_fa) + 1):
                c = ws.cell(row=curr_row, column=col_idx)
                c.border = thin_border
                c.alignment = Alignment(horizontal='center' if col_idx not in [6, 11] else 'right', vertical='center')
                if col_idx in [1, 2, 3, 8]:
                    c.font = data_font_num
                else:
                    c.font = data_font
                if col_idx == 8:
                    c.number_format = '#,##0'

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"expense_invoices_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

# ==============================================================================
# 0.2 ویوست‌های مدیریت تنخواه‌گردان (Petty Cash Management ViewSets)
# ==============================================================================

class PettyCashAccountViewSet(viewsets.ModelViewSet):
    """
    مدیریت و تعریف حساب‌ها / سقف‌های تنخواه‌گردان کارمندان در بخش‌های پروژه
    """
    queryset = PettyCashAccount.objects.all().select_related('section', 'section__project', 'custodian')
    serializer_class = PettyCashAccountSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        cid = validate_user_company_access(user, get_request_company_id(self.request))
        if cid:
            qs = qs.filter(section__project__company_id=cid)
        section_id = self.request.query_params.get('section_id')
        if section_id:
            qs = qs.filter(section_id=section_id)
        custodian_id = self.request.query_params.get('custodian_id')
        if custodian_id:
            qs = qs.filter(custodian_id=custodian_id)
        # مدیر تنخواه حساب‌های بخش‌هایی را می‌بیند که در آن‌ها «مدیریت تنخواه» دارد (با یا بی section_id؛
        # انتساب سطح شرکت یعنی همهٔ بخش‌های همان شرکت)؛ هر کس حساب‌های تنخواه خودش را هم می‌بیند.
        if not user.is_superuser:
            qs = qs.filter(
                Q(section_id__in=sections_where(user, PETTY_CASH_MANAGE_PERM).values('id')) | Q(custodian=user)
            )
        return qs.order_by('section', 'custodian')

    def perform_create(self, serializer):
        user = self.request.user
        section = serializer.validated_data.get('section')
        if section and section.project and section.project.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if section.project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به تعریف حساب تنخواه برای این شرکت نیستید.")
        # تعریف حساب و سقف تنخواه کار مدیر تنخواه همان بخش است
        _ensure_petty_cash_manager(user, section, "شما مجوز تعریف حساب تنخواه در این بخش را ندارید.")
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        _ensure_petty_cash_manager(user, instance.section_id, "شما مجوز ویرایش حساب تنخواه این بخش را ندارید.")
        new_section = serializer.validated_data.get('section')
        if new_section is not None and new_section.pk != instance.section_id:
            _ensure_petty_cash_manager(user, new_section, "شما مجوز مدیریت تنخواه بخش مقصد را ندارید.")
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_petty_cash_manager(self.request.user, instance.section_id, "شما مجوز حذف حساب تنخواه این بخش را ندارید.")
        instance.delete()

class PettyCashTransactionViewSet(viewsets.ModelViewSet):
    """
    مدیریت اسناد، هزینه‌کردها، درخواست‌های شارژ و تسویه تنخواه‌گردان
    """
    queryset = PettyCashTransaction.objects.all().select_related(
        'section', 'section__project', 'custodian', 'counterparty__party', 'created_by', 'account'
    )
    serializer_class = PettyCashTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        cid = validate_user_company_access(user, get_request_company_id(self.request))
        if cid:
            qs = qs.filter(section__project__company_id=cid)
        section_id = self.request.query_params.get('section_id')
        if section_id:
            qs = qs.filter(section_id=section_id)
        custodian_id = self.request.query_params.get('custodian_id')
        if custodian_id:
            qs = qs.filter(custodian_id=custodian_id)
        tx_type = self.request.query_params.get('transaction_type')
        if tx_type:
            qs = qs.filter(transaction_type=tx_type)
        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(receipt_number__icontains=search) |
                Q(category__icontains=search) |
                Q(counterparty__party__name__icontains=search) |
                Q(description__icontains=search)
            )

        # مدیر تنخواه اسناد بخش‌هایی را می‌بیند که در آن‌ها «مدیریت تنخواه» دارد؛ هر کس اسناد تنخواه خودش را.
        # پارامتر custodian_id دیگر قلمرو را باز نمی‌کند (پیش‌تر با آن اسناد هر متصدی دیده می‌شد).
        if not user.is_superuser:
            qs = qs.filter(
                Q(section_id__in=sections_where(user, PETTY_CASH_MANAGE_PERM).values('id')) | Q(custodian=user)
            )

        return qs.order_by('-transaction_date_shamsi', '-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        section = serializer.validated_data.get('section')
        if section and section.project and section.project.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if section.project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ثبت سند تنخواه برای این شرکت نیستید.")
        custodian = serializer.validated_data.get('custodian') or user
        if custodian.pk != user.pk:
            _ensure_petty_cash_manager(user, section, "ثبت سند تنخواه برای متصدی دیگر فقط با مجوز مدیریت تنخواه همان بخش ممکن است.")
        else:
            _ensure_own_petty_cash_section(user, section)
        _ensure_doc_period_open(section, serializer.validated_data.get('transaction_date_shamsi'),
                                'transaction_date_shamsi')

        # اتصال خودکار یا ایجاد حساب تنخواه برای بخش و کاربر
        account = serializer.validated_data.get('account')
        if not account and section:
            account, _ = PettyCashAccount.objects.get_or_create(
                section=section,
                custodian=custodian,
                defaults={'ceiling_amount': Decimal('100000000')}
            )

        instance = serializer.save(
            created_by=user,
            custodian=custodian,
            account=account,
            status='draft'
        )
        from ..workflow_engine import process_creation_with_auto_pass
        process_creation_with_auto_pass(instance, user, is_financial=True)
        instance.save()
        notify_document_changed(instance, 'created')

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()
        new_status = serializer.validated_data.get('status')
        new_section = serializer.validated_data.get('section')
        if new_section is not None and new_section.pk != instance.section_id:
            _ensure_petty_cash_manager(user, new_section, "شما مجوز مدیریت تنخواه بخش مقصد را ندارید.")
        if new_status and new_status != instance.status and not user.is_superuser:
            if new_status not in ('draft', 'pending_supervisor'):
                # Plan 2.2 (T13): moving a petty cash record past submission is management in its own section
                _ensure_petty_cash_manager(user, instance.section_id)
            from ..workflow_engine import determine_user_tier, WorkflowTiers
            tier = determine_user_tier(user, section=instance.section_id)
            if new_status in ['draft', 'pending_supervisor']:
                pass
            elif new_status in ['pending_accountant', 'revision_required', 'rejected'] and tier >= WorkflowTiers.TIER_2_SUPERVISOR:
                pass
            elif new_status in ['approved', 'revision_required', 'rejected'] and tier >= WorkflowTiers.TIER_3_ACCOUNTANT:
                pass
            elif new_status in ['paid'] and tier >= WorkflowTiers.TIER_5_TREASURY:
                pass
            else:
                raise PermissionDenied("شما سطح دسترسی لازم برای تغییر وضعیت سند تنخواه به این مرحله را ندارید.")
        _ensure_petty_cash_open(instance)
        _ensure_doc_period_open(new_section or instance.section,
                                serializer.validated_data.get('transaction_date_shamsi', instance.transaction_date_shamsi),
                                'transaction_date_shamsi')
        notify_document_changed(serializer.save(), 'updated')

    def perform_destroy(self, instance):
        _ensure_petty_cash_open(instance)
        # in a transaction, so the event goes out only after the delete commits
        with transaction.atomic():
            notify_document_changed(instance, 'deleted')
            instance.delete()

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_tx(self, request, pk=None):
        instance = self.get_object()
        _ensure_petty_cash_open(instance)
        from ..workflow_engine import advance_workflow_step
        advance_workflow_step(instance, request.user, target_status='pending_supervisor', is_financial=True)
        return Response({'message': 'تراکنش تنخواه با موفقیت به سرپرست ارسال شد.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_tx(self, request, pk=None):
        instance = self.get_object()
        _ensure_petty_cash_open(instance)
        # Plan 2.2 (T13): approving petty cash is petty-cash management in the record's own section
        _ensure_petty_cash_manager(request.user, instance.section_id)
        from ..workflow_engine import advance_workflow_step
        advance_workflow_step(instance, request.user, notes=request.data.get('notes'), is_financial=True)
        return Response({'message': 'تایید تراکنش تنخواه با موفقیت ثبت شد.', 'status': instance.status})

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_tx(self, request, pk=None):
        instance = self.get_object()
        _ensure_petty_cash_open(instance)
        _ensure_petty_cash_manager(request.user, instance.section_id)
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'درج دلیل رد الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        from ..workflow_engine import reject_workflow
        reject_workflow(instance, request.user, reason=reason)
        return Response({'message': 'تراکنش تنخواه رد گردید.', 'status': instance.status})

    @action(detail=False, methods=['get'], url_path='my-balance')
    def my_balance(self, request):
        """
        محاسبه مانده زنده تنخواه، سقف مصوب، هزینه‌های تاییدشده و در جریان (Guardian G1)
        """
        section_id = request.query_params.get('section_id')
        if not section_id:
            return Response(
                {'error': 'شناسه بخش پروژه (section_id) الزامی است.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        target_user_id = request.query_params.get('custodian_id')
        sid = _section_id(section_id)
        if sid is None:
            return Response({'error': 'شناسه بخش نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
        section_id = sid
        if target_user_id and (
            request.user.is_superuser
            or can(request.user, PETTY_CASH_MANAGE_PERM, sid)
        ):
            custodian = get_user_model().objects.filter(id=target_user_id).first() or request.user
        else:
            custodian = request.user

        account = PettyCashAccount.objects.filter(
            section_id=section_id, custodian=custodian, is_active=True
        ).first()

        ceiling = account.ceiling_amount if account else Decimal('0')

        # مجموع شارژهای دریافت شده (approved / paid)
        allocations_sum = PettyCashTransaction.objects.filter(
            section_id=section_id,
            custodian=custodian,
            transaction_type='allocation',
            status__in=['approved', 'paid']
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # مجموع هزینه‌های تایید شده و تسویه شده
        spent_sum = PettyCashTransaction.objects.filter(
            section_id=section_id,
            custodian=custodian,
            transaction_type='expense',
            status='approved'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # مجموع هزینه‌های در جریان تایید (draft / pending)
        pending_settlement = PettyCashTransaction.objects.filter(
            section_id=section_id,
            custodian=custodian,
            transaction_type='expense',
            status__in=['draft', 'pending_supervisor', 'pending_accountant']
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # مانده نقد در دست تنخواه‌دار
        current_balance = allocations_sum - spent_sum

        # درصد مصرف از سقف تنخواه
        utilization_rate = 0.0
        if ceiling > Decimal('0'):
            utilization_rate = float(min(Decimal('100.0'), (spent_sum / ceiling) * Decimal('100.0')))

        custodian_full_name = f"{custodian.first_name} {custodian.last_name}".strip() or custodian.username

        return Response({
            'account_id': account.id if account else None,
            'ceiling_amount': int(ceiling),
            'ceiling_amount_tomans': int(ceiling // 10),
            'total_allocated': int(allocations_sum),
            'total_allocated_tomans': int(allocations_sum // 10),
            'total_spent': int(spent_sum),
            'total_spent_tomans': int(spent_sum // 10),
            'current_balance': int(current_balance),
            'current_balance_tomans': int(current_balance // 10),
            'pending_settlement': int(pending_settlement),
            'pending_settlement_tomans': int(pending_settlement // 10),
            'utilization_rate': round(utilization_rate, 1),
            'card_or_account_number': account.card_or_account_number if account else '',
            'sheba_number': account.sheba_number if account else '',
            'custodian_name': custodian_full_name,
            'custodian_id': custodian.id
        })

    @action(detail=False, methods=['post'], url_path='request-replenishment')
    def request_replenishment(self, request):
        """
        ثبت سریع درخواست شارژ مجدد / واریز به حساب تنخواه
        """
        section_id = request.data.get('section_id')
        amount = request.data.get('amount')
        title = request.data.get('title') or 'درخواست شارژ مجدد تنخواه'
        description = request.data.get('description', '')
        receipt_number = request.data.get('receipt_number', '')

        if not section_id or not amount:
            return Response(
                {'error': 'شناسه بخش و مبلغ الزامی هستند.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount_dec = Decimal(str(amount))
            if amount_dec <= 0:
                raise ValueError()
        except Exception:
            return Response({'error': 'مبلغ باید عددی مثبت باشد.'}, status=status.HTTP_400_BAD_REQUEST)

        section = get_object_or_404(ProjectSection.objects.select_related('project'), id=section_id)
        custodian = request.user
        if not request.user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(request.user).values_list('id', flat=True))
            if section.project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ثبت سند تنخواه برای این شرکت نیستید.")
        _ensure_own_petty_cash_section(request.user, section)

        account, _ = PettyCashAccount.objects.get_or_create(
            section=section,
            custodian=custodian,
            defaults={'ceiling_amount': Decimal('100000000')}
        )

        from common.date_utils import gregorian_to_jalali
        now = timezone.now()
        shamsi_today = gregorian_to_jalali(now.year, now.month, now.day)

        tx = PettyCashTransaction.objects.create(
            account=account,
            section=section,
            custodian=custodian,
            created_by=request.user,
            transaction_type='allocation',
            amount=amount_dec,
            transaction_date_shamsi=shamsi_today,
            title=title,
            category='شارژ مجدد تنخواه',
            description=description,
            receipt_number=receipt_number,
            status='draft'
        )

        serializer = self.get_serializer(tx)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """
        خروجی اکسل رسمی ۲ ردیفه گردش و تراکنش‌های تنخواه‌گردان مطابق استانداردهای سیستم
        """
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        qs = self.get_queryset()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "گردش تنخواه‌گردان"
        ws.views.sheetView[0].rightToLeft = True

        headers_fa = [
            'ردیف', 'نوع تراکنش', 'شماره رسید/فاکتور', 'تاریخ (شمسی)', 'پروژه', 'بخش',
            'تنخواه‌دار', 'طرف‌حساب/فروشنده', 'سرفصل هزینه', 'عنوان / شرح مختصر',
            'مبلغ (ریال)', 'وضعیت سند', 'ثبت‌کننده', 'توضیحات تفصیلی'
        ]
        headers_en = [
            'row_num', 'transaction_type_display', 'receipt_number', 'transaction_date_shamsi',
            'project_name', 'section_name', 'custodian_name', 'counterparty_name',
            'category', 'title', 'amount', 'status_display', 'created_by_name', 'description'
        ]

        title_font = Font(name='B Nazanin', size=11, bold=True, color='FFFFFF')
        key_font = Font(name='Segoe UI', size=8, italic=True, color='94A3B8')
        title_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        key_fill = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        ws.append(headers_fa)
        ws.append(headers_en)

        for col_idx in range(1, len(headers_fa) + 1):
            cell_fa = ws.cell(row=1, column=col_idx)
            cell_fa.font = title_font
            cell_fa.fill = title_fill
            cell_fa.alignment = Alignment(horizontal='center', vertical='center')

            cell_en = ws.cell(row=2, column=col_idx)
            cell_en.font = key_font
            cell_en.fill = key_fill
            cell_en.alignment = Alignment(horizontal='center', vertical='center')

        ws.freeze_panes = 'A3'

        data_font = Font(name='B Nazanin', size=10)
        data_font_num = Font(name='Segoe UI', size=10)

        for idx, tx in enumerate(qs, start=1):
            curr_row = idx + 2
            cust_name = f"{tx.custodian.first_name} {tx.custodian.last_name}".strip() or tx.custodian.username
            cp_name = tx.counterparty.name if tx.counterparty else '-'
            creator_name = f"{tx.created_by.first_name} {tx.created_by.last_name}".strip() if tx.created_by else '-'
            row_data = [
                idx,
                tx.get_transaction_type_display(),
                tx.receipt_number or '-',
                tx.transaction_date_shamsi,
                tx.section.project.name if tx.section else '-',
                tx.section.name if tx.section else '-',
                cust_name,
                cp_name,
                tx.category,
                tx.title,
                float(tx.amount),
                tx.get_status_display(),
                creator_name,
                tx.description or '-'
            ]
            ws.append(row_data)

            for col_idx in range(1, len(row_data) + 1):
                c = ws.cell(row=curr_row, column=col_idx)
                c.border = thin_border
                c.alignment = Alignment(horizontal='center' if col_idx not in [8, 10, 14] else 'right', vertical='center')
                if col_idx in [1, 3, 4, 11]:
                    c.font = data_font_num
                else:
                    c.font = data_font
                if col_idx == 11:
                    c.number_format = '#,##0'

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"petty_cash_transactions_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

class WorkflowAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    مشاهده تاریخچه ممیزی گردش کار و رویدادهای تایید/رد با ایزولاسیون شرکتی
    """
    queryset = WorkflowAuditLog.objects.all().select_related('actor')
    serializer_class = WorkflowAuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    # برچسب‌های قدیمی موتور گردش کار ('personnelprofile') هم لاگ پرونده شمرده می‌شوند
    PERSONNEL_LOG_TYPES = ('personnel', 'personnelprofile')
    # مسیر رسیدن به شرکت برای مدل‌های دیگری که موتور گردش کار برایشان لاگ می‌نویسد
    COMPANY_PATH_CANDIDATES = (
        ('company', 'company_id'),
        ('section', 'section__project__company_id'),
        ('project', 'project__company_id'),
        ('personnel', 'personnel__company_id'),
        ('vehicle', 'vehicle__company_id'),
        ('period', 'period__company_id'),
    )

    def _company_scope_q(self, base_qs, allowed_ids):
        """
        DEF-19: محدودیت قطعی لاگ‌ها به شرکت‌های مجاز کاربر، با یا بدون سربرگ شرکت.
        لاگ پروندهٔ حذف‌شده یا Purgeشده با metadata.company_id سنجیده می‌شود.
        """
        personnel_ids = PersonnelProfile.objects.filter(
            Q(company_id__in=allowed_ids) | Q(section__project__company_id__in=allowed_ids)
        ).values('id')
        scope = Q(content_type__in=self.PERSONNEL_LOG_TYPES) & (
            Q(object_id__in=personnel_ids) | Q(metadata__company_id__in=allowed_ids)
        )
        scope |= Q(
            content_type='personnelchangerequest',
            object_id__in=PersonnelChangeRequest.objects.filter(personnel_id__in=personnel_ids).values('id'),
        )

        other_types = (
            base_qs.exclude(content_type__in=self.PERSONNEL_LOG_TYPES + ('personnelchangerequest',))
            .values_list('content_type', flat=True).distinct()
        )
        personnel_models = {m.__name__.lower(): m for m in apps.get_app_config('personnel').get_models()}
        for ct in other_types:
            model = personnel_models.get(ct)
            if model is None:
                continue
            field_names = {f.name for f in model._meta.get_fields()}
            path = next((p for name, p in self.COMPANY_PATH_CANDIDATES if name in field_names), None)
            if path is None:
                continue
            scope |= Q(content_type=ct, object_id__in=model.objects.filter(**{f'{path}__in': allowed_ids}).values('pk'))
        return scope

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        cid = validate_user_company_access(user, get_request_company_id(self.request))

        content_type = (self.request.query_params.get('content_type') or '').strip().lower()
        object_id = self.request.query_params.get('object_id')
        oid = None
        if object_id:
            try:
                oid = int(object_id)
            except (ValueError, TypeError):
                return qs.none()

        if content_type in self.PERSONNEL_LOG_TYPES:
            qs = qs.filter(content_type__in=self.PERSONNEL_LOG_TYPES)
            if oid is not None:
                qs = qs.filter(object_id=oid)
        elif content_type == 'personnelchangerequest':
            # Diff Viewer: لاگ اکشن‌های درخواست تغییرات روی تایملاین پرونده و با change_request_id ثبت می‌شود
            if oid is not None:
                qs = qs.filter(
                    Q(content_type='personnelchangerequest', object_id=oid) |
                    Q(content_type__in=self.PERSONNEL_LOG_TYPES, metadata__change_request_id=oid)
                )
            else:
                qs = qs.filter(
                    Q(content_type='personnelchangerequest') |
                    Q(content_type__in=self.PERSONNEL_LOG_TYPES, metadata__has_key='change_request_id')
                )
        elif content_type:
            qs = qs.filter(content_type=content_type)
            if oid is not None:
                qs = qs.filter(object_id=oid)
        elif oid is not None:
            qs = qs.filter(object_id=oid)

        # ایزولاسیون شرکتی همیشگی (DEF-19): بدون سربرگ هم به شرکت‌های مجاز کاربر محدود می‌شود
        if not user.is_superuser:
            allowed_ids = [cid] if cid else list(get_user_allowed_companies(user).values_list('id', flat=True))
            if not allowed_ids:
                return qs.none()
            qs = qs.filter(self._company_scope_q(qs, allowed_ids))

        return qs.order_by('-created_at')

__all__ = [
    'CounterpartyViewSet',
    'ExpenseInvoiceViewSet',
    'PettyCashAccountViewSet',
    'PettyCashTransactionViewSet',
    'WorkflowAuditLogViewSet',
]
