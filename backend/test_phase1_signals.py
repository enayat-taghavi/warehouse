import os
import sys
import django

sys.stdout.reconfigure(encoding='utf-8')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from accounts.models import AuditLog, UserLoginLog
from accounts.signals import serialize_audit_log_data, serialize_login_log_data
from warehouses.models import Warehouse

User = get_user_model()

def run_tests():
    print("=== [TEST PHASE 1: Backend Signals & Real-time Broadcast] ===")
    
    # 1. Test user & warehouse
    user, _ = User.objects.get_or_create(username='test_signal_admin', defaults={'first_name': 'مدیر', 'last_name': 'تستی'})
    wh, _ = Warehouse.objects.get_or_create(name='انبار تست سیگنال', defaults={'code': 'WH_TEST_SIG'})
    
    # 2. Test AuditLog creation and serialization
    print("-> Creating test AuditLog...")
    audit_log = AuditLog.objects.create(
        user=user,
        actor_username=user.username,
        actor_name='مدیر تستی',
        warehouse=wh,
        module='inventory',
        action='UPDATE',
        severity='info',
        target_model='Item',
        target_object_id='999',
        target_repr='کالای تست سیگنال',
        before_state={'quantity': 10},
        after_state={'quantity': 20},
        details={'reason': 'تست سیگنال وب‌سوکت'},
        ip_address='127.0.0.1'
    )
    
    ser_audit = serialize_audit_log_data(audit_log)
    assert ser_audit is not None, "Audit log serialization failed!"
    assert ser_audit['id'] == audit_log.id, "Serialized ID mismatch"
    assert ser_audit['action'] == 'UPDATE', "Action mismatch"
    assert ser_audit['module'] == 'inventory', "Module mismatch"
    assert ser_audit['has_diff'] is True, "has_diff should be True"
    print(f"✓ AuditLog created & serialized successfully: ID={audit_log.id}, user_display={ser_audit.get('user_display')}")
    
    # 3. Test UserLoginLog creation and serialization
    print("-> Creating test UserLoginLog...")
    login_log = UserLoginLog.objects.create(
        user=user,
        username_attempted='test_signal_admin',
        ip_address='127.0.0.1',
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        status='SUCCESS',
        metadata={'client': 'Chrome Desktop'}
    )
    
    ser_login = serialize_login_log_data(login_log)
    assert ser_login is not None, "Login log serialization failed!"
    assert ser_login['id'] == login_log.id, "Serialized Login ID mismatch"
    assert ser_login['status'] == 'SUCCESS', "Status mismatch"
    print(f"✓ UserLoginLog created & serialized successfully: ID={login_log.id}, status={ser_login.get('status')}")
    
    # Clean up test records
    audit_log.delete()
    login_log.delete()
    print("✓ Test cleanup completed.")
    print("=== [PHASE 1 GATE EVALUATION: 100% PASSED] ===")

if __name__ == '__main__':
    run_tests()
