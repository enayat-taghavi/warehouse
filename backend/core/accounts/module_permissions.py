"""
ساخت ردیف‌های مجوز سفارشی ماژول‌های نصب‌شده روی accounts.CustomUser — گام ۷ ماژولارسازی.

هر ماژول مجوزهایش را در `modules/<m>/module.py` (PERMISSIONS) اعلام می‌کند و هسته نام هیچ
مجوز ماژولی را نمی‌داند. این گیرندهٔ post_migrate فقط ردیف‌های نبوده را می‌سازد:
هیچ ردیفی حذف نمی‌شود و نام ردیف موجود عوض نمی‌شود (همان رفتار create_permissions جنگو).
ردیف مجوز ماژولی که بعداً حذف شود هم دست‌نخورده می‌ماند تا انتساب نقش‌ها از بین نرود.
"""
from django.apps import apps as global_apps
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
