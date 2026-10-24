# -*- coding: utf-8 -*-
"""
Custom role and permission management ViewSets.
"""
from django.contrib.auth.models import Group, Permission
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from common.mixins import DeleteImpactMixin

from ..models import CustomRole
from ..serializers import CustomRoleSerializer, PermissionSerializer
from .helpers import OptionalPageNumberPagination

ROLE_IDENTITY_FIELDS = ('name', 'title', 'color')
MSG_SHARED_ROLE_IDENTITY = (
    "تغییر نام، عنوان یا رنگ نقشی که اعضایی بیرون از دامنهٔ دسترسی شما دارد فقط در اختیار مدیر کل سامانه است."
)
MSG_SHARED_ROLE_DELETE = "این نقش اعضایی بیرون از دامنهٔ دسترسی شما دارد؛ حذف آن فقط در اختیار مدیر کل سامانه است."

class CustomRoleViewSet(DeleteImpactMixin, viewsets.ModelViewSet):
    queryset = CustomRole.objects.all()
    serializer_class = CustomRoleSerializer
    pagination_class = OptionalPageNumberPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'title']
    ordering_fields = ['id', 'name', 'title']
    ordering = ['id']

    def get_permissions(self):
        from ..permissions import HasMenuAccess
        # طرح ۲.۲ (ت۱۰ قاعدهٔ ۲): خواندن با view_sys_users یا perm_usr_role؛ نوشتن فقط با perm_usr_role
        if self.action in ('list', 'retrieve', 'export_excel', 'download_template'):
            return [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_usr_role')]
        return [HasMenuAccess('perm_usr_role')]

    def get_queryset(self):
        return CustomRole.objects.all().prefetch_related('permissions', 'user_set')

    def _visible_user_ids(self):
        """طرح ۲.۹ (S8): شناسهٔ کاربران دامنهٔ کاربر جاری با یک پرس‌وجو در هر درخواست؛ None برای مدیر کل."""
        if not hasattr(self, '_visible_ids_cache'):
            user = self.request.user
            if user.is_superuser:
                self._visible_ids_cache = None
            else:
                from ..scope import get_visible_users_for_user
                self._visible_ids_cache = frozenset(get_visible_users_for_user(user).values_list('pk', flat=True))
        return self._visible_ids_cache

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if getattr(self, 'request', None) is not None and self.request.user.is_authenticated:
            context['visible_user_ids'] = self._visible_user_ids()
        return context

    def check_delete_impact_permission(self, request, instance):
        # حذف نقشی با عضو بیرون از دامنه برای غیرمدیر کل ممکن نیست (ensure_role_change)؛ شمار اعضای پنهان هم لو نرود
        if self._hidden_members(instance.user_set.values_list('id', flat=True)):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(MSG_SHARED_ROLE_DELETE)

    def _hidden_members(self, member_ids):
        visible = self._visible_user_ids()
        return set() if visible is None else set(member_ids) - visible

    @staticmethod
    def _ids(items):
        return {getattr(i, 'pk', i) for i in (items or [])}

    @staticmethod
    def _identity_changed(role, data):
        return any(field in data and (data[field] or '') != (getattr(role, field) or '')
                   for field in ROLE_IDENTITY_FIELDS)

    def _notify_members(self, user_ids):
        from ..permission_events import notify_role_changed
        if user_ids:
            notify_role_changed(user_ids)

    def _check_sensitive_permissions(self, permissions):
        user = self.request.user
        if not user or not user.is_superuser:
            from ..models import SENSITIVE_PERMISSION_CODENAMES
            if permissions:
                if hasattr(permissions, 'values_list'):
                    assigned_codenames = set(permissions.values_list('codename', flat=True))
                else:
                    assigned_codenames = set(
                        Permission.objects.filter(id__in=[p.id if hasattr(p, 'id') else p for p in permissions])
                        .values_list('codename', flat=True)
                    )
                if assigned_codenames.intersection(SENSITIVE_PERMISSION_CODENAMES):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("تنها مدیر ارشد سامانه (Superuser) مجاز به اعطا یا تغییر دسترسی‌های حساس و بحرانی است.")

    def perform_create(self, serializer):
        from ..permission_admin import ensure_role_change, audit_role_permissions
        permissions = serializer.validated_data.get('permissions', [])
        self._check_sensitive_permissions(permissions)
        new_perm_ids = self._ids(permissions)
        new_user_ids = self._ids(serializer.validated_data.get('user_set'))
        ensure_role_change(self.request.user, new_perm_ids=new_perm_ids, new_user_ids=new_user_ids)
        instance = serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)
        changes = audit_role_permissions(self.request.user, instance, (), new_perm_ids, (), new_user_ids)
        self._notify_members(new_user_ids)
        from ..audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            module='users',
            action='CREATE',
            severity='info',
            target_model='CustomRole',
            target_object_id=instance.id,
            target_repr=f"ایجاد نقش {instance.title or instance.name}",
            details={'role_name': instance.name, 'title': instance.title, 'permissions_count': len(permissions), **changes},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    def perform_update(self, serializer):
        from ..permission_admin import ensure_role_change, audit_role_permissions
        permissions = serializer.validated_data.get('permissions', None)
        if permissions is not None:
            self._check_sensitive_permissions(permissions)
        role = serializer.instance
        old_perm_ids = set(role.permissions.values_list('id', flat=True))
        old_user_ids = set(role.user_set.values_list('id', flat=True))
        new_perm_ids = old_perm_ids if permissions is None else self._ids(permissions)
        # طرح ۲.۹ (S8): نام، عنوان و رنگ نقشی که عضو بیرون از دامنه دارد فقط با مدیر کل؛
        # اعضای بیرون از دامنه که کاربر نمی‌بیند (و نمی‌فرستد) با ویرایش اعضا حذف نمی‌شوند.
        hidden_members = self._hidden_members(old_user_ids)
        if hidden_members and self._identity_changed(role, serializer.validated_data):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(MSG_SHARED_ROLE_IDENTITY)
        users = serializer.validated_data.get('user_set', None)
        new_user_ids = old_user_ids if users is None else (self._ids(users) | hidden_members)
        ensure_role_change(self.request.user, old_perm_ids=old_perm_ids, new_perm_ids=new_perm_ids,
                           old_user_ids=old_user_ids, new_user_ids=new_user_ids)
        save_kwargs = {'modified_by': self.request.user if self.request.user.is_authenticated else None}
        if users is not None:
            save_kwargs['user_set'] = sorted(new_user_ids)
        instance = serializer.save(**save_kwargs)
        changes = audit_role_permissions(self.request.user, instance, old_perm_ids, new_perm_ids, old_user_ids, new_user_ids)
        if old_perm_ids != new_perm_ids:
            self._notify_members(old_user_ids | new_user_ids)
        else:
            self._notify_members(old_user_ids ^ new_user_ids)
        from ..audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            module='users',
            action='UPDATE',
            severity='info',
            target_model='CustomRole',
            target_object_id=instance.id,
            target_repr=f"ویرایش نقش {instance.title or instance.name}",
            details={'role_name': instance.name, 'title': instance.title, **changes},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    def perform_destroy(self, instance):
        from ..permission_admin import ensure_role_change
        role_id = instance.id
        role_repr = f"حذف نقش {instance.title or instance.name}"
        old_perm_ids = set(instance.permissions.values_list('id', flat=True))
        old_user_ids = set(instance.user_set.values_list('id', flat=True))
        if not self.request.user.is_superuser:
            self._check_sensitive_permissions(instance.permissions.all())
        ensure_role_change(self.request.user, old_perm_ids=old_perm_ids, old_user_ids=old_user_ids)
        super().perform_destroy(instance)
        self._notify_members(old_user_ids)
        from ..audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            module='users',
            action='DELETE',
            severity='warning',
            target_model='CustomRole',
            target_object_id=role_id,
            target_repr=role_repr,
            details={'role_id': role_id},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    # ── Excel Import/Export Actions ──────────────────────────────────
    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Download all roles as an Excel file, optionally filtered by role IDs."""
        from ..roles_excel_utils import generate_roles_excel
        queryset = self.get_queryset()
        ids_param = request.GET.get('ids')
        if ids_param:
            try:
                ids = [int(i.strip()) for i in ids_param.split(',') if i.strip()]
                if ids:
                    queryset = queryset.filter(id__in=ids)
            except Exception:
                pass
        return generate_roles_excel(queryset)

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        """Download an empty Excel template with sample data."""
        from ..roles_excel_utils import generate_roles_template
        return generate_roles_template()

    @action(detail=False, methods=['post'])
    def import_excel(self, request):
        """Upload an Excel file and bulk-create or update roles."""
        from ..roles_excel_utils import parse_roles_excel
        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'errors': [{'row': 0, 'field': 'file', 'message': 'فایلی انتخاب نشده است.'}]}, status=400)

        if not file.name.endswith('.xlsx'):
            return Response({'success': False, 'errors': [{'row': 0, 'field': 'file', 'message': 'فقط فایل‌های با فرمت xlsx پشتیبانی می‌شوند.'}]}, status=400)

        update_existing = request.POST.get('update_existing') in ('true', 'True', True, '1', 1) or request.data.get('update_existing') in ('true', 'True', True, '1', 1)
        dry_run = request.POST.get('dry_run') in ('true', 'True', True, '1', 1) or request.data.get('dry_run') in ('true', 'True', True, '1', 1)
        result = parse_roles_excel(file, update_existing=update_existing)

        file_errors = [e for e in result['errors'] if e['row'] == 0]
        if file_errors:
            return Response({'success': False, 'summary': {'total_rows': 0, 'created': 0, 'updated': 0, 'skipped': 0}, 'errors': file_errors}, status=400)

        error_rows_set = set(e['row'] for e in result['errors'] if e['row'] > 0)
        total_rows = len(result['valid_rows']) + len(error_rows_set)

        if dry_run:
            preview_rows = []
            for r in result['valid_rows'][:25]:
                preview_rows.append({
                    'row': r.get('_row_num'),
                    'name': r.get('title', '') or r.get('name', ''),
                    'username': r.get('name', ''),
                    'national_code': '-',
                    'phone_number': '-',
                    'roles': '-',
                    'warehouses': f"{len(r.get('permissions', []))} مجوز دسترسی",
                    'is_update': r.get('is_update', False),
                    'is_active': True,
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

        created_count = 0
        updated_count = 0
        commit_errors = list(result.get('errors', []))
        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied
        from ..models import SENSITIVE_PERMISSION_CODENAMES
        from ..permission_admin import ensure_role_change, MSG_SENSITIVE
        affected_user_ids = set()

        try:
            with transaction.atomic():
                for row_data in result['valid_rows']:
                    row_num = row_data.pop('_row_num', None)
                    is_update = row_data.pop('is_update', False)
                    role_id = row_data.pop('role_id', None)
                    permissions = row_data.pop('permissions', [])

                    role = CustomRole.objects.filter(id=role_id).first() if (is_update and role_id) else None
                    old_perm_ids = set(role.permissions.values_list('id', flat=True)) if role else set()
                    member_ids = set(role.user_set.values_list('id', flat=True)) if role else set()
                    new_perm_ids = {p.id for p in permissions}
                    # طرح ۲.۹ (S8): عنوان و رنگ نقشی با عضو بیرون از دامنه فقط با مدیر کل
                    if role and self._hidden_members(member_ids) and self._identity_changed(
                            role, {'title': row_data.get('title'), 'color': row_data.get('color')}):
                        commit_errors.append({'row': row_num, 'field': 'title', 'message': MSG_SHARED_ROLE_IDENTITY})
                        error_rows_set.add(row_num)
                        continue
                    # ت۱۰: حساس فقط برای مدیر کل سامانه؛ مجوز داده‌شده یا برداشته‌شده باید در اختیار خود واردکننده باشد
                    try:
                        if not request.user.is_superuser:
                            sensitive = sorted(p.codename for p in permissions if p.codename in SENSITIVE_PERMISSION_CODENAMES)
                            if sensitive:
                                raise DRFPermissionDenied(MSG_SENSITIVE.format(codes='، '.join(sensitive)))
                        ensure_role_change(request.user, old_perm_ids=old_perm_ids, new_perm_ids=new_perm_ids,
                                           old_user_ids=member_ids, new_user_ids=member_ids)
                    except DRFPermissionDenied as exc:
                        commit_errors.append({'row': row_num, 'field': 'permissions', 'message': str(exc.detail)})
                        error_rows_set.add(row_num)
                        continue

                    if role:
                        role.title = row_data['title']
                        role.color = row_data['color']
                        role.save()
                        # همگام‌سازی قطعی دسترسی‌ها (خالی بودن ستون در اکسل باعث پاک شدن دسترسی‌ها می‌شود)
                        role.permissions.set(permissions)
                        if old_perm_ids != new_perm_ids:
                            affected_user_ids |= member_ids
                        updated_count += 1
                        continue

                    role = CustomRole(name=row_data['name'], title=row_data['title'], color=row_data['color'])
                    role.save()
                    role.permissions.set(permissions)
                    created_count += 1

                if affected_user_ids:
                    self._notify_members(affected_user_ids)

                from ..audit_utils import log_audit_event
                log_audit_event(
                    user=request.user,
                    module='users',
                    action='IMPORT',
                    severity='info',
                    target_model='CustomRole',
                    target_repr=f"بارگذاری اکسل نقش‌ها ({created_count} ایجاد، {updated_count} ویرایش)",
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

class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PermissionSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Permission.objects.filter(content_type__model__in=['customuser', 'group', 'warehouse', 'record'])
        try:
            from platform_core.module_catalog import get_disallowed_permission_codenames
            disallowed = get_disallowed_permission_codenames()
            if disallowed:
                qs = qs.exclude(codename__in=disallowed)
        except Exception:
            pass
        return qs

    def get_permissions(self):
        from ..permissions import HasMenuAccess
        return [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_usr_role')]

__all__ = [
    'CustomRoleViewSet',
    'PermissionViewSet',
]
