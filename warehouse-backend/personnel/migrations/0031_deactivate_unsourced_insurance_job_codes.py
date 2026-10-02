# DEF-22 (remediation_plan_defects.md): هفت جفت «سمت-کد» استاندارد در 0029 کدی دارند که در فایل مرجع
# TirSalary.xlsm (شیت Emp_info) نیست و منبعی ندارد. تا تطبیق با فهرست رسمی تأمین اجتماعی، این جفت‌ها
# غیرفعال می‌شوند تا تکمیل خودکار کد بیمه (تسک ۶.۵) آن‌ها را پیشنهاد نکند. هیچ رکوردی حذف نمی‌شود و
# عنوان‌ها همچنان بدون کد در فهرست سمت‌ها می‌مانند. برگشت، همان جفت‌ها را دوباره فعال می‌کند.
from django.db import migrations


UNSOURCED_PAIRS = [
    ('کارگر ساده انبار', '024109'),
    ('اپراتور لیفتراک', '083320'),
    ('راننده خودرو سبک/سنگین', '083220'),
    ('مسئول انبار', '000255'),
    ('کارشناس اداری و مالی', '024120'),
    ('کارگر فنی و تاسیسات', '072120'),
    ('استادکار تعمیرات و نگهداری', '072110'),
]


def deactivate_unsourced(apps, schema_editor):
    InsuranceJobTitle = apps.get_model('personnel', 'InsuranceJobTitle')
    for title, code in UNSOURCED_PAIRS:
        InsuranceJobTitle.objects.filter(title=title, job_code=code, is_active=True).update(is_active=False)


def reactivate_unsourced(apps, schema_editor):
    InsuranceJobTitle = apps.get_model('personnel', 'InsuranceJobTitle')
    for title, code in UNSOURCED_PAIRS:
        InsuranceJobTitle.objects.filter(title=title, job_code=code, is_active=False).update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0030_recalculate_base_daily_rate'),
    ]

    operations = [
        migrations.RunPython(deactivate_unsourced, reactivate_unsourced),
    ]
