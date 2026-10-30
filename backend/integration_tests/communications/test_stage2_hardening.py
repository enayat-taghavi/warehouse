"""
آزمون‌های سخت‌سازی مرحلهٔ ۲ چت (E5، E6، E9، E18، E19، E23، E25)
مرجع: Documents/Communication_System_Hardening/chat_review_groups_upgrades_2026-10-30.md
"""
import asyncio
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import close_old_connections
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator as RawCommunicator

from config.asgi import application
from accounts.models import AuditLog
from inventory.models import Item
from settings_core.models import SystemSetting
from warehouses.models import Warehouse
from warehouses.services import clear_setting_cache
from communications.access import resolve_comment_content_type
from communications.consumers import resolve_comment_subscription
from communications.models import Conversation, Message, GenericComment, ConversationType

from .base import BaseCommsTestCase, FirstMessageAuthCommunicator

User = get_user_model()


def _results(resp):
    data = resp.json()
    return data.get('results', data) if isinstance(data, dict) else data


class DirectPrivacyTests(BaseCommsTestCase):
    """E5: چت دو‌نفره فقط برای اعضا؛ ویرایش پیام دیگران برای هیچ‌کس"""

    def setUp(self):
        super().setUp()
        self.group_message = Message.objects.create(
            conversation=self.wh1_group, sender=self.manager_wh1, text="پیام گروهی"
        )

    def test_superuser_cannot_retrieve_direct_conversation(self):
        self.auth(self.admin)
        resp = self.client.get(f'/api/communications/conversations/{self.direct_conv.id}/')
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_participant_still_reads_direct_conversation(self):
        self.auth(self.staff_wh1)
        resp = self.client.get(f'/api/communications/conversations/{self.direct_conv.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superuser_cannot_list_direct_messages(self):
        self.auth(self.admin)
        resp = self.client.get('/api/communications/messages/', {'conversation_id': str(self.direct_conv.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(_results(resp)), 0)

    def test_superuser_cannot_post_to_direct_conversation(self):
        self.auth(self.admin)
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.direct_conv.id), 'text': 'شنود'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_cannot_edit_others_message(self):
        self.auth(self.admin)
        for msg in (self.direct_message, self.group_message):
            resp = self.client.patch(f'/api/communications/messages/{msg.id}/', {'text': 'دستکاری'}, format='json')
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
            msg.refresh_from_db()
            self.assertNotEqual(msg.text, 'دستکاری')

    def test_superuser_cannot_delete_direct_message(self):
        self.auth(self.admin)
        resp = self.client.delete(f'/api/communications/messages/{self.direct_message.id}/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_delete_group_message_with_audit(self):
        self.auth(self.admin)
        resp = self.client.delete(f'/api/communications/messages/{self.group_message.id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(AuditLog.objects.filter(
            target_model='Message', action='DELETE', target_object_id=str(self.group_message.id)
        ).exists())

    def test_sender_can_edit_own_message(self):
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'/api/communications/messages/{self.group_message.id}/', {'text': 'اصلاح'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class ChatGroupManagerCapabilityTests(BaseCommsTestCase):
    """E19: ساخت اطلاعیه با قابلیت chat_group_manager (alias مجوز ماژول)"""

    def _grant_manager_perm(self, user):
        ct = ContentType.objects.get_for_model(User)
        perm, _ = Permission.objects.get_or_create(
            codename='can_act_as_manager', content_type=ct, defaults={'name': 'Can act as manager'}
        )
        user.user_permissions.add(perm)
        return User.objects.get(pk=user.pk)

    def _create_announcement(self, user):
        self.auth(user)
        return self.client.post('/api/communications/conversations/', {
            'title': 'اطلاعیه آزمایشی', 'conv_type': ConversationType.ANNOUNCEMENT
        }, format='json')

    def test_capability_holder_can_create_announcement(self):
        manager = self._grant_manager_perm(self.staff_wh1)
        self.assertFalse(manager.is_staff)
        resp = self._create_announcement(manager)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

    def test_plain_user_cannot_create_announcement(self):
        resp = self._create_announcement(self.staff_wh1)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class ConversationUpdateTests(BaseCommsTestCase):
    """E23: انبار گفتگو با PATCH تغییر نمی‌کند"""

    def test_patch_warehouse_is_ignored(self):
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'/api/communications/conversations/{self.wh1_group.id}/', {
            'warehouse': self.wh2.id, 'title': 'عنوان تازه'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.wh1_group.refresh_from_db()
        self.assertEqual(self.wh1_group.warehouse_id, self.wh1.id)
        self.assertEqual(self.wh1_group.title, 'عنوان تازه')


class ChatEnabledPerConversationTests(BaseCommsTestCase):
    """E18: فعال بودن چت از انبار خودِ گفتگو خوانده می‌شود"""

    def setUp(self):
        super().setUp()
        SystemSetting.objects.update_or_create(key='chat_enabled', warehouse_id=self.wh1.id, defaults={'value': False})
        clear_setting_cache('chat_enabled')
        clear_setting_cache('chat_enabled', self.wh1.id)

    def tearDown(self):
        SystemSetting.objects.filter(key='chat_enabled').delete()
        clear_setting_cache('chat_enabled')
        clear_setting_cache('chat_enabled', self.wh1.id)
        super().tearDown()

    def test_message_to_disabled_warehouse_group_blocked(self):
        self.auth(self.staff_wh1)
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.wh1_group.id), 'text': 'سلام'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_client_warehouse_field_cannot_override_conversation(self):
        self.auth(self.staff_wh1)
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.wh1_group.id), 'text': 'سلام', 'warehouse': self.wh2.id
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_message_to_direct_conversation_unaffected(self):
        self.auth(self.staff_wh1)
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.direct_conv.id), 'text': 'سلام'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)


