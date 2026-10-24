"""
طرح ۲.۹-الف (تکهٔ ب): تست‌های حمله برای نشست‌های دستگاه (S5)، قفل‌های ورود (S6) و نقش‌ها (S8).
دو شرکت الف و ب، مدیر شرکت الف، کاربران شرکت ب و مدیر کل سامانه.
"""
from unittest import mock

from axes.models import AccessAttempt
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from accounts import permission_events as pe
from accounts.models import CustomRole, CustomUser, UserDeviceSession
from companies.models import Company, SectionAssignment, UserCompanyAccess

FLEET_URL = '/api/accounts/telemetry/fleet/'
LOCKED_URL = '/api/auth/login-logs/locked_users/'
LOCKED_STATUS_URL = '/api/auth/login-logs/locked_status/'
RESET_URL = '/api/auth/login-logs/reset_lockout/'
ROLES_URL = '/api/accounts/roles/'


class AdminScopeBase(TestCase):
    def setUp(self):
        send_patcher = mock.patch.object(pe, '_send', side_effect=lambda msgs: None)
        send_patcher.start()
        self.addCleanup(send_patcher.stop)
        self.ct = ContentType.objects.get_for_model(CustomUser)
        self.a = Company.objects.create(code='S29-A', name='شرکت الف')
        self.b = Company.objects.create(code='S29-B', name='شرکت ب')
        self.admin = CustomUser.objects.create_superuser('s29_admin', 's29@x.com', 'pass1234')
        self.manager = self.member('s29_manager', self.a, 'perm_sys_logs', 'perm_usr_edit',
                                   'perm_usr_role', 'view_sys_users')
        self.user_a = self.member('s29_user_a', self.a)
        self.user_b = self.member('s29_user_b', self.b)
        self.plain_a = self.member('s29_plain_a', self.a)
        self.client = APIClient()

    def member(self, username, company, *codes):
        user = CustomUser.objects.create_user(username=username, password='pass-1234-x')
        for code in codes:
            perm, _ = Permission.objects.get_or_create(codename=code, content_type=self.ct, defaults={'name': code})
            user.user_permissions.add(perm)
        UserCompanyAccess.objects.get_or_create(user=user, company=company)
        SectionAssignment.objects.create(user=user, company=company, role='employee')
        return user

    def as_user(self, user):
        self.client.force_authenticate(user=CustomUser.objects.get(pk=user.pk))
        return self.client


class FleetSessionsScopeTests(AdminScopeBase):
    def setUp(self):
        super().setUp()
        for user, tab in ((self.user_a, 'tab-a'), (self.user_b, 'tab-b'), (self.admin, 'tab-admin')):
            UserDeviceSession.objects.create(user=user, session_key=f'{user.pk}_{tab}', tab_id=tab,
                                             ip_address='10.0.0.9')

    def test_user_without_logs_permission_is_denied(self):
        res = self.as_user(self.plain_a).get(FLEET_URL)
        self.assertEqual(res.status_code, 403)

    def test_manager_sees_only_sessions_of_own_scope(self):
        res = self.as_user(self.manager).get(FLEET_URL)
        self.assertEqual(res.status_code, 200)
        users = {row['user_id'] for row in res.json()['fleet']}
        self.assertIn(self.user_a.pk, users)
        self.assertNotIn(self.user_b.pk, users)
        self.assertNotIn(self.admin.pk, users)

    def test_superuser_sees_all_sessions(self):
        res = self.as_user(self.admin).get(FLEET_URL)
        users = {row['user_id'] for row in res.json()['fleet']}
        self.assertTrue({self.user_a.pk, self.user_b.pk, self.admin.pk} <= users)

    def revoke_url(self, user):
        return f'/api/accounts/telemetry/sessions/{UserDeviceSession.objects.get(user=user).pk}/revoke/'

    def test_staff_without_logs_permission_cannot_revoke(self):
        CustomUser.objects.filter(pk=self.plain_a.pk).update(is_staff=True)
        res = self.as_user(self.plain_a).post(self.revoke_url(self.user_a))
        self.assertEqual(res.status_code, 403)
        self.assertFalse(UserDeviceSession.objects.get(user=self.user_a).is_revoked)

    def test_manager_cannot_revoke_other_company_session(self):
        res = self.as_user(self.manager).post(self.revoke_url(self.user_b))
        self.assertEqual(res.status_code, 404)
        self.assertFalse(UserDeviceSession.objects.get(user=self.user_b).is_revoked)

    def test_manager_revokes_own_scope_session_without_global_broadcast(self):
        from accounts.views_domains import session_views
        with mock.patch.object(session_views, '_send_fleet_event') as send:
            res = self.as_user(self.manager).post(self.revoke_url(self.user_a))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(UserDeviceSession.objects.get(user=self.user_a).is_revoked)
        groups = send.call_args[0][0]
        self.assertEqual(set(groups), {f'user_{self.user_a.pk}', 'superuser_notifications'})

    def test_heartbeat_broadcasts_only_new_sessions_and_never_globally(self):
        from accounts.views_domains import session_views
        with mock.patch.object(session_views, '_send_fleet_event') as send:
            res = self.as_user(self.user_b).post('/api/accounts/telemetry/heartbeat/', {'tab_id': 'tab-b'}, format='json')
            self.assertEqual(res.status_code, 200)
            send.assert_not_called()  # ضربان نشست موجود رویداد نمی‌فرستد
            res = self.as_user(self.user_b).post('/api/accounts/telemetry/heartbeat/', {'tab_id': 'tab-new'}, format='json')
        self.assertEqual(res.status_code, 200)
        groups = send.call_args[0][0]
        self.assertNotIn('global_notifications', groups)
        self.assertIn(f'company_{self.b.pk}_notifications', groups)
        self.assertNotIn(f'company_{self.a.pk}_notifications', groups)


