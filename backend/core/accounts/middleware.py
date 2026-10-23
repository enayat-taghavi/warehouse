import contextvars
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

_current_user_var = contextvars.ContextVar('current_user', default=None)
_current_ip_var = contextvars.ContextVar('current_ip', default=None)
_current_user_agent_var = contextvars.ContextVar('current_user_agent', default=None)
_current_warehouse_var = contextvars.ContextVar('current_warehouse', default=None)
_current_active_role_var = contextvars.ContextVar('current_active_role', default=None)
_current_active_app_var = contextvars.ContextVar('current_active_app', default='')
_current_client_tab_id_var = contextvars.ContextVar('current_client_tab_id', default=None)
_current_company_var = contextvars.ContextVar('current_company', default=None)
_current_allowed_companies_cache = contextvars.ContextVar('current_allowed_companies_cache', default=None)

def get_client_ip(request):
    """
    استخراج آدرس آی‌پی واقعی کلاینت با پشتیبانی از هدرهای پروکسی
    """
    if not request:
        return None
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR')
    return ip

def get_current_user():
    return _current_user_var.get()

def set_current_user(user):
    return _current_user_var.set(user)

def get_current_ip():
    return _current_ip_var.get()

def set_current_ip(ip):
    return _current_ip_var.set(ip)

def get_current_user_agent():
    return _current_user_agent_var.get()

def get_current_warehouse():
    return _current_warehouse_var.get()

def set_current_warehouse(warehouse):
    return _current_warehouse_var.set(warehouse)

def get_current_active_role():
    return _current_active_role_var.get()

def set_current_active_role(role):
    return _current_active_role_var.set(role)

def get_current_active_app():
    val = _current_active_app_var.get()
    if val:
        return val
    from platform_core.registry import default_module
    return default_module()

def set_current_active_app(app_module):
    return _current_active_app_var.set(app_module)

def get_current_client_tab_id():
    return _current_client_tab_id_var.get()

def set_current_client_tab_id(tab_id):
    return _current_client_tab_id_var.set(tab_id)

def get_current_company():
    return _current_company_var.get()

def set_current_company(company_id):
    return _current_company_var.set(company_id)

def get_allowed_companies_cache():
    return _current_allowed_companies_cache.get()


# کلید کد ماژولِ مالک مسیر درخواست در کش درخواست (طرح ۲.۱، ت۸)
MODULE_KEY = '__request_module__'


def get_current_request_module():
    """کد ماژولی که مسیر API درخواست جاری به آن تعلق دارد، یا None (مسیرهای هسته و بیرون از درخواست)."""
    cache = _current_allowed_companies_cache.get()
    return cache.get(MODULE_KEY) if cache else None


@contextmanager
def request_module(module_code):
    """
    کار هسته به نام یک ماژول (مثلاً گزارش‌ساز روی موجودیت آن ماژول): در این بازه شرکت‌هایی که ماژول در آن‌ها
    خاموش است از دسترسی کنار می‌روند، با کش جدا تا نتیجهٔ بیرون از بازه آلوده نشود (طرح ۲.۱، ت۸).
    """
    if not module_code:
        yield
        return
    token = _current_allowed_companies_cache.set({MODULE_KEY: module_code})
    try:
        yield
    finally:
        _current_allowed_companies_cache.reset(token)


def get_user_allowed_apps(user) -> list[str]:
    """
    محاسبه دامنه‌ها/برنامه‌های مجاز کاربر (warehouse و finance) بر اساس مجوزها یا وضعیت سوپریوزر.

    فاز ۳ §۳.۴ — این تابع به‌جای آرایه‌های سخت‌کد، از `spec.permission_markers` هر ماژولِ
    نصب‌شده در رجیستری استفاده می‌کند و کدِ `allowed_apps` را از
    `module_allowed_app_code` می‌گیرد (همان کدهای قدیمی 'warehouse'/'finance').
    """
    from platform_core.registry import installed_modules, get_module, module_allowed_app_code

    if not user or not user.is_authenticated:
        return []

    user_perms = user.get_all_permissions()
    is_super = user.is_superuser

    result = []
    for code in installed_modules():
        spec = get_module(code)
        if spec is None:
            continue
        if is_super or any(p in user_perms for p in spec.permission_markers):
            result.append(module_allowed_app_code(code))
    return result


