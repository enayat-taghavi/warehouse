"""
طرح ۲.۲ (تکهٔ الف۱): موتور مجوزهای ریز — قالب اعلام، بسته‌ها، تفاوت‌ها، can/sections_where، has_perm و
ثابت بودن تعداد پرس‌وجوها (ق۱۸). مجوزهای بخشی با اعلام جعلی (patch) ساخته می‌شوند تا تست به اعلام
واقعی ماژول‌ها وابسته نباشد.
"""
from unittest import mock

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts import scoped_permissions as sp
from accounts.models import CustomUser, RoleBundleOverride, UserPermissionOverride
from companies.models import Company, Project, ProjectSection, SectionAssignment
from platform_core import module_catalog as mc


def _spec(code, scope='section', defaults=(), category=None, module='fake'):
    return {'code': code, 'label_fa': f'مجوز {code}', 'category': category, 'scope': scope,
            'defaults': tuple(defaults), 'module': module}


BASE_SPECS = {
    'zz_invoice': _spec('zz_invoice', defaults=('employee', 'accountant')),
    'zz_petty': _spec('zz_petty', defaults=('accountant',)),
    'zz_extra': _spec('zz_extra'),
    'zz_sys': _spec('zz_sys', scope='system'),
    # مجوز حساس که به‌اشتباه بخشی و در بسته اعلام شده: باید نادیده گرفته شود
    'perm_rollback_data': _spec('perm_rollback_data', defaults=('accountant',)),
}


class ScopedPermissionBase(TestCase):
    specs = BASE_SPECS

    def setUp(self):
        self.declared = {k: dict(v) for k, v in self.specs.items()}
        patcher = mock.patch.object(mc, 'installed_permission_specs', side_effect=lambda: self.declared)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.ct = ContentType.objects.get_for_model(CustomUser)
        self.perms = {}
        for code in list(self.declared) + ['zz_new']:
            self.perms[code], _ = Permission.objects.get_or_create(
                codename=code, content_type=self.ct, defaults={'name': code})

        self.a = Company.objects.create(code='SP-A', name='شرکت الف')
        self.b = Company.objects.create(code='SP-B', name='شرکت ب')
        self.pa = Project.objects.create(company=self.a, code='PA', name='پروژه الف')
        self.pa2 = Project.objects.create(company=self.a, code='PA2', name='پروژه الف۲')
        self.pb = Project.objects.create(company=self.b, code='PB', name='پروژه ب')
        self.sa1 = ProjectSection.objects.create(project=self.pa, code='SA1', name='بخش الف۱')
        self.sa2 = ProjectSection.objects.create(project=self.pa, code='SA2', name='بخش الف۲')
        self.sa3 = ProjectSection.objects.create(project=self.pa2, code='SA3', name='بخش الف۳')
        self.sb1 = ProjectSection.objects.create(project=self.pb, code='SB1', name='بخش ب۱')
        self.user = CustomUser.objects.create_user(username='sp_user', password='x')

    def fresh(self, user=None):
        return CustomUser.objects.get(pk=(user or self.user).pk)

    def assign(self, role, user=None, active=True, **target):
        return SectionAssignment.objects.create(user=user or self.user, role=role, is_active=active, **target)

    def override(self, code, mode, company=None, user=None):
        return UserPermissionOverride.objects.create(
            user=user or self.user, permission=self.perms[code], company=company, mode=mode)

    def where(self, user, code):
        return set(sp.sections_where(user, code).values_list('id', flat=True))


