# -*- coding: utf-8 -*-
"""
ViewSets for organization structure, companies, projects, sections, and user assignments.
"""

from rest_framework import viewsets, permissions, status, parsers, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from common.date_utils import normalize_digits
from accounts.views import OptionalPageNumberPagination

User = get_user_model()
from companies.views import CompanyViewSet as CoreCompanyViewSet
from companies.access import (
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access,
    ensure_scoped_write,
)
from ..models import (
    Company,
    CompanyDocument,
    CompanyBankAccount,
    CompanyBoardMember,
    CompanyFiscalPeriod,
    FinancialProject,
    ProjectSection,
    UserSectionAssignment,
    DailyAttendance,
    ExpenseInvoice,
    PersonnelProfile,
    PayrollYearlySettings,
    VehicleTripLog,
)
from ..serializers import (
    CompanySerializer,
    CompanyDocumentSerializer,
    CompanyBankAccountSerializer,
    CompanyBoardMemberSerializer,
    CompanyFiscalPeriodSerializer,
    FinancialProjectSerializer,
    ProjectSectionSerializer,
    UserSectionAssignmentSerializer,
)
from ..permissions import (
    IsProjectStructureManagerOrReadOnly,
    has_structure_write_permission,
    requires_company_scope,
)
from .scope_helpers import (
    broadcast_org_structure_updated,
    ensure_scoped_assignment,
    readable_company_ids,
    resolve_import_company,
    user_belongs_to_company,
)

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
            allowed_ids = get_user_allowed_companies(user, required_level='docs_read').values_list('id', flat=True)
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
            cid = validate_user_company_access(user, company_id, required_level='docs_read')
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = get_user_allowed_companies(user, required_level='docs_read').values_list('id', flat=True)
            qs = qs.filter(company_id__in=allowed_ids)

        # عدم نمایش اسناد محرمانه به کاربران غیرسوپریوزر/غیرادمین
        if not (user.is_superuser or user.is_staff):
            qs = qs.filter(is_confidential=False)

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
        validate_user_company_access(user, company.id, required_level='docs_write')

        # اگر سند محرمانه علامت زده شده، کاربر باید مدیر ارشد باشد
        is_confidential = serializer.validated_data.get('is_confidential', False)
        if is_confidential and not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تنها مدیران ارشد مجاز به بارگذاری اسناد محرمانه هستند.")

        file_obj = self.request.FILES.get('file')
        file_size = file_obj.size if file_obj else 0

        instance = serializer.save(uploaded_by=user, file_size=file_size)
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_document', 'create', instance.id, instance.title, instance.company_id, tab_id, user.id)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        validate_user_company_access(user, instance.company_id, required_level='docs_write')

        # عدم دسترسی کاربر عادی به ویرایش اسناد محرمانه
        if instance.is_confidential and not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تنها مدیران ارشد مجاز به ویرایش اسناد محرمانه هستند.")

        # عدم اجازه به کاربر عادی جهت تغییر وضعیت محرمانگی سند
        new_confidential = serializer.validated_data.get('is_confidential', instance.is_confidential)
        if new_confidential != instance.is_confidential and not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تغییر وضعیت محرمانگی سند تنها توسط مدیران ارشد مجاز است.")

        file_obj = self.request.FILES.get('file')
        kwargs = {}
        if file_obj:
            kwargs['file_size'] = file_obj.size

        updated_instance = serializer.save(**kwargs)
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_document', 'update', updated_instance.id, updated_instance.title, updated_instance.company_id, tab_id, user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        validate_user_company_access(user, instance.company_id, required_level='docs_write')
        if not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تنها مدیران ارشد مجاز به حذف مدارک رسمی شرکت هستند.")

        instance_id = instance.id
        instance_title = instance.title
        comp_id = instance.company_id
        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_document', 'delete', instance_id, instance_title, comp_id, tab_id, user.id)

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
        validate_user_company_access(user, document.company_id, required_level='docs_read')

        # ۲. بررسی سند محرمانه (صرفاً سوپریوزر و ادمین مجازند)
        if document.is_confidential and not (user.is_superuser or user.is_staff):
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
            cid = validate_user_company_access(user, company_id)
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = get_user_allowed_companies(user).values_list('id', flat=True)
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

        validate_user_company_access(user, company.id)
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'create', instance.id, instance.sheba_number, instance.company_id, tab_id, user.id)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        validate_user_company_access(user, instance.company_id)
        updated_instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'update', updated_instance.id, updated_instance.sheba_number, updated_instance.company_id, tab_id, user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        validate_user_company_access(user, instance.company_id)
        instance_id = instance.id
        sheba = instance.sheba_number
        comp_id = instance.company_id
        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'delete', instance_id, sheba, comp_id, tab_id, user.id)

    @action(detail=True, methods=['post'], url_path='set-primary')
    def set_primary(self, request, pk=None):
        """
        تنظیم یک حساب بانکی به عنوان حساب پیش‌فرض/اصلی شرکت
        """
        account = self.get_object()
        validate_user_company_access(request.user, account.company_id)
        account.is_primary = True
        account.save()
        tab_id = request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_bank_account', 'update', account.id, account.sheba_number, account.company_id, tab_id, request.user.id)
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
            cid = validate_user_company_access(user, company_id)
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = get_user_allowed_companies(user).values_list('id', flat=True)
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

        validate_user_company_access(user, company.id)
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_board_member', 'create', instance.id, f"{instance.first_name} {instance.last_name}", instance.company_id, tab_id, user.id)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        validate_user_company_access(user, instance.company_id)
        updated_instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_board_member', 'update', updated_instance.id, f"{updated_instance.first_name} {updated_instance.last_name}", updated_instance.company_id, tab_id, user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        validate_user_company_access(user, instance.company_id)
        if not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تنها مدیران ارشد مجاز به حذف اعضای هیئت‌مدیره هستند.")
        instance_id = instance.id
        title = f"{instance.first_name} {instance.last_name}"
        comp_id = instance.company_id
        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('company_board_member', 'delete', instance_id, title, comp_id, tab_id, user.id)

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
            cid = validate_user_company_access(user, company_id)
            if cid:
                qs = qs.filter(company_id=cid)
        elif not user.is_superuser:
            allowed_ids = get_user_allowed_companies(user).values_list('id', flat=True)
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
        validate_user_company_access(user, company.id)
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        validate_user_company_access(user, instance.company_id)
        if instance.status == 'closed' and not user.is_superuser:
            raise PermissionDenied("سال مالی بسته شده است و ویرایش آن صرفاً توسط مدیر ارشد امکان‌پذیر است.")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        validate_user_company_access(user, instance.company_id)
        if not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تنها مدیران ارشد مجاز به حذف دوره مالی هستند.")
        if instance.status == 'closed':
            raise serializers.ValidationError("دوره مالی بسته شده را نمی‌توان حذف کرد.")
        instance.delete()

    @action(detail=True, methods=['post'], url_path='close-period')
    def close_period(self, request, pk=None):
        """بستن قطعی دوره و سال مالی"""
        period = self.get_object()
        user = request.user
        validate_user_company_access(user, period.company_id)
        if not (user.is_superuser or user.is_staff):
            raise PermissionDenied("تنها مدیران ارشد مجاز به بستن سال مالی هستند.")
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
        validate_user_company_access(user, period.company_id)
        period.status = 'frozen'
        period.save(update_fields=['status', 'updated_at'])
        return Response({'detail': f'دوره مالی {period.fiscal_year} موقتاً منجمد شد.'})

    @action(detail=True, methods=['post'], url_path='reopen-period')
    def reopen_period(self, request, pk=None):
        """بازگشایی مجدد دوره مالی منجمد یا بسته شده (سوپریوزر)"""
        period = self.get_object()
        user = request.user
        if not user.is_superuser:
            raise PermissionDenied("صرفاً مدیر کل مجاز به بازگشایی دوره مالی بسته شده است.")
        period.status = 'open'
        period.closed_at = None
        period.closed_by = None
        period.save(update_fields=['status', 'closed_at', 'closed_by', 'updated_at'])
        return Response({'detail': f'دوره مالی {period.fiscal_year} با موفقیت بازگشایی شد.'})

