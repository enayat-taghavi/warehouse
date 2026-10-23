"""
طرح ۲.۱ (ت۳ و ت۴): ماژول حسابداری انتساب سه‌سطحی (شرکت، پروژه، بخش) را فقط از راه `companies.org_roles` می‌خواند.
انتساب سطح شرکت یا پروژه برای همهٔ بخش‌های زیرمجموعه حساب است؛ ارث‌بری هرگز از مرز شرکت نمی‌گذرد و
انتساب غیرفعال، بخش یا پروژهٔ غیرفعال و کاربر غیرفعال حساب نمی‌شوند.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from personnel.models import (
    Company,
    PersonnelProfile,
    PettyCashAccount,
    Project,
    ProjectSection,
    SectionAssignment,
)
from personnel.lifecycle_services import _workflow_recipient_ids
from personnel.section_guardian import SectionGuardian
from personnel.views_domains.scope_helpers import scope_personnel_for_user

User = get_user_model()


class ThreeLevelAssignmentFixture(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(code='TLA-A', name='شرکت سه‌سطحی الف')
        self.company_b = Company.objects.create(code='TLA-B', name='شرکت سه‌سطحی ب')
        self.p1 = Project.objects.create(company=self.company_a, code='TLA-P1', name='پروژه یک')
        self.p2 = Project.objects.create(company=self.company_a, code='TLA-P2', name='پروژه دو')
        self.pb = Project.objects.create(company=self.company_b, code='TLA-PB', name='پروژه ب')
        self.s1 = ProjectSection.objects.create(project=self.p1, code='S1', name='بخش یک')
        self.s2 = ProjectSection.objects.create(project=self.p1, code='S2', name='بخش دو')
        self.s3 = ProjectSection.objects.create(project=self.p2, code='S3', name='بخش سه')
        self.sb = ProjectSection.objects.create(project=self.pb, code='SB', name='بخش ب')

    def _user(self, username, *codenames):
        user = User.objects.create_user(username=username, password='Password123!')
        for codename in codenames:
            user.user_permissions.add(Permission.objects.get(codename=codename, content_type__app_label='accounts'))
        return User.objects.get(pk=user.pk)

    def _personnel(self, section, code):
        return PersonnelProfile.objects.create(
            first_name='آزمون', last_name=section.code, national_code=code, job_title='کارشناس',
            contract_type='daily', marital_status='single', daily_base_wage=1000000,
            project=section.project, section=section, company=section.project.company, approval_status='draft',
        )


class PersonnelScopeInheritanceTests(ThreeLevelAssignmentFixture):
    """قلمرو پرونده‌های پرسنل کارمند و سرپرست (scope_helpers)."""

    def setUp(self):
        super().setUp()
        self.pers = {sec.code: self._personnel(sec, f'000000000{i}') for i, sec in enumerate([self.s1, self.s2, self.s3, self.sb], 1)}

    def _visible(self, user, company_id=None):
        qs = scope_personnel_for_user(user, PersonnelProfile.objects.all(), company_id=company_id)
        return {p.section.code for p in qs.select_related('section')}

    def test_section_level_sees_only_its_section(self):
        user = self._user('tla_sec_emp')
        SectionAssignment.objects.create(user=user, section=self.s1, role='employee')
        self.assertEqual(self._visible(user), {'S1'})

    def test_project_level_employee_sees_all_sections_of_project(self):
        user = self._user('tla_proj_emp')
        SectionAssignment.objects.create(user=user, project=self.p1, role='employee')
        self.assertEqual(self._visible(user), {'S1', 'S2'})

    def test_company_level_supervisor_sees_all_sections_of_company_only(self):
        user = self._user('tla_comp_sup')
        SectionAssignment.objects.create(user=user, company=self.company_a, role='supervisor')
        self.assertEqual(self._visible(user), {'S1', 'S2', 'S3'})
        self.assertEqual(self._visible(user, company_id=self.company_b.id), set())

    def test_inactive_assignment_never_counts_inactive_section_keeps_history(self):
        # انتساب غیرفعال هرگز حساب نمی‌شود؛ بخش یا پروژهٔ غیرفعال سوابقش را از قلمرو بیرون نمی‌برد (ق۲)
        user = self._user('tla_inactive')
        SectionAssignment.objects.create(user=user, project=self.p1, role='employee')
        SectionAssignment.objects.create(user=user, project=self.p2, role='employee', is_active=False)
        before = self._visible(user)
        self.s2.is_active = False
        self.s2.save(update_fields=['is_active'])
        self.p1.is_active = False
        self.p1.save(update_fields=['is_active'])
        self.assertEqual(self._visible(user), before)
        self.assertNotIn('S3', before)

    def test_scope_query_count_does_not_grow_with_assignments(self):
        user = self._user('tla_many')
        SectionAssignment.objects.create(user=user, company=self.company_a, role='employee')
        SectionAssignment.objects.create(user=user, project=self.p1, role='manager')
        SectionAssignment.objects.create(user=user, section=self.s3, role='treasury')
        user = User.objects.get(pk=user.pk)
        qs = scope_personnel_for_user(user, PersonnelProfile.objects.all(), company_id=self.company_a.id)
        # بخش‌های کاربر زیرکوئری‌اند: یک کوئری برای خود فهرست، هر چند انتساب که باشد
        with self.assertNumQueries(1):
            ids = set(qs.values_list('id', flat=True))
        self.assertEqual(ids, {self.pers['S1'].id, self.pers['S2'].id, self.pers['S3'].id})


class SupervisorRoutingInheritanceTests(ThreeLevelAssignmentFixture):
    """مسیریابی اعلان سرپرست (lifecycle_services._workflow_recipient_ids)."""

    def setUp(self):
        super().setUp()
        perm = 'perm_approve_personnel_supervisor'
        self.sup_company = self._user('tla_sup_company', perm)
        self.sup_project = self._user('tla_sup_project', perm)
        self.sup_section = self._user('tla_sup_section', perm)
        self.sup_other_section = self._user('tla_sup_other_section', perm)
        self.sup_other_company = self._user('tla_sup_other_company', perm)
        SectionAssignment.objects.create(user=self.sup_company, company=self.company_a, role='supervisor')
        SectionAssignment.objects.create(user=self.sup_project, project=self.p1, role='supervisor')
        SectionAssignment.objects.create(user=self.sup_section, section=self.s1, role='supervisor')
        SectionAssignment.objects.create(user=self.sup_other_section, section=self.s3, role='supervisor')
        SectionAssignment.objects.create(user=self.sup_other_company, company=self.company_b, role='supervisor')

    def test_supervisors_at_company_project_and_section_level_are_routed(self):
        ids = _workflow_recipient_ids('pending_supervisor', self.company_a.id, self.s1.id, None)
        self.assertEqual(ids, {self.sup_company.id, self.sup_project.id, self.sup_section.id})

    def test_other_project_section_routes_only_to_its_covering_supervisors(self):
        ids = _workflow_recipient_ids('pending_supervisor', self.company_a.id, self.s3.id, None)
        self.assertEqual(ids, {self.sup_company.id, self.sup_other_section.id})

    def test_inheritance_never_crosses_companies_and_inactive_users_drop(self):
        ids = _workflow_recipient_ids('pending_supervisor', self.company_b.id, self.sb.id, None)
        self.assertEqual(ids, {self.sup_other_company.id})
        self.sup_project.is_active = False
        self.sup_project.save(update_fields=['is_active'])
        ids = _workflow_recipient_ids('pending_supervisor', self.company_a.id, self.s1.id, None)
        self.assertEqual(ids, {self.sup_company.id, self.sup_section.id})

    def test_routing_query_count_is_constant(self):
        with self.assertNumQueries(5):
            _workflow_recipient_ids('pending_supervisor', self.company_a.id, self.s1.id, None)


class TreasuryRoleInheritanceTests(ThreeLevelAssignmentFixture):
    """نقش نظارت تنخواه (treasury_views): انتساب سطح شرکت همهٔ متصدیان بخش را می‌بیند."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.custodian = self._user('tla_custodian')
        SectionAssignment.objects.create(user=self.custodian, section=self.s1, role='employee')
        self.other_custodian = self._user('tla_custodian_2')
        SectionAssignment.objects.create(user=self.other_custodian, section=self.s1, role='employee')
        self.acc1 = PettyCashAccount.objects.create(section=self.s1, custodian=self.custodian, ceiling_amount=1000)
        self.acc2 = PettyCashAccount.objects.create(section=self.s1, custodian=self.other_custodian, ceiling_amount=1000)

    def _ids(self, user):
        self.client.force_authenticate(user=user)
        res = self.client.get('/api/personnel/petty-cash-accounts/', {'section_id': self.s1.id})
        self.assertEqual(res.status_code, 200, res.content)
        return {row['id'] for row in res.json()}

    def test_company_level_treasury_sees_all_custodians_of_section(self):
        treasurer = self._user('tla_treasurer')
        SectionAssignment.objects.create(user=treasurer, company=self.company_a, role='treasury')
        self.assertEqual(self._ids(treasurer), {self.acc1.id, self.acc2.id})

    def test_project_level_manager_sees_all_custodians_of_section(self):
        manager = self._user('tla_manager')
        SectionAssignment.objects.create(user=manager, project=self.p1, role='manager')
        self.assertEqual(self._ids(manager), {self.acc1.id, self.acc2.id})

    def test_employee_role_and_foreign_company_treasury_see_only_own(self):
        self.assertEqual(self._ids(self.custodian), {self.acc1.id})
        foreign = self._user('tla_foreign_treasurer')
        SectionAssignment.objects.create(user=foreign, company=self.company_b, role='treasury')
        self.assertEqual(self._ids(foreign), set())
        inactive = self._user('tla_inactive_treasurer')
        SectionAssignment.objects.create(user=inactive, company=self.company_a, role='treasury', is_active=False)
        self.assertEqual(self._ids(inactive), set())


