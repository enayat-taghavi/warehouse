import logging
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import AuditLog, UserLoginLog

logger = logging.getLogger(__name__)


def serialize_audit_log_data(instance):
    """
    سریالایز ایمن و سریع رکورد لاگ ممیزی جهت ارسال به وب‌سوکت
    """
    try:
        from .serializers import AuditLogListSerializer
        return AuditLogListSerializer(instance).data
    except Exception as e:
        logger.warning(f"[WebSocket] Error serializing audit log {getattr(instance, 'id', None)}: {e}")
        return {
            'id': instance.id,
            'actor_username': instance.actor_username,
            'actor_name': instance.actor_name,
            'user_display': instance.actor_name or instance.actor_username or 'سیستم',
            'warehouse': instance.warehouse_id,
            'module': instance.module,
            'action': instance.action,
            'severity': instance.severity,
            'target_model': instance.target_model,
            'target_object_id': instance.target_object_id,
            'target_repr': instance.target_repr,
            'has_diff': bool(instance.before_state or instance.after_state),
            'ip_address': instance.ip_address,
            'created_at': instance.created_at.isoformat() if instance.created_at else None,
        }


def serialize_login_log_data(instance):
    """
    سریالایز ایمن رکورد تاریخچه ورود کاربر جهت ارسال به وب‌سوکت
    """
    try:
        from .serializers import UserLoginLogSerializer
        return UserLoginLogSerializer(instance).data
    except Exception as e:
        logger.warning(f"[WebSocket] Error serializing login log {getattr(instance, 'id', None)}: {e}")
        u_display = instance.username_attempted
        if getattr(instance, 'user', None):
            u_full = f"{instance.user.first_name} {instance.user.last_name}".strip()
            u_display = u_full if u_full else instance.user.username

        return {
            'id': instance.id,
            'user': getattr(instance, 'user_id', None),
            'username_attempted': instance.username_attempted,
            'user_display': u_display,
            'ip_address': instance.ip_address,
            'user_agent': getattr(instance, 'user_agent', None),
            'device_model': getattr(instance, 'device_model', None),
            'status': instance.status,
            'status_display': instance.get_status_display() if hasattr(instance, 'get_status_display') else instance.status,
            'failure_reason': instance.failure_reason,
            'metadata': getattr(instance, 'metadata', {}) or {},
            'created_at': instance.created_at.isoformat() if instance.created_at else None,
        }


# کانال مدیران کل سامانه؛ همان ثابت `notifications.consumers.SUPERUSER_GROUP`
SUPERUSER_GROUP = 'superuser_notifications'


def audit_log_target_group(company_id):
    """کانال مقصد رویداد لاگ ممیزی: کانال شرکت اگر رکورد شرکت دارد، وگرنه فقط مدیران کل.

    هرگز `global_notifications` نیست (نام کاربری، شرکت و کد دسترسی در لاگ‌ها هست).
    """
    if company_id is not None:
        return f'company_{company_id}_notifications'
    return SUPERUSER_GROUP


def broadcast_audit_log_created(log_id, warehouse_id, log_data, message='', company_id=None):
    """
    ارسال بلادرنگ رویداد ایجاد لاگ ممیزی به کانال شرکت رکورد (یا فقط مدیران کل)
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            payload = {
                'type': 'send_notification',
                'type_str': 'audit_log_created',
                'message': message or '',
                'log_id': log_id,
                'log': log_data,
            }
            if warehouse_id is not None:
                payload['warehouse_id'] = warehouse_id
            if company_id is not None:
                payload['company_id'] = company_id

            async_to_sync(channel_layer.group_send)(
                audit_log_target_group(company_id),
                payload
            )
    except Exception as e:
        logger.warning(f"[WebSocket] Error broadcasting audit_log_created: {e}")


def broadcast_login_log_created(login_id, login_data, message=''):
    """
    ارسال بلادرنگ رویداد ثبت ورود/خروج فقط به کانال مدیران کل سامانه
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            payload = {
                'type': 'send_notification',
                'type_str': 'login_log_created',
                'message': message or '',
                'login_id': login_id,
                'login_log': login_data,
            }
            async_to_sync(channel_layer.group_send)(
                SUPERUSER_GROUP,
                payload
            )
    except Exception as e:
        logger.warning(f"[WebSocket] Error broadcasting login_log_created: {e}")


@receiver(post_save, sender=AuditLog)
def audit_log_post_save(sender, instance, created, **kwargs):
    """
    سیگنال پس از ایجاد رکورد ممیزی — همراه با تضمین commit تراکنش (Transaction Safety)
    """
    if not created:
        return

    try:
        log_data = serialize_audit_log_data(instance)
        log_id = instance.id
        wh_id = instance.warehouse_id
        company_id = getattr(instance, 'company_id', None)

        def send_broadcast():
            broadcast_audit_log_created(
                log_id=log_id,
                warehouse_id=wh_id,
                log_data=log_data,
                message='',
                company_id=company_id,
            )

        transaction.on_commit(send_broadcast)
    except Exception as e:
        logger.warning(f"[WebSocket] Error in audit_log_post_save signal: {e}")


@receiver(post_save, sender=UserLoginLog)
def login_log_post_save(sender, instance, created, **kwargs):
    """
    سیگنال پس از ثبت ورود/خروج کاربر
    """
    if not created:
        return

    try:
        login_data = serialize_login_log_data(instance)
        login_id = instance.id

        def send_broadcast():
            broadcast_login_log_created(
                login_id=login_id,
                login_data=login_data,
                message=''
            )

        transaction.on_commit(send_broadcast)
    except Exception as e:
        logger.warning(f"[WebSocket] Error in login_log_post_save signal: {e}")


# ==============================================================================
# سیگنال ساخت نسخه پشتیبان جدید (جهت دریافت توسط ماژول‌های متصل مثل گوگل‌درایو)
# ==============================================================================
from django.dispatch import Signal

backup_created = Signal()  # providing_args: ['dest_path', 'filename', 'meta']
