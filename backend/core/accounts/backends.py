from django.contrib.auth.backends import ModelBackend

class RoleInheritanceBackend(ModelBackend):
    """
    Custom authentication backend that extends ModelBackend.
    طرح ۲.۲ (ت۱۱): درخت والد و فرزند CustomRole حذف شده؛ مجوزهای نقش سامانه‌ای فقط از نقش‌های مستقیم کاربر
    (همان _get_group_permissions خود جنگو) می‌آیند.

    طرح ۲.۲ (ت۷): get_all_permissions (و در نتیجه has_perm) از موتور مجوزهای ریز
    (accounts/scoped_permissions.py) می‌آید: مجوزهای سامانه‌ای با تفاوت‌های سامانه‌ای کاربر، به‌اضافهٔ
    مجوزهای بخشی که کاربر دست‌کم در یک بخش دارد. مجوز بخشی از نقش سامانه‌ای یا تیک مستقیم حساب نمی‌شود.
    کاری که روی یک ردیف انجام می‌شود باید can(user, code, section) بپرسد، نه has_perm (ت۸).
    """

    def get_all_permissions(self, user_obj, obj=None):
        if not user_obj.is_active or user_obj.is_anonymous or obj is not None:
            return set()
        from .scoped_permissions import all_permission_names
        return all_permission_names(user_obj)