class InheritanceTests(ScopedPermissionBase):
    def test_company_level_covers_all_sections_of_company(self):
        self.assign('accountant', company=self.a)
        u = self.fresh()
        for s in (self.sa1, self.sa2, self.sa3):
            self.assertTrue(sp.can(u, 'zz_petty', s))
        self.assertFalse(sp.can(u, 'zz_petty', self.sb1))
        self.assertEqual(self.where(u, 'zz_petty'), {self.sa1.id, self.sa2.id, self.sa3.id})

    def test_project_level(self):
        self.assign('employee', project=self.pa)
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_invoice', self.sa1.id))
        self.assertTrue(sp.can(u, 'accounts.zz_invoice', self.sa2))
        self.assertFalse(sp.can(u, 'zz_invoice', self.sa3))
        self.assertFalse(sp.can(u, 'zz_petty', self.sa1))
        self.assertEqual(self.where(u, 'zz_invoice'), {self.sa1.id, self.sa2.id})
        self.assertEqual(self.where(u, 'zz_petty'), set())

    def test_role_per_section(self):
        # ت۱: در الف۱ حسابدار و در الف۲ کارمند؛ در الف۲ فقط کار کارمند
        self.assign('accountant', section=self.sa1)
        self.assign('employee', section=self.sa2)
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_petty', self.sa1))
        self.assertFalse(sp.can(u, 'zz_petty', self.sa2))
        self.assertTrue(sp.can(u, 'zz_invoice', self.sa2))
        self.assertFalse(sp.can(u, 'zz_invoice', self.sb1))
        self.assertTrue(sp.can(u, 'zz_petty'))  # دست‌کم در یک بخش
        self.assertEqual(self.where(u, 'zz_petty'), {self.sa1.id})
        self.assertEqual(self.where(u, 'zz_invoice'), {self.sa1.id, self.sa2.id})

    def test_inactive_assignment_and_no_assignment(self):
        self.assign('accountant', company=self.a, active=False)
        u = self.fresh()
        self.assertFalse(sp.can(u, 'zz_invoice', self.sa1))
        self.assertFalse(sp.can(u, 'zz_invoice'))
        self.assertEqual(self.where(u, 'zz_invoice'), set())

    def test_inactive_section_still_visible_for_history(self):
        self.assign('employee', project=self.pa)
        self.sa2.is_active = False
        self.sa2.save()
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_invoice', self.sa2))
        self.assertIn(self.sa2.id, self.where(u, 'zz_invoice'))

    def test_unknown_section(self):
        self.assign('employee', company=self.a)
        self.assertFalse(sp.can(self.fresh(), 'zz_invoice', 987654))

    def test_section_q(self):
        self.assign('employee', section=self.sa1)
        u = self.fresh()
        other = self.assign('employee', user=CustomUser.objects.create_user(username='sp_other'), section=self.sb1)
        rows = set(SectionAssignment.objects.filter(sp.section_q(u, 'zz_invoice')).values_list('section_id', flat=True))
        self.assertEqual(rows, {self.sa1.id})
        self.assertNotIn(other.section_id, rows)


class OverrideTests(ScopedPermissionBase):
    def test_company_override_isolation(self):
        self.assign('employee', section=self.sa1)
        self.assign('employee', section=self.sb1)
        self.override('zz_petty', 'add', company=self.a)
        self.override('zz_invoice', 'remove', company=self.b)
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_petty', self.sa1))
        self.assertFalse(sp.can(u, 'zz_petty', self.sb1))
        self.assertTrue(sp.can(u, 'zz_invoice', self.sa1))
        self.assertFalse(sp.can(u, 'zz_invoice', self.sb1))
        self.assertEqual(self.where(u, 'zz_petty'), {self.sa1.id})
        self.assertEqual(self.where(u, 'zz_invoice'), {self.sa1.id})

    def test_company_remove_applies_to_project_and_section_levels(self):
        self.assign('accountant', project=self.pa)
        self.assign('accountant', section=self.sa3)
        self.assign('accountant', company=self.a)
        self.override('zz_petty', 'remove', company=self.a)
        u = self.fresh()
        for s in (self.sa1, self.sa2, self.sa3):
            self.assertFalse(sp.can(u, 'zz_petty', s))
        self.assertFalse(sp.can(u, 'zz_petty'))
        self.assertFalse(u.has_perm('accounts.zz_petty'))
        self.assertEqual(self.where(u, 'zz_petty'), set())
        m = sp.user_permission_map(u)
        for level in ('company', 'project', 'section'):
            for codes in m[level].values():
                self.assertNotIn('zz_petty', codes)

    def test_add_without_assignment_does_nothing(self):
        self.assign('employee', section=self.sb1)
        self.override('zz_petty', 'add', company=self.a)
        u = self.fresh()
        self.assertFalse(sp.can(u, 'zz_petty', self.sa1))
        self.assertFalse(sp.can(u, 'zz_petty'))
        self.assertFalse(u.has_perm('accounts.zz_petty'))
        self.assertEqual(self.where(u, 'zz_petty'), set())

    def test_system_overrides(self):
        view_users = Permission.objects.get(codename='view_sys_users', content_type=self.ct)
        self.user.user_permissions.add(view_users)
        UserPermissionOverride.objects.create(
            user=self.user, permission=Permission.objects.get(codename='perm_usr_add', content_type=self.ct), mode='add')
        UserPermissionOverride.objects.create(user=self.user, permission=view_users, mode='remove')
        u = self.fresh()
        self.assertTrue(u.has_perm('accounts.perm_usr_add'))
        self.assertTrue(sp.can(u, 'perm_usr_add'))
        self.assertFalse(u.has_perm('accounts.view_sys_users'))
        self.assertFalse(sp.can(u, 'view_sys_users', self.sa1))

    def test_validate_user_override(self):
        with self.assertRaises(ValidationError):
            sp.validate_user_override(self.perms['zz_invoice'], None)
        with self.assertRaises(ValidationError):
            sp.validate_user_override(self.perms['zz_sys'], self.a.id)
        sp.validate_user_override(self.perms['zz_invoice'], self.a.id)
        sp.validate_user_override(self.perms['zz_sys'], None)
        with self.assertRaises(ValidationError):
            UserPermissionOverride(user=self.user, permission=self.perms['zz_petty'], mode='add').full_clean()


