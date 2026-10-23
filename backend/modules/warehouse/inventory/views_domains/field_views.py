# -*- coding: utf-8 -*-
"""
ViewSet for dynamic inventory item field definitions.
"""
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from warehouses.models import Warehouse
from common.warehouse_scope import scope_queryset
from ..models import ItemFieldDefinition, Item
from ..serializers import ItemFieldDefinitionSerializer
from ..filters import ItemFieldDefinitionFilter
from .helpers import PriorityOrderingFilter, logger

class ItemFieldDefinitionViewSet(viewsets.ModelViewSet):
    queryset = ItemFieldDefinition.objects.all()
    serializer_class = ItemFieldDefinitionSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = ItemFieldDefinitionFilter
    search_fields = ['name', 'label']

    def get_queryset(self):
        qs = super().get_queryset()
        from common.tenant_scope import get_current_tenant_company_id
        cid = get_current_tenant_company_id(request=self.request, user=self.request.user)
        if cid:
            from django.db.models import Q
            qs = qs.filter(Q(company_id=cid) | Q(warehouse__company_id=cid))
        return scope_queryset(qs, self.request.user)

    def perform_create(self, serializer):
        from common.tenant_scope import get_current_tenant_company_id
        cid = get_current_tenant_company_id(request=self.request, user=self.request.user)
        extra_kwargs = {'created_by': self.request.user}
        if cid and not serializer.validated_data.get('company'):
            extra_kwargs['company_id'] = cid

        # اگر رکورد حذف‌نرم با همان (انبار، نام) وجود دارد، احیا می‌شود؛
        # وگرنه INSERT به قید unique_together دیتابیس می‌خورد (اعتبارسنجی DRF
        # فقط رکوردهای زنده را می‌بیند).
        tombstone = ItemFieldDefinition.all_objects.filter(
            warehouse=serializer.validated_data.get('warehouse'),
            name=serializer.validated_data.get('name'),
            is_deleted=True,
        ).first()
        if tombstone:
            serializer.instance = tombstone
            instance = serializer.save(is_deleted=False, **extra_kwargs)
        else:
            instance = serializer.save(**extra_kwargs)

        from accounts.audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            warehouse=instance.warehouse,
            module='warehouses',
            action='CREATE',
            severity='info',
            target_model='ItemFieldDefinition',
            target_object_id=instance.id,
            target_repr=f"تعریف فیلد پویا «{instance.label or instance.name}» در انبار {instance.warehouse.name if instance.warehouse else '—'}",
            details={'name': instance.name, 'label': instance.label, 'field_type': instance.field_type},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    def perform_destroy(self, instance):
        from accounts.audit_utils import log_audit_event
        wh = instance.warehouse
        f_repr = f"حذف فیلد پویا «{instance.label or instance.name}»"
        f_id = instance.id
        instance.soft_delete()
        log_audit_event(
            user=self.request.user,
            warehouse=wh,
            module='warehouses',
            action='DELETE',
            severity='warning',
            target_model='ItemFieldDefinition',
            target_object_id=f_id,
            target_repr=f_repr,
            details={'field_id': f_id},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_name = old_instance.name
        new_instance = serializer.save(modified_by=self.request.user)
        new_name = new_instance.name
        
        # If the system name changed, migrate all item data in this warehouse
        if old_name != new_name:
            items_to_update = []
            items = Item.objects.filter(warehouse=new_instance.warehouse)
            for item in items:
                if item.dynamic_data and old_name in item.dynamic_data:
                    item.dynamic_data[new_name] = item.dynamic_data.pop(old_name)
                    items_to_update.append(item)
            
            if items_to_update:
                now = timezone.now()
                for item in items_to_update:
                    item.updated_at = now  # bulk_update سیگنال auto_now را رد می‌کند
                Item.objects.bulk_update(items_to_update, ['dynamic_data', 'updated_at'])

        from accounts.audit_utils import log_audit_event
        log_audit_event(
            user=self.request.user,
            warehouse=new_instance.warehouse,
            module='warehouses',
            action='UPDATE',
            severity='info',
            target_model='ItemFieldDefinition',
            target_object_id=new_instance.id,
            target_repr=f"ویرایش فیلد پویا «{new_instance.label or new_instance.name}»",
            details={'name': new_instance.name, 'label': new_instance.label, 'old_name': old_name},
            ip_address=getattr(self.request, 'META', {}).get('REMOTE_ADDR')
        )

    @action(detail=False, methods=['post'])
    def copy_from_warehouse(self, request):
        source_warehouse_id = request.data.get('source_warehouse_id')
        target_warehouse_id = request.data.get('target_warehouse_id')
        
        if not source_warehouse_id or not target_warehouse_id:
            return Response({'error': 'شناسه انبار مبدأ و مقصد الزامی است.'}, status=400)
            
        try:
            with transaction.atomic():
                source_fields = ItemFieldDefinition.objects.filter(warehouse_id=source_warehouse_id)
                target_existing_names = set(ItemFieldDefinition.objects.filter(warehouse_id=target_warehouse_id).values_list('name', flat=True))
                # فیلدهای حذف‌نرم مقصد: به‌جای ساخت (که به unique_together می‌خورد) احیا می‌شوند
                target_tombstones = {
                    fd.name: fd
                    for fd in ItemFieldDefinition.all_objects.filter(warehouse_id=target_warehouse_id, is_deleted=True)
                }

                new_fields = []
                resurrected = 0
                for field in source_fields:
                    if field.name in target_existing_names:
                        continue
                    tombstone = target_tombstones.get(field.name)
                    if tombstone:
                        tombstone.label = field.label
                        tombstone.field_type = field.field_type
                        tombstone.is_required = field.is_required
                        tombstone.default_value = field.default_value
                        tombstone.is_active = field.is_active
                        tombstone.is_deleted = False
                        tombstone.save()
                        resurrected += 1
                    else:
                        new_field = ItemFieldDefinition(
                            warehouse_id=target_warehouse_id,
                            name=field.name,
                            label=field.label,
                            field_type=field.field_type,
                            is_required=field.is_required,
                            default_value=field.default_value,
                            is_active=field.is_active,
                            created_by=request.user
                        )
                        new_fields.append(new_field)

                if new_fields:
                    ItemFieldDefinition.objects.bulk_create(new_fields)

                from accounts.audit_utils import log_audit_event
                log_audit_event(
                    user=request.user,
                    warehouse=Warehouse.objects.filter(id=target_warehouse_id).first(),
                    module='warehouses',
                    action='CREATE',
                    severity='info',
                    target_model='ItemFieldDefinition',
                    target_repr=f"کپی {len(new_fields) + resurrected} فیلد پویا از انبار #{source_warehouse_id} به #{target_warehouse_id}",
                    details={'source_warehouse_id': source_warehouse_id, 'target_warehouse_id': target_warehouse_id, 'copied_count': len(new_fields) + resurrected},
                    ip_address=getattr(request, 'META', {}).get('REMOTE_ADDR')
                )

                return Response({'message': f'{len(new_fields) + resurrected} فیلد با موفقیت کپی شد.'}, status=200)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

__all__ = [
    'ItemFieldDefinitionViewSet',
]
