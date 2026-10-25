"""
طرح ۲.۹-الف (تکهٔ A): تست‌های حمله برای دامنهٔ کار روی کاربران.
دو شرکت الف و ب؛ مدیر الف؛ کاربر مشترک الف و ب؛ همکار الف با مجوز بیشتر؛ کاربر محلی الف؛ کاربر بیرونی ب.
"""
import io
from unittest import mock

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from accounts import permission_events as pe
from accounts.excel_utils import USERS_COLUMNS
from accounts.models import CustomUser
from companies.models import Company, SectionAssignment, UserCompanyAccess

USERS = '/api/accounts/users/'
UCA = '/api/org/user-company-access/'


class UserScope29Base(TestCase):
    def setUp(self):
        self.sent = []
        patcher = mock.patch.object(pe, '_send', side_effect=lambda msgs: self.sent.extend(msgs))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.ct = ContentType.objects.get_for_model(CustomUser)

        self.a = Company.objects.create(code='S29-A', name='شرکت الف ۲۹')
        self.b = Company.objects.create(code='S29-B', name='شرکت ب ۲۹')
        self.admin = CustomUser.objects.create_superuser('s29_admin', 's29@x.com', 'pass1234')

        # مدیر الف: عضو الف، نویسندهٔ «دسترسی کاربران» الف، با مجوزهای کاربران (بی perm_usr_role)
        self.manager = self.make_user('s29_manager', 'view_sys_users', 'perm_usr_edit', 'perm_usr_add')
        UserCompanyAccess.objects.create(user=self.manager, company=self.a, section_levels={'user_access': 'write'})
        SectionAssignment.objects.create(user=self.manager, company=self.a, role='employee', is_active=True)

        self.local = self.make_user('s29_local')
        self.link(self.local, self.a)
        self.shared = self.make_user('s29_shared')
        self.link(self.shared, self.a)
        self.link(self.shared, self.b)
        # همکار الف با مجوزی که مدیر ندارد
        self.peer = self.make_user('s29_peer', 'view_sys_users', 'perm_usr_role')
        self.link(self.peer, self.a)
        self.outsider = self.make_user('s29_outsider')
        self.link(self.outsider, self.b)
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


