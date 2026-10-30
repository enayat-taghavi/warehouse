from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inventory'

    def ready(self):
        import inventory.signals

        # ثبت مدل‌های قابل بازگردانی کالاهای انبار (گام ۳-ب)
        from platform_core.registry import contribute
        from inventory.models import Item, CountTask
        contribute('rollback_models', {'Item': Item, 'CountTask': CountTask})

        # منبع فایل تصاویر کالا برای مقصدهای همگام‌سازی فایل (گوگل‌درایو در ماژول دیگر)
        from inventory.file_sync_source import ITEM_PHOTO_FILE_SOURCE
        contribute('file_sync_sources', ITEM_PHOTO_FILE_SOURCE)

        # ثبت موجودیت‌ها و JOINهای کالا در رجیستری پلتفرم (گام ۳-ب)
        from inventory.report_entities import register_inventory_report_entities
        register_inventory_report_entities()
        contribute('report_registrars', register_inventory_report_entities)

        # ثبت مدل‌های هدف نظر در هسته ارتباطات (فاز ۴ گام ۲)
        contribute('comment_target_models', 'item')
        contribute('comment_target_models', 'counttask')
        contribute('comment_target_models', 'doctask')

        # دسترسی به نظرات کالا و تسک‌ها همان دیدِ نماهای خودشان است (E6 بازبینی چت):
        # دامنهٔ انبار + دامنهٔ شرکت با همان scope_tenant_queryset که item/count/doc views به کار می‌برند
        from inventory.models import DocTask

        def _inventory_comment_target_access(user, target):
            if isinstance(target, Item):
                wh_id, company_field = target.warehouse_id, 'warehouse__company_id'
            elif isinstance(target, (CountTask, DocTask)):
                item = getattr(target, 'item', None)
                if item is None:
                    return False
                wh_id, company_field = item.warehouse_id, 'item__warehouse__company_id'
            else:
                return None
            from common.warehouse_scope import can_access_warehouse
            from common.tenant_scope import scope_tenant_queryset
            if not can_access_warehouse(user, wh_id):
                return False
            scoped = scope_tenant_queryset(type(target).objects.filter(pk=target.pk), user, company_field=company_field)
            return scoped.exists()

        contribute('comment_target_access', _inventory_comment_target_access)
