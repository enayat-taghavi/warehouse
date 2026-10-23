import django
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from warehouses.models import Warehouse
from warehouses.serializers import WarehouseSerializer
from django.db.models import Count, Q

Warehouse.objects.all().delete()
Warehouse.objects.create(name='W1', is_active=True)
Warehouse.objects.create(name='W2', is_active=False)
Warehouse.objects.create(name='W3', is_active=True)

qs = Warehouse.objects.annotate(
    annotated_total_quantity=Count('items'),
    annotated_counted_quantity=Count(
        'items',
        filter=~Q(items__field_status__in=['waiting', 'counting', 'در انتظار شمارش'])
    )
)
print("Annotated QS count:", qs.count())
print("Annotated QS len:", len(qs))

serializer = WarehouseSerializer(qs, many=True)
print("Serialized statuses:", [(x['name'], x['is_active']) for x in serializer.data])
