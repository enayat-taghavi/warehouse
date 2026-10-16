from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient

from platform_core.registry import contributions
from companies.models import Company, UserCompanyAccess
from companies.permissions import has_structure_write_permission
from warehouses.models import Warehouse
from personnel.models import FinancialProject, ProjectSection, UserSectionAssignment

User = get_user_model()


class CompanyExtensionPointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_sorted_company_delete_blockers_order(self):
        """ترتیب مسدودکننده‌های حذف شرکت بر اساس فیلد order."""
        blockers = sorted(contributions('company_delete_blockers'), key=lambda b: b[0])
        related_names = [b[1] for b in blockers]
        self.assertEqual(
            related_names,
            ['projects', 'warehouses', 'personnel_profiles', 'monthly_work_periods', 'counterparties', 'fiscal_periods']
        )

    def test_superuser_delete_company_with_warehouse_returns_400(self):
        """سوپریوزر نمی‌تواند شرکتی را که انبار دارد حذف کند و خطای 400 دریافت می‌کند."""
        admin = User.objects.create_superuser(username='admin_wh_test', password='password123', phone_number='09170001001')
        comp = Company.objects.create(code='CMP_WH_TEST', name='شرکت دارای انبار')
        Warehouse.objects.create(name='انبار تست', code='WH_TEST_101', company=comp)

        self.client.force_authenticate(admin)
        res = self.client.delete(f'/api/org/companies/{comp.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Company.objects.filter(id=comp.id).exists())

    def test_superuser_delete_company_with_project_returns_400(self):
        """سوپریوزر نمی‌تواند شرکتی را که پروژه دارد حذف کند و خطای 400 دریافت می‌کند."""
        admin = User.objects.create_superuser(username='admin_prj_test', password='password123', phone_number='09170001002')
        comp = Company.objects.create(code='CMP_PRJ_TEST', name='شرکت دارای پروژه')
        FinancialProject.objects.create(company=comp, code='PRJ_TEST_101', name='پروژه تست')

        self.client.force_authenticate(admin)
        res = self.client.delete(f'/api/org/companies/{comp.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Company.objects.filter(id=comp.id).exists())

    def test_user_with_perm_approve_personnel_manager_passes_structure_write_permission(self):
        """کاربر دارای مجوز perm_approve_personnel_manager دسترسی نوشتن ساختار سازمانی دارد."""
        user = User.objects.create_user(username='pm_approver_test', password='password123', phone_number='09170001003')
        perm = Permission.objects.get(codename='perm_approve_personnel_manager', content_type__app_label='accounts')
        user.user_permissions.add(perm)
        user = User.objects.get(pk=user.pk)

        self.assertTrue(has_structure_write_permission(user))

    def test_org_admin_directory_lists_active_section_member_of_allowed_company(self):
        """
        در دایرکتوری کاربران راهبر تشکیلات، عضو فعال بخش پروژهٔ شرکت مجاز نمایش داده می‌شود
        و کاربر شرکت دیگر نمایش داده نمی‌شود.
        """
        comp1 = Company.objects.create(code='DIR_CMP_1', name='شرکت تشکیلات یک')
        comp2 = Company.objects.create(code='DIR_CMP_2', name='شرکت تشکیلات دو')

        prj1 = FinancialProject.objects.create(company=comp1, code='DIR_PRJ_1', name='پروژه شرکت یک')
        sec1 = ProjectSection.objects.create(project=prj1, code='DIR_SEC_1', name='بخش پروژه یک')

        prj2 = FinancialProject.objects.create(company=comp2, code='DIR_PRJ_2', name='پروژه شرکت دو')
        sec2 = ProjectSection.objects.create(project=prj2, code='DIR_SEC_2', name='بخش پروژه دو')

        org_admin = User.objects.create_user(username='org_admin_tester', password='password123', phone_number='09170001004')
        perm_sec = Permission.objects.get(codename='perm_manage_projects_sections', content_type__app_label='accounts')
        org_admin.user_permissions.add(perm_sec)
        UserCompanyAccess.objects.create(user=org_admin, company=comp1, access_level='workspace_full', is_default=True)

        member_comp1 = User.objects.create_user(username='member_comp1_user', password='password123', phone_number='09170001005')
        UserSectionAssignment.objects.create(user=member_comp1, section=sec1, is_active=True)

        member_comp2 = User.objects.create_user(username='member_comp2_user', password='password123', phone_number='09170001006')
        UserSectionAssignment.objects.create(user=member_comp2, section=sec2, is_active=True)

        self.client.force_authenticate(org_admin)
        res = self.client.get('/api/accounts/users/')
        self.assertEqual(res.status_code, 200)

        data = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
        returned_usernames = [u['username'] for u in data]

        self.assertIn('member_comp1_user', returned_usernames)
        self.assertNotIn('member_comp2_user', returned_usernames)

    def test_org_admin_directory_company_id_param_narrows_section_members(self):
        """
        بررسی این‌که پارامتر company_id در دایرکتوری راهبر تشکیلات اعضای بخش را به شرکت فیلترشده محدود می‌کند.
        """
        comp1 = Company.objects.create(code='DIR_CMP_N1', name='شرکت محدودسازی یک')
        comp2 = Company.objects.create(code='DIR_CMP_N2', name='شرکت محدودسازی دو')

        prj1 = FinancialProject.objects.create(company=comp1, code='DIR_PRJ_N1', name='پروژه فیلتر یک')
        sec1 = ProjectSection.objects.create(project=prj1, code='DIR_SEC_N1', name='بخش فیلتر یک')

        prj2 = FinancialProject.objects.create(company=comp2, code='DIR_PRJ_N2', name='پروژه فیلتر دو')
        sec2 = ProjectSection.objects.create(project=prj2, code='DIR_SEC_N2', name='بخش فیلتر دو')

        org_admin = User.objects.create_user(username='org_admin_nar_tester', password='password123', phone_number='09170001007')
        perm_sec = Permission.objects.get(codename='perm_manage_projects_sections', content_type__app_label='accounts')
        org_admin.user_permissions.add(perm_sec)
        UserCompanyAccess.objects.create(user=org_admin, company=comp1, access_level='workspace_full', is_default=True)
        UserCompanyAccess.objects.create(user=org_admin, company=comp2, access_level='workspace_full')

        member_comp1 = User.objects.create_user(username='member_nar_comp1', password='password123', phone_number='09170001008')
        UserSectionAssignment.objects.create(user=member_comp1, section=sec1, is_active=True)

        member_comp2 = User.objects.create_user(username='member_nar_comp2', password='password123', phone_number='09170001009')
        UserSectionAssignment.objects.create(user=member_comp2, section=sec2, is_active=True)

        self.client.force_authenticate(org_admin)

        # 1. بدون فیلتر company_id: هر دو عضو برگردانده می‌شوند
        res_all = self.client.get('/api/accounts/users/')
        self.assertEqual(res_all.status_code, 200)
        data_all = res_all.data.get('results', res_all.data) if isinstance(res_all.data, dict) else res_all.data
        usernames_all = [u['username'] for u in data_all]
        self.assertIn('member_nar_comp1', usernames_all)
        self.assertIn('member_nar_comp2', usernames_all)

        # 2. با فیلتر company_id=<comp1.id>: عضو شرکت ۱ لیست می‌شود و عضو شرکت ۲ لیست نمی‌شود
        res_comp1 = self.client.get(f'/api/accounts/users/?company_id={comp1.id}')
        self.assertEqual(res_comp1.status_code, 200)
        data_comp1 = res_comp1.data.get('results', res_comp1.data) if isinstance(res_comp1.data, dict) else res_comp1.data
        usernames_comp1 = [u['username'] for u in data_comp1]
        self.assertIn('member_nar_comp1', usernames_comp1)
        self.assertNotIn('member_nar_comp2', usernames_comp1)

        # 3. با فیلتر company_id=<comp2.id>: عضو شرکت ۲ لیست می‌شود و عضو شرکت ۱ لیست نمی‌شود
        res_comp2 = self.client.get(f'/api/accounts/users/?company_id={comp2.id}')
        self.assertEqual(res_comp2.status_code, 200)
        data_comp2 = res_comp2.data.get('results', res_comp2.data) if isinstance(res_comp2.data, dict) else res_comp2.data
        usernames_comp2 = [u['username'] for u in data_comp2]
        self.assertIn('member_nar_comp2', usernames_comp2)
        self.assertNotIn('member_nar_comp1', usernames_comp2)

