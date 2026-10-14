"""
قواعد دامنه و کاربران قابل‌مشاهده برای هر کاربر بر مبنای شرکت‌های مجاز.
طرح پیگیری‌های ناظر — نشست ۱.
"""
from django.db.models import Q


def get_visible_users_for_user(user, qs=None):
    """
    کاربران قابل‌مشاهده برای این کاربر بر مبنای شرکت‌های مجاز:
    - سوپریوزر: همهٔ کاربران (یا کل queryset ورودی)
    - کاربر عادی: کاربران شرکت‌های مجاز به‌علاوهٔ خود کاربر، با حذف سوپریوزرها و distinct
    - کاربر بدون شرکت: فقط خود کاربر
    - کاربر احرازهویت‌نشده: queryset خالی
    """
    from accounts.models import CustomUser
    try:
        from companies.access import get_user_allowed_companies
    except ImportError:
        get_user_allowed_companies = None

    if qs is None:
        qs = CustomUser.objects.all()

    if not user or not getattr(user, 'is_authenticated', False):
        return qs.none()

    if user.is_superuser:
        return qs

    if get_user_allowed_companies is not None:
        allowed_cids = get_user_allowed_companies(user).values_list('id', flat=True)
        if allowed_cids.exists():
            # زیرپرس‌وجو به‌جای join چندمقداری: گزارش گروه‌بندی‌شده (Count) کاربر چندشرکتی را چند بار نشمارد.
            from companies.models import UserCompanyAccess
            access_user_ids = UserCompanyAccess.objects.filter(company_id__in=allowed_cids).values('user_id')
            qs = qs.filter(Q(id__in=access_user_ids) | Q(id=user.id)).distinct()
        else:
            qs = qs.filter(id=user.id)
    else:
        qs = qs.filter(id=user.id)

    qs = qs.exclude(is_superuser=True)
    return qs
