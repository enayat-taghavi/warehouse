"""
هندلر قلمرو انبار برای موتور گزارش پلتفرم — فاز ۴ گام ۲.
مرجع: Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md
"""
from django.db.models import Q
from platform_core.query_engine.engine import ReportError
from common.warehouse_scope import can_access_warehouse, user_warehouse_ids, scope_queryset


class WarehouseScopeHandler:
    """
    هندلر قلمرو انبار برای گزارش‌ساز عام پلتفرم.
    """
    kind = 'warehouse'
    per_scope_settings = True

    def check_access(self, user, scope_id):
        """
        بررسی دسترسی کاربر به انبار هدف.
        در صورت عدم دسترسی ReportError(403) صادر می‌کند.
        فهرست شناسه‌های انبار مجاز کاربر (یا None به معنای همه) را برمی‌گرداند.
        """
        target_wh = int(scope_id) if scope_id else None
        if target_wh is not None and not can_access_warehouse(user, target_wh):
            raise ReportError('به این انبار دسترسی ندارید.', status=403)
        return user_warehouse_ids(user)

    def scope_queryset(self, qs, user, path, scope_id):
        """
        اعمال محدودیت قلمرو انبار روی QuerySet بر اساس مسیر فیلد و انبار انتخابی.
        """
        qs = scope_queryset(qs, user, field=path)
        if scope_id:
            qs = qs.filter(**{path: scope_id})
        return qs

    def join_q(self, user, assigned_ids, path, scope_id) -> Q:
        """
        تولید شرط Q برای پیوند JOIN بر اساس قلمرو انبار.
        """
        scope_q = Q()
        if not user.is_superuser:
            if assigned_ids is not None:
                scope_q &= Q(**{f'{path}__in': assigned_ids})
        if scope_id:
            scope_q &= Q(**{f'{path}': scope_id})
        return scope_q
