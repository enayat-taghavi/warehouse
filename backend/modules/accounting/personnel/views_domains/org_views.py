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
from django.db.models import Count, Q
from django.utils import timezone
from common.date_utils import normalize_digits
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
)
from ..serializers import (
    CompanySerializer,
    CompanyDocumentSerializer,
    CompanyBankAccountSerializer,
    CompanyBoardMemberSerializer,
    CompanyFiscalPeriodSerializer,
    CompanyPayrollProfileSerializer,
)
from .scope_helpers import broadcast_org_structure_updated

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
        instance = serializer.save()
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
        instance.delete()
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
        return Response(CompanyBankAccountSerializer(account).data, status=status.HTTP_200_OK)

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
    مدیریت دوره‌ها و سال‌های مالی شرکت‌ها (ایجاد، بستن دوره، انجماد کاردکس، بازگشایی)
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

        return qs.order_by('-fiscal_year')

    def perform_create(self, serializer):
        user = self.request.user
        company = serializer.validated_data.get('company')
        if not company:
            raise serializers.ValidationError({"company": "انتخاب شرکت الزامی است."})
        ensure_company_section(user, company.id, 'fiscal', 'write')
        if serializer.validated_data.get('status', 'open') != 'open':
            # بستن یا بازگشایی کار حساس است و از راه close/reopen با fiscal_close انجام می‌شود
            ensure_company_section(user, company.id, 'fiscal_close', 'write')
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        ensure_company_section(user, instance.company_id, 'fiscal', 'write')
        ensure_company_unchanged(serializer)
        new_status = serializer.validated_data.get('status', instance.status)
        if new_status != instance.status and 'closed' in (new_status, instance.status):
            ensure_company_section(user, instance.company_id, 'fiscal_close', 'write')
        if instance.status == 'closed' and not user.is_superuser:
            raise PermissionDenied("سال مالی بسته شده است و ویرایش آن صرفاً توسط مدیر ارشد امکان‌پذیر است.")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        ensure_company_section(user, instance.company_id, 'fiscal_close', 'write')
        if instance.status == 'closed':
            raise serializers.ValidationError("دوره مالی بسته شده را نمی‌توان حذف کرد.")
        instance.delete()

    @action(detail=True, methods=['post'], url_path='close-period')
    def close_period(self, request, pk=None):
        """بستن قطعی دوره و سال مالی"""
        period = self.get_object()
        user = request.user
        ensure_company_section(user, period.company_id, 'fiscal_close', 'write')
        period.status = 'closed'
        period.closed_at = timezone.now()
        period.closed_by = user
        period.notes = request.data.get('notes', period.notes)
        period.save(update_fields=['status', 'closed_at', 'closed_by', 'notes', 'updated_at'])
        return Response({'detail': f'سال مالی {period.fiscal_year} با موفقیت بسته و قطعی شد.'})

    @action(detail=True, methods=['post'], url_path='freeze-period')
    def freeze_period(self, request, pk=None):
        """انجماد موقت دوره مالی جهت رسیدگی و انبارگردانی"""
        period = self.get_object()
        user = request.user
        ensure_company_section(user, period.company_id, 'fiscal', 'write')
        period.status = 'frozen'
        period.save(update_fields=['status', 'updated_at'])
        return Response({'detail': f'دوره مالی {period.fiscal_year} موقتاً منجمد شد.'})

    @action(detail=True, methods=['post'], url_path='reopen-period')
    def reopen_period(self, request, pk=None):
        """بازگشایی مجدد دوره مالی منجمد یا بسته شده (سوپریوزر)"""
        period = self.get_object()
        user = request.user
        ensure_company_section(user, period.company_id, 'fiscal_close', 'write')
        period.status = 'open'
        period.closed_at = None
        period.closed_by = None
        period.save(update_fields=['status', 'closed_at', 'closed_by', 'updated_at'])
        return Response({'detail': f'دوره مالی {period.fiscal_year} با موفقیت بازگشایی شد.'})

__all__ = [
    'CompanyViewSet',
    'CompanyDocumentViewSet',
    'CompanyBankAccountViewSet',
    'CompanyBoardMemberViewSet',
    'CompanyFiscalPeriodViewSet',
]
