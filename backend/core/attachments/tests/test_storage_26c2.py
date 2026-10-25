import io
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase

from attachments.models import Attachment
from attachments.views import _storage_for
from companies.models import Company
import platform_core.registry
from settings_core.models import CompanyGoogleDriveConfig, GoogleDriveSyncQueue


def _connect(company, enabled=True, token='enc-token'):
    cfg, created = CompanyGoogleDriveConfig.objects.get_or_create(
        company=company,
        defaults={'is_enabled': enabled, 'refresh_token': token},
    )
    if not created:
        cfg.is_enabled = enabled
        cfg.refresh_token = token
        cfg.save()
    return cfg


class AttachmentDriveStorage26c2Tests(APITestCase):
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
        self.user = user_model.objects.create_user(username='u_storage_26c2', password='p', is_active=True)
        self.client.force_authenticate(self.user)
        self.company = Company.objects.create(code='c1', name='Company 1')

    def _connect(self, company, enabled=True, token='enc-token'):
        return _connect(company, enabled=enabled, token=token)

    def test_server_when_confidential(self):
        self._connect(self.company, enabled=True, token='enc-token')
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'is_confidential:zzdoc': [lambda eid: True]}):
            self.assertEqual(_storage_for('zzdoc', '1', '', self.company.id), 'server')

    def test_server_for_user_kind(self):
        self._connect(self.company, enabled=True, token='enc-token')
        self.assertEqual(_storage_for('user', '1', '', self.company.id), 'server')

    def test_server_for_signature_and_stamp(self):
        self._connect(self.company, enabled=True, token='enc-token')
        self.assertEqual(_storage_for('zzdoc', '1', 'signature', self.company.id), 'server')
        self.assertEqual(_storage_for('zzdoc', '1', 'stamp', self.company.id), 'server')

    def test_server_without_config(self):
        self.assertEqual(_storage_for('zzdoc', '1', '', self.company.id), 'server')
        self.assertEqual(_storage_for('zzdoc', '1', '', None), 'server')

    def test_server_without_refresh_token(self):
        cfg = self._connect(self.company, enabled=True, token=None)
        self.assertEqual(_storage_for('zzdoc', '1', '', self.company.id), 'server')
        cfg.refresh_token = ''
        cfg.save()
        self.assertEqual(_storage_for('zzdoc', '1', '', self.company.id), 'server')
        cfg.refresh_token = 'enc-token'
        cfg.is_enabled = False
        cfg.save()
        self.assertEqual(_storage_for('zzdoc', '1', '', self.company.id), 'server')

    def test_gdrive_when_connected(self):
        self._connect(self.company, enabled=True, token='enc-token')
        self.assertEqual(_storage_for('zzdoc', '1', '', self.company.id), 'gdrive')

    def test_upload_enqueues_one_row_and_keeps_file(self):
        self._connect(self.company, enabled=True, token='enc-token')
        company2 = Company.objects.create(code='c2', name='Company 2')

        def _company_of(eid):
            return company2.id if str(eid) == '2' else self.company.id

        hooks = {
            'can_attach:zzdoc': [lambda user, eid: True],
            'can_view:zzdoc': [lambda user, eid: True],
            'company_of:zzdoc': [_company_of],
        }
        with patch.dict(platform_core.registry._CONTRIBUTIONS, hooks):
            f1 = SimpleUploadedFile('doc1.pdf', b'%PDF-1.4 file one', content_type='application/pdf')
            res1 = self.client.post('/api/attachments/', {'kind': 'zzdoc', 'id': '1', 'file': f1}, format='multipart')
            self.assertEqual(res1.status_code, 201)
            self.assertEqual(res1.data['storage'], 'gdrive')

            att1_id = res1.data['id']
            att1 = Attachment.objects.get(pk=att1_id)

            self.assertEqual(GoogleDriveSyncQueue.objects.count(), 1)
            row = GoogleDriveSyncQueue.objects.get()
            self.assertEqual(row.model_name, 'Attachment')
            self.assertEqual(row.object_id, att1.id)
            self.assertEqual(row.field_name, 'file')
            self.assertEqual(row.action, 'upload')
            self.assertEqual(row.status, 'pending')
            self.assertEqual(row.source_file_path, att1.file.name)

            file_path = os.path.join(settings.MEDIA_ROOT, att1.file.name)
            self.assertTrue(os.path.exists(file_path))

            # Second upload for a company without config
            f2 = SimpleUploadedFile('doc2.pdf', b'%PDF-1.4 file two', content_type='application/pdf')
            res2 = self.client.post('/api/attachments/', {'kind': 'zzdoc', 'id': '2', 'file': f2}, format='multipart')
            self.assertEqual(res2.status_code, 201)
            self.assertEqual(res2.data['storage'], 'server')

            # creates no queue row
            self.assertEqual(GoogleDriveSyncQueue.objects.count(), 1)

    def test_worker_keeps_scan_all_pending_without_hook(self):
        cfg = self._connect(self.company, enabled=True, token='enc-token')
        cfg.sync_mode = 'immediate'
        cfg.save()
        task = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            action='scan_all',
            status='pending',
            model_name='ScanAll',
            source_file_path='',
            target_folder_path='',
            target_filename='',
        )
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'gdrive_scan_all': []}):
            call_command('run_gdrive_sync_worker', '--once', stdout=io.StringIO(), stderr=io.StringIO())
        task.refresh_from_db()
        self.assertEqual(task.status, 'pending')
        self.assertIsNotNone(task.next_retry_at)
