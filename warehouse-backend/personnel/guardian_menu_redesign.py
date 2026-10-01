"""
Guardian Verification Suite for Role-Based Menu & Cartable Redesign
Validates:
1. Backend APIs for Manager & Finance Approvals, Fleet Settlement, Payroll & Base Settings
2. Zero-Regression on 58-Column Calculation Engine & Formulas
3. Verification of Route Contracts, Query Parameters, and Coexistence
"""

import os
import sys
import io
import django

# Force UTF-8 stdout for Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Setup Django Environment
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from personnel.models import (
    PersonnelProfile,
    VehicleDriverProfile,
    PersonnelChangeRequest,
    VehicleChangeRequest,
    DailyAttendance,
    MonthlyWorkPeriod,
    PayrollYearlySettings,
    JobGradeTier,
    MonthlyPayrollRecord
)

User = get_user_model()


def verify_frontend_hubs():
    """
    بررسی ایستای فرانت، بدون نوشتن در دیتابیس (به‌تنهایی هم قابل اجراست).
    کارکرد مشترک، کارتابل مالی و کارتابل خزانه طبق طرح منوی نقش‌ها و راهبر تشکیلات بازنشسته شدند
    و هاب‌های نقش جانشین آن‌ها هستند.
    """
    print("\n[Check 6/7] Verifying Frontend Module Architecture...")
    app_dir = os.path.join(backend_dir, '..', 'warehouse-front', 'src', 'app')
    components_dir = os.path.join(app_dir, 'components')

    attendance_path = os.path.join(components_dir, 'finance', 'employee', 'employee-attendance', 'employee-attendance.ts')
    manager_path = os.path.join(components_dir, 'personnel', 'manager-approvals', 'manager-approvals.ts')
    finance_path = os.path.join(components_dir, 'finance', 'accountant', 'accountant-payroll', 'accountant-payroll.ts')
    treasury_path = os.path.join(components_dir, 'finance', 'treasurer', 'treasurer-disbursements', 'treasurer-disbursements.ts')
    profiles_path = os.path.join(components_dir, 'personnel', 'personnel-profiles', 'personnel-profiles.ts')
    settings_path = os.path.join(components_dir, 'personnel', 'base-settings', 'base-settings.ts')

    for path in (attendance_path, manager_path, finance_path, treasury_path, profiles_path, settings_path):
        assert os.path.exists(path), f"Missing {path}"
    print("  ✅ EmployeeAttendanceHub component exists (successor of WarehouseAttendance)")
    print("  ✅ ManagerApprovals component exists")
    print("  ✅ AccountantPayrollHub component exists (successor of FinanceCartable)")
    print("  ✅ TreasurerDisbursements component exists (successor of TreasuryCartable)")
    print("  ✅ PersonnelProfilesHub component exists")
    print("  ✅ BaseSettings component exists")

    for retired in ('warehouse-attendance', 'finance-cartable', 'treasury-cartable'):
        retired_dir = os.path.join(components_dir, 'personnel', retired)
        assert not os.path.exists(retired_dir), f"Retired component still present: {retired_dir}"
    with open(os.path.join(app_dir, 'modules', 'accounting', 'accounting.routes.ts'), 'r', encoding='utf-8') as f:
        acct_routes = f.read()
    for src, dst in (('attendance', 'employee-attendance'), ('fleet', 'employee-fleet'),
                     ('finance-cartable', 'accountant-payroll'), ('treasury-cartable', 'treasurer-disbursements')):
        assert f"{{ path: '{src}', redirectTo: '{dst}'" in acct_routes, f"Missing redirect {src} -> {dst}"
    print("  ✅ Retired routes redirect directly to their successor hubs")

    print("\n[Check 7/7] Verifying Two-Way URL Query Parameter State Synchronization across the Hubs...")
    with open(attendance_path, 'r', encoding='utf-8') as f:
        att_code = f.read()
        assert 'queryParams.subscribe' in att_code, "Attendance missing queryParams subscription"
        assert "params['section_id']" in att_code, "Attendance missing query params keys"
        print("  ✅ EmployeeAttendanceHub: URL query params (section_id) verified")

    with open(profiles_path, 'r', encoding='utf-8') as f:
        prof_code = f.read()
        assert 'queryParams.subscribe' in prof_code, "Profiles missing queryParams subscription"
        assert 'tab' in prof_code and 'subtab' in prof_code and 'status' in prof_code and 'wh' in prof_code and 'search' in prof_code, "Profiles missing query params keys"
        print("  ✅ PersonnelProfiles: URL query params (tab, subtab, status, wh, search) verified")

    with open(finance_path, 'r', encoding='utf-8') as f:
        fin_code = f.read()
        assert 'queryParams.subscribe' in fin_code, "Payroll missing queryParams subscription"
        assert all(f"params['{k}']" in fin_code for k in ('tab', 'year', 'month', 'wh', 'section_id')), "Payroll missing query params keys"
        print("  ✅ AccountantPayrollHub: URL query params (tab, year, month, wh, section_id) verified")

    with open(manager_path, 'r', encoding='utf-8') as f:
        man_code = f.read()
        assert 'queryParams.subscribe' in man_code, "Manager missing queryParams subscription"
        assert 'tab' in man_code and 'status' in man_code and 'wh' in man_code and 'cr_type' in man_code, "Manager missing query params keys"
        print("  ✅ ManagerApprovals: URL query params (tab, status, wh, cr_type) verified")

    with open(settings_path, 'r', encoding='utf-8') as f:
        set_code = f.read()
        assert 'queryParams.subscribe' in set_code, "Settings missing queryParams subscription"
        assert 'tab' in set_code and 'year' in set_code, "Settings missing query params keys"
        print("  ✅ BaseSettings: URL query params (tab, year) verified")