class FinancialProjectViewSet(viewsets.ModelViewSet):
    """
    مدیریت پروژه‌های مالی و عملیاتی (مراکز هزینه مستقل)
    """
    queryset = FinancialProject.objects.all().annotate(sections_count=Count('sections'))
    serializer_class = FinancialProjectSerializer
    permission_classes = [permissions.IsAuthenticated, IsProjectStructureManagerOrReadOnly]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # عایق‌سازی شرکت و رفع رخنه امنیتی BOLA:
        if not user.is_authenticated:
            return qs.none()

        company_param = self.request.query_params.get('company_id') or self.request.query_params.get('company') or self.request.headers.get('X-Company-ID')
        if not user.is_superuser:
            allowed_company_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if company_param:
                try:
                    cid = int(company_param)
                    if cid not in allowed_company_ids:
                        raise PermissionDenied("شما به اطلاعات و پروژه‌های این شرکت دسترسی ندارید.")
                    qs = qs.filter(company_id=cid)
                except (ValueError, TypeError):
                    pass
            else:
                qs = qs.filter(Q(company_id__in=allowed_company_ids) | Q(company__isnull=True))
        elif company_param:
            try:
                qs = qs.filter(company_id=int(company_param))
            except (ValueError, TypeError):
                pass

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        search = self.request.query_params.get('search')
        if search:
            search_clean = normalize_digits(str(search)).strip()
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search_clean))
        return qs.order_by('code')

    def perform_create(self, serializer):
        user = self.request.user
        company = serializer.validated_data.get('company')
        if requires_company_scope(user):
            ensure_scoped_write(user, company.id if company else None, "پروژه فقط برای شرکت‌های مجاز شما ساخته می‌شود (پروژهٔ سراسری را فقط مدیر ارشد می‌سازد).")
        if company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if company.id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ایجاد پروژه برای این شرکت نیستید.")
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id') or self.request.data.get('client_tab_id')
        broadcast_org_structure_updated('project', 'create', instance.id, instance.name, None, tab_id, self.request.user.id)

    def perform_update(self, serializer):
        user = self.request.user
        if requires_company_scope(user):
            ensure_scoped_write(user, serializer.instance.company_id, "فقط پروژه‌های شرکت‌های مجاز خود را می‌توانید ویرایش کنید (پروژهٔ سراسری را فقط مدیر ارشد تغییر می‌دهد).")
            if 'company' in serializer.validated_data:
                new_company = serializer.validated_data.get('company')
                # جابه‌جایی پروژه بین شرکت‌ها اعضای بخش‌هایش را عضو شرکت تازه می‌کند؛ فقط سوپریوزر
                if (new_company.id if new_company else None) != serializer.instance.company_id:
                    raise PermissionDenied("انتقال پروژه به شرکت دیگر یا تبدیل آن به پروژهٔ سراسری را فقط مدیر ارشد انجام می‌دهد.")
        company = serializer.validated_data.get('company') or serializer.instance.company
        if company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if company.id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ویرایش پروژه در این شرکت نیستید.")
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id') or self.request.data.get('client_tab_id')
        broadcast_org_structure_updated('project', 'update', instance.id, instance.name, None, tab_id, self.request.user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        if requires_company_scope(user):
            ensure_scoped_write(user, instance.company_id, "فقط پروژه‌های شرکت‌های مجاز خود را می‌توانید حذف کنید (پروژهٔ سراسری را فقط مدیر ارشد تغییر می‌دهد).")
        if instance.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if instance.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به حذف پروژه این شرکت نیستید.")
        instance_id = instance.id
        instance_name = instance.name

        # بررسی محافظت و قوانین عدم حذف زنجیره‌ای (تسک ۱.۲ و ۳۵)
        has_invoices = ExpenseInvoice.objects.filter(section__project=instance).exists()
        has_payroll_settings = PayrollYearlySettings.objects.filter(project=instance).exists()
        has_attendance = DailyAttendance.objects.filter(project=instance).exists()
        has_trips = VehicleTripLog.objects.filter(project=instance).exists()
        has_personnel = PersonnelProfile.objects.filter(project=instance).exists()

        if has_invoices or has_payroll_settings or has_attendance or has_trips or has_personnel:
            # جلوگیری قاطع از حذف فیزیکی جهت حفاظت از اسناد مالی و تبدیل به غیرفعال‌سازی نرم
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
            tab_id = self.request.headers.get('X-Client-Tab-Id')
            broadcast_org_structure_updated('project', 'update', instance_id, instance_name, None, tab_id, self.request.user.id)
            return

        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('project', 'delete', instance_id, instance_name, None, tab_id, self.request.user.id)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from ..org_excel_engine import export_projects_excel
        return export_projects_excel(company_ids=readable_company_ids(request.user))

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from ..org_excel_engine import download_org_template
        return download_org_template('projects')

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from ..org_excel_engine import import_projects_from_excel
        # غیرسوپریوزر فقط درون شرکت فعالِ مجاز خودش درون‌ریزی می‌کند
        company_id = resolve_import_company(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل بارگذاری نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        result = import_projects_from_excel(file_obj, dry_run=dry_run, company_id=company_id)
        if not dry_run:
            tab_id = request.headers.get('X-Client-Tab-Id')
            broadcast_org_structure_updated('project', 'import', None, 'اکسل پروژه‌ها', None, tab_id, request.user.id)
        return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)

class ProjectSectionViewSet(viewsets.ModelViewSet):
    """
    مدیریت بخش‌ها و دپارتمان‌های تابعه هر پروژه
    """
    queryset = ProjectSection.objects.all().select_related('project')
    serializer_class = ProjectSectionSerializer
    permission_classes = [permissions.IsAuthenticated, IsProjectStructureManagerOrReadOnly]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        cid = validate_user_company_access(user, get_request_company_id(self.request))
        if cid:
            qs = qs.filter(project__company_id=cid)
        elif not user.is_superuser and user.is_authenticated:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            qs = qs.filter(Q(project__company_id__in=allowed_ids) | Q(project__company__isnull=True))

        project_id = self.request.query_params.get('project_id') or self.request.query_params.get('project')
        if project_id:
            try:
                qs = qs.filter(project_id=int(project_id))
            except (ValueError, TypeError):
                pass
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        search = self.request.query_params.get('search')
        if search:
            search_clean = normalize_digits(str(search)).strip()
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search_clean))
        return qs.order_by('project__code', 'code')

    def perform_create(self, serializer):
        user = self.request.user
        project = serializer.validated_data.get('project')
        if requires_company_scope(user):
            ensure_scoped_write(user, project.company_id if project else None, "بخش فقط در پروژه‌های شرکت‌های مجاز شما ساخته می‌شود (پروژهٔ سراسری را فقط مدیر ارشد تغییر می‌دهد).")
        if project and project.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ایجاد بخش برای پروژه‌های این شرکت نیستید.")
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id') or self.request.data.get('client_tab_id')
        broadcast_org_structure_updated('section', 'create', instance.id, instance.name, instance.project_id, tab_id, self.request.user.id)

    def perform_update(self, serializer):
        user = self.request.user
        if requires_company_scope(user):
            current_project = serializer.instance.project
            ensure_scoped_write(user, current_project.company_id if current_project else None, "فقط بخش‌های شرکت‌های مجاز خود را می‌توانید ویرایش کنید (بخش پروژهٔ سراسری را فقط مدیر ارشد تغییر می‌دهد).")
            if 'project' in serializer.validated_data:
                new_project = serializer.validated_data.get('project')
                ensure_scoped_write(user, new_project.company_id if new_project else None, "انتقال بخش به پروژهٔ شرکت دیگر یا پروژهٔ سراسری مجاز نیست.")
                # جابه‌جایی بخش بین شرکت‌ها اعضایش را عضو شرکت تازه می‌کند؛ فقط سوپریوزر
                if new_project.company_id != (current_project.company_id if current_project else None):
                    raise PermissionDenied("انتقال بخش به پروژهٔ شرکت دیگر را فقط مدیر ارشد انجام می‌دهد.")
        project = serializer.validated_data.get('project') or self.get_object().project
        if project and project.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به ویرایش بخش در پروژه‌های این شرکت نیستید.")
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id') or self.request.data.get('client_tab_id')
        broadcast_org_structure_updated('section', 'update', instance.id, instance.name, instance.project_id, tab_id, self.request.user.id)

    def perform_destroy(self, instance):
        user = self.request.user
        if requires_company_scope(user):
            ensure_scoped_write(user, instance.project.company_id if instance.project else None, "فقط بخش‌های شرکت‌های مجاز خود را می‌توانید حذف کنید (بخش پروژهٔ سراسری را فقط مدیر ارشد تغییر می‌دهد).")
        if instance.project and instance.project.company and not user.is_superuser:
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if instance.project.company_id not in allowed_ids:
                raise PermissionDenied("شما مجاز به حذف بخش‌های این شرکت نیستید.")
        instance_id = instance.id
        instance_name = instance.name
        project_id = instance.project_id

        # بررسی محافظت و قوانین عدم حذف زنجیره‌ای (تسک ۱.۲ و ۳۵)
        has_invoices = ExpenseInvoice.objects.filter(section=instance).exists()
        has_attendance = DailyAttendance.objects.filter(section=instance).exists()
        has_trips = VehicleTripLog.objects.filter(section=instance).exists()
        has_personnel = PersonnelProfile.objects.filter(section=instance).exists()

        if has_invoices or has_attendance or has_trips or has_personnel:
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
            tab_id = self.request.headers.get('X-Client-Tab-Id')
            broadcast_org_structure_updated('section', 'update', instance_id, instance_name, project_id, tab_id, self.request.user.id)
            return

        instance.delete()
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('section', 'delete', instance_id, instance_name, project_id, tab_id, self.request.user.id)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from ..org_excel_engine import export_sections_excel
        project_id = request.query_params.get('project_id')
        return export_sections_excel(project_id, company_ids=readable_company_ids(request.user))

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from ..org_excel_engine import download_org_template
        return download_org_template('sections')

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from ..org_excel_engine import import_sections_from_excel
        # غیرسوپریوزر فقط در پروژه‌های شرکت فعالِ مجاز خودش درون‌ریزی می‌کند
        company_id = resolve_import_company(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل بارگذاری نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        result = import_sections_from_excel(file_obj, dry_run=dry_run, company_id=company_id)
        if not dry_run:
            tab_id = request.headers.get('X-Client-Tab-Id')
            broadcast_org_structure_updated('section', 'import', None, 'اکسل بخش‌ها', None, tab_id, request.user.id)
        return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='clone-assignments')
    def clone_assignments(self, request, pk=None):
        """
        کپی دسته‌جمعی پرسنل یک بخش مبدأ به این بخش (مقصد)
        """
        target_section = self.get_object()
        source_section_id = request.data.get('source_section_id')
        if not source_section_id:
            return Response({'error': 'شناسه بخش مبدأ الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            source_sec_id_int = int(source_section_id)
        except (ValueError, TypeError):
            return Response({'error': 'شناسه بخش مبدأ نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        if source_sec_id_int == target_section.id:
            return Response({'error': 'بخش مبدأ و مقصد نمی‌توانند یکسان باشند.'}, status=status.HTTP_400_BAD_REQUEST)

        source_section = ProjectSection.objects.filter(id=source_sec_id_int).first()
        if not source_section:
            return Response({'error': 'بخش مبدأ یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        if requires_company_scope(request.user):
            # مبدأ و مقصد هر دو در شرکت‌های مجاز راهبر و در یک شرکت، تا کپی برای کسی دسترسی شرکت تازه نسازد
            target_company_id = target_section.project.company_id if target_section.project_id else None
            source_company_id = source_section.project.company_id if source_section.project_id else None
            ensure_scoped_write(request.user, target_company_id, "کپی انتساب فقط در بخش‌های شرکت‌های مجاز شما ممکن است.")
            if source_company_id != target_company_id:
                raise PermissionDenied("کپی انتساب فقط بین بخش‌های یک شرکت مجاز است.")

        source_assignments = UserSectionAssignment.objects.filter(section=source_section, is_active=True)
        if not source_assignments.exists():
            return Response({'error': 'هیچ انتساب فعالی در بخش مبدأ جهت کپی وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)

        # راهبر تشکیلات (بدون مجوز قدیمی نوشتن ساختار) با کپی هم نقش تازه برای خودش نمی‌سازد
        if requires_company_scope(request.user) and not has_structure_write_permission(request.user):
            source_assignments = source_assignments.exclude(user=request.user)

        copied_count = 0
        skipped_count = 0
        with transaction.atomic():
            for sa in source_assignments:
                existing_assignment = UserSectionAssignment.objects.filter(
                    user=sa.user,
                    section=target_section,
                    role=sa.role
                ).first()

                if not existing_assignment:
                    UserSectionAssignment.objects.create(
                        user=sa.user,
                        section=target_section,
                        role=sa.role,
                        is_active=True
                    )
                    copied_count += 1
                else:
                    if not existing_assignment.is_active:
                        existing_assignment.is_active = True
                        existing_assignment.save(update_fields=['is_active', 'updated_at'])
                        copied_count += 1
                    else:
                        skipped_count += 1

        tab_id = request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated(
            'assignment',
            'clone',
            target_section.id,
            f'کپی چارت از {source_section.name} به {target_section.name}',
            target_section.project_id,
            tab_id,
            request.user.id
        )

        return Response({
            'success': True,
            'message': f'ساختار پرسنلی با موفقیت کپی شد. ({copied_count} انتساب جدید/فعال‌شده، {skipped_count} بدون تغییر)',
            'copied_count': copied_count,
            'skipped_count': skipped_count
        }, status=status.HTTP_200_OK)

class UserSectionAssignmentViewSet(viewsets.ModelViewSet):
    """
    مدیریت انتساب کاربران به بخش‌ها و تعیین نقش‌های سازمانی
    """
    queryset = UserSectionAssignment.objects.all().select_related('user', 'section', 'section__project')
    serializer_class = UserSectionAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsProjectStructureManagerOrReadOnly]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if requires_company_scope(user):
            # فهرست اعضای بخش‌های شرکت‌های دیگر نباید دیده شود (بخش‌های سراسری و انتساب‌های خود کاربر می‌مانند)
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            qs = qs.filter(
                Q(section__project__company_id__in=allowed_ids)
                | Q(section__project__company__isnull=True)
                | Q(user=user)
            )
        section_id = self.request.query_params.get('section_id')
        if section_id:
            try:
                qs = qs.filter(section_id=int(section_id))
            except (ValueError, TypeError):
                pass
        project_id = self.request.query_params.get('project_id')
        if project_id:
            try:
                qs = qs.filter(section__project_id=int(project_id))
            except (ValueError, TypeError):
                pass
        user_id = self.request.query_params.get('user_id')
        if user_id:
            try:
                qs = qs.filter(user_id=int(user_id))
            except (ValueError, TypeError):
                pass
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs.order_by('-created_at')

    @action(detail=False, methods=['get'], url_path='my-sections')
    def my_sections(self, request):
        """
        دریافت بخش‌های فعال منتسب به کاربر لاگین‌شده جاری
        """
        user = request.user
        if not user.is_authenticated:
            return Response([], status=status.HTTP_200_OK)

        company_param = request.query_params.get('company_id') or request.query_params.get('company') or request.headers.get('X-Company-ID')
        target_company_id = None
        if company_param:
            try:
                target_company_id = int(company_param)
            except (ValueError, TypeError):
                pass

        if not user.is_superuser and target_company_id:
            allowed_cids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if target_company_id not in allowed_cids:
                return Response([], status=status.HTTP_200_OK)

        if user.is_superuser or user.is_staff:
            sections = ProjectSection.objects.filter(is_active=True, project__is_active=True).select_related('project')
            if target_company_id:
                sections = sections.filter(project__company_id=target_company_id)
            return Response(ProjectSectionSerializer(sections, many=True).data)

        assignments = UserSectionAssignment.objects.filter(
            user=user,
            is_active=True,
            section__is_active=True,
            section__project__is_active=True
        ).select_related('section', 'section__project')

        if target_company_id:
            assignments = assignments.filter(section__project__company_id=target_company_id)

        sections = [a.section for a in assignments]
        unique_sections = {s.id: s for s in sections}.values()
        return Response(ProjectSectionSerializer(unique_sections, many=True).data)

    def create(self, request, *args, **kwargs):
        """
        ایجاد انتساب یا فعال‌سازی مجدد رکورد غیرفعال قبلی بدون خطای یکتایی دیتابیس
        """
        user_id = request.data.get('user')
        section_id = request.data.get('section')
        role = request.data.get('role', 'employee')

        try:
            user_id_int = int(user_id) if user_id else None
            sec_id_int = int(section_id) if section_id else None
        except (ValueError, TypeError):
            user_id_int, sec_id_int = None, None

        if user_id_int and sec_id_int and requires_company_scope(request.user):
            # پیش از مسیر فعال‌سازی دوباره هم باید محدودهٔ شرکت راهبر بررسی شود
            section = ProjectSection.objects.select_related('project').filter(id=sec_id_int).first()
            if section is not None:
                ensure_scoped_assignment(request.user, user_id_int, section)

        if user_id_int and sec_id_int:
            existing = UserSectionAssignment.objects.filter(
                user_id=user_id_int,
                section_id=sec_id_int,
                role=role
            ).first()
            if existing:
                if not existing.is_active:
                    existing.is_active = True
                    existing.save(update_fields=['is_active', 'updated_at'])
                    tab_id = request.headers.get('X-Client-Tab-Id') or request.data.get('client_tab_id')
                    proj_id = existing.section.project_id if existing.section else None
                    broadcast_org_structure_updated('assignment', 'create', existing.id, str(existing.user), proj_id, tab_id, request.user.id)
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_201_CREATED)

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        if requires_company_scope(self.request.user):
            target_user = serializer.validated_data.get('user')
            ensure_scoped_assignment(
                self.request.user, target_user.id if target_user else None, serializer.validated_data.get('section'),
                final_active=serializer.validated_data.get('is_active', True)
            )
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id') or self.request.data.get('client_tab_id')
        proj_id = instance.section.project_id if instance.section else None
        broadcast_org_structure_updated('assignment', 'create', instance.id, str(instance.user), proj_id, tab_id, self.request.user.id)

    def perform_update(self, serializer):
        if requires_company_scope(self.request.user):
            current = serializer.instance
            current_company_id = current.section.project.company_id if current.section and current.section.project_id else None
            ensure_scoped_write(self.request.user, current_company_id, "فقط انتساب‌های بخش‌های شرکت‌های مجاز خود را می‌توانید ویرایش کنید.")
            final_user = serializer.validated_data.get('user', current.user)
            final_section = serializer.validated_data.get('section', current.section)
            ensure_scoped_assignment(
                self.request.user, final_user.id if final_user else None, final_section,
                final_active=serializer.validated_data.get('is_active', current.is_active)
            )
        instance = serializer.save()
        tab_id = self.request.headers.get('X-Client-Tab-Id') or self.request.data.get('client_tab_id')
        proj_id = instance.section.project_id if instance.section else None
        broadcast_org_structure_updated('assignment', 'update', instance.id, str(instance.user), proj_id, tab_id, self.request.user.id)

    def perform_destroy(self, instance):
        if requires_company_scope(self.request.user):
            company_id = instance.section.project.company_id if instance.section and instance.section.project_id else None
            ensure_scoped_write(self.request.user, company_id, "فقط انتساب‌های بخش‌های شرکت‌های مجاز خود را می‌توانید حذف کنید.")
        instance_id = instance.id
        proj_id = instance.section.project_id if instance.section else None
        # غیرفعال‌سازی نرم جهت حفظ ردپای حسابرسی و انتساب‌های تاریخی
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        tab_id = self.request.headers.get('X-Client-Tab-Id')
        broadcast_org_structure_updated('assignment', 'delete', instance_id, None, proj_id, tab_id, self.request.user.id)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from ..org_excel_engine import export_assignments_excel
        project_id = request.query_params.get('project_id')
        role = request.query_params.get('role')
        return export_assignments_excel(project_id, role, company_ids=readable_company_ids(request.user))

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        from ..org_excel_engine import download_org_template
        return download_org_template('assignments')

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        from ..org_excel_engine import import_assignments_from_excel
        # غیرسوپریوزر فقط بخش‌های شرکت فعالِ مجاز خودش را و فقط برای اعضای همان شرکت انتساب می‌دهد
        company_id = resolve_import_company(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل بارگذاری نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = request.data.get('dry_run') in ['true', 'True', True]
        forbidden_self = request.user.id if company_id is not None and not has_structure_write_permission(request.user) else None
        result = import_assignments_from_excel(
            file_obj, dry_run=dry_run, company_id=company_id,
            member_check=user_belongs_to_company if requires_company_scope(request.user) else None,
            forbidden_user_id=forbidden_self
        )
        if not dry_run:
            tab_id = request.headers.get('X-Client-Tab-Id')
            broadcast_org_structure_updated('assignment', 'import', None, 'اکسل انتساب‌ها', None, tab_id, request.user.id)
        return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='bulk-assign')
    def bulk_assign(self, request):
        """
        انتساب همزمان چند کاربر به یک بخش و سمت سازمانی با اعتبارسنجی کامل ورودی‌ها
        """
        section_id = request.data.get('section_id') or request.data.get('section')
        user_ids = request.data.get('user_ids') or []
        role = request.data.get('role', 'employee')

        if not section_id:
            return Response({'error': 'شناسه بخش الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            section_id_int = int(section_id)
        except (ValueError, TypeError):
            return Response({'error': 'شناسه بخش باید عددی باشد.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_roles = dict(UserSectionAssignment.ROLE_CHOICES).keys()
        if role not in valid_roles:
            return Response({'error': f'نقش ارسالی نامعتبر است. نقش‌های مجاز: {list(valid_roles)}'}, status=status.HTTP_400_BAD_REQUEST)

        if not user_ids or not isinstance(user_ids, list):
            return Response({'error': 'لیست شناسه‌های کاربران الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_user_ids = []
        for uid in user_ids:
            try:
                valid_user_ids.append(int(uid))
            except (ValueError, TypeError):
                pass

        if not valid_user_ids:
            return Response({'error': 'هیچ شناسه کاربری معتبری ارسال نشده است.'}, status=status.HTTP_400_BAD_REQUEST)

        section = ProjectSection.objects.filter(id=section_id_int).first()
        if not section:
            return Response({'error': 'بخش سازمانی مورد نظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        # اعتبارسنجی وجود کاربران در دیتابیس
        existing_users = set(User.objects.filter(id__in=valid_user_ids).values_list('id', flat=True))

        if requires_company_scope(request.user):
            # همه یا هیچ: بخش باید در شرکت‌های مجاز باشد و هر کاربر عضو شرکتِ این بخش.
            # کاربر ناموجود هم مثل غیرعضو گزارش می‌شود تا وجود نام‌های کاربری بیرون از شرکت لو نرود.
            company_id = section.project.company_id if section.project_id else None
            ensure_scoped_write(request.user, company_id, "انتساب فقط در بخش‌های شرکت‌های مجاز شما ممکن است (بخش پروژهٔ سراسری مجاز نیست).")
            rejected = []
            for uid in valid_user_ids:
                if uid not in existing_users:
                    rejected.append(uid)
                    continue
                try:
                    ensure_scoped_assignment(request.user, uid, section)
                except PermissionDenied:
                    rejected.append(uid)
            if rejected:
                # نام کاربری فقط برای کاربرانی که در شرکت‌های مجاز نویسنده دیده می‌شوند (بقیه با شناسه)
                allowed_ids = set(get_user_allowed_companies(request.user).values_list('id', flat=True))
                names = dict(User.objects.filter(id__in=rejected).filter(
                    Q(company_accesses__company_id__in=allowed_ids, company_accesses__access_level='workspace_full')
                    | Q(section_assignments__section__project__company_id__in=allowed_ids)
                ).distinct().values_list('id', 'username'))
                labels = '، '.join(names.get(uid, f'#{uid}') for uid in rejected)
                raise PermissionDenied(f"این کاربران را نمی‌توان در این بخش منتسب کرد (عضو شرکت این بخش نیستند یا انتساب خود است): {labels}. آن‌ها را از انتخاب بردارید.")

        if not existing_users:
            return Response({'error': 'هیچ یک از کاربران ارسالی در سیستم یافت نشدند.'}, status=status.HTTP_404_NOT_FOUND)

        created_assignments = []
        with transaction.atomic():
            for uid in valid_user_ids:
                if uid not in existing_users:
                    continue
                assignment, _ = UserSectionAssignment.objects.get_or_create(
                    user_id=uid,
                    section=section,
                    role=role,
                    defaults={'is_active': True}
                )
                if not assignment.is_active:
                    assignment.is_active = True
                    assignment.save(update_fields=['is_active', 'updated_at'])
                created_assignments.append(assignment)

        tab_id = request.headers.get('X-Client-Tab-Id') or request.data.get('client_tab_id')
        proj_id = section.project_id
        broadcast_org_structure_updated('assignment', 'bulk_create', None, f"{len(created_assignments)} کاربر", proj_id, tab_id, request.user.id)

        assign_ids = [a.id for a in created_assignments]
        qs = UserSectionAssignment.objects.filter(id__in=assign_ids).select_related('user', 'section', 'section__project')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

__all__ = [
    'CompanyViewSet',
    'CompanyDocumentViewSet',
    'CompanyBankAccountViewSet',
    'CompanyBoardMemberViewSet',
    'CompanyFiscalPeriodViewSet',
    'FinancialProjectViewSet',
    'ProjectSectionViewSet',
    'UserSectionAssignmentViewSet',
]
