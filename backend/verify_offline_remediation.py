import os
import uuid
from datetime import timedelta
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from warehouses.models import Warehouse
from inventory.models import Item, CountTask, CountTaskHistory, DocTask, DocTaskHistory, ItemFieldDefinition
from inventory.serializers import DocTaskSerializer, ItemSerializer
from inventory.views import ItemViewSet, DocTaskViewSet, _soft_delete_items_cascade
from inventory.sync_views import SyncPullView
from personnel.sync_views import PersonnelSyncPullView

User = get_user_model()
factory = APIRequestFactory()

def run_all_checks():
    print("==================================================")
    print("STARTING COMPREHENSIVE OFFLINE REMEDIATION VERIFICATION")
    print("==================================================")

    with transaction.atomic():
        # Setup temporary test warehouse and users
        wh, _ = Warehouse.objects.get_or_create(name="WH_VERIFY_TEMP", defaults={'project_name': 'TEMP'})
        admin_user, _ = User.objects.get_or_create(username='verify_admin_user', defaults={'is_superuser': True, 'is_staff': True})
        counter_user, _ = User.objects.get_or_create(username='verify_counter_user', defaults={'is_active': True})
        other_counter, _ = User.objects.get_or_create(username='verify_other_counter', defaults={'is_active': True})

        # Assign counter permission
        p1 = Permission.objects.filter(codename='view_sys_counter').first()
        if p1: counter_user.user_permissions.add(p1)

        print("\n--- Test 1: DocTask soft delete & cascade (Task 7) ---")
        item1 = Item.objects.create(warehouse=wh, fa_unic_code=f"CODE-{uuid.uuid4().hex[:6]}")
        doc1 = DocTask.objects.create(item=item1, status='PENDING_DOC')
        assert not doc1.is_deleted, "DocTask should initially not be deleted"
        
        # Soft delete item cascade
        _soft_delete_items_cascade(Item.objects.filter(id=item1.id))
        doc1.refresh_from_db()
        assert doc1.is_deleted, "DocTask must be soft-deleted when parent item is deleted"
        assert DocTask.objects.filter(id=doc1.id).count() == 0, "DocTask.objects should hide soft-deleted tasks"
        assert DocTask.all_objects.filter(id=doc1.id).count() == 1, "DocTask.all_objects should include soft-deleted tasks"
        print("[OK] Test 1 Passed: DocTask soft delete and cascade working perfectly.")

        print("\n--- Test 2: DocTaskSerializer warehouse_id and sync_id (Task 17) ---")
        item2 = Item.objects.create(warehouse=wh, fa_unic_code=f"CODE-{uuid.uuid4().hex[:6]}")
        doc2 = DocTask.objects.create(item=item2, status='PENDING_DOC')
        ser = DocTaskSerializer(doc2)
        assert 'warehouse_id' in ser.data, "DocTaskSerializer must include warehouse_id"
        assert ser.data['warehouse_id'] == wh.id, f"warehouse_id expected {wh.id}, got {ser.data.get('warehouse_id')}"
        assert 'sync_id' in ser.data, "DocTaskSerializer must include sync_id"
        assert ser.data['sync_id'] == str(doc2.sync_id), "sync_id must match doc_task.sync_id"
        print(f"[OK] Test 2 Passed: DocTaskSerializer serializes warehouse_id={wh.id} and sync_id={doc2.sync_id}.")

        print("\n--- Test 3: UUID lookup by sync_id in ItemViewSet and DocTaskViewSet (Task 22) ---")
        item3_sync = uuid.uuid4()
        item3 = Item.objects.create(warehouse=wh, fa_unic_code=f"CODE-{uuid.uuid4().hex[:6]}", sync_id=item3_sync)
        doc3_sync = uuid.uuid4()
        doc3 = DocTask.objects.create(item=item3, status='PENDING_DOC', sync_id=doc3_sync)

        # Retrieve item by UUID
        req_item = factory.get(f'/api/inventory/items/{item3_sync}/')
        force_authenticate(req_item, user=admin_user)
        resp_item = ItemViewSet.as_view({'get': 'retrieve'})(req_item, pk=str(item3_sync))
        assert resp_item.status_code == 200, f"Expected 200 for UUID item lookup, got {resp_item.status_code}"
        assert resp_item.data['id'] == item3.id, "Resolved item ID must match"

        # Retrieve doc-task by UUID
        req_doc = factory.get(f'/api/inventory/doc-tasks/{doc3_sync}/')
        force_authenticate(req_doc, user=admin_user)
        resp_doc = DocTaskViewSet.as_view({'get': 'retrieve'})(req_doc, pk=str(doc3_sync))
        assert resp_doc.status_code == 200, f"Expected 200 for UUID doc_task lookup, got {resp_doc.status_code}"
        assert resp_doc.data['id'] == doc3.id, "Resolved doc_task ID must match"
        print("[OK] Test 3 Passed: Non-digit UUID lookup by sync_id succeeded for both Item and DocTask.")

        print("\n--- Test 4: Idempotent creation via sync_id (Task 14) ---")
        idem_sync = uuid.uuid4()
        req_create1 = factory.post('/api/inventory/items/', {
            'warehouse': wh.id,
            'fa_unic_code': f"CODE-{uuid.uuid4().hex[:6]}",
            'description': 'First upload',
            'sync_id': str(idem_sync)
        }, format='json')
        force_authenticate(req_create1, user=admin_user)
        resp_create1 = ItemViewSet.as_view({'post': 'create'})(req_create1)
        assert resp_create1.status_code == 201, f"Expected 201, got {resp_create1.status_code}"
        created_id = resp_create1.data['id']

        # Second creation with identical sync_id
        req_create2 = factory.post('/api/inventory/items/', {
            'warehouse': wh.id,
            'fa_unic_code': f"CODE-DIFFERENT",
            'description': 'Replayed upload with same sync_id',
            'sync_id': str(idem_sync)
        }, format='json')
        force_authenticate(req_create2, user=admin_user)
        resp_create2 = ItemViewSet.as_view({'post': 'create'})(req_create2)
        assert resp_create2.status_code in [200, 201], f"Expected 200/201 on replay, got {resp_create2.status_code}"
        assert resp_create2.data['id'] == created_id, "Replayed item must reuse existing item ID"
        assert Item.objects.filter(sync_id=idem_sync).count() == 1, "Must have exactly 1 record in database"
        print("[OK] Test 4 Passed: Idempotent create replay handled gracefully without duplicate errors.")

        print("\n--- Test 5: Optimistic concurrency 409 conflict detection (Task 6) ---")
        item5 = Item.objects.create(warehouse=wh, fa_unic_code=f"CODE-{uuid.uuid4().hex[:6]}", description="Original")
        stale_time = (item5.updated_at - timedelta(hours=2)).isoformat()
        req_update = factory.patch(f'/api/inventory/items/{item5.id}/', {
            'description': 'Conflict patch',
            'base_updated_at': stale_time
        }, format='json')
        force_authenticate(req_update, user=admin_user)
        resp_update = ItemViewSet.as_view({'patch': 'partial_update'})(req_update, pk=str(item5.id))
        assert resp_update.status_code == 409, f"Expected 409 Conflict, got {resp_update.status_code}"
        assert resp_update.data.get('detail') == 'conflict', "Response must indicate conflict detail"
        assert 'server_record' in resp_update.data, "Response must include server_record for client reconciliation"
        print("[OK] Test 5 Passed: Stale update rejected with HTTP 409 Conflict and server_record returned.")

        print("\n--- Test 6: Global DynamicField definitions in sync pull (Task 18) ---")
        f_global = ItemFieldDefinition.objects.create(warehouse=None, name=f"global_{uuid.uuid4().hex[:4]}", label="Global Field", field_type="text")
        f_local = ItemFieldDefinition.objects.create(warehouse=wh, name=f"local_{uuid.uuid4().hex[:4]}", label="Local Field", field_type="text")
        
        req_sync = factory.get(f'/api/inventory/sync/pull/?warehouse_id={wh.id}&models=dynamic_fields')
        force_authenticate(req_sync, user=admin_user)
        resp_sync = SyncPullView.as_view()(req_sync)
        assert resp_sync.status_code == 200, f"Expected 200, got {resp_sync.status_code}"
        dynamic_fields = resp_sync.data.get('results', {}).get('dynamic_fields', [])
        synced_names = [f['name'] for f in dynamic_fields]
        assert f_global.name in synced_names, f"Global dynamic field {f_global.name} must be in sync pull"
        assert f_local.name in synced_names, f"Local dynamic field {f_local.name} must be in sync pull"
        print(f"[OK] Test 6 Passed: Sync pull successfully returned global dynamic fields alongside warehouse-specific fields.")

        print("\n--- Test 7: Unassigned task tombstone in sync pull (Task 13) ---")
        task_item = Item.objects.create(warehouse=wh, fa_unic_code=f"CODE-{uuid.uuid4().hex[:6]}")
        ctask = CountTask.objects.create(item=task_item, counter=counter_user, status='INITIAL_COUNT')
        CountTaskHistory.objects.create(task=ctask, action_by=counter_user, action_type='ASSIGN')
        
        # Now reassign task to other_counter
        ctask.counter = other_counter
        ctask.save()

        req_pull_counter = factory.get(f'/api/inventory/sync/pull/?warehouse_id={wh.id}&models=count_tasks')
        force_authenticate(req_pull_counter, user=counter_user)
        resp_pull_counter = SyncPullView.as_view()(req_pull_counter)
        assert resp_pull_counter.status_code == 200
        count_tasks = resp_pull_counter.data.get('results', {}).get('count_tasks', [])
        tombstone = next((t for t in count_tasks if t.get('sync_id') == str(ctask.sync_id)), None)
        assert tombstone is not None, "Task must be present in sync pull for counter who previously had it"
        assert tombstone.get('is_deleted') is True, "Task must be marked as tombstone (is_deleted: True)"
        print("[OK] Test 7 Passed: Unassigned task correctly returned as a tombstone for former assignee.")

        print("\n--- Test 8: Personnel sync endpoint /personnel/sync/pull/ (Task 5) ---")
        req_p_sync = factory.get('/api/personnel/sync/pull/?project_id=1')
        force_authenticate(req_p_sync, user=admin_user)
        resp_p_sync = PersonnelSyncPullView.as_view()(req_p_sync)
        assert resp_p_sync.status_code == 200, f"Expected 200, got {resp_p_sync.status_code}"
        assert 'server_time' in resp_p_sync.data, "Personnel sync response must contain server_time"
        assert 'results' in resp_p_sync.data, "Personnel sync response must contain results"
        print("[OK] Test 8 Passed: /personnel/sync/pull/ returned 200 with standard sync contract.")

        # Rollback all test mutations so DB remains pristine
        transaction.set_rollback(True)

    print("\n==================================================")
    print("ALL 8 BACKEND AND SYNC VERIFICATION TESTS PASSED (100% SUCCESS)!")
    print("==================================================")

if __name__ == '__main__':
    run_all_checks()