class LockoutScopeTests(AdminScopeBase):
    def setUp(self):
        super().setUp()
        for user, ip in ((self.user_a, '10.1.1.1'), (self.user_b, '10.2.2.2'), (self.admin, '10.3.3.3')):
            AccessAttempt.objects.create(username=user.username, ip_address=ip, user_agent='UA-' + user.username,
                                         failures_since_start=9)

    def test_manager_lists_only_own_scope_without_ip(self):
        for url in (LOCKED_URL, LOCKED_STATUS_URL):
            res = self.as_user(self.manager).get(url)
            self.assertEqual(res.status_code, 200)
            rows = res.json()['locked_users']
            self.assertEqual({r['username'] for r in rows}, {self.user_a.username})
            self.assertTrue(all(not r['ip_address'] and not r['user_agent'] for r in rows))
            self.assertEqual(res.json()['total_locked'], 1)

    def test_superuser_lists_all_with_ip(self):
        rows = self.as_user(self.admin).get(LOCKED_URL).json()['locked_users']
        self.assertEqual({r['username'] for r in rows},
                         {self.user_a.username, self.user_b.username, self.admin.username})
        self.assertTrue(all(r['ip_address'] for r in rows))

    def test_manager_cannot_unlock_other_company_user(self):
        res = self.as_user(self.manager).post(RESET_URL, {'username': self.user_b.username}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AccessAttempt.objects.filter(username=self.user_b.username).exists())

    def test_manager_cannot_unlock_superuser(self):
        res = self.as_user(self.manager).post(RESET_URL, {'username': self.admin.username}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AccessAttempt.objects.filter(username=self.admin.username).exists())

    def test_manager_cannot_reset_by_ip(self):
        res = self.as_user(self.manager).post(RESET_URL, {'ip_address': '10.2.2.2'}, format='json')
        self.assertEqual(res.status_code, 403)
        res = self.as_user(self.manager).post(
            RESET_URL, {'username': self.user_a.username, 'ip_address': '10.2.2.2'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(AccessAttempt.objects.count(), 3)

    def test_manager_unlocks_own_scope_user(self):
        res = self.as_user(self.manager).post(RESET_URL, {'username': self.user_a.username}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(AccessAttempt.objects.filter(username=self.user_a.username).exists())
        self.assertTrue(AccessAttempt.objects.filter(username=self.user_b.username).exists())

    def test_superuser_resets_by_ip(self):
        res = self.as_user(self.admin).post(RESET_URL, {'ip_address': '10.2.2.2'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(AccessAttempt.objects.filter(ip_address='10.2.2.2').exists())


class RoleScopeTests(AdminScopeBase):
    def setUp(self):
        super().setUp()
        self.shared = CustomRole.objects.create(name='s29_shared', title='نقش مشترک', color='#111111')
        self.shared.user_set.add(self.user_a, self.user_b)
        self.local = CustomRole.objects.create(name='s29_local', title='نقش الف', color='#222222')
        self.local.user_set.add(self.user_a)

    def row(self, res, role):
        data = res.json()
        rows = data['results'] if isinstance(data, dict) and 'results' in data else data
        return next(r for r in rows if r['id'] == role.pk)

    def test_list_hides_members_outside_scope(self):
        res = self.as_user(self.manager).get(ROLES_URL)
        self.assertEqual(res.status_code, 200)
        row = self.row(res, self.shared)
        self.assertEqual(row['user_ids'], [self.user_a.pk])
        self.assertEqual(row['users_count'], 1)
        detail = self.as_user(self.manager).get(f'{ROLES_URL}{self.shared.pk}/').json()
        self.assertEqual(detail['user_ids'], [self.user_a.pk])

    def test_superuser_sees_all_members(self):
        row = self.row(self.as_user(self.admin).get(ROLES_URL), self.shared)
        self.assertEqual(set(row['user_ids']), {self.user_a.pk, self.user_b.pk})
        self.assertEqual(row['users_count'], 2)

    def test_manager_cannot_rename_shared_role(self):
        for payload in ({'title': 'دزدیده'}, {'name': 's29_hijack'}, {'color': '#ff0000'}):
            res = self.as_user(self.manager).patch(f'{ROLES_URL}{self.shared.pk}/', payload, format='json')
            self.assertEqual(res.status_code, 403, payload)
        self.shared.refresh_from_db()
        self.assertEqual((self.shared.name, self.shared.title, self.shared.color),
                         ('s29_shared', 'نقش مشترک', '#111111'))

    def test_manager_can_rename_role_with_only_own_members(self):
        res = self.as_user(self.manager).patch(f'{ROLES_URL}{self.local.pk}/', {'title': 'نقش تازه'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.local.refresh_from_db()
        self.assertEqual(self.local.title, 'نقش تازه')

    def test_membership_edit_keeps_hidden_members(self):
        # فرانت فقط اعضای دامنه را می‌بیند و می‌فرستد؛ عضو شرکت ب نباید حذف شود یا در پاسخ بیاید
        res = self.as_user(self.manager).patch(
            f'{ROLES_URL}{self.shared.pk}/', {'user_ids': [self.user_a.pk, self.plain_a.pk]}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(set(self.shared.user_set.values_list('pk', flat=True)),
                         {self.user_a.pk, self.plain_a.pk, self.user_b.pk})
        self.assertEqual(set(res.json()['user_ids']), {self.user_a.pk, self.plain_a.pk})

    def test_manager_cannot_add_out_of_scope_user(self):
        res = self.as_user(self.manager).patch(
            f'{ROLES_URL}{self.local.pk}/', {'user_ids': [self.user_a.pk, self.user_b.pk]}, format='json')
        self.assertIn(res.status_code, (400, 403))
        self.assertFalse(self.local.user_set.filter(pk=self.user_b.pk).exists())

    def test_manager_cannot_delete_or_probe_shared_role(self):
        client = self.as_user(self.manager)
        self.assertEqual(client.get(f'{ROLES_URL}{self.shared.pk}/delete_impact/').status_code, 403)
        self.assertEqual(client.delete(f'{ROLES_URL}{self.shared.pk}/').status_code, 403)
        self.assertTrue(CustomRole.objects.filter(pk=self.shared.pk).exists())

    def test_superuser_can_rename_shared_role(self):
        res = self.as_user(self.admin).patch(f'{ROLES_URL}{self.shared.pk}/', {'title': 'عنوان نو'}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_list_has_no_n_plus_one(self):
        for i in range(5):
            CustomRole.objects.create(name=f's29_extra_{i}').user_set.add(self.user_a, self.user_b)
        client = self.as_user(self.manager)
        client.get(ROLES_URL)
        with self.assertNumQueriesLessThan(25):
            client.get(ROLES_URL)

    def assertNumQueriesLessThan(self, limit):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        test = self

        class _Ctx(CaptureQueriesContext):
            def __exit__(self, *exc):
                super().__exit__(*exc)
                test.assertLess(len(self.captured_queries), limit)
        return _Ctx(connection)

    def test_excel_import_cannot_rename_shared_role(self):
        from accounts import roles_excel_utils
        rows = [{'_row_num': 2, 'is_update': True, 'role_id': self.shared.pk, 'name': 's29_shared',
                 'title': 'دزدیده', 'color': '#ff0000', 'permissions': []},
                {'_row_num': 3, 'is_update': True, 'role_id': self.local.pk, 'name': 's29_local',
                 'title': 'الف تازه', 'color': '#222222', 'permissions': []}]
        fake = {'valid_rows': rows, 'errors': []}
        from django.core.files.uploadedfile import SimpleUploadedFile
        upload = SimpleUploadedFile('roles.xlsx', b'x')
        with mock.patch.object(roles_excel_utils, 'parse_roles_excel', return_value=fake):
            res = self.as_user(self.manager).post(f'{ROLES_URL}import_excel/', {'file': upload}, format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['summary']['updated'], 1)
        self.assertTrue(any(e['row'] == 2 for e in res.json()['errors']))
        self.shared.refresh_from_db()
        self.local.refresh_from_db()
        self.assertEqual((self.shared.title, self.shared.color), ('نقش مشترک', '#111111'))
        self.assertEqual(self.local.title, 'الف تازه')
