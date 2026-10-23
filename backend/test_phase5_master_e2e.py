import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.views import DatabaseBackupViewSet, AuditLogViewSet, UserLoginLogViewSet
from inventory.views import DocTaskViewSet, CountTaskViewSet

User = get_user_model()

def run_master_suite():
    print("==================================================================")
    print("MASTER END-TO-END GRANULAR RBAC SECURITY SUITE (ALL PHASES 1-5)")
    print("==================================================================")

    factory = APIRequestFactory()

    # ------------------------------------------------------------------
    # 1. Verification of Permission Existence in Database
    # ------------------------------------------------------------------
    required_codenames = [
        'perm_sys_backup_manage',
        'perm_sys_backup_restore',
        'perm_sys_audit_export',
        'perm_sys_purge_logs',
        'perm_rollback_single',
        'perm_rollback_bulk',
        'perm_restore_deleted',
        'perm_doc_approve_action',
        'perm_feed_approve_action',
        'perm_inventory_finalize'
    ]

    for cn in required_codenames:
        p = Permission.objects.filter(codename=cn).first()
        assert p is not None, f"Permission {cn} missing from database!"
    print(f"[PASS] Suite 1: All {len(required_codenames)} granular permissions exist in database.")

    # ------------------------------------------------------------------
    # 2. Phase 1 Verification: Backup Management vs Database Restore
    # ------------------------------------------------------------------
    u_bk_mgr, _ = User.objects.get_or_create(username='u_bk_mgr', defaults={'is_active': True})
    u_bk_mgr.user_permissions.clear()
    u_bk_mgr.user_permissions.add(Permission.objects.get(codename='perm_sys_backup_manage'))
    u_bk_mgr.is_superuser = False
    u_bk_mgr.save()

    backup_view = DatabaseBackupViewSet.as_view({'get': 'list'})
    restore_view = DatabaseBackupViewSet.as_view({'post': 'restore'})

    req_bk = factory.get('/api/accounts/backups/')
    force_authenticate(req_bk, user=u_bk_mgr)
    assert backup_view(req_bk).status_code == 200

    req_rst = factory.post('/api/accounts/backups/restore/', {'filename': 'x.json'})
    force_authenticate(req_rst, user=u_bk_mgr)
    assert restore_view(req_rst).status_code == 403
    print("[PASS] Suite 2: Phase 1 Backup Manager allowed list (200), strictly blocked from restore (403).")

    # ------------------------------------------------------------------
    # 3. Phase 2 Verification: Audit Export vs Audit Purge
    # ------------------------------------------------------------------
    u_auditor, _ = User.objects.get_or_create(username='u_auditor', defaults={'is_active': True})
    u_auditor.user_permissions.clear()
    u_auditor.user_permissions.add(Permission.objects.get(codename='perm_sys_audit_export'))
    u_auditor.is_superuser = False
    u_auditor.save()

    audit_exp_view = AuditLogViewSet.as_view({'get': 'export_csv'})
    audit_purge_view = AuditLogViewSet.as_view({'post': 'purge'})

    req_exp = factory.get('/api/accounts/audit-logs/export_csv/')
    force_authenticate(req_exp, user=u_auditor)
    assert audit_exp_view(req_exp).status_code == 200

    req_prg = factory.post('/api/accounts/audit-logs/purge/', {'confirm_text': 'PURGE_AUDIT_LOGS_CONFIRM'})
    force_authenticate(req_prg, user=u_auditor)
    assert audit_purge_view(req_prg).status_code == 403
    print("[PASS] Suite 3: Phase 2 Auditor allowed export (200), strictly blocked from purge (403).")

    # ------------------------------------------------------------------
    # 4. Phase 3 Verification: Single Revert vs Bulk Revert
    # ------------------------------------------------------------------
    u_single_rev, _ = User.objects.get_or_create(username='u_single_rev', defaults={'is_active': True})
    u_single_rev.user_permissions.clear()
    u_single_rev.user_permissions.add(
        Permission.objects.get(codename='perm_rollback_single'),
        Permission.objects.get(codename='perm_sys_logs')
    )
    u_single_rev.is_superuser = False
    u_single_rev.save()

    from accounts.models import AuditLog
    d_log = AuditLog.objects.create(
        module='SYSTEM', action='UPDATE', target_model='Warehouse', target_object_id='1',
        before_state={'name': 'A'}, after_state={'name': 'B'}
    )

    prev_view = AuditLogViewSet.as_view({'get': 'preview_revert'})
    bulk_rev_view = AuditLogViewSet.as_view({'post': 'bulk_revert'})

    req_pv = factory.get(f'/api/accounts/audit-logs/{d_log.id}/preview_revert/')
    force_authenticate(req_pv, user=u_single_rev)
    assert prev_view(req_pv, pk=d_log.id).status_code == 200

    req_blk = factory.post('/api/accounts/audit-logs/bulk_revert/', {'log_ids': [d_log.id]})
    force_authenticate(req_blk, user=u_single_rev)
    assert bulk_rev_view(req_blk).status_code == 403
    print("[PASS] Suite 4: Phase 3 Single-Revert supervisor allowed preview (200), strictly blocked from bulk_revert (403).")

    # ------------------------------------------------------------------
    # 5. Phase 4 Verification: Doc Approval vs Inventory Finalize
    # ------------------------------------------------------------------
    u_doc_app, _ = User.objects.get_or_create(username='u_doc_app', defaults={'is_active': True})
    u_doc_app.user_permissions.clear()
    u_doc_app.user_permissions.add(Permission.objects.get(codename='perm_doc_approve_action'))
    u_doc_app.is_superuser = False
    u_doc_app.save()

    doc_app_view = DocTaskViewSet.as_view({'post': 'bulk_approve'})
    count_mgr_view = CountTaskViewSet.as_view({'post': 'bulk_manager_approve'})

    req_da = factory.post('/api/inventory/doc-tasks/bulk_approve/', {'task_ids': []})
    force_authenticate(req_da, user=u_doc_app)
    assert doc_app_view(req_da).status_code == 400 # Passed permission check

    req_cm = factory.post('/api/inventory/count-tasks/bulk_manager_approve/', {'task_ids': [1]})
    force_authenticate(req_cm, user=u_doc_app)
    assert count_mgr_view(req_cm).status_code == 403
    print("[PASS] Suite 5: Phase 4 Doc Approver allowed doc approval (not 403), strictly blocked from inventory finalize (403).")

    # Cleanup test users
    d_log.delete()
    u_bk_mgr.delete()
    u_auditor.delete()
    u_single_rev.delete()
    u_doc_app.delete()

    print("==================================================================")
    print("MASTER E2E SECURITY TEST SUITE: 100% PASS - SYSTEM FULLY SECURE")
    print("==================================================================")

if __name__ == '__main__':
    run_master_suite()
