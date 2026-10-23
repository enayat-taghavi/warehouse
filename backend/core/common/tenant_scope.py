"""
ماژول واحد ایزولاسیون و تفکیک امنیتی چندمستأجری (Multi-Tenancy Tenant Scoping)
این ماژول مرجع واحد تعیین شرکت فعال و عایق‌سازی کوئری‌ست‌ها در تمام ماژول‌هاست.
"""

import logging
from django.db.models import Q
from accounts.middleware import get_current_company, set_current_company

logger = logging.getLogger(__name__)


def get_current_tenant_company_id(request=None, user=None):
    """
    استخراج شناسه شرکت معتبر فعلی با اولویت:
    ۱. متغیر کانتکست ایزوله ترد/درخواست (ContextVar)
    ۲. هدرهای X-Company-ID یا کوئری‌پارامتر ریکوئست (در صورت ارسال)
    ۳. شرکت اصلی کاربر (primary_company) در صورت احراز هویت
    """
    cid = get_current_company()
    if cid:
        return cid

    if request is not None:
        header_val = request.META.get('HTTP_X_COMPANY_ID') or request.headers.get('X-Company-ID')
        if header_val and str(header_val).isdigit():
            return int(header_val)
        query_val = request.GET.get('company_id') or request.GET.get('company')
        if query_val and str(query_val).isdigit():
            return int(query_val)

    target_user = user or (getattr(request, 'user', None) if request else None)
    if target_user and target_user.is_authenticated and not target_user.is_superuser:
        primary = getattr(target_user, 'primary_company', None)
        if primary:
            return primary.id

    return None


def scope_tenant_queryset(queryset, user, company_id=None, company_field='company_id', request=None):
    """
    محدود کردن قطعی کوئری‌ست به شرکت فعال یا شرکت‌های مجاز کاربر.

    :param queryset: کوئری‌ست مورد نظر
    :param user: کاربر جاری
    :param company_id: شناسه شرکت صریح (اختیاری)
    :param company_field: فیلد یا مسیر ارجاع به شرکت در ORM (مثلاً 'company_id' یا 'warehouse__company_id')
    :param request: شیء درخواست (اختیاری)
    """
    if not user or not user.is_authenticated:
        return queryset.none()

    cid = company_id or get_current_tenant_company_id(request=request, user=user)

    if cid is not None:
        from companies.access import validate_user_company_access
        try:
            valid_cid = validate_user_company_access(user, cid)
            if valid_cid:
                return queryset.filter(**{company_field: valid_cid})
        except Exception as e:
            logger.warning(f"[TenantScope] Access denied for user {user.id} to company {cid}: {e}")
            return queryset.none()

    if user.is_superuser:
        # سوپریوزر در صورت عدم انتخاب شرکت، کل رکوردها را به عنوان نماینده کل هلدینگ می‌بیند
        return queryset

    # کاربر عادی بدون انتخاب شرکت: محدود به شرکت‌های مجاز کاربر
    try:
        from companies.access import get_user_allowed_companies
        allowed_cids = list(get_user_allowed_companies(user).values_list('id', flat=True))
        if allowed_cids:
            return queryset.filter(**{f"{company_field}__in": allowed_cids})
        return queryset.none()
    except Exception as e:
        logger.error(f"[TenantScope] Error fetching user allowed companies: {e}")
        return queryset.none()


class TenantScopeMixin:
    """
    میکسین استاندارد جهت ایزولاسیون خودکار کوئری‌ست‌های ViewSetها بر مبنای شرکت فعال.
    نام فیلد شرکت به صورت پیش‌فرض company_field = 'company_id' است.
    """
    company_field = 'company_id'

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, 'user', None)
        return scope_tenant_queryset(
            qs,
            user,
            company_field=getattr(self, 'company_field', 'company_id'),
            request=self.request
        )
