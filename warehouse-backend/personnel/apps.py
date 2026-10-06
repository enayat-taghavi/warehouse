from django.apps import AppConfig


class PersonnelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'personnel'
    verbose_name = 'مدیریت پرسنل، کارکرد و ناوگان'

    def ready(self):
        # فاز ۳ §۳.۱ — ثبت ماژول حسابداری در رجیستری قابلیت‌ها. این خودِ رجیستری،
        # ماژول‌های ممیزیِ حسابداری (audit_modules) را هم در هسته ثبت می‌کند.
        from platform_core.registry import register_module
        from platform_core.module_catalog import ACCOUNTING_SPEC
        register_module(ACCOUNTING_SPEC)
        
        # بارگذاری سیگنال‌های خودکار همگام‌سازی شرکت و مدارک
        try:
            import personnel.signals
        except ImportError:
            pass

        # بارگذاری سیگنال‌های صف همگام‌سازی گوگل‌درایو
        try:
            import personnel.signals_gdrive
        except ImportError:
            pass

        # ثبت هندلر گوگل‌درایو شرکت‌ها در رجیستری هسته (فاز ۲ - D1)
        try:
            from settings_core.google_drive_client import register_gdrive_target_handler
            from personnel.google_drive_service import exchange_code_and_store_credentials
            from personnel.google_drive_views import check_user_company_access

            def _company_batch_runner(limit=20, ignore_schedule=False, company_id=None):
                from personnel.management.commands.run_gdrive_sync_worker import Command as PersonnelWorkerCommand
                pw = PersonnelWorkerCommand()
                return pw.process_batch(limit=limit, company_id=company_id, ignore_schedule=ignore_schedule)

            register_gdrive_target_handler(
                target='company',
                exchange_handler=lambda code, **kwargs: exchange_code_and_store_credentials(code, kwargs.get('company_id')),
                access_checker=lambda user, **kwargs: check_user_company_access(user, kwargs.get('company_id')),
                redirect_builder=lambda company_id, status: f"/app/operations/companies/{company_id}?tab=gdrive&gdrive={status}",
                batch_runner=_company_batch_runner,
            )
        except Exception:
            pass

