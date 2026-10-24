from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        import accounts.signals  # noqa
        from django.db.models.signals import post_migrate
        from accounts.module_permissions import create_module_permissions, strip_section_permissions_from_roles
        # ردیف‌های مجوز سفارشی ماژول‌های نصب‌شده (اعلام‌شده در module.py هر ماژول)
        post_migrate.connect(create_module_permissions, sender=self, dispatch_uid='accounts.create_module_permissions')
        post_migrate.connect(strip_section_permissions_from_roles, sender=self,
                             dispatch_uid='accounts.strip_section_permissions_from_roles')
