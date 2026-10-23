# -*- coding: utf-8 -*-
"""
Audit scope contributions for the warehouse module.
"""
from django.db.models import Q
from platform_core.registry import audit_scope_keys
from platform_core.module_catalog import MODULE_CATALOG


def _other_modules_keys():
    """Union of audit_scope_keys for every catalog module other than 'warehouse'."""
    keys = set()
    for code in MODULE_CATALOG.keys():
        if code != 'warehouse':
            keys.update(audit_scope_keys(code))
    return keys


def warehouse_audit_scope_filter(qs):
    """
    Warehouse app-scope filter: module in own keys or warehouse_id not null,
    excluding other modules' keys.
    """
    own_keys = audit_scope_keys('warehouse')
    other_keys = _other_modules_keys()
    return qs.filter(
        Q(module__in=own_keys) |
        Q(warehouse_id__isnull=False)
    ).exclude(
        module__in=other_keys
    )


def warehouse_audit_user_restriction(qs, user, scope_module):
    """
    Restrict non-superuser audit log access by assigned warehouses.
    - scope module is 'warehouse': assigned warehouse ids only.
    - another module: assigned warehouse ids or null warehouse.
    - None: assigned warehouse ids or (null warehouse and module in other modules' keys).
    """
    if not hasattr(user, 'assigned_warehouses'):
        return qs

    assigned_wh_ids = list(user.assigned_warehouses.values_list('id', flat=True))
    scope_code = getattr(scope_module, 'code', scope_module) if scope_module is not None else None

    if scope_code == 'warehouse':
        return qs.filter(warehouse_id__in=assigned_wh_ids)
    elif scope_code is not None:
        return qs.filter(
            Q(warehouse_id__in=assigned_wh_ids) |
            Q(warehouse_id__isnull=True)
        )
    else:
        other_keys = _other_modules_keys()
        return qs.filter(
            Q(warehouse_id__in=assigned_wh_ids) |
            Q(warehouse_id__isnull=True, module__in=other_keys)
        )
