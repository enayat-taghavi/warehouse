# داده‌های پایهٔ سمت‌های بیمه؛ جایگزین مایگریشن‌های 0029 و 0031 پیش از بازسازی مایگریشن‌ها
# (طرح Modular_Deploy_Options، گام ۱).
from django.db import migrations


# عنوان و کد از شیت Emp_info فایل مرجع TirSalary.xlsm (با عنوان‌های چندکدی) به‌علاوهٔ عنوان‌های استاندارد
SEED_JOB_TITLES = [
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
    ('کارگر ساده انبار', '024109'),
    ('اپراتور لیفتراک', '083320'),
    ('راننده خودرو سبک/سنگین', '083220'),
    ('مسئول انبار', '000255'),
    ('کارشناس اداری و مالی', '024120'),
    ('کارگر فنی و تاسیسات', '072120'),
    ('استادکار تعمیرات و نگهداری', '072110'),
]

# DEF-22: این جفت‌ها در فایل مرجع نیستند و منبعی ندارند؛ تا تطبیق با فهرست رسمی تأمین اجتماعی غیرفعال
# می‌مانند تا تکمیل خودکار کد بیمه آن‌ها را پیشنهاد نکند.
UNSOURCED_PAIRS = {
    ('کارگر ساده انبار', '024109'),
    ('اپراتور لیفتراک', '083320'),
    ('راننده خودرو سبک/سنگین', '083220'),
    ('مسئول انبار', '000255'),
    ('کارشناس اداری و مالی', '024120'),
    ('کارگر فنی و تاسیسات', '072120'),
    ('استادکار تعمیرات و نگهداری', '072110'),
}


def seed_insurance_job_titles(apps, schema_editor):
    InsuranceJobTitle = apps.get_model('personnel', 'InsuranceJobTitle')
    for title, code in SEED_JOB_TITLES:
        InsuranceJobTitle.objects.get_or_create(
            title=title,
            job_code=code,
            defaults={'is_active': (title, code) not in UNSOURCED_PAIRS}
        )


def reverse_seed_insurance_job_titles(apps, schema_editor):
    # برگشت فقط جفت‌های همین seed را پاک می‌کند، نه سمت‌هایی که کاربران بعداً افزوده‌اند
    InsuranceJobTitle = apps.get_model('personnel', 'InsuranceJobTitle')
    for title, code in SEED_JOB_TITLES:
        InsuranceJobTitle.objects.filter(title=title, job_code=code).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('personnel', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_insurance_job_titles, reverse_seed_insurance_job_titles),
    ]
