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

        # بخش‌های مجوز شرکت از ماژول حسابداری (طرح مجوزهای بخش‌به‌بخش شرکت، §۵-۱)
        from platform_core.registry import contribute as _contribute
        from personnel.company_access import COMPANY_PERMISSION_SECTIONS
        _contribute('company_permission_sections', COMPANY_PERMISSION_SECTIONS)
        # نقش‌های انتساب به بخش؛ پروژه، بخش و منبع عضویتِ انتساب در هسته‌اند (طرح Project_Section_To_Core)
        from personnel.company_access import SECTION_ROLES
        _contribute('section_roles', SECTION_ROLES)
        # مسیرهای بخش‌های شرکتِ حسابداری خودشان دروازهٔ بخش دارند؛ middleware برای آن‌ها «پیوند» را کافی می‌داند
        _contribute('company_link_api_prefixes', '/api/personnel/compan')
        _contribute('company_link_api_prefixes', '/api/personnel/user-company-access')
        # همان مسیرها (و دسترسی کاربران) برای حالت محدود استودیو بدون قلمرو حسابداری باز است؛ هر view بخش را می‌سنجد
        for _prefix in ('/api/personnel/companies', '/api/personnel/company-documents', '/api/personnel/company-bank-accounts',
                        '/api/personnel/company-board-members', '/api/personnel/company-fiscal-periods',
                        '/api/personnel/user-company-access'):
            _contribute('company_section_api_prefixes', _prefix)


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

            register_gdrive_target_handler(
                target='company',
                exchange_handler=lambda code, **kwargs: exchange_code_and_store_credentials(code, kwargs.get('company_id')),
                access_checker=_company_access_checker,
                redirect_builder=lambda company_id, status: f"/app/operations/companies/{company_id}?tab=gdrive&gdrive={status}",
            )
            # the core worker runs the company queue (2.6-c2); scan_all walks module documents, so it stays a module hook
            from personnel.google_drive_service import execute_company_scan_all
            _contribute('gdrive_scan_all', execute_company_scan_all)
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

        from platform_core.registry import contribute

        # گردش فاکتور روی موتور گردش کار هسته (ت۱۷ طرح ۲.۳)
        from personnel.workflows import INVOICE_ENTITY, INVOICE_WORKFLOW_SPEC, resolve_invoice
        contribute('workflows', INVOICE_WORKFLOW_SPEC)
        contribute(f'entity_resolver:{INVOICE_ENTITY}', resolve_invoice)
        # دیدن، پیوست و قفل فاکتور (ص۱، ص۴ و ص۵ طرح ۲.۶)
        from personnel.workflows import can_attach_invoice, can_view_invoice, invoice_company_id, is_invoice_locked
        contribute(f'can_view:{INVOICE_ENTITY}', can_view_invoice)
        contribute(f'can_attach:{INVOICE_ENTITY}', can_attach_invoice)
        contribute(f'is_locked:{INVOICE_ENTITY}', is_invoice_locked)
        contribute(f'company_of:{INVOICE_ENTITY}', invoice_company_id)
        # لاگ ممیزی فاکتور از قلاب دیدن همان سند پیروی می‌کند (ص۱۰ طرح ۲.۶)
        contribute('audit_entity_kinds', ('ExpenseInvoice', INVOICE_ENTITY))
        # بخش‌های قابل خاموش شدن (ص۱۲ طرح ۲.۶)؛ همین کدها در sectionKey منو و مسیر فرانت می‌آیند
        contribute('toggle_sections', ('accounting.fleet', 'ناوگان و تردد خودرو'))
        contribute('toggle_sections', ('accounting.invoices', 'فاکتورها'))
        contribute('toggle_sections', ('accounting.petty_cash', 'تن‌خواه'))

        # حل‌کننده نقش‌های ماژول حسابداری برای میان‌افزار احراز هویت
        from personnel.role_resolver import resolve_personnel_roles
        contribute('role_resolver', ('accounting', resolve_personnel_roles))

        # مسدودکننده‌های حذف شرکت ماژول حسابداری (گام ۴)
        contribute('company_delete_blockers', (30, 'personnel_profiles', "این شرکت دارای پرونده‌های پرسنلی ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (40, 'monthly_work_periods', "این شرکت دارای دوره‌های کارکرد ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (50, 'counterparties', "این شرکت دارای طرف‌حساب‌های مالی ثبت‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (60, 'fiscal_periods', "این شرکت دارای دوره‌های مالی تعریف‌شده است و نمی‌توان آن را حذف کرد."))
        contribute('company_delete_blockers', (70, 'payroll_profile', "این شرکت دارای پروندهٔ بیمه و مالیات ثبت‌شده است و نمی‌توان آن را حذف کرد."))

        # دسترسی نوشتن ساختار سازمانی ماژول حسابداری (گام ۴)
        contribute('org_structure_write_perms', 'accounts.perm_approve_personnel_manager')

        # alias مجوز (گام ۸): سرپرست کارگاه سرپرست شمارش ماژول‌های دیگر حساب نمی‌شود
        contribute('permission_aliases:count_supervisor_exclusion', 'can_act_as_workshop_supervisor')

        # ثبت فیلتر قلمرو لاگ‌های ممیزی (گام ۲)
        from personnel.audit_scope import accounting_audit_scope_filter
        contribute('audit_app_scope_filters', ('accounting', accounting_audit_scope_filter))
