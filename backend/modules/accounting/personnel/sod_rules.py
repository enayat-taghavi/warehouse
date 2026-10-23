"""
قوانین تفکیک وظایف (SoD) اختصاصی ماژول حسابداری و پرسنلی (accounting/personnel).
این قوانین در AppConfig.ready() از طریق contribute('sod_rules', rule) در رجیستری پلتفرم ثبت می‌شوند.
"""

SOD_RULES = [
    # --- سامانه کارکرد و مالی (Personnel & Payroll) ---
    # ۱. کارمند / اپراتور
    {
        'app_module': 'personnel',
        'role_code': 'operator',
        'role_title_fa': 'کارمند / اپراتور ثبت کارکرد',
        'page_route': '/attendance',
        'action_code': 'approve_attendance_period',
        'action_title_fa': 'تایید و ارسال نهایی کارکرد ماهانه',
        'is_prohibited': True,
        'prohibition_reason_fa': 'کارمند فاقد صلاحیت اداری جهت تایید نهایی کارکرد ماهانه است.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'operator',
        'role_title_fa': 'کارمند / اپراتور ثبت کارکرد',
        'page_route': '/profiles',
        'action_code': 'approve_personnel_profile',
        'action_title_fa': 'تصویب یا فعال‌سازی احکام پرونده پرسنل',
        'is_prohibited': True,
        'prohibition_reason_fa': 'کارمند مجاز به تصویب احکام یا تغییر وضعیت پرونده‌ها نیست.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'operator',
        'role_title_fa': 'کارمند / اپراتور ثبت کارکرد',
        'page_route': '/finance-cartable',
        'action_code': 'view_and_calculate_payroll',
        'action_title_fa': 'محاسبه حقوق و مشاهده دستمزد دیگران',
        'is_prohibited': True,
        'prohibition_reason_fa': 'جهت حفظ محرمانگی حقوق، دسترسی به ارقام مالی و دیسکت‌ها برای اپراتور مسدود است.'
    },

    # ۲. سرپرست انبار
    {
        'app_module': 'personnel',
        'role_code': 'supervisor',
        'role_title_fa': 'سرپرست انبار (میدانی)',
        'page_route': '/profiles',
        'action_code': 'edit_base_wage_and_bonuses',
        'action_title_fa': 'تعیین یا تغییر حقوق پایه، حق مسکن و ضرایب مالی',
        'is_prohibited': True,
        'prohibition_reason_fa': 'تعیین دستمزد و ضرایب مالی در صلاحیت امور مالی و کارگزینی است، نه سرپرست میدانی.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'supervisor',
        'role_title_fa': 'سرپرست انبار (میدانی)',
        'page_route': '/finance-cartable',
        'action_code': 'approve_payroll_finance',
        'action_title_fa': 'تایید محاسبات مالی حقوق یا دیسکت بیمه/مالیات',
        'is_prohibited': True,
        'prohibition_reason_fa': 'تایید مالی و محاسبات حقوق در حیطه وظایف حسابداری است.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'supervisor',
        'role_title_fa': 'سرپرست انبار (میدانی)',
        'page_route': '/treasury-cartable',
        'action_code': 'disburse_treasury_payment',
        'action_title_fa': 'واریز وجه یا دانلود دیسکت‌های بانکی پایا/ساتنا',
        'is_prohibited': True,
        'prohibition_reason_fa': 'سرپرست انبار دسترسی به عملیات واریز خزانه‌داری ندارد.'
    },

    # ۳. حسابدار / امور مالی
    {
        'app_module': 'personnel',
        'role_code': 'accountant',
        'role_title_fa': 'حسابدار / امور مالی',
        'page_route': '/attendance',
        'action_code': 'create_daily_attendance_entry',
        'action_title_fa': 'ثبت اولیه یا تغییر مستقیم روزهای حضور میدانی در انبار',
        'is_prohibited': True,
        'prohibition_reason_fa': 'حسابدار نباید ساعات حضور میدانی تولید کند؛ هرگونه اصلاح باید از طریق ارجاع به بازنگری انجام شود.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'accountant',
        'role_title_fa': 'حسابدار / امور مالی',
        'page_route': '/manager-approvals',
        'action_code': 'authorize_manager_payment',
        'action_title_fa': 'صدور مجوز نهایی پرداخت بدون امضای مدیر شرکت',
        'is_prohibited': True,
        'prohibition_reason_fa': 'صدور مجوز پرداخت فقط با امضا و تایید مدیرعامل / مدیر شرکت امکان‌پذیر است.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'accountant',
        'role_title_fa': 'حسابدار / امور مالی',
        'page_route': '/treasury-cartable',
        'action_code': 'disburse_direct_payment',
        'action_title_fa': 'واریز مستقیم وجه و خزانه‌داری بدون تفکیک نقش',
        'is_prohibited': True,
        'prohibition_reason_fa': 'بر اساس اصل تفکیک وظایف، حسابدار نباید مجری واریز وجه باشد.'
    },

    # ۴. مدیر شرکت
    {
        'app_module': 'personnel',
        'role_code': 'manager',
        'role_title_fa': 'مدیر شرکت / مدیرعامل',
        'page_route': '/attendance',
        'action_code': 'input_bulk_attendance_records',
        'action_title_fa': 'ورود دستی و روزمره داده‌های تردد ۳۱ روزه پرسنل',
        'is_prohibited': True,
        'prohibition_reason_fa': 'ورود روزمره داده‌های تردد وظیفه رده عملیاتی است و مدیر وظیفه نظارت و تصویب را دارد.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'manager',
        'role_title_fa': 'مدیر شرکت / مدیرعامل',
        'page_route': '/treasury-cartable',
        'action_code': 'disburse_treasury_paya',
        'action_title_fa': 'انتقال مستقیم بانکی بدون ثبت در کارتابل خزانه‌داری',
        'is_prohibited': True,
        'prohibition_reason_fa': 'مدیر صادرکننده مجوز هزینه است و عملیات فنی بانکی بر عهده خزانه‌دار است.'
    },

    # ۵. خزانه‌دار / متصدی پرداخت
    {
        'app_module': 'personnel',
        'role_code': 'treasury',
        'role_title_fa': 'خزانه‌دار و متصدی پرداخت',
        'page_route': '/finance-cartable',
        'action_code': 'modify_payroll_calculations',
        'action_title_fa': 'تغییر مبالغ محاسبه‌شده حقوق، بیمه یا مالیات',
        'is_prohibited': True,
        'prohibition_reason_fa': 'خزانه‌دار صرفاً مجری دستور پرداخت مصوب است و نباید مبالغ را تغییر دهد.'
    },
    {
        'app_module': 'personnel',
        'role_code': 'treasury',
        'role_title_fa': 'خزانه‌دار و متصدی پرداخت',
        'page_route': '/profiles',
        'action_code': 'modify_employment_contracts',
        'action_title_fa': 'تغییر احکام استخدامی و ساعات کارکرد',
        'is_prohibited': True,
        'prohibition_reason_fa': 'خزانه‌دار دسترسی به تغییر احکام یا ساعات کارکرد ندارد.'
    },
]

SOD_ROUTE_RULES = [
    (10, ('attendance',), '/attendance'),
    (20, ('profiles',), '/profiles'),
    (30, ('finance', 'monthly-payroll'), '/finance-cartable'),
    (40, ('treasury',), '/treasury-cartable'),
    (50, ('manager',), '/manager-approvals'),
]


def resolve_personnel_sod_action(request, view, action_name, method, page_route) -> str | None:
    """
    ریزالور اکشن تفکیک وظایف (SoD) برای ماژول حسابداری و پرسنلی.
    """
    if action_name in ['approve_manager', 'approve_finance', 'approve_supervisor']:
        return f"approve_{action_name.split('_')[-1]}"
    elif action_name in ['disburse_period', 'disburse_single_payroll', 'disburse_fleet']:
        return 'disburse_treasury_payment'
    elif action_name == 'create' and page_route == '/attendance':
        return 'create_daily_attendance_entry'
    elif action_name in ['lock_period', 'approve_period'] and page_route == '/attendance':
        return 'approve_attendance_period'
    elif method in ['POST', 'PUT', 'PATCH'] and 'wage' in str(getattr(request, 'data', '')):
        return 'edit_base_wage_and_bonuses'
    return None

