import logging
from django.core.cache import cache
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)

CACHE_PRESENCE_KEY = "chat_active_online_users_set"
CACHE_TIMEOUT = 86400  # 24 hours


def _get_current_set() -> set:
    try:
        val = cache.get(CACHE_PRESENCE_KEY)
        if isinstance(val, (set, list, tuple)):
            return set(int(x) for x in val)
    except Exception as e:
        logger.debug(f"[PresenceCache] get error: {e}")
    return set()


def add_online_user_sync(user_id: int) -> list:
    """ثبت شناسه کاربر در لیست آنلاین‌ها و بازگرداندن کل لیست"""
    try:
        users = _get_current_set()
        users.add(int(user_id))
        cache.set(CACHE_PRESENCE_KEY, list(users), CACHE_TIMEOUT)
        return list(users)
    except Exception as e:
        logger.debug(f"[PresenceCache] add error: {e}")
        return [int(user_id)]


def remove_online_user_sync(user_id: int) -> list:
    """حذف شناسه کاربر از لیست آنلاین‌ها"""
    try:
        users = _get_current_set()
        users.discard(int(user_id))
        cache.set(CACHE_PRESENCE_KEY, list(users), CACHE_TIMEOUT)
        return list(users)
    except Exception as e:
        logger.debug(f"[PresenceCache] remove error: {e}")
        return []


def get_online_users_sync() -> list:
    """دریافت لیست کلیه شناسه‌های آنلاین فعال"""
    try:
        return list(_get_current_set())
    except Exception as e:
        logger.debug(f"[PresenceCache] list error: {e}")
        return []


@database_sync_to_async
def add_online_user(user_id: int) -> list:
    return add_online_user_sync(user_id)


@database_sync_to_async
def remove_online_user(user_id: int) -> list:
    return remove_online_user_sync(user_id)


@database_sync_to_async
def get_online_users() -> list:
    return get_online_users_sync()
