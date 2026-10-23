import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.views import AuditLogViewSet
from accounts.models import AuditLog

User = get_user_model()

def run_tests():
    print("==================================================")
    print("PHASE 3 INDEPENDENT SECURITY TEST SUITE STARTING")
    print("==================================================")

    perm_single = Permission.objects.get(codename='perm_rollback_single')
    perm_bulk = Permission.objects.get(codename='perm_rollback_bulk')
    perm_undelete = Permission.objects.get(codename='perm_restore_deleted')
    perm_view = Permission.objects.get(codename='perm_sys_logs')

    # User A: Regular User
    user_regular, _ = User.objects.get_or_create(username='test_regular_phase3', defaults={'is_active': True})
    user_regular.user_permissions.clear()
    user_regular.is_superuser = False
    user_regular.save()

    # User B: Single Revert Supervisor (Has perm_rollback_single and perm_sys_logs)
    user_supervisor, _ = User.objects.get_or_create(username='test_sup_phase3', defaults={'is_active': True})
    user_supervisor.user_permissions.clear()
    user_supervisor.user_permissions.add(perm_single, perm_view)
    user_supervisor.is_superuser = False
    user_supervisor.save()

    # User C: Bulk Revert Manager (Has perm_rollback_bulk and perm_sys_logs)
    user_manager, _ = User.objects.get_or_create(username='test_mgr_phase3', defaults={'is_active': True})
    user_manager.user_permissions.clear()
    user_manager.user_permissions.add(perm_bulk, perm_view)
    user_manager.is_superuser = False
    user_manager.save()

    # Create dummy audit log for testing
    dummy_log = AuditLog.objects.create(
        module='WAREHOUSE',
        action='UPDATE',
        target_model='InventoryItem',
        target_object_id='99999',
        target_repr='Test Item',
        before_state={'name': 'Old Name'},
        after_state={'name': 'New Name'},
        severity='info'
    )

    factory = APIRequestFactory()
    preview_view = AuditLogViewSet.as_view({'get': 'preview_revert'})
    revert_view = AuditLogViewSet.as_view({'post': 'revert'})
    bulk_revert_view = AuditLogViewSet.as_view({'post': 'bulk_revert'})

    # ----------------------------------------------------
    # TEST 1: Regular User Tests (Must all be 403)
    # ----------------------------------------------------
    req1_prev = factory.get(f'/api/accounts/audit-logs/{dummy_log.id}/preview_revert/')
    force_authenticate(req1_prev, user=user_regular)
    resp1_prev = preview_view(req1_prev, pk=dummy_log.id)
    assert resp1_prev.status_code == 403, f"Expected 403 for regular user preview, got {resp1_prev.status_code}"
    print("[PASS] Test 1.1: Regular user blocked from preview_revert (403).")

    req1_rev = factory.post(f'/api/accounts/audit-logs/{dummy_log.id}/revert/', {'reason': 'test'})
    force_authenticate(req1_rev, user=user_regular)
    resp1_rev = revert_view(req1_rev, pk=dummy_log.id)
    assert resp1_rev.status_code == 403, f"Expected 403 for regular user revert, got {resp1_rev.status_code}"
    print("[PASS] Test 1.2: Regular user blocked from single revert (403).")

    req1_bulk = factory.post('/api/accounts/audit-logs/bulk_revert/', {'log_ids': [dummy_log.id]})
    force_authenticate(req1_bulk, user=user_regular)
    resp1_bulk = bulk_revert_view(req1_bulk)
    assert resp1_bulk.status_code == 403, f"Expected 403 for regular user bulk_revert, got {resp1_bulk.status_code}"
    print("[PASS] Test 1.3: Regular user blocked from bulk_revert (403).")

    # ----------------------------------------------------
    # TEST 2: Supervisor Tests (Single allowed, Bulk FORBIDDEN)
    # ----------------------------------------------------
    req2_prev = factory.get(f'/api/accounts/audit-logs/{dummy_log.id}/preview_revert/')
    force_authenticate(req2_prev, user=user_supervisor)
    resp2_prev = preview_view(req2_prev, pk=dummy_log.id)
    assert resp2_prev.status_code == 200, f"Expected 200 for supervisor preview, got {resp2_prev.status_code}"
    print("[PASS] Test 2.1: Supervisor successfully viewed revert preview (200).")

    # CRITICAL: Supervisor attempts bulk_revert -> MUST BE 403!
    req2_bulk = factory.post('/api/accounts/audit-logs/bulk_revert/', {'log_ids': [dummy_log.id]})
    force_authenticate(req2_bulk, user=user_supervisor)
    resp2_bulk = bulk_revert_view(req2_bulk)
    assert resp2_bulk.status_code == 403, f"CRITICAL: Supervisor MUST NOT be allowed bulk_revert, got {resp2_bulk.status_code}"
    print("[PASS] Test 2.2: Supervisor strictly FORBIDDEN from bulk_revert (403).")

    # ----------------------------------------------------
    # TEST 3: Manager Tests (Bulk allowed)
    # ----------------------------------------------------
    req3_bulk = factory.post('/api/accounts/audit-logs/bulk_revert/', {'log_ids': [dummy_log.id]})
    force_authenticate(req3_bulk, user=user_manager)
    resp3_bulk = bulk_revert_view(req3_bulk)
    assert resp3_bulk.status_code != 403, f"Manager should have permission for bulk_revert, got {resp3_bulk.status_code}"
    print("[PASS] Test 3.1: Manager successfully authorized for bulk_revert (not 403).")

    # Cleanup
    dummy_log.delete()
    user_regular.delete()
    user_supervisor.delete()
    user_manager.delete()

    print("==================================================")
    print("ALL PHASE 3 SECURITY TESTS PASSED WITH 100% SUCCESS")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
