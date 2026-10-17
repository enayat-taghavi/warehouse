from django.test import TestCase
from rest_framework.test import APIClient

from settings_core.models import SystemSetting
from settings_core.services import (
    DEFAULT_SETTINGS,
    validate_settings_payload,
    clear_setting_cache,
)


class MobileAppConfigTests(TestCase):
    def setUp(self):
        clear_setting_cache()
        self.client = APIClient()

    def tearDown(self):
        clear_setting_cache()

    def test_defaults_present(self):
        """کلیدهای جدید نسخه اپ و لینک‌های دانلود در DEFAULT_SETTINGS با مقدار رشته خالی حاضر هستند."""
        self.assertIn('app_min_version', DEFAULT_SETTINGS)
        self.assertEqual(DEFAULT_SETTINGS['app_min_version'], '')
        self.assertIn('app_recommended_version', DEFAULT_SETTINGS)
        self.assertEqual(DEFAULT_SETTINGS['app_recommended_version'], '')
        self.assertIn('app_download_url_direct', DEFAULT_SETTINGS)
        self.assertEqual(DEFAULT_SETTINGS['app_download_url_direct'], '')
        self.assertIn('app_download_url_bazaar', DEFAULT_SETTINGS)
        self.assertEqual(DEFAULT_SETTINGS['app_download_url_bazaar'], '')
        self.assertIn('app_download_url_myket', DEFAULT_SETTINGS)
        self.assertEqual(DEFAULT_SETTINGS['app_download_url_myket'], '')

    def test_public_config_anonymous_get_defaults(self):
        """درخواست ناشناس به /api/public/config/ کد ۲۰۰ و سه کلید با مقادیر پیش‌فرض خالی برمی‌گرداند."""
        res = self.client.get('/api/public/config/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('app_min_version', res.data)
        self.assertEqual(res.data['app_min_version'], '')
        self.assertIn('app_recommended_version', res.data)
        self.assertEqual(res.data['app_recommended_version'], '')
        self.assertIn('app_download_urls', res.data)
        self.assertEqual(res.data['app_download_urls'], {
            'direct': '',
            'bazaar': '',
            'myket': '',
        })

    def test_public_config_stored_valid_values(self):
        """مقادیر معتبر ذخیره‌شده در SystemSetting در خروجی /api/public/config/ بازگردانده می‌شوند."""
        SystemSetting.objects.create(key='app_min_version', value='1.2.3')
        SystemSetting.objects.create(key='app_recommended_version', value='2.0.1')
        SystemSetting.objects.create(key='app_download_url_direct', value='https://example.com/downloads/app.apk')
        SystemSetting.objects.create(key='app_download_url_bazaar', value='https://cafebazaar.ir/app/ir.farsalish.app')
        SystemSetting.objects.create(key='app_download_url_myket', value='https://myket.ir/app/ir.farsalish.app')

        res = self.client.get('/api/public/config/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['app_min_version'], '1.2.3')
        self.assertEqual(res.data['app_recommended_version'], '2.0.1')
        self.assertEqual(res.data['app_download_urls'], {
            'direct': 'https://example.com/downloads/app.apk',
            'bazaar': 'https://cafebazaar.ir/app/ir.farsalish.app',
            'myket': 'https://myket.ir/app/ir.farsalish.app',
        })

    def test_public_config_stored_invalid_version_returns_empty(self):
        """مقادیر نامعتبر نسخه در دیتابیس هرگز باعث ۵۰۰ نشده و به رشته خالی تبدیل می‌شوند."""
        SystemSetting.objects.create(key='app_min_version', value='invalid_version')
        SystemSetting.objects.create(key='app_recommended_version', value='1.0')

        res = self.client.get('/api/public/config/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['app_min_version'], '')
        self.assertEqual(res.data['app_recommended_version'], '')

    def test_public_config_stored_invalid_urls_returns_empty(self):
        """آدرس‌های نامعتبر دانلود در دیتابیس (http، با فاصله، غیررشته) با رشته خالی جایگزین می‌شوند."""
        SystemSetting.objects.create(key='app_download_url_direct', value='http://insecure.example.com/app.apk')
        SystemSetting.objects.create(key='app_download_url_bazaar', value='https://example.com/app with spaces.apk')
        SystemSetting.objects.create(key='app_download_url_myket', value=12345)

        res = self.client.get('/api/public/config/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['app_download_urls'], {
            'direct': '',
            'bazaar': '',
            'myket': '',
        })

    def test_validation_accepts_valid_values(self):
        """اعتبارسنجی payload مقادیر نسخه معتبر، آدرس‌های https بدون فاصله و رشته خالی را می‌پذیرد."""
        payload = {
            'app_min_version': '1.0.0',
            'app_recommended_version': '2.10.3',
            'app_download_url_direct': 'https://example.com/app.apk',
            'app_download_url_bazaar': 'https://cafebazaar.ir/app/pkg',
            'app_download_url_myket': 'https://myket.ir/app/pkg',
        }
        self.assertEqual(validate_settings_payload(payload), [])

        payload_empty = {
            'app_min_version': '',
            'app_recommended_version': '',
            'app_download_url_direct': '',
            'app_download_url_bazaar': '',
            'app_download_url_myket': '',
        }
        self.assertEqual(validate_settings_payload(payload_empty), [])

    def test_validation_rejects_invalid_versions(self):
        """اعتبارسنجی payload نسخه‌های فاقد فرمت MAJOR.MINOR.PATCH یا غیررشته را رد می‌کند."""
        invalid_versions = [
            '1.0',
            '1.0.0.0',
            'v1.0.0',
            '1.0.0-beta',
            '1.0.0 ',
            ' 1.0.0',
            '12345.0.0',
            100,
            None,
            ['1.0.0'],
            {'v': '1.0.0'},
        ]
        for bad_val in invalid_versions:
            self.assertIn('app_min_version', validate_settings_payload({'app_min_version': bad_val}))
            self.assertIn('app_recommended_version', validate_settings_payload({'app_recommended_version': bad_val}))

    def test_validation_rejects_http_urls(self):
        """اعتبارسنجی payload آدرس‌های ناامن http:// را برای تمام کلیدهای دانلود رد می‌کند."""
        keys = ['app_download_url_direct', 'app_download_url_bazaar', 'app_download_url_myket']
        for key in keys:
            bad_payload = {key: 'http://example.com/app.apk'}
            self.assertIn(key, validate_settings_payload(bad_payload))

    def test_validation_rejects_urls_with_spaces_and_non_strings(self):
        """اعتبارسنجی payload آدرس‌های حاوی فاصله، بیش از ۵۰۰ نویسه و مقادیر غیررشته را رد می‌کند."""
        keys = ['app_download_url_direct', 'app_download_url_bazaar', 'app_download_url_myket']
        bad_values = [
            'https://example.com/app name.apk',
            'https://example.com/app\tname.apk',
            'https://example.com/app\nname.apk',
            'https://' + ('a' * 501),
            12345,
            True,
            None,
            ['https://example.com/app.apk'],
            {'url': 'https://example.com/app.apk'},
        ]
        for key in keys:
            for bad_val in bad_values:
                bad_payload = {key: bad_val}
                self.assertIn(key, validate_settings_payload(bad_payload))
