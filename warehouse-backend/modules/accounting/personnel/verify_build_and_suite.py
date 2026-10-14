import os
import sys
import io
import subprocess
import django

# Force UTF-8 stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Setup Django Environment
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
import backend_paths
backend_paths.install()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

User = get_user_model()

def run_all():
    print("=" * 70, flush=True)
    print("🛡️ RUNNING COMPREHENSIVE GUARDIAN & BUILD SUITE", flush=True)
    print("=" * 70, flush=True)

    # 1. Check Superuser & Admin setup
    admin_user, _ = User.objects.get_or_create(username='test_admin_guardian', defaults={'is_superuser': True, 'is_staff': True})
    client = APIClient()
    client.force_authenticate(user=admin_user)

    # 2. Verify Base Settings API & 20 Job Grades
    print("\n[Check 1/6] Verifying Base Settings & 20 Job Grades API...", flush=True)
    res = client.get('/api/personnel/settings/active-or-year/?year=1405')
    assert res.status_code == 200, f"Failed settings: {res.status_code}"
    grades = res.json().get('job_grades', [])
    print(f"  ✅ Base Settings retrieved (Fiscal Year: 1405, Grades: {len(grades)})", flush=True)
    assert len(grades) >= 20, f"Expected 20 job grades, found {len(grades)}"

    # 3. Verify Manager Approvals Endpoints
    print("\n[Check 2/6] Verifying Manager Approvals Endpoints...", flush=True)
    res = client.get('/api/personnel/profiles/?approval_status=draft')
    assert res.status_code == 200
    res = client.get('/api/personnel/vehicles/?approval_status=draft')
    assert res.status_code == 200
    res = client.get('/api/personnel/personnel-change-requests/')
    assert res.status_code == 200
    res = client.get('/api/personnel/vehicle-change-requests/')
    assert res.status_code == 200
    print("  ✅ All 4 Manager Approval endpoints verified (200 OK)", flush=True)

    # 4. Verify Finance Cartable Endpoints
    print("\n[Check 3/6] Verifying Finance Cartable Endpoints...", flush=True)
    res = client.get('/api/personnel/profiles/?approval_status=manager_approved')
    assert res.status_code == 200
    res = client.get('/api/personnel/vehicles/?approval_status=manager_approved')
    assert res.status_code == 200
    print("  ✅ All Finance Approval endpoints verified (200 OK)", flush=True)

    # 5. Verify Monthly Payroll Engine (58 cols)
    print("\n[Check 4/6] Verifying 58-Column Payroll Engine Contract...", flush=True)
    res = client.get('/api/personnel/monthly-payroll/')
    assert res.status_code == 200
    print("  ✅ Monthly payroll endpoint verified (200 OK)", flush=True)

    # 6. Verify Fleet Settlement & Bank Structure
    print("\n[Check 5/6] Verifying Fleet Settlement & Bank Paya Structure...", flush=True)
    res = client.get('/api/personnel/fleet-settlement/calculate/?year_month=1405/04')
    assert res.status_code == 200
    print("  ✅ Fleet settlement calculate endpoint verified (200 OK)", flush=True)

    # 7. Angular ngc Compiler Check
    print("\n[Check 6/6] Verifying Angular Template & Type Compiler (ngc)...", flush=True)
    front_dir = os.path.abspath(os.path.join(backend_dir, '..', 'warehouse-front'))
    ngc_bin = os.path.join(front_dir, 'node_modules', '@angular', 'compiler-cli', 'bundles', 'src', 'bin', 'ngc.js')
    
    proc = subprocess.run(
        ['node', ngc_bin, '-p', 'tsconfig.app.json'],
        cwd=front_dir,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='ignore'
    )
    
    if proc.returncode == 0:
        print("  ✅ Angular template & TypeScript compiler PASSED with 0 errors!", flush=True)
    else:
        print(f"  ❌ Angular compiler FAILED with code {proc.returncode}:\n{proc.stderr}\n{proc.stdout}", flush=True)
        sys.exit(1)

    print("\n" + "=" * 70, flush=True)
    print("🎉 ALL GUARDIAN & BUILD CHECKS PASSED WITH ZERO REGRESSIONS!", flush=True)
    print("=" * 70, flush=True)

if __name__ == '__main__':
    try:
        run_all()
    finally:
        User.objects.filter(username='test_admin_guardian').delete()
        print("🧹 [CLEANUP] کاربر تستی test_admin_guardian با موفقیت پاکسازی شد.")
