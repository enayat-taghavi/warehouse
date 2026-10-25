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


# ─── تسلط انجام‌دهنده بر حساب کاربر هدف (طرح ۲.۹، یافته‌های S1 و S2) ─────────────────────

MSG_NOT_CONTROLLED = (
    'این کاربر در شرکت دیگری هم عضو است؛ ویرایش، رمز، غیرفعال‌سازی و حذف او فقط '
    'برای مدیری است که عضو همهٔ شرکت‌های این کاربر باشد.'
)
MSG_OUTRANKED = (
    'این کاربر مجوزهایی دارد که شما ندارید ({codes})؛ رمز، غیرفعال‌سازی و حذف او فقط '
    'با مدیر کل سامانه است.'
)


def _is_live_superuser(user):
    return bool(user and getattr(user, 'is_authenticated', False) and user.is_superuser and user.is_active)


def user_company_ids(target):
    """
    همهٔ شرکت‌هایی که کاربر به هر شکل به آن‌ها وصل است: ردیف‌های UserCompanyAccess (حتی شرکت غیرفعال)
    به‌اضافهٔ شرکت‌های «پیوند» (عضویت خودکار ماژول‌ها و بخش‌های دارای سطح).
    """
    if target is None or not getattr(target, 'pk', None):
        return set()
    from companies.access import LINK, get_user_allowed_companies
    from companies.models import UserCompanyAccess
    # شرکت غیرفعال شمرده نمی‌شود (member_company_ids انجام‌دهنده هم فقط شرکت فعال دارد)
    ids = set(UserCompanyAccess.objects.filter(user_id=target.pk, company__is_active=True)
              .values_list('company_id', flat=True))
    ids |= set(get_user_allowed_companies(target, LINK).values_list('id', flat=True))
    return ids


def actor_controls_user(actor, target):
    """
    آیا انجام‌دهنده بر حساب هدف تسلط دارد (ویرایش مشخصات، آواتار، رمز، فعال/غیرفعال، حذف)؟
    مدیر کل: همیشه. دیگران: هدف خودش است، یا هدف مدیر کل نیست و همهٔ شرکت‌های هدف
    زیرمجموعهٔ شرکت‌های عضویت انجام‌دهنده است (همان قاعدهٔ permission_admin._ensure_system_editable_users).
    """
    if _is_live_superuser(actor):
        return True
    if actor is None or not getattr(actor, 'is_authenticated', False) or target is None:
        return False
    if target.pk == actor.pk:
        return True
    if target.is_superuser:
        return False
    from .permission_admin import member_company_ids
    return user_company_ids(target) <= member_company_ids(actor)


def ensure_actor_controls_user(actor, target):
    from rest_framework.exceptions import PermissionDenied
    if not actor_controls_user(actor, target):
        raise PermissionDenied(MSG_NOT_CONTROLLED)


def actor_display_scope(actor):
    """
    دامنهٔ نمایش جزئیات کاربر مشترک برای غیرسوپریوزر (S7): None برای مدیر کل (همه چیز)، وگرنه
    {'company_ids', 'company_names', 'warehouse_ids'} شرکت‌های عضویت و انبارهای دامنهٔ انجام‌دهنده.
    سه پرس‌وجوی ثابت؛ فراخوان آن را یک بار برای کل فهرست می‌سازد.
    """
    if _is_live_superuser(actor):
        return None
    from .permission_admin import member_company_ids
    company_ids = member_company_ids(actor)
    from companies.models import Company
    company_names = set(Company.objects.filter(id__in=company_ids).values_list('name', flat=True))
    from platform_core.registry import contributions
    warehouse_ids = None
    for ext in contributions('user_extensions'):
        if hasattr(ext, 'scoped_warehouse_ids'):
            warehouse_ids = ext.scoped_warehouse_ids(actor)
            break
    return {'company_ids': company_ids, 'company_names': company_names, 'warehouse_ids': warehouse_ids}


def visible_company_text(scope, target_text):
    """متن آزاد «شرکت» کاربر فقط اگر نام یکی از شرکت‌های انجام‌دهنده باشد، وگرنه خالی (S7)."""
    if scope is None or not target_text:
        return target_text
    return target_text if target_text in scope['company_names'] else ''


