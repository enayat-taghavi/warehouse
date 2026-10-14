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

        # ثبت موجودیت‌ها و JOINهای کالا در رجیستری پلتفرم (گام ۳-ب)
        from inventory.report_entities import register_inventory_report_entities
        register_inventory_report_entities()
        contribute('report_registrars', register_inventory_report_entities)
