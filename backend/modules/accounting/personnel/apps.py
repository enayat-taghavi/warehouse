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
                        '/api/personnel/user-company-access', '/api/personnel/expense-heads'):
            _contribute('company_section_api_prefixes', _prefix)
        # سرفصل‌های هزینه هم دادهٔ لایهٔ شرکت‌اند و view خودش بخش `expense_heads` را می‌سنجد (ص۳ طرح ۳.۴)
        _contribute('company_link_api_prefixes', '/api/personnel/expense-heads')
        # شرکت تازه فهرست پیش‌فرض سرفصل‌های هزینه را می‌گیرد (ص۵ طرح ۳.۴)
        from django.db.models.signals import post_save
        from companies.models import Company
        from personnel.signals import seed_expense_heads_for_new_company
        post_save.connect(seed_expense_heads_for_new_company, sender=Company,
                          dispatch_uid='personnel_seed_expense_heads')


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
        # چاپ / PDF فاکتور (د۷ طرح ۴.۱)؛ API هسته پیش از آن can_view را می‌سنجد
        from personnel.invoice_print import printable_invoice
        contribute(f'printable:{INVOICE_ENTITY}', printable_invoice)
        # نرخ مالیات شرکت و سری شمارهٔ داخلی فاکتور (د۲ و د۴ طرح ۴.۱)
        from personnel.invoice_services import INVOICE_NUMBER_SERIES, VAT_RATE_SETTING
        contribute('company_settings', VAT_RATE_SETTING)
        contribute('numbering_series', INVOICE_NUMBER_SERIES)
        # تنخواه سطح شرکت: شارژ و صورت‌حساب روی موتور، با دیدن، پیوست و قفل (ص۲ تا ص۴ و ص۱۱ طرح ۳.۶)
        from personnel import workflows as _wf
        for _spec, _kind, _resolver, _view, _attach, _locked, _company in (
            (_wf.PETTY_CHARGE_WORKFLOW_SPEC, _wf.PETTY_CHARGE_ENTITY, _wf.resolve_petty_tx, _wf.can_view_petty_tx,
             _wf.can_attach_petty_tx, _wf.is_petty_tx_locked, _wf.petty_tx_company_id),
            (_wf.PETTY_STATEMENT_WORKFLOW_SPEC, _wf.PETTY_STATEMENT_ENTITY, _wf.resolve_petty_statement,
             _wf.can_view_petty_statement, _wf.can_attach_petty_statement, _wf.is_petty_statement_locked,
             _wf.petty_statement_company_id),
        ):
            contribute('workflows', _spec)
            contribute(f'entity_resolver:{_kind}', _resolver)
            contribute(f'can_view:{_kind}', _view)
            contribute(f'can_attach:{_kind}', _attach)
            contribute(f'is_locked:{_kind}', _locked)
            contribute(f'company_of:{_kind}', _company)
        # پروندهٔ پرسنل و درخواست تغییر روی موتور، با دیدن، پیوست، قفل و گیت پیش از اقدام (د۱ تا د۳ طرح ۴.۳)
        for _spec, _kind, _resolver, _view, _attach, _locked, _company in (
            (_wf.PERSONNEL_PROFILE_WORKFLOW_SPEC, _wf.PERSONNEL_ENTITY, _wf.resolve_personnel, _wf.can_view_personnel,
             _wf.can_attach_personnel, _wf.is_personnel_locked, _wf.personnel_company_id),
            (_wf.PERSONNEL_CHANGE_WORKFLOW_SPEC, _wf.PERSONNEL_CHANGE_ENTITY, _wf.resolve_personnel_change,
             _wf.can_view_personnel_change, _wf.can_attach_personnel_change, _wf.is_personnel_change_locked,
             _wf.personnel_change_company_id),
        ):
            contribute('workflows', _spec)
            contribute(f'entity_resolver:{_kind}', _resolver)
            contribute(f'can_view:{_kind}', _view)
            contribute(f'can_attach:{_kind}', _attach)
            contribute(f'is_locked:{_kind}', _locked)
            contribute(f'company_of:{_kind}', _company)
        contribute(f'can_act:{_wf.PERSONNEL_ENTITY}', _wf.can_act_personnel)
        # کارکرد ماهانه (دورهٔ بخش + ماه) روی موتور، با دیدن، پیوست، قفل و گیت پیش از اقدام (د۲ طرح ۴.۴)
        contribute('workflows', _wf.ATTENDANCE_PERIOD_WORKFLOW_SPEC)
        contribute(f'entity_resolver:{_wf.ATTENDANCE_PERIOD_ENTITY}', _wf.resolve_attendance_period)
        contribute(f'can_view:{_wf.ATTENDANCE_PERIOD_ENTITY}', _wf.can_view_attendance_period)
        contribute(f'can_attach:{_wf.ATTENDANCE_PERIOD_ENTITY}', _wf.can_attach_attendance_period)
        contribute(f'is_locked:{_wf.ATTENDANCE_PERIOD_ENTITY}', _wf.is_attendance_period_locked)
        contribute(f'company_of:{_wf.ATTENDANCE_PERIOD_ENTITY}', _wf.attendance_period_company_id)
        contribute(f'can_act:{_wf.ATTENDANCE_PERIOD_ENTITY}', _wf.can_act_attendance_period)
        # حقوق ماهانه: نمونهٔ جدا روی همان دوره (د۴ طرح ۴.۵)
        contribute('workflows', _wf.PAYROLL_PERIOD_WORKFLOW_SPEC)
        contribute(f'entity_resolver:{_wf.PAYROLL_PERIOD_ENTITY}', _wf.resolve_payroll_period)
        contribute(f'can_view:{_wf.PAYROLL_PERIOD_ENTITY}', _wf.can_view_payroll_period)
        contribute(f'can_attach:{_wf.PAYROLL_PERIOD_ENTITY}', _wf.can_attach_payroll_period)
        contribute(f'is_locked:{_wf.PAYROLL_PERIOD_ENTITY}', _wf.is_payroll_period_closed)
        contribute(f'company_of:{_wf.PAYROLL_PERIOD_ENTITY}', _wf.payroll_period_company_id)
        # چاپ پروندهٔ پرسنلی با پوشش د۶ (د۸ طرح ۴.۳)
        from personnel.personnel_print import printable_personnel_profile
        contribute(f'printable:{_wf.PERSONNEL_ENTITY}', printable_personnel_profile)
        # شمارهٔ ۲.۸ و چاپ صورت‌حساب تنخواه (د۹ و د۱۳ طرح ۴.۲)
        from personnel.petty_lifecycle import PETTY_STATEMENT_NUMBER_SERIES
        from personnel.petty_print import printable_petty_statement
        contribute('numbering_series', PETTY_STATEMENT_NUMBER_SERIES)
        contribute(f'printable:{_wf.PETTY_STATEMENT_ENTITY}', printable_petty_statement)
        # گیرندهٔ کسر بدهی تنخواه از حقوق (د۳ طرح ۴.۵): روش «کسر از حقوق» در تنخواه باز می‌شود
        from personnel.petty_settlements import PAYROLL_DEDUCTION_POINT
        from personnel.payroll_engine import confirm_record_petty_deductions
        contribute(PAYROLL_DEDUCTION_POINT, confirm_record_petty_deductions)
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
        contribute('permission_aliases:count_supervisor_exclusion', 'perm_approve_personnel_supervisor')

        # ثبت فیلتر قلمرو لاگ‌های ممیزی (گام ۲)
        from personnel.audit_scope import accounting_audit_scope_filter
        contribute('audit_app_scope_filters', ('accounting', accounting_audit_scope_filter))
