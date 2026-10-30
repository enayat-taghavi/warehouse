"""
منبع واحد قاعده «کاربر به کدام انبار دسترسی دارد»

پیش از این، این قاعده در ۶ نقطه مستقل تکرار شده بود (ItemViewSet، صادرات اکسل،
گزارش‌ها و …). هر بار که یک اندپوینت جدید اضافه می‌شد، یک کپی تازه از همان چند
خط ساخته می‌شد و اندپوینت‌های تازه گاهی آن را از قلم می‌انداختند (نمونه واقعی:
اکشن reorder عکس‌ها که با منیجر جهانی کار می‌کرد و هر کاربر لاگین‌شده می‌توانست
عکس هر انباری را جابه‌جا کند). با تعریف قاعده در یک جا، واگرایی دوباره ممکن نیست.

قاعده فعلی پروژه (عمداً حفظ شده):
    سوپریوزر            → همه انبارها
    assigned_warehouses ناتهی → فقط همان انبارها
    assigned_warehouses تهی   → همه انبارها («محدودیتی تعیین نشده»)

سطر سوم سخاوتمندانه است: کاربری که هیچ انباری به او تخصیص نیافته، همه را
می‌بیند. این معنا از قبل در سراسر پروژه برقرار بود و اینجا تغییر داده نشده،
چون سخت‌گیرانه کردنش کاربران فعلی بدون تخصیص (مثلاً مدیر ارشد) را یک‌شبه قفل
می‌کند — تصمیمی که باید آگاهانه و با مهاجرت داده گرفته شود، نه به‌عنوان اثر
جانبی یک رفع باگ.

برای سخت‌گیرانه کردن، فقط همین یک پرچم را True کنید؛ همه اندپوینت‌هایی که از
این ماژول استفاده می‌کنند یکجا سخت‌گیرانه می‌شوند:
"""

STRICT_WAREHOUSE_SCOPE = False


def user_warehouse_ids(user):
    """
    شناسه انبارهای مجاز کاربر، یا None به معنای «بدون محدودیت».

    None با [] یکی نیست: None یعنی همه انبارها، [] یعنی هیچ انباری.
    """
    if not user or not user.is_authenticated:
        return []
    if user.is_superuser:
        return None
    if not hasattr(user, 'assigned_warehouses'):
        return None if not STRICT_WAREHOUSE_SCOPE else []

    ids = list(user.assigned_warehouses.values_list('id', flat=True))
    if ids:
        return ids
    return [] if STRICT_WAREHOUSE_SCOPE else None


def scope_queryset(queryset, user, field='warehouse_id'):
    """
    محدود کردن یک queryset به انبارهای مجاز کاربر.

    :param field: مسیر ORM تا انبار — مثلاً 'warehouse_id' یا 'item__warehouse_id'
    """
    allowed = user_warehouse_ids(user)
    if allowed is None:
        return queryset
    return queryset.filter(**{f'{field}__in': allowed})


def can_access_warehouse(user, warehouse_id):
    """آیا کاربر به این انبار مشخص دسترسی دارد؟"""
    if warehouse_id is None:
        # کالای بدون انبار — فقط سوپریوزر یا حالت بدون محدودیت
        return user_warehouse_ids(user) is None
    allowed = user_warehouse_ids(user)
    if allowed is None:
        return True
    try:
        clean_id = int(warehouse_id)
        if clean_id in allowed:
            return True
    except (ValueError, TypeError):
        pass
    return warehouse_id in allowed or str(warehouse_id) in [str(x) for x in allowed]


def users_with_warehouse_access(user_queryset, warehouse_id):
    """
    وارونهٔ can_access_warehouse: از میان کاربران داده‌شده، آن‌هایی که به این انبار دسترسی دارند
    (همان سه سطر قاعدهٔ بالا). warehouse_id=None یعنی شیء بدون انبار.
    """
    from django.core.exceptions import FieldDoesNotExist
    from django.db.models import Q

    try:
        user_queryset.model._meta.get_field('assigned_warehouses')
    except FieldDoesNotExist:
        # ماژول انبار نصب نیست: همه بدون محدودیت‌اند (مثل user_warehouse_ids)
        return user_queryset if not STRICT_WAREHOUSE_SCOPE else user_queryset.filter(is_superuser=True)

    q = Q(is_superuser=True)
    if not STRICT_WAREHOUSE_SCOPE:
        q |= Q(assigned_warehouses__isnull=True)
    if warehouse_id is not None:
        q |= Q(assigned_warehouses__id=warehouse_id)
    return user_queryset.filter(q).distinct()
