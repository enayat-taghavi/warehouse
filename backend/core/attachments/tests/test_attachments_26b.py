import hashlib
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from attachments.models import Attachment
from common.media_urls import _current_expiry, _signature, signed_media_url
import platform_core.registry


def _hooks(view=None, attach=None, locked=None, company=None, kind='zz_doc'):
    """
    Helper returning a patch.dict for platform_core.registry._CONTRIBUTIONS with only given keys.
    Each value is a one-item list.
    """
    d = {}
    if view is not None:
        fn = view if callable(view) else (lambda user, eid: view)
        d[f'can_view:{kind}'] = [fn]
    if attach is not None:
        fn = attach if callable(attach) else (lambda user, eid: attach)
        d[f'can_attach:{kind}'] = [fn]
    if locked is not None:
        fn = locked if callable(locked) else (lambda eid: bool(locked))
        d[f'is_locked:{kind}'] = [fn]
    if company is not None:
        fn = company if callable(company) else (lambda eid: company)
        d[f'company_of:{kind}'] = [fn]
    return patch.dict(platform_core.registry._CONTRIBUTIONS, d)


def _upload(user, kind='zz_doc', entity_id='7', name='a.pdf', content=b'%PDF-1.4 test', label='', client=None):
    """
    Helper posting multipart to /api/attachments/.
    """
    c = client or APIClient()
    c.force_authenticate(user)
    content_type = (
        'application/pdf' if name.endswith('.pdf')
        else ('image/png' if name.endswith('.png') else 'application/octet-stream')
    )
    f = SimpleUploadedFile(name, content, content_type=content_type)
    data = {
        'kind': kind,
        'id': entity_id,
        'file': f,
    }
    if label:
        data['label'] = label
    return c.post('/api/attachments/', data, format='multipart')


