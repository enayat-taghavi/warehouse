import time
from urllib.parse import quote
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings, RequestFactory
from django.http import HttpResponseForbidden, HttpResponse
from common.media_urls import (
    signed_media_url,
    serve_media,
    is_protected,
    verify,
    _signature,
    _current_expiry,
    PROTECTED_PREFIXES
)


class MediaUrlsAndAccelRedirectTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_is_protected_prefixes(self):
        """Path matching protected prefix is protected, other paths are not."""
        for prefix in PROTECTED_PREFIXES:
            self.assertTrue(is_protected(f"{prefix}test_file.png"))
            self.assertTrue(is_protected(f"/{prefix}subfolder/image.jpg"))

        self.assertFalse(is_protected("company_logos/logo.png"))
        self.assertFalse(is_protected("public/banner.jpg"))
        self.assertFalse(is_protected(""))

    def test_signed_media_url_generation(self):
        """Signed URL includes expiry and HMAC signature for protected assets."""
        url = signed_media_url("item_photos/item123.jpg")
        self.assertIn("/media/item_photos/item123.jpg?", url)
        self.assertIn("e=", url)
        self.assertIn("s=", url)

        # Unprotected path gets plain URL without query parameters
        unprotected_url = signed_media_url("company_logos/logo.png")
        self.assertEqual(unprotected_url, "/media/company_logos/logo.png")

    def test_verify_signature(self):
        """Valid signatures pass, expired or tampered signatures fail."""
        path = "chat_attachments/doc.pdf"
        expiry = _current_expiry()
        sig = _signature(path, expiry)

        # 1. Valid signature
        self.assertTrue(verify(path, str(expiry), sig))

        # 2. Tampered path
        self.assertFalse(verify("chat_attachments/other.pdf", str(expiry), sig))

        # 3. Tampered signature
        self.assertFalse(verify(path, str(expiry), "bad_signature_hex"))

        # 4. Expired signature
        past_expiry = int(time.time()) - 100
        past_sig = _signature(path, past_expiry)
        self.assertFalse(verify(path, str(past_expiry), past_sig))

        # 5. Invalid expiry format
        self.assertFalse(verify(path, "invalid_num", sig))

    def test_serve_media_forbidden_when_unauthorized(self):
        """Protected asset without valid query signature returns 403 Forbidden."""
        req = self.factory.get("/media/item_photos/secret.png")
        resp = serve_media(req, "item_photos/secret.png")
        self.assertIsInstance(resp, HttpResponseForbidden)

    @override_settings(MEDIA_ACCEL_REDIRECT=True)
    def test_serve_media_x_accel_redirect_enabled(self):
        """When MEDIA_ACCEL_REDIRECT is True, response has X-Accel-Redirect header and 200 status."""
        path = "item_photos/sample.png"
        expiry = _current_expiry()
        sig = _signature(path, expiry)

        req = self.factory.get(f"/media/{path}?e={expiry}&s={sig}")
        resp = serve_media(req, path)

        self.assertEqual(resp.status_code, 200)
        self.assertIn("X-Accel-Redirect", resp)
        self.assertEqual(resp["X-Accel-Redirect"], f"/internal_media/{quote(path)}")
        self.assertEqual(resp["Content-Type"], "image/png")
        self.assertEqual(resp["X-Content-Type-Options"], "nosniff")
        self.assertEqual(resp["X-Frame-Options"], "SAMEORIGIN")
        self.assertIn("Cache-Control", resp)
        self.assertIn("immutable", resp["Cache-Control"])

    @override_settings(MEDIA_ACCEL_REDIRECT=True)
    def test_serve_media_content_disposition_attachment(self):
        """Non-image non-pdf or explicit download requests get Content-Disposition attachment."""
        path = "chat_attachments/archive.zip"
        expiry = _current_expiry()
        sig = _signature(path, expiry)

        req = self.factory.get(f"/media/{path}?e={expiry}&s={sig}")
        resp = serve_media(req, path)

        self.assertEqual(resp.status_code, 200)
        self.assertIn("Content-Disposition", resp)
        self.assertIn("attachment;", resp["Content-Disposition"])

    @override_settings(MEDIA_ACCEL_REDIRECT=False)
    @patch("common.media_urls.serve")
    def test_serve_media_accel_redirect_disabled_fallback(self, mock_django_serve):
        """When MEDIA_ACCEL_REDIRECT is False, falls back to standard django.views.static.serve."""
        mock_django_serve.return_value = HttpResponse(b"file_bytes", content_type="image/jpeg")

        path = "item_photos/sample.jpg"
        expiry = _current_expiry()
        sig = _signature(path, expiry)

        req = self.factory.get(f"/media/{path}?e={expiry}&s={sig}")
        resp = serve_media(req, path)

        mock_django_serve.assert_called_once()
        self.assertNotIn("X-Accel-Redirect", resp)
        self.assertEqual(resp.status_code, 200)