class BundleTests(ScopedPermissionBase):
    def test_sensitive_never_in_bundle(self):
        RoleBundleOverride.objects.create(role_key='employee', permission=self.perms['perm_rollback_data'], mode='add')
        bundles = sp.effective_bundles()
        for codes in bundles.values():
            self.assertNotIn('perm_rollback_data', codes)
        self.assertNotIn('perm_rollback_data', sp.section_permission_codes())
        self.assign('accountant', company=self.a)
        self.assign('employee', company=self.a)
        u = self.fresh()
        self.assertFalse(sp.can(u, 'perm_rollback_data', self.sa1))
        self.assertFalse(u.has_perm('accounts.perm_rollback_data'))
        self.assertNotIn('perm_rollback_data', sp.user_permission_map(u)['all'])

    def test_bundle_override_and_new_default_reaches_overridden_bundle(self):
        RoleBundleOverride.objects.create(role_key='employee', permission=self.perms['zz_extra'], mode='add')
        RoleBundleOverride.objects.create(role_key='employee', permission=self.perms['zz_invoice'], mode='remove')
        # تفاوت روی مجوز سامانه‌ای در بسته اثری ندارد
        RoleBundleOverride.objects.create(role_key='employee', permission=self.perms['zz_sys'], mode='add')
        self.assign('employee', section=self.sa1)
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_extra', self.sa1))
        self.assertFalse(sp.can(u, 'zz_invoice', self.sa1))
        self.assertFalse(sp.can(u, 'zz_sys'))
        details = sp.role_bundle_details()['employee']
        self.assertEqual(details['defaults'], frozenset({'zz_invoice'}))
        self.assertEqual(details['added'], frozenset({'zz_extra'}))
        self.assertEqual(details['removed'], frozenset({'zz_invoice'}))
        self.assertEqual(details['effective'], frozenset({'zz_extra'}))

        # ق۱۷: نسخهٔ بعدی ماژول مجوز تازه به سهم پیش‌فرض کارمند می‌دهد و zz_invoice را هم دوباره اعلام می‌کند
        self.declared['zz_new'] = _spec('zz_new', defaults=('employee',))
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_new', self.sa1))
        self.assertFalse(sp.can(u, 'zz_invoice', self.sa1))  # برداشتهٔ مدیر برنمی‌گردد
        self.assertTrue(sp.can(u, 'zz_extra', self.sa1))

    def test_bundle_union_of_roles(self):
        self.assign('employee', section=self.sa1)
        self.assign('accountant', section=self.sa1)
        u = self.fresh()
        self.assertTrue(sp.can(u, 'zz_invoice', self.sa1))
        self.assertTrue(sp.can(u, 'zz_petty', self.sa1))


