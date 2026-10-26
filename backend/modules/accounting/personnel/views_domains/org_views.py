# -*- coding: utf-8 -*-
"""
ViewSets for companies' accounting-side studio tabs (documents, bank accounts, board, fiscal periods).
Projects, sections and section assignments live in core (`companies.org_views`, /api/org/) since step 2
of the Project_Section_To_Core plan.
"""

from rest_framework import viewsets, permissions, status, parsers, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from common.date_utils import normalize_digits
from accounts.audit_utils import log_audit_event
from accounts.views import OptionalPageNumberPagination

from companies.views import CompanyViewSet as CoreCompanyViewSet
from companies.access import get_request_company_id
from ..models import (
    Company,
    CompanyDocument,
    CompanyBankAccount,
    CompanyBoardMember,
    CompanyFiscalPeriod,
    CompanyPayrollProfile,
    ExpenseHead,
)
from ..serializers import (
    CompanySerializer,
    CompanyDocumentSerializer,
    CompanyBankAccountSerializer,
    CompanyBoardMemberSerializer,
    CompanyFiscalPeriodSerializer,
    CompanyPayrollProfileSerializer,
    ExpenseHeadSerializer,
)
from .scope_helpers import broadcast_org_structure_updated
from ..fiscal import to_shamsi_str, ensure_period_open
from .. import company_bank
from ..expense_heads import seed_default_expense_heads

# ویوست‌های مدیریت ساختار سازمانی، شرکت، پروژه، بخش، طرف‌حساب و فاکتور
# ══════════════════════════════════════════════════════════════════════════════

class CompanyViewSet(CoreCompanyViewSet):
    """
    مدیریت شرکت‌ها در حسابداری: ویوست هسته به‌علاوهٔ شمار پروژه‌ها، مدارک، حساب‌های بانکی،
    اعضای هیئت‌مدیره و پایش سررسید مدارک.
    """
    queryset = Company.objects.all().annotate(projects_count=Count('projects'))
    serializer_class = CompanySerializer

    def base_queryset(self):
        return Company.objects.all().annotate(
            projects_count=Count('projects')
        ).prefetch_related('documents', 'bank_accounts', 'board_members')

    @action(detail=True, methods=['get', 'patch', 'put'], url_path='payroll-profile')
    def payroll_profile(self, request, pk=None):
        """
        پروندهٔ بیمه و مالیات شرکت برای دیسکت حقوق (ت۵ طرح ۲.۱): خواندن با حوزهٔ `insurance_tax`
        (عضو شرکت هم می‌خواند، مثل وقتی که این فیلدها روی Company بودند) و نوشتن فقط با سطح «نوشتن» آن.
        پرونده در نخستین خواندن یا نوشتن ساخته می‌شود.
        """
        company = self.get_object()
        user = request.user
        if request.method == 'GET':
            ensure_company_section(user, company.id, 'insurance_tax', 'read', members_read=True)
            profile = CompanyPayrollProfile.objects.filter(company=company).first() or CompanyPayrollProfile(company=company)
            # ت۱۲: عضو بی‌سطح «خواندن» insurance_tax پاسخ هم‌شکل با شناسه‌های null می‌گیرد
            visible = company_section_allows(user, company.id, 'insurance_tax', 'read')
            return Response(CompanyPayrollProfileSerializer.visible_data(CompanyPayrollProfileSerializer(profile).data, visible))
        ensure_company_section(user, company.id, 'insurance_tax', 'write')
        profile = CompanyPayrollProfile.for_company(company)
        serializer = CompanyPayrollProfileSerializer(profile, data=request.data, partial=request.method == 'PATCH')
        serializer.is_valid(raise_exception=True)
        serializer.save()
        tab_id = request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_payroll_profile', 'update', company.id, company.name,
                                        client_tab_id=tab_id, sender_id=user.id, company_id=company.id)
        return Response(CompanyPayrollProfileSerializer.visible_data(serializer.data, True))

    @action(detail=False, methods=['get'], url_path='expiring-documents')
    def expiring_documents(self, request):
        """
        لیست کلیه مدارک منقضی شده یا در آستانه انقضا (کمتر از ۳۰ روز) برای تمام شرکت‌های مجاز کاربر
        جهت نمایش در ویجت پایش سررسید مدارک داشبورد مرکز عملیات
        """
        from datetime import timedelta
        user = request.user
        qs = CompanyDocument.objects.select_related('company', 'uploaded_by').filter(expiry_date__isnull=False)

        if not user.is_superuser:
            allowed_ids = companies_with_section(user, 'docs_archive', 'read').values_list('id', flat=True)
            qs = qs.filter(company_id__in=allowed_ids, is_confidential=False)

        today = timezone.now().date()
        threshold = today + timedelta(days=30)
        expiring_qs = qs.filter(expiry_date__lte=threshold).order_by('expiry_date')

        page = self.paginate_queryset(expiring_qs)
        if page is not None:
            serializer = CompanyDocumentSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = CompanyDocumentSerializer(expiring_qs, many=True, context={'request': request})
        return Response({
            'count': expiring_qs.count(),
            'results': serializer.data
        })

