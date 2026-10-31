import io
import json
from pathlib import Path
import shutil
import tempfile
import zipfile

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from settings_core.mobile_release import (
    is_valid_version,
    is_safe_filename,
    compute_sha256,
    read_manifest,
    get_updates_dir,
    get_apk_dir,
    get_manifest_path,
)


class MobileReleaseTests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.settings_override = override_settings(MEDIA_ROOT=self.temp_dir)
        self.settings_override.enable()
        self.client = APIClient()

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _create_sample_zip(self, name='test_bundle.zip', content=b'BUNDLE CONTENT 123'):
        zip_path = Path(self.temp_dir) / name
        with zipfile.ZipFile(zip_path, 'w') as zf:
            zf.writestr('index.html', content)
        return zip_path

    def _create_sample_apk(self, name='test_app.apk', content=b'APK BYTES 123'):
        apk_path = Path(self.temp_dir) / name
        apk_path.write_bytes(content)
        return apk_path

    def test_01_no_manifest_gives_empty_dict(self):
        """وقتی هنوز مانیفستی منتشر نشده، خروجی شیء خالی {} با کد ۲۰۰ است."""
        res = self.client.get('/api/public/mobile-update/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {})

    def test_02_invalid_manifest_gives_empty_dict(self):
        """اگر فایل manifest.json خراب، غیرمعتبر یا ناقص باشد، باز هم شیء خالی برمی‌گرداند."""
        manifest_path = get_manifest_path()
        manifest_path.parent.mkdir(parents=True, exist_ok=True)

        # 1. فایل JSON خراب
        manifest_path.write_text('{broken json...', encoding='utf-8')
        res = self.client.get('/api/public/mobile-update/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {})

        # 2. مانیفست با فیلدهای ناقص یا نسخه نامعتبر
        invalid_data = {
            'version': 'invalid_ver',
            'file': 'bad.zip',
            'sha256': '1234',
            'min_native_version': '0.1.0',
            'published_at': '2026-10-17T00:00:00Z',
        }
        manifest_path.write_text(json.dumps(invalid_data), encoding='utf-8')
        res = self.client.get('/api/public/mobile-update/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {})

    def test_03_publish_bundle_then_read_gives_version_sha256_and_url(self):
        """دستور publish_mobile_bundle مانیفست را ساخته و اندپوینت عمومی نگارش، هش و URL مطلق را می‌دهد."""
        zip_path = self._create_sample_zip('v100.zip', b'SAMPLE CODE V1')
        out = io.StringIO()

        call_command(
            'publish_mobile_bundle',
            zip=str(zip_path),
            version='1.0.0',
            min_native='1.0.0',
            stdout=out,
        )

        expected_sha = compute_sha256(get_updates_dir() / '1.0.0.zip')

        res = self.client.get('/api/public/mobile-update/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['version'], '1.0.0')
        self.assertEqual(res.data['file'], '1.0.0.zip')
        self.assertEqual(res.data['sha256'], expected_sha)
        self.assertEqual(res.data['min_native_version'], '1.0.0')
        self.assertIn('published_at', res.data)
        self.assertEqual(
            res.data['url'],
            'http://testserver/api/public/mobile-files/updates/1.0.0.zip',
        )

    def test_04_publish_bundle_invalid_version_rejected(self):
        """نگارش‌های نامعتبر برای باندل یا نسخه بومی رد شده و استثنا پرتاب می‌شود."""
        zip_path = self._create_sample_zip('v_bad.zip')

        invalid_versions = ['1.2', 'v1.0.0', '1.2.3.4', 'abc', '1.-2.3', '']
        for bad_v in invalid_versions:
            with self.assertRaises(CommandError):
                call_command(
                    'publish_mobile_bundle',
                    zip=str(zip_path),
                    version=bad_v,
                    min_native='1.0.0',
                )

        # نسخه بومی نامعتبر
        with self.assertRaises(CommandError):
            call_command(
                'publish_mobile_bundle',
                zip=str(zip_path),
                version='1.0.0',
                min_native='not-valid',
            )

        # فایل زیپ ناموجود
        with self.assertRaises(CommandError):
            call_command(
                'publish_mobile_bundle',
                zip=str(Path(self.temp_dir) / 'nonexistent.zip'),
                version='1.0.0',
                min_native='1.0.0',
            )

    def test_05_older_bundles_kept_after_second_publish(self):
        """انتشار باندل جدید فایل‌های زیپ قبلی را حذف نمی‌کند و مانیفست را اتمیک آپدیت می‌کند."""
        zip1 = self._create_sample_zip('b1.zip', b'V1 CONTENT')
        call_command(
            'publish_mobile_bundle',
            zip=str(zip1),
            version='1.0.0',
            min_native='1.0.0',
        )

        zip2 = self._create_sample_zip('b2.zip', b'V2 CONTENT')
        call_command(
            'publish_mobile_bundle',
            zip=str(zip2),
            version='1.1.0',
            min_native='1.0.0',
        )

        updates_dir = get_updates_dir()
        bundle1 = updates_dir / '1.0.0.zip'
        bundle2 = updates_dir / '1.1.0.zip'

        self.assertTrue(bundle1.is_file(), "Older bundle 1.0.0.zip must NOT be deleted")
        self.assertTrue(bundle2.is_file(), "New bundle 1.1.0.zip must exist")

        res = self.client.get('/api/public/mobile-update/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['version'], '1.1.0')
        self.assertEqual(res.data['file'], '1.1.0.zip')

    def test_06_publish_mobile_apk_prod_and_staging(self):
        """دستور publish_mobile_apk برای prod و staging نام‌گذاری درست انجام داده و URL را در خروجی می‌آورد."""
        apk_file = self._create_sample_apk('release.apk', b'DUMMY APK DATA')

        # تولید برای محیط prod
        out_prod = io.StringIO()
        call_command(
            'publish_mobile_apk',
            apk=str(apk_file),
            version='1.2.3',
            channel='direct',
            env='prod',
            stdout=out_prod,
        )
        expected_prod_path = get_apk_dir() / 'CoManage-1.2.3-direct.apk'
        self.assertTrue(expected_prod_path.is_file())
        self.assertIn('/api/public/mobile-files/apk/CoManage-1.2.3-direct.apk', out_prod.getvalue())

        # تولید برای محیط staging
        out_staging = io.StringIO()
        call_command(
            'publish_mobile_apk',
            apk=str(apk_file),
            version='1.2.3',
            channel='bazaar',
            env='staging',
            stdout=out_staging,
        )
        expected_staging_path = get_apk_dir() / 'CoManage-1.2.3-bazaar-test.apk'
        self.assertTrue(expected_staging_path.is_file())
        self.assertIn('/api/public/mobile-files/apk/CoManage-1.2.3-bazaar-test.apk', out_staging.getvalue())

    def test_07_publish_apk_invalid_arguments_rejected(self):
        """آرگومان‌های نامعتبر دستور publish_mobile_apk خطا می‌دهند."""
        apk_file = self._create_sample_apk('sample.apk')

        # نسخه نامعتبر
        with self.assertRaises(CommandError):
            call_command('publish_mobile_apk', apk=str(apk_file), version='bad', channel='direct', env='prod')

        # کانال نامعتبر
        with self.assertRaises(CommandError):
            call_command('publish_mobile_apk', apk=str(apk_file), version='1.0.0', channel='playstore', env='prod')

        # محیط نامعتبر
        with self.assertRaises(CommandError):
            call_command('publish_mobile_apk', apk=str(apk_file), version='1.0.0', channel='direct', env='local')

        # فایل ناموجود
        with self.assertRaises(CommandError):
            call_command('publish_mobile_apk', apk=str(Path(self.temp_dir) / 'nope.apk'), version='1.0.0', channel='direct', env='prod')

    def test_08_serve_apk_file_content_type_and_attachment(self):
        """فایل APK با نوع محتوای اختصاصی اندروید و به عنوان ضمیمه (attachment) استریم می‌شود."""
        apk_file = self._create_sample_apk('src.apk', b'APK BINARY CONTENT')
        call_command(
            'publish_mobile_apk',
            apk=str(apk_file),
            version='2.0.0',
            channel='myket',
            env='prod',
        )

        res = self.client.get('/api/public/mobile-files/apk/CoManage-2.0.0-myket.apk')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Content-Type'), 'application/vnd.android.package-archive')
        self.assertIn('attachment;', res.headers.get('Content-Disposition', ''))
        self.assertIn('CoManage-2.0.0-myket.apk', res.headers.get('Content-Disposition', ''))
        # همان نام دوباره منتشر می‌شود؛ کش Cloudflare نباید APK قدیمی را بدهد
        self.assertEqual(res.headers.get('Cache-Control'), 'no-store')
        if hasattr(res, 'close'):
            res.close()

    def test_09_serve_zip_bundle_file(self):
        """فایل به‌روزرسانی زیپ با موفقیت استریم می‌شود."""
        zip_file = self._create_sample_zip('b1.zip', b'ZIP STREAM CONTENT')
        call_command(
            'publish_mobile_bundle',
            zip=str(zip_file),
            version='3.0.0',
            min_native='1.0.0',
        )

        res = self.client.get('/api/public/mobile-files/updates/3.0.0.zip')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Content-Type'), 'application/zip')
        if hasattr(res, 'close'):
            res.close()

    def test_10_path_traversal_and_bad_names_give_404(self):
        """نام‌های نامعتبر، کاراکترهای خطرناک و تلاش برای خروج از پوشه (path traversal) همگی ۴۰۴ می‌دهند."""
        # 1. پسوند غیرمجاز
        res1 = self.client.get('/api/public/mobile-files/updates/x.exe')
        self.assertEqual(res1.status_code, 404)

        # 2. پیمایش مسیر (path traversal)
        res2 = self.client.get('/api/public/mobile-files/updates/../x.zip')
        self.assertEqual(res2.status_code, 404)

        # 3. زیرپوشه درون نام
        res3 = self.client.get('/api/public/mobile-files/updates/a/b.apk')
        self.assertEqual(res3.status_code, 404)

        # 4. دسته‌بندی غیرمجاز (kind)
        res4 = self.client.get('/api/public/mobile-files/documents/sample.zip')
        self.assertEqual(res4.status_code, 404)

        # 5. فایل ناموجود
        res5 = self.client.get('/api/public/mobile-files/updates/9.9.9.zip')
        self.assertEqual(res5.status_code, 404)

    def test_11_mobile_release_helper_functions(self):
        """آزمون توابع کمکی اعتبارسنجی نگارش، نام فایل و هشینگ."""
        # بررسی نسخه‌ها
        self.assertTrue(is_valid_version('1.0.0'))
        self.assertTrue(is_valid_version('0.0.1'))
        self.assertTrue(is_valid_version('999.999.999'))
        self.assertFalse(is_valid_version('1.0'))
        self.assertFalse(is_valid_version('v1.0.0'))
        self.assertFalse(is_valid_version('1.2.3.4'))
        self.assertFalse(is_valid_version(None))

        # بررسی نام فایل امن
        self.assertTrue(is_safe_filename('1.0.0.zip'))
        self.assertTrue(is_safe_filename('CoManage-1.0.0-direct.apk'))
        self.assertTrue(is_safe_filename('bundle_update-2.zip'))
        self.assertFalse(is_safe_filename('../1.0.0.zip'))
        self.assertFalse(is_safe_filename('a/b.zip'))
        self.assertFalse(is_safe_filename('x.exe'))
        self.assertFalse(is_safe_filename(''))
        self.assertFalse(is_safe_filename(None))

        # بررسی sha256
        data = b'ANTIGRAVITY_TEST'
        h = compute_sha256(data)
        import hashlib
        self.assertEqual(h, hashlib.sha256(data).hexdigest().lower())
