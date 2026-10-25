import io
import unittest
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.db import connection
from django.test import TestCase

from companies.models import Company
from personnel import models as personnel_models
from settings_core import models as settings_core_models
from settings_core.models import CompanyGoogleDriveConfig, GoogleDriveSyncQueue


class DriveMove26cTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(code='DRV26C', name='Test Company DRV26C')

    def test_personnel_reexports_core_classes(self):
        self.assertIs(personnel_models.CompanyGoogleDriveConfig, settings_core_models.CompanyGoogleDriveConfig)
        self.assertIs(personnel_models.GoogleDriveSyncQueue, settings_core_models.GoogleDriveSyncQueue)
        self.assertEqual(CompanyGoogleDriveConfig._meta.app_label, 'settings_core')
        self.assertEqual(GoogleDriveSyncQueue._meta.app_label, 'settings_core')

    def test_tables_unchanged(self):
        self.assertEqual(CompanyGoogleDriveConfig._meta.db_table, 'personnel_companygoogledriveconfig')
        self.assertEqual(GoogleDriveSyncQueue._meta.db_table, 'personnel_googledrivesyncqueue')

    def test_index_names_unchanged(self):
        expected_indexes = {
            'personnel_g_company_f971b0_idx',
            'personnel_g_status_50fa27_idx',
            'personnel_g_model_n_4c523e_idx',
            'personnel_g_status_7b750a_idx',
            'personnel_g_status_dcbe53_idx',
            'idx_gdrive_dedup_acct',
        }
        meta_indexes = {idx.name for idx in GoogleDriveSyncQueue._meta.indexes}
        self.assertEqual(meta_indexes, expected_indexes)

        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, 'personnel_googledrivesyncqueue')
        for name in expected_indexes:
            self.assertIn(name, constraints)

    def test_rows_counted_in_same_table(self):
        CompanyGoogleDriveConfig.objects.create(company=self.company)
        for _ in range(3):
            GoogleDriveSyncQueue.objects.create(
                company=self.company,
                model_name='ZzDoc',
                source_file_path='x.pdf',
                target_folder_path='a/b',
                target_filename='x.pdf',
            )
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM personnel_googledrivesyncqueue")
            queue_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM personnel_companygoogledriveconfig")
            config_count = cursor.fetchone()[0]

        self.assertEqual(queue_count, 3)
        self.assertEqual(GoogleDriveSyncQueue.objects.count(), 3)
        self.assertEqual(config_count, 1)
        self.assertEqual(CompanyGoogleDriveConfig.objects.count(), 1)

    def test_related_names_work(self):
        config = CompanyGoogleDriveConfig.objects.create(company=self.company)
        for _ in range(3):
            GoogleDriveSyncQueue.objects.create(
                company=self.company,
                model_name='ZzDoc',
                source_file_path='x.pdf',
                target_folder_path='a/b',
                target_filename='x.pdf',
            )
        self.company.refresh_from_db()
        self.assertEqual(self.company.gdrive_config, config)
        self.assertEqual(self.company.gdrive_sync_tasks.count(), 3)

    @unittest.expectedFailure
    def test_content_types_moved(self):
        self.assertEqual(ContentType.objects.get_for_model(GoogleDriveSyncQueue).app_label, 'settings_core')
        self.assertEqual(ContentType.objects.get_for_model(CompanyGoogleDriveConfig).app_label, 'settings_core')
        self.assertEqual(
            ContentType.objects.filter(
                app_label='personnel',
                model__in=['googledrivesyncqueue', 'companygoogledriveconfig'],
            ).count(),
            0,
        )

    def test_worker_once_keeps_rows(self):
        queue_row = GoogleDriveSyncQueue.objects.create(
            company=self.company,
            model_name='ZzDoc',
            source_file_path='x.pdf',
            target_folder_path='a/b',
            target_filename='x.pdf',
            status='pending',
        )
        initial_count = GoogleDriveSyncQueue.objects.count()

        out = io.StringIO()
        err = io.StringIO()
        call_command('run_gdrive_sync_worker', '--once', stdout=out, stderr=err)

        self.assertEqual(GoogleDriveSyncQueue.objects.count(), initial_count)
        self.assertTrue(GoogleDriveSyncQueue.objects.filter(pk=queue_row.pk).exists())
