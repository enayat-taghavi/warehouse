"""
حضور آنلاین چت (E10)

- برای هر کاربر یک شمارندهٔ اتصال در کش هست (cache.add + cache.incr/decr، اتمی در LocMem و Redis):
  بستن یک تب از دو تب کاربر را آفلاین نمی‌کند؛ فقط با رسیدن شمارنده به صفر آفلاین می‌شود.
- مجموعهٔ آنلاین‌ها فقط برای فهرست گرفتن است و تغییرش زیر قفل کش انجام می‌شود تا افزودن‌ها گم نشوند؛
  فهرست خروجی همیشه با شمارنده‌ها پالایش می‌شود، پس حذفِ گم‌شده هم کسی را آنلاین نشان نمی‌دهد.
- ping فقط عمر شمارنده را تمدید می‌کند (شمارنده را بالا نمی‌برد).
"""
import logging
import time

from django.core.cache import cache
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)

CACHE_PRESENCE_KEY = "chat_active_online_users_set"
CACHE_PRESENCE_LOCK_KEY = "chat_active_online_users_lock"
CACHE_TIMEOUT = 86400  # 24 hours
# عمر شمارندهٔ اتصال؛ با هر ping تمدید می‌شود تا پردازهٔ ازکارافتاده کاربر را برای همیشه آنلاین نگه ندارد
CONNECTION_COUNT_TTL = 600


def _count_key(user_id) -> str:
    return f"chat_presence_conn_{int(user_id)}"


def _get_current_set() -> set:
    try:
        val = cache.get(CACHE_PRESENCE_KEY)
        if isinstance(val, (set, list, tuple)):
            return set(int(x) for x in val)
    except Exception as e:
        logger.debug(f"[PresenceCache] get error: {e}")
    return set()


def _mutate_set(fn):
    """تغییر مجموعهٔ آنلاین‌ها زیر قفل کوتاه کش (حداکثر ~۱ ثانیه انتظار)"""
    got_lock = False
    for _ in range(100):
        if cache.add(CACHE_PRESENCE_LOCK_KEY, 1, 5):
            got_lock = True
            break
        time.sleep(0.01)
    try:
        users = _get_current_set()
        fn(users)
        cache.set(CACHE_PRESENCE_KEY, list(users), CACHE_TIMEOUT)
    finally:
        if got_lock:
            cache.delete(CACHE_PRESENCE_LOCK_KEY)


def _connection_count(user_id) -> int:
    try:
        return int(cache.get(_count_key(user_id)) or 0)
    except Exception:
        return 0


def _filter_online(ids) -> list:
    ids = [int(x) for x in ids]
    if not ids:
        return []
    counts = cache.get_many([_count_key(i) for i in ids])
    return sorted(i for i in ids if int(counts.get(_count_key(i)) or 0) > 0)


def connect_user_sync(user_id: int) -> int:
    """یک اتصال تازه: شمارنده یکی بالا می‌رود. خروجی: تعداد اتصال‌های فعلی کاربر"""
    user_id = int(user_id)
    key = _count_key(user_id)
    try:
        if cache.add(key, 1, CONNECTION_COUNT_TTL):
            count = 1
        else:
            try:
                count = cache.incr(key)
            except ValueError:
                # کلید همین لحظه منقضی شد
                cache.add(key, 0, CONNECTION_COUNT_TTL)
                count = cache.incr(key)
            cache.touch(key, CONNECTION_COUNT_TTL)
        _mutate_set(lambda users: users.add(user_id))
        return count
    except Exception as e:
        logger.debug(f"[PresenceCache] connect error: {e}")
        return 1


def disconnect_user_sync(user_id: int) -> int:
    """بسته شدن یک اتصال. خروجی: اتصال‌های باقی‌مانده؛ صفر یعنی کاربر واقعاً آفلاین شد"""
    user_id = int(user_id)
    key = _count_key(user_id)
    try:
        try:
            count = cache.decr(key)
        except ValueError:
            count = 0
        if count < 0:
            # شمارندهٔ منقضی‌شده و دوباره ساخته‌شده: به صفر برگردان
            cache.incr(key, -count)
            count = 0
        if count == 0:
            _mutate_set(lambda users: users.discard(user_id) if _connection_count(user_id) <= 0 else None)
        return count
    except Exception as e:
        logger.debug(f"[PresenceCache] disconnect error: {e}")
        return 0


def touch_online_user_sync(user_id: int) -> None:
    """ping: تمدید عمر شمارنده بدون افزایش آن؛ اگر شمارنده منقضی شده بود، یک اتصال ثبت می‌شود"""
    user_id = int(user_id)
    key = _count_key(user_id)
    try:
        if cache.add(key, 1, CONNECTION_COUNT_TTL) or user_id not in _get_current_set():
            _mutate_set(lambda users: users.add(user_id))
        else:
            cache.touch(key, CONNECTION_COUNT_TTL)
    except Exception as e:
        logger.debug(f"[PresenceCache] touch error: {e}")


def add_online_user_sync(user_id: int) -> list:
    """سازگاری عقب‌رو: ثبت یک اتصال و بازگرداندن فهرست آنلاین‌ها"""
    connect_user_sync(user_id)
    return get_online_users_sync()


def remove_online_user_sync(user_id: int) -> list:
    """سازگاری عقب‌رو: بستن یک اتصال و بازگرداندن فهرست آنلاین‌ها"""
    disconnect_user_sync(user_id)
    return get_online_users_sync()


def get_online_users_sync() -> list:
    """دریافت لیست کلیه شناسه‌های آنلاین فعال (فقط کسانی که شمارندهٔ اتصال مثبت دارند)"""
    try:
        return _filter_online(_get_current_set())
    except Exception as e:
        logger.debug(f"[PresenceCache] list error: {e}")
        return []


@database_sync_to_async
def connect_user(user_id: int) -> int:
    return connect_user_sync(user_id)


@database_sync_to_async
def disconnect_user(user_id: int) -> int:
    return disconnect_user_sync(user_id)


@database_sync_to_async
def touch_online_user(user_id: int) -> None:
    return touch_online_user_sync(user_id)


@database_sync_to_async
def add_online_user(user_id: int) -> list:
    return add_online_user_sync(user_id)


@database_sync_to_async
def remove_online_user(user_id: int) -> list:
    return remove_online_user_sync(user_id)


@database_sync_to_async
def get_online_users() -> list:
    return get_online_users_sync()
