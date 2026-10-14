import os
import shutil
import tempfile
from io import StringIO
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.core.management import call_command
from django.conf import settings
from pathlib import Path

import accounts.backup_service as backup_service
from accounts.backup_service import get_backup_dir, rotate_snapshots
from reports.models import ReportExportJob


class DeploymentHardeningTests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_get_backup_dir_default_and_custom(self):
        """get_backup_dir returns default BASE_DIR/backups/db unless WAREHOUSE_BACKUP_DIR is set."""
        # 1. Default (WAREHOUSE_BACKUP_DIR is None or empty)
        with override_settings(WAREHOUSE_BACKUP_DIR=None):
            default_path = get_backup_dir()
            expected_default = os.path.join(settings.BASE_DIR, 'backups', 'db')
            self.assertEqual(default_path, expected_default)
            # Dynamic module attribute BACKUP_DIR
            self.assertEqual(backup_service.BACKUP_DIR, expected_default)

        # 2. Custom WAREHOUSE_BACKUP_DIR
        custom_base = os.path.join(self.temp_dir, 'shared_backups')
        with override_settings(WAREHOUSE_BACKUP_DIR=custom_base):
            custom_path = get_backup_dir()
            expected_custom = os.path.join(custom_base, 'db')
            self.assertEqual(custom_path, expected_custom)
            self.assertEqual(backup_service.BACKUP_DIR, expected_custom)

    def test_rotate_snapshots_respects_warehouse_backup_keep_zero(self):
        """When WAREHOUSE_BACKUP_KEEP=0 (policy for production soft), rotation does not delete any backups."""
        # Setup mock backups list
        mock_backups = [
            {'filename': f'backup_{i}.dump', 'is_emergency': False}
            for i in range(10)
        ]

        with patch.object(backup_service, 'get_backup_list', return_value=mock_backups):
            # Test keep_count <= 0 directly
            deleted = rotate_snapshots(keep_count=0)
            self.assertEqual(deleted, 0)

            # Test via WAREHOUSE_BACKUP_KEEP environment variable
            with patch.dict(os.environ, {'WAREHOUSE_BACKUP_KEEP': '0'}):
                deleted_env = rotate_snapshots(keep_count=5)
                self.assertEqual(deleted_env, 0)

    def test_run_auto_backup_command_keep_zero(self):
        """run_auto_backup command preserves all backups when keep=0 or WAREHOUSE_BACKUP_KEEP=0."""
        out = StringIO()
        with patch.object(backup_service, 'create_database_backup') as mock_create, \
             patch.object(backup_service, 'get_backup_list') as mock_list:
            mock_create.return_value = {
                'filename': 'auto_test.dump',
                'size': 10240,
                'created_at': '2026-10-07T12:00:00'
            }
            mock_list.return_value = []

            # 1. Via --keep 0
            call_command('run_auto_backup', keep=0, stdout=out)
            output = out.getvalue()
            self.assertIn("Backup retention is unlimited", output)

            # 2. Via WAREHOUSE_BACKUP_KEEP=0
            out2 = StringIO()
            with patch.dict(os.environ, {'WAREHOUSE_BACKUP_KEEP': '0'}):
                call_command('run_auto_backup', stdout=out2)
                output2 = out2.getvalue()
                self.assertIn("Backup retention is unlimited", output2)

    def test_warehouse_report_export_dir_configuration(self):
        """ReportExportJob.exports_dir() and absolute_file_path respect WAREHOUSE_REPORT_EXPORT_DIR."""
        custom_reports_dir = os.path.join(self.temp_dir, 'reports')
        with override_settings(WAREHOUSE_REPORT_EXPORT_DIR=custom_reports_dir):
            exp_dir = ReportExportJob.exports_dir()
            self.assertEqual(str(exp_dir), str(Path(custom_reports_dir)))
            self.assertTrue(exp_dir.exists())

            job = ReportExportJob(file_path='exports/my_export.xlsx')
            self.assertEqual(
                str(job.absolute_file_path),
                str(Path(custom_reports_dir) / 'my_export.xlsx')
            )
