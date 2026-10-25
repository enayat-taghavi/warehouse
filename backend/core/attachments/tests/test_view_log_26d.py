import os
import shutil
import tempfile
import unittest
from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.models import AuditLog
from attachments.models import Attachment, EntityViewLog
import platform_core.registry


class ViewLog26dTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._tmp_media = tempfile.mkdtemp()
        cls._media_override = override_settings(MEDIA_ROOT=cls._tmp_media)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        try:
            cls._media_override.disable()
        finally:
            shutil.rmtree(cls._tmp_media, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username='user_26d', password='p', is_active=True, is_staff=False
        )
        self.su = user_model.objects.create_user(
            username='su_26d', password='p', is_active=True, is_superuser=True, is_staff=True
        )

    def _upload(self, user, kind='zz_doc', entity_id='7', name='a.pdf', content=b'%PDF-1.4 test', label=''):
        c = APIClient()
        c.force_authenticate(user)
        f = SimpleUploadedFile(name, content, content_type='application/pdf')
        data = {
            'kind': kind,
            'id': entity_id,
            'file': f,
        }
        if label:
            data['label'] = label
        return c.post('/api/attachments/', data, format='multipart')

    def _setup_audit_logs_and_user(self):
        row1 = AuditLog.objects.create(
            target_model='ZzDoc',
            target_object_id='1',
            module='security',
            action='UPDATE',
            company_id=None,
        )
        row2 = AuditLog.objects.create(
            target_model='ZzDoc',
            target_object_id='2',
            module='security',
            action='UPDATE',
            company_id=None,
        )
        perm = Permission.objects.get(codename='perm_sys_logs')
        self.user.user_permissions.add(perm)
        self.user = get_user_model().objects.get(pk=self.user.pk)
        return row1, row2

    def test_download_writes_one_row(self):
        upload_res = self._upload(self.su, kind='zz_doc', entity_id='7')
        self.assertEqual(upload_res.status_code, 201)
        attach_id = upload_res.data['id']

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [lambda user, eid: True]}):
            self.client.force_authenticate(self.user)
            res = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res.status_code, 200)

            logs = EntityViewLog.objects.filter(user=self.user)
            self.assertEqual(logs.count(), 1)
            log = logs.first()
            self.assertEqual(log.entity_kind, 'zz_doc')
            self.assertEqual(log.entity_id, '7')

    def test_second_download_within_window_writes_none(self):
        upload_res = self._upload(self.su, kind='zz_doc', entity_id='7')
        self.assertEqual(upload_res.status_code, 201)
        attach_id = upload_res.data['id']

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [lambda user, eid: True]}):
            self.client.force_authenticate(self.user)
            res1 = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res1.status_code, 200)
            self.assertEqual(EntityViewLog.objects.filter(user=self.user).count(), 1)

            res2 = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res2.status_code, 200)
            self.assertEqual(EntityViewLog.objects.filter(user=self.user).count(), 1)

    def test_download_after_window_writes_again(self):
        upload_res = self._upload(self.su, kind='zz_doc', entity_id='7')
        self.assertEqual(upload_res.status_code, 201)
        attach_id = upload_res.data['id']

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [lambda user, eid: True]}):
            self.client.force_authenticate(self.user)
            res1 = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res1.status_code, 200)
            self.assertEqual(EntityViewLog.objects.filter(user=self.user).count(), 1)

            EntityViewLog.objects.update(viewed_at=timezone.now() - timedelta(minutes=11))

            res2 = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res2.status_code, 200)
            self.assertEqual(EntityViewLog.objects.filter(user=self.user).count(), 2)

    def test_denied_download_writes_none(self):
        upload_res = self._upload(self.su, kind='zz_doc', entity_id='7')
        self.assertEqual(upload_res.status_code, 201)
        attach_id = upload_res.data['id']

        self.client.force_authenticate(self.user)

        # 1) Hook returns False -> 403 and zero rows
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [lambda user, eid: False]}):
            res_denied = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res_denied.status_code, 403)
            self.assertEqual(EntityViewLog.objects.count(), 0)

        # 2) Hook not registered at all -> 403 and zero rows
        clean_contribs = {k: v for k, v in platform_core.registry._CONTRIBUTIONS.items() if k != 'can_view:zz_doc'}
        with patch.dict(platform_core.registry._CONTRIBUTIONS, clean_contribs, clear=True):
            res_unregistered = self.client.get(f'/api/attachments/{attach_id}/download/')
            self.assertEqual(res_unregistered.status_code, 403)
            self.assertEqual(EntityViewLog.objects.count(), 0)

    def test_audit_list_hides_denied_rows(self):
        row1, row2 = self._setup_audit_logs_and_user()

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {
            'audit_entity_kinds': [('ZzDoc', 'zz_doc')],
            'can_view:zz_doc': [lambda user, eid: False if str(eid) == '1' else None],
        }):
            self.client.force_authenticate(self.user)
            res = self.client.get('/api/accounts/audit-logs/')
            self.assertEqual(res.status_code, 200)
            ids = [item['id'] for item in res.data['results']]
            self.assertIn(row2.id, ids)
            self.assertNotIn(row1.id, ids)

    def test_audit_detail_denied_is_404(self):
        row1, row2 = self._setup_audit_logs_and_user()

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {
            'audit_entity_kinds': [('ZzDoc', 'zz_doc')],
            'can_view:zz_doc': [lambda user, eid: False if str(eid) == '1' else None],
        }):
            self.client.force_authenticate(self.user)
            res1 = self.client.get(f'/api/accounts/audit-logs/{row1.id}/')
            self.assertEqual(res1.status_code, 404)

            res2 = self.client.get(f'/api/accounts/audit-logs/{row2.id}/')
            self.assertEqual(res2.status_code, 200)

    def test_superuser_sees_denied_rows(self):
        row1, row2 = self._setup_audit_logs_and_user()

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {
            'audit_entity_kinds': [('ZzDoc', 'zz_doc')],
            'can_view:zz_doc': [lambda user, eid: False if str(eid) == '1' else None],
        }):
            self.client.force_authenticate(self.su)
            res = self.client.get('/api/accounts/audit-logs/')
            self.assertEqual(res.status_code, 200)
            ids = [item['id'] for item in res.data['results']]
            self.assertIn(row1.id, ids)
            self.assertIn(row2.id, ids)
