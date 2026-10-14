import hashlib
import json

from django.core.cache import cache

# ---------------------------------------------------------------------------
#  کلیدهای پیش‌فرض هستهٔ پلتفرم
#  طبق فاز ۱ (§۱.۷)، کلیدهای پلتفرمی (تشخیص آنلاین/آفلاین، سینک، کش و چت) در
#  هسته می‌مانند و کلیدهای انباری توسط اپ `warehouses` از طریق
#  `register_settings_defaults` ثبت می‌شوند تا `DEFAULT_SETTINGS` در نصب
#  حسابداری‌تنها کاملاً خالی از کلیدهای انباری باشد.
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS = {
    'system_version': '1.0',
    'offline_sync_interval_minutes': 15,
    'offline_cache_ttl_minutes': 60,
    'chat_enabled': True,
    'chat_file_sharing': True,
}

BOOLEAN_SETTINGS_KEYS = {
    'chat_enabled',
    'chat_file_sharing',
}



def register_settings_defaults(defaults, boolean_keys=()):
    """
    ثبت کلیدهای پیش‌فرضِ متعلق به یک ماژول در هستهٔ تنظیمات (درجای همان دیکشنری
    سراسری، تا همهٔ ارجاع‌های موجود به `DEFAULT_SETTINGS` هم‌زمان آن را ببینند).
    اپ `warehouses` این را در `AppConfig.ready()` صدا می‌زند تا رفتار امروز
    عیناً حفظ شود؛ در نصب بدون انبار این کلیدها اصلاً ثبت نمی‌شوند.
    """
    DEFAULT_SETTINGS.update(defaults)
    BOOLEAN_SETTINGS_KEYS.update(boolean_keys)


def get_installed_modules():
    """
    فهرست کدهای ماژولِ نصب‌شده (manifest برای فرانت‌اند).
    فاز ۳ §۳.۷ — از رجیستری قابلیت‌ها خوانده می‌شود؛ 'platform' همیشه حاضر است.
    """
    from platform_core.registry import installed_modules
    return ['platform'] + list(installed_modules())


def is_strict_int(val):
    return isinstance(val, int) and not isinstance(val, bool)


def is_strict_bool(val):
    return isinstance(val, bool)


def is_strict_str(val):
    return isinstance(val, str)


def validate_settings_payload(data):
    """
    اعتبارسنجی کلیدها و مقادیر payload بر پایهٔ قواعد سخت دامنه.
    برمی‌گرداند: فهرست کلیدهای نامعتبر (تهی = payload معتبر است).
    """
    if not isinstance(data, dict):
        return ['__root__']

    invalid_keys = []
    for key, value in data.items():
        if key not in DEFAULT_SETTINGS:
            invalid_keys.append(key)
            continue

        if key in BOOLEAN_SETTINGS_KEYS:
            if not is_strict_bool(value):
                invalid_keys.append(key)
        elif key == 'offline_sync_interval_minutes':
            if not is_strict_int(value) or value < 1 or value > 1440:
                invalid_keys.append(key)
        elif key == 'offline_cache_ttl_minutes':
            if not is_strict_int(value) or value < 0 or value > 10080:
                invalid_keys.append(key)
        elif key == 'blind_counting':
            if not is_strict_str(value) or value not in ['blind', 'visible']:
                invalid_keys.append(key)
        elif key == 'default_conflict_strategy':
            if not is_strict_str(value) or value not in ['ignore', 'replace', 'update_empty', 'log']:
                invalid_keys.append(key)
        elif key == 'scanner_camera_preset':
            if not is_strict_str(value) or value not in ['adaptive', 'ultra', 'high', 'balanced', 'lite', 'custom']:
                invalid_keys.append(key)
        elif key == 'scanner_custom_resolution':
            if not is_strict_str(value) or value not in ['2k_1440p', '1080p', '720p', '480p']:
                invalid_keys.append(key)
        elif key == 'scanner_custom_interval_ms':
            if not is_strict_int(value) or value < 10 or value > 5000:
                invalid_keys.append(key)
        elif key == 'scanner_custom_roi_size':
            if not is_strict_int(value) or value < 100 or value > 2000:
                invalid_keys.append(key)
        elif key in ['system_version', 'scanner_row_delimiter', 'scanner_col_delimiter']:
            if not is_strict_str(value) or len(value) < 1 or len(value) > 50:
                invalid_keys.append(key)
        elif key in ['field_permissions_counter', 'field_permissions_doc']:
            if not isinstance(value, dict):
                invalid_keys.append(key)
            else:
                for f_key, f_val in value.items():
                    if not isinstance(f_val, dict) or not is_strict_bool(f_val.get('visible')) or not is_strict_bool(f_val.get('editable')):
                        invalid_keys.append(key)
                        break
        else:
            default_val = DEFAULT_SETTINGS.get(key)
            if isinstance(default_val, bool) and not is_strict_bool(value):
                invalid_keys.append(key)
            elif isinstance(default_val, int) and not is_strict_int(value):
                invalid_keys.append(key)

    return invalid_keys


def compute_settings_etag(settings_dict):
    """
    هش تعیین‌کنندهٔ ETag برای وضعیت فعلی تنظیمات.
    """
    serialized = json.dumps(settings_dict, sort_keys=True, default=str)
    return f'"{hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]}"'


SETTINGS_CACHE_TTL = 3600  # 1 hour


def get_setting_cache_key(key, warehouse_id=None):
    return f"sys_setting:{key}:{warehouse_id or 'global'}"


def clear_setting_cache(key=None, warehouse_id=None):
    if key:
        cache.delete(get_setting_cache_key(key, warehouse_id))
        cache.delete(get_setting_cache_key(key, None))
    cache.delete(f"sys_settings_all:{warehouse_id or 'global'}")
    cache.delete("sys_settings_all:global")


def get_setting(key, warehouse_id=None):
    """
    مقدار مؤثر تنظیم برای کلید و انبار مشخص: اول override انبار، بعد سراسری، بعد پیش‌فرض.
    با کش Django برای حذف کوئری تکراری دیتابیس.
    """
    from .models import SystemSetting

    cache_key = get_setting_cache_key(key, warehouse_id)
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    result = DEFAULT_SETTINGS.get(key)

    if warehouse_id:
        wh_setting = SystemSetting.objects.filter(key=key, warehouse_id=warehouse_id).first()
        if wh_setting:
            result = wh_setting.value
            cache.set(cache_key, result, SETTINGS_CACHE_TTL)
            return result

    global_setting = SystemSetting.objects.filter(key=key, warehouse_id__isnull=True).first()
    if global_setting:
        result = global_setting.value

    cache.set(cache_key, result, SETTINGS_CACHE_TTL)
    return result


def get_all_settings(warehouse_id=None):
    """
    همهٔ تنظیمات مؤثر همراه با کش.
    """
    from .models import SystemSetting

    cache_key = f"sys_settings_all:{warehouse_id or 'global'}"
    cached_dict = cache.get(cache_key)
    if cached_dict is not None:
        return cached_dict

    settings_dict = DEFAULT_SETTINGS.copy()

    global_settings = SystemSetting.objects.filter(warehouse_id__isnull=True)
    for s in global_settings:
        settings_dict[s.key] = s.value

    if warehouse_id:
        wh_settings = SystemSetting.objects.filter(warehouse_id=warehouse_id)
        for s in wh_settings:
            settings_dict[s.key] = s.value

    cache.set(cache_key, settings_dict, SETTINGS_CACHE_TTL)
    return settings_dict
