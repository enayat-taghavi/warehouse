# Generated manually for Task 1.10 (Decision 6.3)
from django.db import migrations


def recalculate_base_daily_rate(apps, schema_editor):
    PersonnelProfile = apps.get_model('personnel', 'PersonnelProfile')

    for profile in PersonnelProfile.objects.all():
        try:
            wage = int(profile.daily_base_wage or 0)
        except (ValueError, TypeError):
            wage = 0
        try:
            bonus = int(profile.daily_seniority_bonus or 0)
        except (ValueError, TypeError):
            bonus = 0
        try:
            years = int(profile.base_years_experience or 0)
        except (ValueError, TypeError):
            years = 0
        
        new_base = wage + (years * bonus)
        if profile.base_daily_rate != new_base:
            profile.base_daily_rate = new_base
            profile.save(update_fields=['base_daily_rate'])


def reverse_recalculate(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0029_seed_insurance_job_titles'),
    ]

    operations = [
        migrations.RunPython(recalculate_base_daily_rate, reverse_recalculate),
    ]
