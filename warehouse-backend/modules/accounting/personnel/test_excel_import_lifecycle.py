import io
from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from personnel.models import Counterparty, PersonnelProfile
from personnel.org_excel_engine import (
    download_org_template,
    import_counterparties_from_excel,
    import_projects_from_excel,
    import_sections_from_excel,
    import_assignments_from_excel
)

User = get_user_model()


class ExcelImportLifecycleTests(TestCase):
    """
    آزمون چرخه حیات کامل اکسل: تولید فایل نمونه، پیش‌نمایش، ثبت و پاکسازی
    """

    def setUp(self):
        self.user = User.objects.create_superuser(
            username='admin_test',
            password='Password123!',
            email='admin@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_counterparties_template_dry_run_and_commit_math_equality(self):
        # ۱. دریافت قالب اکسل نمونه
        tpl_res = download_org_template('counterparties')
        self.assertEqual(tpl_res.status_code, 200)
        self.assertIn('attachment', tpl_res['Content-Disposition'])

        # ۲. اجرای پیش‌نمایش (Dry-Run)
        buf = io.BytesIO(tpl_res.content)
        dry_res = import_counterparties_from_excel(buf, dry_run=True)
        self.assertTrue(dry_res['success'])
        summary = dry_res['summary']

        # بررسی وجود صریح کلیدهای آماری
        self.assertIn('valid_count', summary)
        self.assertIn('error_count', summary)
        self.assertIn('total_rows', summary)

        # اعتبارسنجی مقادیر
        self.assertEqual(summary['total_rows'], 2)
        self.assertEqual(summary['valid_count'], 2)
        self.assertEqual(summary['error_count'], 0)
        self.assertEqual(summary['created'], 2)
        self.assertEqual(summary['skipped'], 0)

        # رابطه ریاضی غیرقابل نقض: جمع رکوردهای سالم و خطا برابر با کل سطرها
        self.assertEqual(summary['valid_count'] + summary['error_count'], summary['total_rows'])

        # در حالت dry-run نباید رکوردی در دیتابیس ساخته شده باشد
        self.assertEqual(Counterparty.objects.count(), 0)

        # ۳. ثبت نهایی در دیتابیس
        buf.seek(0)
        actual_res = import_counterparties_from_excel(buf, dry_run=False)
        self.assertTrue(actual_res['success'])
        self.assertEqual(actual_res['summary']['valid_count'], 2)
        self.assertEqual(actual_res['summary']['error_count'], 0)

        # ۴. تایید ایجاد رکوردها در دیتابیس
        sample_names = ['شرکت حمل‌ونقل پیشتاز', 'تعمیرگاه مرکزی ایران']
        self.assertEqual(Counterparty.objects.filter(name__in=sample_names).count(), 2)

        # ۵. پاکسازی و حذف کامل داده‌های نمونه
        deleted_count, _ = Counterparty.objects.filter(name__in=sample_names).delete()
        self.assertEqual(deleted_count, 2)
        self.assertEqual(Counterparty.objects.filter(name__in=sample_names).count(), 0)

    def test_api_endpoint_import_excel_with_dry_run_and_commit(self):
        # آزمون فراخوانی اندپوینت واقعی API
        tpl_res = self.client.get('/api/personnel/counterparties/download-template/')
        self.assertEqual(tpl_res.status_code, 200)

        upload_file = SimpleUploadedFile(
            'counterparties_template.xlsx',
            tpl_res.content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

        # تست Dry-Run از طریق API
        res_dry = self.client.post(
            '/api/personnel/counterparties/import-excel/',
            {'file': upload_file, 'dry_run': 'true'},
            format='multipart'
        )
        self.assertEqual(res_dry.status_code, 200)
        dry_summary = res_dry.json()['summary']
        self.assertEqual(dry_summary['valid_count'], 2)
        self.assertEqual(dry_summary['error_count'], 0)
        self.assertEqual(dry_summary['total_rows'], 2)
        self.assertEqual(dry_summary['valid_count'] + dry_summary['error_count'], dry_summary['total_rows'])

        # تست Commit واقعی از طریق API
        upload_file.seek(0)
        res_commit = self.client.post(
            '/api/personnel/counterparties/import-excel/',
            {'file': upload_file, 'dry_run': 'false'},
            format='multipart'
        )
        self.assertEqual(res_commit.status_code, 200)
        sample_names = ['شرکت حمل‌ونقل پیشتاز', 'تعمیرگاه مرکزی ایران']
        self.assertEqual(Counterparty.objects.filter(name__in=sample_names).count(), 2)

        # پاکسازی نهایی داده‌های نمونه
        deleted_count, _ = Counterparty.objects.filter(name__in=sample_names).delete()
        self.assertEqual(deleted_count, 2)
        self.assertEqual(Counterparty.objects.filter(name__in=sample_names).count(), 0)

    def test_personnel_excel_template_and_import_lifecycle(self):
        # تست دانلود قالب پرسنل
        tpl_res = self.client.get('/api/personnel/profiles/download-template/')
        self.assertEqual(tpl_res.status_code, 200)
        self.assertEqual(tpl_res['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

        upload_file = SimpleUploadedFile(
            'personnel_template.xlsx',
            tpl_res.content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

        # تست Dry-Run
        res_dry = self.client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': upload_file, 'dry_run': 'true'},
            format='multipart'
        )
        self.assertEqual(res_dry.status_code, 200)
        dry_data = res_dry.json()
        self.assertTrue(dry_data['success'])
        self.assertTrue(dry_data['dry_run'])
        self.assertEqual(dry_data['summary']['valid_count'], 1)
        self.assertEqual(dry_data['summary']['error_count'], 0)
        self.assertEqual(len(dry_data['preview_rows']), 1)
        self.assertEqual(dry_data['preview_rows'][0]['national_code'], '0010376488')

        # رکورد نباید در دیتابیس ایجاد شده باشد
        self.assertFalse(PersonnelProfile.objects.filter(national_code='0010376488').exists())

        # تست Commit واقعی
        upload_file.seek(0)
        res_commit = self.client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': upload_file, 'dry_run': 'false'},
            format='multipart'
        )
        self.assertEqual(res_commit.status_code, 200)
        commit_data = res_commit.json()
        self.assertTrue(commit_data['success'])
        self.assertEqual(commit_data['created_count'], 1)
        self.assertTrue(PersonnelProfile.objects.filter(national_code='0010376488').exists())

        # پاکسازی
        PersonnelProfile.objects.filter(national_code='0010376488').delete()
