# -*- coding: utf-8 -*-
"""
Audit scope contributions for the accounting module.
"""
from django.db.models import Q
from platform_core.registry import audit_scope_keys

ACCOUNTING_TARGET_MODELS = (
    'PersonnelProfile',
    'MonthlyPayrollRecord',
    'VehicleDriverProfile',
    'VehicleTripLog',
    'MonthlyWorkPeriod',
    'AttendanceDailyRecord',
)


def accounting_audit_scope_filter(qs):
    """
    Accounting app-scope filter: module in own keys, target_model in accounting models,
    or details__target_module='finance'.
    """
    own_keys = audit_scope_keys('accounting')
    return qs.filter(
        Q(module__in=own_keys) |
        Q(target_model__in=ACCOUNTING_TARGET_MODELS) |
        Q(details__target_module='finance')
    )
