# Plan 3.1 s7, step 3 (contract): party becomes required and the identity and bank columns now held by
# contacts.ExternalParty and PartyBankAccount leave Counterparty (data copied in 0008). Destructive by design
# (rule q2); listed in the master plan section 6 next to the 2.1 migrations.
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0008_counterparty_party_copy'),
    ]

    operations = [
        migrations.AlterField(
            model_name='counterparty',
            name='party',
            field=models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='counterparty', to='contacts.externalparty', verbose_name='طرف بیرونی'),
        ),
        migrations.AlterModelOptions(
            name='counterparty',
            options={'ordering': ['party__name'], 'verbose_name': 'طرف\u200cحساب مالی', 'verbose_name_plural': 'طرف\u200cحساب\u200cهای مالی'},
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='account_number',
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='bank_name',
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='company',
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='name',
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='national_id',
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='phone',
        ),
        migrations.RemoveField(
            model_name='counterparty',
            name='sheba_number',
        ),
    ]
