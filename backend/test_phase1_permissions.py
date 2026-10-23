import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.views import DatabaseBackupViewSet
from config.views_backup import BackupCreateView, BackupRestoreView

User = get_user_model()

def run_tests():
    print("==================================================")
    print("PHASE 1 INDEPENDENT SECURITY TEST SUITE STARTING")
    print("==================================================")

    # 1. Setup test permissions
    perm_manage = Permission.objects.get(codename='perm_sys_backup_manage')
    perm_restore = Permission.objects.get(codename='perm_sys_backup_restore')

    # User A: Regular User (No backup perms)
    user_regular, _ = User.objects.get_or_create(username='test_regular_phase1', defaults={'is_active': True})
    user_regular.user_permissions.clear()
    user_regular.is_superuser = False
    user_regular.save()

    # User B: Backup Operator (Only perm_sys_backup_manage)
    user_operator, _ = User.objects.get_or_create(username='test_operator_phase1', defaults={'is_active': True})
    user_operator.user_permissions.clear()
    user_operator.user_permissions.add(perm_manage)
    user_operator.is_superuser = False
    user_operator.save()

    # User C: Disaster Recovery Officer (Has perm_sys_backup_restore)
    user_officer, _ = User.objects.get_or_create(username='test_officer_phase1', defaults={'is_active': True})
    user_officer.user_permissions.clear()
    user_officer.user_permissions.add(perm_restore)
    user_officer.is_superuser = False
    user_officer.save()

    # User D: Superuser
    user_super, _ = User.objects.get_or_create(username='test_super_phase1', defaults={'is_active': True, 'is_superuser': True})

    factory = APIRequestFactory()
    list_view = DatabaseBackupViewSet.as_view({'get': 'list'})
    create_view = DatabaseBackupViewSet.as_view({'post': 'create'})
    verify_view = DatabaseBackupViewSet.as_view({'post': 'verify'})
    restore_view = DatabaseBackupViewSet.as_view({'post': 'restore'})

    # ----------------------------------------------------
    # TEST 1: Regular User Access Checks (Should all be 403)
    # ----------------------------------------------------
    req_list = factory.get('/api/accounts/backups/')
    force_authenticate(req_list, user=user_regular)
    resp = list_view(req_list)
    assert resp.status_code == 403, f"Regular user list expected 403, got {resp.status_code}"
    print("[PASS] Test 1.1: Regular user blocked from listing backups (403).")

    req_create = factory.post('/api/accounts/backups/', {'description': 'test'})
    force_authenticate(req_create, user=user_regular)
    resp = create_view(req_create)
    assert resp.status_code == 403, f"Regular user create expected 403, got {resp.status_code}"
    print("[PASS] Test 1.2: Regular user blocked from creating backups (403).")

    req_restore = factory.post('/api/accounts/backups/restore/', {'filename': 'fake.dump', 'confirm_text': 'RESTORE_DATABASE_CONFIRM'})
    force_authenticate(req_restore, user=user_regular)
    resp = restore_view(req_restore)
    assert resp.status_code == 403, f"Regular user restore expected 403, got {resp.status_code}"
    print("[PASS] Test 1.3: Regular user blocked from restoring database (403).")

    # ----------------------------------------------------
    # TEST 2: Backup Operator Access Checks
    # (Allowed list/create/verify, FORBIDDEN on restore)
    # ----------------------------------------------------
    req_list_op = factory.get('/api/accounts/backups/')
    force_authenticate(req_list_op, user=user_operator)
    resp_list_op = list_view(req_list_op)
    assert resp_list_op.status_code == 200, f"Operator should list backups, got {resp_list_op.status_code}"
    print("[PASS] Test 2.1: Backup operator successfully listed backups (200).")

    # Attempt restore by Operator -> MUST BE FORBIDDEN (403)
    req_restore_op = factory.post('/api/accounts/backups/restore/', {'filename': 'fake.dump', 'confirm_text': 'RESTORE_DATABASE_CONFIRM'})
    force_authenticate(req_restore_op, user=user_operator)
    resp_restore_op = restore_view(req_restore_op)
    assert resp_restore_op.status_code == 403, f"CRITICAL: Backup operator MUST get 403 on restore, got {resp_restore_op.status_code}"
    print("[PASS] Test 2.2: Backup operator strictly FORBIDDEN from restoring database (403).")

    # ----------------------------------------------------
    # TEST 3: Disaster Recovery Officer Access Checks
    # (Allowed list and restore)
    # ----------------------------------------------------
    req_list_off = factory.get('/api/accounts/backups/')
    force_authenticate(req_list_off, user=user_officer)
    resp_list_off = list_view(req_list_off)
    assert resp_list_off.status_code == 200
    print("[PASS] Test 3.1: Recovery officer successfully listed backups (200).")

    req_restore_off_bad_confirm = factory.post('/api/accounts/backups/restore/', {'filename': 'fake.dump', 'confirm_text': 'wrong'})
    force_authenticate(req_restore_off_bad_confirm, user=user_officer)
    resp_bad = restore_view(req_restore_off_bad_confirm)
    assert resp_bad.status_code == 400
    print("[PASS] Test 3.2: Recovery officer passed permission check and reached confirm_text validation (400 bad confirm).")

    # ----------------------------------------------------
    # TEST 4: Config Views Backup Permission Classes
    # ----------------------------------------------------
    view_create = BackupCreateView.as_view()
    view_wbak_restore = BackupRestoreView.as_view()

    req_wbak_op = factory.post('/api/backup/create/', {'password': 'test'})
    force_authenticate(req_wbak_op, user=user_operator)
    resp_create_op = view_create(req_wbak_op)
    assert resp_create_op.status_code != 403, f"Operator should have permission for backup create, got {resp_create_op.status_code}"
    print("[PASS] Test 4.1: Backup operator has permission to access /api/backup/create/ (not 403).")

    req_wbak_restore_op = factory.post('/api/backup/restore/', {'password': 'test'})
    force_authenticate(req_wbak_restore_op, user=user_operator)
    resp_wbak_restore_op = view_wbak_restore(req_wbak_restore_op)
    assert resp_wbak_restore_op.status_code == 403, f"Operator MUST get 403 on /api/backup/restore/, got {resp_wbak_restore_op.status_code}"
    print("[PASS] Test 4.2: Backup operator gets 403 Forbidden on /api/backup/restore/.")

    # Cleanup
    user_regular.delete()
    user_operator.delete()
    user_officer.delete()
    user_super.delete()

    print("==================================================")
    print("ALL PHASE 1 SECURITY TESTS PASSED WITH 100% SUCCESS")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
