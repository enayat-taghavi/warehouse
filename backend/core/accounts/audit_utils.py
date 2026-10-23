import logging
from decimal import Decimal
from datetime import datetime, date
import uuid

from .models import AuditLog, UserLoginLog
from .middleware import get_current_user, get_current_ip, get_current_user_agent, get_current_warehouse, get_current_company

logger = logging.getLogger(__name__)

SENSITIVE_KEYS = {
    'password', 'token', 'access', 'refresh', 'secret',
    'national_code', 'card_number', 'auth_token', 'csrf_token'
}

def sanitize_value(val):
    """
    تبدیل انواع داده‌های خاص پایتون به مقادیر قابل سریالایز در JSON
    """
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, uuid.UUID):
        return str(val)
    return val

def sanitize_sensitive_data(data):
    """
    ماسک‌سازی و فیلتر اطلاعات حساس و محرمانه قبل از ذخیره در لاگ‌های JSON
    """
    if not isinstance(data, dict):
        return data

    clean = {}
    for k, v in data.items():
        k_lower = str(k).lower()
        if any(sens in k_lower for sens in SENSITIVE_KEYS):
            clean[k] = '********'
        elif isinstance(v, dict):
            clean[k] = sanitize_sensitive_data(v)
        elif isinstance(v, list):
            clean[k] = [
                sanitize_sensitive_data(item) if isinstance(item, dict) else sanitize_value(item)
                for item in v
            ]
        else:
            clean[k] = sanitize_value(v)
    return clean

def calculate_model_diff(before_dict, after_dict):
    """
    محاسبه تفاوت دقیق فیلدها بین دو وضعیت قبل و بعد (پشتیبانی از مقادیر None و کلیدهای اضافه/حذف شده)
    """
    if not before_dict and not after_dict:
        return None, None
        
    before_clean = sanitize_sensitive_data(before_dict or {})
    after_clean = sanitize_sensitive_data(after_dict or {})

    diff_before = {}
    diff_after = {}

    all_keys = set(before_clean.keys()).union(set(after_clean.keys()))
    for k in all_keys:
        has_b = k in before_clean
        has_a = k in after_clean
        val_b = before_clean.get(k) if has_b else None
        val_a = after_clean.get(k) if has_a else None

        # اگر کلید فقط در قبل بود (حذف شده)
        if has_b and not has_a:
            diff_before[k] = val_b
            diff_after[k] = None
        # اگر کلید فقط در بعد است (اضافه شده)
        elif has_a and not has_b:
            diff_before[k] = None
            diff_after[k] = val_a
        # اگر در هر دو موجود است اما مقادیر متفاوت است
        elif val_b != val_a:
            diff_before[k] = val_b
            diff_after[k] = val_a

    return (diff_before if diff_before else None), (diff_after if diff_after else None)


def log_audit_event(
    module,
    action,
    target_model=None,
    target_object_id=None,
    target_repr=None,
    severity='info',
    user=None,
    warehouse=None,
    before_state=None,
    after_state=None,
    details=None,
    ip_address=None,
    warehouse_id=None,
    company_id=None,
    **kwargs
):
    """
    ثبت آسان و ایمن یک رویداد ممیزی در سامانه با پشتیبانی از کانتکست چندشرکتی
    """
    try:
        actor_user = user or get_current_user()
        client_ip = ip_address or get_current_ip()

        # فاز ۲ §۲.۶ — ستون `warehouse_id` در `AuditLog` عددی ساده است (نه FK).
        # پس دیگر نیازی به resolve به شیئ `Warehouse` نیست؛ هسته هیچ ایمپورتی
        # به اپ انبار ندارد. پارامتر `warehouse` همچنان شیئ یا id می‌پذیرد.
        target_wh_id = None
        if warehouse is not None:
            target_wh_id = getattr(warehouse, 'id', warehouse)
        elif warehouse_id is not None:
            target_wh_id = warehouse_id
        if isinstance(target_wh_id, str) and str(target_wh_id).isdigit():
            target_wh_id = int(target_wh_id)
        if target_wh_id is None:
            target_wh_id = get_current_warehouse()
        # نرمال‌سازی نهایی: اگر باز هم شیئ بود، id می‌گیریم
        if target_wh_id is not None:
            target_wh_id = getattr(target_wh_id, 'id', target_wh_id)

        # استخراج و ثبت شناسه شرکت فعال در جزئیات رویداد
        target_company_id = company_id if company_id is not None else kwargs.get('company_id')
        if target_company_id is None and isinstance(details, dict):
            target_company_id = details.get('company_id')
        if target_company_id is None:
            target_company_id = get_current_company()

        clean_before = sanitize_sensitive_data(before_state) if before_state else None
        clean_after = sanitize_sensitive_data(after_state) if after_state else None
        clean_details = sanitize_sensitive_data(details or {})
        if target_company_id is not None:
            if not isinstance(clean_details, dict):
                clean_details = {'data': clean_details}
            clean_details['company_id'] = target_company_id

        actor_username = None
        actor_name = None
        if actor_user:
            actor_username = getattr(actor_user, 'username', None)
            first_name = getattr(actor_user, 'first_name', '') or ''
            last_name = getattr(actor_user, 'last_name', '') or ''
            full_name = f"{first_name} {last_name}".strip()
            actor_name = full_name if full_name else actor_username

        return AuditLog.objects.create(
            user=actor_user,
            actor_username=actor_username,
            actor_name=actor_name,
            company_id=target_company_id,
            warehouse_id=target_wh_id,
            module=module,
            action=action,
            severity=severity,
            target_model=target_model,
            target_object_id=str(target_object_id) if target_object_id is not None else None,
            target_repr=str(target_repr)[:255] if target_repr else None,
            before_state=clean_before,
            after_state=clean_after,
            details=clean_details,
            ip_address=client_ip
        )
    except Exception as e:
        logger.error(f"Failed to create AuditLog: {e}", exc_info=True)
        return None

def log_login_event(
    username,
    status,
    user=None,
    ip_address=None,
    user_agent=None,
    device_model=None,
    failure_reason=None,
    metadata=None
):
    """
    ثبت ورود، خروج یا تلاش ناموفق کاربر در سامانه
    """
    try:
        client_ip = ip_address or get_current_ip()
        ua = user_agent or get_current_user_agent()
        meta = metadata or {}

        return UserLoginLog.objects.create(
            user=user,
            username_attempted=str(username)[:150],
            ip_address=client_ip,
            user_agent=ua,
            device_model=str(device_model)[:150] if device_model else None,
            status=status,
            failure_reason=str(failure_reason)[:255] if failure_reason else None,
            metadata=sanitize_sensitive_data(meta)
        )
    except Exception as e:
        logger.error(f"Failed to create UserLoginLog: {e}", exc_info=True)
        return None
