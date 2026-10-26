"""API tests for core numbering (plan 2.8 decision 7): series list/settings and issued ledger, scope and validation."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

import platform_core.registry
from companies.models import Company, SectionAssignment
from numbering.models import IssuedNumber, NumberSeriesConfig
from numbering.registry import NumberSeriesSpec
from numbering.services import allocate, void

PERM = 'zzmod.perm_zz_numbering'
KEY_A = 'zz.doc'
KEY_B = 'zz.other'


def _period(company_id, at):
    return 'P1'


SPECS = [
    NumberSeriesSpec(key=KEY_A, title_fa='Doc A', period_key=_period, manage_perm=PERM),
    NumberSeriesSpec(key=KEY_B, title_fa='Doc B', period_key=_period),  # فقط مدیر کل
]


class NumberingApi28cTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model().objects
        cls.su = users.create_user(username='su_28c', password='p', is_active=True, is_superuser=True, is_staff=True)
        cls.mgr = users.create_user(username='mgr_28c', password='p', is_active=True)
        cls.plain = users.create_user(username='plain_28c', password='p', is_active=True)
        cls.c1 = Company.objects.create(code='NUM28C-1', name='C1')
        cls.c2 = Company.objects.create(code='NUM28C-2', name='C2')
        cls.c3 = Company.objects.create(code='NUM28C-3', name='C3')
        for user in (cls.mgr, cls.plain):
            SectionAssignment.objects.create(user=user, company=cls.c1, role='employee', is_active=True)
            SectionAssignment.objects.create(user=user, company=cls.c2, role='employee', is_active=True)

    def setUp(self):
        reg = patch.dict(platform_core.registry._CONTRIBUTIONS, {'numbering_series': list(SPECS)})
        reg.start()
        self.addCleanup(reg.stop)
        # مجوز بخشی فقط در شرکت c1 (همان مسیر has_company_perm)
        scope = patch('accounts.scoped_permissions.permission_scope', return_value='section')
        scope.start()
        self.addCleanup(scope.stop)
        codes = patch('accounts.scoped_permissions.codes_in_company',
                      side_effect=lambda user, cid: frozenset({'perm_zz_numbering'})
                      if user.pk == self.mgr.pk and cid == self.c1.pk else frozenset())
        codes.start()
        self.addCleanup(codes.stop)

    def _series(self, user, company):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/numbering/{company.pk}/series/')

    def _patch(self, user, company, key, body):
        self.client.force_authenticate(user)
        return self.client.patch(f'/api/numbering/{company.pk}/series/{key}/', body, format='json')

    def _issued(self, user, company, query=''):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/numbering/{company.pk}/issued/{query}')

    def test_list_empty_without_perm(self):
        res = self._series(self.plain, self.c1)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['results'], [])

    def test_superuser_sees_all_with_preview(self):
        allocate(self.c1.pk, KEY_A, 'doc', 1)
        res = self._series(self.su, self.c1)
        self.assertEqual(res.status_code, 200)
        items = {i['key']: i for i in res.data['results']}
        self.assertEqual(set(items), {KEY_A, KEY_B})
        self.assertEqual(items[KEY_A]['last_seq'], 1)
        self.assertEqual(items[KEY_A]['next_preview'], 'P1/2')
        self.assertTrue(items[KEY_A]['can_edit'])

    def test_section_perm_only_in_its_company(self):
        self.assertEqual([i['key'] for i in self._series(self.mgr, self.c1).data['results']], [KEY_A])
        self.assertEqual(self._series(self.mgr, self.c2).data['results'], [])
        self.assertEqual(self._patch(self.mgr, self.c2, KEY_A, {'prefix': 'X'}).status_code, 403)
        self.assertEqual(self._patch(self.mgr, self.c1, KEY_B, {'prefix': 'X'}).status_code, 403)

    def test_no_company_access_403_and_unknown_404(self):
        self.assertEqual(self._series(self.mgr, self.c3).status_code, 403)
        self.assertEqual(self._issued(self.mgr, self.c3).status_code, 403)
        self.assertEqual(self._patch(self.mgr, self.c3, KEY_A, {'prefix': 'X'}).status_code, 403)
        self.client.force_authenticate(self.su)
        self.assertEqual(self.client.get('/api/numbering/999999/series/').status_code, 404)
        self.assertEqual(self._patch(self.su, self.c1, 'zz.missing', {'prefix': 'X'}).status_code, 404)

    def test_patch_saves_and_previews(self):
        res = self._patch(self.mgr, self.c1, KEY_A,
                          {'template': '{prefix}-{period}-{seq}', 'prefix': 'F', 'seq_padding': 4, 'start_number': 10})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['next_preview'], 'F-P1-0010')
        row = NumberSeriesConfig.objects.get(company=self.c1, series_key=KEY_A)
        self.assertEqual(row.updated_by_id, self.mgr.pk)
        self.assertEqual(allocate(self.c1.pk, KEY_A, 'doc', 5).display, 'F-P1-0010')

    def test_patch_template_validation(self):
        for template in ('{seq}', '{period}', '{period}/{seq}/{year}', '{period}/{seq}}', 'x' * 101 + '{period}{seq}', ''):
            res = self._patch(self.su, self.c1, KEY_A, {'template': template})
            self.assertEqual(res.status_code, 400, template)
        self.assertFalse(NumberSeriesConfig.objects.exists())

    def test_patch_number_validation(self):
        for body in ({'seq_padding': 13}, {'seq_padding': -1}, {'seq_padding': '3'}, {'start_number': 0},
                     {'start_number': True}, {'prefix': 'x' * 21}, {'prefix': '{seq}'}):
            self.assertEqual(self._patch(self.su, self.c1, KEY_A, body).status_code, 400, body)

    def test_start_number_must_exceed_issued(self):
        for eid in (1, 2, 3):
            allocate(self.c1.pk, KEY_A, 'doc', eid)
        self.assertEqual(self._patch(self.su, self.c1, KEY_A, {'start_number': 3}).status_code, 400)
        self.assertEqual(self._patch(self.su, self.c1, KEY_A, {'start_number': 4}).status_code, 200)
        # شرکت دیگر شمارهٔ جدا دارد
        self.assertEqual(self._patch(self.su, self.c2, KEY_A, {'start_number': 1}).status_code, 200)

    def test_ledger_scope_and_filters(self):
        a1 = allocate(self.c1.pk, KEY_A, 'doc', 1)
        allocate(self.c1.pk, KEY_A, 'doc', 2)
        allocate(self.c1.pk, KEY_B, 'doc', 3)
        allocate(self.c2.pk, KEY_A, 'doc', 4)
        void(a1, 'wrong', self.su)
        res = self._issued(self.mgr, self.c1)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['count'], 2)
        self.assertEqual({r['series_key'] for r in res.data['results']}, {KEY_A})
        voided = self._issued(self.mgr, self.c1, '?status=void').data['results']
        self.assertEqual([(r['display'], r['void_reason'], r['voided_by']) for r in voided], [('P1/1', 'wrong', 'su_28c')])
        self.assertEqual(self._issued(self.mgr, self.c1, '?status=active').data['count'], 1)
        self.assertEqual(self._issued(self.mgr, self.c1, '?period=P2').data['count'], 0)
        self.assertEqual(self._issued(self.mgr, self.c2).data['count'], 0)
        self.assertEqual(self._issued(self.plain, self.c1).data['count'], 0)
        self.assertEqual(self._issued(self.su, self.c1, f'?series={KEY_B}').data['count'], 1)

    def test_no_write_methods_on_ledger(self):
        self.client.force_authenticate(self.su)
        url = f'/api/numbering/{self.c1.pk}/issued/'
        self.assertEqual(self.client.post(url, {'display': 'X'}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)
        self.assertEqual(self.client.post(f'/api/numbering/{self.c1.pk}/series/', {}, format='json').status_code, 405)
        self.assertFalse(IssuedNumber.objects.exists())
