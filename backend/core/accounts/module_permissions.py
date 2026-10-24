"""
ساخت ردیف‌های مجوز سفارشی ماژول‌های نصب‌شده روی accounts.CustomUser — گام ۷ ماژولارسازی.

هر ماژول مجوزهایش را در `modules/<m>/module.py` (PERMISSIONS) اعلام می‌کند و هسته نام هیچ
مجوز ماژولی را نمی‌داند. این گیرندهٔ post_migrate فقط ردیف‌های نبوده را می‌سازد:
هیچ ردیفی حذف نمی‌شود و نام ردیف موجود عوض نمی‌شود (همان رفتار create_permissions جنگو).
ردیف مجوز ماژولی که بعداً حذف شود هم دست‌نخورده می‌ماند تا انتساب نقش‌ها از بین نرود.
"""
from django.apps import apps as global_apps
from django.conf import settings
from django.db import DEFAULT_DB_ALIAS, router


def create_module_permissions(app_config=None, verbosity=2, using=DEFAULT_DB_ALIAS, apps=global_apps, **kwargs):
    from platform_core.module_catalog import installed_module_permissions

    try:
        Permission = apps.get_model('auth', 'Permission')
        ContentType = apps.get_model('contenttypes', 'ContentType')
        apps.get_model('accounts', 'CustomUser')
    except LookupError:
        return 0
    if not router.allow_migrate_model(using, Permission):
        return 0

    declared = installed_module_permissions()
    if not declared:
        return 0

    content_type, _ = ContentType.objects.db_manager(using).get_or_create(app_label='accounts', model='customuser')
    existing = set(
        Permission.objects.using(using).filter(content_type=content_type).values_list('codename', flat=True)
    )
    missing = [
        Permission(codename=codename, name=name, content_type=content_type)
        for codename, name in declared
        if codename not in existing
    ]
    if missing:
        Permission.objects.using(using).bulk_create(missing)
        if verbosity >= 2:
            for perm in missing:
                print(f"Adding module permission '{perm.codename}'")
    return len(missing)


def strip_section_permissions_from_roles(app_config=None, verbosity=2, using=DEFAULT_DB_ALIAS, apps=global_apps, **kwargs):
    """
    طرح ۲.۲ (ت۲ و ت۱۱): نقش سامانه‌ای (Group / CustomRole) و تیک مستقیم کاربر فقط مجوز سامانه‌ای می‌پذیرند. پیوند با مجوزی
    که ماژولش اکنون «بخشی» اعلام کرده برداشته می‌شود؛ موتور مجوز (scoped_permissions) این پیوندها را از پیش
    نادیده می‌گیرد، پس اثر رفتاری ندارد و فقط فهرست نقش را با واقعیت یکی می‌کند. خود ردیف مجوز، بسته‌ها و
    تفاوت‌های کاربران دست نمی‌خورند. هر بار migrate اجرا می‌شود و بی‌کد بخشی کاری نمی‌کند.
    """
    from accounts.scoped_permissions import section_permission_codes

    codes = section_permission_codes()
    if not codes:
        return 0
    try:
        Group = apps.get_model('auth', 'Group')
    except LookupError:
        return 0
    if not router.allow_migrate_model(using, Group):
        return 0
    section_perm = dict(permission__content_type__app_label='accounts', permission__codename__in=codes)
    deleted, _ = Group.permissions.through.objects.using(using).filter(**section_perm).delete()
    # تیک مستقیم کاربر روی مجوز بخشی هم بی‌اثر است (ت۲)؛ همین‌جا پاک می‌شود
    User = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))
    ticks, _ = User.user_permissions.through.objects.using(using).filter(**section_perm).delete()
    if (deleted or ticks) and verbosity >= 2:
        print(f"Removed {deleted} role links and {ticks} direct ticks of section-scope permissions")
    return deleted + ticks
