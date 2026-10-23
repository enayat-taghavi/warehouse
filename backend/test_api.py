import sys
from rest_framework.test import APIClient
from accounts.models import CustomUser
from warehouses.models import Warehouse
from django.contrib.auth.models import Permission

if __name__ == '__main__':
    # setup db
    Warehouse.objects.all().delete()

    # Create superuser to bypass perm checks
    user, _ = CustomUser.objects.get_or_create(username='admin', is_superuser=True)

    client = APIClient()
    client.force_authenticate(user=user)

    # 1. Create WH-1 with code "15"
    res1 = client.post('/api/warehouses/', {'name': 'WH-1', 'code': '15'})
    print("Create WH-1:", res1.status_code, res1.data)

    # 2. Simulate next ID being 15
    from django.db import connection
    with connection.cursor() as cursor:
        cursor.execute("ALTER SEQUENCE warehouses_warehouse_id_seq RESTART WITH 15;")

    # 3. Create WH-2 without code
    res2 = client.post('/api/warehouses/', {'name': 'WH-2'})
    print("Create WH-2:", res2.status_code, res2.data if res2.status_code != 500 else "500 Error")
    if res2.status_code == 500:
        print("Bug confirmed!")


