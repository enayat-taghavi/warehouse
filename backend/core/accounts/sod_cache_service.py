import json
import logging
from django.core.cache import cache
from django.db import transaction

logger = logging.getLogger(__name__)

CACHE_KEY_SOD_MATRIX = 'sod:policy_matrix'
CACHE_KEY_SOD_ROLE_MAP = 'sod:role_map:{app}:{role}'
CACHE_TTL = 86400  # 24 hours

# قوانین پیش‌فرض ماتریس تفکیک وظایف (خطوط قرمز مصوب) که از رجیستری خوانده می‌شوند
class _LazyDefaultSoDRules(list):
    def __iter__(self):
        from platform_core.registry import contributions
        return iter(contributions('sod_rules'))

    def __len__(self):
        from platform_core.registry import contributions
        return len(contributions('sod_rules'))

    def __getitem__(self, index):
        from platform_core.registry import contributions
        return contributions('sod_rules')[index]

    def __bool__(self):
        from platform_core.registry import contributions
        return bool(contributions('sod_rules'))

    def __repr__(self):
        from platform_core.registry import contributions
        return repr(list(contributions('sod_rules')))


DEFAULT_SOD_RULES = _LazyDefaultSoDRules()



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
