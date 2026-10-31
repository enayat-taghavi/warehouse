"""
QR واقعی (O3 طرح شبانه): نشانی عمومی QR پشت پروکسی و خلاصهٔ زندهٔ صفحهٔ صحت‌سنجی از قلاب `verify_summary:<kind>`.
"""
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

import platform_core.registry
from reports.document_pdf import verify_token
from reports.document_views import public_base_url

HOSTS = ['app.farsalish.ir', 'localhost', '127.0.0.1']


@override_settings(ALLOWED_HOSTS=HOSTS, WH_CANONICAL_DOMAIN='')
class PublicBaseUrlTests(SimpleTestCase):
    def req(self, **meta):
        return RequestFactory().get('/api/print/x/1/pdf/', HTTP_HOST='127.0.0.1:8000', **meta)

    def test_canonical_domain_wins(self):
        with override_settings(WH_CANONICAL_DOMAIN='soft.example.ir'):
            self.assertEqual(public_base_url(self.req(HTTP_REFERER='https://app.farsalish.ir/x')),
                             'https://soft.example.ir')

    def test_referer_host_behind_proxy(self):
        self.assertEqual(public_base_url(self.req(HTTP_REFERER='https://app.farsalish.ir/app/finance/invoices')),
                         'https://app.farsalish.ir')

    def test_origin_used_first(self):
        self.assertEqual(public_base_url(self.req(HTTP_ORIGIN='https://app.farsalish.ir')), 'https://app.farsalish.ir')

    def test_unknown_or_loopback_referer_ignored(self):
        self.assertEqual(public_base_url(self.req(HTTP_REFERER='https://evil.example.com/')), 'http://127.0.0.1:8000')
        self.assertEqual(public_base_url(self.req(HTTP_REFERER='https://localhost/app')), 'http://127.0.0.1:8000')
        self.assertEqual(public_base_url(self.req(HTTP_REFERER='javascript:alert(1)')), 'http://127.0.0.1:8000')

    def test_userinfo_dropped_and_wildcard_ignored(self):
        self.assertEqual(public_base_url(self.req(HTTP_ORIGIN='https://evil.com@app.farsalish.ir:8443')),
                         'https://app.farsalish.ir:8443')
        with override_settings(ALLOWED_HOSTS=['*']):
            self.assertEqual(public_base_url(self.req(HTTP_REFERER='https://evil.example.com/')),
                             'http://127.0.0.1:8000')


class LiveSummaryTests(TestCase):
    def get(self, token, hooks):
        with patch.dict(platform_core.registry._CONTRIBUTIONS, hooks):
            res = APIClient().get(f'/api/public/verify/{token}/')
        self.assertEqual(res.status_code, 200)
        return res.data

    def test_no_hook_not_live(self):
        data = self.get(verify_token('zz_doc', 5, '1', title='T'), {})
        self.assertIs(data['live'], False)
        self.assertNotIn('current', data)

    def test_live_fields_only(self):
        summary = {'exists': True, 'company_id': None, 'number': 'N-2', 'date': '1405/08/01', 'amount': '1000',
                   'status': 'پرداخت‌شده', 'secret': 'x'}
        hooks = {'verify_summary:zz_doc': [lambda eid: summary]}
        no_company = self.get(verify_token('zz_doc', 5, 'N-1', title='T'), hooks)
        self.assertIs(no_company['exists'], False)  # توکن بی شرکت = بی دادهٔ زنده
        self.assertNotIn('current', no_company)
        summary['company_id'] = 7
        data = self.get(verify_token('zz_doc', 5, 'N-1', company_id=7, title='T'), hooks)
        self.assertIs(data['exists'], True)
        self.assertEqual(data['current'], {'number': 'N-2', 'date': '1405/08/01', 'amount': '1000',
                                           'status': 'پرداخت‌شده'})

    def test_deleted_or_hook_error(self):
        token = verify_token('zz_doc', 5, '1', title='T')
        data = self.get(token, {'verify_summary:zz_doc': [lambda eid: {'exists': False}]})
        self.assertEqual((data['live'], data['exists']), (True, False))
        self.assertNotIn('current', data)
        data = self.get(token, {'verify_summary:zz_doc': [lambda eid: 1 / 0]})
        self.assertIs(data['live'], False)

    def test_confidential_has_no_live_data(self):
        hooks = {'is_confidential:zz_doc': [lambda eid: True],
                 'verify_summary:zz_doc': [lambda eid: {'exists': True, 'amount': '5'}]}
        self.assertEqual(self.get(verify_token('zz_doc', 5, '9'), hooks), {'valid': True, 'number': '9'})
