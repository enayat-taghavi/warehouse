import io
import re
import shutil
import tempfile
from unittest.mock import MagicMock, patch

import PIL.Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from reportlab.platypus import Image as ReportLabImage
from rest_framework.test import APIClient, APITestCase

from attachments.models import Attachment, EntityViewLog
import platform_core.registry
from reports.document_pdf import (
    Image,
    PrintableDocument,
    Signer,
    _rtl_lines,
    read_verify_token,
    render_document_pdf,
    signer_images,
    verify_token,
)


def make_doc(**kw):
    defaults = {
        'company_id': None,
        'title': 'Test title',
        'number': '1404-17',
        'attachments_count': 1,
        'paragraphs': ['Body text'],
    }
    defaults.update(kw)
    return PrintableDocument(**defaults)


class DocumentPdf27bTests(APITestCase):
    def setUp(self):
        super().setUp()
        user_model = get_user_model()
        self.s = user_model.objects.create_user(
            username='su_27b', password='p', is_active=True, is_superuser=True, is_staff=True
        )
        self.u = user_model.objects.create_user(
            username='user_27b', password='p', is_active=True, is_staff=False
        )

    def test_pdf_a4_and_a5_bytes(self):
        a4_bytes = render_document_pdf(make_doc(size='A4'))
        a5_bytes = render_document_pdf(make_doc(size='A5'))
        self.assertTrue(a4_bytes.startswith(b'%PDF'))
        self.assertTrue(a5_bytes.startswith(b'%PDF'))
        self.assertIn(b'/MediaBox [ 0 0 595.2756 841.8898 ]', a4_bytes)
        self.assertIn(b'/MediaBox [ 0 0 419.5276 595.2756 ]', a5_bytes)

    def test_persian_text_reshaped(self):
        that_title = 'سلام دنیا'
        with patch('reports.document_pdf._rtl_lines', wraps=_rtl_lines) as mock_rtl:
            render_document_pdf(make_doc(title=that_title))
            self.assertTrue(mock_rtl.called)
            self.assertEqual(mock_rtl.call_args_list[0][0][0], that_title)

        lines = _rtl_lines(that_title, 'Helvetica', 12, 500)
        self.assertEqual(len(lines), 1)
        self.assertNotEqual(lines[0], that_title)

    def test_print_requires_can_view(self):
        self.client.force_authenticate(self.u)
        hooks_denied = {
            'can_view:zz_doc': [lambda user, eid: False],
            'printable:zz_doc': [lambda user, eid: make_doc()],
        }
        with patch.dict(platform_core.registry._CONTRIBUTIONS, hooks_denied):
            res = self.client.get('/api/print/zz_doc/5/pdf/')
            self.assertEqual(res.status_code, 404)

        hooks_no_view = {
            'printable:zz_doc': [lambda user, eid: make_doc()],
        }
        with patch.dict(platform_core.registry._CONTRIBUTIONS, hooks_no_view):
            res = self.client.get('/api/print/zz_doc/5/pdf/')
            self.assertEqual(res.status_code, 404)

    def test_unknown_kind_404(self):
        self.client.force_authenticate(self.s)
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {}, clear=False):
            res = self.client.get('/api/print/zz_unknown/5/pdf/')
            self.assertEqual(res.status_code, 404)

    def test_hook_error_or_none_404(self):
        self.client.force_authenticate(self.u)

        def _raise_err(user, eid):
            raise RuntimeError('boom')

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [lambda user, eid: True], 'printable:zz_doc': [_raise_err]}):
            res = self.client.get('/api/print/zz_doc/5/pdf/')
            self.assertEqual(res.status_code, 404)

        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'can_view:zz_doc': [lambda user, eid: True], 'printable:zz_doc': [lambda user, eid: None]}):
            res = self.client.get('/api/print/zz_doc/5/pdf/')
            self.assertEqual(res.status_code, 404)

    def test_print_ok_no_store_and_view_log(self):
        self.client.force_authenticate(self.u)
        allowed_hooks = {
            'can_view:zz_doc': [lambda user, eid: True],
            'printable:zz_doc': [lambda user, eid: make_doc()],
        }
        with patch.dict(platform_core.registry._CONTRIBUTIONS, allowed_hooks):
            res = self.client.get('/api/print/zz_doc/5/pdf/?size=A5')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res['Content-Type'], 'application/pdf')
            self.assertEqual(res['Cache-Control'], 'no-store')
            body = b''.join(res.streaming_content) if getattr(res, 'streaming', False) else res.content
            self.assertTrue(body.startswith(b'%PDF'))
            self.assertEqual(
                EntityViewLog.objects.filter(user=self.u, entity_kind='zz_doc', entity_id='5').count(), 1
            )

    def test_unsigned_signer_image_not_drawn(self):
        buf = io.BytesIO()
        PIL.Image.new('RGB', (10, 10)).save(buf, format='PNG')
        png_bytes = buf.getvalue()

        tmp_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(tmp_dir, ignore_errors=True))
        with override_settings(MEDIA_ROOT=tmp_dir):
            Attachment.objects.create(
                entity_kind='user',
                entity_id=str(self.u.pk),
                label='signature',
                status=Attachment.STATUS_ACCEPTED,
                file=SimpleUploadedFile('s.png', png_bytes, content_type='image/png'),
            )
            self.assertEqual(signer_images(Signer('A', 'R', self.u.pk, False)), [])
            self.assertEqual(len(signer_images(Signer('A', 'R', self.u.pk, True))), 1)

            with patch('reports.document_pdf.Image', wraps=ReportLabImage) as mock_img:
                render_document_pdf(make_doc(signers=[Signer('A', 'R', self.u.pk, False)]))
                self.assertEqual(mock_img.call_count, 0)
                render_document_pdf(make_doc(signers=[Signer('A', 'R', self.u.pk, True)]))
                self.assertEqual(mock_img.call_count, 1)

    def test_archived_signature_not_used(self):
        buf = io.BytesIO()
        PIL.Image.new('RGB', (10, 10)).save(buf, format='PNG')
        png_bytes = buf.getvalue()

        tmp_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(tmp_dir, ignore_errors=True))
        with override_settings(MEDIA_ROOT=tmp_dir):
            Attachment.objects.create(
                entity_kind='user',
                entity_id=str(self.u.pk),
                label='signature',
                status=Attachment.STATUS_ACCEPTED,
                file=SimpleUploadedFile('s.png', png_bytes, content_type='image/png'),
                archived_at=timezone.now(),
            )
            self.assertEqual(signer_images(Signer('A', 'R', self.u.pk, True)), [])

    def test_verify_valid_and_tampered(self):
        t = verify_token('zz_doc', 5, '1404-17', title='Test title', date='1404/08/04')
        anon_client = APIClient()
        res = anon_client.get(f'/api/public/verify/{t}/')
        self.assertEqual(res.status_code, 200)
        self.assertIs(res.data.get('valid'), True)
        self.assertEqual(res.data.get('number'), '1404-17')
        self.assertEqual(res.data.get('title'), 'Test title')
        self.assertEqual(res.data.get('date'), '1404/08/04')
        self.assertNotIn('amount', res.data)

        tampered = t[:-1] + ('A' if t[-1] != 'A' else 'B')
        res_tampered = anon_client.get(f'/api/public/verify/{tampered}/')
        self.assertEqual(res_tampered.status_code, 200)
        self.assertEqual(res_tampered.data, {'valid': False})

        res_garbage = anon_client.get('/api/public/verify/garbage/')
        self.assertEqual(res_garbage.status_code, 200)
        self.assertEqual(res_garbage.data, {'valid': False})

    def test_verify_confidential_hides_title(self):
        t = verify_token('zz_doc', 5, '1404-17', title='Test title', date='1404/08/04')
        anon_client = APIClient()
        with patch.dict(platform_core.registry._CONTRIBUTIONS, {'is_confidential:zz_doc': [lambda eid: True]}):
            res = anon_client.get(f'/api/public/verify/{t}/')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data, {'valid': True, 'number': '1404-17'})

        secret_token = verify_token('zz_doc', 5, '9', title='Secret', confidential=True)
        data = read_verify_token(secret_token)
        self.assertNotIn('t', data)

    def test_print_token_in_pdf_is_verifiable(self):
        self.client.force_authenticate(self.u)
        allowed_hooks = {
            'can_view:zz_doc': [lambda user, eid: True],
            'printable:zz_doc': [lambda user, eid: make_doc()],
        }
        with patch.dict(platform_core.registry._CONTRIBUTIONS, allowed_hooks):
            with patch('reports.document_views.render_document_pdf', MagicMock(return_value=b'%PDF-1.4 x')) as mock_render:
                res = self.client.get('/api/print/zz_doc/5/pdf/')
                self.assertEqual(res.status_code, 200)
                self.assertTrue(mock_render.called)
                doc = mock_render.call_args[0][0]
                self.assertIn('/verify/', doc.verify_url)
                token = doc.verify_url.split('/verify/')[1].strip('/')
                token_data = read_verify_token(token)
                self.assertIsNotNone(token_data)
                self.assertEqual(token_data['n'], '1404-17')
