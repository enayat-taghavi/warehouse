import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIRequestFactory, force_authenticate
from inventory.views import DocTaskViewSet, CountTaskViewSet

User = get_user_model()

def run_tests():
    print("==================================================")
    print("PHASE 4 INDEPENDENT SECURITY TEST SUITE STARTING")
    print("==================================================")

    perm_doc_app = Permission.objects.get(codename='perm_doc_approve_action')
    perm_inv_fin = Permission.objects.get(codename='perm_inventory_finalize')

    # User A: Observer / Viewer (Has view access only, NO approve actions)
    user_viewer, _ = User.objects.get_or_create(username='test_viewer_phase4', defaults={'is_active': True})
    user_viewer.user_permissions.clear()
    user_viewer.is_superuser = False
    user_viewer.save()

    # User B: Document Approver (Has perm_doc_approve_action)
    user_doc_approver, _ = User.objects.get_or_create(username='test_doc_app_phase4', defaults={'is_active': True})
    user_doc_approver.user_permissions.clear()
    user_doc_approver.user_permissions.add(perm_doc_app)
    user_doc_approver.is_superuser = False
    user_doc_approver.save()

    # User C: Inventory Finalizer (Has perm_inventory_finalize)
    user_inv_finalizer, _ = User.objects.get_or_create(username='test_inv_fin_phase4', defaults={'is_active': True})
    user_inv_finalizer.user_permissions.clear()
    user_inv_finalizer.user_permissions.add(perm_inv_fin)
    user_inv_finalizer.is_superuser = False
    user_inv_finalizer.save()

    factory = APIRequestFactory()
    doc_approve_view = DocTaskViewSet.as_view({'post': 'bulk_approve'})
    doc_mgr_approve_view = DocTaskViewSet.as_view({'post': 'bulk_manager_approve'})
    count_mgr_approve_view = CountTaskViewSet.as_view({'post': 'bulk_manager_approve'})

    # ----------------------------------------------------
    # TEST 1: Viewer Tests (Approval actions must be 403)
    # ----------------------------------------------------
    req1_doc = factory.post('/api/inventory/doc-tasks/bulk_approve/', {'task_ids': [1]})
    force_authenticate(req1_doc, user=user_viewer)
    resp1_doc = doc_approve_view(req1_doc)
    assert resp1_doc.status_code == 403, f"Expected 403 for viewer doc bulk_approve, got {resp1_doc.status_code}"
    print("[PASS] Test 1.1: Viewer blocked from approving documents (403).")

    req1_doc_mgr = factory.post('/api/inventory/doc-tasks/bulk_manager_approve/', {'task_ids': [1]})
    force_authenticate(req1_doc_mgr, user=user_viewer)
    resp1_doc_mgr = doc_mgr_approve_view(req1_doc_mgr)
    assert resp1_doc_mgr.status_code == 403, f"Expected 403 for viewer doc manager approve, got {resp1_doc_mgr.status_code}"
    print("[PASS] Test 1.2: Viewer blocked from manager approving documents (403).")

    req1_count = factory.post('/api/inventory/count-tasks/bulk_manager_approve/', {'task_ids': [1]})
    force_authenticate(req1_count, user=user_viewer)
    resp1_count = count_mgr_approve_view(req1_count)
    assert resp1_count.status_code == 403, f"Expected 403 for viewer count manager approve, got {resp1_count.status_code}"
    print("[PASS] Test 1.3: Viewer blocked from finalizing inventory counts (403).")

    # ----------------------------------------------------
    # TEST 2: Doc Approver Tests (Allowed doc approval, blocked count finalize)
    # ----------------------------------------------------
    req2_doc = factory.post('/api/inventory/doc-tasks/bulk_approve/', {'task_ids': []})
    force_authenticate(req2_doc, user=user_doc_approver)
    resp2_doc = doc_approve_view(req2_doc)
    # 400 means permission passed, but task_ids was empty
    assert resp2_doc.status_code == 400, f"Expected 400 (auth passed) for doc approver, got {resp2_doc.status_code}"
    print("[PASS] Test 2.1: Document Approver successfully authorized for document approval (not 403).")

    req2_count = factory.post('/api/inventory/count-tasks/bulk_manager_approve/', {'task_ids': [1]})
    force_authenticate(req2_count, user=user_doc_approver)
    resp2_count = count_mgr_approve_view(req2_count)
    assert resp2_count.status_code == 403, f"CRITICAL: Doc approver must NOT be allowed to finalize inventory, got {resp2_count.status_code}"
    print("[PASS] Test 2.2: Document Approver strictly FORBIDDEN from finalizing inventory (403).")

    # ----------------------------------------------------
    # TEST 3: Inventory Finalizer Tests (Allowed count finalize, blocked doc approval)
    # ----------------------------------------------------
    req3_count = factory.post('/api/inventory/count-tasks/bulk_manager_approve/', {'task_ids': []})
    force_authenticate(req3_count, user=user_inv_finalizer)
    resp3_count = count_mgr_approve_view(req3_count)
    assert resp3_count.status_code == 400, f"Expected 400 (auth passed) for inventory finalizer, got {resp3_count.status_code}"
    print("[PASS] Test 3.1: Inventory Finalizer successfully authorized for inventory finalization (not 403).")

    req3_doc = factory.post('/api/inventory/doc-tasks/bulk_approve/', {'task_ids': [1]})
    force_authenticate(req3_doc, user=user_inv_finalizer)
    resp3_doc = doc_approve_view(req3_doc)
    assert resp3_doc.status_code == 403, f"CRITICAL: Inventory finalizer must NOT be allowed to approve doc tasks, got {resp3_doc.status_code}"
    print("[PASS] Test 3.2: Inventory Finalizer strictly FORBIDDEN from approving doc tasks (403).")

    # Cleanup
    user_viewer.delete()
    user_doc_approver.delete()
    user_inv_finalizer.delete()

    print("==================================================")
    print("ALL PHASE 4 SECURITY TESTS PASSED WITH 100% SUCCESS")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
