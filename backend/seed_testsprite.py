import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from warehouses.models import Warehouse
from inventory.models import Item, CountTask

User = get_user_model()
user_ct = ContentType.objects.get_for_model(User)

print("--- Seeding TestSprite Test Environment ---")

# 1. Create or get test users
def get_or_create_test_user(username, password, first_name, last_name, perms):
    user, created = User.objects.get_or_create(username=username)
    user.set_password(password)
    user.first_name = first_name
    user.last_name = last_name
    user.is_active = True
    user.requires_password_change = False
    user.save()
    
    # Assign permissions
    for codename in perms:
        try:
            perm = Permission.objects.get(codename=codename, content_type=user_ct)
            user.user_permissions.add(perm)
        except Permission.DoesNotExist:
            print(f"Warning: Permission {codename} not found")
            
    print(f"User {username} {'created' if created else 'updated'}")
    return user

counter_user = get_or_create_test_user(
    username='test_counter',
    password='Test@123456',
    first_name='شمارشگر',
    last_name='آزمایشی',
    perms=['view_sys_counter', 'view_wh_dashboard']
)

supervisor_user = get_or_create_test_user(
    username='test_supervisor',
    password='Test@123456',
    first_name='سرپرست',
    last_name='آزمایشی',
    perms=['view_sys_supervisor', 'view_wh_dashboard', 'view_sys_counter']
)

manager_user = get_or_create_test_user(
    username='test_manager',
    password='Test@123456',
    first_name='مدیر',
    last_name='آزمایشی',
    perms=['view_sys_manager_review', 'view_wh_dashboard', 'view_sys_supervisor', 'view_sys_counter']
)

# 2. Create or get test warehouse
wh, wh_created = Warehouse.objects.get_or_create(
    name='انبار آزمایشی TestSprite',
    defaults={
        'code': 'WH-TESTSPRITE',
        'project_name': 'پروژه آزمایشی TestSprite',
        'is_active': True,
        'manager': manager_user
    }
)
if not wh_created:
    wh.is_active = True
    wh.manager = manager_user
    wh.save()

# Assign warehouse to users
for u in [counter_user, supervisor_user, manager_user]:
    u.assigned_warehouses.add(wh)

print(f"Warehouse {wh.code} ready.")

# 3. Clean up any existing test items in this warehouse
Item.objects.filter(warehouse=wh).delete()

# 4. Create 3 test items
item1 = Item.objects.create(
    warehouse=wh,
    fa_unic_code='TS-ITEM-001',
    description='کالای آزمایشی ۱ - مسیر استاندارد شمارش',
    inventory=100.0,
    bal4miv=100.0,
    unit='عدد',
    field_status='counting'
)

item2 = Item.objects.create(
    warehouse=wh,
    fa_unic_code='TS-ITEM-002',
    description='کالای آزمایشی ۲ - رد سرپرست و بازشماری',
    inventory=50.0,
    bal4miv=50.0,
    unit='عدد',
    field_status='counting'
)

item3 = Item.objects.create(
    warehouse=wh,
    fa_unic_code='TS-ITEM-003',
    description='کالای آزمایشی ۳ - جهش از سرپرست',
    inventory=30.0,
    bal4miv=30.0,
    unit='عدد',
    field_status='counting'
)

# 5. Create CountTasks
task1 = CountTask.objects.create(
    item=item1,
    counter=counter_user,
    supervisor=supervisor_user,
    assigned_manager=manager_user,
    status='PENDING_COUNT',
    skip_supervisor=False
)

task2 = CountTask.objects.create(
    item=item2,
    counter=counter_user,
    supervisor=supervisor_user,
    assigned_manager=manager_user,
    status='PENDING_COUNT',
    skip_supervisor=False
)

task3 = CountTask.objects.create(
    item=item3,
    counter=counter_user,
    supervisor=None,
    assigned_manager=manager_user,
    status='PENDING_COUNT',
    skip_supervisor=True
)

print("--- TestSprite Test Environment Seeded Successfully! ---")
print(f"Item 1 Task ID: {task1.id}")
print(f"Item 2 Task ID: {task2.id}")
print(f"Item 3 Task ID: {task3.id}")
