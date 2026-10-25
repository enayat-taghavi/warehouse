"""
طرح ۲.۹-د (تکهٔ اول): سناریوهای سرور برای مدیریت کاربران.
مدیر شرکت، مدیر پروژه، کاربر مشترک، سوپریوزر، نقش مشترک و کانال‌های رویداد users_changed.
"""
import io
import re
import shutil
import tempfile
from unittest import mock

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from accounts import permission_events as pe
from accounts.models import CustomRole, CustomUser
from accounts.scope import MSG_NOT_CONTROLLED
from companies.models import Company, Project, SectionAssignment, UserCompanyAccess

USERS = '/api/accounts/users/'
ROLES_URL = '/api/accounts/roles/'

TEMP_MEDIA_ROOT = tempfile.mkdtemp()


def make_small_png():
    buf = io.BytesIO()
    img = Image.new('RGB', (10, 10), color='blue')
    img.save(buf, format='PNG')
    buf.seek(0)
    return SimpleUploadedFile('a.png', buf.read(), content_type='image/png')


class UserScenarios29Base(TestCase):
    """پایهٔ تست‌های سناریویی ۲.۹ با فیکسچرهای شرکت، مدیر شرکت، مدیر پروژه و کاربران محلی/مشترک."""

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

        # مدیر پروژه: کاربر s29_pm با انتساب فعال در پروژه، بدون انتساب در سطح شرکت
        self.project = Project.objects.create(company=self.a, code='S29-P', name='پروژهٔ ۲۹')
        self.pm = self.make_user('s29_pm', 'view_sys_users', 'perm_usr_edit', 'perm_usr_add')
        UserCompanyAccess.objects.create(user=self.pm, company=self.a, section_levels={'user_access': 'write'})
        SectionAssignment.objects.create(user=self.pm, project=self.project, role='manager', is_active=True)

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

    def make_small_png(self):
        return make_small_png()


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class UserScenarios29Tests(UserScenarios29Base):
    """تست‌های سناریویی بخش ۲.۹-د."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def test_company_manager_full_cycle_on_local_user(self):
        """الف: چرخهٔ کامل عملیات مدیر شرکت روی کاربر محلی و رویدادهای users_changed."""
        c = self.as_user(self.manager)

        # ساخت کاربر با شرکت الف
        self.sent.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r_create = c.post(USERS, {
                'username': 's29_cycle_user',
                'first_name': 'نام‌اول',
                'last_name': 'فامیل',
                'phone_number': '09121112233',
                'company_ids': [self.a.id],
            }, format='json')
        self.assertEqual(r_create.status_code, 201, r_create.content)
        otp = r_create.data.get('one_time_password')
        self.assertTrue(otp)
        created_user = CustomUser.objects.get(username='s29_cycle_user')
        self.assertTrue(created_user.check_password(otp))
        self.assertTrue(created_user.requires_password_change)
        events = [g for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertTrue(events)
        self.assertEqual(set(events), {f'company_{self.a.id}_notifications'})
        self.assertNotIn('global_notifications', events)
        self.assertNotIn(f'company_{self.b.id}_notifications', events)

        # ویرایش نام کوچک
        user_url = f'{USERS}{created_user.id}/'
        self.sent.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r_edit = c.patch(user_url, {'first_name': 'نام‌ویرایش'}, format='json')
        self.assertEqual(r_edit.status_code, 200, r_edit.content)
        created_user.refresh_from_db()
        self.assertEqual(created_user.first_name, 'نام‌ویرایش')
        events = [g for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertTrue(events)
        self.assertEqual(set(events), {f'company_{self.a.id}_notifications'})
        self.assertNotIn('global_notifications', events)
        self.assertNotIn(f'company_{self.b.id}_notifications', events)

        # غیرفعال‌سازی و فعال‌سازی مجدد
        self.sent.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r_toggle_off = c.patch(f'{user_url}toggle_status/', {'is_active': False}, format='json')
        self.assertEqual(r_toggle_off.status_code, 200, r_toggle_off.content)
        created_user.refresh_from_db()
        self.assertFalse(created_user.is_active)
        events = [g for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertTrue(events)
        self.assertEqual(set(events), {f'company_{self.a.id}_notifications'})
        self.assertNotIn('global_notifications', events)
        self.assertNotIn(f'company_{self.b.id}_notifications', events)

        self.sent.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r_toggle_on = c.patch(f'{user_url}toggle_status/', {'is_active': True}, format='json')
        self.assertEqual(r_toggle_on.status_code, 200, r_toggle_on.content)
        created_user.refresh_from_db()
        self.assertTrue(created_user.is_active)
        events = [g for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertTrue(events)
        self.assertEqual(set(events), {f'company_{self.a.id}_notifications'})
        self.assertNotIn('global_notifications', events)
        self.assertNotIn(f'company_{self.b.id}_notifications', events)

        # بازنشانی رمز عبور
        r_reset = c.post(f'{user_url}admin_reset_password/')
        self.assertEqual(r_reset.status_code, 200, r_reset.content)
        new_otp = r_reset.data.get('one_time_password')
        self.assertTrue(new_otp)
        created_user.refresh_from_db()
        self.assertTrue(created_user.check_password(new_otp))
        self.assertTrue(created_user.requires_password_change)

        # بارگذاری آواتار و حذف آن
        r_avatar_up = c.post(f'{user_url}avatar/', {'avatar': self.make_small_png()}, format='multipart')
        self.assertEqual(r_avatar_up.status_code, 200, r_avatar_up.content)
        self.assertTrue(r_avatar_up.data.get('avatar'))
        created_user.refresh_from_db()
        self.assertTrue(bool(created_user.avatar))

        r_avatar_del = c.delete(f'{user_url}avatar/')
        self.assertEqual(r_avatar_del.status_code, 200, r_avatar_del.content)
        self.assertIsNone(r_avatar_del.data.get('avatar'))
        created_user.refresh_from_db()
        self.assertFalse(bool(created_user.avatar))

        # حذف کاربر
        self.sent.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r_delete = c.delete(user_url)
        self.assertEqual(r_delete.status_code, 204, r_delete.content)
        self.assertFalse(CustomUser.objects.filter(pk=created_user.pk).exists())
        events = [g for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertTrue(events)
        self.assertEqual(set(events), {f'company_{self.a.id}_notifications'})
        self.assertNotIn('global_notifications', events)
        self.assertNotIn(f'company_{self.b.id}_notifications', events)

    def test_project_manager_can_manage_local_user(self):
        """ب: مدیر پروژه می‌تواند کاربر محلی شرکت را مدیریت کند."""
        c = self.as_user(self.pm)
        url = f'{USERS}{self.local.id}/'

        # ویرایش
        r_edit = c.patch(url, {'first_name': 'نام‌محلی‌پروژه'}, format='json')
        self.assertEqual(r_edit.status_code, 200, r_edit.content)
        self.local.refresh_from_db()
        self.assertEqual(self.local.first_name, 'نام‌محلی‌پروژه')

        # غیرفعال و فعال‌سازی
        r_toggle_off = c.patch(f'{url}toggle_status/', {'is_active': False}, format='json')
        self.assertEqual(r_toggle_off.status_code, 200, r_toggle_off.content)
        self.local.refresh_from_db()
        self.assertFalse(self.local.is_active)

        r_toggle_on = c.patch(f'{url}toggle_status/', {'is_active': True}, format='json')
        self.assertEqual(r_toggle_on.status_code, 200, r_toggle_on.content)
        self.local.refresh_from_db()
        self.assertTrue(self.local.is_active)

        # بازنشانی رمز
        r_reset = c.post(f'{url}admin_reset_password/')
        self.assertEqual(r_reset.status_code, 200, r_reset.content)
        otp = r_reset.data.get('one_time_password')
        self.assertTrue(otp)
        self.local.refresh_from_db()
        self.assertTrue(self.local.check_password(otp))

        # حذف
        r_del = c.delete(url)
        self.assertEqual(r_del.status_code, 204, r_del.content)
        self.assertFalse(CustomUser.objects.filter(pk=self.local.pk).exists())

    def test_company_manager_cannot_touch_shared_user(self):
        """ج: مدیر شرکت دسترسی به جزئیات کاربر مشترک دارد اما حق ویرایش/حذف/ریست ندارد."""
        c = self.as_user(self.manager)
        url = f'{USERS}{self.shared.id}/'
        initial_name = self.shared.first_name

        # مشاهدهٔ جزئیات مجاز است
        r_get = c.get(url)
        self.assertEqual(r_get.status_code, 200, r_get.content)

        # عملیات تغییر ناپذیرند و ۴۰۳ می‌دهند
        r_edit = c.patch(url, {'first_name': 'دستکاری'}, format='json')
        self.assertEqual(r_edit.status_code, 403, r_edit.content)
        self.assertEqual(r_edit.data.get('detail'), MSG_NOT_CONTROLLED)

        r_toggle = c.patch(f'{url}toggle_status/', {'is_active': False}, format='json')
        self.assertEqual(r_toggle.status_code, 403, r_toggle.content)

        r_reset = c.post(f'{url}admin_reset_password/')
        self.assertEqual(r_reset.status_code, 403, r_reset.content)

        r_avatar = c.post(f'{url}avatar/', {'avatar': self.make_small_png()}, format='multipart')
        self.assertEqual(r_avatar.status_code, 403, r_avatar.content)

        r_avatar_del = c.delete(f'{url}avatar/')
        self.assertEqual(r_avatar_del.status_code, 403, r_avatar_del.content)

        r_del = c.delete(url)
        self.assertEqual(r_del.status_code, 403, r_del.content)

        self.shared.refresh_from_db()
        self.assertTrue(CustomUser.objects.filter(pk=self.shared.pk).exists())
        self.assertTrue(self.shared.is_active)
        self.assertTrue(self.shared.check_password('pass-1234-x'))
        self.assertEqual(self.shared.first_name, initial_name)

    def test_project_manager_cannot_touch_shared_user(self):
        """د: مدیر پروژه همانند مدیر شرکت نمی‌تواند روی کاربر مشترک عملیات تغییری انجام دهد."""
        c = self.as_user(self.pm)
        url = f'{USERS}{self.shared.id}/'
        initial_name = self.shared.first_name

        self.assertEqual(c.patch(url, {'first_name': 'دستکاری_pm'}, format='json').status_code, 403)
        self.assertEqual(c.patch(f'{url}toggle_status/', {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(c.post(f'{url}admin_reset_password/').status_code, 403)
        self.assertEqual(c.post(f'{url}avatar/', {'avatar': self.make_small_png()}, format='multipart').status_code, 403)
        self.assertEqual(c.delete(f'{url}avatar/').status_code, 403)
        self.assertEqual(c.delete(url).status_code, 403)

        self.shared.refresh_from_db()
        self.assertTrue(CustomUser.objects.filter(pk=self.shared.pk).exists())
        self.assertTrue(self.shared.is_active)
        self.assertTrue(self.shared.check_password('pass-1234-x'))
        self.assertEqual(self.shared.first_name, initial_name)

    def test_superuser_manages_shared_user_and_event_reaches_both_companies(self):
        """ه: مدیر ارشد کاربر مشترک را مدیریت می‌کند و رویداد users_changed به هر دو شرکت می‌رسد."""
        c = self.as_user(self.admin)
        url = f'{USERS}{self.shared.id}/'

        self.sent.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r_toggle = c.patch(f'{url}toggle_status/', {'is_active': False}, format='json')
        self.assertEqual(r_toggle.status_code, 200, r_toggle.content)
        self.shared.refresh_from_db()
        self.assertFalse(self.shared.is_active)

        events = [g for g, p in self.sent if p.get('type_str') == 'users_changed']
        self.assertIn(f'company_{self.a.id}_notifications', events)
        self.assertIn(f'company_{self.b.id}_notifications', events)
        self.assertNotIn('global_notifications', events)

        r_reset = c.post(f'{url}admin_reset_password/')
        self.assertEqual(r_reset.status_code, 200, r_reset.content)
        otp = r_reset.data.get('one_time_password')
        self.assertTrue(otp)
        self.shared.refresh_from_db()
        self.assertTrue(self.shared.check_password(otp))

    def test_outsider_is_invisible_to_company_manager(self):
        """و: کاربر شرکت دیگر برای مدیر پنهان است (404 در جزئیات، 403/404 در ویرایش)."""
        c = self.as_user(self.manager)
        url = f'{USERS}{self.outsider.id}/'
        initial_name = self.outsider.first_name

        r_get = c.get(url)
        self.assertEqual(r_get.status_code, 404, r_get.content)

        r_patch = c.patch(url, {'first_name': 'نفوذ'}, format='json')
        self.assertIn(r_patch.status_code, (403, 404), r_patch.content)

        self.outsider.refresh_from_db()
        self.assertEqual(self.outsider.first_name, initial_name)

    def test_shared_role_rename_is_403_with_persian_detail(self):
        """ز: تغییر نام نقش مشترک ۴۰۳ با متن فارسی است، ولی نقش فقط‌محلی قابل تغییر است."""
        role_mgr = self.make_user('s29_role_mgr', 'view_sys_users', 'perm_usr_edit', 'perm_usr_role')
        UserCompanyAccess.objects.create(user=role_mgr, company=self.a, section_levels={'user_access': 'write'})
        SectionAssignment.objects.create(user=role_mgr, company=self.a, role='employee', is_active=True)

        shared_role = CustomRole.objects.create(name='s29_shared_role', title='نقش مشترک اولیه', color='#112233')
        shared_role.user_set.add(self.local, self.outsider)

        c = self.as_user(role_mgr)
        r_patch_shared = c.patch(f'{ROLES_URL}{shared_role.id}/', {'title': 'عنوان ربوده'}, format='json')
        self.assertEqual(r_patch_shared.status_code, 403, r_patch_shared.content)
        detail = str(r_patch_shared.data.get('detail') or '')
        self.assertTrue(bool(re.search(r'[\u0600-\u06FF]', detail)), f'پیام باید شامل حروف فارسی باشد: {detail}')
        shared_role.refresh_from_db()
        self.assertEqual(shared_role.title, 'نقش مشترک اولیه')

        local_role = CustomRole.objects.create(name='s29_local_role', title='نقش محلی اولیه', color='#445566')
        local_role.user_set.add(self.local)

        r_patch_local = c.patch(f'{ROLES_URL}{local_role.id}/', {'title': 'نقش محلی نو'}, format='json')
        self.assertEqual(r_patch_local.status_code, 200, r_patch_local.content)
        local_role.refresh_from_db()
        self.assertEqual(local_role.title, 'نقش محلی نو')

    def test_create_with_other_company_is_refused(self):
        """ح: تلاش برای انتساب شرکت دیگر در زمان ساخت کاربر رد می‌شود (۴۰۰ یا ۴۰۳)."""
        c = self.as_user(self.manager)
        r_create = c.post(USERS, {
            'username': 's29_cross_company_user',
            'first_name': 'کاربر',
            'last_name': 'چندشرکتی',
            'company_ids': [self.a.id, self.b.id],
        }, format='json')
        self.assertIn(r_create.status_code, (400, 403), r_create.content)
        self.assertFalse(CustomUser.objects.filter(username='s29_cross_company_user').exists())
