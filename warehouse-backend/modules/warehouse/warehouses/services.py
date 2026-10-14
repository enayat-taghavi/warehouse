# ---------------------------------------------------------------------------
#  لایهٔ shim — فاز ۱ طرح جداسازی (§۱.۵)
#  هستهٔ تنظیمات به `settings_core.services` منتقل شده است. این فایل همان نام‌ها
#  را re-export می‌کند تا هر ۳ فراخوان `communications` و همهٔ فراخوان‌های
#  `inventory`/`reports`/`warehouses.views` عیناً دست‌نخورده بمانند.
#  در نصب بدون اپ انبار این فایل اصلاً بارگذاری نمی‌شود؛ تنظیمات از
#  `settings_core.services` در دسترس است.
# ---------------------------------------------------------------------------
from settings_core.services import (
    DEFAULT_SETTINGS,
    BOOLEAN_SETTINGS_KEYS,
    SETTINGS_CACHE_TTL,
    get_setting_cache_key,
    clear_setting_cache,
    get_setting,
    get_all_settings,
    validate_settings_payload,
    compute_settings_etag,
)


def broadcast_warehouse_mutation(warehouse_id, action, warehouse_name=''):
    """
    ارسال بلادرنگ رویداد تغییرات انبار به کانال وب‌سوکت سراسری
    تا کلاینت‌ها کش محلی خود را بی‌درنگ invalidate و خودترمیمی کنند.
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)(
                'global_notifications',
                {
                    'type': 'send_notification',
                    'type_str': 'warehouse_mutation',
                    'action': action,
                    'warehouse_id': warehouse_id,
                    'warehouse_name': warehouse_name,
                    'message': f"انبار «{warehouse_name}» {action} شد.",
                }
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[WebSocket] Error broadcasting warehouse_mutation: {e}")
