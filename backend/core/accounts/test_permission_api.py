"""
طرح ۲.۲ (تکهٔ الف۲): API مجوزهای ریز، قواعد ت۱۰، نقش سامانه‌ای تخت (ت۱۱)، سابقه (ق۸) و رویداد وب‌سوکت (ق۴).
مجوزهای بخشی با اعلام جعلی (patch) ساخته می‌شوند تا تست به اعلام واقعی ماژول‌ها وابسته نباشد.
"""
from unittest import mock

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts import permission_events as pe
from accounts.models import (
    AuditLog, CustomRole, CustomUser, RoleBundleOverride, SENSITIVE_PERMISSION_CODENAMES, UserPermissionOverride,
)
from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from platform_core import module_catalog as mc


def _spec(code, scope='section', defaults=(), category=None, module='fake'):
    return {'code': code, 'label_fa': f'مجوز {code}', 'category': category, 'scope': scope,
            'defaults': tuple(defaults), 'module': module}


SPECS = {
    'zz_invoice': _spec('zz_invoice', defaults=('employee', 'accountant')),
    'zz_petty': _spec('zz_petty', defaults=('accountant',)),
    'zz_extra': _spec('zz_extra'),
    'zz_sys': _spec('zz_sys', scope='system'),
}


class PermissionApiBase(TestCase):
    def setUp(self):
        self.declared = {k: dict(v) for k, v in SPECS.items()}
        patcher = mock.patch.object(mc, 'installed_permission_specs', side_effect=lambda: self.declared)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.sent = []
        send_patcher = mock.patch.object(pe, '_send', side_effect=lambda msgs: self.sent.extend(msgs))
        send_patcher.start()
        self.addCleanup(send_patcher.stop)

        self.ct = ContentType.objects.get_for_model(CustomUser)
        self.perms = {}
        for code in SPECS:
            self.perms[code], _ = Permission.objects.get_or_create(
                codename=code, content_type=self.ct, defaults={'name': code})

        self.a = Company.objects.create(code='PA-A', name='شرکت الف')
        self.b = Company.objects.create(code='PA-B', name='شرکت ب')
        self.pa = Project.objects.create(company=self.a, code='PA', name='پروژه الف')
        self.pb = Project.objects.create(company=self.b, code='PB', name='پروژه ب')
        self.sa = ProjectSection.objects.create(project=self.pa, code='SA', name='بخش الف')
        self.sb = ProjectSection.objects.create(project=self.pb, code='SB', name='بخش ب')

        self.admin = CustomUser.objects.create_superuser('pa_admin', 'pa@x.com', 'pass1234')
        # مدیر نقش‌ها: perm_usr_role + view_sys_users، کارمند شرکت الف (پس zz_invoice را فقط در الف دارد)
        self.manager = self.make_user('pa_manager', 'view_sys_users', 'perm_usr_role')
        self.link(self.manager, self.a)
        SectionAssignment.objects.create(user=self.manager, company=self.a, role='employee')
        # کاربر هدف: کارمند بخش الف
        self.target = self.make_user('pa_target')
        self.link(self.target, self.a)
        SectionAssignment.objects.create(user=self.target, section=self.sa, role='employee')
        self.client = APIClient()

    def make_user(self, username, *codes):
        user = CustomUser.objects.create_user(username=username, password='pass-1234-x')
        if codes:
            user.user_permissions.add(*Permission.objects.filter(content_type=self.ct, codename__in=codes))
        return user

    def link(self, user, company):
        UserCompanyAccess.objects.get_or_create(user=user, company=company)

    def as_user(self, user):
        self.client.force_authenticate(user=CustomUser.objects.get(pk=user.pk))
        return self.client

    def put_override(self, editor, target, company_id, add=(), remove=()):
        with self.captureOnCommitCallbacks(execute=True):
            return self.as_user(editor).put(
                f'/api/accounts/users/{target.pk}/permissions/',
                {'company_id': company_id, 'add': list(add), 'remove': list(remove)}, format='json')

    def groups_sent(self):
        return [g for g, _ in self.sent]


