from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.apps import apps

User = get_user_model()


class PersonnelCrossModuleIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username='admin_int_personnel',
            password='Password123!',
            national_code='9876543210'
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_company_delete_protection_with_warehouses_and_profiles(self):
        """
        آزمون ممانعت از حذف شرکت در صورت وجود انبار، پرسنل یا دوره مالی
        """
        if not apps.is_installed('warehouses'):
            self.skipTest('warehouse module is not installed')
        from warehouses.models import Warehouse
        from companies.models import Company
        from personnel.models import PersonnelProfile

        # ایجاد شرکت موقت برای تست حذف
        temp_comp = Company.objects.create(
            code='TEMP_CO_DEL_INT',
            name='شرکت موقت تست حذف ادغامی'
        )

        # ۱. انتساب انبار به شرکت
        wh = Warehouse.objects.create(
            name='انبار تست شرکت موقت ادغامی',
            company=temp_comp
        )
        res_del_wh = self.client.delete(f'/api/personnel/companies/{temp_comp.id}/')
        self.assertEqual(res_del_wh.status_code, 400)
        self.assertIn('انبار', res_del_wh.content.decode('utf-8'))

        # حذف انبار و تست وجود پرسنل
        wh.delete()
        p = PersonnelProfile.objects.create(
            first_name='علی',
            last_name='رضایی',
            national_code='9988776655',
            company=temp_comp
        )
        res_del_pers = self.client.delete(f'/api/personnel/companies/{temp_comp.id}/')
        self.assertEqual(res_del_pers.status_code, 400)
        self.assertIn('پرسنل', res_del_pers.content.decode('utf-8'))

        # حذف پرسنل -> اکنون حذف موفقیت‌آمیز است
        p.delete()
        res_del_ok = self.client.delete(f'/api/personnel/companies/{temp_comp.id}/')
        self.assertEqual(res_del_ok.status_code, 204)
        self.assertFalse(Company.objects.filter(id=temp_comp.id).exists())
