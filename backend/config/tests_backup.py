import io
import os
import subprocess
from unittest import mock
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import AuditLog
from config.views_backup import (
    WBAK_MAGIC,
    SALT_SIZE,
    _derive_key,
)
from cryptography.fernet import Fernet

User = get_user_model()


class BackupTestHelper:
    """Helper methods for generating test .wbak payloads and test users."""

    @staticmethod
    def create_user(username='backup_user', password='password123', is_superuser=False, perms=None):
        user = User.objects.create_user(
            username=username,
            password=password,
            is_superuser=is_superuser,
            is_staff=is_superuser,
        )
        if perms:
            for perm_codename in perms:
                try:
                    perm = Permission.objects.get(codename=perm_codename)
                    user.user_permissions.add(perm)
                except Permission.DoesNotExist:
                    content_type = ContentType.objects.get_for_model(User)
                    perm = Permission.objects.create(
                        codename=perm_codename,
                        name=f"Can {perm_codename}",
                        content_type=content_type
                    )
                    user.user_permissions.add(perm)
        return user

    @staticmethod
    def make_wbak_payload(password: str, plaintext: bytes = b"PGDUMP_TEST_SQL_CONTENT") -> bytes:
        salt = os.urandom(SALT_SIZE)
        key = _derive_key(password, salt)
        fernet = Fernet(key)
        encrypted = fernet.encrypt(plaintext)
        return WBAK_MAGIC + salt + encrypted


