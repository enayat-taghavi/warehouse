import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.views import AuditLogViewSet, UserLoginLogViewSet
from accounts.models import AuditLog

User = get_user_model()

def run_tests():
    print("==================================================")
    print("PHASE 2 INDEPENDENT SECURITY TEST SUITE STARTING")
    print("==================================================")

    perm_export = Permission.objects.get(codename='perm_sys_audit_export')
    perm_purge = Permission.objects.get(codename='perm_sys_purge_logs')

    # User A: Regular User (No export/purge perms)
    user_regular, _ = User.objects.get_or_create(username='test_regular_phase2', defaults={'is_active': True})
    user_regular.user_permissions.clear()
    user_regular.is_superuser = False
    user_regular.save()

    # User B: Auditor (Only perm_sys_audit_export)
    user_auditor, _ = User.objects.get_or_create(username='test_auditor_phase2', defaults={'is_active': True})
    user_auditor.user_permissions.clear()
    user_auditor.user_permissions.add(perm_export)
    user_auditor.is_superuser = False
    user_auditor.save()

    # User C: Security Purger (Has perm_sys_purge_logs)
    user_purger, _ = User.objects.get_or_create(username='test_purger_phase2', defaults={'is_active': True})
    user_purger.user_permissions.clear()
    user_purger.user_permissions.add(perm_purge)
    user_purger.is_superuser = False
    user_purger.save()

    factory = APIRequestFactory()
    audit_export_view = AuditLogViewSet.as_view({'get': 'export_csv'})
    audit_purge_view = AuditLogViewSet.as_view({'post': 'purge'})
    login_export_view = UserLoginLogViewSet.as_view({'get': 'export_csv'})

    # ----------------------------------------------------
    # TEST 1: Regular User Tests (Export and Purge must be 403)
    # ----------------------------------------------------
    req1 = factory.get('/api/accounts/audit-logs/export_csv/')
    force_authenticate(req1, user=user_regular)
    resp1 = audit_export_view(req1)
    assert resp1.status_code == 403, f"Expected 403 for regular user audit export, got {resp1.status_code}"
    print("[PASS] Test 1.1: Regular user blocked from exporting audit logs (403).")

    req1_login = factory.get('/api/accounts/user-login-logs/export_csv/')
    force_authenticate(req1_login, user=user_regular)
    resp1_login = login_export_view(req1_login)
    assert resp1_login.status_code == 403, f"Expected 403 for regular user login export, got {resp1_login.status_code}"
    print("[PASS] Test 1.2: Regular user blocked from exporting login logs (403).")

    req1_purge = factory.post('/api/accounts/audit-logs/purge/', {'confirm_text': 'PURGE_AUDIT_LOGS_CONFIRM'})
    force_authenticate(req1_purge, user=user_regular)
    resp1_purge = audit_purge_view(req1_purge)
    assert resp1_purge.status_code == 403, f"Expected 403 for regular user purge, got {resp1_purge.status_code}"
    print("[PASS] Test 1.3: Regular user blocked from purging audit logs (403).")

    # ----------------------------------------------------
    # TEST 2: Auditor Access Tests (Export allowed, Purge 403)
    # ----------------------------------------------------
    req2_export = factory.get('/api/accounts/audit-logs/export_csv/')
    force_authenticate(req2_export, user=user_auditor)
    resp2_export = audit_export_view(req2_export)
    assert resp2_export.status_code == 200, f"Expected 200 for auditor export, got {resp2_export.status_code}"
    assert "text/csv" in resp2_export['Content-Type']
    print("[PASS] Test 2.1: Auditor successfully exported audit logs CSV (200).")

    req2_login_exp = factory.get('/api/accounts/user-login-logs/export_csv/')
    force_authenticate(req2_login_exp, user=user_auditor)
    resp2_login_exp = login_export_view(req2_login_exp)
    assert resp2_login_exp.status_code == 200
    print("[PASS] Test 2.2: Auditor successfully exported login logs CSV (200).")

    # CRITICAL: Auditor attempts to purge logs -> MUST BE 403!
    req2_purge = factory.post('/api/accounts/audit-logs/purge/', {'confirm_text': 'PURGE_AUDIT_LOGS_CONFIRM'})
    force_authenticate(req2_purge, user=user_auditor)
    resp2_purge = audit_purge_view(req2_purge)
    assert resp2_purge.status_code == 403, f"CRITICAL: Auditor MUST NOT be allowed to purge logs, got {resp2_purge.status_code}"
    print("[PASS] Test 2.3: Auditor strictly FORBIDDEN from purging audit logs (403).")

    # ----------------------------------------------------
    # TEST 3: Purger Access Tests (Allowed export & purge)
    # ----------------------------------------------------
    # 3.1 Bad confirm text -> 400 Bad Request
    req3_bad = factory.post('/api/accounts/audit-logs/purge/', {'confirm_text': 'wrong'})
    force_authenticate(req3_bad, user=user_purger)
    resp3_bad = audit_purge_view(req3_bad)
    assert resp3_bad.status_code == 400
    print("[PASS] Test 3.1: Purge rejected with 400 when confirmation text is invalid.")

    # 3.2 Proper purge execution
    req3_good = factory.post('/api/accounts/audit-logs/purge/', {'confirm_text': 'PURGE_AUDIT_LOGS_CONFIRM', 'days': 9999})
    force_authenticate(req3_good, user=user_purger)
    resp3_good = audit_purge_view(req3_good)
    assert resp3_good.status_code == 200
    assert resp3_good.data.get('success') is True
    print("[PASS] Test 3.2: Authorized Purger successfully executed purge action (200).")

    # Cleanup
    user_regular.delete()
    user_auditor.delete()
    user_purger.delete()

    print("==================================================")
    print("ALL PHASE 2 SECURITY TESTS PASSED WITH 100% SUCCESS")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
