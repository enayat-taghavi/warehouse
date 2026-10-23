# -*- coding: utf-8 -*-
"""
ViewSets for personnel profiles and personnel change requests.
"""

import io
from platform_core.registry import has_permission_alias
import openpyxl
from decimal import Decimal
from rest_framework import viewsets, permissions, status, parsers, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from personnel.permissions import (
    CanApprovePersonnelManager,
    CanApprovePersonnelFinance,
)
from companies.access import (
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access,
)
from ..models import (
    PersonnelProfile,
    PersonnelChangeRequest,
    PersonnelSectionAssignment,
    PersonnelBankAccount,
    InsuranceJobTitle,
    PersonnelDocument,
    WorkflowAuditLog,
    ProjectSection,
    SectionAssignment,
)
from ..serializers import (
    PersonnelProfileSerializer,
    PersonnelChangeRequestSerializer,
    PersonnelBankAccountSerializer,
    PersonnelDocumentSerializer,
)
from ..permissions import (
    requires_company_scope,
)
from .scope_helpers import (
    broadcast_personnel_update,
    ensure_personnel_write_scope,
    is_personnel_global_auditor,
    resolve_import_company,
    scope_personnel_queryset,
)

class PersonnelProfileViewSet(viewsets.ModelViewSet):
    queryset = PersonnelProfile.objects.all().select_related('user').prefetch_related('bank_accounts', 'documents')
    serializer_class = PersonnelProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    pagination_class = None

    def _is_global_auditor(self, user):
        return is_personnel_global_auditor(user)

    def _scoped_base_queryset(self):
        """قلمرو امنیتی کاربر (بخش‌ها و شرکت‌های مجاز) بدون فیلترهای نمایشی مثل جستجو یا بخش انتخابی."""
        return scope_personnel_queryset(self.request, super().get_queryset())

    def get_queryset(self):
        qs = self._scoped_base_queryset()
        user = self.request.user
        is_global_auditor = self._is_global_auditor(user)

        warehouse_id = self.request.query_params.get('warehouse_id')
        if warehouse_id:
            qs = qs.filter(Q(assigned_warehouse_id=warehouse_id) | Q(assigned_warehouse_id__isnull=True))
        
        section_id = self.request.query_params.get('section_id')
        if section_id:
            if not is_global_auditor and user and user.is_authenticated:
                user_section_ids = list(
                    SectionAssignment.objects.filter(user=user, is_active=True).values_list('section_id', flat=True)
                )
                if str(section_id).isdigit() and int(section_id) not in user_section_ids:
                    return qs.none()
            qs = qs.filter(
                Q(section_id=section_id) |
                Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
            ).distinct()
        project_id = self.request.query_params.get('project_id')
        if project_id:
            qs = qs.filter(
                Q(section__project_id=project_id) |
                Q(section_assignments__project_id=project_id, section_assignments__is_active=True)
            ).distinct()
        
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ['true', '1'])
            
        approval_status = self.request.query_params.get('approval_status')
        if approval_status:
            if ',' in approval_status:
                status_list = [s.strip() for s in approval_status.split(',') if s.strip()]
                qs = qs.filter(approval_status__in=status_list)
            else:
                qs = qs.filter(approval_status=approval_status)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(national_code__icontains=search) |
                Q(job_title__icontains=search)
            )
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        section_id = data.get('section')
        if not data.get('company') and section_id:
            try:
                sec = ProjectSection.objects.filter(id=int(section_id)).select_related('project').first()
                if sec and sec.project and sec.project.company_id:
                    data['company'] = sec.project.company_id
            except (ValueError, TypeError):
                pass
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user
        is_mgr = user.is_superuser or user.has_perm('accounts.perm_approve_personnel_manager') or has_permission_alias(user, 'manager_approver')
        
        section = serializer.validated_data.get('section')
        # گارد انتساب بخش: کاربر عادی باید انتساب فعال به بخش انتخاب‌شده داشته باشد
        if not is_mgr and section and user and user.is_authenticated:
            is_assigned = SectionAssignment.objects.filter(user=user, section=section, is_active=True).exists()
            if not is_assigned:
                raise PermissionDenied("شما انتساب فعال در این بخش برای معرفی پرسنل جدید ندارید.")
        # شرکت، بخش و پروژهٔ پرونده باید در قلمرو شرکت‌های مجاز کاربر باشند (حتی برای مدیر؛ عبور هوشمند هم پس از این است)
        ensure_personnel_write_scope(
            user,
            company=serializer.validated_data.get('company'),
            section=section,
            project=serializer.validated_data.get('project'),
        )

        extra_kwargs = {'created_by': user}
        if section and hasattr(section, 'project') and section.project:
            if not serializer.validated_data.get('project'):
                extra_kwargs['project'] = section.project
            if not serializer.validated_data.get('company') and section.project.company_id:
                extra_kwargs['company_id'] = section.project.company_id

        # DEF-02: پرونده همیشه پیش‌نویس ساخته می‌شود و فقط اکشن submit آن را با گیت به سرپرست می‌فرستد.
        # تنها استثنا عبور هوشمند نقش‌های بالاتر است که آن هم با گیت انجام می‌شود (DEF-14).
        req_status = self.request.data.get('approval_status')
        extra_kwargs['approval_status'] = 'draft'
        instance = serializer.save(**extra_kwargs)
        if req_status != 'draft':
            from ..lifecycle_services import auto_pass_personnel
            auto_pass_personnel(instance, user, source='create')
        broadcast_personnel_update(instance, action_type='created', message=f'پرونده پرسنل «{instance.full_name}» ثبت شد.', sender_id=user.id if user else None)

    def _ensure_update_scope(self, instance, validated_data):
        """جابه‌جایی شرکت، بخش یا پروژهٔ پرونده فقط درون شرکت‌های مجاز کاربر (پرونده به شرکت بیگانه منتقل نمی‌شود)."""
        def _changed(field):
            return field in validated_data and getattr(validated_data[field], 'pk', None) != getattr(instance, f'{field}_id')

        if not any(_changed(f) for f in ('company', 'section', 'project')):
            return
        ensure_personnel_write_scope(
            self.request.user,
            company=validated_data.get('company', instance.company),
            section=validated_data.get('section', instance.section),
            project=validated_data['project'] if _changed('project') else None,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        user = request.user
        from ..lifecycle_services import (
            FINANCE_STAGE_PERMS,
            change_request_fields_allowed_for,
            compute_profile_diff,
            user_has_any_perm,
        )
        is_fin = user_has_any_perm(user, FINANCE_STAGE_PERMS)
        current_status = instance.approval_status
        audit_excluded = {'id', 'pk', 'created_at', 'created_by', 'updated_at'}

        # اجازه ویرایش مستقیم به حسابدار در pending_accountant (تسک ۳.۷)؛ هر فیلد تغییرکرده با diff لاگ می‌شود
        if current_status == 'pending_accountant':
            if not is_fin:
                return Response(
                    {'error': 'این پرونده در وضعیت «در انتظار حسابداری» قرار دارد و تنها حسابدار مجاز به ویرایش اطلاعات آن است.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self._ensure_update_scope(instance, serializer.validated_data)
            diff, old_diff = compute_profile_diff(instance, serializer.validated_data, excluded=audit_excluded)
            with transaction.atomic():
                updated_instance = serializer.save()
                # کش prefetch حساب‌ها و مدارک باطل می‌شود (همان کار UpdateModelMixin در DRF)
                updated_instance._prefetched_objects_cache = {}
                if diff:
                    WorkflowAuditLog.objects.create(
                        content_type='personnel',
                        object_id=updated_instance.id,
                        actor=user,
                        from_status='pending_accountant',
                        to_status='pending_accountant',
                        action='accountant_edit',
                        reason=request.data.get('note', '') or 'ویرایش اطلاعات پرسنلی و مالی توسط حسابدار',
                        metadata={'diff': diff, 'old_diff': old_diff, 'company_id': updated_instance.company_id}
                    )
            broadcast_personnel_update(updated_instance, action_type='updated', message=f'اطلاعات مالی پرسنل «{updated_instance.full_name}» توسط حسابدار به‌روزرسانی شد.', sender_id=user.id if user else None)
            return Response(self.get_serializer(updated_instance).data)

        # DEF-17: پروندهٔ در انتظار مدیر برای همه جز سوپریوزر قفل است؛ مدیر برای اصلاح به حسابدار عودت می‌دهد
        if current_status in ('pending_manager', 'accountant_approved') and not user.is_superuser:
            return Response(
                {'error': f'این پرونده در وضعیت «{instance.get_approval_status_display()}» قرار دارد و اطلاعات آن تا پایان گردش کار قابل تغییر مستقیم نیست. برای اصلاح، پرونده را به حسابدار عودت دهید.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # پروندهٔ ردشده بایگانی است و پیش از هر ویرایش باید با اکشن reopen بازگشایی شود (DEF-15)
        if current_status == 'rejected' and not user.is_superuser:
            return Response(
                {'error': 'این پرونده رد شده است. برای ویرایش و ارسال دوباره، ابتدا آن را بازگشایی کنید.', 'code': 'reopen_required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # DEF-17: پروندهٔ مصوب برای همه جز سوپریوزر فقط از مسیر درخواست تغییرات ویرایش می‌شود (تسک ۳.۴-الف).
        # DEF-16: ابتدا diff محاسبه می‌شود و فهرست سفید فقط روی کلیدهای واقعاً تغییرکرده اعمال می‌شود.
        if current_status in ('approved', 'manager_approved') and not user.is_superuser:
            # SoD: تلاش صریح نقش غیرمالی برای تغییر دستمزد پروندهٔ مصوب رد می‌شود (نه حذف بی‌صدا)
            if change_request_fields_allowed_for(user) is not None:
                from decimal import Decimal, InvalidOperation
                from ..lifecycle_services import WAGE_FIELDS

                def _same_amount(new, old):
                    try:
                        return Decimal(str(new or 0)) == Decimal(str(old or 0))
                    except (InvalidOperation, ValueError):
                        return False

                changed_wages = [
                    f for f in WAGE_FIELDS
                    if f in request.data and hasattr(instance, f) and not _same_amount(request.data.get(f), getattr(instance, f, None))
                ]
                if changed_wages:
                    raise PermissionDenied(f"تعیین دستمزد و حقوق منحصراً با حسابداری است و فیلد «{changed_wages[0]}» برای شما قفل است.")
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            diff, old_diff = compute_profile_diff(instance, serializer.validated_data)

            allowed_fields = change_request_fields_allowed_for(user)
            if allowed_fields is not None:
                locked = [k for k in diff if k not in allowed_fields]
                if locked:
                    raise PermissionDenied(f"کارکنان عادی صرفاً مجاز به پیشنهاد تغییر در مشخصات فردی، تماس و اطلاعات بانکی هستند و فیلد «{locked[0]}» قفل است.")

            if diff:
                with transaction.atomic():
                    cr = PersonnelChangeRequest.objects.create(
                        personnel=instance,
                        requested_by=user,
                        proposed_changes=diff,
                        previous_values=old_diff,
                        status='pending_supervisor'
                    )
                    instance.has_pending_changes = True
                    instance.save(update_fields=['has_pending_changes'])
                    WorkflowAuditLog.objects.create(
                        content_type='personnel',
                        object_id=instance.id,
                        actor=user,
                        from_status=instance.approval_status,
                        to_status=instance.approval_status,
                        action='change_request_created',
                        reason=request.data.get('note', '') or 'ثبت درخواست تغییرات پرسنل فعال',
                        metadata={'change_request_id': cr.id, 'diff': diff, 'company_id': instance.company_id}
                    )

                return Response({
                    'message': 'درخواست تغییرات با موفقیت ثبت شد و جهت بررسی در کارتابل سرپرست قرار گرفت. اطلاعات قبلی تا زمان تصویب نهایی مدیر معتبر باقی می‌ماند.',
                    'change_request_id': cr.id,
                    'data': self.get_serializer(instance).data
                }, status=status.HTTP_202_ACCEPTED)
            return Response(self.get_serializer(instance).data)

        # ویرایش رکوردهای پیش‌نویس، عودت‌داده‌شده یا در انتظار سرپرست؛ و ویرایش مستقیم سوپریوزر
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self._ensure_update_scope(instance, serializer.validated_data)

        extra_kwargs = {}
        section = serializer.validated_data.get('section', instance.section)
        if section and hasattr(section, 'project') and section.project:
            if not serializer.validated_data.get('project') and not instance.project_id:
                extra_kwargs['project'] = section.project

        # ویرایش مستقیم سوپریوزر روی پروندهٔ در جریان مدیر، مصوب یا ردشده بی‌ردپا نمی‌ماند
        superuser_diff = None
        if user.is_superuser and current_status not in ('draft', 'revision_required', 'pending_supervisor'):
            superuser_diff = compute_profile_diff(instance, serializer.validated_data, excluded=audit_excluded)

        with transaction.atomic():
            updated_instance = serializer.save(**extra_kwargs)
            updated_instance._prefetched_objects_cache = {}
            if superuser_diff and superuser_diff[0]:
                WorkflowAuditLog.objects.create(
                    content_type='personnel',
                    object_id=updated_instance.id,
                    actor=user,
                    from_status=current_status,
                    to_status=updated_instance.approval_status,
                    action='superuser_edit',
                    reason=request.data.get('note', '') or 'ویرایش مستقیم پرونده توسط مدیر سیستم',
                    metadata={'diff': superuser_diff[0], 'old_diff': superuser_diff[1], 'company_id': updated_instance.company_id}
                )
        broadcast_personnel_update(updated_instance, action_type='updated', message=f'پرونده پرسنل «{updated_instance.full_name}» به‌روزرسانی شد.', sender_id=user.id if user else None)
        return Response(self.get_serializer(updated_instance).data)

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """
        تسک ۲.۷: ارسال پرونده پیش‌نویس یا عودت‌داده‌شده به سرپرست با گیت اعتبارسنجی
        """
        personnel = self.get_object()
        user = request.user

        if personnel.approval_status not in ('draft', 'revision_required'):
            return Response({
                'error': f'امکان ارسال پرونده در وضعیت «{personnel.get_approval_status_display()}» وجود ندارد.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # گیت سروری فیلدهای الزامی مرحله کارمند (تسک ۲.۶)
        from ..lifecycle_services import get_missing_fields
        missing = get_missing_fields(personnel, stage='submit')
        if missing:
            labels = [m['label'] for m in missing]
            return Response({
                'error': 'لطفاً فیلدهای الزامی پرونده را پیش از ارسال تکمیل نمایید.',
                'missing_fields': missing,
                'detail': f"فیلدهای ناقص: {', '.join(labels)}"
            }, status=status.HTTP_400_BAD_REQUEST)

        from_status = personnel.approval_status
        to_status = 'pending_supervisor'

        with transaction.atomic():
            personnel.approval_status = to_status
            personnel.rejection_reason = None
            personnel.save(update_fields=['approval_status', 'rejection_reason', 'updated_at'])

            WorkflowAuditLog.objects.create(
                content_type='personnel',
                object_id=personnel.id,
                action='submit',
                from_status=from_status,
                to_status=to_status,
                actor=user,
                reason=request.data.get('note', '') or 'ارسال پرونده توسط ثبت‌کننده به کارتابل سرپرست'
            )

        from ..lifecycle_services import dispatch_workflow_notification
        dispatch_workflow_notification(personnel, stage='pending_supervisor', actor=user, note=request.data.get('note', ''))
        broadcast_personnel_update(personnel, action_type='updated', message=f'پرونده پرسنل «{personnel.full_name}» به کارتابل سرپرست ارسال شد.', sender_id=user.id if user else None)
        return Response(self.get_serializer(personnel).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='delete_impact')
    def delete_impact(self, request, pk=None):
        """
        تسک ۲.۵: استعلام اثرات حذف آبشاری و سوابق پرسنل منطبق بر قرارداد DeleteImpactMixin و smart-delete-modal
        """
        instance = self.get_object()
        from django.db.models.deletion import Collector
        from django.db import router
        from ..lifecycle_services import check_personnel_history

        using = router.db_for_write(instance.__class__, instance=instance)
        collector = Collector(using=using)
        try:
            collector.collect([instance])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        impact_summary = []
        for model, instances in collector.data.items():
            if model == instance.__class__:
                continue
            impact_summary.append({
                'model_name': str(model._meta.verbose_name or model.__name__),
                'count': len(instances)
            })
        impact_summary.sort(key=lambda x: x['count'], reverse=True)

        history = check_personnel_history(instance)
        user = request.user
        can_delete = bool(history['can_delete'] and self._user_may_delete(user, instance))

        return Response({
            'impact': impact_summary,
            'total_affected': sum(item['count'] for item in impact_summary),
            'history': history,
            'can_delete': can_delete,
            'has_history': history['has_history'],
            'reasons': history['reasons']
        }, status=status.HTTP_200_OK)

    @staticmethod
    def _user_may_delete(user, instance) -> bool:
        """
        ماتریس حذف تسک ۲.۴ (بدون احتساب سابقه):
        الف) ثبت‌کننده یا هم‌بخشِ غیرمدیر فقط پرونده‌های draft و revision_required را حذف می‌کند؛
        ب) دارندهٔ مجوز اختصاصی perm_delete_personnel_nomovement (تصمیم ۶.۸) هر پروندهٔ بدون سابقه را.
        """
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.has_perm('accounts.perm_delete_personnel_nomovement'):
            return True
        if instance.approval_status not in ('draft', 'revision_required'):
            return False
        return PersonnelProfileViewSet._is_creator_or_co_section(user, instance)

    @staticmethod
    def _is_creator_or_co_section(user, instance) -> bool:
        if instance.created_by_id == user.id:
            return True
        return bool(instance.section_id) and SectionAssignment.objects.filter(
            user=user, section_id=instance.section_id, is_active=True
        ).exists()

    def destroy(self, request, *args, **kwargs):
        """
        تسک ۲.۴: حذف پرسنل با ماتریس مجوز و مسدودسازی قطعی رکوردهای دارای سابقه:
        - اگر سابقه کارکرد، فیش، رویداد مالی، تغییرات یا انتساب داشته باشد، حذف فیزیکی مسدود است و قطع همکاری پیشنهاد می‌شود.
        - اگر فاقد سابقه باشد، ثبت‌کننده در draft/revision_required یا کاربر دارای مجوز اختصاصی perm_delete_personnel_nomovement مجاز به حذف فیزیکی است.
        - پیش از حذف، عکس کامل پرونده در WorkflowAuditLog ثبت می‌گردد.
        """
        instance = self.get_object()
        user = request.user
        from ..lifecycle_services import build_personnel_snapshot, check_personnel_history

        with transaction.atomic():
            # قفل ردیف پرونده و سنجش سابقه درون همان تراکنش: ثبت هم‌زمان کارکرد یا فیش (کلید خارجی به همین ردیف)
            # تا پایان تراکنش منتظر می‌ماند و سابقه‌ای با CASCADE پاک نمی‌شود (بازبینی از دست رفتن داده)
            instance = PersonnelProfile.objects.select_for_update().get(pk=instance.pk)
            history = check_personnel_history(instance)
            if history['has_history']:
                return Response({
                    'error': 'این پرسنل دارای سابقه کارکرد، فیش حقوقی یا اسناد مالی در سیستم است و حذف فیزیکی آن مجاز نمی‌باشد. لطفاً از طریق ثبت تاریخ پایان کار و غیرفعال‌سازی پرونده اقدام به قطع همکاری نمایید.',
                    'code': 'history_exists',
                    'suggested_action': 'end_collaboration',
                    'history_reasons': history['reasons']
                }, status=status.HTTP_400_BAD_REQUEST)

            if not self._user_may_delete(user, instance):
                if self._is_creator_or_co_section(user, instance):
                    # رفتار فعلی شاخهٔ الف ماتریس ۲.۴: ثبت‌کننده یا هم‌بخش فقط پیش‌نویس و عودت‌شده را حذف می‌کند
                    return Response(
                        {'error': 'فقط پرونده‌های در وضعیت پیش‌نویس یا عودت‌داده‌شده قابل حذف هستند.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                raise PermissionDenied("شما مجوز حذف این پرونده پرسنلی را ندارید. (نیازمند مجوز اختصاصی حذف پرسنل فاقد سابقه)")

            full_name = instance.full_name
            # DEF-11: عکس کامل پرونده، همهٔ حساب‌ها و فهرست مدارک پیش از حذف (حساب‌ها و مدارک با CASCADE پاک می‌شوند)
            snapshot = build_personnel_snapshot(instance)
            snapshot['deleted_by_user_id'] = user.id if user else None
            snapshot['deleted_by_username'] = user.username if user else None
            WorkflowAuditLog.objects.create(
                content_type='personnel',
                object_id=instance.id,
                action='delete',
                actor=user if (user and user.is_authenticated) else None,
                from_status=instance.approval_status,
                to_status='deleted',
                metadata={'snapshot': snapshot, 'company_id': instance.company_id, 'reason': request.data.get('reason', 'حذف فیزیکی پرونده فاقد سابقه')}
            )
            deleted_id = instance.id
            instance.delete()
            instance.id = deleted_id

        broadcast_personnel_update(instance, action_type='deleted', message=f'پرونده پرسنل «{full_name}» حذف شد.', sender_id=user.id if user else None)
        return Response({'message': f'پرسنل «{full_name}» با موفقیت از سامانه حذف گردید.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get', 'post', 'put', 'patch', 'delete'], url_path='bank-accounts')
    def bank_accounts(self, request, pk=None):
        """
        مدیریت حساب‌های بانکی تودرتوی پرسنل با رعایت تفکیک وظایف (SoD).
        DEF-10: صاحب حساب همیشه همین پرونده است (personnel فقط‌خواندنی)، و تغییر حساب با گارد وضعیت و نقش انجام می‌شود.
        """
        instance = self.get_object()

        if request.method == 'GET':
            accounts = instance.bank_accounts.all()
            serializer = PersonnelBankAccountSerializer(accounts, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        from ..lifecycle_services import check_bank_account_edit_allowed
        allowed, deny_msg = check_bank_account_edit_allowed(request.user, instance)
        if not allowed:
            return Response({'error': deny_msg}, status=status.HTTP_400_BAD_REQUEST)

        def _log_bank_change(op, account_id, diff=None):
            # تغییر حساب بیرون از پیش‌نویس (مثلاً ویرایش حسابدار) با diff در لاگ ممیزی ثبت می‌شود؛
            # حذف حساب در هر وضعیتی با عکس کامل حساب ثبت می‌شود تا قابل بازسازی بماند (بازبینی از دست رفتن داده)
            in_draft = instance.approval_status in ('draft', 'revision_required')
            if in_draft and op != 'delete':
                return
            WorkflowAuditLog.objects.create(
                content_type='personnel',
                object_id=instance.id,
                actor=request.user,
                from_status=instance.approval_status,
                to_status=instance.approval_status,
                action='bank_account_deleted' if in_draft else 'accountant_edit',
                reason=request.data.get('note', '') or 'تغییر حساب بانکی پرسنل',
                metadata={'bank_account': {'op': op, 'id': account_id, 'diff': diff or {}}, 'company_id': instance.company_id}
            )

        if request.method == 'POST':
            serializer = PersonnelBankAccountSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                acc = serializer.save(personnel=instance)
                _log_bank_change('create', acc.id, {k: str(v) for k, v in serializer.validated_data.items()})
            return Response(PersonnelBankAccountSerializer(acc).data, status=status.HTTP_201_CREATED)

        account_id = request.data.get('id') or request.query_params.get('account_id') or request.query_params.get('id')
        if not account_id:
            return Response({'error': 'شناسه حساب بانکی (id) الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        acc = instance.bank_accounts.filter(pk=account_id).first()
        if not acc:
            return Response({'error': 'حساب بانکی موردنظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)

        if request.method in ['PUT', 'PATCH']:
            serializer = PersonnelBankAccountSerializer(acc, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            diff = {
                k: {'old': str(getattr(acc, k)) if getattr(acc, k) is not None else None, 'new': str(v) if v is not None else None}
                for k, v in serializer.validated_data.items() if getattr(acc, k) != v
            }
            with transaction.atomic():
                updated_acc = serializer.save()
                if diff:
                    _log_bank_change('update', updated_acc.id, diff)
            return Response(PersonnelBankAccountSerializer(updated_acc).data, status=status.HTTP_200_OK)

        if request.method == 'DELETE':
            with transaction.atomic():
                from ..lifecycle_services import _snapshot_value
                account_snapshot = {
                    f.attname: _snapshot_value(getattr(acc, f.attname))
                    for f in acc._meta.concrete_fields
                }
                _log_bank_change('delete', acc.id, account_snapshot)
                acc.delete()
            return Response({'message': 'حساب بانکی با موفقیت حذف گردید.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='documents')
    def documents(self, request, pk=None):
        """
        مدیریت و بارگذاری مدارک چندگانه پرسنل (تسک ۶.۶ و ۱.۱۱)
        """
        personnel = self.get_object()

        if request.method == 'GET':
            docs = personnel.documents.all().order_by('-created_at')
            return Response(PersonnelDocumentSerializer(docs, many=True).data, status=status.HTTP_200_OK)

        elif request.method == 'POST':
            file_obj = request.FILES.get('file') or request.FILES.get('attachment')
            if not file_obj:
                return Response({'error': 'فایل مدرک الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
            doc_type = request.data.get('doc_type') or 'other'
            # DEF-27: سنجش سروری نوع مدرک، پسوند و حجم فایل (هم‌راستا با فرم: تصویر یا PDF تا ۱۰ مگابایت)
            if doc_type not in dict(PersonnelDocument.DOC_TYPE_CHOICES):
                return Response({'error': f'نوع مدرک «{doc_type}» نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
            from ..serializers import validate_uploaded_document
            try:
                validate_uploaded_document(
                    file_obj,
                    max_size_bytes=10 * 1024 * 1024,
                    allowed_exts=('.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'),
                )
            except serializers.ValidationError as e:
                return Response({'error': ' '.join(str(d) for d in e.detail)}, status=status.HTTP_400_BAD_REQUEST)
            doc = PersonnelDocument.objects.create(
                personnel=personnel,
                file=file_obj,
                doc_type=doc_type,
                uploaded_by=request.user if request.user.is_authenticated else None
            )
            return Response(PersonnelDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

        elif request.method == 'DELETE':
            doc_id = request.data.get('doc_id') or request.query_params.get('doc_id')
            if not doc_id or not str(doc_id).isdigit():
                return Response({'error': 'شناسه مدرک الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
            # حذف مدرک همان گارد وضعیت و نقش حساب‌های بانکی را دارد (پروندهٔ مصوب و در انتظار مدیر قفل است)
            from ..lifecycle_services import _snapshot_value, check_bank_account_edit_allowed
            allowed, deny_msg = check_bank_account_edit_allowed(request.user, personnel)
            if not allowed:
                return Response({'error': deny_msg.replace('حساب‌های بانکی', 'مدارک')}, status=status.HTTP_400_BAD_REQUEST)
            doc = personnel.documents.filter(id=int(doc_id)).select_related('uploaded_by').first()
            if not doc:
                return Response({'error': 'مدرک مورد نظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)
            with transaction.atomic():
                # ردیف حذف می‌شود ولی فایل روی دیسک می‌ماند؛ مسیر و مشخصات آن در لاگ ممیزی ثبت می‌شود تا قابل بازسازی باشد
                WorkflowAuditLog.objects.create(
                    content_type='personnel',
                    object_id=personnel.id,
                    actor=request.user,
                    from_status=personnel.approval_status,
                    to_status=personnel.approval_status,
                    action='document_deleted',
                    reason=request.data.get('note', '') if hasattr(request.data, 'get') else '',
                    metadata={
                        'document': {
                            'id': doc.id,
                            'doc_type': doc.doc_type,
                            'file': doc.file.name if doc.file else None,
                            'uploaded_by_id': doc.uploaded_by_id,
                            'uploaded_by_username': doc.uploaded_by.username if doc.uploaded_by else None,
                            'created_at': _snapshot_value(doc.created_at),
                        },
                        'company_id': personnel.company_id,
                    }
                )
                doc.delete()
            return Response({'message': 'مدرک با موفقیت حذف گردید.'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='job-titles')
    def job_titles(self, request):
        """
        ارائه لیست تجمیعی سمت‌های شغلی استاندارد، کدهای ۶ رقمی بیمه و عناوین استفاده‌شده در سامانه
        """
        q = (request.query_params.get('search') or request.query_params.get('q') or '').strip()
        from ..lifecycle_services import normalize_job_title as _normalize_title
        q_normalized = _normalize_title(q)

        # استخراج کدهای ۶ رقمی و سمت‌ها از مدل پایگاه داده InsuranceJobTitle
        insurance_qs = InsuranceJobTitle.objects.filter(is_active=True)
        if q:
            insurance_qs = insurance_qs.filter(Q(title__icontains=q) | Q(title__icontains=q_normalized) | Q(job_code__icontains=q))

        title_to_codes = {}
        for item in insurance_qs:
            title_clean = _normalize_title(item.title)
            code_clean = (item.job_code or '').strip()
            if title_clean:
                if code_clean:
                    title_to_codes.setdefault(title_clean, []).append(code_clean)
                else:
                    title_to_codes.setdefault(title_clean, [])

        standard_titles = [
            'کارگر ساده انبار',
            'اپراتور لیفتراک',
            'کمک انباردار',
            'راننده خودرو سبک/سنگین',
            'مسئول انبار',
            'کارشناس اداری و مالی',
            'نگهبان و انتظامات',
            'کارگر فنی و تاسیسات',
            'استادکار تعمیرات و نگهداری',
            'سایر'
        ]
        db_titles = list(
            PersonnelProfile.objects.exclude(job_title__isnull=True)
            .exclude(job_title='')
            .values_list('job_title', flat=True)
            .distinct()
        )

        # DEF-22: تطبیق و حذف تکرار با کلید یکدست («ي/ك» عربی، فاصله و نیم‌فاصله نادیده)؛ عنوان جدول سمت‌ها مقدم است
        from ..lifecycle_services import job_title_match_key, normalize_job_title
        q_key = job_title_match_key(q)
        all_candidate_titles = list(title_to_codes.keys()) + standard_titles + db_titles
        merged = []
        seen_keys = set()
        for t in all_candidate_titles:
            clean = normalize_job_title(t)
            key = job_title_match_key(clean)
            if clean and key not in seen_keys:
                t_codes = title_to_codes.get(clean, [])
                match_code = any(q.lower() in str(c).lower() for c in t_codes)
                if not q or (q_key and q_key in key) or match_code:
                    merged.append(clean)
                    seen_keys.add(key)

        items = []
        for t in merged:
            items.append({
                'title': t,
                'job_codes': title_to_codes.get(t, [])
            })

        return Response({
            'job_titles': merged,
            'items': items
        })

    @action(detail=False, methods=['get'], url_path='lookup-by-national-code')
    def lookup_by_national_code(self, request):
        """
        استعلام پرونده پرسنل بر اساس کد ملی با اعتبارسنجی رقم کنترلی، ایزولاسیون شرکتی و پشتیبانی از بازگشایی پرونده‌های ردشده
        """
        raw_code = request.query_params.get('national_code', '').strip()
        if not raw_code:
            return Response({'error': 'کد ملی ارسال نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        
        from common.validators import validate_iranian_national_code
        try:
            clean_code = validate_iranian_national_code(raw_code)
        except ValueError as e:
            return Response({'error': str(e), 'code': 'invalid_national_code'}, status=status.HTTP_400_BAD_REQUEST)
        
        user = request.user
        cid = validate_user_company_access(user, get_request_company_id(request))
        
        qs = PersonnelProfile.objects.all().select_related('section', 'section__project', 'company')
        if cid:
            qs = qs.filter(Q(company_id=cid) | Q(section__project__company_id=cid))
        elif not user.is_superuser:
            # DEF-15: بدون سربرگ X-Company-ID، جستجو به شرکت‌های مجاز کاربر محدود می‌شود (همان قاعدهٔ قلمرو سراسری)
            allowed_cids = list(get_user_allowed_companies(user).values_list('id', flat=True))
            if allowed_cids:
                qs = qs.filter(Q(company_id__in=allowed_cids) | Q(section__project__company_id__in=allowed_cids))
            else:
                qs = qs.none()
        
        personnel = qs.filter(national_code=clean_code).first()
        if not personnel:
            # وجود کد ملی در شرکت‌های بیرون از قلمرو کاربر افشا نمی‌شود (یکتایی کد ملی درون هر شرکت است)
            return Response({'found': False}, status=status.HTTP_200_OK)
        
        attachment_url = None
        if personnel.attachment:
            try:
                attachment_url = request.build_absolute_uri(personnel.attachment.url)
            except Exception:
                attachment_url = personnel.attachment.url
        
        is_reopenable = (personnel.approval_status == 'rejected')
        from ..lifecycle_services import user_can_view_wages
        can_view_wages = user_can_view_wages(user)

        payload = {
            'found': True,
            'is_reopenable': is_reopenable,
            'personnel': {
                'id': personnel.id,
                'first_name': personnel.first_name,
                'last_name': personnel.last_name,
                'national_code': personnel.national_code,
                'father_name': personnel.father_name or '',
                'gender': personnel.gender or 'مرد',
                'id_number': personnel.id_number or '',
                'id_series': personnel.id_series or '',
                'id_serial': personnel.id_serial or '',
                'birth_date': personnel.birth_date or '',
                'birth_place': personnel.birth_place or '',
                'issue_place': personnel.issue_place or '',
                'marital_status': personnel.marital_status or 'single',
                'children_count': personnel.children_count or 0,
                'phone_number': personnel.phone_number or '',
                'address': personnel.address or '',
                'postal_code': personnel.postal_code or '',
                'valid_until_date': personnel.valid_until_date or '',
                'recommender': personnel.recommender or '',
                'job_title': personnel.job_title or '',
                'daily_base_wage': float(personnel.daily_base_wage or 0),
                'bank_name': personnel.bank_name or '',
                'account_number': personnel.account_number or '',
                'sheba_number': personnel.sheba_number or '',
                'card_number': personnel.card_number or '',
                'notes': personnel.notes or '',
                'approval_status': personnel.approval_status,
                'rejection_reason': personnel.rejection_reason or '',
                'current_section_id': personnel.section_id,
                'current_section_name': personnel.section.name if personnel.section else None,
                'current_project_name': personnel.section.project.name if (personnel.section and personnel.section.project) else None,
                'attachment_url': attachment_url,
            }
        }
        if not can_view_wages:
            # DEF-21: دستمزد برای نقش غیرمالی برگردانده نمی‌شود
            payload['personnel'].pop('daily_base_wage', None)
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='cost-estimate')
    def cost_estimate(self, request):
        """
        DEF-05: برآورد سروری هزینهٔ ماهانهٔ یک پرسنل با همان موتور حقوق، برای ماشین‌حساب حسابدار و ویجت مدیر.
        بدنه: {personnel_id, year_month?, overrides?}. overrides مقادیر فرم ذخیره‌نشده است و چیزی ذخیره نمی‌شود.
        """
        from ..lifecycle_services import estimate_monthly_personnel_cost, user_can_view_wages
        if not user_can_view_wages(request.user):
            raise PermissionDenied("برآورد هزینه و دستمزد فقط برای نقش‌های مالی قابل مشاهده است.")
        personnel_id = request.data.get('personnel_id')
        try:
            personnel = self._scoped_base_queryset().get(pk=int(personnel_id))
        except (TypeError, ValueError, PersonnelProfile.DoesNotExist):
            return Response({'error': 'پرونده پرسنلی یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)
        overrides = request.data.get('overrides') or {}
        if not isinstance(overrides, dict):
            return Response({'error': 'overrides باید شیء باشد.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            estimate = estimate_monthly_personnel_cost(personnel, request.data.get('year_month'), overrides=overrides)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(estimate, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='company-cost-summary')
    def company_cost_summary(self, request):
        """
        DEF-04: میانگین و جمع هزینهٔ ماهانهٔ پرسنل مصوب و فعال در قلمرو کاربر (شرکت فعال)، با همان سرویس برآورد.
        فیلترهای نمایشی (جستجو، بخش) اثر ندارند و فقط عدد تجمیعی برمی‌گردد.
        """
        from ..lifecycle_services import estimate_monthly_personnel_cost, user_can_view_wages
        if not user_can_view_wages(request.user):
            raise PermissionDenied("خلاصهٔ هزینهٔ شرکت فقط برای نقش‌های مالی قابل مشاهده است.")
        year_month = request.query_params.get('year_month')
        personnel_qs = self._scoped_base_queryset().filter(approval_status='approved', is_active=True).distinct()
        cache = {}
        count = 0
        total_cost = 0
        total_gross = 0
        try:
            for p in personnel_qs:
                est = estimate_monthly_personnel_cost(p, year_month, cache=cache)
                count += 1
                total_cost += est['employer_monthly_cost']
                total_gross += est['gross_salary']
                year_month = est['year_month']
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        from ..lifecycle_services import current_shamsi_year_month
        return Response({
            'year_month': year_month or current_shamsi_year_month(),
            'personnel_count': count,
            'total_employer_monthly_cost': total_cost,
            'average_employer_monthly_cost': round(total_cost / count) if count else 0,
            'average_gross_salary': round(total_gross / count) if count else 0,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='missing-primary-sheba-report')
    def missing_primary_sheba_report(self, request):
        """
        DEF-23 (گام ۱-ب اصلاحیه): دانلود فایل اکسل گزارش حساب‌های اصلی فاقد شبای معتبر.
        محدود به قلمرو مجاز کاربر (_scoped_base_queryset) و نیازمند دسترسی مالی (user_can_view_wages).
        """
        from django.http import HttpResponse
        from ..lifecycle_services import user_can_view_wages, generate_missing_primary_sheba_excel

        if not user_can_view_wages(request.user):
            raise PermissionDenied("مشاهده و دانلود گزارش اطلاعات بانکی و شبا منحصر به نقش مالی و حسابداری است.")

        scoped_qs = self._scoped_base_queryset()
        excel_bytes = generate_missing_primary_sheba_excel(queryset=scoped_qs)

        filename = "Missing_Primary_Sheba_Report.xlsx"
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen(self, request, pk=None):
        """
        DEF-15: بازگشایی پروندهٔ ردشده (rejected ← draft) به‌جای ساخت رکورد تکراری که قید یکتایی
        company + national_code آن را رد می‌کند. فقط در شرکت‌های مجاز کاربر و با ثبت لاگ.
        """
        instance = self.get_object()
        user = request.user
        if instance.approval_status != 'rejected':
            return Response({'error': f'فقط پرونده‌های ردشده قابل بازگشایی هستند (وضعیت فعلی: «{instance.get_approval_status_display()}»).'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.is_superuser:
            company_id = instance.company_id or (instance.section.project.company_id if instance.section_id and instance.section and instance.section.project else None)
            allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
            if company_id is None or company_id not in allowed_ids:
                raise PermissionDenied("بازگشایی فقط برای پرونده‌های شرکت‌های مجاز شما ممکن است.")
            is_in_section = bool(instance.section_id) and SectionAssignment.objects.filter(user=user, section_id=instance.section_id, is_active=True).exists()
            from ..lifecycle_services import APPROVAL_STAGES, user_has_any_perm
            is_approver = any(user_has_any_perm(user, rule['perms']) for rule in APPROVAL_STAGES.values())
            if not (instance.created_by_id == user.id or is_in_section or is_approver):
                raise PermissionDenied("شما مجاز به بازگشایی این پرونده نیستید.")

        note = (request.data.get('note') or request.data.get('reason') or '').strip()
        with transaction.atomic():
            locked = PersonnelProfile.objects.select_for_update().get(pk=instance.pk)
            if locked.approval_status != 'rejected':
                return Response({'error': 'وضعیت پرونده هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.'}, status=status.HTTP_409_CONFLICT)
            locked.approval_status = 'draft'
            locked.save(update_fields=['approval_status', 'updated_at'])
            WorkflowAuditLog.objects.create(
                content_type='personnel',
                object_id=locked.id,
                actor=user,
                from_status='rejected',
                to_status='draft',
                action='reopen',
                reason=note or 'بازگشایی پرونده ردشده جهت اصلاح و ارسال دوباره',
                metadata={'company_id': locked.company_id, 'previous_rejection_reason': locked.rejection_reason}
            )
        broadcast_personnel_update(locked, action_type='updated', message=f'پرونده ردشدهٔ «{locked.full_name}» بازگشایی شد.', sender_id=user.id)
        return Response({
            'message': f'پرونده «{locked.full_name}» بازگشایی شد و در وضعیت پیش‌نویس قرار گرفت.',
            'data': self.get_serializer(locked).data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='end-collaboration')
    def end_collaboration(self, request, pk=None):
        """
        DEF-18: قطع همکاری پرسنل دارای سابقه (جایگزین حذف فیزیکی). تاریخ پایان شمسی و دلیل الزامی‌اند؛
        پرونده غیرفعال می‌شود و end_date ثبت می‌شود، همراه با لاگ ممیزی و اعلان. فقط با مجوز مدیر.
        """
        from ..lifecycle_services import MANAGER_STAGE_PERMS, dispatch_workflow_notification, normalize_shamsi_date, user_has_any_perm
        user = request.user
        if not user_has_any_perm(user, MANAGER_STAGE_PERMS):
            raise PermissionDenied("ثبت قطع همکاری فقط با دسترسی مدیر ممکن است.")

        instance = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'ثبت دلیل قطع همکاری الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            end_date = normalize_shamsi_date(request.data.get('end_date'))
        except ValueError as e:
            return Response({'error': str(e), 'field': 'end_date'}, status=status.HTTP_400_BAD_REQUEST)
        if not end_date:
            return Response({'error': 'تاریخ پایان همکاری (شمسی) الزامی است.', 'field': 'end_date'}, status=status.HTTP_400_BAD_REQUEST)
        if instance.approval_status not in ('approved', 'manager_approved'):
            return Response({'error': f'قطع همکاری فقط برای پرسنل مصوب و فعال ممکن است (وضعیت فعلی: «{instance.get_approval_status_display()}»).'}, status=status.HTTP_400_BAD_REQUEST)
        if not instance.is_active:
            return Response({'error': 'همکاری این پرسنل پیش‌تر پایان یافته و پرونده غیرفعال است.'}, status=status.HTTP_400_BAD_REQUEST)
        if instance.start_date:
            from ..lifecycle_services import parse_shamsi_date
            start = parse_shamsi_date(instance.start_date)
            if start is not None and parse_shamsi_date(end_date) < start:
                return Response({'error': f'تاریخ پایان همکاری نمی‌تواند پیش از تاریخ شروع به کار ({instance.start_date}) باشد.', 'field': 'end_date'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            locked = PersonnelProfile.objects.select_for_update().get(pk=instance.pk)
            previous_end_date = locked.end_date
            locked.end_date = end_date
            locked.is_active = False
            locked.save(update_fields=['end_date', 'is_active', 'updated_at'])
            WorkflowAuditLog.objects.create(
                content_type='personnel',
                object_id=locked.id,
                actor=user,
                from_status=locked.approval_status,
                to_status=locked.approval_status,
                action='end_collaboration',
                reason=reason,
                metadata={'end_date': end_date, 'previous_end_date': previous_end_date, 'company_id': locked.company_id}
            )
            dispatch_workflow_notification(locked, stage='end_collaboration', actor=user, reason=reason)
        broadcast_personnel_update(locked, action_type='updated', message=f'همکاری پرسنل «{locked.full_name}» از تاریخ {end_date} پایان یافت.', sender_id=user.id)
        return Response({
            'message': f'همکاری پرسنل «{locked.full_name}» از تاریخ {end_date} پایان یافت و پرونده غیرفعال شد.',
            'data': self.get_serializer(locked).data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='assign-section')
    def assign_section(self, request, pk=None):
        """
        انتساب پرسنل موجود به یک بخش دیگر جهت فعالیت همزمان در چند بخش
        """
        personnel = self.get_object()
        section_id = request.data.get('section_id') or request.data.get('section')
        if not section_id:
            return Response({'error': 'شناسه بخش ارسالی الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            section_id = int(section_id)
        except (ValueError, TypeError):
            return Response({'error': 'شناسه بخش نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        sec = ProjectSection.objects.filter(id=section_id).select_related('project').first()
        if not sec:
            return Response({'error': 'بخش مورد نظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)
        # بخش مقصد باید در قلمرو شرکت‌های مجاز کاربر و در همان شرکتِ پرونده باشد
        personnel_company_id = personnel.company_id or (
            personnel.section.project.company_id if personnel.section_id else None
        )
        ensure_personnel_write_scope(request.user, company=personnel_company_id, section=sec)

        job_title = (request.data.get('job_title') or personnel.job_title or '').strip()
        from ..lifecycle_services import user_can_view_wages
        # DEF-21: دستمزد انتساب را فقط نقش مالی تعیین می‌کند؛ مقدار ارسالی نقش غیرمالی نادیده گرفته می‌شود
        requested_wage = request.data.get('daily_base_wage') if user_can_view_wages(request.user) else None
        daily_base_wage = requested_wage or personnel.daily_base_wage or 0
        
        assignment, created = PersonnelSectionAssignment.objects.update_or_create(
            personnel=personnel,
            section=sec,
            defaults={
                'project': sec.project,
                'job_title': job_title,
                'daily_base_wage': daily_base_wage,
                'is_active': True
            }
        )
        
        broadcast_personnel_update(personnel, action_type='assigned', message=f'پرسنل «{personnel.full_name}» به بخش «{sec.name}» منتسب شد.', sender_id=request.user.id if request.user else None)
        
        return Response({
            'message': f'پرسنل «{personnel.full_name}» با موفقیت به بخش «{sec.name}» منتسب شد.',
            'assignment_id': assignment.id,
            'personnel': self.get_serializer(personnel).data
        }, status=status.HTTP_200_OK)

    # پیام‌های موفقیت و رویداد وب‌سوکت هر مرحلهٔ تأیید (منطق گذار در lifecycle_services.approve_personnel_stage است)
    APPROVAL_STAGE_MESSAGES = {
        'supervisor': (
            'pending_accountant',
            'پرونده پرسنل «{name}» به تایید سرپرست رسید و به حسابداری ارسال شد.',
            'تایید سرپرست با موفقیت ثبت شد و پرونده به حسابداری ارسال گردید.',
        ),
        'finance': (
            'pending_manager',
            'پرونده پرسنل «{name}» به تایید مالی رسید و به کارتابل مدیر ارسال شد.',
            'تایید مالی با موفقیت ثبت شد و پرونده جهت تصویب نهایی به کارتابل مدیر ارسال گردید.',
        ),
        'manager': (
            'approved',
            'پرونده پرسنل «{name}» به تصویب نهایی مدیر رسید و فعال گردید.',
            'تصویب نهایی مدیر با موفقیت ثبت شد و پرسنل فعال گردید.',
        ),
    }

    def _approve_single(self, request, stage):
        from ..lifecycle_services import APPROVAL_STAGES, PersonnelWorkflowError, approve_personnel_stage, user_has_any_perm
        user = request.user
        if not user_has_any_perm(user, APPROVAL_STAGES[stage]['perms']):
            raise PermissionDenied(APPROVAL_STAGES[stage]['perm_error'])
        instance = self.get_object()
        note = (request.data.get('note') or request.data.get('approval_note') or '').strip()
        try:
            instance = approve_personnel_stage(instance.pk, user, stage, note=note)
        except PersonnelWorkflowError as e:
            return Response(e.to_response_data(), status=e.status_code)
        action_type, broadcast_msg, response_msg = self.APPROVAL_STAGE_MESSAGES[stage]
        broadcast_personnel_update(instance, action_type=action_type, message=broadcast_msg.format(name=instance.full_name), sender_id=user.id)
        return Response({
            'message': response_msg,
            'data': self.get_serializer(instance).data
        })

    @action(detail=True, methods=['post'], url_path='approve-supervisor')
    def approve_supervisor(self, request, pk=None):
        return self._approve_single(request, 'supervisor')

    @action(detail=True, methods=['post'], url_path='approve-finance')
    def approve_finance(self, request, pk=None):
        return self._approve_single(request, 'finance')

    @action(detail=True, methods=['post'], url_path='approve-manager')
    def approve_manager(self, request, pk=None):
        return self._approve_single(request, 'manager')

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        user = request.user
        can_mgr = (
            user.is_superuser
            or user.has_perm('accounts.perm_approve_personnel_manager')
            or has_permission_alias(user, 'manager_approver')
            or user.has_perm('accounts.perm_approve_personnel_supervisor')
            or user.has_perm('accounts.can_act_as_workshop_supervisor')
        )
        can_fin = user.is_superuser or user.has_perm('accounts.perm_approve_personnel_finance')
        if not (can_mgr or can_fin):
            raise PermissionDenied("شما دسترسی لازم برای رد این پرونده را ندارید.")
        
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'ثبت دلیل رد الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        
        instance = self.get_object()
        if instance.approval_status in ('approved', 'manager_approved'):
            return Response({'error': 'امکان رد پرونده تصویب‌شده وجود ندارد. در صورت نیاز، تغییرات باید از مسیر درخواست تغییرات یا قطع همکاری پیگیری شود.'}, status=status.HTTP_400_BAD_REQUEST)
        # تسک ۳.۱ و جدول §۳.۱-الف: رد فقط روی پرونده‌های در جریان؛ پیش‌نویسِ ارسال‌نشده و پروندهٔ ردشده از این مسیر رد نمی‌شوند
        in_progress_statuses = ('pending_supervisor', 'pending_accountant', 'pending_manager', 'revision_required', 'supervisor_approved', 'accountant_approved')
        if instance.approval_status not in in_progress_statuses:
            return Response({'error': f'امکان رد پرونده در وضعیت «{instance.get_approval_status_display()}» وجود ندارد؛ رد قطعی فقط برای پرونده‌های در جریان تایید است.'}, status=status.HTTP_400_BAD_REQUEST)

        from ..lifecycle_services import build_personnel_snapshot, check_personnel_history, dispatch_workflow_notification
        purge_statuses = ('revision_required', 'pending_supervisor', 'pending_accountant', 'pending_manager')
        with transaction.atomic():
            # قفل ردیف پرونده و سنجش دوبارهٔ وضعیت و سابقه درون همان تراکنش: ثبت هم‌زمان کارکرد یا فیش
            # (کلید خارجی به همین ردیف) تا پایان تراکنش منتظر می‌ماند و سابقه‌ای با CASCADE پاک نمی‌شود
            instance = PersonnelProfile.objects.select_for_update().get(pk=instance.pk)
            if instance.approval_status not in in_progress_statuses:
                return Response({'error': f'امکان رد پرونده در وضعیت «{instance.get_approval_status_display()}» وجود ندارد.'}, status=status.HTTP_400_BAD_REQUEST)
            history = check_personnel_history(instance)
            was_never_approved = not instance.manager_approved_at
            full_name = instance.full_name

            # شرط Purge (تسک ۳.۱ و بخش ۳.۱-ب): حذف فیزیکی فقط برای پرونده‌های بدون سابقه که هرگز تایید نهایی نشده‌اند
            purged = was_never_approved and not history['has_history'] and instance.approval_status in purge_statuses
            if purged:
                # DEF-11: عکس کامل پرونده، همهٔ حساب‌ها و فهرست مدارک پیش از حذف فیزیکی (شرط ۳ بخش ۳.۱-ب)
                snapshot = build_personnel_snapshot(instance)
                snapshot['reason'] = reason
                snapshot['purged_by'] = user.username
                WorkflowAuditLog.objects.create(
                    content_type='personnel',
                    object_id=instance.id,
                    actor=user,
                    from_status=instance.approval_status,
                    to_status='purged',
                    action='purge',
                    reason=reason,
                    metadata={'snapshot': snapshot, 'purged': True, 'company_id': instance.company_id}
                )
                dispatch_workflow_notification(instance, stage='purged', actor=user, reason=reason)
                deleted_id = instance.id
                instance.delete()
                instance.id = deleted_id
            else:
                old_status = instance.approval_status
                instance.approval_status = 'rejected'
                instance.rejection_reason = reason
                instance.save()

                WorkflowAuditLog.objects.create(
                    content_type='personnel',
                    object_id=instance.id,
                    actor=user,
                    from_status=old_status,
                    to_status='rejected',
                    action='reject',
                    reason=reason,
                    metadata={'actor_role': 'rejecter', 'company_id': instance.company_id}
                )
                dispatch_workflow_notification(instance, stage='rejected', actor=user, reason=reason)

        if purged:
            broadcast_personnel_update(instance, action_type='deleted', message=f'پرونده «{full_name}» به دلیل رد قطعی و عدم وجود سابقه پاک‌سازی (Purge) شد.', sender_id=user.id)
            return Response({'message': f'پرونده پیش‌نویس «{full_name}» به دلیل عدم وجود هرگونه سابقه پاک‌سازی شد.', 'purged': True}, status=status.HTTP_200_OK)
        broadcast_personnel_update(instance, action_type='rejected', message=f'پرونده پرسنل «{instance.full_name}» رد شد: {reason}', sender_id=user.id)
        return Response({'message': 'پرونده پرسنل رد شد.', 'purged': False, 'data': self.get_serializer(instance).data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='request-revision')
    def request_revision(self, request, pk=None):
        from ..lifecycle_services import (
            FINANCE_STAGE_PERMS,
            MANAGER_STAGE_PERMS,
            SUPERVISOR_STAGE_PERMS,
            dispatch_workflow_notification,
            user_has_any_perm,
        )
        user = request.user
        is_sup = user_has_any_perm(user, SUPERVISOR_STAGE_PERMS)
        is_fin = user_has_any_perm(user, FINANCE_STAGE_PERMS)
        is_mgr = user_has_any_perm(user, MANAGER_STAGE_PERMS)
        if not (is_mgr or is_fin or is_sup):
            raise PermissionDenied("شما دسترسی لازم برای ارجاع به بازنگری را ندارید.")

        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'ثبت توضیحات جهت بازنگری الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        instance = self.get_object()
        old_status = instance.approval_status
        if old_status in ('approved', 'manager_approved'):
            return Response({'error': 'امکان عودت پرونده تصویب‌شده وجود ندارد. پرونده‌های مصوب در چرخه ثبت کارکرد هستند و تغییرات آن‌ها صرفاً از مسیر درخواست تغییرات مجاز است.'}, status=status.HTTP_400_BAD_REQUEST)

        # DEF-13: جدول گذار بخش ۳.۱-الف طرح. مقصد بر اساس وضعیت فعلی پرونده تعیین می‌شود، نه بالاترین نقش کاربر.
        if old_status == 'pending_supervisor':
            if not is_sup:
                raise PermissionDenied("عودت پرونده در انتظار سرپرست فقط با دسترسی سرپرست ممکن است.")
            target_status = 'revision_required'
        elif old_status == 'pending_accountant':
            if not is_fin:
                raise PermissionDenied("عودت پرونده در انتظار حسابداری فقط با دسترسی حسابدار ممکن است.")
            req_dest = request.data.get('target_status') or request.data.get('destination')
            target_status = req_dest if req_dest in ('pending_supervisor', 'revision_required') else 'revision_required'
        elif old_status == 'pending_manager':
            if not is_mgr:
                raise PermissionDenied("عودت پرونده در انتظار مدیر فقط با دسترسی مدیر ممکن است.")
            target_status = 'pending_accountant'
        else:
            return Response({'error': f'امکان عودت پرونده در وضعیت «{instance.get_approval_status_display()}» وجود ندارد. عودت فقط از مراحل در انتظار سرپرست، حسابدار یا مدیر ممکن است.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            instance.approval_status = target_status
            instance.rejection_reason = reason
            instance.revision_requested_by = user
            instance.revision_requested_at = timezone.now()
            instance.save()

            WorkflowAuditLog.objects.create(
                content_type='personnel',
                object_id=instance.id,
                actor=user,
                from_status=old_status,
                to_status=target_status,
                action='request_revision',
                reason=reason,
                metadata={'destination': target_status, 'company_id': instance.company_id}
            )
            # DEF-12: گیرندهٔ اعلان عودت همان مقصد است (کارمند، سرپرست یا حسابدار)
            dispatch_workflow_notification(instance, stage=target_status, actor=user, reason=reason, is_return=True)
        dest_title = 'کارمند' if target_status == 'revision_required' else ('سرپرست' if target_status == 'pending_supervisor' else 'حسابدار')
        broadcast_personnel_update(instance, action_type='revision_required', message=f'پرونده پرسنل «{instance.full_name}» به {dest_title} عودت داده شد: {reason}', sender_id=user.id)
        return Response({
            'message': f'پرونده جهت بازنگری به {dest_title} عودت داده شد.',
            'data': self.get_serializer(instance).data
        })

    @action(detail=False, methods=['post'], url_path='batch-approve')
    def batch_approve(self, request):
        """
        تسک ۳.۵: اکشن تایید گروهی پرونده‌های پرسنلی با پردازش مستقل هر رکورد در تراکنش جداگانه
        """
        ids = request.data.get('ids', [])
        if not ids or not isinstance(ids, list):
            return Response({'error': 'لیست شناسه‌های پرسنل (ids) الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)

        stage = request.data.get('stage')  # 'supervisor', 'finance', 'manager'
        note = (request.data.get('note') or '').strip()
        user = request.user

        from ..lifecycle_services import APPROVAL_STAGES, PersonnelWorkflowError, approve_personnel_stage

        if stage not in APPROVAL_STAGES:
            return Response({'error': 'مرحله ارسالی نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)

        # DEF-09: فقط پرونده‌های داخل قلمرو کاربر (همان get_queryset تکی) قابل تأیید گروهی‌اند
        clean_ids = []
        for pid in ids:
            try:
                clean_ids.append(int(pid))
            except (TypeError, ValueError):
                clean_ids.append(None)
        scoped_names = {
            row[0]: f"{row[1]} {row[2]}"
            for row in self.get_queryset().filter(id__in=[i for i in clean_ids if i is not None]).values_list('id', 'first_name', 'last_name')
        }

        action_type, broadcast_msg, _ = self.APPROVAL_STAGE_MESSAGES[stage]
        results = []
        for raw_pid, pid in zip(ids, clean_ids):
            if pid is None or pid not in scoped_names:
                results.append({'id': raw_pid, 'success': False, 'error': 'پرونده پرسنلی یافت نشد.'})
                continue
            try:
                p = approve_personnel_stage(pid, user, stage, note=note, batch=True)
            except PersonnelWorkflowError as e:
                row = {'id': pid, 'full_name': scoped_names[pid], 'success': False, 'error': e.message}
                if e.missing_fields:
                    row['missing_fields'] = e.missing_fields
                results.append(row)
                continue
            except Exception as e:
                import logging
                logging.getLogger(__name__).exception('[batch-approve] personnel %s failed', pid)
                results.append({'id': pid, 'full_name': scoped_names[pid], 'success': False, 'error': str(e)})
                continue
            broadcast_personnel_update(p, action_type=action_type, message=broadcast_msg.format(name=p.full_name), sender_id=user.id)
            results.append({'id': pid, 'full_name': p.full_name, 'success': True})

        successful_count = sum(1 for r in results if r.get('success'))
        return Response({
            'total': len(ids),
            'successful_count': successful_count,
            'failed_count': len(ids) - successful_count,
            'results': results
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        """
        دانلود قالب اکسل خام پرسنل با ساختار ۴۶ ستونی منطبق بر شیت Emp_info و استاندارد ۲ سطری شرکت
        """
        import io
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from django.http import HttpResponse

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Emp_info'
        ws.sheet_view.rightToLeft = True

        columns_spec = [
            ('status_category', 'وضعیت', 'نفرات شرکتی'),
            ('row_num', 'ردیف', 1),
            ('nationality_code', 'ملیت', '1'),
            ('national_code', 'کد ملی', '0010376488'),
            ('first_name', 'نام', 'علی'),
            ('last_name', 'نام خانوادگی', 'محمدی'),
            ('father_name', 'نام پدر', 'رضا'),
            ('birth_date', 'تاریخ تولد', '1370/01/01'),
            ('id_number', 'شماره شناسنامه', '1234'),
            ('birth_place', 'محل تولد', 'تهران'),
            ('education_level', 'مدرک تحصیلی', '4'),
            ('insurance_type', 'نوع بیمه', '2'),
            ('insurance_number', 'شماره بیمه', '12345678'),
            ('insurance_name', 'نام بیمه', 'تامین اجتماعی'),
            ('exemption_type', 'نوع معافیت', '1'),
            ('citizenship_country_code', 'کشور محل تابعیت', '103'),
            ('residence_country_code', 'کشور محل زندگی', '103'),
            ('postal_code', 'کد پستی', '1234567890'),
            ('address', 'آدرس', 'تهران، خیابان آزادی'),
            ('job_category', 'رسته', '15'),
            ('job_title', 'سمت شغل', 'کارشناس انبار'),
            ('employment_type', 'نوع استخدام', '2'),
            ('start_date', 'تاریخ شروع به کار', '1404/01/01'),
            ('end_date', 'تاریخ پایان کار', ''),
            ('retirement_date', 'تاریخ بازنشستگی', ''),
            ('job_code', 'کد شغل', '027212'),
            ('id_series', 'مسلسل شناسنامه', ''),
            ('id_serial', 'سریال', ''),
            ('issue_place', 'محل صدور', 'تهران'),
            ('issue_date', 'تاریخ صدور', ''),
            ('gender', 'جنسیت', 'مرد'),
            ('phone_number', 'موبایل', '09123456789'),
            ('account_number', 'شماره حساب', '1234567890'),
            ('marital_status', 'وضعیت تاهل', 'مجرد'),
            ('children_count', 'تعداد فرزند', 0),
            ('contract_hours', 'ساعت کار قرارداد شده', 230),
            ('contract_base_salary', 'حقوق قرارداد شده', 0),
            ('job_grade', 'گروه شغلی', '19'),
            ('daily_base_wage', 'مزد روزانه', 3500000),
            ('daily_seniority_bonus', 'پایه سنواتی', 0),
            ('base_years_experience', 'تعداد سال کارکرد', 0),
            ('base_daily_rate', 'مزد مبنا', 3500000),
            ('group_status', 'گروه', 'شاغل'),
            ('include_in_tax', 'maliat', 1),
            ('include_in_insurance', 'بیمه', 1),
            ('include_in_bank', 'bank', 1),
        ]

        f_title = Font(name='B Nazanin', size=11, bold=True, color='FFFFFF')
        f_key = Font(name='Segoe UI', size=9, bold=True, color='CBD5E1')
        fill_title = PatternFill(start_color='4338CA', end_color='4338CA', fill_type='solid')
        fill_key = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        align_center = Alignment(horizontal='center', vertical='center', wrap_text=True)
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        ws.row_dimensions[1].height = 28
        ws.row_dimensions[2].height = 20
        ws.freeze_panes = 'A3'

        for col_idx, (c_en, c_fa, sample_val) in enumerate(columns_spec, 1):
            cell_fa = ws.cell(row=1, column=col_idx, value=c_fa)
            cell_fa.font = f_title
            cell_fa.fill = fill_title
            cell_fa.alignment = align_center
            cell_fa.border = thin_border

            cell_en = ws.cell(row=2, column=col_idx, value=c_en)
            cell_en.font = f_key
            cell_en.fill = fill_key
            cell_en.alignment = align_center
            cell_en.border = thin_border

            c_val = ws.cell(row=3, column=col_idx, value=sample_val)
            c_val.alignment = align_center
            c_val.border = thin_border

        ws.row_dimensions[3].height = 22

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="personnel_template.xlsx"'
        return response

    @action(detail=False, methods=['post', 'POST', 'get', 'GET'], url_path='import-excel')
    def import_excel(self, request):
        """
        درون‌ریزی هوشمند ۴۶ ستونی شیت Emp_info با پشتیبانی از هر دو قالب (خروجی سامانه و فایل مرجع)،
        نرمال‌سازی تاریخ‌ها و شماره‌ها، ایجاد حساب اصلی، و تعیین وضعیت رکورد طبق ماشین حالت
        """
        import openpyxl
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایل اکسل الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        
        warehouse_id = request.data.get('warehouse_id') or request.query_params.get('warehouse_id')
        section_id = request.data.get('section_id') or request.query_params.get('section_id')
        dry_run = str(request.data.get('dry_run') or request.query_params.get('dry_run', 'false')).lower() in ['true', '1']
        update_existing = str(request.data.get('update_existing') or request.query_params.get('update_existing', 'true')).lower() in ['true', '1']
        
        try:
            wb = openpyxl.load_workbook(file_obj, data_only=True)
        except Exception as e:
            return Response({
                'success': False,
                'dry_run': dry_run,
                'summary': {'total_rows': 0, 'created': 0, 'updated': 0, 'skipped': 0, 'valid_count': 0, 'error_count': 1},
                'errors': [{'row': 0, 'field': 'فایل اکسل', 'message': f'خطا در باز کردن فایل اکسل: {str(e)}'}]
            }, status=status.HTTP_400_BAD_REQUEST)
        
        target_sheet = None
        for name in wb.sheetnames:
            if name.strip().lower() in ['emp_info', 'emp info', 'empinfo', 'پرسنل', 'پرسنل و کارکنان']:
                target_sheet = wb[name]
                break
        if not target_sheet:
            target_sheet = wb.active

        ws = target_sheet

        FIELD_ALIASES = {
            'national_code': ['کد ملی', 'کدملی', 'national_code', 'national code', 'کد_ملی'],
            'first_name': ['نام', 'first_name', 'firstname', 'نام کوچک'],
            'last_name': ['نام خانوادگی', 'نام  خانوادگی', 'نام‌خانوادگی', 'last_name', 'lastname', 'فامیلی'],
            'father_name': ['نام پدر', 'نام  پدر', 'father_name', 'fathername', 'پدر'],
            'birth_date': ['تاریخ تولد', 'birth_date', 'birthdate', 'تولد'],
            'id_number': ['شماره شناسنامه', 'شماره  شناسنامه', 'id_number', 'شناسنامه'],
            'birth_place': ['محل تولد', 'محل  تولد', 'birth_place', 'صادره'],
            'education_level': ['مدرک تحصیلی', 'مدرک  تحصیلی', 'education_level', 'تحصیلات'],
            'insurance_type': ['نوع بیمه', 'insurance_type'],
            'insurance_number': ['شماره بیمه', 'شماره  بیمه', 'insurance_number', 'کد بیمه'],
            'insurance_name': ['نام بیمه', 'نام  بیمه', 'insurance_name'],
            'exemption_type': ['نوع معافیت', 'نوع  معافیت', 'exemption_type', 'معافیت'],
            'nationality_code': ['ملیت', 'کد ملیت', 'nationality_code', 'تابعیت'],
            'citizenship_country_code': ['کشور محل تابعیت', 'citizenship_country_code', 'کشور تابعیت'],
            'residence_country_code': ['کشور محل زندگی', 'residence_country_code', 'کشور زندگی', 'محل سکونت'],
            'postal_code': ['کد پستی', 'کدپستی', 'postal_code', 'کد_پستی'],
            'address': ['آدرس', 'ادرس', 'آدرس محل سکونت', 'address', 'نشانی'],
            'job_category': ['رسته', 'job_category'],
            'job_title': ['سمت شغل', 'سمت  شغل', 'عنوان شغل', 'سمت شغلی', 'job_title', 'شغل'],
            'employment_type': ['نوع استخدام', 'employment_type'],
            'start_date': ['تاریخ شروع به کار', 'تاریخ شروع', 'start_date', 'شروع به کار'],
            'end_date': ['تاریخ پایان کار', 'تاریخ پایان', 'end_date', 'پایان کار'],
            'retirement_date': ['تاریخ بازنشستگی', 'retirement_date'],
            'job_code': ['کد شغل', 'job_code', 'کد_شغل'],
            'id_series': ['مسلسل شناسنامه', 'مسلسل', 'id_series'],
            'id_serial': ['سریال', 'سریال شناسنامه', 'id_serial'],
            'issue_place': ['محل صدور', 'issue_place'],
            'issue_date': ['تاریخ صدور', 'issue_date'],
            'gender': ['جنسیت', 'gender'],
            'phone_number': ['موبایل', 'شماره همراه', 'شماره تماس', 'phone_number', 'تلفن همراه'],
            'account_number': ['شماره حساب', 'شماره  حساب', 'account_number', 'حساب'],
            'sheba_number': ['شماره شبا', 'شماره  شبا', 'شبا', 'sheba_number', 'sheba'],
            'bank_name': ['نام بانک', 'نام  بانک', 'بانک', 'bank_name'],
            'marital_status': ['وضعیت تاهل', 'وضعیت  تاهل', 'marital_status', 'تاهل'],
            'children_count': ['تعداد فرزند', 'تعداد  فرزند', 'children_count', 'فرزند'],
            'contract_hours': ['ساعت کار قرارداد شده', 'ساعت کار قرارداد', 'contract_hours'],
            'contract_base_salary': ['حقوق قرارداد شده', 'حقوق قرارداد', 'contract_base_salary'],
            'job_grade': ['گروه شغلی', 'job_grade'],
            'daily_base_wage': ['مزد روزانه', 'دستمزد روزانه', 'daily_base_wage', 'مزد روزانه '],
            'daily_seniority_bonus': ['پایه سنواتی', 'سنوات روزانه', 'daily_seniority_bonus'],
            'base_years_experience': ['تعداد سال کارکرد', 'سال کارکرد', 'base_years_experience'],
            'base_daily_rate': ['مزد مبنا', 'دستمزد مبنا', 'base_daily_rate'],
            'status_category': ['وضعیت', 'وضعیت پرسنل', 'status_category'],
            'group_status': ['گروه', 'group_status'],
            'include_in_tax': ['maliat', 'مالیات', 'include_in_tax'],
            'include_in_insurance': ['بیمه', 'include_in_insurance', 'bimeh'],
            'include_in_bank': ['bank', 'بانک', 'include_in_bank'],
        }

        # تشخیص هوشمند ردیف‌های سربرگ و شروع داده‌ها
        header_row_idx = 1
        data_start_row = 2
        col_map = {}

        for r_idx in range(1, min(ws.max_row + 1, 6)):
            row_vals = [str(ws.cell(row=r_idx, column=c).value or '').strip() for c in range(1, ws.max_column + 1)]
            row_str = ' '.join(row_vals)
            if 'کد ملی' in row_str or 'national_code' in row_str or 'نام خانوادگی' in row_str or 'last_name' in row_str:
                header_row_idx = r_idx
                break

        # بررسی اینکه آیا سطر بعدی نیز سطر کلیدهای انگلیسی یا هدر ثانویه است
        next_row_vals = [str(ws.cell(row=header_row_idx + 1, column=c).value or '').strip() for c in range(1, ws.max_column + 1)] if header_row_idx < ws.max_row else []
        next_row_str = ' '.join(next_row_vals).lower()
        if 'national_code' in next_row_str or 'last_name' in next_row_str or 'first_name' in next_row_str or 'job_title' in next_row_str:
            data_start_row = header_row_idx + 2
        else:
            data_start_row = header_row_idx + 1

        for c in range(1, ws.max_column + 1):
            val1 = str(ws.cell(row=header_row_idx, column=c).value or '').strip().replace('  ', ' ')
            val2 = str(ws.cell(row=header_row_idx + 1, column=c).value or '').strip().replace('  ', ' ') if header_row_idx + 1 < data_start_row else ''
            for field, aliases in FIELD_ALIASES.items():
                if field in col_map:
                    continue
                for alias in aliases:
                    if alias == val1 or alias == val2 or alias == val1.lower() or alias == val2.lower():
                        col_map[field] = c
                        break

        if 'national_code' not in col_map and 'last_name' not in col_map:
            return Response({
                'success': False,
                'dry_run': dry_run,
                'summary': {'total_rows': 0, 'created': 0, 'updated': 0, 'skipped': 0, 'valid_count': 0, 'error_count': 1},
                'errors': [{'row': header_row_idx, 'field': 'ستون‌ها', 'message': 'شیت پرسنلی یا ستون‌های الزامی (کد ملی، نام خانوادگی) در فایل یافت نشد.'}]
            }, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        updated_count = 0
        skipped_count = 0
        errors = []
        preview_rows = []
        valid_rows_data = []

        persian_arabic_digits = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')

        def get_cell_str(r, field, default=''):
            c_idx = col_map.get(field)
            if c_idx:
                val = ws.cell(row=r, column=c_idx).value
                if val is not None:
                    return str(val).strip()
            return default

        def get_cell_num(r, field, default=0):
            c_idx = col_map.get(field)
            if c_idx:
                val = ws.cell(row=r, column=c_idx).value
                if val is not None:
                    try:
                        clean_str = str(val).translate(persian_arabic_digits).replace(',', '').strip()
                        return float(clean_str)
                    except (ValueError, TypeError):
                        pass
            return default

        def get_cell_bool(r, field, default=True):
            c_idx = col_map.get(field)
            if c_idx:
                val = ws.cell(row=r, column=c_idx).value
                if val is not None:
                    s = str(val).strip().lower()
                    return s in ['1', 'true', 'بله', 'yes']
            return default

        def normalize_date_val(val):
            if not val:
                return ''
            raw_s = str(val).translate(persian_arabic_digits).strip()
            if not raw_s or raw_s.lower() == 'none':
                return ''
            raw_s = raw_s.split('.')[0]
            if len(raw_s) == 8 and raw_s.isdigit():
                return f"{raw_s[:4]}/{raw_s[4:6]}/{raw_s[6:]}"
            raw_s = raw_s.replace('-', '/')
            parts = raw_s.split('/')
            if len(parts) == 3 and len(parts[0]) == 4 and parts[1].isdigit() and parts[2].isdigit():
                return f"{parts[0]}/{int(parts[1]):02d}/{int(parts[2]):02d}"
            return raw_s

        # بخش مقصد یک‌بار و با قلمرو سنجیده می‌شود؛ کاربر غیرسوپریوزر فقط در شرکت‌های مجاز خودش درون‌ریزی می‌کند
        sec_obj = None
        if section_id:
            if not str(section_id).isdigit():
                return Response({'error': 'شناسه بخش نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
            sec_obj = ProjectSection.objects.filter(id=int(section_id)).select_related('project').first()
            if not sec_obj:
                return Response({'error': 'بخش مورد نظر یافت نشد.'}, status=status.HTTP_404_NOT_FOUND)
        if requires_company_scope(request.user):
            if sec_obj is not None:
                ensure_personnel_write_scope(request.user, section=sec_obj)
                active_cid = sec_obj.project.company_id
                requested_cid = get_request_company_id(request)
                if requested_cid and str(requested_cid).isdigit() and int(requested_cid) != active_cid:
                    raise PermissionDenied("بخش انتخاب‌شده به شرکت فعال شما تعلق ندارد.")
            else:
                active_cid = resolve_import_company(request)
        else:
            from common.tenant_scope import get_current_tenant_company_id
            active_cid = get_current_tenant_company_id(request=request, user=request.user)

        from common.validators import validate_iranian_national_code
        from ..lifecycle_services import normalize_job_title

        for r in range(data_start_row, ws.max_row + 1):
            nat_c = col_map.get('national_code')
            if not nat_c:
                continue
            raw_nc = ws.cell(row=r, column=nat_c).value
            if raw_nc is None or str(raw_nc).strip() == '':
                continue

            nc_raw_str = str(raw_nc).translate(persian_arabic_digits).strip().split('.')[0]
            if nc_raw_str.lower() in ['national_code', 'national code', 'کد ملی', 'کلید']:
                continue

            nc_clean = nc_raw_str.zfill(10)
            try:
                nc_clean = validate_iranian_national_code(nc_clean)
            except ValueError as e:
                errors.append({
                    'row': r,
                    'field': 'کد ملی',
                    'message': f'کد ملی نامعتبر است ({raw_nc}): {str(e)}'
                })
                continue

            first_name = get_cell_str(r, 'first_name')
            last_name = get_cell_str(r, 'last_name')
            if not last_name:
                errors.append({
                    'row': r,
                    'field': 'نام خانوادگی',
                    'message': 'نام خانوادگی در این ردیف خالی است'
                })
                continue

            # استخراج و نرمال‌سازی شماره همراه
            raw_phone = get_cell_str(r, 'phone_number')
            clean_phone = ''
            if raw_phone:
                p_digits = str(raw_phone).translate(persian_arabic_digits).strip().split('.')[0]
                if len(p_digits) == 10 and p_digits.startswith('9'):
                    clean_phone = f"0{p_digits}"
                else:
                    clean_phone = p_digits

            # استخراج و نرمال‌سازی کد شغل ۶ رقمی
            raw_jc = get_cell_str(r, 'job_code')
            clean_jc = ''
            if raw_jc:
                clean_jc = str(raw_jc).translate(persian_arabic_digits).strip().split('.')[0]
                if clean_jc.isdigit() and len(clean_jc) <= 6:
                    clean_jc = clean_jc.zfill(6)

            # ستون‌های حاضر و غیرخالی همین ردیف: رکورد موجود فقط از همین‌ها به‌روز می‌شود، نه از پیش‌فرض ستون‌های غایب
            present_fields = set()
            for field_name, c_idx in col_map.items():
                cell_val = ws.cell(row=r, column=c_idx).value
                if cell_val is not None and str(cell_val).strip() != '':
                    present_fields.add(field_name)

            profile_defaults = {
                'first_name': first_name,
                'last_name': last_name,
                'father_name': get_cell_str(r, 'father_name'),
                'birth_date': normalize_date_val(get_cell_str(r, 'birth_date')),
                'id_number': get_cell_str(r, 'id_number'),
                'birth_place': get_cell_str(r, 'birth_place'),
                'education_level': get_cell_str(r, 'education_level', '4'),
                'insurance_type': get_cell_str(r, 'insurance_type', '2'),
                'insurance_number': get_cell_str(r, 'insurance_number'),
                'insurance_name': get_cell_str(r, 'insurance_name', 'تامین اجتماعی'),
                'exemption_type': get_cell_str(r, 'exemption_type', '1'),
                'nationality_code': get_cell_str(r, 'nationality_code', '1'),
                'citizenship_country_code': get_cell_str(r, 'citizenship_country_code', '103'),
                'residence_country_code': get_cell_str(r, 'residence_country_code', '103'),
                'job_category': get_cell_str(r, 'job_category', '15'),
                # DEF-22: «ي/ك» عربی و فاصله‌های فایل مرجع یکدست می‌شوند (مثل «مديرپروژه»)
                'job_title': normalize_job_title(get_cell_str(r, 'job_title')) or 'پرسنل انبار',
                'employment_type': get_cell_str(r, 'employment_type', '2'),
                'start_date': normalize_date_val(get_cell_str(r, 'start_date')),
                'end_date': normalize_date_val(get_cell_str(r, 'end_date')),
                'retirement_date': normalize_date_val(get_cell_str(r, 'retirement_date')),
                'job_code': clean_jc,
                'id_series': get_cell_str(r, 'id_series'),
                'id_serial': get_cell_str(r, 'id_serial'),
                'issue_place': get_cell_str(r, 'issue_place'),
                'issue_date': normalize_date_val(get_cell_str(r, 'issue_date')),
                'gender': get_cell_str(r, 'gender', 'مرد'),
                'phone_number': clean_phone,
                'account_number': get_cell_str(r, 'account_number'),
                'sheba_number': get_cell_str(r, 'sheba_number'),
                'bank_name': get_cell_str(r, 'bank_name'),
                'address': get_cell_str(r, 'address'),
                'postal_code': get_cell_str(r, 'postal_code'),
                'marital_status': 'married' if 'متاهل' in get_cell_str(r, 'marital_status') or 'متأهل' in get_cell_str(r, 'marital_status') else 'single',
                'children_count': int(get_cell_num(r, 'children_count', 0)),
                'contract_hours': get_cell_num(r, 'contract_hours', 230),
                'contract_base_salary': get_cell_num(r, 'contract_base_salary', 0),
                'job_grade': get_cell_str(r, 'job_grade', '19'),
                'daily_base_wage': get_cell_num(r, 'daily_base_wage', 0),
                'daily_seniority_bonus': get_cell_num(r, 'daily_seniority_bonus', 0),
                'base_daily_rate': get_cell_num(r, 'base_daily_rate', 0),
                'base_years_experience': int(get_cell_num(r, 'base_years_experience', 0)),
                'status_category': get_cell_str(r, 'status_category', 'نفرات شرکتی'),
                'group_status': get_cell_str(r, 'group_status', 'شاغل'),
                'include_in_tax': get_cell_bool(r, 'include_in_tax', True),
                'include_in_insurance': get_cell_bool(r, 'include_in_insurance', True),
                'include_in_bank': get_cell_bool(r, 'include_in_bank', True),
                'contract_type': 'daily',
                'created_by': request.user if request.user and request.user.is_authenticated else None
            }
            if active_cid:
                profile_defaults['company_id'] = active_cid

            if warehouse_id and str(warehouse_id).isdigit():
                profile_defaults['assigned_warehouse_id'] = int(warehouse_id)
            if sec_obj is not None:
                profile_defaults['section_id'] = sec_obj.id
                profile_defaults['project_id'] = sec_obj.project_id
                if not profile_defaults.get('company_id') and sec_obj.project.company_id:
                    profile_defaults['company_id'] = sec_obj.project.company_id

            valid_rows_data.append((r, nc_clean, profile_defaults, present_fields))

        # پروندهٔ موجود با همان قلمرو دید پیدا می‌شود: پروندهٔ بی‌شرکتی که بخشش در همین شرکت است هم «موجود» است
        # (وگرنه درون‌ریزی برای آن پرونده‌ای تکراری در شرکت می‌ساخت)
        existing_qs = PersonnelProfile.objects.filter(national_code__in=[x[1] for x in valid_rows_data])
        if active_cid:
            existing_qs = existing_qs.filter(
                Q(company_id=active_cid) | Q(company__isnull=True, section__project__company_id=active_cid)
            )
        existing_by_code = {}
        ambiguous_codes = set()
        for prof in existing_qs.order_by('company_id', 'id'):  # در Postgres مقدار تهی در ترتیب صعودی آخر می‌آید
            if prof.national_code in existing_by_code:
                if not active_cid or existing_by_code[prof.national_code].company_id == prof.company_id:
                    ambiguous_codes.add(prof.national_code)
                continue
            existing_by_code[prof.national_code] = prof

        for r, nc_clean, p_defaults, _present in valid_rows_data:
            exists = nc_clean in existing_by_code
            full_name = f"{p_defaults['first_name']} {p_defaults['last_name']}".strip()

            if exists:
                if update_existing:
                    updated_count += 1
                else:
                    skipped_count += 1
            else:
                created_count += 1

            if len(preview_rows) < 30:
                preview_rows.append({
                    'row': r,
                    'name': full_name,
                    'username': nc_clean,
                    'national_code': nc_clean,
                    'roles': p_defaults.get('job_title') or 'پرسنل انبار',
                    'warehouses': f"بخش {section_id}" if section_id else "عمومی",
                    'is_update': exists
                })

        import_warnings = []
        if not dry_run:
            user = request.user
            from decimal import Decimal, InvalidOperation
            from ..lifecycle_services import (
                FINANCE_STAGE_PERMS,
                MANAGER_STAGE_PERMS,
                WAGE_FIELDS,
                _snapshot_value,
                auto_pass_personnel,
                user_can_view_wages,
                user_has_any_perm,
            )
            is_mgr = user_has_any_perm(user, MANAGER_STAGE_PERMS)
            is_fin = user_has_any_perm(user, FINANCE_STAGE_PERMS)
            can_set_wages = user_can_view_wages(user)
            created_by_manager = []
            scope_keys = ('section_id', 'project_id', 'assigned_warehouse_id')

            def _norm(value):
                if value is None or value == '':
                    return None
                if isinstance(value, bool):
                    return value
                if isinstance(value, (int, float, Decimal)):
                    try:
                        return Decimal(str(value)).normalize()
                    except InvalidOperation:
                        return str(value)
                return str(value).strip()

            with transaction.atomic():
                for r, nc_clean, p_defaults, present_fields in valid_rows_data:
                    existing_prof = existing_by_code.get(nc_clean)
                    if existing_prof is not None and not update_existing:
                        continue

                    if not can_set_wages:
                        # DEF-21: ستون‌های دستمزد را فقط نقش مالی درون‌ریزی می‌کند
                        for wage_field in WAGE_FIELDS:
                            p_defaults.pop(wage_field, None)

                    if existing_prof is None:
                        # DEF-14: ردیف تازه همیشه پیش‌نویس ساخته می‌شود؛ درون‌ریزی مدیر سپس با گیت عبور هوشمند می‌کند
                        p_defaults['approval_status'] = 'draft'
                        prof = PersonnelProfile.objects.create(national_code=nc_clean, **p_defaults)
                        if is_mgr:
                            created_by_manager.append((r, prof))
                        continue

                    full_name = f"{p_defaults.get('first_name', '')} {p_defaults.get('last_name', '')}".strip()
                    if nc_clean in ambiguous_codes:
                        import_warnings.append({
                            'row': r, 'field': 'کد ملی', 'national_code': nc_clean,
                            'message': f'برای «{full_name}» بیش از یک پرونده با این کد ملی هست؛ ابتدا شرکت فعال را انتخاب کنید. این ردیف به‌روز نشد.',
                        })
                        updated_count -= 1
                        skipped_count += 1
                        continue

                    # همان قاعدهٔ ویرایش مستقیم: پروندهٔ مصوب، در انتظار مدیر یا ردشده از درون‌ریزی به‌روز نمی‌شود
                    # (DEF-17؛ تغییر پروندهٔ مصوب فقط از مسیر درخواست تغییرات است)
                    st = existing_prof.approval_status
                    editable = (
                        user.is_superuser
                        or st in ('draft', 'revision_required', 'pending_supervisor')
                        or (st == 'pending_accountant' and is_fin)
                    )
                    if not editable:
                        import_warnings.append({
                            'row': r, 'field': 'وضعیت پرونده', 'national_code': nc_clean,
                            'message': f'پرونده «{existing_prof.full_name}» در وضعیت «{existing_prof.get_approval_status_display()}» است و از درون‌ریزی به‌روز نشد؛ تغییر آن از مسیر درخواست تغییرات انجام می‌شود.',
                        })
                        updated_count -= 1
                        skipped_count += 1
                        continue

                    # فقط ستون‌های حاضر و غیرخالی همین ردیف نوشته می‌شوند؛ ستون غایب یا خالی مقدار فعلی را پاک نمی‌کند
                    updates = {
                        k: v for k, v in p_defaults.items()
                        if (k in present_fields and v not in ('', None)) or k in scope_keys
                    }
                    diff, old_diff = {}, {}
                    for k, v in updates.items():
                        old_v = getattr(existing_prof, k, None)
                        if _norm(old_v) != _norm(v):
                            diff[k] = _snapshot_value(v)
                            old_diff[k] = _snapshot_value(old_v)
                    if not diff:
                        continue
                    for k in diff:
                        setattr(existing_prof, k, updates[k])
                    existing_prof.save()
                    if st not in ('draft', 'revision_required'):
                        WorkflowAuditLog.objects.create(
                            content_type='personnel',
                            object_id=existing_prof.id,
                            actor=user,
                            from_status=st,
                            to_status=existing_prof.approval_status,
                            action='excel_import_update',
                            reason='به‌روزرسانی پرونده از درون‌ریزی اکسل',
                            metadata={'diff': diff, 'old_diff': old_diff, 'row': r, 'company_id': existing_prof.company_id}
                        )

                # DEF-14: گیت برای هر ردیف؛ ردیف ناقص با گزارش، پیش‌نویس می‌ماند و عبور هوشمند لاگ auto_pass دارد
                for r, prof in created_by_manager:
                    result = auto_pass_personnel(prof, user, source='excel_import', draft_on_incomplete=True)
                    if result['status'] == 'draft':
                        import_warnings.append({
                            'row': r,
                            'field': 'گیت تکمیل پرونده',
                            'national_code': prof.national_code,
                            'message': f"پرونده «{prof.full_name}» به‌دلیل نقص اطلاعات پیش‌نویس ماند: "
                                       + '، '.join(m['label'] for m in result['missing_fields']),
                        })

            broadcast_personnel_update(None, action_type='imported', message=f'درون‌ریزی پرسنل انجام شد ({created_count} ایجاد، {updated_count} به‌روزرسانی).', sender_id=request.user.id if request.user else None)

        valid_count = created_count + updated_count
        total_rows = valid_count + len(errors) + skipped_count

        return Response({
            'success': len(errors) == 0 or valid_count > 0,
            'dry_run': dry_run,
            'message': f'درون‌ریزی پرسنل با موفقیت انجام شد ({created_count} پرسنل جدید، {updated_count} به‌روزرسانی).',
            'created_count': created_count,
            'updated_count': updated_count,
            'summary': {
                'total_rows': total_rows,
                'created': created_count,
                'updated': updated_count,
                'skipped': len(errors) + skipped_count,
                'valid_count': valid_count,
                'error_count': len(errors),
            },
            'preview_rows': preview_rows,
            'errors': errors,
            'warnings': import_warnings,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """
        خروجی رسمی ۴۶ ستونی اطلاعات پرسنل منطبق بر شیت Emp_info و ساختار ۲ سطری
        """
        import io
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from django.http import HttpResponse

        qs = self.get_queryset()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Emp_info"
        ws.views.sheetView[0].rightToLeft = True

        columns_spec = [
            ('status_category', 'وضعیت'),
            ('row_num', 'ردیف'),
            ('nationality_code', 'ملیت'),
            ('national_code', 'کد ملی'),
            ('first_name', 'نام'),
            ('last_name', 'نام خانوادگی'),
            ('father_name', 'نام پدر'),
            ('birth_date', 'تاریخ تولد'),
            ('id_number', 'شماره شناسنامه'),
            ('birth_place', 'محل تولد'),
            ('education_level', 'مدرک تحصیلی'),
            ('insurance_type', 'نوع بیمه'),
            ('insurance_number', 'شماره بیمه'),
            ('insurance_name', 'نام بیمه'),
            ('exemption_type', 'نوع معافیت'),
            ('citizenship_country_code', 'کشور محل تابعیت'),
            ('residence_country_code', 'کشور محل زندگی'),
            ('postal_code', 'کد پستی'),
            ('address', 'آدرس'),
            ('job_category', 'رسته'),
            ('job_title', 'سمت شغل'),
            ('employment_type', 'نوع استخدام'),
            ('start_date', 'تاریخ شروع به کار'),
            ('end_date', 'تاریخ پایان کار'),
            ('retirement_date', 'تاریخ بازنشستگی'),
            ('job_code', 'کد شغل'),
            ('id_series', 'مسلسل شناسنامه'),
            ('id_serial', 'سریال'),
            ('issue_place', 'محل صدور'),
            ('issue_date', 'تاریخ صدور'),
            ('gender', 'جنسیت'),
            ('phone_number', 'موبایل'),
            ('account_number', 'شماره حساب'),
            ('marital_status', 'وضعیت تاهل'),
            ('children_count', 'تعداد فرزند'),
            ('contract_hours', 'ساعت کار قرارداد شده'),
            ('contract_base_salary', 'حقوق قرارداد شده'),
            ('job_grade', 'گروه شغلی'),
            ('daily_base_wage', 'مزد روزانه'),
            ('daily_seniority_bonus', 'پایه سنواتی'),
            ('base_years_experience', 'تعداد سال کارکرد'),
            ('base_daily_rate', 'مزد مبنا'),
            ('group_status', 'گروه'),
            ('include_in_tax', 'maliat'),
            ('include_in_insurance', 'بیمه'),
            ('include_in_bank', 'bank'),
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

        headers_fa = [c[1] for c in columns_spec]
        headers_en = [c[0] for c in columns_spec]
        ws.append(headers_fa)
        ws.append(headers_en)

        for col_idx in range(1, len(columns_spec) + 1):
            cell_fa = ws.cell(row=1, column=col_idx)
            cell_fa.font = title_font
            cell_fa.fill = title_fill
            cell_fa.alignment = Alignment(horizontal='center', vertical='center')

            cell_en = ws.cell(row=2, column=col_idx)
            cell_en.font = key_font
            cell_en.fill = key_fill
            cell_en.alignment = Alignment(horizontal='center', vertical='center')

        ws.freeze_panes = 'A3'

        persian_arabic_digits = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
        def format_date_str(val):
            if not val:
                return ''
            s = str(val).translate(persian_arabic_digits).strip()
            if not s or s.lower() == 'none':
                return ''
            s = s.split('.')[0]
            if len(s) == 8 and s.isdigit():
                return f"{s[:4]}/{s[4:6]}/{s[6:]}"
            s = s.replace('-', '/')
            parts = s.split('/')
            if len(parts) == 3 and len(parts[0]) == 4 and parts[1].isdigit() and parts[2].isdigit():
                return f"{parts[0]}/{int(parts[1]):02d}/{int(parts[2]):02d}"
            return s

        data_font = Font(name='B Nazanin', size=10)
        data_font_num = Font(name='Segoe UI', size=10)

        for idx, p in enumerate(qs, start=1):
            curr_row = idx + 2
            row_data = [
                p.status_category or 'نفرات شرکتی',
                idx,
                p.nationality_code or '1',
                p.national_code or '',
                p.first_name or '',
                p.last_name or '',
                p.father_name or '',
                format_date_str(p.birth_date),
                p.id_number or '',
                p.birth_place or '',
                p.education_level or '4',
                p.insurance_type or '2',
                p.insurance_number or '',
                p.insurance_name or 'تامین اجتماعی',
                p.exemption_type or '1',
                p.citizenship_country_code or '103',
                p.residence_country_code or '103',
                p.postal_code or '',
                p.address or '',
                p.job_category or '15',
                p.job_title or '',
                p.employment_type or '2',
                format_date_str(p.start_date),
                format_date_str(p.end_date),
                format_date_str(p.retirement_date),
                str(p.job_code).zfill(6) if p.job_code else '',
                p.id_series or '',
                p.id_serial or '',
                p.issue_place or '',
                format_date_str(p.issue_date),
                p.gender or 'مرد',
                p.phone_number or getattr(p, 'mobile_phone', '') or '',
                p.account_number or '',
                'متاهل' if p.marital_status == 'married' else 'مجرد',
                int(p.children_count or 0),
                float(p.contract_hours or 230),
                float(p.contract_base_salary or 0),
                p.job_grade or '19',
                float(p.daily_base_wage or 0),
                float(p.daily_seniority_bonus or 0),
                int(p.base_years_experience or 0),
                float(p.base_daily_rate or 0),
                p.group_status or 'شاغل',
                1 if p.include_in_tax else 0,
                1 if p.include_in_insurance else 0,
                1 if p.include_in_bank else 0,
            ]
            ws.append(row_data)

            for col_idx in range(1, len(row_data) + 1):
                c = ws.cell(row=curr_row, column=col_idx)
                c.border = thin_border
                c.alignment = Alignment(horizontal='center' if col_idx not in [5, 6, 19] else 'right', vertical='center')
                if col_idx in [2, 4, 8, 9, 23, 24, 25, 26, 30, 32, 33, 35, 36, 37, 39, 40, 41, 42]:
                    c.font = data_font_num
                else:
                    c.font = data_font
                if col_idx in [37, 39, 40, 42]:
                    c.number_format = '#,##0'

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"personnel_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

class PersonnelChangeRequestViewSet(viewsets.ModelViewSet):
    queryset = PersonnelChangeRequest.objects.all().select_related('personnel', 'requested_by', 'manager_reviewed_by', 'accountant_reviewed_by')
    serializer_class = PersonnelChangeRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        # درخواست تغییرات فقط برای پرونده‌هایی دیده و بررسی می‌شود که کاربر خودِ پرونده را می‌بیند
        # (بخش‌های منتسب و شرکت‌های مجاز، با یا بدون سربرگ شرکت)
        visible_personnel = scope_personnel_queryset(self.request, PersonnelProfile.objects.all())
        qs = super().get_queryset().filter(personnel__in=visible_personnel.values('id'))
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        personnel_id = self.request.query_params.get('personnel_id')
        if personnel_id:
            qs = qs.filter(personnel_id=personnel_id)
        return qs

    def create(self, request, *args, **kwargs):
        return Response(
            {'error': 'ثبت درخواست تغییرات مستقیماً مجاز نیست و باید از طریق ویرایش پرونده پرسنل فعال صورت گیرد.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def update(self, request, *args, **kwargs):
        return Response(
            {'error': 'ویرایش مستقیم درخواست تغییرات مجاز نیست. در صورت لزوم درخواست را لغو کرده و مجدداً ثبت نمایید.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            return Response(
                {'error': 'حذف فیزیکی درخواست تغییرات مجاز نیست. لطفاً از عملیات لغو (Cancel) استفاده کنید.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='approve-supervisor')
    def approve_supervisor(self, request, pk=None):
        from ..lifecycle_services import SUPERVISOR_STAGE_PERMS, log_change_request_event, user_has_any_perm
        user = request.user
        if not user_has_any_perm(user, SUPERVISOR_STAGE_PERMS):
            raise PermissionDenied("شما دسترسی بررسی مرحله اول (سرپرست) درخواست تغییرات را ندارید.")

        cr = self.get_object()
        if cr.status not in ['draft', 'pending_supervisor', 'revision_required']:
            return Response({'error': f'درخواست در وضعیت «{cr.get_status_display()}» قابل تایید سرپرست نیست.'}, status=status.HTTP_400_BAD_REQUEST)

        note = (request.data.get('note') or '').strip()
        with transaction.atomic():
            cr.status = 'pending_accountant'
            cr.supervisor_reviewed_by = user
            cr.supervisor_reviewed_at = timezone.now()
            cr.save()
            log_change_request_event(cr, user, 'change_request_approve_supervisor', reason=note)
        return Response({'message': 'درخواست تغییرات به تایید سرپرست رسید و به کارتابل حسابداری ارسال شد.', 'data': self.get_serializer(cr).data})

    @action(detail=True, methods=['post'], url_path='approve-finance')
    def approve_finance(self, request, pk=None):
        from ..lifecycle_services import FINANCE_STAGE_PERMS, log_change_request_event, user_has_any_perm
        user = request.user
        if not user_has_any_perm(user, FINANCE_STAGE_PERMS):
            raise PermissionDenied("شما دسترسی تایید مرحله دوم (مالی) درخواست تغییرات را ندارید.")

        cr = self.get_object()
        valid_statuses = ['pending_accountant', 'supervisor_approved', 'manager_approved']
        if cr.status not in valid_statuses:
            return Response({'error': f'درخواست ابتدا باید به تایید سرپرست برسد (وضعیت فعلی: {cr.get_status_display()}).'}, status=status.HTTP_400_BAD_REQUEST)

        note = (request.data.get('note') or '').strip()
        with transaction.atomic():
            cr.status = 'pending_manager'
            cr.accountant_reviewed_by = user
            cr.accountant_reviewed_at = timezone.now()
            cr.save()
            log_change_request_event(cr, user, 'change_request_approve_finance', reason=note)
        return Response({'message': 'درخواست تغییرات به تایید مالی رسید و به کارتابل مدیر ارسال شد.', 'data': self.get_serializer(cr).data})

    @action(detail=True, methods=['post'], url_path='approve-manager')
    def approve_manager(self, request, pk=None):
        from ..lifecycle_services import (
            MANAGER_STAGE_PERMS,
            PersonnelWorkflowError,
            apply_personnel_change_request,
            log_change_request_event,
            refresh_has_pending_changes,
            user_has_any_perm,
        )
        user = request.user
        if not user_has_any_perm(user, MANAGER_STAGE_PERMS):
            raise PermissionDenied("شما دسترسی تصویب نهایی درخواست تغییرات را ندارید.")

        cr = self.get_object()
        valid_statuses = ['pending_manager', 'accountant_approved', 'pending_supervisor', 'pending_accountant', 'draft', 'manager_approved']
        if cr.status not in valid_statuses:
            return Response({'error': f'درخواست در وضعیت «{cr.get_status_display()}» قابل تصویب مدیر نیست.'}, status=status.HTTP_400_BAD_REQUEST)

        # DEF-06: اعمال تغییرات فقط از منبع واحد و با سریالایزر؛ اگر نامعتبر باشد ۴۰۰ و درخواست معلق می‌ماند
        try:
            with transaction.atomic():
                personnel = apply_personnel_change_request(cr, request=request)
                previous_status = cr.status
                now = timezone.now()
                cr.status = 'approved'
                cr.manager_reviewed_by = user
                cr.manager_reviewed_at = now
                if not cr.supervisor_reviewed_by:
                    cr.supervisor_reviewed_by = user
                    cr.supervisor_reviewed_at = now
                if not cr.accountant_reviewed_by:
                    cr.accountant_reviewed_by = user
                    cr.accountant_reviewed_at = now
                cr.save()
                refresh_has_pending_changes(personnel)
                log_change_request_event(
                    cr, user, 'change_request_applied',
                    reason=(request.data.get('note') or '').strip() or 'تصویب و اعمال درخواست تغییرات توسط مدیر',
                    extra={'diff': cr.proposed_changes, 'old_diff': cr.previous_values, 'from_change_request_status': previous_status},
                )
        except PersonnelWorkflowError as e:
            return Response(e.to_response_data(), status=e.status_code)

        broadcast_personnel_update(personnel, action_type='updated', message=f'درخواست تغییرات پرسنل «{personnel.full_name}» تصویب و اعمال شد.', sender_id=user.id)
        return Response({'message': 'درخواست تغییرات توسط مدیر تصویب و روی پرونده پرسنل اعمال گردید.', 'data': self.get_serializer(cr).data})

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        from ..lifecycle_services import (
            FINANCE_STAGE_PERMS,
            MANAGER_STAGE_PERMS,
            SUPERVISOR_STAGE_PERMS,
            log_change_request_event,
            refresh_has_pending_changes,
            user_has_any_perm,
        )
        user = request.user
        if not user_has_any_perm(user, SUPERVISOR_STAGE_PERMS + FINANCE_STAGE_PERMS + MANAGER_STAGE_PERMS):
            raise PermissionDenied("دسترسی رد این درخواست را ندارید.")

        reason = request.data.get('reason', '').strip()
        cr = self.get_object()
        if cr.status in ('approved', 'rejected', 'cancelled'):
            return Response({'error': f'درخواست در وضعیت «{cr.get_status_display()}» قابل رد نیست.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            cr.status = 'rejected'
            cr.rejection_reason = reason
            cr.save()
            refresh_has_pending_changes(cr.personnel)
            log_change_request_event(cr, user, 'change_request_rejected', reason=reason)

        return Response({'message': 'درخواست تغییرات رد شد.', 'data': self.get_serializer(cr).data})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        from ..lifecycle_services import log_change_request_event, refresh_has_pending_changes
        cr = self.get_object()
        user = request.user
        if not (user.is_superuser or cr.requested_by_id == user.id):
            raise PermissionDenied("تنها کاربر ثبت‌کننده درخواست یا مدیر سیستم مجاز به انصراف و لغو درخواست تغییرات است.")

        # DEF-16: ابطال فقط تا پیش از تایید سرپرست
        if cr.status not in ('draft', 'pending_supervisor', 'revision_required'):
            return Response(
                {'error': f'درخواست در وضعیت «{cr.get_status_display()}» قابل لغو نیست؛ ابطال فقط تا پیش از تایید سرپرست ممکن است.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = (request.data.get('reason') or 'لغو شده توسط ثبت‌کننده').strip()
        with transaction.atomic():
            cr.status = 'cancelled'
            cr.rejection_reason = reason
            cr.save(update_fields=['status', 'rejection_reason'])
            refresh_has_pending_changes(cr.personnel)
            # ثبت مستقیم در لاگ ممیزی گردش کار، روی تایملاین همان پرونده
            log_change_request_event(cr, user, 'change_request_cancelled', reason=reason)

        return Response({
            'message': 'درخواست تغییرات با موفقیت لغو شد.',
            'data': self.get_serializer(cr).data
        })

__all__ = [
    'PersonnelProfileViewSet',
    'PersonnelChangeRequestViewSet',
]