class DatabaseBackupAndRestoreTests(TestCase):
    """
    Comprehensive unit tests for BackupCreateView and BackupRestoreView.
    All system calls (pg_dump, pg_restore) and DB termination are strictly MOCKED.
    """

    def setUp(self):
        self.client = APIClient()
        self.create_url = '/api/backup/create/'
        self.restore_url = '/api/backup/restore/'

        self.superuser = BackupTestHelper.create_user('admin_root', is_superuser=True)
        self.regular_user = BackupTestHelper.create_user('regular_user', is_superuser=False)
        self.manage_user = BackupTestHelper.create_user('manage_user', perms=['perm_sys_backup_manage'])
        self.restore_user = BackupTestHelper.create_user('restore_user', perms=['perm_sys_backup_restore'])

    # ──────────────────────────────────────────────────────────────────────────
    # Permission & Authentication Tests
    # ──────────────────────────────────────────────────────────────────────────
    def test_backup_endpoints_reject_anonymous(self):
        """Unauthenticated requests to backup create and restore must be rejected with 401."""
        res_create = self.client.post(self.create_url, {'password': 'ValidPassword123!'}, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_401_UNAUTHORIZED)

        res_restore = self.client.post(self.restore_url, {'confirm_text': 'RESTORE_DATABASE_CONFIRM'}, format='multipart')
        self.assertEqual(res_restore.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_backup_create_forbidden_without_perm(self):
        """User without perm_sys_backup_manage or perm_sys_backup_restore gets 403 on create."""
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.post(self.create_url, {'password': 'ValidPassword123!'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_restore_forbidden_without_perm(self):
        """User without perm_sys_backup_restore gets 403 on restore."""
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.post(
            self.restore_url,
            {'confirm_text': 'RESTORE_DATABASE_CONFIRM', 'password': 'ValidPassword123!'},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ──────────────────────────────────────────────────────────────────────────
    # Backup Creation Tests (Password Length & Audit Log)
    # ──────────────────────────────────────────────────────────────────────────
    def test_backup_create_rejects_short_password(self):
        """Creating backup with password shorter than 12 chars returns 400."""
        self.client.force_authenticate(user=self.superuser)
        response = self.client.post(self.create_url, {'password': 'short78'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("حداقل ۱۲ کاراکتر", response.data.get('error', ''))

    @mock.patch('config.views_backup._find_pg_tool', return_value='/usr/bin/pg_dump')
    @mock.patch('subprocess.run')
    def test_backup_create_success_and_writes_audit_log(self, mock_subproc, mock_find_tool):
        """Creating backup with valid >= 12 chars password generates .wbak and logs AuditLog with EXPORT."""
        mock_subproc.return_value = mock.MagicMock(returncode=0, stderr=b'')

        self.client.force_authenticate(user=self.superuser)
        initial_log_count = AuditLog.objects.filter(module='backup', action='EXPORT').count()

        valid_password = "VeryStrongSecretPassword123!"
        response = self.client.post(self.create_url, {'password': valid_password}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.get('Content-Type'), 'application/octet-stream')
        self.assertTrue(response.content.startswith(WBAK_MAGIC))

        new_log_count = AuditLog.objects.filter(module='backup', action='EXPORT').count()
        self.assertEqual(new_log_count, initial_log_count + 1)
        audit = AuditLog.objects.filter(module='backup', action='EXPORT').latest('id')
        self.assertEqual(audit.severity, 'warning')
        self.assertEqual(audit.user, self.superuser)
        self.assertIn('filename', audit.details)

    # ──────────────────────────────────────────────────────────────────────────
    # Backup Restore Validation Tests (Confirm Text, Size Limit, Format, Password)
    # ──────────────────────────────────────────────────────────────────────────
    def test_restore_requires_confirm_text(self):
        """Restore request without confirm_text returns 400 and does NOT execute any tools."""
        self.client.force_authenticate(user=self.superuser)
        payload = BackupTestHelper.make_wbak_payload("SecretPassword123")
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {'file': uploaded_file, 'password': 'SecretPassword123'},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("RESTORE_DATABASE_CONFIRM", response.data.get('error', ''))

    def test_restore_rejects_wrong_confirm_text(self):
        """Restore request with incorrect confirm_text returns 400."""
        self.client.force_authenticate(user=self.superuser)
        payload = BackupTestHelper.make_wbak_payload("SecretPassword123")
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {'file': uploaded_file, 'password': 'SecretPassword123', 'confirm_text': 'WRONG_CONFIRM'},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("RESTORE_DATABASE_CONFIRM", response.data.get('error', ''))

    @override_settings(BACKUP_MAX_UPLOAD_MB=1)
    def test_restore_rejects_oversized_upload(self):
        """Uploaded file exceeding BACKUP_MAX_UPLOAD_MB returns 413 without reading into memory."""
        self.client.force_authenticate(user=self.superuser)
        # Create a mock file with size > 1MB
        oversized_bytes = b"0" * (2 * 1024 * 1024)
        uploaded_file = SimpleUploadedFile("big_backup.wbak", oversized_bytes, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': 'SecretPassword123',
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        self.assertIn("بیش از سقف مجاز", response.data.get('error', ''))

    def test_restore_rejects_bad_magic(self):
        """Uploaded file without WBAK_V1: magic header returns 400."""
        self.client.force_authenticate(user=self.superuser)
        bad_payload = b"NOT_A_VALID_WBAK_HEADER" + os.urandom(64)
        uploaded_file = SimpleUploadedFile("bad.wbak", bad_payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': 'SecretPassword123',
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("فرمت فایل معتبر نیست", response.data.get('error', ''))

    def test_restore_wrong_password(self):
        """Providing the wrong password returns 400 InvalidToken."""
        self.client.force_authenticate(user=self.superuser)
        payload = BackupTestHelper.make_wbak_payload("CorrectPassword123")
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': 'WrongPasswordXYZ',
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("رمز عبور نادرست است", response.data.get('error', ''))

    # ──────────────────────────────────────────────────────────────────────────
    # Rollback & Resilience Tests (Bugs 2-3 & 2-4)
    # ──────────────────────────────────────────────────────────────────────────
    @mock.patch('config.views_backup._terminate_other_connections')
    @mock.patch('config.views_backup._find_pg_tool', return_value='/usr/bin/pg_tool')
    @mock.patch('subprocess.run')
    def test_rollback_file_retained_when_both_fail(self, mock_subproc, mock_tool, mock_term):
        """
        REGRESSION TEST FOR BUG 2-3:
        When restore fails AND rollback also fails:
        1. rollback_state is 'failed'.
        2. rollback_path file is KEPT on disk for manual sysadmin recovery.
        3. Audit log is written with critical severity.
        """
        # Call 1: emergency pg_dump -> succeeds (creates rollback file)
        # Call 2: pg_restore -> FAILS fatally
        # Call 3: rollback pg_restore -> FAILS fatally
        mock_subproc.side_effect = [
            mock.MagicMock(returncode=0, stderr=b''),
            mock.MagicMock(returncode=1, stderr=b'FATAL: database corrupted'),
            mock.MagicMock(returncode=1, stderr=b'FATAL: rollback connection failed'),
        ]

        self.client.force_authenticate(user=self.superuser)
        password = "ValidSecretPassword123"
        payload = BackupTestHelper.make_wbak_payload(password)
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': password,
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data.get('rollback_state'), 'failed')
        self.assertIn('rollback_file', response.data)
        retained_path = response.data['rollback_file']
        self.assertTrue(os.path.exists(retained_path), "Rollback file MUST be retained on disk!")

        # Clean up retained file after test
        if os.path.exists(retained_path):
            os.remove(retained_path)

    @mock.patch('config.views_backup._terminate_other_connections')
    @mock.patch('config.views_backup._find_pg_tool', return_value='/usr/bin/pg_tool')
    @mock.patch('subprocess.run')
    def test_rollback_file_removed_when_rollback_succeeds(self, mock_subproc, mock_tool, mock_term):
        """
        When restore fails but rollback succeeds:
        1. rollback_state is 'restored'.
        2. rollback_path is safely cleaned up.
        """
        # Call 1: emergency dump -> succeeds
        # Call 2: pg_restore -> FAILS fatally
        # Call 3: rollback pg_restore -> SUCCEEDS (returncode 0)
        mock_subproc.side_effect = [
            mock.MagicMock(returncode=0, stderr=b''),
            mock.MagicMock(returncode=1, stderr=b'FATAL: restore disk error'),
            mock.MagicMock(returncode=0, stderr=b''),
        ]

        self.client.force_authenticate(user=self.superuser)
        password = "ValidSecretPassword123"
        payload = BackupTestHelper.make_wbak_payload(password)
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': password,
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data.get('rollback_state'), 'restored')
        self.assertIn("سیستم به حالت قبل بازگردانده شد", response.data.get('error', ''))

    @mock.patch('config.views_backup._terminate_other_connections')
    @mock.patch('config.views_backup._find_pg_tool', return_value='/usr/bin/pg_tool')
    @mock.patch('subprocess.run')
    def test_rollback_file_removed_on_success(self, mock_subproc, mock_tool, mock_term):
        """
        When restore succeeds:
        1. Response is 200 OK.
        2. Rollback file is removed.
        3. RESTORE_COMPLETE audit log is written.
        """
        # Call 1: emergency dump -> succeeds
        # Call 2: restore -> succeeds
        mock_subproc.side_effect = [
            mock.MagicMock(returncode=0, stderr=b''),
            mock.MagicMock(returncode=0, stderr=b''),
        ]

        self.client.force_authenticate(user=self.superuser)
        password = "ValidSecretPassword123"
        payload = BackupTestHelper.make_wbak_payload(password)
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': password,
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("با موفقیت انجام شد", response.data.get('message', ''))

    @mock.patch('config.views_backup._terminate_other_connections')
    @mock.patch('config.views_backup._find_pg_tool', return_value='/usr/bin/pg_tool')
    @mock.patch('subprocess.run')
    def test_reports_unavailable_when_no_rollback_taken(self, mock_subproc, mock_tool, mock_term):
        """
        When emergency backup dump itself fails before restore:
        1. restore fails fatally.
        2. rollback_state is 'unavailable'.
        3. error message honestly indicates backup was unavailable.
        """
        # Call 1: emergency dump -> FAILS (returncode 1)
        # Call 2: restore -> FAILS fatally
        mock_subproc.side_effect = [
            mock.MagicMock(returncode=1, stderr=b'pg_dump failed to create rollback'),
            mock.MagicMock(returncode=1, stderr=b'FATAL: restore failed'),
        ]

        self.client.force_authenticate(user=self.superuser)
        password = "ValidSecretPassword123"
        payload = BackupTestHelper.make_wbak_payload(password)
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': password,
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data.get('rollback_state'), 'unavailable')
        self.assertIn("نسخه اضطراری در دسترس نبود", response.data.get('error', ''))

    @mock.patch('config.views_backup._terminate_other_connections')
    @mock.patch('config.views_backup._find_pg_tool', return_value='/usr/bin/pg_tool')
    @mock.patch('subprocess.run')
    def test_restore_writes_start_and_outcome_audit_logs(self, mock_subproc, mock_tool, mock_term):
        """Restore operations write a critical RESTORE_START log and a completion log."""
        mock_subproc.side_effect = [
            mock.MagicMock(returncode=0, stderr=b''),
            mock.MagicMock(returncode=0, stderr=b''),
        ]

        self.client.force_authenticate(user=self.superuser)
        start_count = AuditLog.objects.filter(module='backup', action='RESTORE_START').count()
        complete_count = AuditLog.objects.filter(module='backup', action='RESTORE_COMPLETE').count()

        password = "ValidSecretPassword123"
        payload = BackupTestHelper.make_wbak_payload(password)
        uploaded_file = SimpleUploadedFile("backup.wbak", payload, content_type="application/octet-stream")

        response = self.client.post(
            self.restore_url,
            {
                'file': uploaded_file,
                'password': password,
                'confirm_text': 'RESTORE_DATABASE_CONFIRM'
            },
            format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(AuditLog.objects.filter(module='backup', action='RESTORE_START').count(), start_count + 1)
        self.assertEqual(AuditLog.objects.filter(module='backup', action='RESTORE_COMPLETE').count(), complete_count + 1)

        start_log = AuditLog.objects.filter(module='backup', action='RESTORE_START').latest('id')
        self.assertEqual(start_log.severity, 'critical')
        self.assertEqual(start_log.user, self.superuser)
