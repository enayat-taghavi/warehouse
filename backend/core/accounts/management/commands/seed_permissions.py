from django.core.management.base import BaseCommand
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from accounts.models import CustomUser

class Command(BaseCommand):
    help = 'Seeds custom permissions for the Warehouse application'

    def handle(self, *args, **kwargs):
        content_type = ContentType.objects.get_for_model(CustomUser)
        
        permissions = [
            # System Tabs (منوی اصلی)
            {'codename': 'view_sys_dashboard', 'name': 'داشبورد مانیتورینگ کلی'},
            {'codename': 'view_sys_users', 'name': 'مدیریت کاربران و نقش‌ها'},
            {'codename': 'view_sys_projects', 'name': 'مدیریت انبارها و پروژه‌ها'},
            {'codename': 'view_sys_id_cards', 'name': 'صدور کارت پرسنلی'},
            {'codename': 'view_sys_export', 'name': 'صدور فایل تغذیه'},
            {'codename': 'view_sys_settings', 'name': 'تنظیمات سیستم'},
            {'codename': 'view_sys_reports', 'name': 'گزارش‌ساز'},
            {'codename': 'perm_sys_settings', 'name': 'تنظیمات کلان سیستم'},
            {'codename': 'perm_sys_logs', 'name': 'مشاهده لاگ‌های امنیتی (Audit)'},
            {'codename': 'perm_usr_add', 'name': 'ثبت پرسنل جدید'},
            {'codename': 'perm_usr_edit', 'name': 'ویرایش پرونده پرسنلی'},
            {'codename': 'perm_usr_role', 'name': 'تغییر ساختار سازمانی و نقش‌ها'},
            {'codename': 'perm_workflow_thresholds', 'name': 'تنظیم سقف مبلغ و یادآوری گردش کار'},

            # Sensitive & Critical (حساس و بحرانی)
            {'codename': 'perm_rollback_data', 'name': 'بازگردانی و احیای جامع داده‌ها'},
            {'codename': 'perm_rollback_single', 'name': 'بازگردانی تکی یک فیلد یا سند'},
            {'codename': 'perm_rollback_bulk', 'name': 'بازگردانی گروهی و زمانی تراکنش‌ها'},
            {'codename': 'perm_restore_deleted', 'name': 'احیای داده‌های حذف‌شده'},
            {'codename': 'perm_sys_backup_manage', 'name': 'ایجاد و مدیریت فایل‌های پشتیبان'},
            {'codename': 'perm_sys_backup_restore', 'name': 'بازیابی پایگاه داده'},
            {'codename': 'perm_sys_audit_export', 'name': 'خروجی گرفتن و آرشیو لاگ‌های ممیزی'},
            {'codename': 'perm_sys_purge_logs', 'name': 'پاکسازی و حذف قطعی لاگ‌های ممیزی'},
            {'codename': 'perm_sys_hard_delete', 'name': 'حذف فیزیکی و قطعی داده‌ها'},
            {'codename': 'perm_sys_emergency_freeze', 'name': 'فریز اضطراری و قفل سراسری انبارها'},
            {'codename': 'perm_sys_factory_reset', 'name': 'بازنشانی مقادیر اولیه و ریست سیستم'},
        ]

        # مجوزهای سفارشی ماژول‌های نصب‌شده از module.py خود ماژول‌ها (هسته نامشان را نمی‌داند)
        from platform_core.module_catalog import installed_module_permissions
        permissions += [{'codename': codename, 'name': name} for codename, name in installed_module_permissions()]

        created_count = 0
        updated_count = 0
        for p in permissions:
            perm, created = Permission.objects.get_or_create(
                codename=p['codename'],
                content_type=content_type,
                defaults={'name': p['name']}
            )
            if created:
                created_count += 1
            else:
                if perm.name != p['name']:
                    perm.name = p['name']
                    perm.save()
                    updated_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully processed permissions: {created_count} created, {updated_count} updated.'))
