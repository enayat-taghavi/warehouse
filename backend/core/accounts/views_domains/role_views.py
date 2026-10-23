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
        return [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_usr_role')]

    def get_queryset(self):
        return CustomRole.objects.all().prefetch_related('permissions', 'user_set')

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
        permissions = serializer.validated_data.get('permissions', [])
        self._check_sensitive_permissions(permissions)
        instance = serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)
        from ..audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            module='users',
            action='CREATE',
            severity='info',
            target_model='CustomRole',
            target_object_id=instance.id,
            target_repr=f"ایجاد نقش {instance.title or instance.name}",
            details={'role_name': instance.name, 'title': instance.title, 'permissions_count': len(permissions)},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    def perform_update(self, serializer):
        permissions = serializer.validated_data.get('permissions', None)
        if permissions is not None:
            self._check_sensitive_permissions(permissions)
        instance = serializer.save(modified_by=self.request.user if self.request.user.is_authenticated else None)
        from ..audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            module='users',
            action='UPDATE',
            severity='info',
            target_model='CustomRole',
            target_object_id=instance.id,
            target_repr=f"ویرایش نقش {instance.title or instance.name}",
            details={'role_name': instance.name, 'title': instance.title},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    def perform_destroy(self, instance):
        role_id = instance.id
        role_repr = f"حذف نقش {instance.title or instance.name}"
        super().perform_destroy(instance)
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
                    'roles': f"والد: {r.get('parent_name') or 'ندارد'}",
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
        # Two-pass creation: first create/update roles without parents, then set parents
        processed_roles = {}

        try:
            with transaction.atomic():
                for row_data in result['valid_rows']:
                    row_num = row_data.pop('_row_num', None)
                    is_update = row_data.pop('is_update', False)
                    role_id = row_data.pop('role_id', None)
                    permissions = row_data.pop('permissions', [])
                    parent_name = row_data.pop('parent_name', None)

                    if is_update and role_id:
                        role = CustomRole.objects.filter(id=role_id).first()
                        if role:
                            role.title = row_data['title']
                            role.color = row_data['color']
                            role.save()
                            # همگام‌سازی قطعی دسترسی‌ها (خالی بودن ستون در اکسل باعث پاک شدن دسترسی‌ها می‌شود)
                            role.permissions.set(permissions)
                            processed_roles[row_data['name']] = {'role': role, 'parent_name': parent_name, 'row_num': row_num, 'is_update': True}
                            updated_count += 1
                            continue

                    role = CustomRole(name=row_data['name'], title=row_data['title'], color=row_data['color'])
                    role.save()
                    role.permissions.set(permissions)
                    processed_roles[row_data['name']] = {'role': role, 'parent_name': parent_name, 'row_num': row_num, 'is_update': False}
                    created_count += 1

                # Second pass: resolve parents with circular dependency protection
                for name, info in processed_roles.items():
                    role_obj = info['role']
                    p_name = info['parent_name']
                    row_n = info.get('row_num', 0)

                    if p_name:
                        parent = CustomRole.objects.filter(name__iexact=p_name).first()
                        if not parent:
                            parent = CustomRole.objects.filter(title__iexact=p_name).first()
                        if parent and parent.id != role_obj.id:
                            role_obj.parent = parent
                            try:
                                # سیوپوینت جهت جلوگیری از توقف کل تراکنش هنگام بروز حلقه چرخه‌ای در یک سطر
                                with transaction.atomic():
                                    role_obj.save()
                            except ValidationError as ve:
                                role_obj.parent = None
                                error_msg = ve.message_dict.get('parent', [str(ve)])[0] if hasattr(ve, 'message_dict') else str(ve)
                                commit_errors.append({
                                    'row': row_n,
                                    'field': 'parent',
                                    'message': f"خطای وابستگی چرخه‌ای نقش «{role_obj.title}»: {error_msg}"
                                })
                                error_rows_set.add(row_n)
                            except Exception as ex:
                                role_obj.parent = None
                                commit_errors.append({
                                    'row': row_n,
                                    'field': 'parent',
                                    'message': f"خطا در انتساب والد برای نقش «{role_obj.title}»: {str(ex)}"
                                })
                                error_rows_set.add(row_n)
                    elif info.get('is_update') and role_obj.parent_id is not None:
                        # اگر در فایل اکسل والد خالی گذاشته شده، والد قبلی پاک می‌شود
                        role_obj.parent = None
                        role_obj.save(update_fields=['parent'])

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