from personnel.company_section_gates import (  # noqa: E402
    company_section_allows, company_section_level, companies_with_section, ensure_company_section,
    section_or_member_company_ids,
    ensure_company_unchanged,
)


class CompanyDocumentViewSet(viewsets.ModelViewSet):
    """
    مدیریت اسناد، مدارک و مجوزهای رسمی شرکت‌ها با پشتیبانی از آپلود فایل،
    اعتبارسنجی BOLA و حفاظت از اسناد محرمانه
    """
    queryset = CompanyDocument.objects.all().select_related('company', 'uploaded_by')
    serializer_class = CompanyDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = CompanyDocument.objects.select_related('company', 'uploaded_by')

        company_id = self.request.query_params.get('company_id') or get_request_company_id(self.request)
        if company_id:
            cid = ensure_company_section(user, company_id, 'docs_archive', 'read')
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = companies_with_section(user, 'docs_archive', 'read').values_list('id', flat=True)
            qs = qs.filter(company_id__in=allowed_ids)

        # عدم نمایش اسناد محرمانه به کاربران غیرسوپریوزر/غیرادمین
        if not user.is_superuser:
            # مدارک محرمانه فقط در شرکت‌هایی که بخش حساس «مدارک محرمانه» را دست‌کم می‌خواند
            conf_ids = companies_with_section(user, 'docs_confidential', 'read').values_list('id', flat=True)
            qs = qs.filter(Q(is_confidential=False) | Q(company_id__in=conf_ids))

        doc_type = self.request.query_params.get('document_type')
        if doc_type:
            qs = qs.filter(document_type=doc_type)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        company = serializer.validated_data.get('company')
        if not company:
            raise serializers.ValidationError({"company": "انتخاب شرکت الزامی است."})

        # بررسی دسترسی کاربر به این شرکت (حداقل سطح ثبت اسناد)
        ensure_company_section(user, company.id, 'docs_archive', 'write')

        # اگر سند محرمانه علامت زده شده، کاربر باید مدیر ارشد باشد
        is_confidential = serializer.validated_data.get('is_confidential', False)
        if is_confidential and company_section_level(user, company.id, 'docs_confidential') != 'write':
            raise PermissionDenied("تنها مدیران ارشد مجاز به بارگذاری اسناد محرمانه هستند.")

        file_obj = self.request.FILES.get('file')
        file_size = file_obj.size if file_obj else 0

        instance = serializer.save(uploaded_by=user, file_size=file_size)
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_document', 'create', instance.id, instance.title, company_id=instance.company_id, client_tab_id=tab_id, sender_id=user.id)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        ensure_company_section(user, instance.company_id, 'docs_archive', 'write')
        ensure_company_unchanged(serializer)

        # عدم دسترسی کاربر عادی به ویرایش اسناد محرمانه
        if instance.is_confidential and company_section_level(user, instance.company_id, 'docs_confidential') != 'write':
            raise PermissionDenied("تنها مدیران ارشد مجاز به ویرایش اسناد محرمانه هستند.")

        # عدم اجازه به کاربر عادی جهت تغییر وضعیت محرمانگی سند
        new_confidential = serializer.validated_data.get('is_confidential', instance.is_confidential)
        if new_confidential != instance.is_confidential and company_section_level(user, instance.company_id, 'docs_confidential') != 'write':
            raise PermissionDenied("تغییر وضعیت محرمانگی سند تنها توسط مدیران ارشد مجاز است.")

        file_obj = self.request.FILES.get('file')
        kwargs = {}
        if file_obj:
            kwargs['file_size'] = file_obj.size

        updated_instance = serializer.save(**kwargs)
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_document', 'update', updated_instance.id, updated_instance.title, company_id=updated_instance.company_id, client_tab_id=tab_id, sender_id=user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        ensure_company_section(user, instance.company_id, 'docs_archive', 'write')
        if instance.is_confidential and company_section_level(user, instance.company_id, 'docs_confidential') != 'write':
            raise PermissionDenied("حذف مدرک محرمانه نیازمند مجوز «مدارک محرمانه» است.")

        instance_id = instance.id
        instance_title = instance.title
        comp_id = instance.company_id
        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_document', 'delete', instance_id, instance_title, company_id=comp_id, client_tab_id=tab_id, sender_id=user.id)

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        """
        دانلود امن سند با اعمال گارد امنیتی BOLA، کنترل محرمانگی و بازگرداندن FileResponse
        """
        import mimetypes
        import os
        import re
        from urllib.parse import quote
        from django.http import FileResponse, Http404

        user = request.user
        try:
            document = CompanyDocument.objects.select_related('company').get(pk=pk)
        except CompanyDocument.DoesNotExist:
            raise Http404("سند مورد نظر یافت نشد.")

        # ۱. بررسی دسترسی کاربر به شرکت متبوع (BOLA با حداقل سطح مشاهده)
        ensure_company_section(user, document.company_id, 'docs_archive', 'read')

        # ۲. بررسی سند محرمانه (صرفاً سوپریوزر و ادمین مجازند)
        if document.is_confidential and company_section_level(user, document.company_id, 'docs_confidential') == 'none':
            raise PermissionDenied("شما مجوز دسترسی به این سند محرمانه را ندارید.")

        # ۳. بررسی وجود فایل در حافظه ذخیره‌سازی
        if not document.file or not document.file.storage.exists(document.file.name):
            raise Http404("فایل سند در حافظه سرور یافت نشد.")

        file_handle = document.file.open('rb')
        content_type, _ = mimetypes.guess_type(document.file.name)
        content_type = content_type or 'application/octet-stream'

        # پاک‌سازی کاراکترهای غیرمجاز در نام فایل دانلودی و رعایت استاندارد RFC 6266
        ext = os.path.splitext(document.file.name)[1]
        safe_title = re.sub(r'[\\/*?:"<>|]', '_', document.title or 'document').strip()
        download_name = f"{safe_title}{ext}"
        ascii_fallback = f"doc_{document.id}{ext}"
        encoded_name = quote(download_name.encode('utf-8'))

        response = FileResponse(file_handle, content_type=content_type, as_attachment=True, filename=ascii_fallback)
        response['Content-Disposition'] = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_name}"

        return response

