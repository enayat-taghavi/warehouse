"""
آزمون‌های هستهٔ «دسترسی به چت و حوزهٔ مخاطبان» (طرح Communication_System_Hardening/chat_access_contact_scope،
بخش ۴، سناریوهای ۱، ۲، ۷، ۸، ۹ و ۱۰). کلاس ChatAccessTestBase و کمک‌کننده‌هایش برای
test_chat_access_matrix.py (سناریوهای دیگر) هم ساخته شده‌اند.
"""
import json
from unittest import mock

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import AuditLog
from communications.broadcast import broadcast_message_ws
from communications.contact_scope import BLOCKED_MESSAGE, visible_contact_ids
from communications.membership import add_members
from communications.models import (
    ChatCompanyPolicy, ChatUserPolicy, Conversation, ConversationParticipant, ConversationType, Message,
    ParticipantRole,
)
from notifications.models import Notification

User = get_user_model()

CONV_URL = '/api/communications/conversations/'
CONTACTS_URL = '/api/communications/contacts/'
CAPABILITIES_URL = '/api/communications/capabilities/'
USER_POLICY_URL = '/api/communications/policies/users/{}/'
COMPANY_POLICY_URL = '/api/communications/policies/companies/{}/'


def _items(data):
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class ChatAccessTestBase(TestCase):
    """
    پایهٔ آزمون‌های حوزهٔ مخاطبان؛ هیچ دادهٔ پیش‌ساخته‌ای جز self.superuser ندارد.
    کمک‌کننده‌ها: make_user، make_company، make_project، make_section، assign_company، assign_project،
    assign_section، link_company، set_user_policy، set_company_scope، grant_perm، auth، contact_ids،
    post_direct، post_group، post_add_members، make_direct، make_group، put_user_policy، put_company_policy.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self._seq = 0
        self.superuser = User.objects.create_superuser(
            username='ca_root', email='ca_root@test.com', password='Password123!'
        )

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()
        super().tearDown()

    # ─── ساخت داده ───
    def _next(self):
        self._seq += 1
        return self._seq

    def make_user(self, username=None, superuser=False, **extra):
        username = username or f'ca_user_{self._next()}'
        if superuser:
            return User.objects.create_superuser(username=username, email=f'{username}@test.com',
                                                  password='Password123!')
        return User.objects.create_user(username=username, password='Password123!', **extra)

    def make_company(self, code=None, active=True):
        from companies.models import Company
        code = code or f'CA-CO-{self._next()}'
        return Company.objects.create(code=code, name=f'شرکت {code}', is_active=active)

    def make_project(self, company, code=None):
        from companies.models import Project
        code = code or f'P{self._next()}'
        return Project.objects.create(company=company, code=code, name=f'پروژه {code}')

    def make_section(self, project, code=None):
        from companies.models import ProjectSection
        code = code or f'S{self._next()}'
        return ProjectSection.objects.create(project=project, code=code, name=f'بخش {code}')

    def assign_company(self, user, company, active=True, role='employee'):
        from companies.models import SectionAssignment
        return SectionAssignment.objects.create(user=user, company=company, role=role, is_active=active)

    def assign_project(self, user, project, active=True, role='employee'):
        from companies.models import SectionAssignment
        return SectionAssignment.objects.create(user=user, project=project, role=role, is_active=active)

    def assign_section(self, user, section, active=True, role='employee'):
        from companies.models import SectionAssignment
        return SectionAssignment.objects.create(user=user, section=section, role=role, is_active=active)

    def link_company(self, user, company):
        from companies.models import UserCompanyAccess
        return UserCompanyAccess.objects.create(user=user, company=company)

    def set_user_policy(self, user, chat_allowed=True, contact_scope=''):
        ChatUserPolicy.objects.update_or_create(
            user=user, defaults={'chat_allowed': chat_allowed, 'contact_scope': contact_scope}
        )

    def set_company_scope(self, company, scope):
        ChatCompanyPolicy.objects.update_or_create(company=company, defaults={'contact_scope': scope})

    def grant_perm(self, user, codename, app_label='accounts'):
        perm = Permission.objects.get(codename=codename, content_type__app_label=app_label)
        user.user_permissions.add(perm)
        # کش مجوزهای Django روی همان شیء کاربر
        for attr in ('_perm_cache', '_user_perm_cache', '_group_perm_cache'):
            if hasattr(user, attr):
                delattr(user, attr)
        return User.objects.get(pk=user.pk)

    # ─── درخواست‌ها ───
    def auth(self, user):
        self.client.force_authenticate(user=user)

    def contact_ids(self, user):
        self.auth(user)
        resp = self.client.get(CONTACTS_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        return {u['id'] for u in _items(resp.data)}

    def post_direct(self, actor, target):
        self.auth(actor)
        return self.client.post(CONV_URL, {'conv_type': 'direct', 'target_user_id': target.id}, format='json')

    def post_group(self, actor, members, title='گروه آزمون'):
        self.auth(actor)
        return self.client.post(CONV_URL, {
            'conv_type': 'group', 'title': title, 'member_ids': [m.id for m in members]
        }, format='json')

    def post_add_members(self, actor, conv, users):
        self.auth(actor)
        return self.client.post(f'{CONV_URL}{conv.id}/members/', {'user_ids': [u.id for u in users]}, format='json')

    def make_direct(self, a, b):
        conv = Conversation.objects.create(conv_type=ConversationType.DIRECT, created_by=a)
        add_members(conv, [a, b])
        return conv

    def make_group(self, owner, members, title='گروه موجود'):
        conv = Conversation.objects.create(conv_type=ConversationType.GROUP, title=title, created_by=owner)
        add_members(conv, [owner], role=ParticipantRole.OWNER)
        add_members(conv, [m for m in members if m.id != owner.id])
        return conv

    def put_user_policy(self, actor, target, **body):
        self.auth(actor)
        return self.client.put(USER_POLICY_URL.format(target.id), body, format='json')

    def put_company_policy(self, actor, company, **body):
        self.auth(actor)
        return self.client.put(COMPANY_POLICY_URL.format(company.id), body, format='json')


class CompanyScopeTests(ChatAccessTestBase):
    """سناریوی ۱: پیش‌فرض `company`"""

    def test_default_company_scope_sees_own_company_and_superusers(self):
        co_a, co_b = self.make_company(), self.make_company()
        sec_a = self.make_section(self.make_project(co_a))
        viewer, mate_assigned, mate_linked = self.make_user(), self.make_user(), self.make_user()
        other = self.make_user()
        self.assign_section(viewer, sec_a)
        self.assign_company(mate_assigned, co_a)
        self.link_company(mate_linked, co_a)
        self.assign_section(other, self.make_section(self.make_project(co_b)))

        ids = self.contact_ids(viewer)
        self.assertEqual(ids, {mate_assigned.id, mate_linked.id, self.superuser.id})
        self.assertNotIn(other.id, ids)
        self.assertNotIn(viewer.id, ids)

    def test_user_without_company_sees_only_superusers(self):
        loner = self.make_user()
        self.make_user()
        self.assertEqual(self.contact_ids(loner), {self.superuser.id})

    def test_superuser_sees_everyone_active(self):
        u1, u2 = self.make_user(), self.make_user()
        inactive = self.make_user(is_active=False)
        ids = self.contact_ids(self.superuser)
        self.assertTrue({u1.id, u2.id} <= ids)
        self.assertNotIn(inactive.id, ids)

    def test_visible_contact_ids_uses_constant_queries(self):
        co = self.make_company()
        project = self.make_project(co)
        viewer = self.make_user()
        self.assign_section(viewer, self.make_section(project))
        self.set_company_scope(co, 'section')

        def count():
            with CaptureQueriesContext(connection) as ctx:
                visible_contact_ids(viewer)
            return len(ctx.captured_queries)

        before = count()
        for _ in range(8):
            u = self.make_user()
            self.assign_section(u, self.make_section(project))
            self.link_company(u, co)
        self.assertEqual(count(), before)


class SectionScopeTests(ChatAccessTestBase):
    """سناریوی ۲: پیش‌فرض شرکت `section`"""

    def setUp(self):
        super().setUp()
        self.co = self.make_company()
        self.set_company_scope(self.co, 'section')
        project = self.make_project(self.co)
        self.s1, self.s2 = self.make_section(project), self.make_section(project)
        self.viewer, self.peer, self.other_section = self.make_user(), self.make_user(), self.make_user()
        self.company_manager, self.inactive_peer = self.make_user(), self.make_user()
        self.assign_section(self.viewer, self.s1)
        self.assign_section(self.peer, self.s1)
        self.assign_section(self.other_section, self.s2)
        self.assign_company(self.company_manager, self.co)
        self.assign_section(self.inactive_peer, self.s1, active=False)

    def test_section_scope_sees_only_section_mates_and_company_level_manager(self):
        ids = self.contact_ids(self.viewer)
        self.assertEqual(ids, {self.peer.id, self.company_manager.id, self.superuser.id})
        self.assertNotIn(self.other_section.id, ids)
        self.assertNotIn(self.inactive_peer.id, ids, 'انتساب غیرفعال حساب نمی‌شود')

    def test_company_level_manager_sees_every_section(self):
        ids = self.contact_ids(self.company_manager)
        self.assertTrue({self.viewer.id, self.peer.id, self.other_section.id} <= ids)
        self.assertNotIn(self.inactive_peer.id, ids)


class DirectConversationScopeTests(ChatAccessTestBase):
    """سناریوی ۷: گفتگوی دو‌نفرهٔ تازه بیرون از حوزه ۴۰۳؛ گفتگوی موجود برگردانده می‌شود"""

    def setUp(self):
        super().setUp()
        co_a, co_b = self.make_company(), self.make_company()
        self.viewer, self.mate, self.outsider = self.make_user(), self.make_user(), self.make_user()
        self.assign_company(self.viewer, co_a)
        self.assign_company(self.mate, co_a)
        self.assign_company(self.outsider, co_b)

    def test_new_direct_out_of_scope_forbidden(self):
        resp = self.post_direct(self.viewer, self.outsider)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertFalse(Conversation.objects.filter(conv_type=ConversationType.DIRECT,
                                                     participants=self.outsider).exists())

    def test_new_direct_in_scope_and_with_superuser_allowed(self):
        self.assertEqual(self.post_direct(self.viewer, self.mate).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.post_direct(self.viewer, self.superuser).status_code, status.HTTP_201_CREATED)

    def test_existing_direct_returned_even_out_of_scope(self):
        conv = self.make_direct(self.viewer, self.outsider)
        resp = self.post_direct(self.viewer, self.outsider)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(str(resp.data['id']), str(conv.id))

    def test_scope_is_one_way(self):
        """ت۷: حوزهٔ `all` برای بیرونی؛ او گفتگو را شروع می‌کند و بیننده در همان گفتگو جواب می‌دهد"""
        self.set_user_policy(self.outsider, contact_scope='all')
        resp = self.post_direct(self.outsider, self.viewer)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertNotIn(self.outsider.id, self.contact_ids(self.viewer))
        self.assertEqual(self.post_direct(self.viewer, self.outsider).status_code, status.HTTP_200_OK)


class GroupScopeTests(ChatAccessTestBase):
    """سناریوی ۸: ساخت گروه یا افزودن عضو بیرون از حوزه ۴۰۰ و هیچ عضوی اضافه نمی‌شود"""

    def setUp(self):
        super().setUp()
        co_a, co_b = self.make_company(), self.make_company()
        self.manager = self.make_user(is_staff=True)
        self.mate, self.mate2, self.outsider = self.make_user(), self.make_user(), self.make_user()
        for u in (self.manager, self.mate, self.mate2):
            self.assign_company(u, co_a)
        self.assign_company(self.outsider, co_b)

    def test_group_create_with_outsider_rejected_nothing_created(self):
        before = Conversation.objects.filter(conv_type=ConversationType.GROUP).count()
        resp = self.post_group(self.manager, [self.mate, self.outsider])
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertEqual([int(i) for i in resp.data.get('out_of_scope_ids')], [self.outsider.id])
        self.assertEqual(Conversation.objects.filter(conv_type=ConversationType.GROUP).count(), before)

    def test_group_create_in_scope_ok(self):
        resp = self.post_group(self.manager, [self.mate, self.mate2])
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

    def test_add_members_with_outsider_adds_none(self):
        conv = self.make_group(self.manager, [self.mate])
        resp = self.post_add_members(self.manager, conv, [self.mate2, self.outsider])
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertFalse(ConversationParticipant.objects.filter(
            conversation=conv, user__in=[self.mate2, self.outsider], left_at__isnull=True).exists())

    def test_superuser_exempt(self):
        resp = self.post_group(self.superuser, [self.mate, self.outsider])
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        conv = self.make_group(self.superuser, [self.mate])
        resp = self.post_add_members(self.superuser, conv, [self.outsider])
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)


class BlockedUserTests(ChatAccessTestBase):
    """سناریوی ۹: کاربر بسته‌شده"""

    def setUp(self):
        super().setUp()
        co = self.make_company()
        self.blocked, self.mate, self.mate2 = self.make_user(), self.make_user(), self.make_user()
        for u in (self.blocked, self.mate, self.mate2):
            self.assign_company(u, co)
        self.group = self.make_group(self.mate, [self.blocked, self.mate2])
        self.set_user_policy(self.blocked, chat_allowed=False)

    def test_all_chat_rest_paths_forbidden_with_persian_message(self):
        self.auth(self.blocked)
        for url in (CONTACTS_URL, CONV_URL, f'{CONV_URL}{self.group.id}/',
                    f'/api/communications/messages/?conversation_id={self.group.id}'):
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, url)
            self.assertEqual(str(resp.data['detail']), BLOCKED_MESSAGE, url)
        resp = self.client.post('/api/communications/messages/', {'conversation': str(self.group.id), 'text': 'x'},
                                format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_capabilities_report_blocked(self):
        self.auth(self.blocked)
        resp = self.client.get(CAPABILITIES_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['chat_allowed'])
        self.assertFalse(resp.data['can_create_group'])

    def test_hidden_from_contacts_and_not_addable(self):
        self.assertNotIn(self.blocked.id, self.contact_ids(self.mate))
        self.assertEqual(self.post_direct(self.mate, self.blocked).status_code, status.HTTP_403_FORBIDDEN)

    def test_group_message_stored_without_notification_then_history_after_unblock(self):
        msg = Message.objects.create(conversation=self.group, sender=self.mate, text='سلام همه')
        with mock.patch('notifications.push.schedule_push_for_notifications'):
            broadcast_message_ws(msg)
        self.assertTrue(Notification.objects.filter(recipient=self.mate2, notification_type='chat_message').exists())
        self.assertFalse(Notification.objects.filter(recipient=self.blocked, notification_type='chat_message').exists())
        self.assertTrue(ConversationParticipant.objects.filter(conversation=self.group, user=self.blocked,
                                                               left_at__isnull=True).exists())

        self.set_user_policy(self.blocked, chat_allowed=True)
        self.auth(self.blocked)
        resp = self.client.get(f'/api/communications/messages/?conversation_id={self.group.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertIn(str(msg.id), {str(m['id']) for m in _items(resp.data)})

    def test_websocket_session_closed_for_blocked_user(self):
        from communications.consumers import ChatConsumer, WS_CLOSE_AUTH
        consumer = ChatConsumer()
        consumer._init_auth_state()
        consumer.channel_name = 'test-channel'
        consumer.channel_layer = mock.AsyncMock()
        consumer.send = mock.AsyncMock()
        consumer.close = mock.AsyncMock()
        # database_sync_to_async closes DB connections; inside TestCase the test transaction must survive
        patcher = mock.patch('channels.db.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)
        async_to_sync(consumer._setup_authenticated_session)(self.blocked)
        consumer.close.assert_awaited_with(code=WS_CLOSE_AUTH)
        self.assertFalse(consumer.is_authenticated)
        self.assertEqual(json.loads(consumer.send.await_args.kwargs['text_data'])['message'], BLOCKED_MESSAGE)
        consumer.channel_layer.group_add.assert_not_awaited()

        consumer.user = self.blocked
        self.assertFalse(async_to_sync(consumer._still_permitted)())
        consumer.user = self.mate
        self.assertTrue(async_to_sync(consumer._still_permitted)())


class PolicyApiTests(ChatAccessTestBase):
    """سناریوی ۱۰: مدیر کل را نمی‌شود بست؛ تغییر سیاست خود ممنوع؛ مدیر شرکت الف بر کاربر مشترک با ب تسلط ندارد"""

    def setUp(self):
        super().setUp()
        self.co_a, self.co_b = self.make_company(), self.make_company()
        self.admin_a = self.make_user()
        self.assign_company(self.admin_a, self.co_a, role='manager')
        self.link_company(self.admin_a, self.co_a)
        self.admin_a = self.grant_perm(self.admin_a, 'perm_usr_edit')
        self.user_a = self.make_user()
        self.link_company(self.user_a, self.co_a)
        self.user_ab = self.make_user()
        self.link_company(self.user_ab, self.co_a)
        self.link_company(self.user_ab, self.co_b)

    def test_superuser_cannot_be_blocked(self):
        other_root = self.make_user(superuser=True)
        resp = self.put_user_policy(self.superuser, other_root, chat_allowed=False)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertFalse(ChatUserPolicy.objects.filter(user=other_root).exists())

    def test_self_edit_forbidden(self):
        self.assertEqual(self.put_user_policy(self.admin_a, self.admin_a, chat_allowed=False).status_code,
                         status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.put_user_policy(self.superuser, self.superuser, contact_scope='section').status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_admin_of_a_cannot_edit_user_shared_with_b(self):
        resp = self.put_user_policy(self.admin_a, self.user_ab, chat_allowed=False)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.auth(self.admin_a)
        self.assertEqual(self.client.get(USER_POLICY_URL.format(self.user_ab.id)).status_code,
                         status.HTTP_403_FORBIDDEN)
        self.assertFalse(ChatUserPolicy.objects.filter(user=self.user_ab).exists())

    def test_admin_of_a_edits_own_company_user_with_audit(self):
        before = AuditLog.objects.filter(target_model='ChatUserPolicy').count()
        resp = self.put_user_policy(self.admin_a, self.user_a, chat_allowed=False, contact_scope='section')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        policy = ChatUserPolicy.objects.get(user=self.user_a)
        self.assertFalse(policy.chat_allowed)
        self.assertEqual(policy.contact_scope, 'section')
        self.assertEqual(policy.updated_by_id, self.admin_a.id)
        self.assertEqual(AuditLog.objects.filter(target_model='ChatUserPolicy').count(), before + 1)

    def test_without_edit_permission_forbidden(self):
        plain = self.make_user()
        self.assign_company(plain, self.co_a)
        self.link_company(plain, self.co_a)
        self.assertEqual(self.put_user_policy(plain, self.user_a, chat_allowed=False).status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_invalid_input_rejected(self):
        self.assertEqual(self.put_user_policy(self.superuser, self.user_a, contact_scope='planet').status_code,
                         status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.put_user_policy(self.superuser, self.user_a).status_code,
                         status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.put_company_policy(self.superuser, self.co_a, contact_scope='').status_code,
                         status.HTTP_400_BAD_REQUEST)

    def test_unknown_targets_404(self):
        self.auth(self.superuser)
        self.assertEqual(self.client.get(USER_POLICY_URL.format(999999)).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(COMPANY_POLICY_URL.format(999999)).status_code, status.HTTP_404_NOT_FOUND)
