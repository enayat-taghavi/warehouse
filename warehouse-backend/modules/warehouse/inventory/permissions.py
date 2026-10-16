from rest_framework import permissions


class CanApproveDocuments(permissions.BasePermission):
    """
    Allows approving, rejecting, and signing financial/shipping documents.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_doc_approve_action') or
            request.user.has_perm('accounts.can_act_as_doc_supervisor') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanApproveFeeds(permissions.BasePermission):
    """
    Allows approving and applying feeding/customs records.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_feed_approve_action') or
            request.user.has_perm('accounts.can_act_as_supervisor') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanFinalizeInventory(permissions.BasePermission):
    """
    Allows final approval and closing of inventory counts/discrepancies.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_inventory_finalize') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanManageItemPhotos(permissions.BasePermission):
    """
    اجازه ثبت/ویرایش/حذف عکس کالا.

    پیش از این، نوشتنِ عکس فقط IsAuthenticated بود؛ یعنی کاربری با تنها
    دسترسی «گزارش‌ساز» هم می‌توانست برای هر کالایی عکس آپلود یا عکس دیگران را
    حذف کند. اینجا دقیقاً همان نقش‌هایی مجاز می‌شوند که در UI دکمه دوربین را
    می‌بینند (کارتابل‌های شمارش، مدیریت کالا، تخصیص، گمرک).

    فهرست عمداً سخاوتمندانه است: هدف بستن دسترسی نقش‌های نامرتبط است، نه
    محدودکردن نقش‌هایی که امروز از این قابلیت استفاده می‌کنند. *خواندن* عکس
    محدود نمی‌شود (فقط IsAuthenticated + اسکوپ انبار).
    """

    ALLOWED_PERMISSIONS = (
        'accounts.view_sys_counter',
        'accounts.view_sys_supervisor',
        'accounts.view_sys_manager_review',
        'accounts.view_sys_recounts',
        'accounts.view_wh_docs',
        'accounts.view_wh_dispatch',
        'accounts.view_wh_customs',
        'accounts.perm_inventory_finalize',
        'accounts.can_act_as_manager',
        'accounts.can_act_as_supervisor',
        'accounts.can_act_as_counter',
    )

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        return any(request.user.has_perm(p) for p in self.ALLOWED_PERMISSIONS)