class CompanyBankAccountViewSet(viewsets.ModelViewSet):
    """
    مدیریت حساب‌های بانکی و شماره‌های شبای شرکت‌ها با پشتیبانی از چند حسابی،
    تعیین حساب اصلی و تفکیک سازمانی
    """
    queryset = CompanyBankAccount.objects.all().select_related('company')
    serializer_class = CompanyBankAccountSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = CompanyBankAccount.objects.select_related('company')

        company_id = self.request.query_params.get('company_id') or get_request_company_id(self.request)
        if company_id:
            cid = ensure_company_section(user, company_id, 'bank', 'read', members_read=True)
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = section_or_member_company_ids(user, 'bank', members_read=True)
            qs = qs.filter(company_id__in=allowed_ids)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(bank_name__icontains=search) |
                Q(account_number__icontains=search) |
                Q(sheba_number__icontains=search) |
                Q(account_title__icontains=search)
            )

        return qs.order_by('-is_primary', '-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        company = serializer.validated_data.get('company')
        if not company:
            raise serializers.ValidationError({"company": "انتخاب شرکت الزامی است."})

        # ثبت حساب یعنی ثبت شبا: کار حساس (ت۹)
        ensure_company_section(user, company.id, 'bank_sheba', 'write')
        # موجودی اولیه پایهٔ دورهٔ بسته نمی‌شود و ثبت آن در سابقه می‌آید (ص۳ و ص۵ طرح ۳.۳)
        ensure_period_open(company.id, serializer.validated_data.get('opening_balance_date'), 'opening_balance_date')
        with transaction.atomic():
            instance = serializer.save()
            company_bank.record_opening_change(instance, None, None, user)
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'create', instance.id, instance.sheba_number, company_id=instance.company_id, client_tab_id=tab_id, sender_id=user.id)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        ensure_company_section(user, instance.company_id, 'bank', 'write')
        ensure_company_unchanged(serializer)
        vd = serializer.validated_data
        if ('sheba_number' in vd and vd['sheba_number'] != instance.sheba_number) or ('is_primary' in vd and vd['is_primary'] != instance.is_primary):
            ensure_company_section(user, instance.company_id, 'bank_sheba', 'write')
        updated_instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'update', updated_instance.id, updated_instance.sheba_number, company_id=updated_instance.company_id, client_tab_id=tab_id, sender_id=user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        ensure_company_section(user, instance.company_id, 'bank', 'write')
        instance_id = instance.id
        sheba = instance.sheba_number
        comp_id = instance.company_id
        with transaction.atomic():
            # قفل ردیف تا گردشی هم‌زمان میان بررسی و حذف نیاید (یافتهٔ data-loss-reviewer ۳.۳-ب)
            locked = CompanyBankAccount.objects.select_for_update().get(pk=instance_id)
            if company_bank.bank_account_has_movements(locked):
                raise serializers.ValidationError({'detail': "این حساب گردش دارد و حذف نمی‌شود؛ آن را غیرفعال کنید."})
            locked.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'delete', instance_id, sheba, company_id=comp_id, client_tab_id=tab_id, sender_id=user.id)

    @action(detail=True, methods=['post'], url_path='set-primary')
    def set_primary(self, request, pk=None):
        """
        تنظیم یک حساب بانکی به عنوان حساب پیش‌فرض/اصلی شرکت
        """
        account = self.get_object()
        ensure_company_section(request.user, account.company_id, 'bank_sheba', 'write')
        account.is_primary = True
        account.save()
        tab_id = request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'update', account.id, account.sheba_number, company_id=account.company_id, client_tab_id=tab_id, sender_id=request.user.id)
        return Response(self.get_serializer(account).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='set-opening-balance')
    def set_opening_balance(self, request, pk=None):
        """تغییر موجودی اولیه و تاریخ آن با سابقه (ص۳ طرح ۳.۳)؛ تکرار همان بدنه بی‌اثر است."""
        account = self.get_object()
        user = request.user
        ensure_company_section(user, account.company_id, 'bank', 'write')
        amount_field = serializers.DecimalField(max_digits=15, decimal_places=0, min_value=0)
        try:
            amount = amount_field.run_validation(request.data.get('opening_balance', 0) or 0)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'opening_balance': exc.detail})
        raw_date = request.data.get('opening_balance_date')
        if raw_date in (None, ''):
            raise serializers.ValidationError({'opening_balance_date': "تاریخ موجودی اولیه الزامی است."})
        day = to_shamsi_str(raw_date)
        if not day:
            raise serializers.ValidationError({'opening_balance_date': "تاریخ نامعتبر است."})
        reason = str(request.data.get('reason') or '').strip()

        with transaction.atomic():
            account = CompanyBankAccount.objects.select_for_update().get(pk=account.pk)
            if account.opening_balance == amount and account.opening_balance_date == day:
                return Response(self.get_serializer(account).data, status=status.HTTP_200_OK)
            had_movements = company_bank.bank_account_has_movements(account)
            if had_movements:
                ensure_company_section(user, account.company_id, 'bank_opening_balance', 'write')
                if not reason:
                    raise serializers.ValidationError({'reason': "علت تغییر الزامی است."})
            ensure_period_open(account.company_id, account.opening_balance_date, 'opening_balance_date')
            ensure_period_open(account.company_id, day, 'opening_balance_date')
            old_amount, old_date = account.opening_balance, account.opening_balance_date
            account.opening_balance, account.opening_balance_date = amount, day
            account.save(update_fields=['opening_balance', 'opening_balance_date', 'updated_at'])
            company_bank.record_opening_change(account, old_amount, old_date, user, reason, had_movements)

        tab_id = request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'update', account.id, account.sheba_number, company_id=account.company_id, client_tab_id=tab_id, sender_id=user.id)
        return Response(self.get_serializer(account).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='opening-history')
    def opening_history(self, request, pk=None):
        """سابقهٔ ثبت و تغییر موجودی اولیه (ص۵)؛ فقط سطح خواندن `bank`، نه عضو ساده."""
        account = self.get_object()
        ensure_company_section(request.user, account.company_id, 'bank', 'read')
        rows = account.opening_balance_changes.select_related('changed_by').order_by('-changed_at', '-id')
        results = []
        for row in rows:
            by = row.changed_by
            results.append({
                'id': row.id,
                'old_amount': None if row.old_amount is None else str(row.old_amount),
                'old_date': row.old_date,
                'new_amount': str(row.new_amount),
                'new_date': row.new_date,
                'reason': row.reason,
                'had_movements': row.had_movements,
                'changed_by_name': (by.get_full_name() or by.username) if by else None,
                'changed_at': row.changed_at.isoformat(),
                'changed_at_shamsi': to_shamsi_str(row.changed_at),
            })
        return Response({'count': len(results), 'results': results})

