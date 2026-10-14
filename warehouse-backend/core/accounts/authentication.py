from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework.exceptions import PermissionDenied, NotFound
from datetime import datetime

class CustomJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        auth_result = super().authenticate(request)
        if auth_result is None:
            return None

        user, validated_token = auth_result
        self.enforce_token_app_scope(request, user, validated_token)
        return user, validated_token

    def enforce_token_app_scope(self, request, user, validated_token):
        if not user or user.is_superuser:
            return

        path = getattr(request, 'path_info', None) or getattr(request, 'path', '') or ''

        # استخراج دامنه‌های مجاز از توکن (یا محاسبه از مدل کاربر در صورت فقدان کلیم در توکن‌های قدیمی)
        allowed_apps = validated_token.get('allowed_apps')
        if allowed_apps is None:
            from accounts.middleware import get_user_allowed_apps
            allowed_apps = get_user_allowed_apps(user)

        def _log_boundary_violation(target_module, detail_msg):
            try:
                from accounts.models import AuditLog
                AuditLog.objects.create(
                    user=user,
                    actor_username=user.username,
                    actor_name=f"{user.first_name} {user.last_name}".strip() or user.username,
                    module='system',
                    action='REJECT',
                    severity='critical',
                    target_model='ApiEndpoint',
                    target_object_id=path[:100],
                    target_repr=f"انسداد دسترسی بین‌سامانه‌ای غیرمجاز به {path}",
                    details={
                        'event': 'CROSS_APP_DENIED',
                        'target_module': target_module,
                        'requested_path': path,
                        'allowed_apps': allowed_apps,
                        'active_app': validated_token.get('active_app'),
                        'message': detail_msg
                    },
                    ip_address=getattr(request, 'META', {}).get('REMOTE_ADDR')
                )
            except Exception:
                pass

        # فاز ۳ §۳.۲ — به‌جای زنجیرهٔ if path.startswith(...)، مسیر از رجیستری
        # قابلیت‌ها حل می‌شود. اگر مسیر به ماژولِ شناخته‌شدهٔ نصب‌نشده تعلق دارد،
        # ۴۰۴ برمی‌گردانیم (قانون ۵ — افشا نکردن ماژول نصب‌نشده)؛ اگر به ماژولِ
        # نصب‌شده تعلق دارد و قلمرو کاربر کافی نیست، ۴۰۳.
        from platform_core.registry import (
            module_for_path,
            known_module_for_path,
            module_scope_codes,
        )

        # فاز ۵ §۵.۴ (تسک ۴۶) — قلمرو اندپوینت /api/reports/:
        # موتور گزارش‌ساز پلتفرمی است و برای هر ماژول نصب‌شده‌ای که ثبت گزارش یا JOIN
        # کرده باشد، در دسترس کاربرانِ دارای قلمرو همان ماژول قرار می‌گیرد.
        rel_path = path.lstrip('/')
        if rel_path.startswith('api/reports/'):
            from platform_core.query_engine import get_reporting_modules
            from platform_core.registry import installed_modules, module_scope_codes
            active_reporting_modules = [m for m in get_reporting_modules() if m in installed_modules()]
            if not active_reporting_modules and 'warehouse' in installed_modules():
                active_reporting_modules = ['warehouse']

            if not active_reporting_modules:
                msg = 'سامانه گزارش‌ساز در این نصب فعال نیست.'
                _log_boundary_violation('reports', msg)
                raise NotFound(msg, code='cross_app_not_found')

            allowed_scope_codes = set()
            for m in active_reporting_modules:
                allowed_scope_codes.update(module_scope_codes(m))

            if not any(c in allowed_apps for c in allowed_scope_codes):
                msg = (f'این توکن فاقد قلمرو مجاز (App-Scoped Claim: {"/".join(sorted(allowed_scope_codes))}) '
                       f'برای دسترسی به گزارش‌ساز است.')
                _log_boundary_violation('reports', msg)
                raise PermissionDenied(msg, code='app_scope_denied')
            return

        module = module_for_path(path)
        if module is None:
            # مسیر به یک ماژولِ کاتالوگ تعلق دارد ولی نصب نیست → ۴۰۴.
            known = known_module_for_path(path)
            if known is not None:
                msg = f'این مسیر متعلق به ماژول «{known.title_fa}» است که در این نصب فعال نیست.'
                _log_boundary_violation(known.code, msg)
                raise NotFound(msg, code='cross_app_not_found')
            return  # مسیرِ غیرماژول؛ هیچ محدودیت قلمرویی اعمال نمی‌شود.

        # GET/HEAD/OPTIONS روی پیشوند /api/warehouses/ عمداً بدون محدودیت قلمرو
        # (رفتار پیشین؛ خواندن فهرست انبارها برای همگانِ دارای توکن مجاز است).
        if (module.code == 'warehouse'
                and path.startswith('/api/warehouses/')
                and getattr(request, 'method', 'GET') in ('GET', 'HEAD', 'OPTIONS')):
            return

        scope_codes = module_scope_codes(module.code)
        if not any(c in allowed_apps for c in scope_codes):
            msg = (f'این توکن فاقد قلمرو مجاز (App-Scoped Claim: {"/".join(scope_codes)}) '
                   f'برای دسترسی به «{module.title_fa}» است.')
            _log_boundary_violation(module.code, msg)
            raise PermissionDenied(msg, code='app_scope_denied')

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        
        # Check if the token was issued before the password was last changed
        if user and user.password_changed_at:
            # iat (issued at) is a Unix timestamp in integer seconds
            iat = validated_token.get('iat')
            if iat:
                pwd_timestamp = int(user.password_changed_at.timestamp())
                if pwd_timestamp > int(iat):
                    raise AuthenticationFailed('رمز عبور تغییر کرده است، لطفا مجددا وارد شوید.', code='password_changed')
                    
        return user
