import os
import sys

backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
import backend_paths
backend_paths.install()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from warehouses.models import Warehouse
from inventory.models import Item, CountTask
from decimal import Decimal

User = get_user_model()

def assign_perms(user, codenames):
    ct = ContentType.objects.get_for_model(User)
    perms = []
    for code in codenames:
        p, _ = Permission.objects.get_or_create(content_type=ct, codename=code, defaults={'name': code})
        perms.append(p)
    user.user_permissions.set(perms)
    user.save()
    return user

# 1. Admin/Superuser
admin, _ = User.objects.get_or_create(username='admin_e2e', defaults={'is_staff': True, 'is_superuser': True, 'first_name': 'Admin', 'last_name': 'System'})
admin.is_staff = True
admin.is_superuser = True
admin.set_password('Password123!')
admin.save()

# 2. Manager
manager, _ = User.objects.get_or_create(username='manager_e2e', defaults={'first_name': 'Manager', 'last_name': 'Inventory'})
manager.set_password('Password123!')
manager.save()
assign_perms(manager, [
    'view_sys_manager_review', 'perm_wh_edit', 'perm_rec_dispatch', 'perm_rec_recount',
    'perm_inventory_finalize', 'can_act_as_manager', 'view_wh_docs', 'view_wh_stocktaking'
])

# 3. Supervisor
supervisor, _ = User.objects.get_or_create(username='supervisor_e2e', defaults={'first_name': 'Supervisor', 'last_name': 'Counting'})
supervisor.set_password('Password123!')
supervisor.save()
assign_perms(supervisor, [
    'view_sys_supervisor', 'perm_rec_recount', 'perm_feed_approve_action',
    'can_act_as_supervisor', 'view_wh_docs', 'view_wh_stocktaking'
])

# 4. Counter
counter, _ = User.objects.get_or_create(username='counter_e2e', defaults={'first_name': 'Counter', 'last_name': 'Field'})
counter.set_password('Password123!')
counter.save()
assign_perms(counter, [
    'view_sys_counter', 'can_act_as_counter', 'view_wh_stocktaking'
])

# 5. Warehouses
wh_shiraz = Warehouse.objects.filter(name__icontains="شیراز").first()
if not wh_shiraz:
    wh_shiraz = Warehouse.objects.create(name="انبار مرکزی پروژه شیراز", project_name="پروژه شیراز")

wh_bushehr = Warehouse.objects.filter(name__icontains="بوشهر").first()
if not wh_bushehr:
    wh_bushehr = Warehouse.objects.create(name="انبار فرعی پروژه بوشهر", project_name="پروژه بوشهر")

# 6. Create or verify dedicated test items in Shiraz warehouse
for i in range(1, 11):
    fa_code = f"E2E-ITEM-{i:02d}"
    item, created = Item.objects.get_or_create(
        warehouse=wh_shiraz,
        fa_unic_code=fa_code,
        defaults={
            'description': f'قلم تستی سناریوی {i} مرورگر',
            'inventory': Decimal('50.000'),
            'bal4miv': Decimal('50.000'),
            'po': f'PO-E2E-{i}',
            'pl': f'PL-0{i}',
            'pk_number': f'PK-{100+i}',
            'my_tag': 'تست_مرورگر',
            'new_location': f'LOC-{i:02d}',
            'field_status': 'waiting'
        }
    )
    # Reset status to waiting and delete existing tasks for fresh test run
    CountTask.objects.filter(item=item).delete()
    item.field_status = 'waiting'
    item.field_assignee = None
    item.save()

# 7. Create item in Bushehr warehouse for isolation test
Item.objects.get_or_create(
    warehouse=wh_bushehr,
    fa_unic_code="E2E-BUSHEHR-01",
    defaults={
        'description': 'قلم انبار بوشهر جهت تست ایزولاسیون',
        'inventory': Decimal('100.000'),
        'bal4miv': Decimal('100.000'),
        'field_status': 'waiting'
    }
)

print("E2E Test Users, Warehouses, and Items (E2E-ITEM-01 to 10) initialized successfully!")
