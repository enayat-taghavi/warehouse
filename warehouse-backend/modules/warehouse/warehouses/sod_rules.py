"""
قوانین تفکیک وظایف (SoD) اختصاصی ماژول انبارداری و انبارگردانی (warehouse/warehouses).
این قوانین در AppConfig.ready() از طریق contribute('sod_rules', rule) در رجیستری پلتفرم ثبت می‌شوند.
"""

SOD_RULES = [
    # --- سامانه انبارداری و انبارگردانی (Warehouse & Inventory) ---
    # ۶. انبارگردان / شمارشگر (Counter)
    {
        'app_module': 'warehouse',
        'role_code': 'counter',
        'role_title_fa': 'انبارگردان / شمارشگر کور',
        'page_route': '/manager-review',
        'action_code': 'finalize_inventory_count',
        'action_title_fa': 'تایید نهایی و بستن دوره انبارگردانی',
        'is_prohibited': True,
        'prohibition_reason_fa': 'شمارشگر کور فقط مقدار فیزیکی را وارد می‌کند و حق بستن دوره یا دیدن موجودی دفتری را ندارد.'
    },
    {
        'app_module': 'warehouse',
        'role_code': 'counter',
        'role_title_fa': 'انبارگردان / شمارشگر کور',
        'page_route': '/customs',
        'action_code': 'view_customs_and_costs',
        'action_title_fa': 'مشاهده فیلدهای گمرکی، قیمت‌ها و ارزش کالاها',
        'is_prohibited': True,
        'prohibition_reason_fa': 'شمارشگر انبار نباید اطلاعات قیمتی و ارزش مالی کالاها را ببیند.'
    },

    # ۷. سرپرست شمارش انبار
    {
        'app_module': 'warehouse',
        'role_code': 'warehouse_supervisor',
        'role_title_fa': 'سرپرست انبار و شمارش',
        'page_route': '/feeding',
        'action_code': 'approve_mt_feeding_export',
        'action_title_fa': 'تایید مستقیم تغذیه MT و اعمال اسناد سیستمی به تنهایی',
        'is_prohibited': True,
        'prohibition_reason_fa': 'تایید نهایی صدور تغذیه سیستمی نیازمند تایید مدیر پروژه/ناظر عالی است.'
    },
]
