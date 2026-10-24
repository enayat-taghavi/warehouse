import logging

logger = logging.getLogger(__name__)

# همان نام گروه NotificationConsumer (notifications/consumers.py)؛ اینجا تکرار شده تا realtime به channels وابسته نشود
SUPERUSER_GROUP = 'superuser_notifications'
GLOBAL_GROUP = 'global_notifications'


def org_structure_target_groups(company_id=None, global_scope=False, notify_superusers=False):
    """
    گروه‌های مقصد رویداد ساختار سازمانی (درس ا۱ طرح ۲.۲): رویداد شرکتی فقط به کانال همان شرکت می‌رود.
    کانال عمومی فقط با global_scope=True (دادهٔ واقعاً سراسری، مثل طرف‌حساب بی‌شرکت).
    رویدادِ بی‌شرکت و بی‌global_scope به هیچ کانالی نمی‌رود، تا خطای فراخوان به نشت داده نینجامد.
    """
    groups = []
    if company_id:
        groups.append(f'company_{company_id}_notifications')
    elif global_scope:
        groups.append(GLOBAL_GROUP)
    if notify_superusers:
        groups.append(SUPERUSER_GROUP)
    return groups


def broadcast_org_structure_updated(entity_type, action, entity_id=None, name=None, *, company_id=None,
                                    project_id=None, client_tab_id=None, sender_id=None,
                                    global_scope=False, notify_superusers=False):
    """
    ارسال بلادرنگ رویداد تغییرات ساختار سازمانی (شرکت، دسترسی شرکت، پروژه، بخش، انتساب، طرف‌حساب) به وب‌سوکت شرکتی.
    همهٔ پارامترهای پس از name فقط با نام پذیرفته می‌شوند تا شناسهٔ شرکت به‌اشتباه جای پروژه ننشیند (ا۱).
    notify_superusers: رویداد ساخت شرکت که هنوز کسی عضو کانال شرکتی‌اش نیست، به مدیران کل سامانه هم می‌رسد.
    """
    groups = org_structure_target_groups(company_id, global_scope, notify_superusers)
    if not groups:
        logger.warning(f"[WebSocket] org_structure_updated بدون شرکت ارسال نشد: {entity_type}/{action}")
        return
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
            for group in groups:
                async_to_sync(channel_layer.group_send)(group, payload)
    except Exception as e:
        logger.warning(f"[WebSocket] Error broadcasting org_structure_updated: {e}")
