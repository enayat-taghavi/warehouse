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
from platform_core.registry import contributions

from ..models import CustomUser, UserTableViewState
from ..serializers import UserSerializer, UserDirectorySerializer, UserTableViewStateSerializer
from ..excel_utils import _get_user_warehouse_extension
from .helpers import OptionalPageNumberPagination


def _projects_writer_company_ids(user):
    """
    شرکت‌هایی که کاربر «پروژه‌ها و بخش‌ها» را در آن‌ها می‌نویسد (طرح Project_Section_To_Core، ت۲):
    جانشین مجوز قدیمی راهبر تشکیلات برای فهرست کمینهٔ کاربران در کشوی انتساب به بخش.
    """
    from companies.access import companies_with_section
    return set(companies_with_section(user, 'projects', 'write').values_list('id', flat=True))


class ProjectsWriterDirectoryAccess(permissions.BasePermission):
    """action list کاربران برای نویسندهٔ «پروژه‌ها و بخش‌ها» در دست‌کم یک شرکت (فقط فهرست کمینه)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and _projects_writer_company_ids(user))

    def __or__(self, other):
        from ..permissions import OrPermission
        return OrPermission(self, other)


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
        from django.db.models import Q

        qs = CustomUser.objects.all().select_related('supervisor')
        prefetch_items = ['groups__customrole', 'user_permissions']
        for ext in contributions('user_extensions'):
            prefetch_items.extend(getattr(ext, 'user_prefetch_related', ()))
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
        # S11: فهرست کمینهٔ راهبر تشکیلات با فیلتر مجوز، دارندگان مجوزها را لو نمی‌دهد
        if has_perm and not self._is_org_admin_directory():
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
            and (any(user.has_perm(f'accounts.{p}') for p in contributions('user_directory_perms'))
                 or _projects_writer_company_ids(user))
        )

    def _org_admin_directory_queryset(self, qs, user, get_user_allowed_companies):
        from django.db.models import Q
        from rest_framework.exceptions import PermissionDenied

        if get_user_allowed_companies is None:
            return qs.filter(id=user.id)
        allowed_cids = set(get_user_allowed_companies(user).values_list('id', flat=True))
        # نویسندهٔ «پروژه‌ها و بخش‌ها» (حتی بی عضویت، در حالت محدود استودیو) کاربران همان شرکت‌ها را برای انتساب می‌بیند
        allowed_cids |= _projects_writer_company_ids(user)
        company_id_param = self.request.query_params.get('company_id')
        if company_id_param:
            if not company_id_param.isdigit() or int(company_id_param) not in allowed_cids:
                raise PermissionDenied('شما به کاربران این شرکت دسترسی ندارید.')
            allowed_cids = {int(company_id_param)}
        # عضو شرکت = دسترسی صریح workspace_full یا سازنده‌های شرط عضویتی ماژول‌ها
        members = Q(company_accesses__company_id__in=allowed_cids) | Q(id=user.id)
        for builder in contributions('company_member_q_builders'):
            builder_q = builder(allowed_cids)
            if builder_q is not None:
                members |= builder_q
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
            # مجوزهای دایرکتوری کاربران که ماژول‌ها اعلام کرده‌اند (contribute('user_directory_perms', ...))
            from ..permissions import any_menu_access
            permission_classes = [any_menu_access('view_sys_users', *contributions('user_directory_perms'))
                                  | ProjectsWriterDirectoryAccess()]
        elif self.action in ['retrieve', 'export_excel', 'export_id_cards_excel', 'download_template']:
            permission_classes = [HasMenuAccess('view_sys_users')]
        elif self.action in ['create', 'import_excel']:
            # طرح ۲.۹: `view_sys_users` تنها فقط خواندن است؛ نوشتن مجوز صریح می‌خواهد
            permission_classes = [HasMenuAccess('perm_usr_add')]
        else: # update, partial_update, destroy, toggle_status, admin_reset_password, user_avatar, delete_impact
            permission_classes = [HasMenuAccess('perm_usr_edit')]
            
        return permission_classes

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle
        if self.action == 'verify_card':
            self.throttle_scope = 'verify_card'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    # ─── طرح ۲.۹: تسلط بر کاربر مشترک (S1)، برتری مجوز (S2) و رویداد users_changed ─────────

    def _ensure_controls(self, target):
        from ..scope import ensure_actor_controls_user
        ensure_actor_controls_user(self.request.user, target)

    def _ensure_outranks(self, target):
        from ..scope import ensure_actor_outranks_user
        ensure_actor_outranks_user(self.request.user, target)

    def check_delete_impact_permission(self, request, instance):
        # S10: اثر حذف فقط برای کاربری که انجام‌دهنده بر همهٔ شرکت‌هایش تسلط دارد (پس شمارش درون شرکت‌های اوست)
        self._ensure_controls(instance)

    @staticmethod
    def _notify_users_changed(user_ids, company_ids=None):
        from ..permission_events import notify_users_changed
        try:
            notify_users_changed(user_ids, company_ids)
        except Exception:  # رویداد بلادرنگ نباید ذخیرهٔ اصلی را بشکند
            pass

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
        # مجوزهای نقش کلیدی (کد، برچسب فارسی) را ماژول‌ها با contribute('key_role_permissions', ...) اعلام می‌کنند
        KEY_PERMISSIONS = dict(contributions('key_role_permissions'))
        
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

        wh_ext = _get_user_warehouse_extension()
        warehouses = sorted(wh_ext.get_assigned_names(user)) if wh_ext else []

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

    @staticmethod
    def _requested_grants(validated_data):
        """(شناسهٔ نقش‌ها یا None، شناسهٔ تیک‌های مستقیم یا None) از بدنهٔ ساخت یا ویرایش کاربر."""
        groups = validated_data.get('groups', None)
        roles = validated_data.get('roles', None)
        if groups is not None:
            group_ids = {getattr(g, 'pk', g) for g in groups}
        elif roles is not None:
            group_ids = set(Group.objects.filter(name__in=roles).values_list('id', flat=True))
        else:
            group_ids = None
        perms = validated_data.get('user_permissions', None)
        perm_ids = None if perms is None else {getattr(p, 'pk', p) for p in perms}
        return group_ids, perm_ids

    def perform_create(self, serializer):
        from ..audit_utils import log_audit_event
        from ..permission_admin import ensure_user_grant_change
        # طرح ۲.۲ (ت۱۰): نقش سامانه‌ای و تیک مستقیم فقط با perm_usr_role و فقط کدهایی که خود سازنده دارد
        new_group_ids, new_perm_ids = self._requested_grants(serializer.validated_data)
        ensure_user_grant_change(self.request.user, None, new_group_ids=new_group_ids, new_perm_ids=new_perm_ids)
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
        self._notify_users_changed([instance.pk])
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
        # S1: ویرایش کاربر مشترک فقط برای کسی که عضو همهٔ شرکت‌های اوست
        self._ensure_controls(serializer.instance)
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
        from ..permission_admin import ensure_user_grant_change
        old_group_ids = set(old_instance.groups.values_list('id', flat=True))
        old_perm_ids = set(old_instance.user_permissions.values_list('id', flat=True))
        new_group_ids, new_perm_ids = self._requested_grants(serializer.validated_data)
        ensure_user_grant_change(self.request.user, old_instance, old_group_ids=old_group_ids,
                                 new_group_ids=new_group_ids, old_perm_ids=old_perm_ids, new_perm_ids=new_perm_ids)
        grants_changed = ((new_group_ids is not None and new_group_ids != old_group_ids)
                          or (new_perm_ids is not None and new_perm_ids != old_perm_ids))
        new_is_active = serializer.validated_data.get('is_active', None)
        deactivating = old_instance.is_active and new_is_active is False
        if deactivating:
            # S2 و S9: همان محافظ‌های toggle_status
            self._ensure_outranks(old_instance)
            self._validate_user_deactivation(self.request, old_instance, action_name="غیرفعال‌سازی")
        if serializer.validated_data.get('password') and old_instance.pk != self.request.user.pk:
            raise PermissionDenied('رمز کاربر دیگر فقط با «بازنشانی رمز» عوض می‌شود.')

        before_state = self._get_user_audit_state(old_instance)
        from ..permission_events import companies_of_users
        before_cids = companies_of_users([old_instance.pk])
        instance = serializer.save(modified_by=self.request.user if self.request.user.is_authenticated else None)
        if deactivating:
            instance.password_changed_at = timezone.now()
            instance.save(update_fields=['password_changed_at'])
            self._revoke_user_sessions_and_tokens(instance)
        if grants_changed:
            from ..permission_events import notify_role_changed
            notify_role_changed([instance.pk])
        self._notify_users_changed([instance.pk], before_cids | companies_of_users([instance.pk]))
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
        # S1 و S2: حذف کاربر مشترک یا بالاتر از انجام‌دهنده ۴۰۳
        self._ensure_outranks(user)
        self._validate_user_deactivation(request, user, action_name="حذف")
        user_id = user.id
        user_repr = f"{user.username} ({user.first_name} {user.last_name})".strip()
        before_state = self._get_user_audit_state(user)
        from ..permission_events import companies_of_users
        before_cids = companies_of_users([user_id])

        response = super().destroy(request, *args, **kwargs)
        if response.status_code == 204:
            self._notify_users_changed([user_id], before_cids)

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
        self._ensure_controls(user)

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
            self._ensure_outranks(user)
            self._validate_user_deactivation(request, user, action_name="غیرفعال‌سازی")

        old_active = user.is_active
        user.is_active = new_active
        if not new_active:
            from django.utils import timezone
            user.password_changed_at = timezone.now()
            self._revoke_user_sessions_and_tokens(user)
        user.save()
        if old_active != user.is_active:
            self._notify_users_changed([user.pk])

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
        from ..scope import generate_one_time_password
        user = self.get_object()
        # S1 و S2: ریست رمز کاربر مشترک یا همکار بالاتر ۴۰۳ (ورود به جای او = ارتقای دسترسی)
        self._ensure_outranks(user)
        # S12 و تصمیم ۳: رمز یک‌بارمصرف تصادفی که فقط همین یک بار برگردانده می‌شود
        one_time_password = generate_one_time_password()
        user.set_password(one_time_password)
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
            
        return Response({
            'success': True,
            'one_time_password': one_time_password,
            'message': 'رمز یک‌بارمصرف تازه ساخته شد و همهٔ نشست‌ها و توکن‌های فعال کاربر ابطال شدند. '
                       'این رمز فقط همین یک بار نشان داده می‌شود و کاربر در ورود بعدی باید آن را عوض کند.',
        })

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
        self._ensure_controls(user)

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
        return generate_users_excel(queryset, actor=request.user)

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
        return generate_id_cards_excel(queryset, actor=request.user)

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
        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from ..permission_admin import ensure_user_grant_change
        from ..scope import (
            MSG_NOT_CONTROLLED, MSG_OUTRANKED, actor_controls_user, generate_one_time_password,
            permissions_beyond_actor,
        )
        from ..permission_events import companies_of_users
        role_changed_user_ids = set()
        changed_user_ids = set()
        deactivated_users = []
        one_time_passwords = []
        # S13: پیوند کاربر تازه با شرکت فعال، مثل مسیر سریالایزر، نوشتن «دسترسی کاربران» همان شرکت را می‌خواهد
        can_link_company = True
        if cid and not request.user.is_superuser:
            from companies.access import company_section_level, _level_ok
            can_link_company = _level_ok(company_section_level(request.user, cid, 'user_access'), 'write')

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
                        # S1: کاربر مشترک با شرکت دیگر از اکسل ویرایش نمی‌شود
                        if not actor_controls_user(request.user, user):
                            commit_errors.append({'row': row_num, 'field': 'username', 'message': MSG_NOT_CONTROLLED})
                            continue
                        deactivating = user.is_active and row_data.get('is_active') is False
                        if deactivating:
                            # S2 و S9: همان محافظ‌های toggle_status
                            beyond = permissions_beyond_actor(request.user, user)
                            if beyond:
                                codes = '، '.join(sorted(str(c).split('.', 1)[-1] for c in beyond)[:5])
                                commit_errors.append({'row': row_num, 'field': 'is_active', 'message': MSG_OUTRANKED.format(codes=codes)})
                                continue
                            try:
                                self._validate_user_deactivation(request, user, action_name="غیرفعال‌سازی")
                            except DRFValidationError as exc:
                                detail = exc.detail[0] if isinstance(exc.detail, list) and exc.detail else exc.detail
                                commit_errors.append({'row': row_num, 'field': 'is_active', 'message': str(detail)})
                                continue
                        old_role_ids = set(user.groups.values_list('id', flat=True))
                        new_role_ids = {g.pk for g in roles}
                        try:
                            ensure_user_grant_change(request.user, user, old_group_ids=old_role_ids, new_group_ids=new_role_ids)
                        except DRFPermissionDenied as exc:
                            commit_errors.append({'row': row_num, 'field': 'roles', 'message': str(exc.detail)})
                            continue
                        if old_role_ids != new_role_ids:
                            role_changed_user_ids.add(user.pk)
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
                        if wh_ext:
                            # فقط بخشِ درون دامنهٔ سازنده جایگزین می‌شود؛ انبارهای بیرون از دامنهٔ او دست‌نخورده می‌مانند
                            kept = [w for w in wh_ext.get_assigned(user) if w not in allowed_warehouses]
                            wh_ext.set_assigned(user, kept + list(warehouses))
                        if deactivating:
                            deactivated_users.append(user)
                        changed_user_ids.add(user.pk)
                        updated_count += 1
                        continue

                    outside = warehouses_outside_companies(warehouses, target_company_ids_for_warehouses(None, cid))
                    if outside:
                        commit_errors.append({'row': row_num, 'field': 'warehouses', 'message': f'انبار «{outside[0].name}» متعلق به شرکت دیگری است و به شرکت فعال شما تعلق ندارد.'})
                        continue

                    try:
                        ensure_user_grant_change(request.user, None, new_group_ids={g.pk for g in roles})
                    except DRFPermissionDenied as exc:
                        commit_errors.append({'row': row_num, 'field': 'roles', 'message': str(exc.detail)})
                        continue

                    if cid and not can_link_company:
                        commit_errors.append({'row': row_num, 'field': 'company', 'message': 'مجوز نوشتن «دسترسی کاربران» شرکت فعال را ندارید؛ کاربر تازه ساخته نشد.'})
                        continue

                    # S12 و تصمیم ۳: رمز یک‌بارمصرف تصادفی (نه کد ملی یا 123456)، یک بار در نتیجهٔ ورود
                    password = generate_one_time_password()
                    user = CustomUser(**row_data)
                    user.set_password(password)
                    user.requires_password_change = True
                    if request.user and request.user.is_authenticated:
                        user.created_by = request.user
                    user.save()

                    user.groups.set(roles)
                    if wh_ext:
                        wh_ext.set_assigned(user, warehouses)

                    # ایجاد دسترسی شرکت برای کاربر جدید
                    if cid:
                        from companies.models import UserCompanyAccess
                        # پیوند کاربر با شرکت (ت۸)؛ عضویت فقط از انتساب بخش یا انبار می‌آید
                        UserCompanyAccess.objects.get_or_create(user=user, company_id=cid)
                    one_time_passwords.append({'row': row_num, 'username': user.username, 'one_time_password': password})
                    changed_user_ids.add(user.pk)
                    created_count += 1

                for user in deactivated_users:
                    user.password_changed_at = timezone.now()
                    user.save(update_fields=['password_changed_at'])
                    self._revoke_user_sessions_and_tokens(user)
                if role_changed_user_ids:
                    from ..permission_events import notify_role_changed
                    notify_role_changed(role_changed_user_ids)
                if changed_user_ids:
                    self._notify_users_changed(changed_user_ids, companies_of_users(changed_user_ids))
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
            'errors': commit_errors,
            # S12: رمز یک‌بارمصرف کاربران تازه، فقط همین یک بار
            'one_time_passwords': one_time_passwords,
        })

    @action(detail=False, methods=['get'], url_path='verify_card')
    def verify_card(self, request):
        """
        تأیید عمومی کارت شناسایی (بی‌ورود). S4 و تصمیم ۴: کد کارت امضاشده (scope.card_code_for) است و
        پاسخ فقط «معتبر» با نام و عکس کاربر فعالِ غیرمدیرکل است؛ هر حالت دیگر فقط {valid: false}.
        """
        from ..scope import user_id_from_card_code
        user_id = user_id_from_card_code(request.query_params.get('code', ''))
        user = None
        if user_id is not None:
            user = CustomUser.objects.filter(id=user_id, is_active=True, is_superuser=False).first()
        if user is None:
            return Response({'valid': False}, status=404)
        return Response({
            'valid': True,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'avatar': user.avatar.url if user.avatar else None,
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
