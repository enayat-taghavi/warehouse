# -*- coding: utf-8 -*-
"""
Audit log app-scope filtering and user restriction helpers.
Extension points:
- audit_app_scope_filters: tuple of (module_code, filter_fn) where filter_fn(qs) -> qs
- audit_user_restrictions: tuple of restriction_fn where restriction_fn(qs, user, scope_module) -> qs
"""
from django.db.models import Q
from platform_core.registry import module_for_scope_code, contributions, audit_scope_keys


def apply_audit_app_scope(qs, app_scope):
    """
    Apply domain app-scope filter for audit logs.
    If no scope module corresponds to app_scope, returns qs unchanged.
    Otherwise applies the filter function contributed for that module through
    'audit_app_scope_filters', or falls back to filtering by module__in with
    audit_scope_keys(module_code).
    Finally excludes CROSS_APP_DENIED and APP_SCOPE_SWITCH events.
    """
    scope_module = module_for_scope_code(app_scope)
    if not scope_module:
        return qs

    mod_code = getattr(scope_module, 'code', str(scope_module))

    filter_fn = None
    for item in contributions('audit_app_scope_filters'):
        if isinstance(item, (tuple, list)) and len(item) == 2:
            if item[0] == mod_code and callable(item[1]):
                filter_fn = item[1]
                break

    if filter_fn is not None:
        qs = filter_fn(qs)
    else:
        qs = qs.filter(module__in=audit_scope_keys(mod_code))

    return qs.exclude(
        Q(details__event='CROSS_APP_DENIED') |
        Q(details__event='APP_SCOPE_SWITCH')
    )


def restrict_audit_for_user(qs, user, app_scope):
    """
    Restrict audit log queryset based on user permissions and module contributions.
    Calls every function registered under 'audit_user_restrictions' as:
    fn(qs, user, scope_module)
    """
    scope_module = module_for_scope_code(app_scope)
    for fn in contributions('audit_user_restrictions'):
        if callable(fn):
            qs = fn(qs, user, scope_module)
    return qs
