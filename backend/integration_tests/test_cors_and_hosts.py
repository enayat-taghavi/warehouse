from django.conf import settings
from django.test import Client, TestCase


CUSTOM_HEADERS = [
    'x-active-app',
    'x-active-role',
    'x-base-updated-at',
    'x-client-tab-id',
    'x-company-id',
    'x-entity-sync-id',
    'x-entity-type',
    'x-app-version',
    'x-app-platform',
]

FOUR_DOMAINS = [
    'soft.farsalish.ir',
    'app.farsalish.ir',
    'soft.lalalorga.ir',
    'soft.comanage.ir',
]


class CorsAndHostsIntegrationTests(TestCase):
    """
    تست‌های یکپارچگی هدرهای CORS و لیست مجاز میزبان‌ها (ALLOWED_HOSTS).
    """

    def setUp(self):
        self.client = Client()

    def test_preflight_options_https_localhost(self):
        """
        درخواست preflight OPTIONS از مبدأ https://localhost با درخواست هر ۹ هدر سفارشی
        باید مجاز بوده و هدرهای Access-Control-Allow-Origin و Access-Control-Allow-Headers را شامل شود.
        """
        response = self.client.options(
            '/api/public/config/',
            HTTP_ORIGIN='https://localhost',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS=', '.join(CUSTOM_HEADERS),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Access-Control-Allow-Origin'), 'https://localhost')
        allow_headers = response.get('Access-Control-Allow-Headers', '').lower()
        for header in CUSTOM_HEADERS:
            self.assertIn(header.lower(), allow_headers)

    def test_preflight_options_capacitor_localhost(self):
        """
        درخواست preflight OPTIONS از مبدأ capacitor://localhost (اپلیکیشن موبایل) با درخواست هر ۹ هدر
        باید مجاز بوده و هدرهای Access-Control-Allow-Origin و Access-Control-Allow-Headers را شامل شود.
        """
        response = self.client.options(
            '/api/public/config/',
            HTTP_ORIGIN='capacitor://localhost',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS=', '.join(CUSTOM_HEADERS),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Access-Control-Allow-Origin'), 'capacitor://localhost')
        allow_headers = response.get('Access-Control-Allow-Headers', '').lower()
        for header in CUSTOM_HEADERS:
            self.assertIn(header.lower(), allow_headers)

    def test_untrusted_origin_evil_example_rejected(self):
        """
        مبدأ غیرمجاز https://evil.example نباید هدر Access-Control-Allow-Origin دریافت کند.
        """
        preflight_response = self.client.options(
            '/api/public/config/',
            HTTP_ORIGIN='https://evil.example',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='x-active-app',
        )
        self.assertNotIn('Access-Control-Allow-Origin', preflight_response)

        get_response = self.client.get(
            '/api/public/config/',
            HTTP_ORIGIN='https://evil.example',
        )
        self.assertNotIn('Access-Control-Allow-Origin', get_response)

    def test_plain_get_from_soft_farsalish_allowed(self):
        """
        درخواست GET عادی از https://soft.farsalish.ir باید هدر Access-Control-Allow-Origin دریافت کند.
        """
        response = self.client.get(
            '/api/public/config/',
            HTTP_ORIGIN='https://soft.farsalish.ir',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Access-Control-Allow-Origin'), 'https://soft.farsalish.ir')

    def test_plain_get_from_app_farsalish_allowed(self):
        """
        درخواست GET عادی از https://app.farsalish.ir باید هدر Access-Control-Allow-Origin دریافت کند.
        """
        response = self.client.get(
            '/api/public/config/',
            HTTP_ORIGIN='https://app.farsalish.ir',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Access-Control-Allow-Origin'), 'https://app.farsalish.ir')

    def test_default_lists_contain_four_domains(self):
        """
        لیست‌های پیش‌فرض DEFAULT_ALLOWED_HOSTS و DEFAULT_CORS_ALLOWED_ORIGINS باید شامل چهار دامنه اصلی باشند.
        """
        for domain in FOUR_DOMAINS:
            self.assertIn(domain, settings.DEFAULT_ALLOWED_HOSTS)
            origin = f'https://{domain}'
            self.assertIn(origin, settings.DEFAULT_CORS_ALLOWED_ORIGINS)
            # اعتبارسنجی پاسخ برای هر مبدأ از طریق endpoint
            res = self.client.get('/api/public/config/', HTTP_ORIGIN=origin)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get('Access-Control-Allow-Origin'), origin)

    def test_allowed_hosts_default_never_contains_wildcard(self):
        """
        پیش‌فرض ALLOWED_HOSTS و DEFAULT_ALLOWED_HOSTS هرگز نباید شامل wildcard ('*') باشند.
        """
        self.assertNotIn('*', settings.DEFAULT_ALLOWED_HOSTS)
        self.assertNotIn('*', settings.ALLOWED_HOSTS)
        # درخواست با یک دامنه معتبر باید موفق باشد
        res = self.client.get('/api/public/config/', HTTP_HOST='soft.farsalish.ir')
        self.assertEqual(res.status_code, 200)
