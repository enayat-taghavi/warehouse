"""
محاسبه و حل نقش‌های معتبر کاربر در ماژول انبارداری و انبارگردانی (warehouse/warehouses).
این تابع در AppConfig.ready() از طریق contribute('role_resolver', ('warehouse', resolve_warehouse_roles)) ثبت می‌شود.
"""
from platform_core.registry import get_module
from platform_core.registry import has_permission_alias


def resolve_warehouse_roles(user, spec=None) -> list[str]:
    if spec is None:
        spec = get_module('warehouse')
    roles = []
    if user.has_perm('accounts.can_act_as_counter') or user.has_perm('accounts.view_sys_counter') or user.has_perm('accounts.view_wh_dispatch'):
        roles.append('counter')
    if user.has_perm('accounts.can_act_as_wh_supervisor') or (user.has_perm('accounts.view_sys_supervisor') and not has_permission_alias(user, 'count_supervisor_exclusion')) or user.has_perm('accounts.view_wh_doc_approvals'):
        roles.append('warehouse_supervisor')
    if user.has_perm('accounts.can_act_as_doc_worker') or user.has_perm('accounts.view_wh_docs') or user.has_perm('accounts.perm_doc_approve_action'):
        roles.append('docs_specialist')
    if user.has_perm('accounts.can_act_as_wh_manager') or user.has_perm('accounts.can_act_as_manager') or user.has_perm('accounts.view_sys_manager_review') or user.has_perm('accounts.perm_inventory_finalize'):
        roles.append('manager_review')
    if not roles and spec and any(p in user.get_all_permissions() for p in spec.permission_markers):
        roles.append('counter')
    return roles