def _expense_head_state(head):
    return {'code': head.code, 'title': head.title, 'parent_id': head.parent_id, 'is_active': head.is_active,
            'order': head.order}


class ExpenseHeadViewSet(viewsets.ModelViewSet):
    """
    سرفصل‌های هزینهٔ شرکت (ص۳ و ص۴ طرح ۳.۴): خواندن برای هر عضو شرکت (انتخاب در فرم)،
    ساخت، ویرایش، غیرفعال‌سازی و حذف با بخش مجوز `expense_heads`/نوشتن.
    """
    queryset = ExpenseHead.objects.select_related('parent')
    serializer_class = ExpenseHeadSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    SECTION = 'expense_heads'

    def get_queryset(self):
        user = self.request.user
        qs = ExpenseHead.objects.select_related('parent')
        company_id = self.request.query_params.get('company_id')
        if self.action == 'list' and not company_id:
            raise serializers.ValidationError({'company_id': "شناسهٔ شرکت الزامی است."})
        if company_id:
            cid = ensure_company_section(user, company_id, self.SECTION, 'read', members_read=True)
            qs = qs.filter(company_id=cid)
            if self.action == 'list' and company_section_allows(user, cid, self.SECTION, 'write'):
                qs = qs.annotate(usage_count=Count('invoices', distinct=True)
                                 + Count('petty_cash_transactions', distinct=True))
        elif not user.is_superuser:
            qs = qs.filter(company_id__in=section_or_member_company_ids(user, self.SECTION, members_read=True))
        if self.request.query_params.get('active') in ('1', 'true'):
            qs = qs.filter(is_active=True).filter(Q(parent__isnull=True) | Q(parent__is_active=True))
        return qs.order_by('order', 'code')

    def _broadcast(self, action, head_id, title, company_id):
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('expense_head', action, head_id, title, company_id=company_id,
                                        client_tab_id=tab_id, sender_id=self.request.user.id)

    def _audit(self, action, head_id, head, before=None):
        log_audit_event(
            module='treasury', action=action, target_model='ExpenseHead', target_object_id=head_id,
            target_repr=f'{head.code} - {head.title}', user=self.request.user, company_id=head.company_id,
            before_state=before, after_state=None if action == 'expense_head_deleted' else _expense_head_state(head),
        )

    def create(self, request, *args, **kwargs):
        # مجوز پیش از سنجش serializer، تا پیام «کد تکراری» چیزی از شرکت دیگر لو ندهد (یافتهٔ tenant-scope-reviewer)
        if request.data.get('company') in (None, ''):
            raise serializers.ValidationError({"company": "انتخاب شرکت الزامی است."})
        ensure_company_section(request.user, request.data.get('company'), self.SECTION, 'write')
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        ensure_company_section(request.user, self.get_object().company_id, self.SECTION, 'write')
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        company = serializer.validated_data.get('company')
        ensure_company_section(self.request.user, company.id, self.SECTION, 'write')
        instance = serializer.save()
        self._audit('expense_head_created', instance.id, instance)
        self._broadcast('create', instance.id, instance.title, instance.company_id)

    def perform_update(self, serializer):
        instance = serializer.instance
        ensure_company_section(self.request.user, instance.company_id, self.SECTION, 'write')
        ensure_company_unchanged(serializer)
        before = _expense_head_state(instance)
        updated = serializer.save()
        self._audit('expense_head_updated', updated.id, updated, before)
        self._broadcast('update', updated.id, updated.title, updated.company_id)

    def perform_destroy(self, instance):
        ensure_company_section(self.request.user, instance.company_id, self.SECTION, 'write')
        head_id = instance.id
        before = _expense_head_state(instance)
        with transaction.atomic():
            # قفل ردیف تا سندی هم‌زمان میان بررسی و حذف به آن وصل نشود (الگوی ۳.۳-ب)
            locked = ExpenseHead.objects.select_for_update().get(pk=head_id)
            if locked.children.exists():
                raise serializers.ValidationError({'detail': "این گروه زیرمجموعه دارد."})
            if locked.invoices.exists() or locked.petty_cash_transactions.exists():
                raise serializers.ValidationError({'detail': "این سرفصل در اسناد به کار رفته؛ آن را غیرفعال کنید."})
            locked.delete()
        self._audit('expense_head_deleted', head_id, instance, before)
        self._broadcast('delete', head_id, instance.title, instance.company_id)

    @action(detail=False, methods=['post'], url_path='seed-defaults')
    def seed_defaults(self, request):
        """ساخت فهرست پیش‌فرض برای شرکتی که سرفصلی ندارد (ص۵)؛ برای فهرست ناخالی بی‌اثر است."""
        cid = ensure_company_section(request.user, request.query_params.get('company_id'), self.SECTION, 'write')
        company = Company.objects.filter(pk=cid).first()
        if company is None:
            raise serializers.ValidationError({'company_id': "شرکت پیدا نشد."})
        created = seed_default_expense_heads(company)
        if created:
            log_audit_event(module='treasury', action='expense_head_created', target_model='ExpenseHead',
                            target_repr='seed-defaults', user=request.user, company_id=cid,
                            details={'event': 'seed_defaults', 'created': created})
            self._broadcast('create', None, None, cid)
        return Response({'created': created}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CompanyBoardMemberViewSet(viewsets.ModelViewSet):
    """
    مدیریت اعضای هیئت‌مدیره، صاحبان امضا و ارکان حاکمیتی شرکت‌ها با پشتیبانی از آپلود مدارک هویتی و احکام
    """
    queryset = CompanyBoardMember.objects.all().select_related('company')
    serializer_class = CompanyBoardMemberSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = CompanyBoardMember.objects.select_related('company')

        company_id = self.request.query_params.get('company_id') or get_request_company_id(self.request)
        if company_id:
            cid = ensure_company_section(user, company_id, 'board', 'read', members_read=False)
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = section_or_member_company_ids(user, 'board', members_read=False)
            qs = qs.filter(company_id__in=allowed_ids)

        search = self.request.query_params.get('search')
        if search:
            search_clean = normalize_digits(str(search)).strip()
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search_clean) |
                Q(represented_legal_name__icontains=search)
            )

        return qs.order_by('-has_signature_right', 'role', '-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        company = serializer.validated_data.get('company')
        if not company:
            raise serializers.ValidationError({"company": "انتخاب شرکت الزامی است."})

        ensure_company_section(user, company.id, 'board', 'write')
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_board_member', 'create', instance.id, f"{instance.first_name} {instance.last_name}", company_id=instance.company_id, client_tab_id=tab_id, sender_id=user.id)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        ensure_company_section(user, instance.company_id, 'board', 'write')
        ensure_company_unchanged(serializer)
        updated_instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_board_member', 'update', updated_instance.id, f"{updated_instance.first_name} {updated_instance.last_name}", company_id=updated_instance.company_id, client_tab_id=tab_id, sender_id=user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        ensure_company_section(user, instance.company_id, 'board', 'write')
        instance_id = instance.id
        title = f"{instance.first_name} {instance.last_name}"
        comp_id = instance.company_id
        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_board_member', 'delete', instance_id, title, company_id=comp_id, client_tab_id=tab_id, sender_id=user.id)

class CompanyFiscalPeriodViewSet(viewsets.ModelViewSet):
    """
    مدیریت دوره‌ها و سال‌های مالی شرکت‌ها (ایجاد بی‌همپوشانی، یک دورهٔ فعال، بستن، بازگشایی، سابقه)
    """
    queryset = CompanyFiscalPeriod.objects.all().select_related('company', 'closed_by')
    serializer_class = CompanyFiscalPeriodSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        qs = CompanyFiscalPeriod.objects.select_related('company', 'closed_by')

        company_id = self.request.query_params.get('company_id') or get_request_company_id(self.request)
        if company_id:
            cid = ensure_company_section(user, company_id, 'fiscal', 'read', members_read=True)
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = section_or_member_company_ids(user, 'fiscal', members_read=True)
            qs = qs.filter(company_id__in=allowed_ids)

        year = self.request.query_params.get('fiscal_year')
        if year:
            qs = qs.filter(fiscal_year=year)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        # ص۹ طرح ۳.۲: دورهٔ شامل یک تاریخ (برای پیام پیش از ارسال در فرم‌ها)
        date_param = self.request.query_params.get('date')
        if date_param:
            day = to_shamsi_str(date_param)
            if not day:
                return qs.none()
            qs = qs.filter(start_date__lte=day, end_date__gte=day)

        return qs.order_by('-fiscal_year')

    def _audit(self, action, period_id, period, before=None, event=None, severity='info'):
        """ص۸ طرح ۳.۲: ساخت، ویرایش، بستن، بازگشایی و حذف دوره در سابقه."""
        log_audit_event(
            module='treasury', action=action, severity=severity,
            target_model='CompanyFiscalPeriod', target_object_id=period_id,
            target_repr=f'{period.fiscal_year} - {period.title}', user=self.request.user,
            company_id=period.company_id, before_state=before,
            after_state=None if action == 'DELETE' else _fiscal_period_state(period),
            details={'event': event} if event else None,
        )

    def _lock_company(self, company_id):
        # ساخت و ویرایش هم‌زمان دوره‌های یک شرکت پشت سر هم اجرا می‌شوند تا همپوشانی و فعال یکتا درست بماند
        Company.objects.select_for_update().filter(pk=company_id).first()

    def _check_overlap(self, company_id, start, end, exclude_pk=None):
        qs = CompanyFiscalPeriod.objects.filter(company_id=company_id, start_date__lte=end, end_date__gte=start)
        if exclude_pk is not None:
            qs = qs.exclude(pk=exclude_pk)
        other = qs.order_by('fiscal_year').first()
        if other is not None:
            raise serializers.ValidationError({'start_date': [f'این بازه با دورهٔ مالی {other.fiscal_year} همپوشانی دارد.']})

    def _unset_other_active(self, period):
        if period.is_active:
            CompanyFiscalPeriod.objects.filter(company_id=period.company_id, is_active=True).exclude(
                pk=period.pk).update(is_active=False, updated_at=timezone.now())

    def perform_create(self, serializer):
        user = self.request.user
        data = serializer.validated_data
        company = data.get('company')
        if not company:
            raise serializers.ValidationError({"company": "انتخاب شرکت الزامی است."})
        ensure_company_section(user, company.id, 'fiscal', 'write')
        new_status = data.get('status', 'open')
        if new_status != 'open':
            # بستن یا بازگشایی کار حساس است و از راه close/reopen با fiscal_close انجام می‌شود
            ensure_company_section(user, company.id, 'fiscal_close', 'write')
        with transaction.atomic():
            self._lock_company(company.id)
            self._check_overlap(company.id, data['start_date'], data['end_date'])
            extra = {'closed_at': timezone.now(), 'closed_by': user} if new_status == 'closed' else {}
            period = serializer.save(**extra)
            self._unset_other_active(period)
            self._audit('CREATE', period.pk, period)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        data = serializer.validated_data
        ensure_company_section(user, instance.company_id, 'fiscal', 'write')
        ensure_company_unchanged(serializer)
        new_status = data.get('status', instance.status)
        status_changed = new_status != instance.status
        if status_changed:
            ensure_company_section(user, instance.company_id, 'fiscal_close', 'write')
        if instance.status == 'closed':
            if not user.is_superuser:
                raise PermissionDenied("سال مالی بسته شده است و ویرایش آن صرفاً توسط مدیر ارشد امکان‌پذیر است.")
            for field in ('start_date', 'end_date'):
                if field in data and data[field] != to_shamsi_str(getattr(instance, field)):
                    raise serializers.ValidationError(
                        {field: ['بازهٔ دورهٔ مالی بسته تغییر نمی‌کند؛ نخست دوره را بازگشایی کنید.']})
        before = _fiscal_period_state(instance)
        with transaction.atomic():
            self._lock_company(instance.company_id)
            start = data.get('start_date', instance.start_date)
            end = data.get('end_date', instance.end_date)
            self._check_overlap(instance.company_id, start, end, exclude_pk=instance.pk)
            extra = {}
            if status_changed:
                extra = ({'closed_at': timezone.now(), 'closed_by': user} if new_status == 'closed'
                         else {'closed_at': None, 'closed_by': None})
            period = serializer.save(**extra)
            self._unset_other_active(period)
            event = ('close' if new_status == 'closed' else 'reopen') if status_changed else None
            self._audit('UPDATE', period.pk, period, before=before, event=event,
                        severity='warning' if status_changed else 'info')

    def perform_destroy(self, instance):
        user = self.request.user
        ensure_company_section(user, instance.company_id, 'fiscal_close', 'write')
        if instance.status == 'closed':
            raise serializers.ValidationError("دوره مالی بسته شده را نمی‌توان حذف کرد.")
        period_id = instance.pk
        before = _fiscal_period_state(instance)
        with transaction.atomic():
            instance.delete()
            self._audit('DELETE', period_id, instance, before=before, severity='warning')

    @action(detail=True, methods=['post'], url_path='close-period')
    def close_period(self, request, pk=None):
        """بستن قطعی دوره و سال مالی؛ سند تاریخ‌دارِ این بازه دیگر ثبت، ویرایش یا حذف نمی‌شود."""
        period = self.get_object()
        user = request.user
        ensure_company_section(user, period.company_id, 'fiscal_close', 'write')
        with transaction.atomic():
            period = CompanyFiscalPeriod.objects.select_for_update().get(pk=period.pk)
            if period.status == 'closed':
                # تکرار همان درخواست (مثلاً از صف آفلاین) بی‌اثر است
                return Response({'detail': f'سال مالی {period.fiscal_year} از قبل بسته است.'})
            before = _fiscal_period_state(period)
            period.status = 'closed'
            period.closed_at = timezone.now()
            period.closed_by = user
            period.notes = request.data.get('notes', period.notes)
            period.save(update_fields=['status', 'closed_at', 'closed_by', 'notes', 'updated_at'])
            self._audit('UPDATE', period.pk, period, before=before, event='close', severity='warning')
        return Response({'detail': f'سال مالی {period.fiscal_year} با موفقیت بسته و قطعی شد.'})

    @action(detail=True, methods=['post'], url_path='reopen-period')
    def reopen_period(self, request, pk=None):
        """بازگشایی دورهٔ بسته (فقط از وضعیت بسته)."""
        period = self.get_object()
        user = request.user
        ensure_company_section(user, period.company_id, 'fiscal_close', 'write')
        with transaction.atomic():
            period = CompanyFiscalPeriod.objects.select_for_update().get(pk=period.pk)
            if period.status != 'closed':
                return Response({'code': 'not_closed', 'detail': 'فقط دورهٔ مالی بسته بازگشایی می‌شود.'},
                                status=status.HTTP_400_BAD_REQUEST)
            before = _fiscal_period_state(period)
            period.status = 'open'
            period.closed_at = None
            period.closed_by = None
            period.save(update_fields=['status', 'closed_at', 'closed_by', 'updated_at'])
            self._audit('UPDATE', period.pk, period, before=before, event='reopen', severity='warning')
        return Response({'detail': f'دوره مالی {period.fiscal_year} با موفقیت بازگشایی شد.'})


def _fiscal_period_state(period):
    return {
        'fiscal_year': period.fiscal_year, 'title': period.title, 'start_date': period.start_date,
        'end_date': period.end_date, 'status': period.status, 'is_active': period.is_active,
    }


__all__ = [
    'CompanyViewSet',
    'CompanyDocumentViewSet',
    'CompanyBankAccountViewSet',
    'CompanyBoardMemberViewSet',
    'CompanyFiscalPeriodViewSet',
]