class Attachment26bTests(APITestCase):
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
        self.owner = user_model.objects.create_user(username='owner_26b', password='p', is_active=True)
        self.other = user_model.objects.create_user(username='other_26b', password='p', is_active=True)
        self.su = user_model.objects.create_user(
            username='su_26b', password='p', is_active=True, is_superuser=True, is_staff=True
        )

    def _hooks(self, view=None, attach=None, locked=None, company=None, kind='zz_doc'):
        return _hooks(view=view, attach=attach, locked=locked, company=company, kind=kind)

    def _upload(self, user, kind='zz_doc', entity_id='7', name='a.pdf', content=b'%PDF-1.4 test', label=''):
        return _upload(
            user, kind=kind, entity_id=entity_id, name=name, content=content, label=label, client=self.client
        )

    def test_list_denied_without_can_view(self):
        self.client.force_authenticate(self.owner)
        res = self.client.get('/api/attachments/?kind=zz_doc&id=7')
        self.assertEqual(res.status_code, 403)

    def test_upload_denied_without_can_attach(self):
        with self._hooks(view=True):
            res = self._upload(self.owner)
            self.assertEqual(res.status_code, 403)
            self.assertEqual(Attachment.objects.count(), 0)

    def test_upload_ok_sha256_company(self):
        content = b'%PDF-1.4 test upload sha256 and company'
        expected_sha = hashlib.sha256(content).hexdigest()
        with self._hooks(view=True, attach=True, company=42):
            res = self._upload(self.owner, content=content)
            self.assertEqual(res.status_code, 201)
            pk = res.data['id']

            row = Attachment.objects.get(pk=pk)
            self.assertEqual(row.sha256, expected_sha)
            self.assertEqual(row.company_id, 42)
            self.assertEqual(row.storage, 'server')
            self.assertEqual(row.uploaded_by, self.owner)

            self.client.force_authenticate(self.owner)
            list_res = self.client.get('/api/attachments/?kind=zz_doc&id=7')
            self.assertEqual(list_res.status_code, 200)
            self.assertEqual(len(list_res.data), 1)
            self.assertTrue(list_res.data[0]['download_url'].endswith('/download/'))

    def test_delete_locked_refused(self):
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner)
            self.assertEqual(res.status_code, 201)
            pk = res.data['id']

        with self._hooks(view=True, attach=True, locked=True):
            self.client.force_authenticate(self.owner)
            del_owner = self.client.delete(f'/api/attachments/{pk}/')
            self.assertEqual(del_owner.status_code, 409)

            row = Attachment.objects.get(pk=pk)
            self.assertIsNone(row.archived_at)

            self.client.force_authenticate(self.su)
            del_su = self.client.delete(f'/api/attachments/{pk}/')
            self.assertEqual(del_su.status_code, 409)

            row.refresh_from_db()
            self.assertIsNone(row.archived_at)

    def test_replace_locked_refused(self):
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner)
            self.assertEqual(res.status_code, 201)
            pk = res.data['id']

        with self._hooks(view=True, attach=True, locked=True):
            self.client.force_authenticate(self.owner)
            f = SimpleUploadedFile('b.pdf', b'%PDF-1.4 replace locked', content_type='application/pdf')
            rep_res = self.client.post(f'/api/attachments/{pk}/replace/', {'file': f}, format='multipart')
            self.assertEqual(rep_res.status_code, 409)
            self.assertEqual(Attachment.objects.count(), 1)

    def test_soft_delete_keeps_file(self):
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner, content=b'%PDF-1.4 soft delete test')
            self.assertEqual(res.status_code, 201)
            pk = res.data['id']

        row = Attachment.objects.get(pk=pk)
        path = row.file.path

        with self._hooks(view=True, attach=True):
            self.client.force_authenticate(self.owner)
            del_res = self.client.delete(f'/api/attachments/{pk}/')
            self.assertEqual(del_res.status_code, 204)

        row.refresh_from_db()
        self.assertIsNotNone(row.archived_at)
        self.assertTrue(os.path.exists(path))

        with self._hooks(view=True):
            self.client.force_authenticate(self.owner)
            list_res = self.client.get('/api/attachments/?kind=zz_doc&id=7')
            self.assertEqual(list_res.status_code, 200)
            self.assertEqual(len(list_res.data), 0)

            down_owner = self.client.get(f'/api/attachments/{pk}/download/')
            self.assertEqual(down_owner.status_code, 404)

        self.client.force_authenticate(self.su)
        down_su = self.client.get(f'/api/attachments/{pk}/download/')
        self.assertEqual(down_su.status_code, 200)

    def test_replace_archives_old(self):
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner, content=b'%PDF-1.4 old version')
            self.assertEqual(res.status_code, 201)
            old_pk = res.data['id']

            self.client.force_authenticate(self.owner)
            f2 = SimpleUploadedFile('new.pdf', b'%PDF-1.4 new version', content_type='application/pdf')
            rep_res = self.client.post(f'/api/attachments/{old_pk}/replace/', {'file': f2}, format='multipart')
            self.assertEqual(rep_res.status_code, 201)
            new_pk = rep_res.data['id']

        old_row = Attachment.objects.get(pk=old_pk)
        self.assertIsNotNone(old_row.archived_at)
        self.assertEqual(old_row.replaced_by_id, new_pk)

        with self._hooks(view=True):
            self.client.force_authenticate(self.owner)
            list_res = self.client.get('/api/attachments/?kind=zz_doc&id=7')
            self.assertEqual(list_res.status_code, 200)
            self.assertEqual(len(list_res.data), 1)
            self.assertEqual(list_res.data[0]['id'], new_pk)

    def test_download_checks_can_view_each_request(self):
        content = b'%PDF-1.4 download check content'
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner, content=content)
            self.assertEqual(res.status_code, 201)
            pk = res.data['id']

        url = f'/api/attachments/{pk}/download/'
        self.client.force_authenticate(self.owner)

        with self._hooks(view=True):
            res_ok = self.client.get(url)
            self.assertEqual(res_ok.status_code, 200)
            body = b''.join(res_ok.streaming_content)
            self.assertEqual(body, content)

        with self._hooks(view=False):
            res_denied = self.client.get(url)
            self.assertEqual(res_denied.status_code, 403)

    def test_media_attachments_always_forbidden(self):
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner)
            self.assertEqual(res.status_code, 201)

        name = Attachment.objects.get().file.name
        e = _current_expiry()
        s = _signature(name, e)
        res = self.client.get(f'/media/{name}?e={e}&s={s}')
        self.assertEqual(res.status_code, 403)

        res_dotdot = self.client.get(f'/media/x/../{name}')
        self.assertEqual(res_dotdot.status_code, 403)

    def test_personnel_docs_requires_signature(self):
        p_path = os.path.join(settings.MEDIA_ROOT, 'personnel_docs', 'p.pdf')
        os.makedirs(os.path.dirname(p_path), exist_ok=True)
        with open(p_path, 'wb') as f:
            f.write(b'%PDF-1.4 personnel doc')

        self.client.logout()

        res_p_raw = self.client.get('/media/personnel_docs/p.pdf')
        self.assertEqual(res_p_raw.status_code, 403)

        url_p = signed_media_url('personnel_docs/p.pdf')
        res_p_signed = self.client.get(url_p)
        self.assertEqual(res_p_signed.status_code, 200)

        v_path = os.path.join(settings.MEDIA_ROOT, 'vehicle_docs', '2026', '01', 'v.pdf')
        os.makedirs(os.path.dirname(v_path), exist_ok=True)
        with open(v_path, 'wb') as f:
            f.write(b'%PDF-1.4 vehicle doc')

        res_v_raw = self.client.get('/media/vehicle_docs/2026/01/v.pdf')
        self.assertEqual(res_v_raw.status_code, 403)

        url_v = signed_media_url('vehicle_docs/2026/01/v.pdf')
        res_v_signed = self.client.get(url_v)
        self.assertEqual(res_v_signed.status_code, 200)

    def test_user_signature_self_only(self):
        png_content = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06'
            b'\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01'
            b'\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        res = self._upload(
            self.owner,
            kind='user',
            entity_id=str(self.owner.pk),
            name='sig.png',
            content=png_content,
            label='signature',
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['storage'], 'server')
        pk = res.data['id']

        res_other_up = self._upload(
            self.other,
            kind='user',
            entity_id=str(self.owner.pk),
            name='sig.png',
            content=png_content,
            label='signature',
        )
        self.assertEqual(res_other_up.status_code, 403)

        self.client.force_authenticate(self.other)
        res_other_list = self.client.get(f'/api/attachments/?kind=user&id={self.owner.pk}')
        self.assertEqual(res_other_list.status_code, 403)

        res_other_down = self.client.get(f'/api/attachments/{pk}/download/')
        self.assertEqual(res_other_down.status_code, 403)

        self.client.force_authenticate(self.owner)
        res_owner_down = self.client.get(f'/api/attachments/{pk}/download/')
        self.assertEqual(res_owner_down.status_code, 200)

    def test_bad_kind_rejected(self):
        with self._hooks(view=True, attach=True):
            res = self._upload(self.owner, kind='Bad-Kind', entity_id='7')
            self.assertEqual(res.status_code, 400)
