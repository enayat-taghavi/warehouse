import os
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from personnel.models import (
    Company,
    CompanyGoogleDriveConfig,
    GoogleDriveSyncQueue,
    CompanyDocument,
    CompanyBoardMember,
    FinancialProject,
    ProjectSection,
    ExpenseInvoice,
    Counterparty,
    PersonnelProfile,
    PersonnelDocument,
    UserCompanyAccess,
    PettyCashTransaction,
    VehicleDriverProfile,
    VehicleDocument
)
from inventory.models import Item, ItemPhoto
from warehouses.models import Warehouse
from personnel.google_drive_service import (
    encrypt_secret,
    decrypt_secret,
    generate_company_auth_url,
    verify_oauth_state,
    _escape_gdrive_query_string
)
from personnel.google_drive_path_resolver import GoogleDrivePathResolver, sanitize_filename

User = get_user_model()


class GoogleDriveCoreTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='test_gdrive_admin', password='Password123!', is_staff=True)
        self.client.force_authenticate(user=self.user)

        self.company = Company.objects.create(
            code='COMP_GDRIVE_01',
            name='شرکت آزمایشی آوا',
            is_active=True
        )

    def test_token_encryption_and_decryption(self):
        """تست رمزنگاری و رمزگشایی امن توکن‌های گوگل"""
        token = "1//04test_refresh_token_very_secret_xyz123"
        encrypted = encrypt_secret(token)
        self.assertNotEqual(token, encrypted)
        decrypted = decrypt_secret(encrypted)
        self.assertEqual(token, decrypted)

    def test_sanitize_filename(self):
        """تست پاکسازی کاراکترهای غیرمجاز در نام‌گذاری فایل‌ها"""
        raw = "فاکتور/شماره: 1042 * تجهیزات? سایت|"
        clean = sanitize_filename(raw)
        for char in ['/', ':', '*', '?', '|']:
            self.assertNotIn(char, clean)
        self.assertIn("1042", clean)

    def test_oauth_state_generation_and_verification(self):
        """تست ایجاد امضای امن وضعیت OAuth و اعتبارسنجی آن"""
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client_id', GOOGLE_OAUTH_CLIENT_SECRET='test_secret'):
            url, state = generate_company_auth_url(self.company.id)
            self.assertIn("https://accounts.google.com/o/oauth2/auth", url)
            self.assertIn("test_client_id", url)

            # بررسی اعتبار State
            verified_id = verify_oauth_state(state)
            self.assertEqual(verified_id, self.company.id)

            # بررسی State دستکاری‌شده
            fake_state = f"{self.company.id}:invalid_sig"
            self.assertIsNone(verify_oauth_state(fake_state))

    def test_company_google_drive_config_api(self):
        """تست دریافت و تغییر تنظیمات گوگل‌درایو شرکت از طریق API"""
        url = f"/api/personnel/companies/{self.company.id}/gdrive/"
        
        # 1. GET
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['company_id'], self.company.id)
        self.assertFalse(res.data['is_connected'])

        # 2. PATCH
        patch_res = self.client.patch(url, {'is_enabled': True, 'sync_fleet_docs': False}, format='json')
        self.assertEqual(patch_res.status_code, 200)

        config = CompanyGoogleDriveConfig.objects.get(company=self.company)
        self.assertTrue(config.is_enabled)
        self.assertFalse(config.sync_fleet_docs)

    def test_path_resolver_for_company_document(self):
        """تست نگاشت هوشمند سلسله‌مراتب پوشه و نام‌گذاری معنادار فارسی"""
        doc = CompanyDocument.objects.create(
            company=self.company,
            title="صورتجلسه هیئت مدیره",
            document_type="board_resolution"
        )
        resolved = GoogleDrivePathResolver.resolve(doc, field_name='file')
        self.assertIsNotNone(resolved)
        comp, folder, fname = resolved

        self.assertEqual(comp.id, self.company.id)
        self.assertIn("سامانه حسابداری و اداری", folder)
        self.assertIn("صورتجلسه", fname)

    def test_signals_enqueue_upload_when_connected(self):
        """تست فعال‌بودن سیگنال خودکار ثبت در صف با ذخیره سند"""
        # فعال‌سازی گوگل‌درایو شرکت با توکن معتبر
        cfg = CompanyGoogleDriveConfig.objects.create(
            company=self.company,
            is_enabled=True,
            refresh_token=encrypt_secret("test_token"),
            account_email="company@gmail.com"
        )

        from django.core.files.uploadedfile import SimpleUploadedFile
        fake_file = SimpleUploadedFile("contract.pdf", b"test file content", content_type="application/pdf")

        with self.captureOnCommitCallbacks(execute=True):
            doc = CompanyDocument.objects.create(
                company=self.company,
                title="قرارداد همکاری",
                document_type="contract",
                file=fake_file
            )

        # بررسی اضافه شدن خودکار به صف پس از Commit
        task = GoogleDriveSyncQueue.objects.filter(
            company=self.company,
            model_name='CompanyDocument',
            object_id=doc.id
        ).first()

        self.assertIsNotNone(task)
        self.assertIn(task.status, ['pending', 'processing', 'failed'])
        self.assertEqual(task.action, 'upload')
        self.assertIn("قرارداد_همکاری", task.target_filename)

    def test_multi_tenant_isolation_queue(self):
        """تست عدم نشت داده میان شرکت‌ها و تفکیک کامل صف تسک‌ها"""
        other_company = Company.objects.create(
            code='COMP_OTHER_99',
            name='شرکت دیگر با مسئولیت محدود',
            is_active=True
        )

        task_a = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=1,
            source_file_path='a.pdf',
            target_folder_path='folderA',
            target_filename='fileA.pdf'
        )
        task_b = GoogleDriveSyncQueue.objects.create(
            company=other_company,
            model_name='CompanyDocument',
            object_id=2,
            source_file_path='b.pdf',
            target_folder_path='folderB',
            target_filename='fileB.pdf'
        )

        res_a = self.client.get(f"/api/personnel/companies/{self.company.id}/gdrive/queue/")
        self.assertEqual(res_a.status_code, 200)
        task_ids_a = [t['id'] for t in res_a.data['results']]
        self.assertIn(task_a.id, task_ids_a)
        self.assertNotIn(task_b.id, task_ids_a)

    def test_query_string_escaping(self):
        """تست پاکسازی کاراکترهای کوتیشن و بک‌اسلش برای کوئری گوگل‌درایو"""
        escaped = _escape_gdrive_query_string("شرکت 'پاینده' \\ تهران")
        self.assertEqual(escaped, "شرکت \\'پاینده\\' \\\\ تهران")

    def test_expense_invoice_path_resolution(self):
        """تست استخراج دقیق شرکت و پروژه از فاکتور هزینه بدون وابستگی به فالبک"""
        proj = FinancialProject.objects.create(
            company=self.company,
            code='PRJ_GDRIVE_01',
            name='پروژه آزادراه'
        )
        sec = ProjectSection.objects.create(
            project=proj,
            code='SEC_01',
            name='بخش خاکبرداری'
        )
        cp = Counterparty.objects.create(name='فروشگاه مصالح ساختمانی')
        inv = ExpenseInvoice.objects.create(
            section=sec,
            counterparty=cp,
            invoice_number='INV-8899',
            invoice_date_shamsi='1405/01/15',
            amount=50000000,
            category='مصالح',
            description='خرید شن و ماسه'
        )

        res = GoogleDrivePathResolver.resolve(inv, field_name='attachment')
        self.assertIsNotNone(res)
        resolved_company, folder, fname = res
        self.assertEqual(resolved_company.id, self.company.id)
        self.assertIn("پروژه_آزادراه", folder)
        self.assertIn("بخش_خاکبرداری", folder)
        self.assertIn("INV-8899", fname)

    def test_personnel_document_signal(self):
        """تست فعال‌بودن سیگنال مدارک پرسنلی PersonnelDocument"""
        CompanyGoogleDriveConfig.objects.create(
            company=self.company,
            is_enabled=True,
            refresh_token=encrypt_secret("test_token"),
            account_email="company@gmail.com"
        )

        pers_user = User.objects.create_user(username='pers_worker_99', password='Password123!')
        profile = PersonnelProfile.objects.create(
            user=pers_user,
            company=self.company,
            first_name='علی',
            last_name='رضایی',
            national_code='0012345678'
        )

        from django.core.files.uploadedfile import SimpleUploadedFile
        fake_id_file = SimpleUploadedFile("id_card.jpg", b"image bytes", content_type="image/jpeg")

        with self.captureOnCommitCallbacks(execute=True):
            pdoc = PersonnelDocument.objects.create(
                personnel=profile,
                doc_type='id_card',
                file=fake_id_file
            )

        task = GoogleDriveSyncQueue.objects.filter(
            company=self.company,
            model_name='PersonnelDocument',
            object_id=pdoc.id
        ).first()

        self.assertIsNotNone(task)
        self.assertIn(task.status, ['pending', 'processing', 'failed'])
        self.assertIn("مدارک پرسنلی", task.target_folder_path)

    def test_unauthorized_company_access(self):
        """تست رد دسترسی کاربران فاقد دسترسی سازمانی به درایو یک شرکت"""
        unauthorized_user = User.objects.create_user(username='intruder_user', password='Password123!')
        self.client.force_authenticate(user=unauthorized_user)

        res = self.client.get(f"/api/personnel/companies/{self.company.id}/gdrive/")
        self.assertEqual(res.status_code, 403)

    def test_queue_status_all_filter(self):
        """تست فیلتر status=all در صف تسک‌ها که تمام وضعیت‌ها را بدون فیلتر بازمی‌گرداند"""
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=1,
            source_file_path='test1.pdf',
            target_folder_path='f',
            target_filename='test1.pdf',
            status='pending'
        )
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=2,
            source_file_path='test2.pdf',
            target_folder_path='f',
            target_filename='test2.pdf',
            status='completed'
        )

        res_all = self.client.get(f"/api/personnel/companies/{self.company.id}/gdrive/queue/?status=all")
        self.assertEqual(res_all.status_code, 200)
        self.assertEqual(len(res_all.data['results']), 2)

        res_pending = self.client.get(f"/api/personnel/companies/{self.company.id}/gdrive/queue/?status=pending")
        self.assertEqual(res_pending.status_code, 200)
        self.assertEqual(len(res_pending.data['results']), 1)

    def test_sync_all_reopens_failed_tasks_and_backups(self):
        """تست همگام‌سازی کلی برای بازگشایی تسک‌های خطادار و افزودن فایل‌های پشتیبان"""
        CompanyGoogleDriveConfig.objects.create(
            company=self.company,
            is_enabled=True,
            refresh_token=encrypt_secret("test_token"),
            account_email="company@gmail.com",
            sync_backups=True,
            sync_accounting_docs=True
        )

        # ایجاد یک سند که قبلاً در صف با خطا متوقف شده است
        doc = CompanyDocument.objects.create(
            company=self.company,
            title="آیین نامه داخلی",
            document_type="other"
        )
        # اضافه کردن یک فایل ساختگی
        doc.file.name = "company_docs/bylaw.pdf"
        doc.save()

        # تسک خطادار قبلی
        failed_task = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=doc.id,
            source_file_path=doc.file.name,
            target_folder_path='old_folder',
            target_filename='old_bylaw.pdf',
            status='failed',
            retry_count=3,
            error_message='Timeout connecting to Google'
        )

        res = self.client.post(f"/api/personnel/companies/{self.company.id}/gdrive/sync-all/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])
        self.assertGreaterEqual(res.data['enqueued_count'], 1)

        # بررسی بازنشانی وضعیت تسک خطادار به pending
        failed_task.refresh_from_db()
        self.assertEqual(failed_task.status, 'pending')
        self.assertEqual(failed_task.retry_count, 0)
        self.assertIsNone(failed_task.error_message)

    def test_sync_mode_and_schedule_settings_api(self):
        """تست واکشی و به‌روزرسانی سیاست‌های زمان‌بندی و کنترل پهنای باند از طریق API"""
        url = f"/api/personnel/companies/{self.company.id}/gdrive/"

        # 1. واکشی تنظیمات اولیه با مقادیر پیش‌فرض
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['sync_mode'], 'immediate')
        self.assertEqual(res.data['scheduled_start_time'], '23:00')
        self.assertEqual(res.data['scheduled_end_time'], '06:00')
        self.assertEqual(res.data['chunk_delay_seconds'], 1)

        # 2. به‌روزرسانی موفق تنظیمات زمان‌بندی
        patch_payload = {
            'sync_mode': 'scheduled',
            'scheduled_start_time': '01:30',
            'scheduled_end_time': '05:45',
            'chunk_delay_seconds': 3
        }
        res_patch = self.client.patch(url, patch_payload, format='json')
        self.assertEqual(res_patch.status_code, 200)

        cfg = CompanyGoogleDriveConfig.objects.get(company=self.company)
        self.assertEqual(cfg.sync_mode, 'scheduled')
        self.assertEqual(cfg.scheduled_start_time.strftime('%H:%M'), '01:30')
        self.assertEqual(cfg.scheduled_end_time.strftime('%H:%M'), '05:45')
        self.assertEqual(cfg.chunk_delay_seconds, 3)

        # 3. خطای اعتبارسنجی مقدار نامعتبر sync_mode
        bad_mode_res = self.client.patch(url, {'sync_mode': 'unsupported_mode'}, format='json')
        self.assertEqual(bad_mode_res.status_code, 400)
        self.assertIn("حالت همگام‌سازی نامعتبر", bad_mode_res.data['error'])

    def test_signal_skips_immediate_thread_in_scheduled_mode(self):
        """تست ثبت در صف با وضعیت pending بدون راه‌اندازی نخ در حالت زمان‌بندی یا دستی"""
        cfg = CompanyGoogleDriveConfig.objects.create(
            company=self.company,
            is_enabled=True,
            refresh_token=encrypt_secret("test_token"),
            account_email="company@gmail.com",
            sync_mode='scheduled'
        )

        from django.core.files.uploadedfile import SimpleUploadedFile
        fake_file = SimpleUploadedFile("policy.pdf", b"pdf content", content_type="application/pdf")

        with self.captureOnCommitCallbacks(execute=True):
            doc = CompanyDocument.objects.create(
                company=self.company,
                title="سند خط‌مشی محرمانه",
                document_type="other",
                file=fake_file
            )

        task = GoogleDriveSyncQueue.objects.filter(
            company=self.company,
            model_name='CompanyDocument',
            object_id=doc.id
        ).first()

        self.assertIsNotNone(task)
        # در حالت زمان‌بندی، تسک بلافاصله در وضعیت pending باقی می‌ماند و نباید thread همزمان اجرا شود
        self.assertEqual(task.status, 'pending')

    def test_worker_schedule_time_window_and_midnight_crossing(self):
        """تست تطبیق بازه زمانی ساعات خلوتی و پشتیبانی کامل از عبور از نیمه‌شب"""
        from datetime import time as dt_time
        from personnel.management.commands.run_gdrive_sync_worker import is_time_in_range

        start = dt_time(23, 0)
        end = dt_time(6, 0)

        # ساعت ۲۳:۳۰ شب در بازه خلوتی است
        self.assertTrue(is_time_in_range(start, end, dt_time(23, 30)))
        # ساعت ۰۲:۰۰ بامداد در بازه خلوتی است
        self.assertTrue(is_time_in_range(start, end, dt_time(2, 0)))
        # ساعت ۰۶:۰۰ بامداد مرز بازه خلوتی است
        self.assertTrue(is_time_in_range(start, end, dt_time(6, 0)))
        # ساعت ۱۴:۰۰ ظهر در ساعات اداری و خارج از بازه است
        self.assertFalse(is_time_in_range(start, end, dt_time(14, 0)))

        # تست بازه درون یک روز عادی (مثلاً ۰۱:۰۰ تا ۰۵:۰۰)
        day_start = dt_time(1, 0)
        day_end = dt_time(5, 0)
        self.assertTrue(is_time_in_range(day_start, day_end, dt_time(3, 30)))
        self.assertFalse(is_time_in_range(day_start, day_end, dt_time(12, 0)))

    def test_trigger_sync_endpoint(self):
        """تست اندپوینت فراخوانی فوری ارسال صف‌های معلق خارج از نوبت"""
        CompanyGoogleDriveConfig.objects.create(
            company=self.company,
            is_enabled=True,
            refresh_token=encrypt_secret("test_token"),
            account_email="company@gmail.com",
            sync_mode='manual'
        )

        # ایجاد یک تسک معلق
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=999,
            source_file_path='test.pdf',
            target_folder_path='f',
            target_filename='test.pdf',
            status='pending'
        )

        res = self.client.post(f"/api/personnel/companies/{self.company.id}/gdrive/trigger-sync/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])
        self.assertEqual(res.data['pending_count'], 1)

    def test_company_board_member_resolution_and_full_name(self):
        """تست ویژگی full_name در اعضای هیئت‌مدیره و تفکیک پوشه‌ها و نام‌گذاری مدارک آن‌ها"""
        member = CompanyBoardMember.objects.create(
            company=self.company,
            first_name='سارا',
            last_name='محمدی',
            national_code='0012345678',
            role='managing_director'
        )
        self.assertEqual(member.full_name, 'سارا محمدی')

        # تست Resolver برای تصویر کارت ملی / شناسنامه
        res_id = GoogleDrivePathResolver.resolve(member, field_name='attached_id_doc', orig_name='card.jpg')
        self.assertIsNotNone(res_id)
        comp, folder, fname = res_id
        self.assertEqual(comp.id, self.company.id)
        self.assertIn("ارکان_و_هیئت_مدیره/سارا_محمدی", folder)
        self.assertIn("کارت_ملی_شناسنامه_سارا_محمدی.jpg", fname)

        # تست Resolver برای حکم انتصاب
        res_app = GoogleDrivePathResolver.resolve(member, field_name='attached_appointment_doc', orig_name='hokm.pdf')
        self.assertIsNotNone(res_app)
        _, _, fname_app = res_app
        self.assertIn("حکم_انتصاب_سارا_محمدی.pdf", fname_app)

    def test_petty_cash_transaction_resolution(self):
        """تست نگاشت مسیر رسید تنخواه با شماره رسید، تاریخ شمسی و عنوان"""
        proj = FinancialProject.objects.create(
            company=self.company,
            code='PRJ_GDRIVE_PETTY',
            name='پروژه بیمارستان'
        )
        sec = ProjectSection.objects.create(
            project=proj,
            code='SEC_PETTY',
            name='تاسیسات برق'
        )
        tx = PettyCashTransaction.objects.create(
            section=sec,
            custodian=self.user,
            transaction_type='expense',
            amount=15000000,
            transaction_date_shamsi='1405/03/20',
            title='خرید کابل برق نسوز',
            receipt_number='REC-9988'
        )
        res = GoogleDrivePathResolver.resolve(tx, field_name='attachment', orig_name='cable_factor.png')
        self.assertIsNotNone(res)
        comp, folder, fname = res
        self.assertEqual(comp.id, self.company.id)
        self.assertIn("پروژه_بیمارستان/تاسیسات_برق/رسیدهای_تنخواه/1405", folder)
        self.assertIn("1405-03-20_رسید_تنخواه_REC-9988_خرید_کابل_برق_نسوز.png", fname)

    def test_vehicle_document_resolution(self):
        """تست نگاشت مسیر مدارک خودرو با استفاده از عنوان مدرک و get_doc_type_display"""
        vprofile = VehicleDriverProfile.objects.create(
            company=self.company,
            plate_number='12-ب-345-ایران-77',
            driver_name='احمد کریمی'
        )
        vdoc = VehicleDocument.objects.create(
            vehicle=vprofile,
            doc_type='insurance',
            title='بیمه‌نامه ثالث دانا',
            issue_date='1405/02/01'
        )
        res = GoogleDrivePathResolver.resolve(vdoc, field_name='file', orig_name='bimeh.pdf')
        self.assertIsNotNone(res)
        comp, folder, fname = res
        self.assertEqual(comp.id, self.company.id)
        self.assertIn("ناوگان و خودروها/12-ب-345-ایران-77", folder)
        self.assertIn(f"1405-02-01_بیمه‌نامه_ثالث_دانا_12-ب-345-ایران-77_{vdoc.id}.pdf", fname)
        self.assertTrue(fname.endswith('.pdf'))

    def test_item_photo_resolution(self):
        """تست نگاشت تصاویر کالای انبار با استفاده از fa_unic_code و description"""
        wh = Warehouse.objects.create(
            name='انبار تجهیزات جنوب',
            company=self.company
        )
        item = Item.objects.create(
            warehouse=wh,
            fa_unic_code='UNIQ-7788',
            description='شیرفلکه صنعتی فولادی'
        )
        photo = ItemPhoto.objects.create(
            item=item
        )
        res = GoogleDrivePathResolver.resolve(photo, field_name='image', orig_name='valve.webp')
        self.assertIsNotNone(res)
        comp, folder, fname = res
        self.assertEqual(comp.id, self.company.id)
        self.assertIn("سامانه انبارداری/انبار_تجهیزات_جنوب/تصاویر کالاها/UNIQ-7788_شیرفلکه_صنعتی_فولادی", folder)
        self.assertIn("عکس_کالا_کدUNIQ-7788", fname)
        self.assertTrue(fname.endswith('.webp'))