class AssignmentCompanySignalTests(ThreeLevelAssignmentFixture):
    """همگام‌سازی نام شرکت کاربر (signals) برای هر سه سطح."""

    def test_company_and_project_level_assignments_sync_user_company(self):
        user = self._user('tla_signal')
        company_level = SectionAssignment.objects.create(user=user, company=self.company_b, role='employee')
        user.refresh_from_db()
        self.assertEqual(user.company, self.company_b.name)
        SectionAssignment.objects.create(user=user, project=self.p1, role='employee')
        user.refresh_from_db()
        self.assertEqual(user.company, self.company_a.name)
        company_level.delete()
        user.refresh_from_db()
        self.assertEqual(user.company, self.company_a.name)
        SectionAssignment.objects.filter(user=user).delete()
        user.refresh_from_db()
        self.assertIsNone(user.company)


class SectionGuardianThreeLevelTests(ThreeLevelAssignmentFixture):
    """ایجنت نگهبان بخش (section_guardian): چک سه‌سطحی و آزمون ارث‌بری G1-ب."""

    def _checks(self, audit):
        captured = {}

        def capture(phase_name, passed, checks):
            captured['checks'] = checks
            return passed

        guardian = SectionGuardian()
        with mock.patch.object(guardian, 'report_status', side_effect=capture):
            getattr(guardian, audit)()
        return {title: status for title, status, _ in captured['checks']}

    def test_foundation_audit_checks_three_level_model(self):
        checks = self._checks('audit_phase_1_foundation')
        self.assertTrue(checks['انتساب سه‌سطحی و پاسخ‌دهندهٔ org_roles'])

    def test_strict_suite_checks_project_level_inheritance(self):
        checks = self._checks('audit_phase_6_strict_guardian_suite')
        self.assertNotIn('اجرای سوئیت آزمون‌های نگهبان G1 تا G5', checks)
        self.assertTrue(checks['آزمون نگهبان G1: ایزولاسیون داده و تفکیک قطعی قلمرو بخش‌ها'])
        self.assertTrue(checks['آزمون نگهبان G1-ب: ارث‌بری انتساب سطح پروژه به بخش‌ها'])
        # داده‌های آزمون نگهبان رول‌بک می‌شوند
        self.assertFalse(Project.objects.filter(code='PRJ_GUARD_TEST').exists())
        self.assertFalse(User.objects.filter(username__startswith='guardian_scope_').exists())