class CatalogAndMyPermissionsTests(PermissionApiBase):
    def test_catalog_shape_and_access(self):
        res = self.as_user(self.admin).get('/api/accounts/permission-catalog/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.data), {'categories', 'permissions', 'roles', 'bundles'})
        perms = {p['code']: p for p in res.data['permissions']}
        self.assertEqual(perms['zz_invoice']['scope'], 'section')
        self.assertEqual(perms['zz_sys']['scope'], 'system')
        self.assertEqual(perms['view_sys_users']['scope'], 'system')
        sensitive_code = sorted(SENSITIVE_PERMISSION_CODENAMES)[0]
        if sensitive_code in perms:
            self.assertTrue(perms[sensitive_code]['sensitive'])
        codes = [p['code'] for p in res.data['permissions']]
        self.assertEqual(codes, sorted(codes))
        role_keys = [r['key'] for r in res.data['roles']]
        self.assertIn('employee', role_keys)
        self.assertTrue(all({'key', 'label_fa', 'rank'} <= set(r) for r in res.data['roles']))
        self.assertEqual(res.data['bundles']['employee'],
                         {'defaults': ['zz_invoice'], 'added': [], 'removed': [], 'effective': ['zz_invoice']})
        # کاربر عادی نه؛ دارندهٔ perm_usr_role بله
        # هر کاربر واردشده فهرست را برای منوی دسته‌ها می‌خواند، ولی بسته‌ها را فقط خوانندهٔ صفحهٔ کاربران (ت۵)
        plain = self.as_user(self.target).get('/api/accounts/permission-catalog/')
        self.assertEqual(plain.status_code, 200)
        self.assertEqual(plain.data['bundles'], {})
        self.assertTrue(plain.data['permissions'])
        self.assertEqual(self.as_user(self.manager).get('/api/accounts/permission-catalog/').status_code, 200)

    def test_my_permissions_map_and_version(self):
        res = self.as_user(self.target).get('/api/accounts/my-permissions/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['is_superuser'])
        self.assertEqual(res.data['section'], {str(self.sa.id): ['zz_invoice']})
        self.assertIn('zz_invoice', res.data['all'])
        v1 = res.data['version']
        self.assertEqual(len(v1), 16)
        self.assertEqual(self.as_user(self.target).get('/api/accounts/my-permissions/').data['version'], v1)
        UserPermissionOverride.objects.create(user=self.target, permission=self.perms['zz_extra'],
                                              company=self.a, mode='add')
        res2 = self.as_user(self.target).get('/api/accounts/my-permissions/')
        self.assertNotEqual(res2.data['version'], v1)
        self.assertEqual(res2.data['section'][str(self.sa.id)], ['zz_extra', 'zz_invoice'])

    def test_my_permissions_query_count_constant(self):
        def count_for(n):
            user = self.make_user(f'pa_q{n}')
            project = Project.objects.create(company=self.a, code=f'Q{n}', name=f'پروژه {n}')
            for i in range(n):
                section = ProjectSection.objects.create(project=project, code=f'Q{n}-{i}', name=f'بخش {i}')
                SectionAssignment.objects.create(user=user, section=section, role='employee')
            client = APIClient()
            client.force_authenticate(user=CustomUser.objects.get(pk=user.pk))
            with CaptureQueriesContext(connection) as ctx:
                res = client.get('/api/accounts/my-permissions/')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(len(res.data['section']), n)
            return len(ctx.captured_queries)
        self.assertEqual(count_for(5), count_for(200))

    def test_login_returns_engine_permissions_and_map(self):
        res = APIClient().post('/api/accounts/login/', {'username': 'pa_target', 'password': 'pass-1234-x'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        user = res.data['user']
        self.assertIn('zz_invoice', user['permissions'])  # بخشی از بسته، نه از نقش سامانه‌ای
        self.assertEqual(user['permission_map']['section'], {str(self.sa.id): ['zz_invoice']})
        self.assertIn('version', user['permission_map'])


class RoleBundleTests(PermissionApiBase):
    def test_put_stores_only_diff_and_reset_clears(self):
        with self.captureOnCommitCallbacks(execute=True):
            res = self.as_user(self.admin).put('/api/accounts/role-bundles/employee/',
                                               {'effective': ['zz_extra']}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data, {'role_key': 'employee', 'defaults': ['zz_invoice'], 'added': ['zz_extra'],
                                    'removed': ['zz_invoice'], 'effective': ['zz_extra']})
        rows = set(RoleBundleOverride.objects.filter(role_key='employee').values_list('permission__codename', 'mode'))
        self.assertEqual(rows, {('zz_extra', 'add'), ('zz_invoice', 'remove')})
        catalog = self.as_user(self.admin).get('/api/accounts/permission-catalog/').data
        self.assertEqual(catalog['bundles']['employee']['added'], ['zz_extra'])
        # کاربر بخش فوراً اثر را می‌بیند
        self.assertEqual(self.as_user(self.target).get('/api/accounts/my-permissions/').data['section'],
                         {str(self.sa.id): ['zz_extra']})
        # همان پیش‌فرض: ردیف بی‌اثر پاک می‌شود
        with self.captureOnCommitCallbacks(execute=True):
            self.as_user(self.admin).put('/api/accounts/role-bundles/employee/', {'effective': ['zz_invoice']}, format='json')
        self.assertFalse(RoleBundleOverride.objects.filter(role_key='employee').exists())
        RoleBundleOverride.objects.create(role_key='employee', permission=self.perms['zz_extra'], mode='add')
        with self.captureOnCommitCallbacks(execute=True):
            res = self.as_user(self.admin).post('/api/accounts/role-bundles/employee/reset/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['effective'], ['zz_invoice'])
        self.assertFalse(RoleBundleOverride.objects.filter(role_key='employee').exists())
        logs = AuditLog.objects.filter(target_model='RoleBundle', target_object_id='employee')
        self.assertEqual(logs.count(), 3)
        self.assertTrue(any(log.details.get('reset') for log in logs))
        first = logs.order_by('id').first()
        self.assertEqual(first.details['added'], ['zz_extra'])
        self.assertEqual(first.details['removed'], ['zz_invoice'])

    def test_bundle_websocket_targets(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.as_user(self.admin).put('/api/accounts/role-bundles/employee/', {'effective': ['zz_extra']}, format='json')
        groups = self.groups_sent()
        self.assertIn(f'user_{self.target.pk}', groups)
        self.assertIn(f'user_{self.manager.pk}', groups)
        self.assertIn(f'company_{self.a.pk}_notifications', groups)
        self.assertNotIn(f'company_{self.b.pk}_notifications', groups)
        self.assertNotIn('global_notifications', groups)
        payload = dict(self.sent)[f'user_{self.target.pk}']
        self.assertEqual(payload['type_str'], 'permissions_updated')
        self.assertEqual(payload['reason'], 'bundle')
        self.assertEqual(payload['user_id'], self.target.pk)

    def test_bundle_edit_rejections(self):
        # قاعدهٔ ۱: فقط مدیر کل سامانه
        res = self.as_user(self.manager).put('/api/accounts/role-bundles/employee/', {'effective': []}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.as_user(self.manager).post('/api/accounts/role-bundles/employee/reset/').status_code, 403)
        admin = self.as_user(self.admin)
        self.assertEqual(admin.put('/api/accounts/role-bundles/no_such_role/', {'effective': []}, format='json').status_code, 400)
        self.assertEqual(admin.put('/api/accounts/role-bundles/employee/', {'effective': ['zz_sys']}, format='json').status_code, 400)
        sensitive = sorted(SENSITIVE_PERMISSION_CODENAMES)[0]
        res = admin.put('/api/accounts/role-bundles/employee/', {'effective': [sensitive]}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(admin.put('/api/accounts/role-bundles/employee/', {'effective': 'zz_extra'}, format='json').status_code, 400)
        self.assertFalse(RoleBundleOverride.objects.exists())


class UserOverrideTests(PermissionApiBase):
    def test_get_detail_shape_and_editable(self):
        res = self.as_user(self.manager).get(f'/api/accounts/users/{self.target.pk}/permissions/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['assignments'][0]['level'], 'section')
        self.assertEqual(res.data['assignments'][0]['section_id'], self.sa.id)
        comp = res.data['companies'][self.a.pk]
        self.assertEqual(comp['from_roles'], ['zz_invoice'])
        self.assertEqual(comp['effective'], ['zz_invoice'])
        editable = res.data['editable']
        self.assertTrue(editable['system'])
        self.assertEqual(editable['companies'], [self.a.pk])
        self.assertEqual(editable['company_locked_codes'][self.a.pk], {'zz_extra': mock.ANY, 'zz_petty': mock.ANY})
        self.assertIn('zz_sys', editable['locked_codes'])
        self.assertNotIn('view_sys_users', editable['locked_codes'])

    def test_section_override_add_remove_and_isolation(self):
        # مدیر کل سامانه zz_extra را در الف می‌افزاید؛ شرکت ب دست نمی‌خورد
        SectionAssignment.objects.create(user=self.target, section=self.sb, role='employee')
        res = self.put_override(self.admin, self.target, self.a.pk, add=['zz_extra'])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['companies'][self.a.pk]['effective'], ['zz_extra', 'zz_invoice'])
        self.assertEqual(res.data['companies'][self.b.pk]['effective'], ['zz_invoice'])
        my = self.as_user(self.target).get('/api/accounts/my-permissions/').data
        self.assertEqual(my['section'][str(self.sa.id)], ['zz_extra', 'zz_invoice'])
        self.assertEqual(my['section'][str(self.sb.id)], ['zz_invoice'])
        # مدیر نقش‌ها zz_invoice را (که خودش در الف دارد) برمی‌دارد و افزودهٔ قبلی را دست‌نخورده برمی‌گرداند:
        # فقط کدهای تغییرکرده سنجیده می‌شوند، پس zz_extra (که مدیر ندارد) مانعی نیست
        res = self.put_override(self.manager, self.target, self.a.pk, add=['zz_extra'], remove=['zz_invoice'])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['companies'][self.a.pk]['effective'], ['zz_extra'])
        # ولی برداشتن تفاوت zz_extra (که مدیر ندارد) تغییر است و ممنوع (قاعدهٔ ۳ برای افزودن و برداشتن یکی است)
        res = self.put_override(self.manager, self.target, self.a.pk, remove=['zz_invoice'])
        self.assertEqual(res.status_code, 403)
        self.assertTrue(UserPermissionOverride.objects.filter(user=self.target, company=self.a, mode='add').exists())

    def test_saved_remove_survives_bundle_change_and_resave(self):
        """برداشتهٔ ثبت‌شده با برداشتن کد از بسته و ذخیرهٔ دوبارهٔ همان فهرست پاک نمی‌شود (ق۱۷)."""
        self.assertEqual(self.put_override(self.admin, self.target, self.a.pk, remove=['zz_invoice']).status_code, 200)
        # مدیر کل سامانه zz_invoice را از بستهٔ کارمند برمی‌دارد، پس دیگر در پایهٔ کاربر نیست
        RoleBundleOverride.objects.create(role_key='employee', permission=self.perms['zz_invoice'], mode='remove')
        # فرانت فهرست کامل همان دامنه را دوباره می‌فرستد (مثلاً هنگام افزودن zz_extra)
        res = self.put_override(self.admin, self.target, self.a.pk, add=['zz_extra'], remove=['zz_invoice'])
        self.assertEqual(res.status_code, 200, res.data)
        RoleBundleOverride.objects.filter(role_key='employee').delete()  # کد به بسته برمی‌گردد
        rows = set(UserPermissionOverride.objects.filter(user=self.target, company=self.a)
                   .values_list('permission__codename', 'mode'))
        self.assertEqual(rows, {('zz_extra', 'add'), ('zz_invoice', 'remove')})
        res = self.as_user(self.admin).get(f'/api/accounts/users/{self.target.pk}/permissions/')
        self.assertNotIn('zz_invoice', res.data['companies'][self.a.pk]['effective'])

    def test_manager_override_within_own_codes(self):
        res = self.put_override(self.manager, self.target, self.a.pk, remove=['zz_invoice'])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['companies'][self.a.pk]['removed'], ['zz_invoice'])
        self.assertEqual(res.data['companies'][self.a.pk]['effective'], [])
        log = AuditLog.objects.get(target_model='UserPermissionOverride', target_object_id=str(self.target.pk))
        self.assertEqual(log.details['revoked'], ['zz_invoice'])
        self.assertEqual(log.details['company_id'], self.a.pk)
        groups = self.groups_sent()
        self.assertEqual(sorted(groups), sorted([f'user_{self.target.pk}', f'company_{self.a.pk}_notifications']))
        # افزودن کدی که خودش در الف ندارد: ۴۰۳
        res = self.put_override(self.manager, self.target, self.a.pk, add=['zz_petty'], remove=['zz_invoice'])
        self.assertEqual(res.status_code, 403)
        # تفاوت بی‌اثر ذخیره نمی‌شود: افزودن کدی که از نقش‌ها دارد
        res = self.put_override(self.manager, self.target, self.a.pk, add=['zz_invoice'])
        self.assertEqual(res.status_code, 200)
        self.assertFalse(UserPermissionOverride.objects.filter(user=self.target).exists())

    def test_company_outside_editor_scope(self):
        SectionAssignment.objects.create(user=self.target, section=self.sb, role='employee')
        res = self.put_override(self.manager, self.target, self.b.pk, remove=['zz_invoice'])
        self.assertEqual(res.status_code, 403)
        detail = self.as_user(self.manager).get(f'/api/accounts/users/{self.target.pk}/permissions/').data
        self.assertNotIn(self.b.pk, detail['companies'])  # شرکت بیرون از قلمرو دیده نمی‌شود
        self.assertTrue(all(a['company_id'] == self.a.pk for a in detail['assignments']))

    def test_self_and_out_of_scope_and_sensitive(self):
        self.assertEqual(self.put_override(self.manager, self.manager, self.a.pk, remove=['zz_invoice']).status_code, 403)
        stranger = self.make_user('pa_stranger')
        self.link(stranger, self.b)
        self.assertEqual(self.as_user(self.manager).get(f'/api/accounts/users/{stranger.pk}/permissions/').status_code, 404)
        self.assertEqual(self.put_override(self.manager, stranger, None, add=['view_sys_users']).status_code, 404)
        sensitive = sorted(SENSITIVE_PERMISSION_CODENAMES)[0]
        Permission.objects.get_or_create(codename=sensitive, content_type=self.ct, defaults={'name': sensitive})
        self.manager.user_permissions.add(Permission.objects.get(codename=sensitive, content_type=self.ct))
        res = self.put_override(self.manager, self.target, None, add=[sensitive])
        self.assertEqual(res.status_code, 403)
        self.assertIn('حساس', str(res.data))
        self.assertEqual(self.put_override(self.admin, self.target, None, add=[sensitive]).status_code, 200)

    def test_system_override_rules(self):
        res = self.put_override(self.manager, self.target, None, add=['view_sys_users'])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['system']['added'], ['view_sys_users'])
        self.assertIn('view_sys_users', res.data['system']['effective'])
        self.assertTrue(CustomUser.objects.get(pk=self.target.pk).has_perm('accounts.view_sys_users'))
        self.assertIn(f'user_{self.target.pk}', self.groups_sent())
        self.assertIn(f'company_{self.a.pk}_notifications', self.groups_sent())
        # کدی که مدیر ندارد
        self.assertEqual(self.put_override(self.manager, self.target, None, add=['view_sys_users', 'zz_sys']).status_code, 403)
        # کاربر عضو شرکت دیگری هم هست: تفاوت سامانه‌ای ممنوع
        SectionAssignment.objects.create(user=self.target, section=self.sb, role='employee')
        res = self.put_override(self.manager, self.target, None, add=[])
        self.assertEqual(res.status_code, 403)
        detail = self.as_user(self.manager).get(f'/api/accounts/users/{self.target.pk}/permissions/').data
        self.assertFalse(detail['editable']['system'])
        self.assertTrue(detail['editable']['system_reason_fa'])

    def test_scope_validation(self):
        res = self.put_override(self.admin, self.target, None, add=['zz_extra'])
        self.assertEqual(res.status_code, 400)  # مجوز بخشی بی شرکت
        res = self.put_override(self.admin, self.target, self.a.pk, add=['view_sys_users'])
        self.assertEqual(res.status_code, 400)  # مجوز سامانه‌ای با شرکت
        res = self.put_override(self.admin, self.target, self.a.pk, add=['zz_extra'], remove=['zz_extra'])
        self.assertEqual(res.status_code, 400)
        res = self.put_override(self.admin, self.target, self.a.pk, add=['no_such_code'])
        self.assertEqual(res.status_code, 400)


class SystemRoleTests(PermissionApiBase):
    def test_role_rejects_section_scope_codes(self):
        res = self.as_user(self.admin).post('/api/accounts/roles/', {
            'name': 'r_sec', 'title': 'نقش بخشی', 'permissions': [self.perms['zz_invoice'].id]}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('zz_invoice', str(res.data))
        role = CustomRole.objects.create(name='r_flat', title='نقش تخت')
        res = self.as_user(self.admin).patch(f'/api/accounts/roles/{role.id}/', {
            'permissions': [self.perms['zz_sys'].id, self.perms['zz_petty'].id]}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_role_import_rejects_section_scope_codes(self):
        from accounts.tests import create_excel_upload_file
        f = create_excel_upload_file(['n', 't', 'c', 'p'], ['name', 'title', 'color', 'permissions'],
                                     [['r_imp', 'نقش', '#4f46e5', 'zz_invoice'], ['r_ok', 'نقش ۲', '#4f46e5', 'zz_sys']])
        res = self.as_user(self.admin).post('/api/accounts/roles/import_excel/', {'file': f}, format='multipart')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(CustomRole.objects.filter(name='r_imp').exists())
        self.assertTrue(CustomRole.objects.filter(name='r_ok').exists())
        self.assertTrue(any('zz_invoice' in e['message'] for e in res.data['errors']))

    def test_manager_role_changes_follow_rules(self):
        role = CustomRole.objects.create(name='r_users', title='نقش کاربران')
        role.permissions.add(Permission.objects.get(content_type=self.ct, codename='view_sys_users'))
        client = self.as_user(self.manager)
        # دادن نقشی که مجوزهایش را خودش دارد به کاربر هم‌شرکتی: مجاز
        with self.captureOnCommitCallbacks(execute=True):
            res = client.patch(f'/api/accounts/roles/{role.id}/', {'user_ids': [self.target.pk]}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn(f'user_{self.target.pk}', self.groups_sent())
        self.assertNotIn('global_notifications', self.groups_sent())
        log = AuditLog.objects.filter(target_model='CustomRole', target_object_id=str(role.id)).latest('id')
        self.assertEqual(log.details['users_added'], [self.target.pk])
        # افزودن مجوزی که خودش ندارد: ۴۰۳
        res = client.patch(f'/api/accounts/roles/{role.id}/', {
            'permissions': [Permission.objects.get(content_type=self.ct, codename='zz_sys').id]}, format='json')
        self.assertEqual(res.status_code, 403)
        # خودش را عضو نقش کند: ۴۰۳
        res = client.patch(f'/api/accounts/roles/{role.id}/', {'user_ids': [self.target.pk, self.manager.pk]}, format='json')
        self.assertEqual(res.status_code, 403)
        # کاربری که عضو شرکت دیگری هم هست: نقش سامانه‌ای ممنوع
        other = self.make_user('pa_other')
        self.link(other, self.a)
        SectionAssignment.objects.create(user=other, section=self.sb, role='employee')
        res = client.patch(f'/api/accounts/roles/{role.id}/', {'user_ids': [self.target.pk, other.pk]}, format='json')
        self.assertEqual(res.status_code, 403)
        # همین از مسیر ویرایش کاربر
        res = client.patch(f'/api/accounts/users/{other.pk}/', {'groups': [role.id]}, format='json')
        self.assertIn(res.status_code, (403, 404))
        self.assertFalse(other.groups.exists())

    def test_user_update_grants_need_manage_permission(self):
        editor = self.make_user('pa_editor', 'view_sys_users')
        self.link(editor, self.a)
        SectionAssignment.objects.create(user=editor, company=self.a, role='employee')
        role = CustomRole.objects.create(name='r_x', title='نقش')
        res = self.as_user(editor).patch(f'/api/accounts/users/{self.target.pk}/', {'groups': [role.id]}, format='json')
        self.assertEqual(res.status_code, 403)
        # تیک مستقیم مجوز بخشی برای همه ۴۰۰
        res = self.as_user(self.admin).patch(f'/api/accounts/users/{self.target.pk}/', {
            'user_permissions': [self.perms['zz_invoice'].id]}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_post_migrate_strips_section_codes_from_roles(self):
        from accounts.module_permissions import strip_section_permissions_from_roles
        role = CustomRole.objects.create(name='r_legacy', title='نقش قدیمی')
        role.permissions.add(self.perms['zz_invoice'], self.perms['zz_sys'])
        self.assertEqual(strip_section_permissions_from_roles(verbosity=0), 1)
        self.assertEqual(list(role.permissions.values_list('codename', flat=True)), ['zz_sys'])


class PermissionEventTests(TestCase):
    def test_messages_never_global(self):
        msgs = pe.permission_event_messages([3, 1, 3], [7, None], 'bundle')
        groups = [g for g, _ in msgs]
        self.assertEqual(groups, ['user_1', 'user_3', 'company_7_notifications'])
        self.assertNotIn('global_notifications', groups)
        self.assertTrue(all(p['type'] == 'send_notification' and p['type_str'] == 'permissions_updated'
                            for _, p in msgs))
        self.assertIsNone(dict(msgs)['company_7_notifications']['user_id'])
        with self.assertRaises(ValueError):
            pe.permission_event_messages([1], [], 'bogus')

    def test_assignment_change_notifies_personal_channel(self):
        sent = []
        admin = CustomUser.objects.create_superuser('pe_admin', 'pe@x.com', 'pass1234')
        user = CustomUser.objects.create_user(username='pe_user', password='x')
        company = Company.objects.create(code='PE', name='شرکت رویداد')
        client = APIClient()
        client.force_authenticate(user=admin)
        with mock.patch.object(pe, '_send', side_effect=lambda m: sent.extend(m)), \
                self.captureOnCommitCallbacks(execute=True):
            res = client.post('/api/org/section-assignments/', {'user': user.pk, 'company': company.pk, 'role': 'employee'},
                              format='json')
        self.assertEqual(res.status_code, 201, res.data)
        perm_groups = [g for g, p in sent if p['type_str'] == 'permissions_updated']
        self.assertEqual(perm_groups, [f'user_{user.pk}'])
        self.assertEqual(sent[0][1]['reason'], 'assignment')
