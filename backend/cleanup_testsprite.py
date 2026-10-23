import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from warehouses.models import Warehouse
from inventory.models import Item, CountTask

User = get_user_model()

print("--- Cleaning Up TestSprite Test Environment ---")

# 1. Delete Items and Tasks in test warehouse
wh = Warehouse.objects.filter(name='انبار آزمایشی TestSprite').first()
if wh:
    Item.objects.filter(warehouse=wh).delete()
    wh.delete()
    print("Test warehouse and items deleted.")

# 2. Delete test users
test_usernames = ['test_counter', 'test_supervisor', 'test_manager']
for uname in test_usernames:
    User.objects.filter(username=uname).delete()
    print(f"User {uname} deleted.")

print("--- Cleanup Complete! ---")
