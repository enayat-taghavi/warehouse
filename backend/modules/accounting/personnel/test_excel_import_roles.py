import os
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection
from personnel.models import PersonnelProfile
from personnel.scoped_test_support import grant_section_perms

User = get_user_model()

EXCEL_FILE_PATH = r'C:\Users\Payandeh\.gemini\antigravity\brain\c9c48d14-b4bf-4400-af12-1648052157a3\.user_uploaded\media_1793545864594_4da0abf2.xlsx'


class PersonnelExcelImportRolesTests(TestCase):
    """
    بررسی و سنجش آزمون محور دسترسی و عملکرد ایمپورت اکسل پرسنل برای:
    1. مدیر کل سیستم (Superuser)
    2. حسابدار (Accountant)
    3. اپراتور فاقد دسترسی حقوق و دستمزد (Operator)
    """

    @classmethod
    def setUpTestData(cls):
        cls.excel_bytes = None
        if os.path.exists(EXCEL_FILE_PATH):
            with open(EXCEL_FILE_PATH, 'rb') as f:
                cls.excel_bytes = f.read()

    def setUp(self):
        self.assertIsNotNone(self.excel_bytes, "فایل اکسل آپلود شده کاربر باید در مسیر آرتیفکت وجود داشته باشد.")

        # شرکت و پروژه و بخش اصلی
        self.company = Company.objects.create(code='CMP-A', name='شرکت مهندسی بتا')
        self.project = Project.objects.create(company=self.company, code='PRJ-A', name='پروژه پارس جنوبی')
        self.section = ProjectSection.objects.create(project=self.project, code='SEC-A1', name='بخش ابزار دقیق')

        # شرکت و بخش غیرمجاز (متعلق به شرکت دیگر)
        self.other_company = Company.objects.create(code='CMP-B', name='شرکت مجزا')
        self.other_project = Project.objects.create(company=self.other_company, code='PRJ-B', name='پروژه متفرقه')
        self.other_section = ProjectSection.objects.create(project=self.other_project, code='SEC-B1', name='بخش متفرقه')

        # ۱. مدیر کل سیستم (Superuser)
        self.superuser = User.objects.create_superuser(
            username='admin_super',
            email='admin@test.ir',
            password='PassWord123!'
        )

        # ۲. حسابدار سیستم (Accountant با دسترسی‌های استاندارد مالی و کارگزینی)
        self.accountant = User.objects.create_user(
            username='test_accountant',
            email='acc@test.ir',
            password='PassWord123!'
        )
        grant_section_perms(
            self.accountant,
            codes=['view_sys_payroll', 'perm_approve_personnel_finance', 'view_sys_personnel'],
            company=self.company,
            role='accountant',
            exact=False
        )
        grant_section_perms(
            self.accountant,
            codes=['view_sys_payroll', 'perm_approve_personnel_finance', 'view_sys_personnel'],
            section=self.section,
            role='accountant',
            exact=False
        )

        # ۳. اپراتور ساده (فاقد دسترسی مشاهده/ثبت دستمزد)
        self.operator = User.objects.create_user(
            username='test_operator',
            email='op@test.ir',
            password='PassWord123!'
        )
        grant_section_perms(
            self.operator,
            codes=['view_sys_personnel_attendance'],
            section=self.section,
            role='employee',
            exact=False
        )

    def _get_upload_file(self):
        return SimpleUploadedFile(
            'mehr1405.xlsx',
            self.excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    def test_superuser_can_import_excel_with_section(self):
        """مدیر کل سیستم می‌تواند فایل اکسل ۵۹ نفره را همراه با انتخاب بخش، پیش‌نمایش و ثبت قطعی کند."""
        client = APIClient()
        client.force_authenticate(user=self.superuser)

        # ۱. تست Dry-Run
        res_dry = client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': self._get_upload_file(), 'section_id': self.section.id, 'dry_run': 'true'},
            format='multipart',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )
        self.assertEqual(res_dry.status_code, 200)
        data_dry = res_dry.json()
        self.assertTrue(data_dry['success'])
        self.assertTrue(data_dry['dry_run'])
        self.assertEqual(data_dry['summary']['created'], 59)
        self.assertIn('fields_info', data_dry)
        self.assertGreater(data_dry['fields_info']['detected_count'], 20)
        # در dry-run نباید رکوردی در دیتابیس ایجاد شده باشد
        self.assertEqual(PersonnelProfile.objects.filter(section=self.section).count(), 0)

        # ۲. تست ثبت نهایی (Commit)
        res_commit = client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': self._get_upload_file(), 'section_id': self.section.id, 'dry_run': 'false'},
            format='multipart',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )
        self.assertEqual(res_commit.status_code, 200)
        data_commit = res_commit.json()
        self.assertTrue(data_commit['success'])
        self.assertEqual(data_commit['created_count'], 59)

        # بررسی در دیتابیس
        profiles = PersonnelProfile.objects.filter(section=self.section)
        self.assertEqual(profiles.count(), 59)

        # فیلد حقوق قرارداد شده در اکسل مقدار دارد (مثلا ۷۰۰ میلیون ریال)، اما فیلدهای مزد روزانه/پایه سنواتی در این فایل خاص #REF! هستند
        sample = profiles.filter(contract_base_salary__gt=0).first()
        self.assertIsNotNone(sample, "حقوق قرارداد شده باید برای مدیر کل در دیتابیس ذخیره شود.")
        self.assertGreater(sample.contract_base_salary, 0)

    def test_accountant_can_import_excel_for_assigned_section(self):
        """حسابدار در بک‌اند مجاز است فایل اکسل را برای بخش مجاز خود ثبت کند و دستمزدها نیز به عنوان کاربر مالی اعمال می‌شوند."""
        client = APIClient()
        client.force_authenticate(user=self.accountant)

        # ثبت قطعی برای بخش مجاز
        res = client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': self._get_upload_file(), 'section_id': self.section.id, 'dry_run': 'false'},
            format='multipart',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 59)

        profiles = PersonnelProfile.objects.filter(section=self.section)
        self.assertEqual(profiles.count(), 59)

        # بررسی اینکه دستمزدها/حقوق به عنوان حسابدار حذف نشده‌اند (DEF-21: user_can_view_wages برای حسابدار True است)
        sample = profiles.filter(contract_base_salary__gt=0).first()
        self.assertIsNotNone(sample, "حسابدار دارای دسترسی حقوق است و حقوق قرارداد شده نباید حذف شود.")
        self.assertGreater(sample.contract_base_salary, 0)

    def test_accountant_can_import_excel_without_section_to_company(self):
        """حسابدار در صورت عدم ارسال بخش (مثلاً در صفحه بانک پرونده‌ها)، می‌تواند داده‌ها را در سطح شرکت ایمپورت کند."""
        client = APIClient()
        client.force_authenticate(user=self.accountant)

        res = client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': self._get_upload_file(), 'dry_run': 'false'},
            format='multipart',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 59)

        profiles = PersonnelProfile.objects.filter(company=self.company)
        self.assertEqual(profiles.count(), 59)

    def test_accountant_forbidden_on_unauthorized_section(self):
        """اگر حسابدار بخواهد برای بخشی از یک شرکت دیگر که به آن دسترسی ندارد فایل را بارگذاری کند، با خطای ۴۰۳ مواجه می‌شود."""
        client = APIClient()
        client.force_authenticate(user=self.accountant)

        res = client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': self._get_upload_file(), 'section_id': self.other_section.id, 'dry_run': 'false'},
            format='multipart',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(PersonnelProfile.objects.filter(section=self.other_section).count(), 0)

    def test_operator_without_wage_perms_has_wages_stripped(self):
        """اپراتور عادی هرچند بخش را دارد اما چون دسترسی حقوق ندارد، فیلدهای دستمزد از ایمپورت او حذف می‌شود (DEF-21)."""
        client = APIClient()
        client.force_authenticate(user=self.operator)

        res = client.post(
            '/api/personnel/profiles/import-excel/',
            {'file': self._get_upload_file(), 'section_id': self.section.id, 'dry_run': 'false'},
            format='multipart',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 59)

        profiles = PersonnelProfile.objects.filter(section=self.section)
        self.assertEqual(profiles.count(), 59)

        # هیچ رکوردی نباید حقوق قرارداد شده ثبت شده داشته باشد چون اپراتور به حقوق دسترسی ندارد
        waged_count = profiles.filter(contract_base_salary__gt=0).count()
        self.assertEqual(waged_count, 0, "برای کاربری که دسترسی حقوق ندارد، فیلدهای دستمزد و حقوق باید صفر/حذف شوند.")
