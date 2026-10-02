# Generated manually for Task 1.8
from django.db import migrations


# Titles and codes from Emp_info reference sheet (including multi-code titles) + standard titles
SEED_JOB_TITLES = [
    # From TirSalary.xlsm Emp_info sheet (10 titles, 12 title-code pairs)
    ('افسر ایمنی', '052080'),
    ('امور پشتیبانی', '000222'),
    ('انباردار', '000255'),
    ('دفتر فنی', '009062'),
    ('رئیس دفتر فنی', '034420'),
    ('مدیر پروژه', '000255'),
    ('مدیر پروژه', '027212'),
    ('نگهبان', '028047'),
    ('کمک انباردار', '024109'),
    ('کمک انباردار', '024110'),
    # Standard warehouse and operations titles
    ('کارگر ساده انبار', '024109'),
    ('اپراتور لیفتراک', '083320'),
    ('راننده خودرو سبک/سنگین', '083220'),
    ('مسئول انبار', '000255'),
    ('کارشناس اداری و مالی', '024120'),
    ('کارگر فنی و تاسیسات', '072120'),
    ('استادکار تعمیرات و نگهداری', '072110'),
]


def seed_insurance_job_titles(apps, schema_editor):
    InsuranceJobTitle = apps.get_model('personnel', 'InsuranceJobTitle')

    for title, code in SEED_JOB_TITLES:
        InsuranceJobTitle.objects.get_or_create(
            title=title.strip(),
            job_code=code.strip(),
            defaults={'is_active': True}
        )


def reverse_seed_insurance_job_titles(apps, schema_editor):
    # DEF-22: برگشت فقط جفت‌های همین seed را پاک می‌کند، نه سمت‌هایی که کاربران بعداً افزوده‌اند
    InsuranceJobTitle = apps.get_model('personnel', 'InsuranceJobTitle')
    for title, code in SEED_JOB_TITLES:
        InsuranceJobTitle.objects.filter(title=title.strip(), job_code=code.strip()).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0028_migrate_personnel_bank_accounts'),
    ]

    operations = [
        migrations.RunPython(seed_insurance_job_titles, reverse_seed_insurance_job_titles),
    ]
