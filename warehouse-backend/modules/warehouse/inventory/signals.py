import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import CountTask, DocTask

logger = logging.getLogger(__name__)

def serialize_task_data(instance):
    try:
        from .serializers import CountTaskSerializer
        return CountTaskSerializer(instance).data
    except Exception as e:
        logger.warning(f"[WebSocket] Error serializing count task {getattr(instance, 'id', None)}: {e}")
        return None

def serialize_doc_task_data(instance):
    try:
        from .serializers import DocTaskSerializer
        return DocTaskSerializer(instance).data
    except Exception as e:
        logger.warning(f"[WebSocket] Error serializing doc task {getattr(instance, 'id', None)}: {e}")
        return None

def broadcast_count_task_update(warehouse_id=None, task_id=None, task_data=None):
    """
    ارسال بلادرنگ رویداد به‌روزرسانی تسک‌های انبارگردانی به کانال وب‌سوکت شرکتی
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            cid = None
            if warehouse_id:
                try:
                    from warehouses.models import Warehouse
                    cid = Warehouse.objects.filter(id=warehouse_id).values_list('company_id', flat=True).first()
                except Exception:
                    pass

            payload = {
                'type': 'send_notification',
                'type_str': 'count_task_update',
                'message': 'به‌روزرسانی در تسک‌های انبارگردانی',
                'company_id': cid,
            }
            if warehouse_id is not None:
                payload['warehouse_id'] = warehouse_id
            if task_id is not None:
                payload['task_id'] = task_id
            if task_data is not None:
                payload['task'] = task_data

            target_group = f'company_{cid}_notifications' if cid else 'global_notifications'
            async_to_sync(channel_layer.group_send)(
                target_group,
                payload
            )
    except Exception as e:
        logger.warning(f"[WebSocket] Error broadcasting count_task_update: {e}")

@receiver(post_save, sender=CountTask)
def count_task_post_save(sender, instance, created, **kwargs):
    task_data = serialize_task_data(instance)
    broadcast_count_task_update(
        warehouse_id=getattr(instance, 'warehouse_id', None),
        task_id=instance.id,
        task_data=task_data
    )

@receiver(post_delete, sender=CountTask)
def count_task_post_delete(sender, instance, **kwargs):
    broadcast_count_task_update(
        warehouse_id=getattr(instance, 'warehouse_id', None),
        task_id=instance.id,
        task_data={'id': instance.id, '_deleted': True}
    )

def broadcast_doc_task_update(warehouse_id=None, task_id=None, task_data=None):
    """
    ارسال بلادرنگ رویداد به‌روزرسانی تسک‌های کارتابل مالی به کانال وب‌سوکت شرکتی
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            cid = None
            if warehouse_id:
                try:
                    from warehouses.models import Warehouse
                    cid = Warehouse.objects.filter(id=warehouse_id).values_list('company_id', flat=True).first()
                except Exception:
                    pass

            payload = {
                'type': 'send_notification',
                'type_str': 'doc_task_update',
                'message': 'به‌روزرسانی در تسک‌های کارتابل مالی',
                'company_id': cid,
            }
            if warehouse_id is not None:
                payload['warehouse_id'] = warehouse_id
            if task_id is not None:
                payload['task_id'] = task_id
            if task_data is not None:
                payload['task'] = task_data

            target_group = f'company_{cid}_notifications' if cid else 'global_notifications'
            async_to_sync(channel_layer.group_send)(
                target_group,
                payload
            )
    except Exception as e:
        logger.warning(f"[WebSocket] Error broadcasting doc_task_update: {e}")

@receiver(post_save, sender=DocTask)
def doc_task_post_save(sender, instance, created, **kwargs):
    doc_data = serialize_doc_task_data(instance)
    broadcast_doc_task_update(
        warehouse_id=getattr(instance, 'warehouse_id', None),
        task_id=instance.id,
        task_data=doc_data
    )

@receiver(post_delete, sender=DocTask)
def doc_task_post_delete(sender, instance, **kwargs):
    broadcast_doc_task_update(
        warehouse_id=getattr(instance, 'warehouse_id', None),
        task_id=instance.id,
        task_data={'id': instance.id, '_deleted': True}
    )





