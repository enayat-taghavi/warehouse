import logging

logger = logging.getLogger(__name__)


def broadcast_org_structure_updated(entity_type, action, entity_id=None, name=None, project_id=None, client_tab_id=None, sender_id=None, company_id=None):
    """
    ارسال بلادرنگ رویداد تغییرات ساختار سازمانی (شرکت، دسترسی شرکت، پروژه، بخش، انتساب، طرف‌حساب) به وب‌سوکت شرکتی.
    اگر company_id داده نشود، رویداد به کانال سراسری می‌رود. حسابداری پیش از فراخوانی، شرکتِ پروژه را خودش پیدا می‌کند.
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            payload = {
                'type': 'send_notification',
                'type_str': 'org_structure_updated',
                'entity_type': entity_type,
                'action': action,            # 'create' | 'update' | 'delete'
                'entity_id': entity_id,
                'name': name,
                'project_id': project_id,
                'company_id': company_id,
                'client_tab_id': client_tab_id,
                'sender_id': sender_id,
                'message': f"ساختار سازمانی ({entity_type}) به‌روزرسانی شد."
            }
            target_group = f'company_{company_id}_notifications' if company_id else 'global_notifications'
            async_to_sync(channel_layer.group_send)(target_group, payload)
    except Exception as e:
        logger.warning(f"[WebSocket] Error broadcasting org_structure_updated: {e}")
