# Generated manually for Task 0.5 and Task 1.7
from django.db import migrations


def forward_fleet_data(apps, schema_editor):
    VehicleDriverProfile = apps.get_model('personnel', 'VehicleDriverProfile')
    VehicleBankAccount = apps.get_model('personnel', 'VehicleBankAccount')

    # Task 0.5: Assign Company to 11 legacy vehicles without company
    # Vehicle 144: Belongs to Section 3 / Project 2 ('دالان') -> Company 1 ('پاینده توان ساینا')
    VehicleDriverProfile.objects.filter(id=144, company__isnull=True).update(company_id=1)

    # Vehicles [2, 3, 4, 5, 6, 10, 11, 13, 16, 18]: Belongs to Central Warehouse (W3) -> Company 2 ('فارس عالیش')
    c2_vehicle_ids = [2, 3, 4, 5, 6, 10, 11, 13, 16, 18]
    VehicleDriverProfile.objects.filter(id__in=c2_vehicle_ids, company__isnull=True).update(company_id=2)

    # Task 1.7: Migrate existing bank accounts to VehicleBankAccount
    for v in VehicleDriverProfile.objects.all():
        sheba = (v.sheba_number or '').strip().upper()
        acc_num = (v.account_number or '').strip()
        b_name = (v.bank_name or '').strip()

        if sheba or acc_num:
            if sheba and not sheba.startswith('IR') and sheba.isdigit() and len(sheba) == 24:
                sheba = f"IR{sheba}"

            if not VehicleBankAccount.objects.filter(vehicle=v, is_primary=True).exists():
                is_owner = getattr(v, 'is_driver_owner', True)
                owner_name = getattr(v, 'owner_name', '') or ''
                owner_nat_code = getattr(v, 'owner_national_code', '') or ''
                
                payee_type = 'driver' if is_owner else 'owner'
                acct_owner = v.driver_name if is_owner else (owner_name or v.driver_name)
                acct_nat_code = v.driver_national_code if is_owner else (owner_nat_code or v.driver_national_code)

                VehicleBankAccount.objects.create(
                    vehicle=v,
                    bank_name=b_name or 'نامشخص',
                    account_number=acc_num or None,
                    sheba_number=sheba or '',
                    card_number=None,
                    account_owner_name=acct_owner or None,
                    account_owner_national_code=acct_nat_code or None,
                    payee_type=payee_type,
                    is_primary=True,
                    is_active=True,
                    description='حساب بانکی اولیه انتقال‌یافته از پرونده خودرو'
                )


def reverse_fleet_data(apps, schema_editor):
    VehicleDriverProfile = apps.get_model('personnel', 'VehicleDriverProfile')
    # Reversible company assignment: clear company for the 11 legacy vehicles
    assigned_ids = [144, 2, 3, 4, 5, 6, 10, 11, 13, 16, 18]
    VehicleDriverProfile.objects.filter(id__in=assigned_ids).update(company_id=None)
    # B-11 / Task 1.7: Bank accounts are preserved; reverse is noop


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0034_add_fleet_models_and_fields'),
    ]

    operations = [
        migrations.RunPython(forward_fleet_data, reverse_fleet_data),
    ]