class SharedUserControlTests(UserScope29Base):
    """S1: کاربر مشترک دو شرکت فقط به دست کسی که عضو همهٔ شرکت‌های اوست."""

    def test_manager_cannot_act_on_user_shared_with_other_company(self):
        c = self.as_user(self.manager)
        url = f'{USERS}{self.shared.id}/'
        self.assertEqual(c.patch(url, {'first_name': 'X'}, format='json').status_code, 403)
        self.assertEqual(c.patch(f'{url}toggle_status/', {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(c.post(f'{url}admin_reset_password/').status_code, 403)
        self.assertEqual(c.delete(f'{url}avatar/').status_code, 403)
        self.assertEqual(c.get(f'{url}delete_impact/').status_code, 403)
        self.assertEqual(c.delete(url).status_code, 403)
        self.shared.refresh_from_db()
        self.assertTrue(self.shared.is_active)
        self.assertTrue(self.shared.check_password('pass-1234-x'))

    def test_manager_still_controls_own_company_user(self):
        c = self.as_user(self.manager)
        r = c.patch(f'{USERS}{self.local.id}/', {'first_name': 'Y'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_superuser_controls_shared_user(self):
        r = self.as_user(self.admin).patch(f'{USERS}{self.shared.id}/', {'first_name': 'Z'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_link_invisible_user_is_superuser_only_and_leaks_nothing(self):
        r = self.as_user(self.manager).post(UCA, {'user': self.outsider.id, 'company': self.a.id, 'section_levels': {}}, format='json')
        self.assertIn(r.status_code, (400, 403))
        self.assertNotIn(self.outsider.username, r.content.decode('utf-8'))
        self.assertFalse(UserCompanyAccess.objects.filter(user=self.outsider, company=self.a).exists())
        r = self.as_user(self.admin).post(UCA, {'user': self.outsider.id, 'company': self.a.id, 'section_levels': {}}, format='json')
        self.assertEqual(r.status_code, 201, r.content)


class OutrankTests(UserScope29Base):
    """S2: رمز، غیرفعال‌سازی و حذف همکاری که مجوز بیشتری دارد ۴۰۳؛ رمز کاربر دیگر فقط با ریست."""

    def test_reset_deactivate_delete_peer_with_more_permissions_denied(self):
        c = self.as_user(self.manager)
        url = f'{USERS}{self.peer.id}/'
        self.assertEqual(c.post(f'{url}admin_reset_password/').status_code, 403)
        self.assertEqual(c.patch(f'{url}toggle_status/', {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(c.patch(url, {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(c.delete(url).status_code, 403)
        self.peer.refresh_from_db()
        self.assertTrue(self.peer.is_active)
        self.assertTrue(self.peer.check_password('pass-1234-x'))

    def test_patch_password_of_other_user_rejected_even_for_superuser(self):
        for actor in (self.manager, self.admin):
            r = self.as_user(actor).patch(f'{USERS}{self.local.id}/', {'password': 'Brand-new-99'}, format='json')
            self.assertEqual(r.status_code, 400, r.content)
        self.local.refresh_from_db()
        self.assertTrue(self.local.check_password('pass-1234-x'))

    def test_reset_returns_random_one_time_password_once(self):
        r = self.as_user(self.manager).post(f'{USERS}{self.local.id}/admin_reset_password/')
        self.assertEqual(r.status_code, 200, r.content)
        otp = r.data['one_time_password']
        self.assertGreaterEqual(len(otp), 10)
        self.local.refresh_from_db()
        self.assertFalse(self.local.check_password('123456'))
        self.assertTrue(self.local.check_password(otp))
        self.assertTrue(self.local.requires_password_change)
        r2 = self.as_user(self.admin).post(f'{USERS}{self.local.id}/admin_reset_password/')
        self.assertNotEqual(r2.data['one_time_password'], otp)


class SharedUserDefaultCompanyTests(UserScope29Base):
    """S7: شرکت پیش‌فرض کاربر مشترک بیرون از دامنهٔ نوشتن مدیر عوض نمی‌شود."""

    def test_default_company_outside_scope_denied(self):
        # مدیر عضو هر دو شرکت، ولی «دسترسی کاربران» را فقط در الف می‌نویسد
        both = self.make_user('s29_both', 'view_sys_users', 'perm_usr_edit')
        UserCompanyAccess.objects.create(user=both, company=self.a, section_levels={'user_access': 'write'})
        UserCompanyAccess.objects.create(user=both, company=self.b, section_levels={})
        SectionAssignment.objects.create(user=both, company=self.a, role='employee', is_active=True)
        SectionAssignment.objects.create(user=both, company=self.b, role='employee', is_active=True)
        UserCompanyAccess.objects.filter(user=self.shared, company=self.a).update(is_default=True)
        r = self.as_user(both).patch(f'{USERS}{self.shared.id}/', {'default_company_id': self.b.id}, format='json')
        self.assertEqual(r.status_code, 403, r.content)
        self.assertTrue(UserCompanyAccess.objects.get(user=self.shared, company=self.a).is_default)
        self.assertFalse(UserCompanyAccess.objects.get(user=self.shared, company=self.b).is_default)


class DeactivationAndExportTests(UserScope29Base):
    """S9 و S10 و S11."""

    def test_patch_deactivation_revokes_like_toggle(self):
        before = self.local.password_changed_at
        r = self.as_user(self.manager).patch(f'{USERS}{self.local.id}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.local.refresh_from_db()
        self.assertFalse(self.local.is_active)
        self.assertIsNotNone(self.local.password_changed_at)
        self.assertNotEqual(self.local.password_changed_at, before)

    def test_id_cards_export_needs_view_sys_users(self):
        editor = self.make_user('s29_editor', 'perm_usr_edit')
        self.link(editor, self.a)
        self.assertEqual(self.as_user(editor).get(f'{USERS}export_id_cards_excel/').status_code, 403)
        self.assertEqual(self.as_user(self.manager).get(f'{USERS}export_id_cards_excel/').status_code, 200)

    def test_supervisor_must_be_visible(self):
        r = self.as_user(self.manager).patch(f'{USERS}{self.local.id}/', {'supervisor': self.outsider.id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        r = self.as_user(self.manager).patch(f'{USERS}{self.local.id}/', {'supervisor': self.peer.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)


class OneTimePasswordAndCardTests(UserScope29Base):
    """S12 (رمز یک‌بارمصرف) و S4 (کد کارت امضاشده)."""

    def test_create_without_password_returns_one_time_password(self):
        r = self.as_user(self.admin).post(USERS, {
            'username': 's29_created', 'first_name': 'ن', 'last_name': 'و', 'phone_number': '09171112244',
            'company_ids': [self.a.id]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        otp = r.data['one_time_password']
        user = CustomUser.objects.get(username='s29_created')
        self.assertTrue(user.check_password(otp))
        self.assertFalse(user.check_password('123456'))
        self.assertTrue(user.requires_password_change)
        self.assertNotIn('one_time_password', self.as_user(self.admin).get(f'{USERS}{user.id}/').data)

    def test_verify_card_rejects_guessable_code_and_returns_minimal_data(self):
        anon = APIClient()
        url = f'{USERS}verify_card/'
        self.assertFalse(anon.get(url, {'code': f'EMP-{1000 + self.local.id}'}).data['valid'])
        code = self.as_user(self.manager).get(f'{USERS}{self.local.id}/').data['card_code']
        r = anon.get(url, {'code': code})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.data), {'valid', 'first_name', 'last_name', 'avatar'})
        self.assertTrue(r.data['valid'])
        self.assertTrue(anon.get(url, {'code': code.lower()}).data['valid'])
        forged = code[:-1] + ('0' if code[-1] != '0' else '1')
        self.assertEqual(anon.get(url, {'code': forged}).data, {'valid': False})
        other_id = code.replace(f'EMP-{self.local.id}-', f'EMP-{self.shared.id}-')
        self.assertEqual(anon.get(url, {'code': other_id}).data, {'valid': False})
        self.local.is_active = False
        self.local.save(update_fields=['is_active'])
        self.assertEqual(anon.get(url, {'code': code}).data, {'valid': False})
        from accounts.scope import card_code_for
        self.assertEqual(anon.get(url, {'code': card_code_for(self.admin)}).data, {'valid': False})


class ExcelImportTests(UserScope29Base):
    """S1، S9، S12 و S13 در مسیر اکسل."""

    def _xlsx(self, rows):
        wb = Workbook()
        ws = wb.active
        ws.append([c['label'] for c in USERS_COLUMNS])
        ws.append([c['key'] for c in USERS_COLUMNS])
        for row in rows:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = 'users.xlsx'
        return buf

    @staticmethod
    def _row(first, last, username, active='بله'):
        return [first, last, username, '', '', '', '', '', '', '', '', '', '', active]

    def _import(self, user, rows):
        return self.as_user(user).post(
            f'{USERS}import_excel/?company_id={self.a.id}',
            {'file': self._xlsx(rows), 'update_existing': 'true'}, format='multipart')

    def test_excel_update_shared_and_deactivate_peer_denied_new_user_gets_otp(self):
        r = self._import(self.manager, [
            self._row('X', 'Y', self.shared.username),
            self._row('P', 'Q', self.peer.username, active='خیر'),
            self._row('N', 'M', 's29_excel_new'),
        ])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['summary']['created'], 1)
        self.assertEqual(r.data['summary']['updated'], 0)
        self.shared.refresh_from_db()
        self.peer.refresh_from_db()
        self.assertNotEqual(self.shared.first_name, 'X')
        self.assertTrue(self.peer.is_active)
        [cred] = r.data['one_time_passwords']
        new = CustomUser.objects.get(username='s29_excel_new')
        self.assertEqual(cred['username'], new.username)
        self.assertTrue(new.check_password(cred['one_time_password']))
        self.assertFalse(new.check_password('123456'))

    def test_excel_create_needs_user_access_write(self):
        reader = self.make_user('s29_reader', 'view_sys_users', 'perm_usr_add')
        UserCompanyAccess.objects.create(user=reader, company=self.a, section_levels={'user_access': 'read'})
        SectionAssignment.objects.create(user=reader, company=self.a, role='employee', is_active=True)
        r = self._import(reader, [self._row('N', 'M', 's29_excel_nolink')])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['summary']['created'], 0)
        self.assertFalse(CustomUser.objects.filter(username='s29_excel_nolink').exists())


class UsersChangedEventTests(UserScope29Base):
    """تصمیم ۹: رویداد users_changed فقط روی کانال شرکت‌ها."""

    def test_pure_messages_for_user_reason(self):
        msgs = pe.permission_event_messages([5], [self.a.id, self.b.id], 'user')
        groups = [g for g, _ in msgs]
        self.assertEqual(groups, [f'company_{self.a.id}_notifications', f'company_{self.b.id}_notifications'])
        self.assertNotIn('global_notifications', groups)
        self.assertTrue(all(p['type_str'] == 'users_changed' and p['reason'] == 'user' for _, p in msgs))
        self.assertEqual(msgs[0][1]['user_id'], 5)

    def test_toggle_status_sends_event_to_affected_company_only(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.as_user(self.manager).patch(f'{USERS}{self.local.id}/toggle_status/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        events = [(g, p) for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertEqual([g for g, _ in events], [f'company_{self.a.id}_notifications'])


class ReviewFollowupTests(UserScope29Base):
    """پیگیری بازبینی ۲.۹-الف: مجوز بخشی در مقایسهٔ رتبه، فقط‌خواندن بودن view_sys_users، کد کارت خراب."""

    def test_section_permission_of_target_counts_as_higher_rank(self):
        from accounts import scope, scoped_permissions as sp
        names = {self.local.pk: {'accounts.perm_usr_edit', 'personnel.perm_payroll_write'},
                 self.manager.pk: {'accounts.perm_usr_edit'}}
        with mock.patch.object(sp, 'all_permission_names', side_effect=lambda u: names.get(u.pk, set())):
            self.assertEqual(scope.permissions_beyond_actor(self.manager, self.local), {'personnel.perm_payroll_write'})

    def test_view_only_user_cannot_write(self):
        viewer = self.make_user('s29_viewer', 'view_sys_users')
        UserCompanyAccess.objects.create(user=viewer, company=self.a, section_levels={'user_access': 'write'})
        c = self.as_user(viewer)
        url = f'{USERS}{self.local.id}/'
        self.assertEqual(c.post(f'{url}admin_reset_password/').status_code, 403)
        self.assertEqual(c.patch(f'{url}toggle_status/', {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(c.delete(url).status_code, 403)
        self.assertEqual(c.post(USERS, {'username': 's29_new_by_viewer'}, format='json').status_code, 403)
        self.local.refresh_from_db()
        self.assertTrue(self.local.is_active)

    def test_malformed_card_codes_never_raise(self):
        from accounts import scope
        for code in ('EMP-²-AAAAAAAAAAAAAAAA', 'EMP-' + '9' * 5000 + '-AAAAAAAAAAAAAAAA',
                     'EMP-١٢-AAAAAAAAAAAAAAAA', 'EMP--'):
            self.assertIsNone(scope.user_id_from_card_code(code))
        r = APIClient().get(f'{USERS}verify_card/', {'code': 'EMP-²-AAAAAAAAAAAAAAAA'})
        self.assertIn(r.status_code, (200, 404))


class HeavyCheckReviewTests(UserScope29Base):
    """Heavy checks of 2.9: reactivation and audit rollback follow the rank rule too."""

    def test_reactivating_peer_with_more_permissions_denied(self):
        CustomUser.objects.filter(pk__in=[self.peer.pk, self.local.pk]).update(is_active=False)
        c = self.as_user(self.manager)
        url = f'{USERS}{self.peer.id}/'
        self.assertEqual(c.patch(f'{url}toggle_status/', {'is_active': True}, format='json').status_code, 403)
        self.assertEqual(c.patch(url, {'is_active': True}, format='json').status_code, 403)
        self.peer.refresh_from_db()
        self.assertFalse(self.peer.is_active)
        r = c.patch(f'{USERS}{self.local.id}/toggle_status/', {'is_active': True}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_rollback_of_user_records_follows_rank_rule(self):
        from types import SimpleNamespace
        from accounts.rollback_service import _rollback_scope_error, execute_point_in_time_rollback
        from django.utils import timezone
        manager = CustomUser.objects.get(pk=self.manager.pk)
        user_log = SimpleNamespace(target_model='CustomUser')
        self.assertIsNotNone(_rollback_scope_error(manager, user_log, self.peer))
        self.assertIsNotNone(_rollback_scope_error(manager, user_log, self.admin))
        self.assertIsNotNone(_rollback_scope_error(manager, user_log, None))
        self.assertIsNotNone(_rollback_scope_error(manager, SimpleNamespace(target_model='CustomRole'), None))
        self.assertIsNone(_rollback_scope_error(manager, user_log, self.local))
        self.assertIsNone(_rollback_scope_error(self.admin, user_log, None))
        self.assertIsNone(_rollback_scope_error(manager, SimpleNamespace(target_model='Warehouse'), None))
        res = execute_point_in_time_rollback(timezone.now(), manager)
        self.assertFalse(res['success'])
