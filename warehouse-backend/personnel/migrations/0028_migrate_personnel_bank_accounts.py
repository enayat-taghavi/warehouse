# Generated manually for Task 1.7
from django.db import migrations


def migrate_existing_bank_accounts(apps, schema_editor):
    PersonnelProfile = apps.get_model('personnel', 'PersonnelProfile')
    PersonnelBankAccount = apps.get_model('personnel', 'PersonnelBankAccount')

    for profile in PersonnelProfile.objects.all():
        sheba = (profile.sheba_number or '').strip().upper()
        acc_num = (profile.account_number or '').strip()
        card_num = (profile.card_number or '').strip()
        b_name = (profile.bank_name or '').strip()

        if sheba or acc_num:
            if sheba and not sheba.startswith('IR') and sheba.isdigit() and len(sheba) == 24:
                sheba = f"IR{sheba}"
            
            # Check if primary account already exists
            if not PersonnelBankAccount.objects.filter(personnel=profile, is_primary=True).exists():
                PersonnelBankAccount.objects.create(
                    personnel=profile,
                    bank_name=b_name or 'نامشخص',
                    account_number=acc_num or None,
                    sheba_number=sheba or '',
                    card_number=card_num or None,
                    is_primary=True,
                    is_active=True,
                    description='حساب بانکی اولیه انتقال‌یافته از پرونده پرسنلی'
                )


def reverse_migrate_bank_accounts(apps, schema_editor):
    PersonnelBankAccount = apps.get_model('personnel', 'PersonnelBankAccount')
    PersonnelBankAccount.objects.filter(description='حساب بانکی اولیه انتقال‌یافته از پرونده پرسنلی').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0027_insurancejobtitle_personnelbankaccount_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_existing_bank_accounts, reverse_migrate_bank_accounts),
    ]