def get_user_valid_roles_for_app(user, app_module: str | None = None) -> list[str]:
    """
    محاسبه لیست نقش‌های معتبر و مجاز کاربر در ماژول انتخاب‌شده جهت جلوگیری از جعل نقش (Anti Role-Spoofing).

    فاز ۳ §۳.۴ — `app_module` هم کد ماژول ('warehouse'/'accounting') و هم کد قدیمی
    ('personnel'/'finance') را می‌پذیرد؛ با `app_code_to_module` به ماژولِ رجیستری
    نرمال می‌شود و نقش‌های مجاز از `spec.roles` برای سوپریوزر برگرفته می‌شود.
    """
    from platform_core.registry import app_code_to_module, get_module, installed_modules, default_module

    if not user or not user.is_authenticated:
        return []

    if app_module is None:
        app_module = default_module()

    module_code = app_code_to_module(app_module)
    if not module_code or module_code not in installed_modules():
        return []
    spec = get_module(module_code)

    if user.is_superuser:
        if spec and spec.roles:
            return list(spec.roles)
        return ['superuser']

    from platform_core.registry import contributions
    for item in contributions('role_resolver'):
        if isinstance(item, (tuple, list)) and len(item) == 2 and item[0] == module_code and callable(item[1]):
            try:
                return item[1](user, spec)
            except TypeError:
                return item[1](user)

    return []



def resolve_effective_role(user, requested_role: str, app_module: str | None = None) -> str:
    """
    اعتبارسنجی نقش درخواستی در برابر اختیارات واقعی کاربر؛ در صورت عدم صلاحیت، بالاترین نقش معتبر جایگزین می‌شود.
    """
    if not user or not user.is_authenticated:
        return 'anonymous'

    if app_module is None:
        from platform_core.registry import default_module
        app_module = default_module()

    valid_roles = get_user_valid_roles_for_app(user, app_module)
    if user.is_superuser:
        return requested_role if requested_role in valid_roles else 'superuser'

    if requested_role and requested_role in valid_roles:
        return requested_role

    # اگر نقشی فرستاده نشده یا نامعتبر بود، آخرین (بالاترین) نقش معتبر را برمی‌گردانیم
    return valid_roles[-1] if valid_roles else 'operator'


def _resolve_active_app(raw_app: str) -> str:
    """
    فاز ۳ §۳.۵ — نگاشت کدِ ورودی هدر X-Active-App به کدِ ماژولِ نصب‌شده.
    اگر کد نامعتبر/غیرماژول بود، ماژولِ پیش‌فرضِ رجیستری برگردانده می‌شود.
    """
    from platform_core.registry import app_code_to_module, installed_modules, default_module
    candidate = app_code_to_module(raw_app) if raw_app else None
    if candidate and candidate in installed_modules():
        return candidate
    return default_module()


