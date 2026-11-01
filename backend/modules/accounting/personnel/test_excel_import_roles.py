import io

import openpyxl
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection
from personnel.models import PersonnelProfile
from personnel.scoped_test_support import grant_section_perms

User = get_user_model()

ROW_COUNT = 59

# سربرگ‌ها همان کلید انگلیسی فیلدهاست (هر کلید جزو نام‌های مستعار خودش است)
HEADER_FIELDS = [
    'national_code', 'first_name', 'last_name', 'father_name', 'birth_date', 'id_number',
    'birth_place', 'education_level', 'insurance_type', 'insurance_number', 'postal_code',
    'address', 'job_category', 'job_title', 'employment_type', 'start_date', 'gender',
    'phone_number', 'account_number', 'sheba_number', 'bank_name', 'marital_status',
    'children_count', 'contract_hours', 'contract_base_salary',
]


def _national_code(seed):
    """کد ملی معتبر (با رقم کنترل) از روی یک عدد"""
    body = f'{seed:09d}'
    s = sum(int(d) * (10 - i) for i, d in enumerate(body)) % 11
    return body + str(s if s < 2 else 11 - s)


def _build_workbook_bytes():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Emp_info'
    ws.append(HEADER_FIELDS)
    for i in range(ROW_COUNT):
        row = {f: None for f in HEADER_FIELDS}
        row['national_code'] = _national_code(100000001 + i * 7)
        row['first_name'] = f'نام{i}'
        row['last_name'] = f'خانوادگی{i}'
        row['contract_base_salary'] = 700000000
        ws.append([row[f] for f in HEADER_FIELDS])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class PersonnelExcelImportRolesTests(TestCase):
    """
    بررسی و سنجش آزمون محور دسترسی و عملکرد ایمپورت اکسل پرسنل برای:
    1. مدیر کل سیستم (Superuser)
    2. حسابدار (Accountant)
    3. اپراتور فاقد دسترسی حقوق و دستمزد (Operator)
    """

    @classmethod
    def setUpTestData(cls):
        cls.excel_bytes = _build_workbook_bytes()

    def setUp(self):
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
        self.assertEqual(data_dry['summary']['created'], ROW_COUNT)
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
        self.assertEqual(data_commit['created_count'], ROW_COUNT)

        # بررسی در دیتابیس
        profiles = PersonnelProfile.objects.filter(section=self.section)
        self.assertEqual(profiles.count(), ROW_COUNT)

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
        self.assertEqual(data['created_count'], ROW_COUNT)

        profiles = PersonnelProfile.objects.filter(section=self.section)
        self.assertEqual(profiles.count(), ROW_COUNT)

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
        self.assertEqual(data['created_count'], ROW_COUNT)

        profiles = PersonnelProfile.objects.filter(company=self.company)
        self.assertEqual(profiles.count(), ROW_COUNT)

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
        self.assertEqual(data['created_count'], ROW_COUNT)

        profiles = PersonnelProfile.objects.filter(section=self.section)
        self.assertEqual(profiles.count(), ROW_COUNT)

        # هیچ رکوردی نباید حقوق قرارداد شده ثبت شده داشته باشد چون اپراتور به حقوق دسترسی ندارد
        waged_count = profiles.filter(contract_base_salary__gt=0).count()
        self.assertEqual(waged_count, 0, "برای کاربری که دسترسی حقوق ندارد، فیلدهای دستمزد و حقوق باید صفر/حذف شوند.")
