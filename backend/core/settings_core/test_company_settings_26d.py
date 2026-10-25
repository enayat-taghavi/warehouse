import unittest
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.scoped_permissions import SYSTEM, permission_scope, section_permission_codes
from companies.models import Company, SectionAssignment
import platform_core.registry
from settings_core.company_settings import CompanySettingSpec
from settings_core.models import CompanySetting


class CompanySettingsApi26dTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        user_model = get_user_model()
        cls.su = user_model.objects.create_user(
            username='su_26d', password='p', is_active=True, is_superuser=True, is_staff=True
        )
        cls.user_a = user_model.objects.create_user(
            username='user_a_26d', password='p', is_active=True
        )
        cls.user_b = user_model.objects.create_user(
            username='user_b_26d', password='p', is_active=True
        )
        cls.user_c = user_model.objects.create_user(
            username='user_c_26d', password='p', is_active=True
        )

        cls.company1 = Company.objects.create(code='COMP1_26D', name='Company 1')
        cls.company2 = Company.objects.create(code='COMP2_26D', name='Company 2')

        SectionAssignment.objects.create(user=cls.user_a, company=cls.company1, role='employee', is_active=True)
        SectionAssignment.objects.create(user=cls.user_b, company=cls.company1, role='employee', is_active=True)
        SectionAssignment.objects.create(user=cls.user_c, company=cls.company2, role='employee', is_active=True)

        perm = Permission.objects.filter(content_type__app_label='accounts', codename='perm_sys_settings').first()
        if perm and permission_scope(f'accounts.{perm.codename}') == SYSTEM:
            cls.selected_perm = perm
        else:
            section_codes = set(section_permission_codes())
            candidates = Permission.objects.filter(content_type__app_label='accounts').exclude(codename__in=section_codes)
            cls.selected_perm = None
            for cand in candidates:
                if permission_scope(f'accounts.{cand.codename}') == SYSTEM:
                    cls.selected_perm = cand
                    break
            if not cls.selected_perm:
                cls.selected_perm = candidates.first()

        cls.perm_str = f'accounts.{cls.selected_perm.codename}' if cls.selected_perm else 'accounts.perm_sys_settings'
        if cls.selected_perm:
            cls.user_a.user_permissions.add(cls.selected_perm)

    def setUp(self):
        super().setUp()
        self.user_a = get_user_model().objects.get(pk=self.user_a.pk)
        self.user_b = get_user_model().objects.get(pk=self.user_b.pk)
        self.user_c = get_user_model().objects.get(pk=self.user_c.pk)
        self.su = get_user_model().objects.get(pk=self.su.pk)

        self.registry_patch = patch.dict(platform_core.registry._CONTRIBUTIONS, {
            'company_settings': [
                CompanySettingSpec('zzmod', 'flag', False, 'bool', 'Flag', self.perm_str),
                CompanySettingSpec('zzmod', 'limit', 5, 'int', 'Limit', self.perm_str),
            ]
        })
        self.registry_patch.start()
        self.addCleanup(self.registry_patch.stop)

    def test_default_returned_when_no_row(self):
        self.client.force_authenticate(self.user_a)
        res = self.client.get(f'/api/settings/company/{self.company1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = {item['key']: item for item in res.data.get('results', [])}
        self.assertIn('flag', items)
        self.assertEqual(items['flag']['value'], False)
        self.assertTrue(items['flag']['is_default'])
        self.assertIn('limit', items)
        self.assertEqual(items['limit']['value'], 5)

    def test_undeclared_key_400(self):
        self.client.force_authenticate(self.user_a)
        res = self.client.patch(
            f'/api/settings/company/{self.company1.id}/',
            {'module': 'zzmod', 'key': 'nope', 'value': 1},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CompanySetting.objects.count(), 0)

    def test_wrong_type_400(self):
        self.client.force_authenticate(self.user_a)
        url = f'/api/settings/company/{self.company1.id}/'
        res1 = self.client.patch(url, {'module': 'zzmod', 'key': 'flag', 'value': 1}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        res2 = self.client.patch(url, {'module': 'zzmod', 'key': 'limit', 'value': True}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        res3 = self.client.patch(url, {'module': 'zzmod', 'key': 'limit', 'value': '7'}, format='json')
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(CompanySetting.objects.count(), 0)

    def test_write_ok_then_read_back(self):
        self.client.force_authenticate(self.user_a)
        url = f'/api/settings/company/{self.company1.id}/'
        res = self.client.patch(url, {'module': 'zzmod', 'key': 'limit', 'value': 9}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('value'), 9)

        self.assertEqual(CompanySetting.objects.count(), 1)
        row = CompanySetting.objects.first()
        self.assertEqual(row.company, self.company1)
        self.assertEqual(row.module, 'zzmod')
        self.assertEqual(row.key, 'limit')
        self.assertEqual(row.value, 9)
        self.assertEqual(row.updated_by, self.user_a)

        res_get = self.client.get(url)
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        items = {item['key']: item for item in res_get.data.get('results', [])}
        self.assertEqual(items['limit']['value'], 9)
        self.assertFalse(items['limit']['is_default'])

        res2 = self.client.patch(url, {'module': 'zzmod', 'key': 'limit', 'value': 10}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data.get('value'), 10)
        self.assertEqual(CompanySetting.objects.count(), 1)
        row.refresh_from_db()
        self.assertEqual(row.value, 10)
        self.assertEqual(row.updated_by, self.user_a)

    def test_user_without_perm_403(self):
        self.client.force_authenticate(self.user_b)
        url = f'/api/settings/company/{self.company1.id}/'
        res = self.client.patch(url, {'module': 'zzmod', 'key': 'limit', 'value': 9}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(CompanySetting.objects.count(), 0)

        res_get = self.client.get(url)
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        items = {item['key']: item for item in res_get.data.get('results', [])}
        self.assertFalse(items['flag']['can_edit'])
        self.assertFalse(items['limit']['can_edit'])

    def test_other_company_user_cannot_read_or_write(self):
        self.client.force_authenticate(self.user_c)
        url = f'/api/settings/company/{self.company1.id}/'
        res_get = self.client.get(url)
        self.assertEqual(res_get.status_code, status.HTTP_403_FORBIDDEN)

        res_patch = self.client.patch(url, {'module': 'zzmod', 'key': 'limit', 'value': 9}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(CompanySetting.objects.count(), 0)

    def test_unknown_company_404(self):
        self.client.force_authenticate(self.su)
        res = self.client.get('/api/settings/company/999999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
