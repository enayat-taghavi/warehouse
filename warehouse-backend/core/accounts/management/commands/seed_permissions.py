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
            {'codename': 'view_sys_counter', 'name': 'میزکار شمارش کور'},
            {'codename': 'view_sys_supervisor', 'name': 'کارتابل سرپرست شمارش'},
            {'codename': 'view_sys_manager_review', 'name': 'بررسی نهایی مدیر'},
            {'codename': 'view_sys_export', 'name': 'صدور فایل تغذیه'},
            {'codename': 'view_sys_recounts', 'name': 'بررسی مغایرت و بازشماری'},
            {'codename': 'view_sys_settings', 'name': 'تنظیمات سیستم'},
            {'codename': 'view_sys_reports', 'name': 'گزارش‌ساز'},
            {'codename': 'view_sys_personnel', 'name': 'مدیریت پرسنل و کارگزینی'},
            {'codename': 'view_sys_personnel_attendance', 'name': 'ثبت کارکرد پرسنل'},
            {'codename': 'view_sys_fleet_attendance', 'name': 'ثبت کارکرد ناوگان و ماشین‌آلات'},
            {'codename': 'view_sys_payroll', 'name': 'محاسبات حقوق و دستمزد پرسنل'},
            {'codename': 'view_sys_fleet_settlement', 'name': 'تسویه و محاسبات مالی ناوگان'},
            {'codename': 'perm_sys_settings', 'name': 'تنظیمات کلان سیستم'},
            {'codename': 'perm_sys_logs', 'name': 'مشاهده لاگ‌های امنیتی (Audit)'},
            {'codename': 'perm_usr_add', 'name': 'ثبت پرسنل جدید'},
            {'codename': 'perm_usr_edit', 'name': 'ویرایش پرونده پرسنلی'},
            {'codename': 'perm_usr_role', 'name': 'تغییر ساختار سازمانی و نقش‌ها'},
            {'codename': 'perm_manage_projects_sections', 'name': 'مدیریت پروژه‌ها و بخش‌ها'},
            
            # Warehouse Tabs (منوی انبار)
            {'codename': 'view_wh_dashboard', 'name': 'داشبورد انبار'},
            {'codename': 'view_wh_docs', 'name': 'مدیریت کالا (انبار)'},
            {'codename': 'view_wh_dispatch', 'name': 'تخصیص کالا (انبار)'},
            {'codename': 'view_wh_attendance', 'name': 'ثبت کارکرد و سرویس ناوگان (انبار)'},
            {'codename': 'view_wh_customs', 'name': 'فیلدهای مالی و گمرکی (انبار)'},
            {'codename': 'view_wh_doc_approvals', 'name': 'تاییدات سرپرست اسناد (انبار)'},
            {'codename': 'view_wh_feeding', 'name': 'مدیریت و تغذیه MT (انبار)'},
            {'codename': 'view_wh_feed_approvals', 'name': 'تاییدات سرپرست تغذیه (انبار)'},
            {'codename': 'view_wh_labels', 'name': 'چاپ مجدد و اسکن لیبل (انبار)'},
            {'codename': 'view_wh_label_designer', 'name': 'طراحی و کانفیگ لیبل (انبار)'},
            {'codename': 'view_wh_audit', 'name': 'رهگیری تغییرات و ممیزی (انبار)'},
            {'codename': 'view_wh_settings', 'name': 'تنظیمات انبار'},
            {'codename': 'perm_wh_create', 'name': 'تعریف کارگاه/انبار جدید'},
            {'codename': 'perm_wh_edit', 'name': 'ویرایش مشخصات انبارها'},
            {'codename': 'perm_wh_freeze', 'name': 'فریز کردن و توقف عملیات انبار'},
            
            # Records & Operations (عملیات و رکوردهای میدانی)
            {'codename': 'perm_rec_import', 'name': 'تزریق و آپلود فایل پایه (Excel)'},
            {'codename': 'perm_rec_dispatch', 'name': 'تخصیص رکورد به شمارشگر میدانی'},
            {'codename': 'perm_rec_label', 'name': 'صدور دستور چاپ لیبل و QR Code'},
            {'codename': 'perm_rec_recount', 'name': 'صدور دستور بازشماری (مغایرت)'},

            # Operational Roles & Workflow (فرآیندی، نقش‌های عملیاتی و کارتابل‌ها)
            {'codename': 'can_act_as_counter', 'name': 'شمارنده و انبارگردانی میدانی'},
            {'codename': 'can_act_as_supervisor', 'name': 'سرپرست شمارش (تایید مغایرت‌ها)'},
            {'codename': 'can_act_as_manager', 'name': 'مدیر انبار (تایید نهایی)'},
            {'codename': 'can_act_as_doc_worker', 'name': 'کارشناس اسناد مالی'},
            {'codename': 'can_act_as_doc_supervisor', 'name': 'سرپرست اسناد'},
            {'codename': 'can_act_as_operator', 'name': 'کارمند کارگاه و ثبت کارکرد'},
            {'codename': 'can_act_as_accountant', 'name': 'حسابدار و کارشناس مالی'},

            # Approvals & Actions (تاییدات و چرخه تاییدات)
            {'codename': 'view_sys_treasury', 'name': 'کارتابل خزانه‌داری و پرداخت'},
            {'codename': 'perm_doc_approve_action', 'name': 'تایید، رد و ثبت امضای اسناد'},
            {'codename': 'perm_feed_approve_action', 'name': 'تایید و اعمال فیدهای تغذیه/گمرکی'},
            {'codename': 'perm_inventory_finalize', 'name': 'تایید نهایی و بستن دوره‌های انبارگردانی'},
            {'codename': 'perm_lock_work_period', 'name': 'قفل و تایید نهایی کارکرد ماهانه'},
            {'codename': 'perm_approve_personnel_supervisor', 'name': 'تایید مرحله سرپرست انبار برای پرسنل'},
            {'codename': 'perm_approve_personnel_manager', 'name': 'تایید مرحله اول (عملیاتی) پرسنل'},
            {'codename': 'perm_approve_personnel_finance', 'name': 'تایید مرحله دوم (مالی و بانکی) پرسنل'},
            {'codename': 'perm_approve_fleet_supervisor', 'name': 'تایید مرحله سرپرست انبار برای ناوگان'},
            {'codename': 'perm_approve_fleet_manager', 'name': 'تایید مرحله اول (عملیاتی) ناوگان و خودروها'},
            {'codename': 'perm_approve_fleet_finance', 'name': 'تایید مرحله دوم (مالی و بانکی) ناوگان و خودروها'},
            {'codename': 'perm_manager_payment_authorize', 'name': 'صدور مجوز پرداخت نهایی مدیر شرکت'},
            {'codename': 'perm_treasury_disburse_action', 'name': 'ثبت واریز و تسویه نهایی خزانه‌داری'},
            {'codename': 'perm_delete_personnel_nomovement', 'name': 'حذف پرسنل فاقد سابقه کارکرد و مالی'},
            {'codename': 'perm_delete_vehicle_nomovement', 'name': 'حذف خودرو و ناوگان فاقد سابقه کارکرد و مالی'},

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
