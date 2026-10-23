import sys
import traceback
from warehouses.models import Warehouse

Warehouse.objects.all().delete()

w1 = Warehouse(name="WH-1", code="15")
w1.save()
print("W1 manually saved with code", w1.code, "and got db id", w1.id)

try:
    Warehouse.objects.filter(id=15).update(id=14)
except Exception:
    pass

# We want w2 to get id=15 to simulate the collision.
# In Postgres we can use:
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("ALTER SEQUENCE warehouses_warehouse_id_seq RESTART WITH 15;")

w2 = Warehouse(name="WH-2")
try:
    w2.save()
    print("W2 saved. code:", w2.code, "id:", w2.id)
except Exception as e:
    print("W2 save failed:", repr(e))

print("Is W2 in db?", Warehouse.objects.filter(name="WH-2").exists())

try:
    w3 = Warehouse(name="WH-3")
    w3.save()
    print("W3 saved on retry. code:", w3.code, "id:", w3.id)
except Exception as e:
    print("W3 save failed:", repr(e))
    traceback.print_exc()

