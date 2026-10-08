import contextvars
import logging

logger = logging.getLogger(__name__)

_current_user_var = contextvars.ContextVar('current_user', default=None)
_current_ip_var = contextvars.ContextVar('current_ip', default=None)
_current_user_agent_var = contextvars.ContextVar('current_user_agent', default=None)
_current_warehouse_var = contextvars.ContextVar('current_warehouse', default=None)
_current_active_role_var = contextvars.ContextVar('current_active_role', default=None)
# فاز ۳ §۳.۵ — مقدار پیش‌فرضِ `active_app` اکنون کدِ ماژول است (نه 'personnel').
_current_active_app_var = contextvars.ContextVar('current_active_app', default='accounting')
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
    return _current_active_app_var.get()

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


def get_user_valid_roles_for_app(user, app_module: str = 'personnel') -> list[str]:
    """
    محاسبه لیست نقش‌های معتبر و مجاز کاربر در ماژول انتخاب‌شده جهت جلوگیری از جعل نقش (Anti Role-Spoofing).

    فاز ۳ §۳.۴ — `app_module` هم کد ماژول ('warehouse'/'accounting') و هم کد قدیمی
    ('personnel'/'finance') را می‌پذیرد؛ با `app_code_to_module` به ماژولِ رجیستری
    نرمال می‌شود و نقش‌های مجاز از `spec.roles` برای سوپریوزر برگرفته می‌شود.
    """
    from platform_core.registry import app_code_to_module, get_module, installed_modules

    if not user or not user.is_authenticated:
        return []

    module_code = app_code_to_module(app_module)
    if not module_code or module_code not in installed_modules():
        return []
    spec = get_module(module_code)

    if user.is_superuser:
        if spec and spec.roles:
            return list(spec.roles)
        return ['superuser']

    roles = []
    if module_code == 'accounting':
        # راهبر تشکیلات: نشانگر آن مجوز مدیریت پروژه‌ها و بخش‌هاست
        is_org_admin = user.has_perm('accounts.perm_manage_projects_sections')
        # اپراتور/کارمند: فقط اگر صراحتاً نقش کارمند داشته باشد
        if user.has_perm('accounts.can_act_as_operator'):
            roles.append('operator')
        if user.has_perm('accounts.can_act_as_workshop_supervisor') or user.has_perm('accounts.perm_approve_personnel_supervisor') or user.has_perm('accounts.perm_approve_fleet_supervisor'):
            roles.append('supervisor')
        if user.has_perm('accounts.can_act_as_accountant') or user.has_perm('accounts.perm_approve_personnel_finance') or user.has_perm('accounts.perm_approve_fleet_finance'):
            roles.append('accountant')
        if user.has_perm('accounts.can_act_as_company_manager') or user.has_perm('accounts.perm_manager_payment_authorize') or user.has_perm('accounts.perm_approve_personnel_manager'):
            roles.append('manager')
        if user.has_perm('accounts.perm_treasury_disburse_action') or user.has_perm('accounts.view_sys_treasury'):
            roles.append('treasury')
        if not roles and not is_org_admin and (user.has_perm('accounts.view_sys_personnel_attendance') or user.has_perm('accounts.view_sys_personnel')):
            roles.append('operator')
        # در ابتدای فهرست تا «آخرین نقش معتبر» (پیش‌فرض resolve_effective_role) برای کاربر چندنقشه عوض نشود
        if is_org_admin:
            roles.insert(0, 'org_admin')
    elif module_code == 'warehouse':
        # Warehouse & Inventory App
        if user.has_perm('accounts.can_act_as_counter') or user.has_perm('accounts.view_sys_counter') or user.has_perm('accounts.view_wh_dispatch'):
            roles.append('counter')
        if user.has_perm('accounts.can_act_as_wh_supervisor') or (user.has_perm('accounts.view_sys_supervisor') and not user.has_perm('accounts.can_act_as_workshop_supervisor')) or user.has_perm('accounts.view_wh_doc_approvals'):
            roles.append('warehouse_supervisor')
        if user.has_perm('accounts.can_act_as_doc_worker') or user.has_perm('accounts.view_wh_docs') or user.has_perm('accounts.perm_doc_approve_action'):
            roles.append('docs_specialist')
        if user.has_perm('accounts.can_act_as_wh_manager') or user.has_perm('accounts.can_act_as_manager') or user.has_perm('accounts.view_sys_manager_review') or user.has_perm('accounts.perm_inventory_finalize'):
            roles.append('manager_review')
        if not roles and any(p in user.get_all_permissions() for p in spec.permission_markers):
            roles.append('counter')
    else:
        return []

    return roles


def resolve_effective_role(user, requested_role: str, app_module: str = 'personnel') -> str:
    """
    اعتبارسنجی نقش درخواستی در برابر اختیارات واقعی کاربر؛ در صورت عدم صلاحیت، بالاترین نقش معتبر جایگزین می‌شود.
    """
    if not user or not user.is_authenticated:
        return 'anonymous'

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
                validate_user_company_access(user, company_id)
            except Exception as e:
                from django.http import JsonResponse
                logger.warning(f"[Security] User {user.id} attempted unauthorized access to company {company_id}: {e}")
                return JsonResponse({
                    'detail': 'شما به اطلاعات و پروژه‌های این شرکت دسترسی ندارید.',
                    'error': 'tenant_access_denied',
                    'company_id': company_id
                }, status=403)
        elif not company_id and user and user.is_authenticated and not user.is_superuser:
            primary = getattr(user, 'primary_company', None)
            if primary:
                company_id = primary.id

        t_user = _current_user_var.set(user)
        t_ip = _current_ip_var.set(ip)
        t_ua = _current_user_agent_var.set(ua)
        t_wh = _current_warehouse_var.set(warehouse_id)
        t_comp = _current_company_var.set(company_id)
        t_cache = _current_allowed_companies_cache.set({})

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
