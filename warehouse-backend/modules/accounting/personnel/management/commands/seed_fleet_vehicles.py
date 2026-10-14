import decimal
from django.core.management.base import BaseCommand
from personnel.models import VehicleDriverProfile
from warehouses.models import Warehouse

class Command(BaseCommand):
    help = 'ایجاد و کاشت داده‌های اولیه برای ۱۰ خودرو و راننده ناوگان با انواع مالکیت و نرخ‌ها'

    def handle(self, *args, **options):
        wh_central = Warehouse.objects.filter(is_active=True).first()

        vehicles_data = [
            {
                'driver_name': 'رضا صادقی',
                'driver_national_code': '0012345678',
                'driver_phone': '09121111111',
                'plate_number': '11ع111-11',
                'vehicle_type': 'nissan',
                'ownership_type': 'contract',
                'default_service_rate': decimal.Decimal('1200000'),
                'account_number': '0101111111001',
                'sheba_number': 'IR120170000000101111111001',
            },
            {
                'driver_name': 'محمود کریمی',
                'driver_national_code': '0023456789',
                'driver_phone': '09122222222',
                'plate_number': '22ع222-22',
                'vehicle_type': 'khavar',
                'ownership_type': 'contract',
                'default_service_rate': decimal.Decimal('2500000'),
                'account_number': '0102222222002',
                'sheba_number': 'IR220170000000102222222002',
            },
            {
                'driver_name': 'بهرام رادمنش',
                'driver_national_code': '0034567890',
                'driver_phone': '09123333333',
                'plate_number': '33ع333-33',
                'vehicle_type': 'trailer',
                'ownership_type': 'contract',
                'default_service_rate': decimal.Decimal('7000000'),
                'account_number': '0103333333003',
                'sheba_number': 'IR330170000000103333333003',
            },
            {
                'driver_name': 'اصغر مرادی',
                'driver_national_code': '0045678901',
                'driver_phone': '09124444444',
                'plate_number': '44ع444-44',
                'vehicle_type': 'pickup',
                'ownership_type': 'personal',
                'default_service_rate': decimal.Decimal('900000'),
                'account_number': '0104444444004',
                'sheba_number': 'IR440170000000104444444004',
            },
            {
                'driver_name': 'قاسم سلیمانیان',
                'driver_national_code': '0056789012',
                'driver_phone': '09125555555',
                'plate_number': '55ع555-55',
                'vehicle_type': 'truck',
                'ownership_type': 'company',
                'default_service_rate': decimal.Decimal('0'),
                'account_number': '',
                'sheba_number': '',
            },
            {
                'driver_name': 'علی اکبر رضوانی',
                'driver_national_code': '0067890123',
                'driver_phone': '09126666666',
                'plate_number': 'LF-901',
                'vehicle_type': 'other',
                'ownership_type': 'company',
                'default_service_rate': decimal.Decimal('0'),
                'account_number': '',
                'sheba_number': '',
            },
            {
                'driver_name': 'داوود حیدری',
                'driver_national_code': '0078901234',
                'driver_phone': '09127777777',
                'plate_number': '77ع777-77',
                'vehicle_type': 'truck',
                'ownership_type': 'contract',
                'default_service_rate': decimal.Decimal('3200000'),
                'account_number': '0107777777007',
                'sheba_number': 'IR770170000000107777777007',
            },
            {
                'driver_name': 'جواد میرزایی',
                'driver_national_code': '0089012345',
                'driver_phone': '09128888888',
                'plate_number': '88ع888-88',
                'vehicle_type': 'trailer',
                'ownership_type': 'contract',
                'default_service_rate': decimal.Decimal('6500000'),
                'account_number': '0108888888008',
                'sheba_number': 'IR880170000000108888888008',
            },
            {
                'driver_name': 'سعید تقوی',
                'driver_national_code': '0090123456',
                'driver_phone': '09129999999',
                'plate_number': '99ع999-99',
                'vehicle_type': 'nissan',
                'ownership_type': 'contract',
                'default_service_rate': decimal.Decimal('1800000'),
                'account_number': '0109999999009',
                'sheba_number': 'IR990170000000109999999009',
            },
            {
                'driver_name': 'حمید گودرزی',
                'driver_national_code': '0101234567',
                'driver_phone': '09120000000',
                'plate_number': '10ع100-10',
                'vehicle_type': 'pickup',
                'ownership_type': 'personal',
                'default_service_rate': decimal.Decimal('1100000'),
                'account_number': '0110000000010',
                'sheba_number': 'IR100170000000101000000010',
            }
        ]

        created_count = 0
        for vd in vehicles_data:
            obj, created = VehicleDriverProfile.objects.get_or_create(
                plate_number=vd['plate_number'],
                defaults={
                    'driver_name': vd['driver_name'],
                    'driver_national_code': vd['driver_national_code'],
                    'driver_phone': vd['driver_phone'],
                    'vehicle_type': vd['vehicle_type'],
                    'ownership_type': vd['ownership_type'],
                    'default_service_rate': vd['default_service_rate'],
                    'account_number': vd['account_number'],
                    'sheba_number': vd['sheba_number'],
                    'assigned_warehouse': wh_central if vd['ownership_type'] == 'company' else None,
                    'is_active': True
                }
            )
            if created:
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f'موفقیت: تعداد {created_count} خودرو و راننده جدید به سیستم اضافه شد (مجموع: {VehicleDriverProfile.objects.count()}).'))
