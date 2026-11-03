"""
مجوز سطح API نامه‌ها (ن۹). دامنهٔ هر نامه (شرکت، دیدن، ویرایش) را access.py می‌سنجد؛ این‌جا فقط دروازه است:
کاربر فعال وارد شده، و برای نوشتن عضو دست‌کم یک شرکت. مدیر کل را حصار مرکزی SUPERUSER_WRITE_FENCE فقط‌خواندنی می‌کند.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .access import is_live_superuser, member_company_ids


class LettersPermission(BasePermission):
    message = 'دسترسی به نامه‌ها برای شما باز نیست.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        if request.method in SAFE_METHODS:
            return True
        # لایهٔ دوم کنار حصار مرکزی: مدیر کل در نامه‌ها نمی‌نویسد (ق۷)
        if is_live_superuser(user):
            return False
        return bool(member_company_ids(user))
