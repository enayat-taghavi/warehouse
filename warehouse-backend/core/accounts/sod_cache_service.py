import json
import logging
from django.core.cache import cache
from django.db import transaction

logger = logging.getLogger(__name__)

CACHE_KEY_SOD_MATRIX = 'sod:policy_matrix'
CACHE_KEY_SOD_ROLE_MAP = 'sod:role_map:{app}:{role}'
CACHE_TTL = 86400  # 24 hours

# قوانین پیش‌فرض ماتریس تفکیک وظایف (خطوط قرمز مصوب)
DEFAULT_SOD_RULES = [
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
    }
]


class SoDCacheService:
    """
    سرویس مدیریت ماتریس قوانین تفکیک وظایف و کشینگ فوق‌سریع در Redis
    """

    @classmethod
    def seed_default_rules(cls) -> int:
        """
        ایجاد یا به‌روزرسانی رکوردهای پیش‌فرض ماتریس قوانین در پایگاه داده
        """
        from accounts.models import SoDPolicyRule
        created_count = 0
        with transaction.atomic():
            for rule in DEFAULT_SOD_RULES:
                obj, created = SoDPolicyRule.objects.update_or_create(
                    app_module=rule['app_module'],
                    role_code=rule['role_code'],
                    page_route=rule['page_route'],
                    action_code=rule['action_code'],
                    defaults={
                        'role_title_fa': rule.get('role_title_fa', ''),
                        'action_title_fa': rule.get('action_title_fa', ''),
                        'is_prohibited': rule.get('is_prohibited', True),
                        'prohibition_reason_fa': rule.get('prohibition_reason_fa', '')
                    }
                )
                if created:
                    created_count += 1
        
        # بلافاصله کش را رفرش می‌کنیم
        cls.load_sod_policies_to_cache()
        return created_count

    @classmethod
    def load_sod_policies_to_cache(cls) -> dict:
        """
        بارگذاری تمامی قوانین از دیتابیس در کش Redis در ساختار بهینه‌شده O(1)
        """
        from accounts.models import SoDPolicyRule
        
        # استخراج تمامی قوانین فعال
        rules = list(SoDPolicyRule.objects.values(
            'app_module', 'role_code', 'role_title_fa',
            'page_route', 'action_code', 'action_title_fa',
            'is_prohibited', 'prohibition_reason_fa'
        ))

        # ساختار دیکشنری سریع: key = "{app}:{role}:{route}:{action}"
        fast_matrix = {}
        # ساختار نقش‌محور: key = "{app}:{role}" -> list of prohibited actions
        role_map = {}

        for r in rules:
            key = f"{r['app_module']}:{r['role_code']}:{r['page_route']}:{r['action_code']}"
            fast_matrix[key] = {
                'is_prohibited': r['is_prohibited'],
                'reason': r['prohibition_reason_fa'],
                'action_title': r['action_title_fa']
            }

            role_key = f"{r['app_module']}:{r['role_code']}"
            if role_key not in role_map:
                role_map[role_key] = []
            
            if r['is_prohibited']:
                role_map[role_key].append({
                    'page_route': r['page_route'],
                    'action_code': r['action_code'],
                    'action_title_fa': r['action_title_fa'],
                    'reason': r['prohibition_reason_fa']
                })

        try:
            cache.set(CACHE_KEY_SOD_MATRIX, fast_matrix, timeout=CACHE_TTL)
            for r_key, p_list in role_map.items():
                cache.set(f"sod:role_map:{r_key}", p_list, timeout=CACHE_TTL)
            logger.info(f"Loaded {len(rules)} SoD rules successfully into Redis/Cache.")
        except Exception as e:
            logger.warning(f"Cache write failed, fallback to in-memory: {e}")

        return fast_matrix

    @classmethod
    def is_action_prohibited(
        cls,
        app_module: str,
        role_code: str,
        page_route: str,
        action_code: str
    ) -> tuple[bool, str]:
        """
        ارزیابی بلادرنگ O(1) آیا عملیات برای این نقش ممنوع است یا خیر
        """
        if not role_code or role_code == 'superuser':
            return False, ''

        # خواندن از کش
        fast_matrix = cache.get(CACHE_KEY_SOD_MATRIX)
        if fast_matrix is None:
            fast_matrix = cls.load_sod_policies_to_cache()

        lookup_key = f"{app_module}:{role_code}:{page_route}:{action_code}"
        entry = fast_matrix.get(lookup_key)

        if entry and entry.get('is_prohibited', False):
            return True, entry.get('reason', 'این اقدام طبق ماتریس تفکیک وظایف برای نقش شما ممنوع است.')

        return False, ''

    @classmethod
    def get_prohibitions_for_role(cls, app_module: str, role_code: str) -> list[dict]:
        """
        دریافت کلیه خطوط قرمز یک نقش خاص جهت ارسال به فرانت‌اند یا اعمال در UI
        """
        if not role_code or role_code == 'superuser':
            return []

        cache_key = f"sod:role_map:{app_module}:{role_code}"
        prohibitions = cache.get(cache_key)
        if prohibitions is None:
            cls.load_sod_policies_to_cache()
            prohibitions = cache.get(cache_key, [])

        return prohibitions or []