class BackendTests(ScopedPermissionBase):
    def test_has_perm_at_least_one_section(self):
        self.assign('employee', section=self.sa1)
        u = self.fresh()
        self.assertTrue(u.has_perm('accounts.zz_invoice'))
        self.assertFalse(u.has_perm('accounts.zz_petty'))
        self.assertIn('accounts.zz_invoice', u.get_all_permissions())

    def test_section_perm_from_direct_tick_or_system_role_ignored(self):
        from accounts.models import CustomRole
        role = CustomRole.objects.create(name='sp_sys_role', title='نقش سامانه‌ای')
        role.permissions.add(self.perms['zz_petty'], self.perms['zz_sys'])
        self.user.groups.add(role)
        self.user.user_permissions.add(self.perms['zz_extra'])
        u = self.fresh()
        self.assertFalse(u.has_perm('accounts.zz_petty'))
        self.assertFalse(u.has_perm('accounts.zz_extra'))
        self.assertTrue(u.has_perm('accounts.zz_sys'))
        self.assertTrue(sp.can(u, 'zz_sys'))

    def test_cache_follows_django_perm_cache(self):
        u = self.fresh()
        self.assertFalse(u.has_perm('accounts.zz_invoice'))
        self.assign('employee', section=self.sa1, user=u)
        self.assertFalse(u.has_perm('accounts.zz_invoice'))  # کش همان درخواست
        del u._perm_cache  # الگوی تست‌های موجود
        self.assertTrue(u.has_perm('accounts.zz_invoice'))
        self.override('zz_invoice', 'remove', company=self.a, user=u)
        sp.clear_scoped_permission_cache(u)
        self.assertFalse(u.has_perm('accounts.zz_invoice'))

    def test_superuser_and_inactive(self):
        su = CustomUser.objects.create_superuser(username='sp_su', password='x')
        self.assertTrue(sp.can(su, 'zz_petty', self.sb1))
        self.assertEqual(self.where(su, 'zz_petty'), set(ProjectSection.objects.values_list('id', flat=True)))
        self.assertTrue(sp.user_permission_map(su)['is_superuser'])
        self.assign('employee', section=self.sa1)
        self.user.is_active = False
        self.user.save()
        u = self.fresh()
        self.assertFalse(sp.can(u, 'zz_invoice', self.sa1))
        self.assertEqual(self.where(u, 'zz_invoice'), set())

    def test_system_perm_sections_where_uses_assignments(self):
        self.user.user_permissions.add(self.perms['zz_sys'])
        self.assign('employee', project=self.pa)
        u = self.fresh()
        self.assertEqual(self.where(u, 'zz_sys'), {self.sa1.id, self.sa2.id})
        self.assertEqual(self.where(u, 'view_sys_users'), set())


class PermissionMapTests(ScopedPermissionBase):
    def test_map_shape_and_pure_union(self):
        self.user.user_permissions.add(Permission.objects.get(codename='view_sys_users', content_type=self.ct))
        self.assign('employee', company=self.a)
        self.assign('accountant', section=self.sa1)
        self.assign('employee', project=self.pb)
        self.override('zz_extra', 'add', company=self.b)
        m = sp.user_permission_map(self.fresh())
        self.assertEqual(set(m), {'is_superuser', 'system', 'company', 'project', 'section', 'all'})
        self.assertEqual(m['system'], ['view_sys_users'])
        self.assertEqual(m['company'], {self.a.id: ['zz_invoice']})
        self.assertEqual(m['project'], {self.pb.id: ['zz_extra', 'zz_invoice']})
        self.assertEqual(m['section'], {self.sa1.id: ['zz_invoice', 'zz_petty']})
        self.assertEqual(m['all'], ['view_sys_users', 'zz_extra', 'zz_invoice', 'zz_petty'])


class QueryCountTests(ScopedPermissionBase):
    """ق۱۸: تعداد پرس‌وجوها به تعداد بخش‌ها و انتساب‌ها بستگی ندارد."""

    def _user_with(self, n):
        user = CustomUser.objects.create_user(username=f'sp_q_{n}', password='x')
        project = Project.objects.create(company=self.a, code=f'PQ{n}', name=f'پروژه {n}')
        sections = ProjectSection.objects.bulk_create([
            ProjectSection(project=project, code=f'Q{n}-{i}', name=f'بخش {i}') for i in range(n)])
        roles = ('employee', 'accountant')
        SectionAssignment.objects.bulk_create([
            SectionAssignment(user=user, section=s, role=roles[i % 2]) for i, s in enumerate(sections)])
        SectionAssignment.objects.create(user=user, project=self.pa, role='employee')
        SectionAssignment.objects.create(user=user, company=self.b, role='accountant')
        RoleBundleOverride.objects.get_or_create(role_key='employee', permission=self.perms['zz_extra'],
                                                 defaults={'mode': 'add'})
        UserPermissionOverride.objects.create(user=user, permission=self.perms['zz_petty'], company=self.a, mode='add')
        return user, sections

    def _count(self, user, fn):
        u = self.fresh(user)
        with CaptureQueriesContext(connection) as ctx:
            fn(u)
        return len(ctx.captured_queries)

    def test_constant_queries(self):
        small, small_secs = self._user_with(5)
        big, big_secs = self._user_with(200)
        checks = {
            'can_section_obj': lambda secs: (lambda u: [sp.can(u, 'zz_petty', s) for s in secs[:3]]),
            'can_section_id_outside': lambda secs: (lambda u: sp.can(u, 'zz_invoice', self.sb1.id)),
            'can_none': lambda secs: (lambda u: sp.can(u, 'zz_invoice')),
            'sections_where': lambda secs: (lambda u: list(sp.sections_where(u, 'zz_invoice'))),
            'has_perm': lambda secs: (lambda u: u.has_perm('accounts.zz_petty')),
            'map': lambda secs: (lambda u: sp.user_permission_map(u)),
        }
        for name, make in checks.items():
            n_small = self._count(small, make(small_secs))
            n_big = self._count(big, make(big_secs))
            self.assertEqual(n_small, n_big, f'{name}: {n_small} != {n_big}')
            self.assertLessEqual(n_big, 12, name)
        u = self.fresh(big)
        # 200 بخش + الف۱ و الف۲ (پروژهٔ الف) + ب۱ (شرکت ب)
        self.assertEqual(len(list(sp.sections_where(u, 'zz_invoice'))), 200 + 2 + 1)
        self.assertTrue(sp.can(u, 'zz_invoice', self.sb1))  # کارمند نیست ولی حسابدار سطح شرکت ب است


