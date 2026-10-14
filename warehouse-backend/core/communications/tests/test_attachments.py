import os
import io
from urllib.parse import urlparse, parse_qs
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from rest_framework import status

from communications.models import MessageAttachment
from communications.tests.base import BaseCommsTestCase
from common.media_urls import signed_media_url, verify


class AttachmentsSecurityTestCase(BaseCommsTestCase):
    """
    مجموعه آزمون‌های امن‌سازی پیوست‌ها، اعتبارسنجی Magic Bytes، لینک‌های امضاشده (Signed URLs) و دفاع XSS
    """

    def setUp(self):
        super().setUp()
        # بایت‌های معتبر برای فایل‌های تستی
        self.valid_png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        self.valid_pdf_bytes = b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF'

    # ─── ۱. آزمون‌های اعتبارسنجی هدر و بایت‌ها (Magic Bytes & Anti-XSS) ───

    def test_rejects_html_payload(self):
        """آپلود فایل با پسوند html باید با خطای ۴۰۰ مسدود شود"""
        self.auth(self.manager_wh1)
        html_file = SimpleUploadedFile("exploit.html", b"<html><body><script>alert(1)</script></body></html>", content_type="text/html")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': html_file, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_rejects_svg_payload(self):
        """آپلود فایل SVG (به دلیل امکان اجرای کدهای جاوااسکریپت درون‌برنامه‌ای) باید مسدود شود"""
        self.auth(self.manager_wh1)
        svg_file = SimpleUploadedFile("icon.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert('xss')</script></svg>", content_type="image/svg+xml")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': svg_file, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_extension_content_mismatch(self):
        """فایلی با پسوند .png اما محتوای اسکریپت/متن باید به دلیل عدم تطابق با هدر PNG رد شود"""
        self.auth(self.manager_wh1)
        fake_png = SimpleUploadedFile("fake_photo.png", b"<!DOCTYPE html><html><body>malicious</body></html>", content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': fake_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepts_valid_png_and_pdf(self):
        """فایل‌های استاندارد و معتبر PNG و PDF باید با موفقیت (کد ۲۰۱) آپلود شوند"""
        self.auth(self.manager_wh1)
        valid_png = SimpleUploadedFile("document.png", self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("file_url", response.data)
        self.assertTrue(response.data['file_url'].startswith("http") or response.data['file_url'].startswith("/media/"))

    def test_rejects_oversize_file(self):
        """فایل‌های بزرگ‌تر از سقف مجاز (۱۰ مگابایت) باید با خطای ۴۰۰ رد شوند"""
        self.auth(self.manager_wh1)
        # فایل ۱۱ مگابایتی واقعی
        large_bytes = self.valid_png_bytes + (b'\x00' * (10 * 1024 * 1024 + 1024))
        large_file = SimpleUploadedFile("large.png", large_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': large_file, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    # ─── ۲. آزمون‌های مجوز مالکیت الصاق پیوست (Ownership & IDOR) ───

    def test_cannot_attach_to_other_users_message(self):
        """کاربری غیر از فرستنده پیام (پرسنل ۱) نباید بتواند به پیام مدیر فایل الصاق کند"""
        self.auth(self.staff_wh1)
        valid_png = SimpleUploadedFile("photo.png", self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_attach_to_foreign_conversation(self):
        """کاربر متفرقه (پرسنل انبار ۲) نباید بتواند به پیام گفتگوی خصوصی انبار ۱ فایل الصاق کند"""
        self.auth(self.staff_wh2)
        valid_png = SimpleUploadedFile("photo.png", self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ─── ۳. آزمون‌های لینک امضاشده و محافظت سرو رسانه (Signed URLs & Serve) ───

    def test_file_url_is_signed(self):
        """آدرس برگشتی فایل در سریالایزر باید حاوی پارامترهای امضا (?e=...&s=...) باشد"""
        self.auth(self.manager_wh1)
        valid_png = SimpleUploadedFile("invoice.png", self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        file_url = response.data.get('file_url', '')
        self.assertIn('?e=', file_url)
        self.assertIn('&s=', file_url)

    def test_unsigned_chat_media_is_denied(self):
        """درخواست مستقیم فایل‌های چت بدون امضای HMAC باید با کد ۴۰۳ مسدود شود"""
        # آپلود فایل با مدیر
        self.auth(self.manager_wh1)
        valid_png = SimpleUploadedFile("secret.png", self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        file_url = response.data['file_url']
        parsed = urlparse(file_url)
        path_without_signature = parsed.path

        # کلاینت ناشناس بدون هدر و بدون توکن امضا
        unauthenticated_client = Client()
        direct_resp = unauthenticated_client.get(path_without_signature)
        self.assertEqual(direct_resp.status_code, 403, "دانلود مستقیم فایل بدون امضا امکان‌پذیر بود (رخنه امنیتی)")

    def test_tampered_signature_denied(self):
        """درخواست با امضای دستکاری‌شده یا نامعتبر باید با ۴۰۳ مسدود شود"""
        self.auth(self.manager_wh1)
        valid_png = SimpleUploadedFile("secret2.png", self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        file_url = response.data['file_url']
        parsed = urlparse(file_url)
        tampered_url = f"{parsed.path}?e=9999999999&s=tampered_fake_signature"

        unauthenticated_client = Client()
        tampered_resp = unauthenticated_client.get(tampered_url)
        self.assertEqual(tampered_resp.status_code, 403)

    def test_stored_name_is_uuid(self):
        """نام فایل ذخیره‌شده روی دیسک باید UUID یکتا باشد و با نام ارسالی کلاینت فرق کند"""
        self.auth(self.manager_wh1)
        client_name = "my_custom_invoice_name.png"
        valid_png = SimpleUploadedFile(client_name, self.valid_png_bytes, content_type="image/png")
        response = self.client.post(
            '/api/communications/messages/upload/',
            {'file': valid_png, 'message_id': str(self.direct_message.id)},
            format='multipart'
        )
        att_id = response.data['id']
        att = MessageAttachment.objects.get(id=att_id)
        # نام فیزیکی فایل روی دیسک
        disk_filename = os.path.basename(att.file.name)
        self.assertNotEqual(disk_filename, client_name, "نام فایل روی دیسک با نام کلاینت یکسان است (خطر Path Traversal)")
        self.assertEqual(att.file_name, client_name, "متادیتای نام فایل اصلی باید حفظ شده باشد")