class CommentTargetScopeTests(BaseCommsTestCase):
    """E6 و E25: دامنهٔ هدف نظر و فیلدهای فقط‌خواندنی"""

    def setUp(self):
        super().setUp()
        self.wh_ct = ContentType.objects.get_for_model(Warehouse)
        GenericComment.objects.create(
            content_type=self.wh_ct, object_id=str(self.wh1.id), author=self.staff_wh1, text="نظر روی انبار ۱"
        )

    def _post(self, user, payload):
        self.auth(user)
        return self.client.post('/api/communications/comments/', payload, format='json')

    def test_list_comments_on_inaccessible_warehouse_empty(self):
        self.auth(self.staff_wh2)
        resp = self.client.get('/api/communications/comments/', {'model_name': 'warehouse', 'object_id': self.wh1.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(_results(resp)), 0)

        self.auth(self.staff_wh1)
        resp = self.client.get('/api/communications/comments/', {'model_name': 'warehouse', 'object_id': self.wh1.id})
        self.assertEqual(len(_results(resp)), 1)

    def test_list_with_app_label_form_works(self):
        self.auth(self.staff_wh1)
        resp = self.client.get('/api/communications/comments/', {'model_name': 'inventory.item', 'object_id': self.item_wh1.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(_results(resp)), 1)

    def test_list_rejects_model_outside_allowlist(self):
        self.auth(self.staff_wh1)
        resp = self.client.get('/api/communications/comments/', {'model_name': 'customuser', 'object_id': self.staff_wh1.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_comment_on_inaccessible_warehouse_denied(self):
        payload = {'content_type_str': 'warehouses.warehouse', 'object_id': str(self.wh1.id), 'text': 'نفوذ'}
        self.assertEqual(self._post(self.staff_wh2, payload).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._post(self.staff_wh1, payload).status_code, status.HTTP_201_CREATED)

    def test_ws_subscription_helper_checks_warehouse_scope(self):
        self.assertIsNone(resolve_comment_subscription(self.staff_wh2, 'warehouse', self.wh1.id))
        self.assertEqual(resolve_comment_subscription(self.staff_wh1, 'warehouse', self.wh1.id), 'warehouse')
        self.assertEqual(resolve_comment_subscription(self.staff_wh1, 'warehouses.warehouse', self.wh1.id), 'warehouse')
        self.assertIsNone(resolve_comment_subscription(self.staff_wh1, 'customuser', self.staff_wh1.id))

    def test_ambiguous_bare_model_name_rejected(self):
        ContentType.objects.create(app_label='zz_fake_app', model='item')
        self.assertIsNone(resolve_comment_content_type('item'))
        self.assertEqual(resolve_comment_content_type('inventory.item'), self.item_ct)

    def test_mentioned_users_in_body_ignored(self):
        resp = self._post(self.staff_wh1, {
            'content_type_str': 'inventory.item', 'object_id': str(self.item_wh1.id),
            'text': 'بدون منشن', 'mentioned_users': [self.staff_wh2.id]
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        comment = GenericComment.objects.get(id=resp.json()['id'])
        self.assertEqual(comment.mentioned_users.count(), 0)

    def test_patch_cannot_set_mentioned_users(self):
        self.auth(self.staff_wh1)
        resp = self.client.patch(f'/api/communications/comments/{self.comment_wh1.id}/', {
            'text': 'ویرایش', 'mentioned_users': [self.staff_wh2.id]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(self.comment_wh1.mentioned_users.count(), 0)

    def test_parent_on_other_object_rejected(self):
        item2 = Item.objects.create(
            warehouse=self.wh1, fa_unic_code="COMMS-102", description="کالای دوم",
            inventory=Decimal('1.000'), bal4miv=Decimal('1.000')
        )
        resp = self._post(self.staff_wh1, {
            'content_type_str': 'inventory.item', 'object_id': str(item2.id),
            'text': 'پاسخ نامربوط', 'parent': str(self.comment_wh1.id)
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('parent', resp.json())

        resp = self._post(self.staff_wh1, {
            'content_type_str': 'inventory.item', 'object_id': str(self.item_wh1.id),
            'text': 'پاسخ درست', 'parent': str(self.comment_wh1.id)
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

    def test_missing_content_type_str_is_clean_400(self):
        resp = self._post(self.staff_wh1, {'object_id': str(self.item_wh1.id), 'text': 'بی‌نوع'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('content_type_str', resp.json())


class WebSocketAuthLifecycleTests(TransactionTestCase):
    """E5 و E9 در وب‌سوکت"""

    def setUp(self):
        super().setUp()
        close_old_connections()
        self.admin = User.objects.create_superuser(username="admin_s2", email="a@s2.test", password="Password123!")
        self.u1 = User.objects.create_user(username="u1_s2", password="Password123!")
        self.u2 = User.objects.create_user(username="u2_s2", password="Password123!")
        self.direct = Conversation.objects.create(title="خصوصی", conv_type=ConversationType.DIRECT, created_by=self.u1)
        self.direct.participants.set([self.u1, self.u2])

    def tearDown(self):
        close_old_connections()
        super().tearDown()

    def token(self, user, lifetime=None):
        tok = AccessToken.for_user(user)
        if lifetime is not None:
            tok.set_exp(lifetime=lifetime)
        return str(tok)

    async def _authed(self, user, path="/ws/chat/", lifetime=None):
        comm = FirstMessageAuthCommunicator(application, f"{path}?token={self.token(user, lifetime)}")
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        return comm

    async def test_query_string_token_not_accepted(self):
        comm = RawCommunicator(application, f"/ws/chat/?token={self.token(self.u1)}")
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        await comm.send_json_to({'type': 'join_conversation', 'conversation_id': str(self.direct.id)})
        resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(resp.get('code'), 4001)
        await comm.disconnect()

    async def test_superuser_cannot_join_direct_conversation(self):
        comm = await self._authed(self.admin)
        await comm.send_json_to({'type': 'join_conversation', 'conversation_id': str(self.direct.id)})
        resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(resp.get('type'), 'error')
        self.assertEqual(resp.get('code'), 4003)
        await comm.disconnect()

    async def test_second_authenticate_rejected(self):
        outsider = await database_sync_to_async(User.objects.create_user)(username="out_s2", password="Password123!")
        comm = await self._authed(self.u1)
        await comm.send_json_to({'type': 'authenticate', 'token': self.token(outsider)})
        resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(resp.get('type'), 'error')
        self.assertEqual(resp.get('code'), 4009)
        # هویت قبلی دست‌نخورده: u1 همچنان به گفتگوی خودش می‌پیوندد
        await comm.send_json_to({'type': 'join_conversation', 'conversation_id': str(self.direct.id)})
        resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(resp.get('type'), 'joined_conversation')
        await comm.disconnect()

    async def test_second_authenticate_rejected_on_comment_socket(self):
        comm = await self._authed(self.u1, path="/ws/comments/")
        await comm.send_json_to({'type': 'authenticate', 'token': self.token(self.u2)})
        resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(resp.get('code'), 4009)
        await comm.disconnect()

    async def test_unauthenticated_socket_closed_after_timeout(self):
        with mock.patch('communications.consumers.WS_AUTH_TIMEOUT_SECONDS', 0.2):
            comm = RawCommunicator(application, "/ws/comments/")
            connected, _ = await comm.connect()
            self.assertTrue(connected)
            err = await comm.receive_json_from(timeout=3)
            self.assertEqual(err.get('code'), 4001)
            closed = await comm.receive_output(timeout=3)
            self.assertEqual(closed.get('type'), 'websocket.close')
            self.assertEqual(closed.get('code'), 4003)

    async def test_expired_token_closes_on_ping(self):
        comm = await self._authed(self.u1, lifetime=timedelta(seconds=1))
        await asyncio.sleep(1.3)
        await comm.send_json_to({'type': 'ping', 'timestamp': 1})
        closed = await comm.receive_output(timeout=3)
        self.assertEqual(closed.get('type'), 'websocket.close')
        self.assertEqual(closed.get('code'), 4003)

    async def test_deactivated_user_closed_on_ping(self):
        with mock.patch('communications.consumers.WS_ACTIVE_CHECK_INTERVAL_SECONDS', 0):
            comm = await self._authed(self.u1)
            await database_sync_to_async(User.objects.filter(id=self.u1.id).update)(is_active=False)
            await comm.send_json_to({'type': 'ping', 'timestamp': 1})
            closed = await comm.receive_output(timeout=3)
            self.assertEqual(closed.get('type'), 'websocket.close')
            self.assertEqual(closed.get('code'), 4003)


class ReviewFollowUpTests(BaseCommsTestCase):
    """یافته‌های tenant-scope-reviewer: دامنهٔ شرکت، مسیرهای جزئی، idempotency، ویرایش نظر، افشای وجود"""

    def _post_comment(self, user, payload):
        self.auth(user)
        return self.client.post('/api/communications/comments/', payload, format='json')

    def test_company_scope_blocks_unlimited_warehouse_user(self):
        from common.warehouse_scope import can_access_warehouse
        outsider = self.unassigned_user  # بدون محدودیت انبار، بدون شرکت مجاز
        self.assertTrue(can_access_warehouse(outsider, self.wh1.id))

        self.auth(outsider)
        resp = self.client.get('/api/communications/comments/', {'model_name': 'item', 'object_id': self.item_wh1.id})
        self.assertEqual(len(_results(resp)), 0)
        resp = self._post_comment(outsider, {
            'content_type_str': 'inventory.item', 'object_id': str(self.item_wh1.id), 'text': 'نفوذ شرکتی'
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIsNone(resolve_comment_subscription(outsider, 'item', self.item_wh1.id))
        self.assertIsNone(resolve_comment_subscription(outsider, 'warehouse', self.wh1.id))

    def test_mention_of_out_of_company_user_dropped(self):
        resp = self._post_comment(self.staff_wh1, {
            'content_type_str': 'inventory.item', 'object_id': str(self.item_wh1.id),
            'text': f'سلام @[{self.unassigned_user.id}:x]'
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        comment = GenericComment.objects.get(id=resp.json()['id'])
        self.assertFalse(comment.mentioned_users.filter(id=self.unassigned_user.id).exists())

    def test_idempotent_create_rechecks_access(self):
        payload = {
            'content_type_str': 'inventory.item', 'object_id': str(self.item_wh1.id),
            'text': 'یک بار', 'client_temp_id': 'tmp-s2-1'
        }
        self.assertEqual(self._post_comment(self.staff_wh1, payload).status_code, status.HTTP_201_CREATED)
        self.staff_wh1.assigned_warehouses.set([self.wh2])
        self.assertEqual(self._post_comment(self.staff_wh1, payload).status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_cannot_edit_others_comment_but_can_delete(self):
        self.auth(self.admin)
        resp = self.client.patch(f'/api/communications/comments/{self.comment_wh1.id}/', {'text': 'دستکاری'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        resp = self.client.delete(f'/api/communications/comments/{self.comment_wh1.id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(AuditLog.objects.filter(
            target_model='GenericComment', action='DELETE', target_object_id=str(self.comment_wh1.id)
        ).exists())

    def test_not_found_and_no_access_look_the_same(self):
        base = {'content_type_str': 'inventory.item', 'text': 'آزمون'}
        missing = self._post_comment(self.staff_wh2, {**base, 'object_id': '999999'})
        hidden = self._post_comment(self.staff_wh2, {**base, 'object_id': str(self.item_wh1.id)})
        self.assertEqual(missing.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(hidden.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(missing.json(), hidden.json())

    def test_detail_route_chat_enabled_uses_url_object(self):
        own = Message.objects.create(conversation=self.wh1_group, sender=self.staff_wh1, text="پیام خودم")
        SystemSetting.objects.update_or_create(key='chat_enabled', warehouse_id=self.wh1.id, defaults={'value': False})
        clear_setting_cache('chat_enabled', self.wh1.id)
        try:
            self.auth(self.staff_wh1)
            resp = self.client.patch(
                f'/api/communications/messages/{own.id}/?warehouse_id={self.wh2.id}', {'text': 'ویرایش'}, format='json'
            )
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
            resp = self.client.post(
                f'/api/communications/conversations/{self.wh1_group.id}/mark-read/?warehouse_id={self.wh2.id}'
            )
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        finally:
            SystemSetting.objects.filter(key='chat_enabled').delete()
            clear_setting_cache('chat_enabled', self.wh1.id)
