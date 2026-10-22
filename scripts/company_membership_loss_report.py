"""
Read-only report (company permissions plan, step 6).

Lists users who today hold a manual `workspace_full` UserCompanyAccess row but have no automatic
membership source for that company, so they lose module access when membership becomes
automatic-only:
  - accounting source: an active UserSectionAssignment in a section of that company's projects;
  - warehouse source (plan decision T7, not registered yet, so queried directly):
    assigned to an active (non-archived) warehouse of that company.
Also lists users who would GAIN membership through the new warehouse source.

Runs inside a READ ONLY transaction; writes nothing.
Usage (from the repo root):
    PYTHONUTF8=1 warehouse-backend/venv/Scripts/python.exe -I scripts/company_membership_loss_report.py
"""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / 'warehouse-backend'
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django  # noqa: E402

django.setup()

from django.apps import apps  # noqa: E402
from django.db import connection, transaction  # noqa: E402


def warehouse_member_pairs():
    if not apps.is_installed('warehouses'):
        return set()
    Warehouse = apps.get_model('warehouses', 'Warehouse')
    qs = Warehouse.objects.filter(company__isnull=False)
    if any(f.name == 'is_archived' for f in Warehouse._meta.fields):
        qs = qs.filter(is_archived=False)
    elif any(f.name == 'is_active' for f in Warehouse._meta.fields):
        qs = qs.filter(is_active=True)
    return set(qs.values_list('assigned_users__id', 'company_id').exclude(assigned_users__id=None))


def section_member_pairs():
    if not apps.is_installed('personnel'):
        return set()
    Assignment = apps.get_model('personnel', 'UserSectionAssignment')
    return set(Assignment.objects.filter(is_active=True, section__project__company__isnull=False)
               .values_list('user_id', 'section__project__company_id'))


def main():
    UserCompanyAccess = apps.get_model('companies', 'UserCompanyAccess')
    with transaction.atomic():
        with connection.cursor() as c:
            c.execute('SET TRANSACTION READ ONLY')
        wh = warehouse_member_pairs()
        sec = section_member_pairs()
        rows = (UserCompanyAccess.objects.filter(access_level='workspace_full')
                .select_related('user', 'company').order_by('company__code', 'user__username'))
        losing = []
        for r in rows:
            if r.user.is_superuser:
                continue
            key = (r.user_id, r.company_id)
            if key not in wh and key not in sec:
                losing.append(r)
        print(f'manual workspace_full rows: {rows.count()}')
        print(f'LOSING membership (no section or warehouse source, not superuser): {len(losing)}')
        for r in losing:
            u = r.user
            print(f'  user#{u.id} {u.username} active={u.is_active} staff={u.is_staff} '
                  f'last_login={u.last_login:%Y-%m-%d}' if u.last_login else
                  f'  user#{u.id} {u.username} active={u.is_active} staff={u.is_staff} last_login=never',
                  f'| company#{r.company_id} {r.company.code}')
        manual = set(UserCompanyAccess.objects.filter(access_level='workspace_full').values_list('user_id', 'company_id'))
        gaining = sorted(wh - manual - sec)
        print(f'GAINING membership via warehouse source only: {len(gaining)}')
        for uid, cid in gaining:
            print(f'  user#{uid} -> company#{cid}')
        transaction.set_rollback(True)


if __name__ == '__main__':
    main()
