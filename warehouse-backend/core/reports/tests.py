"""
تست‌های پایه و واحد اپ گزارش‌ها (Reports Unit Tests).
تست‌های یکپارچگی نیازمند انبار در integration_tests قرار دارند.
"""
from django.test import TestCase
from reports.models import ReportTemplate, ReportExportJob


class ReportsUnitTestCase(TestCase):
    def test_report_models_defined(self):
        self.assertTrue(hasattr(ReportTemplate, 'objects'))
        self.assertTrue(hasattr(ReportExportJob, 'objects'))
