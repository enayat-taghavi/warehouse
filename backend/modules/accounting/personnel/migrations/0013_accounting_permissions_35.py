# Plan 3.5 s6: final accounting permissions. Five menu / role-marker permissions were removed from the
# module declaration (their Permission rows stay: permission rows are create-only). This additive data
# migration keeps every access working:
# - creates the Permission rows of the three new codes (post_migrate runs only after all migrations);
# - copies each RoleBundleOverride / UserPermissionOverride on a removed code to its replacements
#   (get_or_create; an existing override on the replacement is an explicit choice and wins);
# - repoints open invoice workflow step tasks from a removed code to the new step code (text update).
# Nothing is ever deleted. Reverse is a noop.
from django.db import migrations

NEW_PERMISSIONS = {
    'perm_invoice_approve': 'تأیید سرپرست برای فاکتور و تنخواه',
    'perm_invoice_review': 'بررسی حسابدار برای فاکتور و تنخواه',
    'perm_counterparty_manage': 'مدیریت و دیدن کامل طرف‌حساب‌ها',
}

# Frozen copy of REMOVED_PERMISSION_CODENAMES in modules/accounting/module.py (plan 3.5 s5).
# 'add' overrides go to every replacement: the user keeps everything the old marker opened.
ADD_REPLACEMENTS = {
    'can_act_as_operator': ('view_sys_personnel_attendance', 'view_sys_fleet_attendance'),
    'can_act_as_workshop_supervisor': (
        'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor', 'perm_invoice_approve',
    ),
    'can_act_as_accountant': (
        'perm_approve_personnel_finance', 'perm_approve_fleet_finance', 'perm_invoice_review',
        'perm_counterparty_manage',
    ),
    'can_act_as_company_manager': (
        'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'perm_manager_payment_authorize',
    ),
    'view_sys_treasury': ('perm_treasury_disburse_action',),
}
# 'remove' overrides go only to the new codes that took over what the marker alone decided. Every other
# check always OR-ed the marker with the replacement, so removing the marker never took that work away;
# copying the removal there would take away access the role or user has today.
REMOVE_REPLACEMENTS = {
    'can_act_as_workshop_supervisor': ('perm_invoice_approve',),
    'can_act_as_accountant': ('perm_invoice_review', 'perm_counterparty_manage'),
}
# Open workflow step tasks: the old step permission -> the new one of the same step.
STEP_PERMISSION_MAP = {
    'can_act_as_workshop_supervisor': 'perm_invoice_approve',
    'can_act_as_accountant': 'perm_invoice_review',
    'view_sys_treasury': 'perm_treasury_disburse_action',
}


def _permissions(apps):
    """{codename: Permission} on accounts.customuser for the new codes and all replacement codes."""
    ContentType = apps.get_model('contenttypes', 'ContentType')
    Permission = apps.get_model('auth', 'Permission')
    ct, _ = ContentType.objects.get_or_create(app_label='accounts', model='customuser')
    out = {}
    for code, name in NEW_PERMISSIONS.items():
        out[code], _ = Permission.objects.get_or_create(content_type=ct, codename=code, defaults={'name': name})
    # Existing replacement codes (a database with overrides already has them; post_migrate creates them on
    # a fresh one, where there is no override to copy).
    wanted = {c for codes in ADD_REPLACEMENTS.values() for c in codes} - set(out)
    for perm in Permission.objects.filter(content_type=ct, codename__in=wanted):
        out[perm.codename] = perm
    return out


def _targets(old_code, mode, perms):
    table = ADD_REPLACEMENTS if mode == 'add' else REMOVE_REPLACEMENTS
    return [perms[code] for code in table.get(old_code, ()) if code in perms]


def forwards(apps, schema_editor):
    RoleBundleOverride = apps.get_model('accounts', 'RoleBundleOverride')
    UserPermissionOverride = apps.get_model('accounts', 'UserPermissionOverride')
    WorkflowTask = apps.get_model('workflow', 'WorkflowTask')
    perms = _permissions(apps)
    removed = tuple(ADD_REPLACEMENTS)

    rows = RoleBundleOverride.objects.filter(
        permission__content_type__app_label='accounts', permission__codename__in=removed,
    ).select_related('permission')
    for row in rows:
        for perm in _targets(row.permission.codename, row.mode, perms):
            RoleBundleOverride.objects.get_or_create(
                role_key=row.role_key, permission=perm,
                defaults={'mode': row.mode, 'updated_by_id': row.updated_by_id},
            )

    rows = UserPermissionOverride.objects.filter(
        permission__content_type__app_label='accounts', permission__codename__in=removed,
    ).select_related('permission')
    for row in rows:
        for perm in _targets(row.permission.codename, row.mode, perms):
            UserPermissionOverride.objects.get_or_create(
                user_id=row.user_id, permission=perm, company_id=row.company_id,
                defaults={'mode': row.mode, 'created_by_id': row.created_by_id},
            )

    for old, new in STEP_PERMISSION_MAP.items():
        WorkflowTask.objects.filter(is_open=True, track='step', permission=old).update(permission=new)


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0012_expense_heads'),
        ('accounts', '0007_remove_sodpolicyrule'),
        ('workflow', '0003_referral'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