# ─── کد کارت شناسایی امضاشده و رمز یک‌بارمصرف (طرح ۲.۹، S4 و S12) ─────────────────────

CARD_SALT = 'accounts.id_card.v1'
CARD_PREFIX = 'EMP-'
_CARD_SIG_LEN = 16
OTP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'  # بی O/0، I/l/1
OTP_LENGTH = 10


def _card_signature(user_id):
    # امضای HMAC با SECRET_KEY و نمک جدا (همان سازوکار django.core.signing)؛ hex بزرگ تا در بارکد Code 39 جا شود
    from django.utils.crypto import salted_hmac
    return salted_hmac(CARD_SALT, str(int(user_id)), algorithm='sha256').hexdigest()[:_CARD_SIG_LEN].upper()


def card_code_for(user):
    """کد کارت: EMP-<شناسه>-<امضا>؛ بی امضا قابل ساختن یا حدس نیست."""
    if user is None or not getattr(user, 'pk', None):
        return None
    return f'{CARD_PREFIX}{user.pk}-{_card_signature(user.pk)}'


def user_id_from_card_code(code):
    """شناسهٔ کاربر از کد کارت امضاشده، یا None اگر کد نامعتبر یا جعلی است."""
    from django.utils.crypto import constant_time_compare
    code = (code or '').strip().upper()
    if not code.startswith(CARD_PREFIX):
        return None
    parts = code[len(CARD_PREFIX):].split('-')
    if (len(parts) != 2 or not (parts[0].isascii() and parts[0].isdecimal()) or len(parts[0]) > 10
            or len(parts[1]) != _CARD_SIG_LEN):
        return None
    user_id = int(parts[0])
    if user_id <= 0 or not constant_time_compare(parts[1], _card_signature(user_id)):
        return None
    return user_id


def generate_one_time_password(length=OTP_LENGTH):
    """رمز یک‌بارمصرف تصادفی (secrets)، بی نویسه‌های هم‌شکل؛ دست‌کم یک حرف و یک رقم."""
    import secrets
    while True:
        value = ''.join(secrets.choice(OTP_ALPHABET) for _ in range(max(10, int(length))))
        if any(c.isdigit() for c in value) and any(c.isalpha() for c in value):
            return value


def _effective_codes(user):
    # مجوزهای سامانه‌ای به‌اضافهٔ مجوزهای بخشی که کاربر دست‌کم در یک بخش دارد (حقوق، خزانه، انبار…)
    from . import scoped_permissions as sp
    if user is not None and user.pk and not user.is_active:
        # حساب غیرفعال مجوزهایش را نگه می‌دارد؛ برای فعال‌سازی دوباره رتبه با همان مجوزها سنجیده می‌شود (۲.۹)
        probe = type(user).objects.get(pk=user.pk)
        probe.is_active = True
        return set(sp.all_permission_names(probe))
    return set(sp.all_permission_names(user))


def permissions_beyond_actor(actor, target):
    """مجوزهای سامانه‌ای مؤثر هدف که انجام‌دهنده ندارد (مجموعهٔ تهی یعنی هدف بالاتر از او نیست)."""
    if _is_live_superuser(actor) or target is None or target.pk == getattr(actor, 'pk', None):
        return set()
    return _effective_codes(target) - _effective_codes(actor)


def ensure_actor_outranks_user(actor, target):
    """
    رمز، غیرفعال‌سازی و حذف کاربر دیگر (S2): افزون بر تسلط بر شرکت‌ها، مجوزهای سامانه‌ای مؤثر هدف
    (از جمله حساس و perm_usr_role) باید زیرمجموعهٔ مجوزهای انجام‌دهنده باشد؛ وگرنه ۴۰۳.
    """
    from rest_framework.exceptions import PermissionDenied
    ensure_actor_controls_user(actor, target)
    missing = permissions_beyond_actor(actor, target)
    if missing:
        codes = '، '.join(sorted(str(c).split('.', 1)[-1] for c in missing)[:5])
        raise PermissionDenied(MSG_OUTRANKED.format(codes=codes))