class DeclarationTests(TestCase):
    def test_old_format_is_system(self):
        specs = mc._normalize_permissions('m', (('a_code', 'نام'),), ())
        self.assertEqual(specs[0]['scope'], 'system')
        self.assertEqual(specs[0]['defaults'], ())
        self.assertIsNone(specs[0]['category'])

    def test_new_format(self):
        cats = mc._normalize_categories('m', ({'key': 'inv', 'label_fa': 'فاکتور', 'order': 2, 'menu': 'invoices'},))
        specs = mc._normalize_permissions('m', ({'code': 'x', 'label_fa': 'ایکس', 'category': 'inv', 'scope': 'section',
                                                 'defaults': ('employee', 'employee')},), cats)
        self.assertEqual(specs[0]['defaults'], ('employee',))
        self.assertEqual(cats[0]['menu'], 'invoices')

    def test_validation_errors(self):
        cats = mc._normalize_categories('m', ({'key': 'inv', 'label_fa': 'فاکتور'},))
        bad = [
            {'code': 'x', 'label_fa': 'x', 'scope': 'global'},
            {'code': 'x', 'label_fa': 'x', 'scope': 'system', 'defaults': ('employee',)},
            {'code': 'x', 'label_fa': 'x', 'scope': 'section', 'category': 'nope'},
            {'code': 'x', 'label_fa': 'x', 'scope': 'section', 'defaults': 'employee'},
            {'code': 'x', 'label_fa': 'x', 'extra': 1},
            {'code': 'x'},
        ]
        for item in bad:
            with self.assertRaises(ValueError, msg=item):
                mc._normalize_permissions('m', (item,), cats)
        with self.assertRaises(ValueError):
            mc._normalize_permissions('m', (('x', 'x'), ('x', 'x')), ())
        with self.assertRaises(ValueError):
            mc._normalize_categories('m', ({'key': 'a', 'label_fa': 'a'}, {'key': 'a', 'label_fa': 'b'}))

    def test_merge_across_modules(self):
        one = mc._normalize_permissions('one', ({'code': 'x', 'label_fa': 'x', 'scope': 'section', 'defaults': ('a',)},), ())
        two = mc._normalize_permissions('two', ({'code': 'x', 'label_fa': 'x', 'scope': 'section', 'defaults': ('b',)},), ())
        merged = mc.merge_permission_specs({'one': one, 'two': two})
        self.assertEqual(merged['x']['defaults'], ('a', 'b'))
        conflict = mc._normalize_permissions('two', ({'code': 'x', 'label_fa': 'x', 'scope': 'system'},), ())
        with self.assertRaises(ValueError):
            mc.merge_permission_specs({'one': one, 'two': conflict})

    def test_real_declarations(self):
        from companies.models import section_role_choices
        roles = {r for r, _ in section_role_choices()}
        for code, spec in mc.installed_permission_specs().items():
            self.assertIn(spec['scope'], mc.PERMISSION_SCOPES)
            for role in spec['defaults']:
                self.assertIn(role, roles, f'{code}: نقش ناشناختهٔ {role}')
        for spec in mc.MODULE_PERMISSION_SPECS.get('warehouse', ()):
            self.assertEqual(spec['scope'], 'system')
        # قالب قدیم برای مصرف‌کننده‌های موجود
        self.assertEqual(mc.MODULE_PERMISSIONS.get('warehouse', ()),
                         tuple((s['code'], s['label_fa']) for s in mc.MODULE_PERMISSION_SPECS.get('warehouse', ())))
