import io
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from personnel.models import (
    Company, CompanyDocument, CompanyBankAccount, CompanyBoardMember, UserCompanyAccess,
    FinancialProject, ProjectSection, UserSectionAssignment
)
from personnel.serializers import CompanySerializer
from personnel.views import get_user_allowed_companies

User = get_user_model()


class CompanyDocumentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username='admin_doc',
            password='Password123!',
            email='admin_doc@example.com'
        )

        self.user_a = User.objects.create_user(
            username='user_comp_a',
            password='Password123!',
            email='usera@example.com'
        )

        self.user_b = User.objects.create_user(
            username='user_comp_b',
            password='Password123!',
            email='userb@example.com'
        )

        self.company_a = Company.objects.create(
            code='CMPA',
            name='شرکت آلفا',
            company_type='private_joint_stock',
            national_id='14001234567',
            workshop_code='1234567890',
            tax_memory_id='A1B2C3',
            primary_iban='IR120120000000001234567890',
            has_warehouse_module=True,
            is_active=True
        )

        self.company_b = Company.objects.create(
            code='CMPB',
            name='شرکت بتا',
            company_type='holding',
            national_id='14009876543',
            has_warehouse_module=False,
            is_active=True
        )

        # انتساب دسترسی کاربر A به شرکت A
        UserCompanyAccess.objects.create(user=self.user_a, company=self.company_a, is_default=True)
        # انتساب دسترسی کاربر B به شرکت B
        UserCompanyAccess.objects.create(user=self.user_b, company=self.company_b, is_default=True)

    def test_company_document_model_and_expiry_status(self):
        """تست محاسبات تاریخ انقضا و پراپرتی‌های وضعیت اعتبار سند"""
        today = timezone.now().date()

        # ۱. سند بدون تاریخ انقضا (دائمی)
        doc_perm = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='statute',
            title='اساسنامه شرکت آلفا',
            file=SimpleUploadedFile('statute.pdf', b'content-pdf', content_type='application/pdf')
        )
        self.assertEqual(doc_perm.expiry_status, 'permanent')
        self.assertIsNone(doc_perm.days_until_expiry)

        # ۲. سند منقضی شده
        doc_exp = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='operating_license',
            title='پروانه بهره‌برداری منقضی',
            file=SimpleUploadedFile('license.pdf', b'license', content_type='application/pdf'),
            expiry_date=today - timedelta(days=5)
        )
        self.assertEqual(doc_exp.expiry_status, 'expired')
        self.assertTrue(doc_exp.days_until_expiry < 0)

        # ۳. سند نزدیک به انقضا (کمتر از ۳۰ روز)
        doc_soon = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='commercial_card',
            title='کارت بازرگانی در آستانه انقضا',
            file=SimpleUploadedFile('card.pdf', b'card', content_type='application/pdf'),
            expiry_date=today + timedelta(days=12)
        )
        self.assertEqual(doc_soon.expiry_status, 'expiring_soon')
        self.assertEqual(doc_soon.days_until_expiry, 12)

        # ۴. سند کاملاً معتبر
        doc_valid = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='contractor_qualification',
            title='گواهی رتبه‌بندی معتبر',
            file=SimpleUploadedFile('rank.pdf', b'rank', content_type='application/pdf'),
            expiry_date=today + timedelta(days=150)
        )
        self.assertEqual(doc_valid.expiry_status, 'valid')
        self.assertEqual(doc_valid.days_until_expiry, 150)

    def test_company_serializer_health_status(self):
        """تست سریالایزر شرکت و متادیتای خلاصه سلامت مدارک"""
        # شرکت بدون مدرک
        serializer_b = CompanySerializer(self.company_b)
        self.assertEqual(serializer_b.data['documents_health_status'], 'no_documents')
        self.assertEqual(serializer_b.data['documents_count'], 0)

        # ایجاد مدرک معتبر برای شرکت A
        today = timezone.now().date()
        CompanyDocument.objects.create(
            company=self.company_a,
            document_type='statute',
            title='اساسنامه',
            file=SimpleUploadedFile('statute.pdf', b'statute')
        )
        CompanyDocument.objects.create(
            company=self.company_a,
            document_type='vat_certificate',
            title='گواهی ارزش افزوده',
            file=SimpleUploadedFile('vat.pdf', b'vat'),
            expiry_date=today + timedelta(days=90)
        )
        serializer_a = CompanySerializer(self.company_a)
        self.assertEqual(serializer_a.data['documents_health_status'], 'valid')
        self.assertEqual(serializer_a.data['documents_count'], 2)

        # افزودن مدرک منقضی
        CompanyDocument.objects.create(
            company=self.company_a,
            document_type='commercial_card',
            title='کارت بازرگانی',
            file=SimpleUploadedFile('card.pdf', b'card'),
            expiry_date=today - timedelta(days=1)
        )
        serializer_a_updated = CompanySerializer(self.company_a)
        self.assertEqual(serializer_a_updated.data['documents_health_status'], 'expired')
        self.assertEqual(serializer_a_updated.data['documents_count'], 3)

    def test_confidential_document_isolation(self):
        """تست امنیت اسناد محرمانه و عدم نمایش به کاربران عادی"""
        # ایجاد سند محرمانه توسط سوپریوزر
        doc_conf = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='master_agreement',
            title='قرارداد محرمانه سهامداران',
            file=SimpleUploadedFile('secret.pdf', b'confidential-content'),
            is_confidential=True
        )
        doc_pub = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='statute',
            title='اساسنامه عمومی',
            file=SimpleUploadedFile('statute.pdf', b'public-content'),
            is_confidential=False
        )

        # ورود به عنوان کاربر عادی A
        self.client.force_authenticate(user=self.user_a)
        resp_user = self.client.get(f'/api/personnel/company-documents/?company_id={self.company_a.id}')
        self.assertEqual(resp_user.status_code, status.HTTP_200_OK)
        results_user = resp_user.data if isinstance(resp_user.data, list) else resp_user.data.get('results', [])
        ids_user = [d['id'] for d in results_user]
        self.assertIn(doc_pub.id, ids_user)
        self.assertNotIn(doc_conf.id, ids_user, "سند محرمانه نباید برای کاربر عادی قابل مشاهده باشد.")

        # ورود به عنوان سوپریوزر
        self.client.force_authenticate(user=self.superuser)
        resp_admin = self.client.get(f'/api/personnel/company-documents/?company_id={self.company_a.id}')
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        results_admin = resp_admin.data if isinstance(resp_admin.data, list) else resp_admin.data.get('results', [])
        ids_admin = [d['id'] for d in results_admin]
        self.assertIn(doc_conf.id, ids_admin, "سوپریوزر باید به اسناد محرمانه دسترسی کامل داشته باشد.")

    def test_user_company_access_bola_protection(self):
        """تست ممانعت از دسترسی BOLA بین شرکت‌های مجزا"""
        # کاربر B حق دسترسی به شرکت A را ندارد
        self.client.force_authenticate(user=self.user_b)
        resp = self.client.get(f'/api/personnel/company-documents/?company_id={self.company_a.id}')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # تلاش کاربر B برای بارگذاری مدرک در شرکت A
        test_file = SimpleUploadedFile('test.pdf', b'content', content_type='application/pdf')
        resp_create = self.client.post('/api/personnel/company-documents/', {
            'company': self.company_a.id,
            'document_type': 'statute',
            'title': 'نفوذ غیرمجاز',
            'file': test_file
        }, format='multipart')
        self.assertEqual(resp_create.status_code, status.HTTP_403_FORBIDDEN)

    def test_expiring_documents_action(self):
        """تست اکشن تجمیعی اسناد در آستانه انقضا جهت خوراک ویجت مرکز عملیات"""
        today = timezone.now().date()
        # سند منقضی در شرکت A
        CompanyDocument.objects.create(
            company=self.company_a,
            document_type='vat_certificate',
            title='ارزش افزوده منقضی',
            file=SimpleUploadedFile('vat.pdf', b'vat'),
            expiry_date=today - timedelta(days=2)
        )
        # سند نزدیک به انقضا در شرکت A (۱۰ روز)
        CompanyDocument.objects.create(
            company=self.company_a,
            document_type='commercial_card',
            title='کارت بازرگانی نزدیک انقضا',
            file=SimpleUploadedFile('card.pdf', b'card'),
            expiry_date=today + timedelta(days=10)
        )
        # سند معتبر بلندمدت (۱۰۰ روز) - نباید در این اندپوینت بیاید
        CompanyDocument.objects.create(
            company=self.company_a,
            document_type='operating_license',
            title='مجوز بلندمدت',
            file=SimpleUploadedFile('lic.pdf', b'lic'),
            expiry_date=today + timedelta(days=100)
        )

        self.client.force_authenticate(user=self.superuser)
        resp = self.client.get('/api/personnel/companies/expiring-documents/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)
        titles = [d['title'] for d in resp.data['results']]
        self.assertIn('ارزش افزوده منقضی', titles)
        self.assertIn('کارت بازرگانی نزدیک انقضا', titles)
        self.assertNotIn('مجوز بلندمدت', titles)

    def test_company_bank_accounts_crud_and_primary_sync(self):
        """تست مدیریت چند شماره شبا و همگام‌سازی حساب اصلی با مدل شرکت"""
        from personnel.sheba_utils import generate_sheba_from_account
        sheba_mellat = generate_sheba_from_account('012', '1234567890')
        sheba_melli = generate_sheba_from_account('017', '9876543210')

        self.client.force_authenticate(user=self.superuser)

        # ۱. ثبت حساب اول (ملت)
        resp1 = self.client.post('/api/personnel/company-bank-accounts/', {
            'company': self.company_a.id,
            'bank_name': 'بانک ملت',
            'account_number': '1234567890',
            'sheba_number': sheba_mellat,
            'account_title': 'حساب حقوق پرسنل'
        })
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        acc1_id = resp1.data['id']
        self.assertTrue(resp1.data['is_primary'])

        # بررسی همگام‌سازی با شرکت
        self.company_a.refresh_from_db()
        self.assertEqual(self.company_a.primary_bank_name, 'بانک ملت')
        self.assertEqual(self.company_a.primary_account_number, '1234567890')
        self.assertEqual(self.company_a.primary_iban, sheba_mellat)

        # ۲. ثبت حساب دوم (ملی) بدون تعیین is_primary
        resp2 = self.client.post('/api/personnel/company-bank-accounts/', {
            'company': self.company_a.id,
            'bank_name': 'بانک ملی ایران',
            'account_number': '9876543210',
            'sheba_number': sheba_melli,
            'account_title': 'حساب بازرگانی و فروش'
        })
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)
        acc2_id = resp2.data['id']
        self.assertFalse(resp2.data['is_primary'])

        # ۳. تغییر حساب اصلی به حساب دوم از طریق اکشن set-primary
        resp_set_primary = self.client.post(f'/api/personnel/company-bank-accounts/{acc2_id}/set-primary/')
        self.assertEqual(resp_set_primary.status_code, status.HTTP_200_OK)
        self.assertTrue(resp_set_primary.data['is_primary'])

        # حساب ۱ باید دیگر اصلی نباشد
        acc1 = CompanyBankAccount.objects.get(id=acc1_id)
        self.assertFalse(acc1.is_primary)

        # فیلدهای شرکت A باید به حساب ملی به‌روز شده باشند
        self.company_a.refresh_from_db()
        self.assertEqual(self.company_a.primary_bank_name, 'بانک ملی ایران')
        self.assertEqual(self.company_a.primary_account_number, '9876543210')
        self.assertEqual(self.company_a.primary_iban, sheba_melli)

    def test_company_bank_account_validation_and_isolation(self):
        """تست اعتبارسنجی شبا و ایزولاسیون شرکتی در حساب‌های بانکی"""
        # ۱. رد شبای نامعتبر
        self.client.force_authenticate(user=self.superuser)
        resp_invalid = self.client.post('/api/personnel/company-bank-accounts/', {
            'company': self.company_a.id,
            'bank_name': 'بانک ملت',
            'account_number': '1234567890',
            'sheba_number': 'IR000000000000000000000000',
            'account_title': 'حساب تستی'
        })
        self.assertEqual(resp_invalid.status_code, status.HTTP_400_BAD_REQUEST)

        # ۲. عدم اجازه به کاربر B جهت ایجاد حساب بانکی در شرکت A
        from personnel.sheba_utils import generate_sheba_from_account
        sheba_valid = generate_sheba_from_account('012', '5555555555')
        self.client.force_authenticate(user=self.user_b)
        resp_forbidden = self.client.post('/api/personnel/company-bank-accounts/', {
            'company': self.company_a.id,
            'bank_name': 'بانک ملت',
            'account_number': '5555555555',
            'sheba_number': sheba_valid,
            'account_title': 'تلاش غیرمجاز'
        })
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_signed_media_urls_prevent_forbidden(self):
        """ایراد ۱: تست تولید URL امضاشده برای اسناد شرکت و جلوگیری از خطای ۴۰۳"""
        from common.media_urls import verify, is_protected

        doc = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='statute',
            title='اساسنامه رسمی',
            file=SimpleUploadedFile('statute.pdf', b'%PDF-1.4 test content', content_type='application/pdf')
        )

        self.client.force_authenticate(user=self.superuser)
        resp = self.client.get(f'/api/personnel/company-documents/{doc.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        file_url = resp.data['file_url']
        self.assertIsNotNone(file_url)
        self.assertIn('?e=', file_url)
        self.assertIn('&s=', file_url)

        # اعتبارسنجی پارامترهای امضا
        import urllib.parse
        parsed = urllib.parse.urlparse(file_url)
        params = urllib.parse.parse_qs(parsed.query)
        path = parsed.path.replace('/media/', '').lstrip('/')

        self.assertTrue(is_protected(path))
        self.assertIn('e', params)
        self.assertIn('s', params)
        self.assertTrue(verify(path, params['e'][0], params['s'][0]))

        # بررسی اینکه دسترسی به همین فایل بدون امضا خطای ۴۰۳ می‌دهد
        unsigned_resp = self.client.get(f'/media/{path}')
        self.assertEqual(unsigned_resp.status_code, 403)

        # و دسترسی با امضا خطای ۴۰۳ نمی‌دهد و باید برای نمایش در فریم به صورت inline سرو شود
        signed_resp = self.client.get(file_url)
        self.assertEqual(signed_resp.status_code, status.HTTP_200_OK)
        self.assertIn('inline', signed_resp.get('Content-Disposition', ''))
        self.assertEqual(signed_resp.get('X-Frame-Options'), 'SAMEORIGIN')

        # تست فایل با نام فارسی و کاراکترهای یونیکد (آگهی_تغییرات_شرکت.pdf)
        doc_persian = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='statute',
            title='اساسنامه فارسی',
            file=SimpleUploadedFile('اساسنامه_رسمی_شرکت.pdf', b'%PDF-1.4 persian test content', content_type='application/pdf')
        )
        resp_p = self.client.get(f'/api/personnel/company-documents/{doc_persian.id}/')
        p_url = resp_p.data['file_url']
        p_resp = self.client.get(p_url)
        self.assertEqual(p_resp.status_code, status.HTTP_200_OK)
        self.assertIn('inline', p_resp.get('Content-Disposition', ''))

    def test_file_extension_and_size_validation(self):
        """ایراد ۲: تست اعتبارسنجی پسوند و حجم فایل در مدارک و اساسنامه شرکت"""
        self.client.force_authenticate(user=self.superuser)

        # ۱. رد فایل با پسوند غیرمجاز (.exe)
        bad_file = SimpleUploadedFile('malicious.exe', b'bad-binary-content', content_type='application/x-msdownload')
        resp_bad_ext = self.client.post('/api/personnel/company-documents/', {
            'company': self.company_a.id,
            'document_type': 'other',
            'title': 'فایل مخرب',
            'file': bad_file
        }, format='multipart')
        self.assertEqual(resp_bad_ext.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', resp_bad_ext.data)
        self.assertIn('غیرمجاز', str(resp_bad_ext.data['file']))

        # ۲. رد فایل با حجم غیرمجاز (>25MB)
        from unittest.mock import MagicMock
        from rest_framework import serializers
        from personnel.serializers import validate_uploaded_document
        mock_oversized = MagicMock()
        mock_oversized.size = 26 * 1024 * 1024
        with self.assertRaises(serializers.ValidationError) as ctx:
            validate_uploaded_document(mock_oversized)
        self.assertTrue('25' in str(ctx.exception) and 'مگابایت' in str(ctx.exception))



        # ۳. پذیرش فایل مجاز (.pdf)
        good_file = SimpleUploadedFile('valid.pdf', b'%PDF-1.4 sample', content_type='application/pdf')
        resp_good = self.client.post('/api/personnel/company-documents/', {
            'company': self.company_a.id,
            'document_type': 'operating_license',
            'title': 'پروانه بهره‌برداری معتبر',
            'file': good_file
        }, format='multipart')
        self.assertEqual(resp_good.status_code, status.HTTP_201_CREATED)

    def test_confidentiality_guard_and_secure_download(self):
        """ایراد ۳: تست گارد محرمانگی و اکشن اختصاصی دانلود امن"""
        # ایجاد سند محرمانه توسط سوپریوزر
        conf_file = SimpleUploadedFile('secret_board.pdf', b'%PDF-1.4 confidential', content_type='application/pdf')
        doc_conf = CompanyDocument.objects.create(
            company=self.company_a,
            document_type='master_agreement',
            title='قرارداد محرمانه هیئت‌مدیره',
            file=conf_file,
            is_confidential=True
        )

        # ۱. تلاش کاربر عادی شرکت A جهت دانلود سند محرمانه -> خطای ۴۰۳
        self.client.force_authenticate(user=self.user_a)
        resp_download_forbidden = self.client.get(f'/api/personnel/company-documents/{doc_conf.id}/download/')
        self.assertEqual(resp_download_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # ۲. تلاش کاربر عادی شرکت A جهت ویرایش سند محرمانه -> عدم دسترسی (۴۰۳ یا ۴۰۴ به دلیل فیلتر شدن از کوئری‌ست)
        resp_edit_forbidden = self.client.patch(f'/api/personnel/company-documents/{doc_conf.id}/', {
            'title': 'تغییر عنوان سند محرمانه'
        })
        self.assertIn(resp_edit_forbidden.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # ۳. تلاش کاربر شرکت B (شرکت دیگر) -> خطای ۴۰۳ BOLA
        self.client.force_authenticate(user=self.user_b)
        resp_bola = self.client.get(f'/api/personnel/company-documents/{doc_conf.id}/download/')
        self.assertEqual(resp_bola.status_code, status.HTTP_403_FORBIDDEN)

        # ۴. دانلود موفقیت‌آمیز توسط سوپریوزر -> بازگشت FileResponse با هدر دیسپوزیشن
        self.client.force_authenticate(user=self.superuser)
        resp_download_success = self.client.get(f'/api/personnel/company-documents/{doc_conf.id}/download/')
        self.assertEqual(resp_download_success.status_code, status.HTTP_200_OK)
        self.assertIn('attachment', resp_download_success['Content-Disposition'])

        # ۵. درخواست دانلود سند ناموجود -> خطای ۴۰۴
        resp_not_found = self.client.get('/api/personnel/company-documents/999999/download/')
        self.assertEqual(resp_not_found.status_code, status.HTTP_404_NOT_FOUND)

    def test_expiring_documents_pagination(self):
        """ایراد ۵: تست صفحه‌بندی اختیاری اندپوینت expiring-documents"""
        today = timezone.now().date()
        # ایجاد ۳ سند در آستانه انقضا
        for i in range(3):
            CompanyDocument.objects.create(
                company=self.company_a,
                document_type='operating_license',
                title=f'سند انقضا {i}',
                file=SimpleUploadedFile(f'lic_{i}.pdf', b'content'),
                expiry_date=today + timedelta(days=i + 1)
            )

        self.client.force_authenticate(user=self.superuser)

        # الف) فراخوانی عادی بدون پارامتر صفحه‌بندی -> فرمت سازگار قبلی { count, results }
        resp_normal = self.client.get('/api/personnel/companies/expiring-documents/')
        self.assertEqual(resp_normal.status_code, status.HTTP_200_OK)
        self.assertIn('count', resp_normal.data)
        self.assertIn('results', resp_normal.data)
        self.assertNotIn('next', resp_normal.data)

        # ب) فراخوانی با پارامتر صفحه‌بندی -> فرمت صفحه‌بندی استاندارد DRF
        resp_paginated = self.client.get('/api/personnel/companies/expiring-documents/?page=1&page_size=2')
        self.assertEqual(resp_paginated.status_code, status.HTTP_200_OK)
        self.assertIn('count', resp_paginated.data)
        self.assertIn('next', resp_paginated.data)
        self.assertIn('previous', resp_paginated.data)
        self.assertIn('results', resp_paginated.data)
        self.assertEqual(len(resp_paginated.data['results']), 2)

    def test_shamsi_date_parsing_and_representation(self):
        """ایراد ۶: تست پذیرش تاریخ شمسی (با ارقام فارسی و انگلیسی) و بازگشت رشته استاندارد شمسی"""
        self.client.force_authenticate(user=self.superuser)

        # ۱. ثبت شرکت با تاریخ‌های شمسی در registration_date و board_term_expiry
        resp_comp = self.client.post('/api/personnel/companies/', {
            'code': 'CMPNEW',
            'name': 'شرکت نوین تست',
            'company_type': 'private_joint_stock',
            'registration_date': '1400/01/15',
            'board_term_expiry': '۱۴۰۵/۰۸/۳۰'  # با ارقام فارسی
        })
        self.assertEqual(resp_comp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_comp.data['registration_date'], '1400/01/15')
        self.assertEqual(resp_comp.data['board_term_expiry'], '1405/08/30')

        # بررسی در دیتابیس (ذخیره میلادی معادل)
        comp = Company.objects.get(code='CMPNEW')
        from datetime import date
        self.assertEqual(comp.registration_date, date(2021, 4, 4))
        self.assertEqual(comp.board_term_expiry, date(2026, 11, 21))


        # ۲. ثبت سند شرکت با تاریخ صدور و انقضای شمسی
        doc_file = SimpleUploadedFile('tax.pdf', b'tax content', content_type='application/pdf')
        resp_doc = self.client.post('/api/personnel/company-documents/', {
            'company': comp.id,
            'document_type': 'tax_clearance',
            'title': 'مفاصاحساب مالیاتی ۱۴۰۳',
            'file': doc_file,
            'issue_date': '1403/05/20',
            'expiry_date': '۱۴۰۴/۰۵/۲۰'  # با ارقام فارسی
        }, format='multipart')
        self.assertEqual(resp_doc.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_doc.data['issue_date'], '1403/05/20')
        self.assertEqual(resp_doc.data['expiry_date'], '1404/05/20')

        # ۳. رد تاریخ نامعتبر
        invalid_file = SimpleUploadedFile('invalid.pdf', b'content', content_type='application/pdf')
        resp_invalid = self.client.post('/api/personnel/company-documents/', {
            'company': comp.id,
            'document_type': 'tax_clearance',
            'title': 'سند تاریخ غلط',
            'file': invalid_file,
            'issue_date': 'تاریخ_غلط_تستی'
        }, format='multipart')
        self.assertEqual(resp_invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('issue_date', resp_invalid.data)

    def test_section_assignment_does_not_grant_documents_access(self):
        """
        صرف داشتن انتساب در بخش‌های تابعه (UserSectionAssignment) نباید دسترسی
        به بایگانی مدارک (docs_read و docs_write) را به کاربر اعطا کند.
        دسترسی به اسناد تنها بر اساس مجوز صریح UserCompanyAccess یا سوپریوزر است.
        """
        worker = User.objects.create_user(
            username='worker_section_only',
            password='Password123!',
            email='worker_sec@example.com'
        )

        project = FinancialProject.objects.create(
            company=self.company_b,
            code='PRJ_SEC_TEST',
            name='پروژه آزمایشی شرکت بتا'
        )

        section = ProjectSection.objects.create(
            project=project,
            code='SEC_WORKER',
            name='بخش عملیات کارگاهی'
        )

        UserSectionAssignment.objects.create(
            user=worker,
            section=section,
            role='employee',
            is_active=True
        )

        # ۱. در سطح فضای کاری (workspace_full)، کاربر به شرکت بتا دسترسی مشتق‌شده دارد
        allowed_workspace = get_user_allowed_companies(worker, required_level='workspace_full')
        self.assertIn(self.company_b, allowed_workspace)

        # ۲. در سطوح اسناد (docs_read و docs_write)، کاربر نباید هیچ دسترسی به شرکت بتا داشته باشد
        allowed_docs_read = get_user_allowed_companies(worker, required_level='docs_read')
        self.assertNotIn(self.company_b, allowed_docs_read)

        allowed_docs_write = get_user_allowed_companies(worker, required_level='docs_write')
        self.assertNotIn(self.company_b, allowed_docs_write)

        # ۳. تست از طریق API کاربر
        self.client.force_authenticate(user=worker)

        # الف) لیست شرکت‌های در دسترس با اسکوپ documents باید خالی باشد
        resp_scope = self.client.get('/api/personnel/companies/user-available/?scope=documents')
        self.assertEqual(resp_scope.status_code, status.HTTP_200_OK)
        company_ids_in_docs = [c['id'] for c in resp_scope.data['companies']]
        self.assertNotIn(self.company_b.id, company_ids_in_docs)

        # ب) درخواست لیست اسناد شرکت بتا باید خطای 403 پرتاب کند
        resp_docs = self.client.get(f'/api/personnel/company-documents/?company_id={self.company_b.id}')
        self.assertEqual(resp_docs.status_code, status.HTTP_403_FORBIDDEN)

        # ج) درخواست ثبت سند در شرکت بتا باید خطای 403 پرتاب کند
        dummy_file = SimpleUploadedFile('sample.pdf', b'sample content', content_type='application/pdf')
        resp_create = self.client.post('/api/personnel/company-documents/', {
            'company': self.company_b.id,
            'document_type': 'statute',
            'title': 'اساسنامه تستی غیرمجاز',
            'file': dummy_file
        }, format='multipart')
        self.assertEqual(resp_create.status_code, status.HTTP_403_FORBIDDEN)

        # ۴. اعطای دسترسی صریح UserCompanyAccess با سطح docs_read
        UserCompanyAccess.objects.create(
            user=worker,
            company=self.company_b,
            access_level='docs_read'
        )

        # اکنون باید دسترسی مشاهده داشته باشد
        allowed_now = get_user_allowed_companies(worker, required_level='docs_read')
        self.assertIn(self.company_b, allowed_now)

        resp_docs_allowed = self.client.get(f'/api/personnel/company-documents/?company_id={self.company_b.id}')
        self.assertEqual(resp_docs_allowed.status_code, status.HTTP_200_OK)

        # اما همچنان نباید اجازه آپلود داشته باشد (سطح docs_write ندارد)
        dummy_file2 = SimpleUploadedFile('sample2.pdf', b'sample content 2', content_type='application/pdf')
        resp_create_denied = self.client.post('/api/personnel/company-documents/', {
            'company': self.company_b.id,
            'document_type': 'statute',
            'title': 'اساسنامه بدون مجوز نوشتن',
            'file': dummy_file2
        }, format='multipart')
        self.assertEqual(resp_create_denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_company_board_members_crud_and_features(self):
        """تست جامع عملیات اعضای هیئت‌مدیره، حق امضا، بارگذاری مدارک و نسخه‌گذاری اسناد"""
        self.client.force_authenticate(user=self.superuser)

        # ۱. ایجاد عضو هیئت‌مدیره با مشخصات کامل و فایل‌های پیوست
        id_doc = SimpleUploadedFile('national_card.jpg', b'fake image data', content_type='image/jpeg')
        resp = self.client.post('/api/personnel/company-board-members/', {
            'company': self.company_a.id,
            'first_name': 'رضا',
            'last_name': 'پاینده',
            'national_code': '1234567890',
            'member_type': 'real',
            'role': 'chairman',
            'has_signature_right': True,
            'signature_scope': 'امضای کلیه اسناد تعهدآور و چک‌ها منفرداً',
            'term_start': '1403/01/01',
            'term_expiry': '1405/01/01',
            'attached_id_doc': id_doc
        }, format='multipart')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        member_id = resp.data['id']
        self.assertEqual(resp.data['role'], 'chairman')
        self.assertTrue(resp.data['has_signature_right'])
        self.assertIsNotNone(resp.data['attached_id_doc_url'])

        # ۲. بررسی قرارگیری در فیلد board_members سریالایزر شرکت
        resp_comp = self.client.get(f'/api/personnel/companies/{self.company_a.id}/')
        self.assertEqual(resp_comp.status_code, status.HTTP_200_OK)
        self.assertIn('board_members', resp_comp.data)
        self.assertEqual(len(resp_comp.data['board_members']), 1)
        self.assertEqual(resp_comp.data['board_members'][0]['id'], member_id)

        # ۳. ویرایش سمت عضو هیئت‌مدیره
        resp_update = self.client.patch(f'/api/personnel/company-board-members/{member_id}/', {
            'role': 'managing_director_and_member',
            'signature_scope': 'امضای مدیرعامل با مهر شرکت'
        })
        self.assertEqual(resp_update.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_update.data['role'], 'managing_director_and_member')

        # ۴. فیلتر کردن بر اساس company_id
        resp_list = self.client.get(f'/api/personnel/company-board-members/?company_id={self.company_a.id}')
        self.assertEqual(resp_list.status_code, status.HTTP_200_OK)
        members_a = resp_list.data['results'] if isinstance(resp_list.data, dict) and 'results' in resp_list.data else resp_list.data
        self.assertEqual(len(members_a), 1)

        # لیست شرکت B نباید عضو شرکت A را داشته باشد
        resp_list_b = self.client.get(f'/api/personnel/company-board-members/?company_id={self.company_b.id}')
        self.assertEqual(resp_list_b.status_code, status.HTTP_200_OK)
        members_b = resp_list_b.data['results'] if isinstance(resp_list_b.data, dict) and 'results' in resp_list_b.data else resp_list_b.data
        self.assertEqual(len(members_b), 0)

        # ۵. تست نسخه‌گذاری اسناد شرکت
        doc_file = SimpleUploadedFile('doc_v1.pdf', b'content v1', content_type='application/pdf')
        resp_doc = self.client.post('/api/personnel/company-documents/', {
            'company': self.company_a.id,
            'document_type': 'statute',
            'title': 'اساسنامه نسخه ۱',
            'version': 1,
            'file': doc_file
        }, format='multipart')
        self.assertEqual(resp_doc.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_doc.data['version'], 1)
        self.assertFalse(resp_doc.data['is_superseded'])

        # ۶. حذف عضو هیئت‌مدیره
        resp_del = self.client.delete(f'/api/personnel/company-board-members/{member_id}/')
        self.assertEqual(resp_del.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(CompanyBoardMember.objects.filter(id=member_id).count(), 0)



