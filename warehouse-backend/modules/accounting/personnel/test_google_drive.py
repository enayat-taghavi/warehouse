import os
from companies.testing import grant_membership
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
from personnel.google_drive_service import (
    encrypt_secret,
    decrypt_secret,
    generate_company_auth_url,
    verify_oauth_state,
    _escape_gdrive_query_string
)
from personnel.google_drive_path_resolver import GoogleDrivePathResolver, sanitize_filename
from django.apps import apps

# انبار از راه رجیستری اپ‌ها، بی import مستقیم ماژول انبار (حصار ماژول)
Warehouse = apps.get_model('warehouses', 'Warehouse') if apps.is_installed('warehouses') else None
Item = apps.get_model('inventory', 'Item') if apps.is_installed('inventory') else None
ItemPhoto = apps.get_model('inventory', 'ItemPhoto') if apps.is_installed('inventory') else None

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
        UserCompanyAccess.objects.create(
            user=self.user,
            company=self.company,
            section_levels={'gdrive': 'write', 'docs_archive': 'write'},
            is_default=True
        )
        grant_membership(self.user, self.company)

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
        """تست ایجاد امضای امن وضعیت OAuth و اعتبارسنجی یک‌بارمصرف آن (GD-02)"""
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client_id', GOOGLE_OAUTH_CLIENT_SECRET='test_secret'):
            url, state = generate_company_auth_url(self.company.id, user=self.user, mode='popup')
            self.assertIn("https://accounts.google.com/o/oauth2/auth", url)
            self.assertIn("test_client_id", url)

            # بررسی اعتبار State و مصرف اتمیک
            verified_id = verify_oauth_state(state)
            self.assertEqual(verified_id, self.company.id)

            # تلاش برای مصرف دوباره باید ناموفق باشد (یک‌بارمصرف)
            self.assertIsNone(verify_oauth_state(state))

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
        self.assertEqual(res.status_code, 202)
        self.assertTrue(res.data['success'])
        self.assertIn('task_id', res.data)

        # اجرای تسک پیمایش توسط ورکر / سرویس (GD-10)
        from personnel.google_drive_service import execute_company_scan_all
        scan_task = GoogleDriveSyncQueue.objects.get(id=res.data['task_id'])
        ok = execute_company_scan_all(scan_task)
        self.assertTrue(ok)

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
        self.assertEqual(res.status_code, 202)
        self.assertTrue(res.data['success'])
        self.assertEqual(res.data['pending_count'], 1)

        cfg = CompanyGoogleDriveConfig.objects.get(company=self.company)
        self.assertIsNotNone(cfg.force_sync_until)

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
        self.assertIn(f"کارت_ملی_شناسنامه_سارا_محمدی_{member.id}.jpg", fname)

        # تست Resolver برای حکم انتصاب
        res_app = GoogleDrivePathResolver.resolve(member, field_name='attached_appointment_doc', orig_name='hokm.pdf')
        self.assertIsNotNone(res_app)
        _, _, fname_app = res_app
        self.assertIn(f"حکم_انتصاب_سارا_محمدی_{member.id}.pdf", fname_app)

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
        self.assertIn(f"1405-03-20_رسید_تنخواه_REC-9988_{tx.id}_خرید_کابل_برق_نسوز.png", fname)

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

    def test_sync_backups_restricted_to_superuser(self):
        """تست محدودسازی تغییر تنظیمات پشتیبان پایگاه داده به سوپریوزر (GD-01)"""
        url = f"/api/personnel/companies/{self.company.id}/gdrive/"

        # کاربر غیر سوپریوزر (حتی با دسترسی workspace_full) باید ۴۰۳ بگیرد
        res = self.client.patch(url, {'sync_backups': True}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertIn("مدیر ارشد سامانه", res.data['error'])

        # سوپریوزر باید بتواند این گزینه را تغییر دهد
        super_user = User.objects.create_superuser(username='test_superuser', password='Password123!')
        self.client.force_authenticate(user=super_user)

        res_super = self.client.patch(url, {'sync_backups': True}, format='json')
        self.assertEqual(res_super.status_code, 200)

        cfg = CompanyGoogleDriveConfig.objects.get(company=self.company)
        self.assertTrue(cfg.sync_backups)

    def test_oauth_state_concurrent_and_single_use(self):
        """تست اعتبارسنجی همزمان و مصرف اتمیک state و ابطال stateهای باز قبلی (GD-02)"""
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client_id', GOOGLE_OAUTH_CLIENT_SECRET='test_secret'):
            _, state1 = generate_company_auth_url(self.company.id, user=self.user, mode='popup')
            _, state2 = generate_company_auth_url(self.company.id, user=self.user, mode='popup')

            from django.core import signing
            from settings_core.models import GoogleOAuthState
            from settings_core.google_drive_client import (
                verify_and_consume_oauth_state as core_consume,
                invalidate_other_oauth_states,
            )
            nonce1 = signing.loads(state1, salt='gdrive-oauth')['n']

            # مصرف state2
            payload2 = core_consume(state2)
            self.assertEqual(payload2['c'], self.company.id)

            # حال state2 دیگر نباید قابل مصرف باشد
            self.assertIsNone(verify_oauth_state(state2))

            # مصرف یک state (پیش از موفقیت اتصال) state دیگر را باطل نمی‌کند
            self.assertIsNone(GoogleOAuthState.objects.get(nonce=nonce1).used_at)

            # پس از اتصال موفق همان مقصد، state1 باطل می‌شود
            invalidate_other_oauth_states(payload2)
            self.assertIsNone(verify_oauth_state(state1))

    def test_callback_xss_protection(self):
        """تست پیشگیری از XSS بازتابی در کال‌بک OAuth گوگل (GD-03)"""
        client = APIClient()
        xss_payload = '<script>alert("pwned")</script>'
        res = client.get('/api/accounts/gdrive/callback/', {'error': xss_payload})
        self.assertEqual(res.status_code, 400)
        content = res.content.decode('utf-8')
        # نباید تگ خام اسکریپت رندر شده باشد
        self.assertNotIn('<script>alert("pwned")</script>', content)
        # بلکه باید پیام عمومی امن نمایش داده شود
        self.assertIn("اتصال توسط کاربر لغو شد", content)

    def test_callback_redirect_mode(self):
        """تست بازگشت در حالت ریدایرکت برای پنجره‌های مسدودشده (GD-03 / D5)"""
        client = APIClient()
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client_id', GOOGLE_OAUTH_CLIENT_SECRET='test_secret'):
            _, state = generate_company_auth_url(self.company.id, user=self.user, mode='redirect')
            res = client.get('/api/accounts/gdrive/callback/', {'error': 'access_denied', 'state': state})
            content = res.content.decode('utf-8')
            self.assertIn(f"/app/operations/companies/{self.company.id}?tab=gdrive&gdrive=error", content)

    def test_path_resolver_skips_unassociated_records(self):
        """تست عدم ارسال رکوردهای فاقد شرکت به شرکت‌های دیگر (GD-04)"""
        invoice = ExpenseInvoice(
            invoice_number='INV-NO-COMP-999',
            amount=500000
        )
        resolved = GoogleDrivePathResolver.resolve(invoice, field_name='file')
        self.assertIsNone(resolved)

    def test_staff_without_workspace_full_rejected(self):
        """تست رد دسترسی کاربران staff بدون سطح workspace_full به تغییر تنظیمات (GD-05)"""
        staff_user = User.objects.create_user(username='plain_staff', password='Password123!', is_staff=True)
        # انتساب صرفاً با دسترسی docs_read
        UserCompanyAccess.objects.create(
            user=staff_user,
            company=self.company,
            section_levels={'docs_archive': 'read'}
        )
        self.client.force_authenticate(user=staff_user)

        # تلاش برای دریافت auth-url باید ۴۰۳ بدهد
        res_auth = self.client.get(f"/api/personnel/companies/{self.company.id}/gdrive/auth-url/")
        self.assertEqual(res_auth.status_code, 403)

        # تلاش برای تغییر تنظیمات باید ۴۰۳ بدهد
        res_patch = self.client.patch(f"/api/personnel/companies/{self.company.id}/gdrive/", {'is_enabled': True}, format='json')
        self.assertEqual(res_patch.status_code, 403)

    def test_retry_endpoint_rejects_non_failed_tasks(self):
        """تست رد درخواست تلاش مجدد برای تسک‌های غیر failed و پذیرش ۲02 برای تسک failed (GD-09)"""
        pending_task = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=1,
            source_file_path='test.pdf',
            target_folder_path='f',
            target_filename='test.pdf',
            status='pending'
        )
        url_pending = f"/api/personnel/companies/{self.company.id}/gdrive/tasks/{pending_task.id}/retry/"
        res_bad = self.client.post(url_pending)
        self.assertEqual(res_bad.status_code, 400)
        self.assertIn("failed", res_bad.data['error'])

        # حال تغییر وضعیت به failed و ارسال درخواست
        pending_task.status = 'failed'
        pending_task.error_message = 'Network Error'
        pending_task.save()

        res_ok = self.client.post(url_pending)
        self.assertEqual(res_ok.status_code, 202)
        self.assertTrue(res_ok.data['success'])

        pending_task.refresh_from_db()
        self.assertEqual(pending_task.status, 'pending')
        self.assertIsNone(pending_task.next_retry_at)

    def test_disconnect_endpoint_revokes_token_and_sets_unlinked(self):
        """تست ابطال توکن گوگل در هنگام قطع اتصال و تغییر وضعیت به unlinked (GD-11)"""
        from unittest.mock import patch
        cfg, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=self.company)
        cfg.refresh_token = encrypt_secret("test_refresh_token_to_revoke")
        cfg.account_email = "test@gmail.com"
        cfg.auth_status = "ok"
        cfg.save()

        with patch('settings_core.google_drive_client.revoke_google_token') as mock_revoke:
            mock_revoke.return_value = True
            res = self.client.post(f"/api/personnel/companies/{self.company.id}/gdrive/disconnect/")
            self.assertEqual(res.status_code, 200)
            mock_revoke.assert_called_once_with("test_refresh_token_to_revoke")

        cfg.refresh_from_db()
        self.assertIsNone(cfg.refresh_token)
        self.assertIsNone(cfg.account_email)
        self.assertEqual(cfg.auth_status, 'unlinked')

    def test_classify_gdrive_error(self):
        """تست دسته‌بندی پیشرفته خطاهای گوگل‌درایو بر اساس کد و reason (GD-08)"""
        from googleapiclient.errors import HttpError
        import httplib2
        from settings_core.google_drive_client import classify_gdrive_error

        # 1. 403 Rate Limit Exceeded -> Transient backoff
        resp_403_rate = httplib2.Response({'status': 403})
        content_403_rate = b'{"error": {"errors": [{"reason": "rateLimitExceeded"}], "code": 403, "message": "User Rate Limit Exceeded"}}'
        err_rate = HttpError(resp_403_rate, content_403_rate)
        info_rate = classify_gdrive_error(err_rate)
        self.assertEqual(info_rate['category'], 'transient')
        self.assertEqual(info_rate['reason'], 'rateLimitExceeded')

        # 2. 403 Storage Quota Exceeded -> Permanent Failed
        content_403_quota = b'{"error": {"errors": [{"reason": "storageQuotaExceeded"}], "code": 403, "message": "Storage Quota Exceeded"}}'
        err_quota = HttpError(resp_403_rate, content_403_quota)
        info_quota = classify_gdrive_error(err_quota)
        self.assertEqual(info_quota['category'], 'permanent')
        self.assertEqual(info_quota['reason'], 'storageQuotaExceeded')

        # 3. 401 Invalid Credentials -> needs_reauth
        resp_401 = httplib2.Response({'status': 401})
        err_401 = HttpError(resp_401, b'{"error": "invalid_grant"}')
        info_auth = classify_gdrive_error(err_401)
        self.assertEqual(info_auth['category'], 'needs_reauth')

    def test_worker_queue_priority_and_ordering(self):
        """تست اولویت صف ورکر: پشتیبان دیتابیس (۱) > فایل جاری (۱۰) > اسکن سراسری (۵۰) (GD-10)"""
        # تسک پیمایش سراسری ابتدا ساخته می‌شود
        task_scan = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='Company',
            object_id=self.company.id,
            action='scan_all',
            status='pending',
            priority=50
        )
        # سپس تسک آپلود جاری
        task_normal = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=10,
            status='pending',
            priority=10
        )
        # سپس تسک پشتیبان دیتابیس
        task_backup = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='DatabaseBackup',
            object_id=None,
            status='pending',
            priority=1
        )

        ordered_tasks = list(GoogleDriveSyncQueue.objects.filter(company=self.company).order_by('priority', 'created_at'))
        self.assertEqual(ordered_tasks[0].id, task_backup.id)
        self.assertEqual(ordered_tasks[1].id, task_normal.id)
        self.assertEqual(ordered_tasks[2].id, task_scan.id)

    def test_checksum_mismatch_marks_task_failed(self):
        """تست تشخیص عدم تطابق هش MD5 و علامت‌گذاری تسک با وضعیت failed و کد CHECKSUM_MISMATCH (GD-14)"""
        import tempfile
        from unittest.mock import patch, MagicMock

        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(b"Hello Google Drive Integrity Test")
            tmp_path = tmp.name

        try:
            config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=self.company)
            config.refresh_token = 'enc_token_123'
            config.is_enabled = True
            config.account_email = 'test@gmail.com'
            config.save()

            task = GoogleDriveSyncQueue.objects.create(
                company=self.company,
                model_name='CompanyDocument',
                object_id=99,
                field_name='file',
                drive_account=config.account_email,
                source_file_path=tmp_path,
                target_folder_path='اسناد',
                target_filename='test_checksum.pdf',
                status='pending',
                action='upload',
                priority=10
            )

            mock_service = MagicMock()
            mock_files = MagicMock()
            mock_service.files.return_value = mock_files

            # بازگرداندن چک‌سام نادرست از گوگل
            mock_req = MagicMock()
            mock_req.next_chunk.return_value = (None, {'id': 'drv_file_123', 'md5Checksum': 'bad_fake_md5_hash'})
            mock_files.create.return_value = mock_req

            with patch('personnel.google_drive_service.get_google_drive_service', return_value=mock_service), \
                 patch('personnel.google_drive_service.ensure_company_drive_folders', return_value=('root_id', 'arch_id')), \
                 patch('personnel.google_drive_service.resolve_folder_hierarchy', return_value='folder_id'):
                from personnel.google_drive_service import sync_single_queue_item
                res = sync_single_queue_item(task.id)
                self.assertFalse(res)

            task.refresh_from_db()
            self.assertEqual(task.status, 'failed')
            self.assertEqual(task.error_code, 'CHECKSUM_MISMATCH')
            self.assertIn('عدم تطابق هش فایل', task.error_message)
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except (PermissionError, OSError):
                pass

    def test_replaced_file_triggers_archive_delete(self):
        """تست انتقال نسخه قبلی فایل جایگزین‌شده به پوشه بایگانی (GD-13)"""
        from unittest.mock import MagicMock
        from personnel.signals_gdrive import enqueue_file_upload

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=self.company)
        config.refresh_token = 'enc_token_123'
        config.is_enabled = True
        config.account_email = 'test@gmail.com'
        config.save()

        doc = CompanyDocument.objects.create(
            company=self.company,
            title='اساسنامه نگارش اول',
            document_type='other'
        )

        file_old = MagicMock()
        file_old.name = 'docs/v1.pdf'

        # تسک موفق قبلی برای نگارش اول
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=doc.id,
            field_name='file',
            drive_account=config.account_email,
            source_file_path=file_old.name,
            target_folder_path='اسناد',
            target_filename='v1.pdf',
            gdrive_file_id='gdrive_v1_id',
            action='upload',
            status='completed'
        )

        file_new = MagicMock()
        file_new.name = 'docs/v2.pdf'

        # بارگذاری نگارش دوم (فایل جایگزین)
        with self.captureOnCommitCallbacks(execute=True):
            enqueue_file_upload(doc, 'file', file_new)

        # باید تسک archive_delete برای فایل قدیمی در صف ثبت شده باشد
        arch_task = GoogleDriveSyncQueue.objects.filter(
            company=self.company,
            gdrive_file_id='gdrive_v1_id',
            action='archive_delete'
        ).first()
        self.assertIsNotNone(arch_task)
        self.assertEqual(arch_task.status, 'pending')
        self.assertEqual(arch_task.field_name, 'file')

        # و تسک جدید آپلود برای نگارش ۲
        upload_task = GoogleDriveSyncQueue.objects.filter(
            company=self.company,
            source_file_path=file_new.name,
            action='upload'
        ).first()
        self.assertIsNotNone(upload_task)
        self.assertEqual(upload_task.status, 'pending')
        self.assertEqual(upload_task.field_name, 'file')

    def test_delete_instance_archives_per_field(self):
        """تست بایگانی مستقل مدارک چندفیلدی (مانند عضو هیئت‌مدیره) بر اساس field_name (GD-13)"""
        from unittest.mock import MagicMock
        from personnel.signals_gdrive import enqueue_file_archive_delete

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=self.company)
        config.refresh_token = 'enc_token_123'
        config.is_enabled = True
        config.account_email = 'test@gmail.com'
        config.save()

        member = CompanyBoardMember.objects.create(
            company=self.company,
            first_name='حمید',
            last_name='رضایی'
        )

        # تسک موفق کارت ملی
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyBoardMember',
            object_id=member.id,
            field_name='attached_id_doc',
            drive_account=config.account_email,
            source_file_path='id_card.jpg',
            target_folder_path='ارکان',
            target_filename='id_card.jpg',
            gdrive_file_id='gdrive_id_card_1',
            action='upload',
            status='completed'
        )
        # تسک موفق حکم انتصاب
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyBoardMember',
            object_id=member.id,
            field_name='attached_appointment_doc',
            drive_account=config.account_email,
            source_file_path='appointment.pdf',
            target_folder_path='ارکان',
            target_filename='appointment.pdf',
            gdrive_file_id='gdrive_app_doc_2',
            action='upload',
            status='completed'
        )

        file1 = MagicMock()
        file1.name = 'id_card.jpg'
        file2 = MagicMock()
        file2.name = 'appointment.pdf'

        with self.captureOnCommitCallbacks(execute=True):
            enqueue_file_archive_delete(member, 'attached_id_doc', file1)
            enqueue_file_archive_delete(member, 'attached_appointment_doc', file2)

        arch_tasks = GoogleDriveSyncQueue.objects.filter(
            company=self.company,
            model_name='CompanyBoardMember',
            object_id=member.id,
            action='archive_delete'
        )
        self.assertEqual(arch_tasks.count(), 2)
        fields = set(arch_tasks.values_list('field_name', flat=True))
        self.assertEqual(fields, {'attached_id_doc', 'attached_appointment_doc'})

    def test_folder_cache_invalidation_and_root_archive_cache(self):
        """تست کش پوشه‌ها و ابطال ایمن آن در صورت تغییر یا خطای 404 (GD-15)"""
        from personnel.google_drive_service import (
            _FOLDER_CACHE,
            _ROOT_ARCHIVE_CACHE,
            invalidate_folder_cache
        )

        # پر کردن آزمایشی کش
        _FOLDER_CACHE[(self.company.id, 'parent1', 'folder1')] = 'f_id_1'
        _FOLDER_CACHE[(999, 'parent2', 'folder2')] = 'f_id_2'
        _ROOT_ARCHIVE_CACHE[self.company.id] = ('root1', 'arch1', 123456789.0)

        # ابطال کش برای همین شرکت
        invalidate_folder_cache(self.company.id)
        self.assertNotIn((self.company.id, 'parent1', 'folder1'), _FOLDER_CACHE)
        self.assertIn((999, 'parent2', 'folder2'), _FOLDER_CACHE)
        self.assertNotIn(self.company.id, _ROOT_ARCHIVE_CACHE)

        # ابطال سراسری
        invalidate_folder_cache(None)
        self.assertEqual(len(_FOLDER_CACHE), 0)
        self.assertEqual(len(_ROOT_ARCHIVE_CACHE), 0)

    def test_get_config_does_not_create_database_record(self):
        """تست عدم ساخت رکورد در پایگاه داده هنگام درخواست GET تنظیمات (GD-19)"""
        comp_new = Company.objects.create(name="شرکت جدید بدون درایو", code="NEWCO")
        UserCompanyAccess.objects.create(
            user=self.user,
            company=comp_new,
            section_levels={'gdrive': 'read'}
        )
        grant_membership(self.user, comp_new)
        # اطمینان از نبود کانفیگ
        CompanyGoogleDriveConfig.objects.filter(company=comp_new).delete()

        res = self.client.get(f"/api/personnel/companies/{comp_new.id}/gdrive/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['is_connected'])
        self.assertFalse(res.data['is_enabled'])
        self.assertEqual(res.data['auth_status'], 'unlinked')
        self.assertEqual(res.data['other_accounts_count'], 0)

        # بررسی قطعی عدم درج رکورد در دیتابیس
        exists = CompanyGoogleDriveConfig.objects.filter(company=comp_new).exists()
        self.assertFalse(exists)

    def test_queue_api_limit_and_status_validation(self):
        """تست اعتبارسنجی پارامترهای limit و status در اندپوینت صف (GD-19)"""
        url = f"/api/personnel/companies/{self.company.id}/gdrive/queue/"

        # 1. limit نامعتبر (متنی)
        res_text = self.client.get(f"{url}?limit=not_a_number")
        self.assertEqual(res_text.status_code, 400)
        self.assertIn("error", res_text.data)

        # 2. limit کمتر از ۱
        res_zero = self.client.get(f"{url}?limit=0")
        self.assertEqual(res_zero.status_code, 400)

        # 3. limit بیشتر از ۱۰۰
        res_huge = self.client.get(f"{url}?limit=150")
        self.assertEqual(res_huge.status_code, 400)

        # 4. status نامعتبر
        res_bad_status = self.client.get(f"{url}?status=unknown_status")
        self.assertEqual(res_bad_status.status_code, 400)

        # 5. مقادیر معتبر
        res_ok = self.client.get(f"{url}?status=pending&limit=20")
        self.assertEqual(res_ok.status_code, 200)
        self.assertIn("results", res_ok.data)

    def test_other_accounts_count_calculation(self):
        """تست محاسبه تعداد اسناد متعلق به سایر حساب‌های متصل پیشین (GD-31 / D8)"""
        url = f"/api/personnel/companies/{self.company.id}/gdrive/"

        # حساب جاری
        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=self.company)
        config.account_email = "primary@company.ir"
        config.save(update_fields=['account_email'])

        # سند ۱ در حساب قدیمی bob تکمیل شده
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=1,
            field_name='file',
            drive_account='old_bob@gmail.com',
            target_filename='doc1.pdf',
            status='completed'
        )
        # سند ۲ نیز در حساب قدیمی bob تکمیل شده
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=2,
            field_name='file',
            drive_account='old_bob@gmail.com',
            target_filename='doc2.pdf',
            status='completed'
        )
        # سند ۱ در حساب جاری primary هم تکمیل شده است
        GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='CompanyDocument',
            object_id=1,
            field_name='file',
            drive_account='primary@company.ir',
            target_filename='doc1.pdf',
            status='completed'
        )

        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        # فقط سند ۲ است که در حساب دیگری هست و در حساب جاری نیست
        self.assertEqual(res.data['other_accounts_count'], 1)

    def test_config_reports_worker_alive_from_fresh_heartbeat(self):
        """ضربان تازهٔ ورکر در تب شرکت «ورکر فعال» دیده شود (بازبینی اجرای طرح)"""
        from django.utils import timezone
        from settings_core.models import SystemGoogleDriveConfig
        SystemGoogleDriveConfig.get_solo()
        SystemGoogleDriveConfig.objects.filter(id=1).update(worker_heartbeat_at=timezone.now())
        res = self.client.get(f'/api/personnel/companies/{self.company.id}/gdrive/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['worker_alive'])

    def test_callback_access_checker_resolves_company_and_requires_full_access(self):
        """بررسی‌کنندهٔ دسترسی callback با شناسهٔ شرکت کار کند و docs_write کافی نباشد (D3)"""
        from settings_core.google_drive_client import get_gdrive_target_handler
        checker = get_gdrive_target_handler('company')['access_checker']
        self.assertTrue(checker(self.user, company_id=self.company.id))

        reader = User.objects.create_user(username='gdrive_docs_writer', password='Password123!')
        UserCompanyAccess.objects.create(user=reader, company=self.company, section_levels={'docs_archive': 'write'})
        self.assertFalse(checker(reader, company_id=self.company.id))

        self.company.is_active = False
        self.company.save(update_fields=['is_active'])
        self.assertFalse(checker(self.user, company_id=self.company.id))

    def test_transient_error_never_marks_task_failed(self):
        """خطای گذرا پس از چند بار تکرار هم failed نشود و دوباره زمان‌بندی شود (GD-08)"""
        import socket
        from unittest.mock import patch
        from personnel.google_drive_service import sync_single_queue_item
        CompanyGoogleDriveConfig.objects.create(
            company=self.company, is_enabled=True,
            refresh_token=encrypt_secret('tok'), account_email='a@b.ir'
        )
        task = GoogleDriveSyncQueue.objects.create(
            company=self.company, model_name='CompanyDocument', object_id=1, field_name='file',
            source_file_path='x.pdf', target_folder_path='f', target_filename='x.pdf',
            status='pending', retry_count=9
        )
        with patch('personnel.google_drive_service.get_google_drive_service', return_value=object()), \
             patch('personnel.google_drive_service.ensure_company_drive_folders', side_effect=socket.timeout('timed out')):
            self.assertFalse(sync_single_queue_item(task.id))
        task.refresh_from_db()
        self.assertEqual(task.status, 'pending')
        self.assertEqual(task.retry_count, 10)
        self.assertIsNotNone(task.next_retry_at)

    def test_worker_skips_company_that_needs_reauth(self):
        """ورکر تسک‌های شرکت needs_reauth را برندارد تا حلقهٔ داغ ساخته نشود (GD-11)"""
        from personnel.management.commands.run_gdrive_sync_worker import Command
        CompanyGoogleDriveConfig.objects.create(
            company=self.company, is_enabled=True, sync_mode='immediate',
            refresh_token=encrypt_secret('tok'), auth_status='needs_reauth'
        )
        GoogleDriveSyncQueue.objects.create(
            company=self.company, model_name='CompanyDocument', object_id=1, field_name='file',
            source_file_path='x.pdf', target_folder_path='f', target_filename='x.pdf', status='pending'
        )
        self.assertEqual(Command().process_batch(limit=5), 0)
