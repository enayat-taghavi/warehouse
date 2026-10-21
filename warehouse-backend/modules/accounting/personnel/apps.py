from django.apps import AppConfig


class PersonnelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'personnel'
    verbose_name = 'مدیریت پرسنل، کارکرد و ناوگان'

    def ready(self):
        # فاز ۳ §۳.۱ — ثبت ماژول حسابداری در رجیستری قابلیت‌ها. این خودِ رجیستری،
        # ماژول‌های ممیزیِ حسابداری (audit_modules) را هم در هسته ثبت می‌کند.
        from platform_core.registry import register_module
        from platform_core.module_catalog import MODULE_CATALOG
        if 'accounting' in MODULE_CATALOG:
            register_module(MODULE_CATALOG['accounting'])

        # دسترسی مشتق از عضویت بخش‌های پروژه در قواعد دسترسی شرکتِ هسته (گام ۳)
        from companies.access import register_derived_company_source
        from personnel.company_access import section_derived_company_source
        register_derived_company_source(section_derived_company_source)


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

            def _company_access_checker(user, company_id=None, **kwargs):
                # D3: اتصال فقط با workspace_full یا سوپریوزر؛ شرکت از روی شناسه خوانده می‌شود
                from personnel.models import Company
                company = Company.objects.filter(id=company_id).first() if company_id else None
                return check_user_company_access(user, company, require_write=True)

            def _company_batch_runner(limit=20, ignore_schedule=False, company_id=None):
                from personnel.management.commands.run_gdrive_sync_worker import Command as PersonnelWorkerCommand
                pw = PersonnelWorkerCommand()
                return pw.process_batch(limit=limit, company_id=company_id, ignore_schedule=ignore_schedule)

            register_gdrive_target_handler(
                target='company',
                exchange_handler=lambda code, **kwargs: exchange_code_and_store_credentials(code, kwargs.get('company_id')),
                access_checker=_company_access_checker,
                redirect_builder=lambda company_id, status: f"/app/operations/companies/{company_id}?tab=gdrive&gdrive={status}",
                batch_runner=_company_batch_runner,
            )
        except Exception:
            pass

        # ثبت موجودیت‌های گزارش حسابداری در رجیستری پلتفرم (گام ۳-ب)
        try:
            from personnel.report_entities import register_accounting_report_entities
            from platform_core.registry import contribute
            register_accounting_report_entities()
            contribute('report_registrars', register_accounting_report_entities)
        except Exception:
            pass

        # قوانین تفکیک وظایف (SoD) ماژول حسابداری
        from platform_core.registry import contribute
        from personnel.sod_rules import SOD_RULES, SOD_ROUTE_RULES, resolve_personnel_sod_action
        for rule in SOD_RULES:
            contribute('sod_rules', rule)
        for rule in SOD_ROUTE_RULES:
            contribute('sod_route_rules', rule)
        contribute('sod_action_resolvers', resolve_personnel_sod_action)

        # حل‌کننده نقش‌های ماژول حسابداری برای میان‌افزار احراز هویت
        from personnel.role_resolver import resolve_personnel_roles
        contribute('role_resolver', ('accounting', resolve_personnel_roles))

        # ثبت مدل پیکربندی گوگل‌درایو شرکت‌ها در رجیستری برای هسته
        from personnel.models import CompanyGoogleDriveConfig
        contribute('company_gdrive_config_model', CompanyGoogleDriveConfig)

        # مسدودکننده‌های حذف شرکت ماژول حسابداری (گام ۴)
        contribute('company_delete_blockers', (10, 'projects', "این شرکت دارای پروژه‌های ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (30, 'personnel_profiles', "این شرکت دارای پرونده‌های پرسنلی ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (40, 'monthly_work_periods', "این شرکت دارای دوره‌های کارکرد ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (50, 'counterparties', "این شرکت دارای طرف‌حساب‌های مالی ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (60, 'fiscal_periods', "این شرکت دارای دوره‌های مالی تعریف‌شده است و نمی‌توان آن را حذف کرد."))

        # دسترسی نوشتن ساختار سازمانی ماژول حسابداری (گام ۴)
        contribute('org_structure_write_perms', 'accounts.perm_approve_personnel_manager')

        # راهبر تشکیلات (بی view_sys_users) فهرست کمینهٔ کاربران را برای انتساب به بخش‌ها می‌بیند (گام ۷)
        contribute('user_directory_perms', 'perm_manage_projects_sections')
        # alias مجوز (گام ۸): سرپرست کارگاه سرپرست شمارش ماژول‌های دیگر حساب نمی‌شود
        contribute('permission_aliases:count_supervisor_exclusion', 'can_act_as_workshop_supervisor')

        # فیلتر اعضای شرکت در دایرکتوری کاربران بر مبنای بخش‌های پروژه (گام ۴)
        from personnel.company_access import build_section_member_q
        contribute('company_member_q_builders', build_section_member_q)

        # ثبت فیلتر قلمرو لاگ‌های ممیزی (گام ۲)
        from personnel.audit_scope import accounting_audit_scope_filter
        contribute('audit_app_scope_filters', ('accounting', accounting_audit_scope_filter))
