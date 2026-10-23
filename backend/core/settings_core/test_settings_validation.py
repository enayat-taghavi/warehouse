from django.test import SimpleTestCase

from settings_core.services import (
    compute_settings_etag,
    is_strict_int,
    is_valid_app_version,
    is_valid_download_url,
    validate_settings_payload,
)


class SettingsPayloadValidationTests(SimpleTestCase):
    def test_is_strict_int(self):
        self.assertTrue(is_strict_int(5))
        self.assertFalse(is_strict_int(True))
        self.assertFalse(is_strict_int("5"))

    def test_is_valid_app_version(self):
        self.assertTrue(is_valid_app_version(""))
        self.assertTrue(is_valid_app_version("1.2.3"))
        self.assertFalse(is_valid_app_version("1.2"))
        self.assertFalse(is_valid_app_version("1.2.3.4"))
        self.assertFalse(is_valid_app_version("v1.2.3"))
        self.assertFalse(is_valid_app_version(123))

    def test_is_valid_download_url(self):
        self.assertTrue(is_valid_download_url(""))
        self.assertTrue(is_valid_download_url("https://example.com/app.apk"))
        self.assertFalse(is_valid_download_url("http://example.com/app.apk"))
        self.assertFalse(is_valid_download_url("https://example.com/app name.apk"))
        self.assertFalse(is_valid_download_url("https://example.com/" + ("a" * 501)))
        self.assertFalse(is_valid_download_url(123))

    def test_validate_settings_payload_non_dict(self):
        self.assertEqual(validate_settings_payload("not-a-dict"), ["__root__"])
        self.assertEqual(validate_settings_payload(123), ["__root__"])
        self.assertEqual(validate_settings_payload(None), ["__root__"])

    def test_validate_settings_payload_empty_dict(self):
        self.assertEqual(validate_settings_payload({}), [])

    def test_validate_settings_payload_unknown_key(self):
        self.assertEqual(
            validate_settings_payload({"unknown_key_xyz": "value"}),
            ["unknown_key_xyz"],
        )

    def test_validate_settings_payload_offline_sync_interval_minutes(self):
        self.assertEqual(
            validate_settings_payload({"offline_sync_interval_minutes": 0}),
            ["offline_sync_interval_minutes"],
        )
        self.assertEqual(
            validate_settings_payload({"offline_sync_interval_minutes": 1441}),
            ["offline_sync_interval_minutes"],
        )
        self.assertEqual(
            validate_settings_payload({"offline_sync_interval_minutes": 1}),
            [],
        )
        self.assertEqual(
            validate_settings_payload({"offline_sync_interval_minutes": 1440}),
            [],
        )

    def test_validate_settings_payload_offline_cache_ttl_minutes(self):
        self.assertEqual(
            validate_settings_payload({"offline_cache_ttl_minutes": -1}),
            ["offline_cache_ttl_minutes"],
        )
        self.assertEqual(
            validate_settings_payload({"offline_cache_ttl_minutes": 10081}),
            ["offline_cache_ttl_minutes"],
        )
        self.assertEqual(
            validate_settings_payload({"offline_cache_ttl_minutes": 0}),
            [],
        )

    def test_validate_settings_payload_chat_enabled(self):
        self.assertEqual(
            validate_settings_payload({"chat_enabled": 1}),
            ["chat_enabled"],
        )
        self.assertEqual(
            validate_settings_payload({"chat_enabled": True}),
            [],
        )

    def test_validate_settings_payload_system_version(self):
        self.assertEqual(
            validate_settings_payload({"system_version": ""}),
            ["system_version"],
        )
        self.assertEqual(
            validate_settings_payload({"system_version": "1.0"}),
            [],
        )

    def test_validate_settings_payload_app_version_and_download_url(self):
        payload = {
            "app_min_version": "1.2",
            "app_download_url_direct": "http://x",
        }
        invalid = validate_settings_payload(payload)
        self.assertIn("app_min_version", invalid)
        self.assertIn("app_download_url_direct", invalid)

    def test_compute_settings_etag(self):
        dict_a = {"offline_sync_interval_minutes": 15, "chat_enabled": True}
        dict_b = {"chat_enabled": True, "offline_sync_interval_minutes": 15}
        etag_a = compute_settings_etag(dict_a)
        etag_b = compute_settings_etag(dict_b)
        self.assertEqual(etag_a, etag_b)

        dict_c = {"offline_sync_interval_minutes": 30, "chat_enabled": True}
        self.assertNotEqual(etag_a, compute_settings_etag(dict_c))

        self.assertTrue(etag_a.startswith('"') and etag_a.endswith('"'))
        self.assertGreater(len(etag_a), 2)