class AuditContextMiddleware:
    """
    میان‌افزار کانتکست ایزوله جهت نگهداری کاربر جاری، آدرس آی‌پی و مشخصات مرورگر در چرخه درخواست
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, 'user', None)
        if user and not user.is_authenticated:
            user = None

        if not user:
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Bearer '):
                raw_token = auth_header.split(' ', 1)[1].strip()
                try:
                    from rest_framework_simplejwt.authentication import JWTAuthentication
                    jwt_auth = JWTAuthentication()
                    validated_token = jwt_auth.get_validated_token(raw_token)
                    resolved_user = jwt_auth.get_user(validated_token)
                    if resolved_user and resolved_user.is_authenticated:
                        user = resolved_user
                        request.user = resolved_user
                except Exception:
                    pass
            
        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')
        
        # استخراج انبار فعال از هدر سفارشی در صورت ارسال توسط فرانت‌اند
        wh_header = request.META.get('HTTP_X_WAREHOUSE_ID')
        warehouse_id = None
        if wh_header and str(wh_header).isdigit():
            warehouse_id = int(wh_header)

        # استخراج شرکت فعال از هدر یا کوئری سفارشی
        company_header = request.META.get('HTTP_X_COMPANY_ID')
        company_id = None
        if company_header and str(company_header).isdigit():
            company_id = int(company_header)
        elif request.GET.get('company_id') and str(request.GET.get('company_id')).isdigit():
            company_id = int(request.GET.get('company_id'))
        elif request.GET.get('company') and str(request.GET.get('company')).isdigit():
            company_id = int(request.GET.get('company'))

        # اعتبارسنجی امنیتی ضدجعل کانتکست شرکت (Anti-Tenant-Spoofing)
        if company_id and user and user.is_authenticated and not user.is_superuser:
            try:
                from companies.access import validate_user_company_access
                # ضدجعل: عضویت لازم است؛ فقط مسیرهای هستهٔ شرکت (/api/org/) که خودشان دروازهٔ بخش دارند
                # به «پیوند» بسنده می‌کنند (حالت محدود استودیو؛ یافتهٔ tenant-scope-reviewer گام ۸)
                from platform_core.registry import contributions as _contributions
                link_prefixes = ('/api/org/',) + tuple(_contributions('company_link_api_prefixes'))
                link_ok = request.path.startswith(link_prefixes)
                validate_user_company_access(user, company_id, required_level=None if link_ok else 'workspace_full')
            except Exception as e:
                from django.http import JsonResponse
                logger.warning(f"[Security] User {user.id} attempted unauthorized access to company {company_id}: {e}")
                return JsonResponse({
                    'detail': 'شما به اطلاعات و پروژه‌های این شرکت دسترسی ندارید.',
                    'error': 'tenant_access_denied',
                    'company_id': company_id
                }, status=403)
        # کلید ماژول هر شرکت (طرح ۲.۱، ت۸): مسیر API ماژولی که در شرکتِ صریح درخواست خاموش است رد می‌شود،
        # و در همین درخواست شرکت‌های خاموشِ آن ماژول از شرکت‌های مجاز کنار می‌روند (companies.access)
        from platform_core.registry import module_for_path
        path_module = module_for_path(request.path)
        path_module_code = path_module.code if path_module is not None else None
        if company_id and path_module_code and user and user.is_authenticated:
            from companies.access import company_module_enabled
            if not company_module_enabled(company_id, path_module_code):
                from django.http import JsonResponse
                return JsonResponse({
                    'detail': 'این سامانه برای این شرکت فعال نیست.',
                    'error': 'module_disabled_for_company',
                    'company_id': company_id,
                }, status=403)

        if not company_id and user and user.is_authenticated and not user.is_superuser:
            primary = getattr(user, 'primary_company', None)
            if primary:
                company_id = primary.id

        t_user = _current_user_var.set(user)
        t_ip = _current_ip_var.set(ip)
        t_ua = _current_user_agent_var.set(ua)
        t_wh = _current_warehouse_var.set(warehouse_id)
        t_comp = _current_company_var.set(company_id)
        t_cache = _current_allowed_companies_cache.set({MODULE_KEY: path_module_code} if path_module_code else {})

        try:
            response = self.get_response(request)
            if hasattr(response, 'headers') or hasattr(response, '__setitem__'):
                response['Accept-CH'] = 'Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List'
                response['Permissions-Policy'] = 'ch-ua-model=(self)'
            return response
        finally:
            _current_user_var.reset(t_user)
            _current_ip_var.reset(t_ip)
            _current_user_agent_var.reset(t_ua)
            _current_warehouse_var.reset(t_wh)
            _current_company_var.reset(t_comp)
            _current_allowed_companies_cache.reset(t_cache)


class ActiveRoleMiddleware:
    """
    میان‌افزار استخراج هدرهای X-Active-Role و X-Active-App، اعتبارسنجی ضدجعل و الصاق نقش فعال به request
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, 'user', None)
        if user and not user.is_authenticated:
            user = None

        # فاز ۳ §۳.۵ — رفع دوحالتگی: کد ورودی هدر (warehouse/personnel/finance/...)
        # را به کدِ ماژولِ نصب‌شده نگاشت کن؛ اگر معتبر نبود، ماژولِ پیش‌فرض.
        raw_app = request.META.get('HTTP_X_ACTIVE_APP', '').strip().lower()
        active_app = _resolve_active_app(raw_app)

        # استخراج نقش درخواستی از هدر X-Active-Role
        raw_role = request.META.get('HTTP_X_ACTIVE_ROLE', '').strip().lower()

        # استخراج شناسه سشن تب مرورگر از هدر X-Client-Tab-Id
        client_tab_id = request.META.get('HTTP_X_CLIENT_TAB_ID', '').strip() or None

        # ارزیابی ضدجعل و تخصیص نقش نهایی
        effective_role = resolve_effective_role(user, raw_role, active_app)

        # الصاق به شیء درخواست
        request.active_app = active_app
        request.active_role = effective_role
        request.client_tab_id = client_tab_id
        request.valid_roles = get_user_valid_roles_for_app(user, active_app)

        t_role = _current_active_role_var.set(effective_role)
        t_app = _current_active_app_var.set(active_app)
        t_tab = _current_client_tab_id_var.set(client_tab_id)

        try:
            response = self.get_response(request)
            return response
        finally:
            _current_active_role_var.reset(t_role)
            _current_active_app_var.reset(t_app)
            _current_client_tab_id_var.reset(t_tab)