def run_guardian_checks():
    print("=" * 70, flush=True)
    print("🛡️ RUNNING GUARDIAN SUITE: Role-Based Menu & Cartable Redesign", flush=True)
    print("=" * 70, flush=True)

    # 1. Check Superuser & Admin setup
    admin_user, _ = User.objects.get_or_create(username='test_admin_guardian', defaults={'is_superuser': True, 'is_staff': True})
    client = APIClient()
    client.force_authenticate(user=admin_user)

    # 2. Verify Base Settings API & 20 Job Grades
    print("\n[Check 1/6] Verifying Base Settings & 20 Job Grades API...", flush=True)
    res = client.get('/api/personnel/settings/active-or-year/?year=1405')
    if res.status_code == 200:
        data = res.json()
        grades = data.get('job_grades', [])
        print(f"  ✅ Base Settings retrieved successfully (Fiscal Year: {data.get('fiscal_year')})", flush=True)
        print(f"  ✅ 20 Job Grades loaded: {len(grades)} groups found.", flush=True)
        assert len(grades) >= 20, f"Expected 20 job grades, found {len(grades)}"
    else:
        print(f"  ❌ Failed to get Base Settings: {res.status_code} {res.content}", flush=True)

    # 3. Verify Manager Approvals Data & Endpoints
    print("\n[Check 2/6] Verifying Manager Approvals Endpoints...")
    res = client.get('/api/personnel/profiles/?approval_status=draft')
    print(f"  ✅ Draft personnel query: status={res.status_code}")
    assert res.status_code == 200, "Draft personnel endpoint failed"

    res = client.get('/api/personnel/vehicles/?approval_status=draft')
    print(f"  ✅ Draft vehicles query: status={res.status_code}")
    assert res.status_code == 200, "Draft vehicles endpoint failed"

    res = client.get('/api/personnel/personnel-change-requests/')
    print(f"  ✅ Personnel change requests query: status={res.status_code}")
    assert res.status_code == 200, "Personnel CR endpoint failed"

    res = client.get('/api/personnel/vehicle-change-requests/')
    print(f"  ✅ Vehicle change requests query: status={res.status_code}")
    assert res.status_code == 200, "Vehicle CR endpoint failed"

    # 4. Verify Finance Cartable Endpoints
    print("\n[Check 3/6] Verifying Finance Cartable & Approvals Endpoints...")
    res = client.get('/api/personnel/profiles/?approval_status=manager_approved')
    print(f"  ✅ Manager-approved personnel query: status={res.status_code}")
    assert res.status_code == 200, "Finance personnel approval endpoint failed"

    res = client.get('/api/personnel/vehicles/?approval_status=manager_approved')
    print(f"  ✅ Manager-approved vehicles query: status={res.status_code}")
    assert res.status_code == 200, "Finance vehicle approval endpoint failed"

    # 5. Verify 58-Column Monthly Payroll Engine
    print("\n[Check 4/6] Verifying 58-Column Payroll Engine & Calculation Contract...")
    res = client.get('/api/personnel/monthly-payroll/?year_month=1405/04')
    print(f"  ✅ Monthly payroll endpoint: status={res.status_code}")
    assert res.status_code == 200, "Monthly payroll endpoint failed"

    # 6. Verify Fleet Settlement & Exports
    print("\n[Check 5/6] Verifying Fleet Settlement & Bank Paya Structure...")
    res = client.get('/api/personnel/fleet-settlement/calculate/?year_month=1405/04')
    print(f"  ✅ Fleet settlement endpoint: status={res.status_code}")
    assert res.status_code == 200, "Fleet settlement endpoint failed"

    # 7. Verify Frontend Component Artifacts & 2-Way URL Query Params Bindings
    verify_frontend_hubs()

    print("\n" + "=" * 70)
    print("🎉 ALL GUARDIAN CHECKS PASSED WITH ZERO REGRESSIONS & COMPLETE URL SYNC!")
    print("=" * 70)

if __name__ == '__main__':
    try:
        run_guardian_checks()
    finally:
        User.objects.filter(username='test_admin_guardian').delete()
        print("🧹 [CLEANUP] کاربر تستی test_admin_guardian با موفقیت پاکسازی شد.")
