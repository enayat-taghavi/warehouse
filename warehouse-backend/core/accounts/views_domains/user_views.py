# -*- coding: utf-8 -*-
"""
User management and table view state ViewSets.
"""
import csv
from io import StringIO
from django.contrib.auth.models import Group, Permission
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.mixins import DeleteImpactMixin
from common.excel_utils import sanitize_excel_row

from ..models import CustomUser, UserTableViewState
from ..serializers import UserSerializer, UserDirectorySerializer, UserTableViewStateSerializer
from .helpers import OptionalPageNumberPagination

class UserViewSet(DeleteImpactMixin, viewsets.ModelViewSet):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    pagination_class = OptionalPageNumberPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    FULL_SEARCH_FIELDS = ['username', 'first_name', 'last_name', 'national_code', 'phone_number', 'company', 'operational_zone']
    DIRECTORY_SEARCH_FIELDS = ['username', 'first_name', 'last_name']
    ordering_fields = ['id', 'username', 'first_name', 'last_name', 'date_joined', 'last_login']
    ordering = ['-id']
    filterset_fields = ['is_active', 'company', 'operational_zone']

    def get_queryset(self):
        from django.apps import apps
        from django.db.models import Q

        qs = CustomUser.objects.all().select_related('supervisor')
        prefetch_items = ['groups__customrole', 'user_permissions']
        if apps.is_installed('warehouses'):
            prefetch_items.append('assigned_warehouses')
        prefetch_items.append('company_accesses__company')
        qs = qs.prefetch_related(*prefetch_items)

        user = self.request.user
        from companies.access import get_user_allowed_companies

        # تفکیک چندشرکتی اختیاری بر مبنای کوئری‌پارامتر یا فیلتر دسترسی سازمانی
        company_id_param = self.request.query_params.get('company_id')
        if self._is_org_admin_directory():
            qs = self._org_admin_directory_queryset(qs, user, get_user_allowed_companies)
        elif company_id_param and company_id_param.isdigit():
            cid = int(company_id_param)
            if user and user.is_authenticated and not user.is_superuser and get_user_allowed_companies is not None:
                # شرکت درخواستی باید از شرکت‌های مجاز کاربر باشد
                if cid not in set(get_user_allowed_companies(user).values_list('id', flat=True)):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('شما به کاربران این شرکت دسترسی ندارید.')
            qs = qs.filter(Q(company_accesses__company_id=cid) | Q(is_superuser=True)).distinct()
        elif user and user.is_authenticated and not user.is_superuser:
            # کاربر عادی بدون فیلتر صریح: فقط کاربران شرکت‌های مشترک مجاز را مشاهده می‌کند
            from accounts.scope import get_visible_users_for_user
            qs = get_visible_users_for_user(user, qs=qs)

        has_perm = self.request.query_params.get('has_perm')
        if has_perm:
            qs = qs.filter(
                Q(user_permissions__codename=has_perm) |
                Q(groups__permissions__codename=has_perm)
            ).distinct()

        if user and user.is_authenticated:
            # Hide superusers from non-superuser users
            if not user.is_superuser:
                qs = qs.exclude(is_superuser=True)
        return qs

    @property
    def search_fields(self):
        # فهرست کمینهٔ راهبر تشکیلات نباید با جستجو کد ملی یا تلفن اعضا را حرف‌به‌حرف لو بدهد
        if getattr(self, 'request', None) is not None and self._is_org_admin_directory():
            return self.DIRECTORY_SEARCH_FIELDS
        return self.FULL_SEARCH_FIELDS

    def _is_org_admin_directory(self):
        """
        فهرست کاربران برای راهبر تشکیلاتی که view_sys_users ندارد (کشوی انتساب به بخش):
        فقط کاربران شرکت‌های مجاز خودش و فقط فیلدهای کمینه.
        """
        user = self.request.user
        # action فقط در چرخهٔ درخواست DRF ست می‌شود (نگهبان ۴۹ ویوست را دستی می‌سازد)
        return bool(
            getattr(self, 'action', None) == 'list' and user and user.is_authenticated and not user.is_superuser
            and not user.has_perm('accounts.view_sys_users')
            and user.has_perm('accounts.perm_manage_projects_sections')
        )

    def _org_admin_directory_queryset(self, qs, user, get_user_allowed_companies):
        from django.db.models import Q
        from rest_framework.exceptions import PermissionDenied

        if get_user_allowed_companies is None:
            return qs.filter(id=user.id)
        allowed_cids = set(get_user_allowed_companies(user).values_list('id', flat=True))
        company_id_param = self.request.query_params.get('company_id')
        if company_id_param:
            if not company_id_param.isdigit() or int(company_id_param) not in allowed_cids:
                raise PermissionDenied('شما به کاربران این شرکت دسترسی ندارید.')
            allowed_cids = {int(company_id_param)}
        # عضو شرکت = دسترسی صریح workspace_full یا انتساب فعال در بخش‌های پروژه‌های همان شرکت
        members = Q(company_accesses__company_id__in=allowed_cids, company_accesses__access_level='workspace_full') | Q(id=user.id)
        from django.apps import apps
        if apps.is_installed('personnel'):
            members |= Q(section_assignments__is_active=True, section_assignments__section__project__company_id__in=allowed_cids)
        return qs.filter(members).distinct()

    def get_serializer_class(self):
        if self._is_org_admin_directory():
            return UserDirectorySerializer
        return super().get_serializer_class()

    def get_permissions(self):
        from rest_framework.permissions import IsAuthenticated, AllowAny
        from ..permissions import HasMenuAccess
        
        if self.action == 'verify_card':
            permission_classes = [AllowAny()]
        elif self.action in ['change_password', 'update_preferences', 'my_avatar']:
            permission_classes = [IsAuthenticated()]
        elif self.action == 'list':
            # راهبر تشکیلات برای انتساب کاربران به بخش‌ها فقط فهرست را می‌بیند (بدون ویرایش)
            permission_classes = [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_manage_projects_sections')]
        elif self.action in ['retrieve', 'export_excel', 'download_template']:
            permission_classes = [HasMenuAccess('view_sys_users')]
        elif self.action in ['create', 'import_excel']:
            permission_classes = [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_usr_add')]
        else: # update, partial_update, destroy, toggle_status, user_avatar
            permission_classes = [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_usr_edit')]
            
        return permission_classes

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle
        if self.action == 'verify_card':
            self.throttle_scope = 'verify_card'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def _validate_user_deactivation(self, request, user, action_name="حذف"):
        from rest_framework.exceptions import ValidationError
        from django.db.models import Q
        from django.contrib.auth.models import Permission
        
        # 1. Self-deletion guard
        if request.user.id == user.id:
            raise ValidationError(f"شما نمی‌توانید حساب کاربری خود را {action_name} کنید.")
            
        # 2. Protect last active superuser
        if user.is_superuser:
            active_superusers = CustomUser.objects.filter(
                is_active=True, is_superuser=True
            ).exclude(id=user.id).count()
            
            if active_superusers == 0:
                raise ValidationError(f"امکان {action_name} تنها مدیر (Admin) فعال سیستم وجود ندارد.")
                
        # 3. Protect last key roles
        KEY_PERMISSIONS = {
            'can_act_as_counter': 'انبارگردان',
            'can_act_as_supervisor': 'سرپرست انبار',
            'can_act_as_manager': 'مدیر انبار',
            'can_act_as_doc_worker': 'کارشناس اسناد',
            'can_act_as_doc_supervisor': 'سرپرست اسناد'
        }
        
        user_perms = set(
            user.user_permissions.filter(codename__in=KEY_PERMISSIONS.keys()).values_list('codename', flat=True)
        ) | set(
            Permission.objects.filter(group__user=user, codename__in=KEY_PERMISSIONS.keys()).values_list('codename', flat=True)
        )

        for perm in user_perms:
            other_active_users = CustomUser.objects.filter(
                is_active=True
            ).exclude(id=user.id).filter(
                Q(user_permissions__codename=perm) | 
                Q(groups__permissions__codename=perm)
            ).count()
            
            if other_active_users == 0:
                role_name = KEY_PERMISSIONS.get(perm, perm)
                raise ValidationError(f"امکان {action_name} این کاربر وجود ندارد. سیستم باید حداقل یک کاربر فعال با دسترسی «{role_name}» داشته باشد.")

    def _get_user_audit_state(self, user):
        """تهیه دیکشنری جامع از وضعیت کاربر جهت ثبت دقیق تغییرات در لاگ ممیزی"""
        if not user or not hasattr(user, 'id'):
            return {}

        roles = []
        for g in user.groups.all():
            try:
                cr = g.customrole
                roles.append(cr.title or cr.name)
            except Exception:
                roles.append(g.name)
        roles.sort()

        warehouses = []
        if hasattr(user, 'assigned_warehouses'):
            warehouses = list(user.assigned_warehouses.values_list('name', flat=True))
            warehouses.sort()

        direct_perms = list(user.user_permissions.values_list('codename', flat=True))
        direct_perms.sort()

        return {
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email or '',
            'phone_number': user.phone_number or '',
            'national_code': user.national_code or '',
            'company': user.company or '',
            'address': user.address or '',
            'operational_zone': user.operational_zone or '',
            'blood_type': user.blood_type or '',
            'emergency_contact': user.emergency_contact or '',
            'supervisor': f"{user.supervisor.first_name} {user.supervisor.last_name}".strip() if user.supervisor else None,
            'is_active': user.is_active,
            'is_superuser': user.is_superuser,
            'roles': roles,
            'warehouses': warehouses,
            'direct_permissions': direct_perms,
        }

    def perform_create(self, serializer):
        from ..audit_utils import log_audit_event
        from rest_framework.exceptions import PermissionDenied
        user_permissions = serializer.validated_data.get('user_permissions', [])
        if user_permissions and not (self.request.user and self.request.user.is_superuser):
            from ..models import SENSITIVE_PERMISSION_CODENAMES
            assigned_codenames = set(
                Permission.objects.filter(id__in=[p.id if hasattr(p, 'id') else p for p in user_permissions])
                .values_list('codename', flat=True)
            )
            if assigned_codenames.intersection(SENSITIVE_PERMISSION_CODENAMES):
                raise PermissionDenied("تنها مدیر ارشد سامانه (Superuser) مجاز به اعطا یا تغییر دسترسی‌های حساس است.")

        instance = serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)
        try:
            log_audit_event(
                module='users',
                action='CREATE',
                severity='warning',
                target_model='CustomUser',
                target_object_id=instance.id,
                target_repr=f"{instance.username} ({instance.first_name} {instance.last_name})".strip(),
                user=self.request.user if self.request.user.is_authenticated else None,
                after_state=self._get_user_audit_state(instance)
            )
        except Exception:
            pass

    def perform_update(self, serializer):
        from ..audit_utils import log_audit_event, calculate_model_diff
        from rest_framework.exceptions import PermissionDenied
        user_permissions = serializer.validated_data.get('user_permissions', None)
        if user_permissions is not None and not (self.request.user and self.request.user.is_superuser):
            from ..models import SENSITIVE_PERMISSION_CODENAMES
            assigned_codenames = set(
                Permission.objects.filter(id__in=[p.id if hasattr(p, 'id') else p for p in user_permissions])
                .values_list('codename', flat=True)
            )
            if assigned_codenames.intersection(SENSITIVE_PERMISSION_CODENAMES):
                raise PermissionDenied("تنها مدیر ارشد سامانه (Superuser) مجاز به اعطا یا تغییر دسترسی‌های حساس است.")

        old_instance = self.get_object()
        new_is_active = serializer.validated_data.get('is_active', None)
        if old_instance.is_active and new_is_active is False:
            self._validate_user_deactivation(self.request, old_instance, action_name="غیرفعال‌سازی")

        before_state = self._get_user_audit_state(old_instance)
        instance = serializer.save(modified_by=self.request.user if self.request.user.is_authenticated else None)
        after_state = self._get_user_audit_state(instance)
        diff_b, diff_a = calculate_model_diff(before_state, after_state)
        if diff_b or diff_a:
            is_security_change = bool(
                (diff_a and any(k in diff_a for k in ('is_superuser', 'direct_permissions', 'roles', 'is_active', 'warehouses'))) or
                (diff_b and any(k in diff_b for k in ('is_superuser', 'direct_permissions', 'roles', 'is_active', 'warehouses')))
            )
            try:
                log_audit_event(
                    module='users',
                    action='UPDATE',
                    severity='critical' if is_security_change else 'warning',
                    target_model='CustomUser',
                    target_object_id=instance.id,
                    target_repr=f"{instance.username} ({instance.first_name} {instance.last_name})".strip(),
                    user=self.request.user if self.request.user.is_authenticated else None,
                    before_state=diff_b,
                    after_state=diff_a
                )
            except Exception:
                pass

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        self._validate_user_deactivation(request, user, action_name="حذف")
        user_id = user.id
        user_repr = f"{user.username} ({user.first_name} {user.last_name})".strip()
        before_state = self._get_user_audit_state(user)

        response = super().destroy(request, *args, **kwargs)

        from ..audit_utils import log_audit_event
        try:
            log_audit_event(
                module='users',
                action='DELETE',
                severity='critical',
                target_model='CustomUser',
                target_object_id=user_id,
                target_repr=user_repr,
                user=request.user if request.user.is_authenticated else None,
                before_state=before_state
            )
        except Exception:
            pass
        return response

    @action(detail=True, methods=['patch'])
    def toggle_status(self, request, pk=None):
        user = self.get_object()
        from rest_framework.exceptions import ValidationError
        from ..audit_utils import log_audit_event
        
        target_active = request.data.get('is_active') if hasattr(request.data, 'get') else None
        if target_active is not None:
            if isinstance(target_active, str):
                new_active = target_active.strip().lower() in ('true', '1', 'yes')
            else:
                new_active = bool(target_active)
        else:
            new_active = not user.is_active

        # If user is currently active and is being deactivated
        if user.is_active and not new_active:
            self._validate_user_deactivation(request, user, action_name="غیرفعال‌سازی")
                    
        old_active = user.is_active
        user.is_active = new_active
        if not new_active:
            from django.utils import timezone
            user.password_changed_at = timezone.now()
            self._revoke_user_sessions_and_tokens(user)
        user.save()

        try:
            log_audit_event(
                module='users',
                action='UPDATE',
                severity='critical' if not user.is_active else 'warning',
                target_model='CustomUser',
                target_object_id=user.id,
                target_repr=f"{user.username} ({'فعال‌سازی' if user.is_active else 'غیرفعال‌سازی'})",
                user=request.user if request.user.is_authenticated else None,
                before_state={'is_active': old_active},
                after_state={'is_active': user.is_active}
            )
        except Exception:
            pass

        return Response({'status': 'success', 'is_active': user.is_active})

    def _revoke_user_sessions_and_tokens(self, user):
        """
        ابطال فوری و سراسری کلیه نشست‌های دستگاه‌ها و بلک‌لیست کردن توکن‌های فعال کاربر
        """
        from ..models import UserDeviceSession
        UserDeviceSession.objects.filter(user=user).update(is_revoked=True)

        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            outstanding_tokens = OutstandingToken.objects.filter(user=user)
            for token in outstanding_tokens:
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        user = request.user
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        
        if not user.check_password(old_password):
            return Response({'error': 'رمز عبور فعلی نادرست است.'}, status=400)
            
        if new_password == '123456':
            return Response({'error': 'استفاده از رمز عبور پیش‌فرض (123456) مجاز نیست.'}, status=400)
            
        from django.utils import timezone
        user.set_password(new_password)
        user.requires_password_change = False
        user.password_changed_at = timezone.now()
        user.save()

        from ..audit_utils import log_audit_event
        log_audit_event(
            user=user,
            module='users',
            action='UPDATE',
            severity='warning',
            target_model='CustomUser',
            target_object_id=user.id,
            target_repr=f"تغییر رمز عبور کاربر {user.username}",
            details={'reason': 'تغییر کلمه عبور توسط خود کاربر'},
            ip_address=getattr(request, 'META', {}).get('REMOTE_ADDR')
        )
        
        return Response({'success': True, 'message': 'رمز عبور با موفقیت تغییر یافت.'})

    @action(detail=True, methods=['post'])
    def admin_reset_password(self, request, pk=None):
        from django.utils import timezone
        user = self.get_object()
        user.set_password('123456')
        user.requires_password_change = True
        user.password_changed_at = timezone.now()
        user.save()

        # ابطال کلیه نشست‌های دستگاه‌ها و بلک‌لیست توکن‌های فعال
        self._revoke_user_sessions_and_tokens(user)

        from ..audit_utils import log_audit_event
        log_audit_event(
            user=request.user,
            module='users',
            action='UPDATE',
            severity='warning',
            target_model='CustomUser',
            target_object_id=user.id,
            target_repr=f"بازنشانی رمز عبور کاربر {user.username} توسط مدیر و ابطال نشست‌ها",
            details={'target_user_id': user.id, 'target_username': user.username},
            ip_address=getattr(request, 'META', {}).get('REMOTE_ADDR')
        )
            
        return Response({'success': True, 'message': 'رمز عبور با موفقیت به مقدار پیش‌فرض تغییر یافت و کلیه نشست‌ها و توکن‌های فعال کاربر ابطال شدند.'})

    @action(detail=False, methods=['post'])
    def update_preferences(self, request):
        user = request.user
        prefs = request.data.get('preferences', {})
        if isinstance(prefs, dict):
            # Update specific keys instead of overriding completely
            if not isinstance(user.ui_preferences, dict):
                user.ui_preferences = {}
            user.ui_preferences.update(prefs)
            user.save()
            return Response({'status': 'success', 'preferences': user.ui_preferences})
        return Response({'error': 'Invalid preferences format'}, status=400)

    @action(detail=False, methods=['post', 'delete'], url_path='me/avatar')
    def my_avatar(self, request):
        """Update or delete the authenticated user's own avatar."""
        from ..avatar_utils import process_and_optimize_avatar, delete_user_avatar_file
        user = request.user
        
        if request.method == 'DELETE':
            delete_user_avatar_file(user)
            user.avatar = None
            user.save()
            return Response({'success': True, 'avatar': None, 'message': 'تصویر پروفایل با موفقیت حذف شد.'})
            
        avatar_file = request.FILES.get('avatar')
        if not avatar_file:
            return Response({'error': 'فایل تصویری ارسال نشده است.'}, status=400)

        if avatar_file.size > 5 * 1024 * 1024:
            return Response({'error': 'حجم فایل تصویر نباید بیش از ۵ مگابایت باشد.'}, status=400)
            
        try:
            optimized_file = process_and_optimize_avatar(avatar_file)
            delete_user_avatar_file(user)
            user.avatar = optimized_file
            user.save()
            return Response({
                'success': True,
                'avatar': user.avatar.url,
                'message': 'تصویر پروفایل با موفقیت بروزرسانی شد.'
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post', 'delete'], url_path='avatar')
    def user_avatar(self, request, pk=None):
        """Update or delete avatar for a specific user (admin action)."""
        from ..avatar_utils import process_and_optimize_avatar, delete_user_avatar_file
        user = self.get_object()
        
        if request.method == 'DELETE':
            delete_user_avatar_file(user)
            user.avatar = None
            user.save()
            return Response({'success': True, 'avatar': None, 'message': 'تصویر کاربر با موفقیت حذف شد.'})
            
        avatar_file = request.FILES.get('avatar')
        if not avatar_file:
            return Response({'error': 'فایل تصویری ارسال نشده است.'}, status=400)

        if avatar_file.size > 5 * 1024 * 1024:
            return Response({'error': 'حجم فایل تصویر نباید بیش از ۵ مگابایت باشد.'}, status=400)
            
        try:
            optimized_file = process_and_optimize_avatar(avatar_file)
            delete_user_avatar_file(user)
            user.avatar = optimized_file
            user.save()
            return Response({
                'success': True,
                'avatar': user.avatar.url,
                'message': 'تصویر کاربر با موفقیت بروزرسانی شد.'
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Download all users as an Excel file, optionally filtered by user IDs."""
        from ..excel_utils import generate_users_excel
        queryset = self.get_queryset()
        ids_param = request.GET.get('ids')
        if ids_param:
            try:
                ids = [int(i.strip()) for i in ids_param.split(',') if i.strip()]
                if ids:
                    queryset = queryset.filter(id__in=ids)
            except Exception:
                pass
        return generate_users_excel(queryset)

    @action(detail=False, methods=['get'])
    def export_id_cards_excel(self, request):
        """Download ID cards data as an Excel file, optionally filtered by user IDs."""
        from ..excel_utils import generate_id_cards_excel
        queryset = self.get_queryset()
        ids_param = request.GET.get('ids')
        if ids_param:
            try:
                ids = [int(i.strip()) for i in ids_param.split(',') if i.strip()]
                if ids:
                    queryset = queryset.filter(id__in=ids)
            except Exception:
                pass
        return generate_id_cards_excel(queryset)

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        """Download an empty Excel template with sample data."""
        from ..excel_utils import generate_users_template
        return generate_users_template(actor=request.user)

    @action(detail=False, methods=['post'])
    def import_excel(self, request):
        """Upload an Excel file and bulk-create or update users."""
        from ..excel_utils import parse_users_excel
        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'errors': [{'row': 0, 'field': 'file', 'message': 'فایلی انتخاب نشده است.'}]}, status=400)

        if not file.name.endswith('.xlsx'):
            return Response({'success': False, 'errors': [{'row': 0, 'field': 'file', 'message': 'فقط فایل‌های با فرمت xlsx پشتیبانی می‌شوند.'}]}, status=400)

        # استخراج و اعتبارسنجی شرکت فعال سازنده
        from companies.access import get_request_company_id, validate_user_company_access
        company_id_raw = get_request_company_id(request)
        cid = None
        if company_id_raw:
            try:
                cid = validate_user_company_access(request.user, company_id_raw)
            except Exception as e:
                return Response({'success': False, 'errors': [{'row': 0, 'field': 'company', 'message': str(e)}]}, status=400)
        elif request.user and request.user.is_authenticated and not request.user.is_superuser:
            return Response({'success': False, 'errors': [{'row': 0, 'field': 'company', 'message': 'برای ورود کاربران از اکسل باید یک شرکت فعال انتخاب شده باشد.'}]}, status=400)

        update_existing = request.POST.get('update_existing') in ('true', 'True', True, '1', 1) or request.data.get('update_existing') in ('true', 'True', True, '1', 1)
        dry_run = request.POST.get('dry_run') in ('true', 'True', True, '1', 1) or request.data.get('dry_run') in ('true', 'True', True, '1', 1)
        result = parse_users_excel(file, update_existing=update_existing, actor=request.user, active_company_id=cid)

        # If there are file-level errors (row=0), return immediately
        file_errors = [e for e in result['errors'] if e['row'] == 0]
        if file_errors:
            return Response({'success': False, 'summary': {'total_rows': 0, 'created': 0, 'updated': 0, 'skipped': 0}, 'errors': file_errors}, status=400)

        error_rows_set = set(e['row'] for e in result['errors'] if e['row'] > 0)
        total_rows = len(result['valid_rows']) + len(error_rows_set)

        # ── حالت پیش‌نمایش و اعتبارسنجی اولیه (Dry-Run) ──
        if dry_run:
            preview_rows = []
            for r in result['valid_rows'][:25]:
                roles_display = '، '.join([
                    getattr(g, 'customrole', g).title if hasattr(g, 'customrole') and getattr(g.customrole, 'title', None) else g.name
                    for g in r.get('roles', [])
                ])
                wh_display = '، '.join([w.name for w in r.get('warehouses', [])])
                preview_rows.append({
                    'row': r.get('_row_num'),
                    'name': f"{r.get('first_name', '')} {r.get('last_name', '')}",
                    'username': r.get('username', ''),
                    'national_code': r.get('national_code', '') or '-',
                    'phone_number': r.get('phone_number', '') or '-',
                    'roles': roles_display or 'بدون نقش',
                    'warehouses': wh_display or 'بدون انبار',
                    'is_update': r.get('is_update', False),
                    'is_active': r.get('is_active', True),
                })

            return Response({
                'success': True,
                'dry_run': True,
                'summary': {
                    'total_rows': total_rows,
                    'valid_count': len(result['valid_rows']),
                    'error_count': len(error_rows_set),
                    'created': 0,
                    'updated': 0,
                    'skipped': len(error_rows_set),
                },
                'preview_rows': preview_rows,
                'errors': result['errors']
            })

        # ── حالت ثبت نهایی (Commit): ثبت رکوردهای سالم به صورت اتمیک ──
        created_count = 0
        updated_count = 0
        commit_errors = list(result.get('errors', []))

        from accounts.scope import get_visible_users_for_user
        from ..excel_utils import (
            _get_user_warehouse_extension, target_company_ids_for_warehouses, warehouses_outside_companies,
        )
        wh_ext = _get_user_warehouse_extension()
        allowed_warehouses = set(wh_ext.get_all_warehouses(user=request.user)) if wh_ext else set()

        try:
            with transaction.atomic():
                for row_data in result['valid_rows']:
                    row_num = row_data.pop('_row_num', None)
                    is_update = row_data.pop('is_update', False)
                    user_id = row_data.pop('user_id', None)
                    roles = row_data.pop('roles', [])
                    warehouses = row_data.pop('warehouses', [])

                    # فیلتر انبارهای غیرمجاز در زمان ثبت
                    if warehouses and wh_ext:
                        warehouses = [w for w in warehouses if w in allowed_warehouses]

                    if is_update and user_id:
                        visible_qs = get_visible_users_for_user(request.user) if not request.user.is_superuser else CustomUser.objects.all()
                        user = visible_qs.filter(id=user_id).first()
                        if not user:
                            commit_errors.append({'row': row_num, 'field': 'username', 'message': 'کاربر هدف در قلمرو مجاز شما نیست.'})
                            continue
                        outside = warehouses_outside_companies(warehouses, target_company_ids_for_warehouses(user))
                        if outside:
                            commit_errors.append({'row': row_num, 'field': 'warehouses', 'message': f'انبار «{outside[0].name}» متعلق به شرکت دیگری است و به شرکت‌های این کاربر تعلق ندارد.'})
                            continue
                        for k, v in row_data.items():
                            setattr(user, k, v)
                        if request.user and request.user.is_authenticated:
                            user.modified_by = request.user
                        user.save()
                        # همگام‌سازی قطعی دسترسی‌ها (خالی بودن ستون در اکسل باعث پاک شدن دسترسی‌ها می‌شود)
                        user.groups.set(roles)
                        if hasattr(user, 'assigned_warehouses'):
                            # فقط بخشِ درون دامنهٔ سازنده جایگزین می‌شود؛ انبارهای بیرون از دامنهٔ او دست‌نخورده می‌مانند
                            kept = [w for w in user.assigned_warehouses.all() if wh_ext and w not in allowed_warehouses]
                            user.assigned_warehouses.set(kept + list(warehouses))
                        updated_count += 1
                        continue

                    outside = warehouses_outside_companies(warehouses, target_company_ids_for_warehouses(None, cid))
                    if outside:
                        commit_errors.append({'row': row_num, 'field': 'warehouses', 'message': f'انبار «{outside[0].name}» متعلق به شرکت دیگری است و به شرکت فعال شما تعلق ندارد.'})
                        continue

                    password = row_data.get('national_code') or '123456'
                    user = CustomUser(**row_data)
                    user.set_password(password)
                    user.requires_password_change = True
                    if request.user and request.user.is_authenticated:
                        user.created_by = request.user
                    user.save()

                    user.groups.set(roles)
                    if hasattr(user, 'assigned_warehouses'):
                        user.assigned_warehouses.set(warehouses)

                    # ایجاد دسترسی شرکت برای کاربر جدید
                    if cid:
                        from companies.models import UserCompanyAccess
                        UserCompanyAccess.objects.update_or_create(
                            user=user,
                            company_id=cid,
                            defaults={'access_level': 'workspace_full'}
                        )
                    created_count += 1

                from ..audit_utils import log_audit_event
                log_audit_event(
                    user=request.user,
                    module='users',
                    action='IMPORT',
                    severity='info',
                    target_model='CustomUser',
                    target_repr=f"بارگذاری اکسل پرسنل ({created_count} ایجاد، {updated_count} ویرایش)",
                    details={'total_rows': total_rows, 'created': created_count, 'updated': updated_count, 'skipped': len(error_rows_set)},
                    ip_address=getattr(request, 'META', {}).get('REMOTE_ADDR')
                )
        except Exception as e:
            return Response({
                'success': False,
                'summary': {'total_rows': total_rows, 'created': 0, 'updated': 0, 'skipped': total_rows},
                'errors': [{'row': 0, 'field': 'database', 'message': f'خطا در ذخیره‌سازی پایگاه‌داده (تراکنش کاملاً رول‌بک شد): {str(e)}'}]
            }, status=400)

        return Response({
            'success': True,
            'dry_run': False,
            'summary': {
                'total_rows': total_rows,
                'created': created_count,
                'updated': updated_count,
                'skipped': len(error_rows_set)
            },
            'errors': commit_errors
        })

    @action(detail=False, methods=['get'], url_path='verify_card')
    def verify_card(self, request):
        """Public verification endpoint for personnel ID card scanning."""
        code = request.query_params.get('code', '').strip().upper()
        user_id = None
        if code.startswith('EMP-'):
            try:
                user_id = int(code[4:]) - 1000
            except ValueError:
                pass

        if user_id is None or user_id <= 0:
            return Response({
                'valid': False,
                'message': 'فرمت شناسه کارت شناسایی نامعتبر است یا در سامانه یافت نشد.'
            }, status=404)

        user = CustomUser.objects.filter(id=user_id).first()
        if not user:
            return Response({
                'valid': False,
                'message': 'پرسنل با این شناسه در سامانه یافت نشد یا باطل شده است.'
            }, status=404)

        def mask_national_code(val):
            if not val:
                return None
            val = str(val).strip()
            if len(val) >= 8:
                return val[:3] + '****' + val[-3:]
            return '****'

        def mask_phone(val):
            if not val:
                return None
            val = str(val).strip()
            if len(val) >= 7:
                return val[:4] + '****' + val[-3:]
            return '****'

        roles = []
        for g in user.groups.all():
            try:
                cr = g.customrole
                roles.append({'id': cr.id, 'title': cr.title or cr.name, 'color': cr.color or '#4f46e5'})
            except Exception:
                roles.append({'id': g.id, 'title': g.name, 'color': '#4f46e5'})

        wh_names = []
        if hasattr(user, 'assigned_warehouses'):
            try:
                wh_names = list(user.assigned_warehouses.values_list('name', flat=True))
            except Exception:
                wh_names = []

        avatar_url = user.avatar.url if user.avatar else None

        return Response({
            'valid': True,
            'is_active': user.is_active,
            'id': user.id,
            'personnel_code': f"EMP-{1000 + user.id}",
            'first_name': user.first_name,
            'last_name': user.last_name,
            'national_code': mask_national_code(user.national_code),
            'phone_number': mask_phone(user.phone_number),
            'operational_zone': user.operational_zone or None,
            'company': user.company or None,
            'avatar': avatar_url,
            'blood_type': user.blood_type or None,
            'emergency_contact': mask_phone(user.emergency_contact) if user.emergency_contact else None,
            'roles': roles,
            'assigned_warehouses': wh_names
        })

class UserTableViewStateViewSet(viewsets.ModelViewSet):
    serializer_class = UserTableViewStateSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        # Only return views for the current user
        qs = UserTableViewState.objects.filter(user=self.request.user)
        table_name = self.request.query_params.get('table_name')
        if table_name:
            qs = qs.filter(table_name=table_name)
        return qs

    @action(detail=True, methods=['post'])
    def set_last_selected(self, request, pk=None):
        view_state = self.get_object()
        
        # Reset others for the same table
        UserTableViewState.objects.filter(
            user=request.user, 
            table_name=view_state.table_name
        ).update(is_last_selected=False)
        
        # Set this one
        view_state.is_last_selected = True
        view_state.save()
        
        return Response({'status': 'success', 'message': 'نمای انتخاب شده با موفقیت ذخیره شد.'})

__all__ = [
    'UserViewSet',
    'UserTableViewStateViewSet',
]
