"""
آزمون‌های API هستهٔ پروژه، بخش و انتساب (طرح Project_Section_To_Core، گام ۲):
سطح بخش projects (خواندن و نوشتن)، جداسازی شرکت‌ها، منبع عضویتِ انتساب در هسته و نبود نقش اعلام‌شده.
بی‌نیاز از هر ماژول؛ در پروفایل‌های WH_MODULES=warehouse و WH_MODULES=accounting هم اجرا می‌شود.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from companies.access import derived_company_ids, get_user_allowed_companies
from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from companies.org_membership import build_section_member_q, section_derived_company_source, section_member_sources
from companies.org_roles import (
    assignments_covering_section,
    section_role_holders,
    user_has_section_role,
    user_section_ids,
)
from companies.permission_sections import template_levels
from platform_core import registry

User = get_user_model()

ROLES = (('employee', 'کارمند'), ('manager', 'مدیر'))


def with_roles(roles=ROLES):
    """نقش‌های انتساب را مستقل از ماژول‌های نصب‌شده تعیین می‌کند."""
    return mock.patch.dict(registry._CONTRIBUTIONS, {'section_roles': [roles] if roles else []})


def rows(res):
    body = res.json()
    return body.get('results', body) if isinstance(body, dict) else body


class OrgApiBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.a = Company.objects.create(code='ORG-A', name='شرکت الف')
        self.b = Company.objects.create(code='ORG-B', name='شرکت ب')
        self.pa = Project.objects.create(company=self.a, code='PA', name='پروژه الف')
        self.sa = ProjectSection.objects.create(project=self.pa, code='SA', name='بخش الف')
        self.pb = Project.objects.create(company=self.b, code='PB', name='پروژه ب')
        self.sb = ProjectSection.objects.create(project=self.pb, code='SB', name='بخش ب')
        self.writer = self._user('org_writer', self.a, {'projects': 'write'})
        self.reader = self._user('org_reader', self.a, {'projects': 'read'})
        self.nolevel = self._user('org_nolevel', self.a, {'identity': 'read'})
        self.linked = self._user('org_linked', self.a, {})
        self.outsider = self._user('org_outsider', self.b, {})

    def _user(self, username, company, levels):
        u = User.objects.create_user(username=username, password='x-pass-123')
        UserCompanyAccess.objects.create(user=u, company=company, section_levels=levels)
        return u

    def _as(self, user):
        self.client.force_authenticate(user=user)


class ProjectsSectionLevelTests(OrgApiBase):
    def test_templates_carry_projects_section(self):
        self.assertEqual(template_levels('manager')['projects'], 'write')
        self.assertEqual(template_levels('viewer')['projects'], 'read')

    def test_read_level_lists_but_cannot_write(self):
        self._as(self.reader)
        res = self.client.get('/api/org/projects/', {'company_id': self.a.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual({r['code'] for r in rows(res)}, {'PA'})
        self.assertEqual({r['code'] for r in rows(self.client.get('/api/org/project-sections/', {'company_id': self.a.id}))}, {'SA'})
        self.assertEqual(self.client.post('/api/org/projects/', {'company': self.a.id, 'code': 'PX', 'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'name': 'تغییر'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/org/projects/{self.pa.id}/').status_code, 403)
        self.assertEqual(self.client.post('/api/org/project-sections/', {'project': self.pa.id, 'code': 'SX', 'name': 'x'}, format='json').status_code, 403)
        with with_roles():
            res = self.client.post('/api/org/section-assignments/', {'user': self.linked.id, 'section': self.sa.id, 'role': 'employee'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.name, 'پروژه الف')
        self.assertTrue(Project.objects.filter(pk=self.pa.pk).exists())

    def test_user_without_level_gets_403_or_empty(self):
        self._as(self.nolevel)
        self.assertEqual(self.client.get('/api/org/projects/', {'company_id': self.a.id}).status_code, 403)
        self.assertEqual(self.client.get('/api/org/project-sections/', {'company_id': self.a.id}).status_code, 403)
        self.assertEqual(rows(self.client.get('/api/org/projects/')), [])
        self.assertEqual(rows(self.client.get('/api/org/project-sections/')), [])
        self.assertEqual(rows(self.client.get('/api/org/section-assignments/')), [])
        self.assertEqual(self.client.post('/api/org/projects/', {'company': self.a.id, 'code': 'PX', 'name': 'x'}, format='json').status_code, 403)

    def test_write_level_creates_updates_and_assigns(self):
        self._as(self.writer)
        res = self.client.post('/api/org/projects/', {'company': self.a.id, 'code': 'PN', 'name': 'پروژهٔ تازه'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        for key in ('id', 'company', 'company_name', 'company_code', 'sections_count', 'code', 'name', 'is_active'):
            self.assertIn(key, res.json())
        res = self.client.post('/api/org/project-sections/', {'project': res.json()['id'], 'code': 'SN', 'name': 'بخش تازه'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['company_id'], self.a.id)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'name': 'نام تازه'}, format='json').status_code, 200)
        with with_roles():
            res = self.client.post('/api/org/section-assignments/', {'user': self.linked.id, 'section': self.sa.id, 'role': 'manager'}, format='json')
            self.assertEqual(res.status_code, 201, res.content)
            self.assertEqual(res.json()['role_display'], 'مدیر')
            # کاربرِ بی‌پیوند با شرکت الف منتسب نمی‌شود (انتساب خودش عضویت می‌دهد)
            res = self.client.post('/api/org/section-assignments/', {'user': self.outsider.id, 'section': self.sa.id, 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 403)
            # نویسنده خودش را منتسب نمی‌کند
            res = self.client.post('/api/org/section-assignments/', {'user': self.writer.id, 'section': self.sa.id, 'role': 'manager'}, format='json')
            self.assertEqual(res.status_code, 403)
        self.assertFalse(SectionAssignment.objects.filter(user__in=[self.outsider, self.writer]).exists())

    def test_no_global_project_is_possible(self):
        # طرح ۲.۱، ت۲: هر پروژه شرکت دارد، حتی برای superuser
        self._as(self.writer)
        self.assertEqual(self.client.post('/api/org/projects/', {'code': 'PG', 'name': 'سراسری'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'company': None}, format='json').status_code, 400)
        admin = User.objects.create_superuser(username='org_admin_su', password='x-pass-123')
        self._as(admin)
        self.assertEqual(self.client.post('/api/org/projects/', {'code': 'PG', 'name': 'سراسری'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'company': None}, format='json').status_code, 400)
        self.assertFalse(Project.objects.filter(code='PG').exists())
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.company_id, self.a.id)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Project.objects.create(company=None, code='PG2', name='سراسری')

    def test_no_contributed_roles_rejects_assignment(self):
        self._as(self.writer)
        with with_roles(None):
            res = self.client.post('/api/org/section-assignments/', {'user': self.linked.id, 'section': self.sa.id}, format='json')
            self.assertEqual(res.status_code, 400)
            self.assertIn('نقش انتساب', str(res.json()))
            res = self.client.post('/api/org/section-assignments/bulk-assign/', {'section_id': self.sa.id, 'user_ids': [self.linked.id]}, format='json')
            self.assertEqual(res.status_code, 400)
        self.assertFalse(SectionAssignment.objects.exists())

    def test_unused_project_is_deleted_and_sections_cascade(self):
        self._as(self.writer)
        self.assertEqual(self.client.delete(f'/api/org/projects/{self.pa.id}/').status_code, 204)
        self.assertFalse(Project.objects.filter(pk=self.pa.pk).exists())
        self.assertFalse(ProjectSection.objects.filter(pk=self.sa.pk).exists())


class ReviewFindingTests(OrgApiBase):
    """یافته‌های tenant-scope-reviewer گام ۲."""

    def test_inactive_assignment_cannot_link_unlinked_user(self):
        # انتساب غیرفعال کاربر را «پیوندخورده» می‌کرد و فعال‌سازی بعدی عضویت می‌داد
        self._as(self.writer)
        base = '/api/org/section-assignments/'
        with with_roles():
            res = self.client.post(base, {'user': self.outsider.id, 'section': self.sa.id, 'role': 'employee', 'is_active': False}, format='json')
            self.assertEqual(res.status_code, 403)
            self.assertEqual(self.client.post(base, {'user': self.outsider.id, 'section': self.sa.id, 'role': 'employee'}, format='json').status_code, 403)
            # ردیف موجودِ کاربر پیوندخورده را می‌توان بی‌شرط غیرفعال کرد، ولی نه به کاربر بی‌پیوند منتقل کرد
            own = SectionAssignment.objects.create(user=self.linked, section=self.sa, role='employee', is_active=True)
            res = self.client.patch(f'{base}{own.id}/', {'user': self.outsider.id, 'is_active': False}, format='json')
            self.assertEqual(res.status_code, 403)
            self.assertEqual(self.client.patch(f'{base}{own.id}/', {'is_active': False}, format='json').status_code, 200)
        self.assertFalse(SectionAssignment.objects.filter(user=self.outsider).exists())
        self.assertNotIn(self.a.id, set(get_user_allowed_companies(self.outsider).values_list('id', flat=True)))

    def test_staff_my_sections_is_limited_to_own_assignments(self):
        staff = User.objects.create_user(username='org_staff', password='x-pass-123', is_staff=True)
        self._as(staff)
        self.assertEqual(self.client.get('/api/org/section-assignments/my-sections/').json(), [])
        SectionAssignment.objects.create(user=staff, section=self.sa, role='employee', is_active=True)
        self.assertEqual([s['code'] for s in self.client.get('/api/org/section-assignments/my-sections/').json()], ['SA'])

    def test_inactive_company_gives_no_section_level(self):
        from companies.access import company_section_level
        self.a.is_active = False
        self.a.save(update_fields=['is_active'])
        self.assertEqual(company_section_level(self.writer, self.a.id, 'projects'), 'none')
        self._as(self.writer)
        self.assertEqual(self.client.post('/api/org/projects/', {'company': self.a.id, 'code': 'PX', 'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'name': 'x'}, format='json').status_code, 404)
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.name, 'پروژه الف')


class CrossCompanyIsolationTests(OrgApiBase):
    def test_writer_of_a_cannot_read_b(self):
        SectionAssignment.objects.create(user=self.outsider, section=self.sb, role='employee')
        self._as(self.writer)
        self.assertEqual(self.client.get('/api/org/projects/', {'company_id': self.b.id}).status_code, 403)
        self.assertEqual(self.client.get('/api/org/project-sections/', HTTP_X_COMPANY_ID=str(self.b.id)).status_code, 403)
        self.assertEqual(self.client.get('/api/org/section-assignments/', {'company_id': self.b.id}).status_code, 403)
        self.assertNotIn('PB', {r['code'] for r in rows(self.client.get('/api/org/projects/'))})
        self.assertNotIn('SB', {r['code'] for r in rows(self.client.get('/api/org/project-sections/'))})
        self.assertEqual(rows(self.client.get('/api/org/section-assignments/')), [])
        self.assertEqual(self.client.get(f'/api/org/projects/{self.pb.id}/').status_code, 404)

    def test_writer_of_a_cannot_write_b(self):
        foreign = SectionAssignment.objects.create(user=self.outsider, section=self.sb, role='employee')
        self._as(self.writer)
        self.assertEqual(self.client.post('/api/org/projects/', {'company': self.b.id, 'code': 'PX', 'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pb.id}/', {'name': 'x'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/org/project-sections/{self.sb.id}/').status_code, 404)
        self.assertEqual(self.client.post('/api/org/project-sections/', {'project': self.pb.id, 'code': 'SX', 'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'company': self.b.id}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/org/project-sections/{self.sa.id}/', {'project': self.pb.id}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/org/section-assignments/{foreign.id}/').status_code, 404)
        with with_roles():
            res = self.client.post('/api/org/section-assignments/', {'user': self.outsider.id, 'section': self.sb.id, 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 403)
            res = self.client.post('/api/org/section-assignments/bulk-assign/', {'section_id': self.sb.id, 'user_ids': [self.linked.id], 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 403)
            res = self.client.post(f'/api/org/project-sections/{self.sa.id}/clone-assignments/', {'source_section_id': self.sb.id}, format='json')
            self.assertEqual(res.status_code, 403)
        foreign.refresh_from_db()
        self.assertTrue(foreign.is_active)
        self.pb.refresh_from_db()
        self.assertEqual(self.pb.name, 'پروژه ب')
        self.assertEqual(SectionAssignment.objects.count(), 1)

    def test_export_contains_only_readable_companies(self):
        import io
        import openpyxl
        self._as(self.reader)
        res = self.client.get('/api/org/projects/export-excel/')
        self.assertEqual(res.status_code, 200)
        ws = openpyxl.load_workbook(io.BytesIO(res.content)).active
        self.assertEqual({ws.cell(row=r, column=1).value for r in range(3, ws.max_row + 1)}, {'PA'})
        self.assertEqual(self.client.get('/api/org/projects/export-excel/', {'company_id': self.b.id}).status_code, 403)


class SectionMembershipInCoreTests(OrgApiBase):
    def test_active_assignment_grants_membership(self):
        self.assertNotIn(self.a.id, derived_company_ids(self.linked))
        sa = SectionAssignment.objects.create(user=self.linked, section=self.sa, role='employee', is_active=True)
        self.assertIn(self.a.id, set(get_user_allowed_companies(self.linked).values_list('id', flat=True)))
        self.assertIn(self.linked.id, section_member_sources(self.a.id))
        self.assertTrue(User.objects.filter(build_section_member_q([self.a.id]), id=self.linked.id).exists())
        sa.is_active = False
        sa.save(update_fields=['is_active'])
        self.assertNotIn(self.a.id, derived_company_ids(self.linked))

    def test_member_reads_projects_without_level(self):
        SectionAssignment.objects.create(user=self.linked, section=self.sa, role='employee', is_active=True)
        self._as(self.linked)
        self.assertEqual({r['code'] for r in rows(self.client.get('/api/org/projects/'))}, {'PA'})
        res = self.client.get('/api/org/section-assignments/my-sections/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([s['code'] for s in res.json()], ['SA'])
        # عضویت بی سطح «نوشتن» نوشتن نمی‌دهد
        self.assertEqual(self.client.patch(f'/api/org/projects/{self.pa.id}/', {'name': 'x'}, format='json').status_code, 403)

    def test_company_with_project_cannot_be_deleted(self):
        admin = User.objects.create_superuser(username='org_del_su', password='x-pass-123')
        self._as(admin)
        self.assertEqual(self.client.delete(f'/api/org/companies/{self.a.id}/').status_code, 400)
        self.assertTrue(Company.objects.filter(pk=self.a.pk).exists())


class ThreeLevelBase(OrgApiBase):
    """طرح ۲.۱، ت۳ و ت۴: شرکت الف ← (پروژه الف: بخش الف، بخش الف۲) و (پروژه الف۲: بخش الف۳)؛ شرکت ب ← بخش ب."""

    def setUp(self):
        super().setUp()
        self.sa2 = ProjectSection.objects.create(project=self.pa, code='SA2', name='بخش الف۲')
        self.pa2 = Project.objects.create(company=self.a, code='PA2', name='پروژه الف۲')
        self.sa3 = ProjectSection.objects.create(project=self.pa2, code='SA3', name='بخش الف۳')
        self.treasurer = self._user('org_treasurer', self.a, {})
        self.pmanager = self._user('org_pmanager', self.a, {})
        self.supervisor = self._user('org_supervisor', self.a, {})


class ThreeLevelAssignmentApiTests(ThreeLevelBase):
    base = '/api/org/section-assignments/'

    def test_create_company_and_project_level(self):
        self._as(self.writer)
        with with_roles():
            res = self.client.post(self.base, {'user': self.linked.id, 'company': self.a.id, 'role': 'manager'}, format='json')
            self.assertEqual(res.status_code, 201, res.content)
            body = res.json()
            self.assertEqual((body['level'], body['company'], body['section'], body['project']), ('company', self.a.id, None, None))
            self.assertEqual(body['target_company_id'], self.a.id)
            self.assertIsNone(body['project_id'])
            res = self.client.post(self.base, {'user': self.linked.id, 'project': self.pa.id, 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 201, res.content)
            self.assertEqual((res.json()['level'], res.json()['project_id'], res.json()['target_company_id']), ('project', self.pa.id, self.a.id))
            # بدنهٔ قدیمی فقط با section همان کار را می‌کند
            res = self.client.post(self.base, {'user': self.linked.id, 'section': self.sa.id, 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 201, res.content)
            self.assertEqual((res.json()['level'], res.json()['section_name'], res.json()['project_id']), ('section', 'بخش الف', self.pa.id))
            # تکرار همان نقش و هدف ردیف تازه نمی‌سازد
            again = self.client.post(self.base, {'user': self.linked.id, 'company': self.a.id, 'role': 'manager'}, format='json')
            self.assertEqual(again.status_code, 201)
        self.assertEqual(SectionAssignment.objects.filter(user=self.linked).count(), 3)

    def test_target_must_be_exactly_one(self):
        self._as(self.writer)
        with with_roles():
            res = self.client.post(self.base, {'user': self.linked.id, 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 400)
            res = self.client.post(self.base, {'user': self.linked.id, 'company': self.a.id, 'section': self.sa.id, 'role': 'employee'}, format='json')
            self.assertEqual(res.status_code, 400)
            res = self.client.post(self.base, {'user': self.linked.id, 'project': self.pa.id, 'role': 'nope'}, format='json')
            self.assertEqual(res.status_code, 400)
        self.assertFalse(SectionAssignment.objects.exists())

    def test_db_constraints(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            SectionAssignment.objects.create(user=self.linked, company=self.a, section=self.sa, role='employee')
        with self.assertRaises(IntegrityError), transaction.atomic():
            SectionAssignment.objects.create(user=self.linked, role='employee')
        SectionAssignment.objects.create(user=self.linked, company=self.a, role='employee')
        with self.assertRaises(IntegrityError), transaction.atomic():
            SectionAssignment.objects.create(user=self.linked, company=self.a, role='employee')
        SectionAssignment.objects.create(user=self.linked, project=self.pa, role='employee')
        with self.assertRaises(IntegrityError), transaction.atomic():
            SectionAssignment.objects.create(user=self.linked, project=self.pa, role='employee')
        # همان نقش در سطح دیگر یا نقش دیگر در همان هدف مجاز است
        SectionAssignment.objects.create(user=self.linked, company=self.a, role='manager')
        SectionAssignment.objects.create(user=self.linked, section=self.sa, role='employee')
        self.assertEqual(SectionAssignment.objects.filter(user=self.linked).count(), 4)

    def test_writer_cannot_assign_outside_own_company(self):
        self._as(self.writer)
        with with_roles():
            self.assertEqual(self.client.post(self.base, {'user': self.outsider.id, 'company': self.b.id, 'role': 'employee'}, format='json').status_code, 403)
            self.assertEqual(self.client.post(self.base, {'user': self.outsider.id, 'project': self.pb.id, 'role': 'employee'}, format='json').status_code, 403)
            # کاربرِ بی‌پیوند با شرکت الف در سطح شرکت و پروژهٔ الف هم منتسب نمی‌شود
            self.assertEqual(self.client.post(self.base, {'user': self.outsider.id, 'company': self.a.id, 'role': 'employee'}, format='json').status_code, 403)
            self.assertEqual(self.client.post(self.base, {'user': self.outsider.id, 'project': self.pa.id, 'role': 'employee'}, format='json').status_code, 403)
            # نویسنده خودش را در سطح شرکت منتسب نمی‌کند
            self.assertEqual(self.client.post(self.base, {'user': self.writer.id, 'company': self.a.id, 'role': 'manager'}, format='json').status_code, 403)
            res = self.client.post(f'{self.base}bulk-assign/', {'company_id': self.b.id, 'user_ids': [self.outsider.id]}, format='json')
            self.assertEqual(res.status_code, 403)
            own = SectionAssignment.objects.create(user=self.linked, company=self.a, role='employee')
            # انتقال ردیف به شرکت دیگر فقط با superuser
            res = self.client.patch(f'{self.base}{own.id}/', {'company': self.b.id}, format='json')
            self.assertEqual(res.status_code, 403)
            res = self.client.patch(f'{self.base}{own.id}/', {'company': None, 'project': self.pb.id}, format='json')
            self.assertEqual(res.status_code, 403)
            # جابه‌جایی درون همان شرکت و غیرفعال‌سازی مجاز است
            res = self.client.patch(f'{self.base}{own.id}/', {'company': None, 'project': self.pa2.id}, format='json')
            self.assertEqual(res.status_code, 200, res.content)
            self.assertEqual(self.client.patch(f'{self.base}{own.id}/', {'is_active': False}, format='json').status_code, 200)
        self.assertFalse(SectionAssignment.objects.filter(user__in=[self.outsider, self.writer]).exists())
        own.refresh_from_db()
        self.assertEqual((own.project_id, own.company_id, own.is_active), (self.pa2.id, None, False))

    def test_bulk_assign_project_and_company(self):
        self._as(self.writer)
        with with_roles():
            res = self.client.post(f'{self.base}bulk-assign/', {'project_id': self.pa.id, 'user_ids': [self.linked.id, self.reader.id], 'role': 'manager'}, format='json')
            self.assertEqual(res.status_code, 201, res.content)
            self.assertEqual({r['level'] for r in res.json()}, {'project'})
            res = self.client.post(f'{self.base}bulk-assign/', {'company_id': self.a.id, 'user_ids': [self.linked.id]}, format='json')
            self.assertEqual(res.status_code, 201, res.content)
            res = self.client.post(f'{self.base}bulk-assign/', {'company_id': self.a.id, 'section_id': self.sa.id, 'user_ids': [self.linked.id]}, format='json')
            self.assertEqual(res.status_code, 400)
        self.assertEqual(SectionAssignment.objects.filter(project=self.pa, role='manager').count(), 2)
        self.assertTrue(SectionAssignment.objects.filter(user=self.linked, company=self.a, role='employee').exists())

    def test_reader_sees_all_levels_of_own_company_only(self):
        mine = [
            SectionAssignment.objects.create(user=self.treasurer, company=self.a, role='manager'),
            SectionAssignment.objects.create(user=self.pmanager, project=self.pa, role='manager'),
            SectionAssignment.objects.create(user=self.supervisor, section=self.sa, role='employee'),
        ]
        SectionAssignment.objects.create(user=self.outsider, company=self.b, role='manager')
        SectionAssignment.objects.create(user=self.outsider, project=self.pb, role='manager')
        self._as(self.reader)
        self.assertEqual({r['id'] for r in rows(self.client.get(self.base))}, {a.id for a in mine})
        self.assertEqual({r['id'] for r in rows(self.client.get(self.base, {'company_id': self.a.id}))}, {a.id for a in mine})
        self.assertEqual(self.client.get(self.base, {'company_id': self.b.id}).status_code, 403)
        covering = rows(self.client.get(self.base, {'covering_section_id': self.sa2.id}))
        self.assertEqual({r['id'] for r in covering}, {mine[0].id, mine[1].id})
        self.assertEqual({r['id'] for r in rows(self.client.get(self.base, {'level': 'project'}))}, {mine[1].id})
        self.assertEqual({r['id'] for r in rows(self.client.get(self.base, {'project_id': self.pa.id}))}, {mine[1].id, mine[2].id})

    def test_my_sections_expand_company_and_project_levels(self):
        SectionAssignment.objects.create(user=self.treasurer, company=self.a, role='manager')
        SectionAssignment.objects.create(user=self.pmanager, project=self.pa, role='manager')
        self._as(self.treasurer)
        self.assertEqual({s['code'] for s in self.client.get(f'{self.base}my-sections/').json()}, {'SA', 'SA2', 'SA3'})
        self._as(self.pmanager)
        self.assertEqual({s['code'] for s in self.client.get(f'{self.base}my-sections/').json()}, {'SA', 'SA2'})
        self.assertEqual(self.client.get(f'{self.base}my-sections/', HTTP_X_COMPANY_ID=str(self.b.id)).json(), [])

    def test_websocket_event_carries_company_for_every_level(self):
        self._as(self.writer)
        with with_roles(), mock.patch('companies.org_views.broadcast_org_structure_updated') as sent:
            self.client.post(self.base, {'user': self.linked.id, 'company': self.a.id, 'role': 'manager'}, format='json')
            self.client.post(self.base, {'user': self.linked.id, 'project': self.pa.id, 'role': 'manager'}, format='json')
            self.client.post(f'{self.base}bulk-assign/', {'company_id': self.a.id, 'user_ids': [self.reader.id]}, format='json')
        calls = [c.args for c in sent.call_args_list]
        self.assertEqual(len(calls), 3)
        # (entity_type, action, entity_id, name, project_id, tab_id, sender_id, company_id)
        self.assertEqual([(c[0], c[4], c[7]) for c in calls],
                         [('assignment', None, self.a.id), ('assignment', self.pa.id, self.a.id), ('assignment', None, self.a.id)])

    def test_excel_import_and_export_three_levels(self):
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        for row, (username, proj, sec) in enumerate(
                [('org_treasurer', '', ''), ('org_pmanager', 'PA', ''), ('org_supervisor', 'PA', 'SA')], 3):
            ws.cell(row=row, column=1, value=username)
            ws.cell(row=row, column=3, value=proj)
            ws.cell(row=row, column=4, value=sec)
            ws.cell(row=row, column=5, value='manager')
        # ردیفِ شرکت دیگر رد می‌شود
        ws.cell(row=6, column=1, value='org_linked')
        ws.cell(row=6, column=5, value='manager')
        ws.cell(row=6, column=9, value='ORG-B')
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = 'a.xlsx'
        self._as(self.writer)
        with with_roles():
            res = self.client.post(f'{self.base}import-excel/', {'file': buf, 'company_id': self.a.id}, format='multipart')
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()['summary']['created'], 3)
        self.assertTrue(SectionAssignment.objects.filter(user=self.treasurer, company=self.a, role='manager').exists())
        self.assertTrue(SectionAssignment.objects.filter(user=self.pmanager, project=self.pa, role='manager').exists())
        self.assertTrue(SectionAssignment.objects.filter(user=self.supervisor, section=self.sa, role='manager').exists())
        self.assertFalse(SectionAssignment.objects.filter(user=self.linked).exists())
        with with_roles():
            res = self.client.get(f'{self.base}export-excel/', {'company_id': self.a.id})
        self.assertEqual(res.status_code, 200)
        out = openpyxl.load_workbook(io.BytesIO(res.content)).active
        levels = {out.cell(row=r, column=1).value: (out.cell(row=r, column=9).value, out.cell(row=r, column=10).value)
                  for r in range(3, out.max_row + 1)}
        self.assertEqual(levels, {'org_treasurer': ('ORG-A', 'شرکت'), 'org_pmanager': ('ORG-A', 'پروژه'),
                                  'org_supervisor': ('ORG-A', 'بخش')})


class OrgRoleResolverTests(ThreeLevelBase):
    """تابع مرکزی ت۴: ارث‌بری از شرکت و پروژه، فقط انتساب و کاربر فعال."""

    def setUp(self):
        super().setUp()
        SectionAssignment.objects.create(user=self.treasurer, company=self.a, role='treasurer')
        SectionAssignment.objects.create(user=self.pmanager, project=self.pa, role='manager')
        SectionAssignment.objects.create(user=self.supervisor, section=self.sa, role='supervisor')
        # شرکت دیگر و انتساب غیرفعال اثری ندارند
        SectionAssignment.objects.create(user=self.outsider, company=self.b, role='treasurer')
        SectionAssignment.objects.create(user=self.linked, project=self.pa, role='manager', is_active=False)

    def test_section_role_holders_inherit(self):
        self.assertEqual(set(section_role_holders(self.sa, 'treasurer')), {self.treasurer})
        self.assertEqual(set(section_role_holders(self.sa3.id, 'treasurer')), {self.treasurer})
        self.assertEqual(set(section_role_holders(self.sb, 'treasurer')), {self.outsider})
        self.assertEqual(set(section_role_holders(self.sa2, 'manager')), {self.pmanager})
        self.assertEqual(set(section_role_holders(self.sa3, 'manager')), set())
        self.assertEqual(set(section_role_holders(self.sa, 'supervisor')), {self.supervisor})
        self.assertEqual(set(section_role_holders(self.sa2, 'supervisor')), set())
        self.treasurer.is_active = False
        self.treasurer.save(update_fields=['is_active'])
        self.assertEqual(set(section_role_holders(self.sa, 'treasurer')), set())

    def test_assignments_covering_section(self):
        self.assertEqual(set(assignments_covering_section(self.sa).values_list('user__username', flat=True)),
                         {'org_treasurer', 'org_pmanager', 'org_supervisor'})
        self.assertEqual(set(assignments_covering_section(self.sa3).values_list('user__username', flat=True)),
                         {'org_treasurer'})
        self.assertFalse(assignments_covering_section(999999).exists())

    def test_user_section_ids_expand_levels(self):
        self.assertEqual(user_section_ids(self.treasurer), {self.sa.id, self.sa2.id, self.sa3.id})
        self.assertEqual(user_section_ids(self.pmanager), {self.sa.id, self.sa2.id})
        self.assertEqual(user_section_ids(self.supervisor), {self.sa.id})
        self.assertEqual(user_section_ids(self.treasurer, role='manager'), set())
        self.assertEqual(user_section_ids(self.treasurer, company_id=self.b.id), set())
        self.assertEqual(user_section_ids(self.linked), set())
        self.sa2.is_active = False
        self.sa2.save(update_fields=['is_active'])
        self.pa2.is_active = False
        self.pa2.save(update_fields=['is_active'])
        self.assertEqual(user_section_ids(self.treasurer), {self.sa.id})
        with self.assertNumQueries(1):
            user_section_ids(self.treasurer, role='treasurer', company_id=self.a.id)

    def test_user_has_section_role(self):
        self.assertTrue(user_has_section_role(self.treasurer, self.sa3, 'treasurer'))
        self.assertTrue(user_has_section_role(self.pmanager.id, self.sa2.id, 'manager'))
        self.assertFalse(user_has_section_role(self.pmanager, self.sa3, 'manager'))
        self.assertFalse(user_has_section_role(self.linked, self.sa, 'manager'))
        self.assertTrue(user_has_section_role(self.supervisor, self.sa))
        self.assertFalse(user_has_section_role(self.treasurer, self.sb))

    def test_resolver_query_counts(self):
        section = ProjectSection.objects.select_related('project').get(pk=self.sa.pk)
        with self.assertNumQueries(1):
            list(section_role_holders(section, 'treasurer'))
        with self.assertNumQueries(1):
            user_has_section_role(self.treasurer, section, 'treasurer')

    def test_membership_from_company_and_project_levels(self):
        self.assertEqual(derived_company_ids(self.treasurer), {self.a.id})
        self.assertEqual(derived_company_ids(self.pmanager), {self.a.id})
        self.assertEqual(derived_company_ids(self.linked), set())
        labels = section_member_sources(self.a.id)
        self.assertIn('سطح شرکت', labels[self.treasurer.id][0])
        self.assertIn('پروژه الف', labels[self.pmanager.id][0])
        self.assertIn('بخش الف', labels[self.supervisor.id][0])
        self.assertNotIn(self.outsider.id, labels)
        self.assertNotIn(self.linked.id, labels)
        members = set(User.objects.filter(build_section_member_q([self.a.id])).values_list('id', flat=True))
        self.assertEqual(members, {self.treasurer.id, self.pmanager.id, self.supervisor.id})
        source = section_derived_company_source(self.treasurer)
        self.assertEqual([d['company_id'] for d in source], [self.a.id])
