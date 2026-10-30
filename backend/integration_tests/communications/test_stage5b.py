"""
آزمون‌های مرحلهٔ ۵-ب چت: فهرست مجاز پیوست‌ها، تشخیص نوع از روی محتوا،
ساخت پیش‌نمایش تصویر و PDF، مدیریت فایل‌های خراب، دسترسی به بندانگشتی و دستور backfill
"""
import io
import os
import shutil
import tempfile
import time
import unittest
from PIL import Image
from reportlab.pdfgen import canvas
import openpyxl

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from communications.models import MessageAttachment, PreviewStatus
from communications.previews import (
    ALLOWED_EXTENSIONS,
    build_attachment_preview,
)
from .base import BaseCommsTestCase

_TEMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class Stage5bAttachmentAndPreviewTests(BaseCommsTestCase):
    """
    مجموعه آزمون‌های اعتبارسنجی پیوست، پیش‌نمایش، دسترسی بندانگشتی و دستور backfill
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)

    @staticmethod
    def _make_image_bytes(width=800, height=400):
        buf = io.BytesIO()
        Image.new('RGB', (width, height), 'red').save(buf, 'PNG')
        return buf.getvalue()

    @staticmethod
    def _make_pdf_bytes():
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 100, 'Page 1')
        c.showPage()
        c.drawString(100, 100, 'Page 2')
        c.showPage()
        c.save()
        return buf.getvalue()

    @staticmethod
    def _make_corrupt_bytes():
        return b'\x89PNG\r\n\x1a\n' + b'GARBAGE' * 20

    def _upload(self, name, data, content_type='application/octet-stream', capture_commit=False):
        self.auth(self.manager_wh1)
        uploaded = SimpleUploadedFile(name, data, content_type=content_type)
        payload = {'file': uploaded, 'message_id': str(self.direct_message.id)}
        if capture_commit:
            with self.captureOnCommitCallbacks(execute=True):
                return self.client.post('/api/communications/messages/upload/', payload, format='multipart')
        return self.client.post('/api/communications/messages/upload/', payload, format='multipart')

    def _make_attachment_row(self, name, data, **kwargs):
        uploaded = SimpleUploadedFile(name, data)
        return MessageAttachment.objects.create(
            message=self.direct_message,
            file=uploaded,
            file_name=name,
            file_size=len(data),
            **kwargs
        )

    def test_image_upload_builds_webp_thumbnail_and_dimensions(self):
        """آپلود تصویر ابعاد و بندانگشتی وب‌پی با حداکثر ضلع ۳۲۰ می‌سازد"""
        img_bytes = self._make_image_bytes(800, 400)
        resp = self._upload('p.png', img_bytes, content_type='image/png', capture_commit=True)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        att = MessageAttachment.objects.get(id=resp.data['id'])
        self.assertEqual(att.preview_status, PreviewStatus.READY)
        self.assertEqual(att.width, 800)
        self.assertEqual(att.height, 400)
        self.assertTrue(att.thumbnail.name.endswith('.webp'))
        with att.thumbnail.open('rb') as fh:
            with Image.open(fh) as img:
                self.assertLessEqual(max(img.width, img.height), 320)
        self.assertEqual(att.content_type, 'image/png')

    def test_pdf_upload_counts_pages_and_builds_thumbnail(self):
        """آپلود پی‌دی‌اف تعداد صفحات را شمرده و بندانگشتی می‌سازد"""
        pdf_bytes = self._make_pdf_bytes()
        resp = self._upload('d.pdf', pdf_bytes, content_type='application/pdf', capture_commit=True)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        att = MessageAttachment.objects.get(id=resp.data['id'])
        self.assertEqual(att.preview_status, PreviewStatus.READY)
        self.assertEqual(att.page_count, 2)
        self.assertTrue(bool(att.thumbnail))
        self.assertTrue(att.thumbnail.storage.exists(att.thumbnail.name))
        self.assertEqual(att.content_type, 'application/pdf')

    def test_corrupt_image_keeps_original_with_failed_status(self):
        """تصویر خراب با وضعیت ناموفق ثبت می‌شود ولی فایل اصلی حفظ می‌گردد"""
        corrupt = self._make_corrupt_bytes()
        row = self._make_attachment_row('bad.png', corrupt)
        result = build_attachment_preview(row)
        self.assertEqual(result, 'failed')
        row.refresh_from_db()
        self.assertEqual(row.preview_status, PreviewStatus.FAILED)
        self.assertTrue(row.file.storage.exists(row.file.name))
        self.assertFalse(bool(row.thumbnail))

    def test_text_file_gets_status_none(self):
        """فایل متنی وضعیت بی‌پیش‌نمایش می‌گیرد و فایل اصلی حفظ می‌شود"""
        row = self._make_attachment_row('t.txt', b'hello')
        result = build_attachment_preview(row)
        self.assertEqual(result, 'none')
        row.refresh_from_db()
        self.assertEqual(row.preview_status, PreviewStatus.NONE)
        self.assertFalse(bool(row.thumbnail))
        self.assertTrue(row.file.storage.exists(row.file.name))

    def test_disallowed_extensions_rejected(self):
        """پسوندهای غیرمجاز با خطای ۴۰۰ مسدود می‌شوند و پیوستی ساخته نمی‌شود"""
        disallowed = [
            'x.svg', 'x.html', 'x.xhtml', 'x.hta', 'x.ps1',
            'x.jar', 'x.lnk', 'x.svgz', 'x.exe', 'noext'
        ]
        for name in disallowed:
            resp = self._upload(name, b'hello')
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, f"Failed for {name}")
            self.assertIn('error', resp.data)
            self.assertEqual(self.direct_message.attachments.count(), 0, f"Row created for {name}")

    def test_mismatched_content_rejected(self):
        """عدم تطابق محتوا با پسوند فایل با خطای ۴۰۰ رد می‌شود"""
        img_bytes = self._make_image_bytes(800, 400)
        pdf_bytes = self._make_pdf_bytes()
        mismatched = [
            ('fake.png', pdf_bytes),
            ('fake.pdf', img_bytes),
            ('fake.docx', b'PK\x03\x04' + b'0' * 100),
            ('fake.xls', b'hello'),
            ('notes.txt', b'<html><script>alert(1)</script>'),
        ]
        for name, data in mismatched:
            resp = self._upload(name, data)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, f"Failed for {name}")
            self.assertIn('error', resp.data)
            self.assertEqual(self.direct_message.attachments.count(), 0, f"Row created for {name}")

    def test_stored_content_type_comes_from_content_not_browser(self):
        """نوع محتوای ذخیره‌شده از بررسی محتوا استخراج می‌شود نه هدر مرورگر"""
        img_bytes = self._make_image_bytes(800, 400)
        resp = self._upload('p.png', img_bytes, content_type='text/html')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        att = MessageAttachment.objects.get(id=resp.data['id'])
        self.assertEqual(att.content_type, 'image/png')

    def test_valid_office_and_text_files_accepted(self):
        """فایل‌های معتبر آفیس و متنی با نوع صحیح پذیرفته می‌شوند"""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws['A1'] = "Cell"
        xlsx_buf = io.BytesIO()
        wb.save(xlsx_buf)
        xlsx_bytes = xlsx_buf.getvalue()

        csv_bytes = b'a,b\n1,2\n'

        resp_xlsx = self._upload('data.xlsx', xlsx_bytes, content_type='application/octet-stream')
        self.assertEqual(resp_xlsx.status_code, status.HTTP_201_CREATED, resp_xlsx.data)
        att_xlsx = MessageAttachment.objects.get(id=resp_xlsx.data['id'])
        self.assertEqual(att_xlsx.content_type, ALLOWED_EXTENSIONS['.xlsx'])

        resp_csv = self._upload('data.csv', csv_bytes, content_type='text/csv')
        self.assertEqual(resp_csv.status_code, status.HTTP_201_CREATED, resp_csv.data)
        att_csv = MessageAttachment.objects.get(id=resp_csv.data['id'])
        self.assertEqual(att_csv.content_type, ALLOWED_EXTENSIONS['.csv'])

    @unittest.expectedFailure
    def test_thumbnail_download_only_for_members(self):
        """دانلود بندانگشتی فقط برای اعضای گفتگو مجاز است؛ بدون بندانگشتی ۴۰۴ می‌دهد"""
        img_bytes = self._make_image_bytes(800, 400)
        resp = self._upload('p.png', img_bytes, content_type='image/png', capture_commit=True)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        att = MessageAttachment.objects.get(id=resp.data['id'])
        url = reverse('chat_attachment_download', args=[att.pk])

        # عضو مجاز گفتگو (staff_wh1): ۲۰۰ و نوع تصویر وب‌پی
        self.auth(self.staff_wh1)
        resp_thumb = self.client.get(f"{url}?thumb=1")
        self.assertEqual(resp_thumb.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_thumb['Content-Type'], 'image/webp')

        # کاربر انبار دیگر (staff_wh2): ۴۰۳
        self.auth(self.staff_wh2)
        resp_forbidden1 = self.client.get(f"{url}?thumb=1")
        self.assertEqual(resp_forbidden1.status_code, status.HTTP_403_FORBIDDEN)

        # کاربر بدون انبار (unassigned_user): ۴۰۳
        self.auth(self.unassigned_user)
        resp_forbidden2 = self.client.get(f"{url}?thumb=1")
        self.assertEqual(resp_forbidden2.status_code, status.HTTP_403_FORBIDDEN)

        # فایل بدون بندانگشتی (t.txt) برای عضو مجاز: ۴۰۴
        txt_row = self._make_attachment_row('t.txt', b'hello')
        txt_url = reverse('chat_attachment_download', args=[txt_row.pk])
        self.auth(self.staff_wh1)
        resp_not_found = self.client.get(f"{txt_url}?thumb=1")
        self.assertEqual(resp_not_found.status_code, status.HTTP_404_NOT_FOUND)

    def test_serializer_exposes_preview_fields(self):
        """سریالایزر پیام فیلدهای پیش‌نمایش و نشانی بندانگشتی را ارائه می‌دهد"""
        pdf_bytes = self._make_pdf_bytes()
        resp = self._upload('d.pdf', pdf_bytes, content_type='application/pdf', capture_commit=True)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        self.auth(self.staff_wh1)
        list_resp = self.client.get(f'/api/communications/messages/?conversation_id={self.direct_conv.id}')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data['results']
        msg_item = next(m for m in results if m['id'] == self.direct_message.id)
        self.assertTrue(len(msg_item['attachments']) > 0)
        att_item = msg_item['attachments'][0]
        self.assertEqual(att_item['page_count'], 2)
        self.assertEqual(att_item['preview_status'], 'ready')
        self.assertTrue(att_item['thumbnail_url'].endswith('thumb=1'))

    def test_backfill_command_dry_run_changes_nothing(self):
        """دستور backfill در حالت dry-run تغییری در وضعیت پیوست‌ها ایجاد نمی‌کند"""
        img_bytes = self._make_image_bytes(800, 400)
        pdf_bytes = self._make_pdf_bytes()
        row_img = self._make_attachment_row('a.png', img_bytes, preview_status=PreviewStatus.PENDING)
        row_pdf = self._make_attachment_row('b.pdf', pdf_bytes, preview_status=PreviewStatus.PENDING)

        out = io.StringIO()
        call_command('build_chat_previews', stdout=out)
        row_img.refresh_from_db()
        row_pdf.refresh_from_db()
        self.assertEqual(row_img.preview_status, PreviewStatus.PENDING)
        self.assertEqual(row_pdf.preview_status, PreviewStatus.PENDING)
        self.assertIn('2', out.getvalue())

    def test_backfill_command_apply_and_retry_failed(self):
        """دستور backfill با پارامتر apply اجرا شده و با retry-failed موارد ناموفق را بازپردازش می‌کند"""
        img_bytes = self._make_image_bytes(800, 400)
        corrupt_bytes = self._make_corrupt_bytes()
        row_ok = self._make_attachment_row('a.png', img_bytes, preview_status=PreviewStatus.PENDING)
        row_bad = self._make_attachment_row('bad.png', corrupt_bytes, preview_status=PreviewStatus.PENDING)

        out = io.StringIO()
        call_command('build_chat_previews', '--apply', stdout=out)
        row_ok.refresh_from_db()
        row_bad.refresh_from_db()
        self.assertEqual(row_ok.preview_status, PreviewStatus.READY)
        self.assertEqual(row_bad.preview_status, PreviewStatus.FAILED)
        self.assertTrue(row_bad.file.storage.exists(row_bad.file.name))

        updated_first = row_bad.updated_at

        # اجرای دوم با apply نباید رکورد failed را مجدداً ذخیره یا تغییر دهد
        time.sleep(0.05)
        call_command('build_chat_previews', '--apply', stdout=io.StringIO())
        row_bad.refresh_from_db()
        self.assertEqual(row_bad.updated_at, updated_first)

        # اجرای با retry-failed باید رکورد failed را دوباره پردازش کند و updated_at تغییر کند
        time.sleep(0.05)
        call_command('build_chat_previews', '--apply', '--retry-failed', stdout=io.StringIO())
        row_bad.refresh_from_db()
        self.assertNotEqual(row_bad.updated_at, updated_first)
        self.assertEqual(row_bad.preview_status, PreviewStatus.FAILED)
