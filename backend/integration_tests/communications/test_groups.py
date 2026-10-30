"""
آزمون‌های گروه چت (U1) و دانلود محافظت‌شدهٔ پیوست (تصمیم ۷)
"""
from unittest import mock

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections
from django.test import Client, TransactionTestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken

from common.media_urls import signed_media_url, _current_expiry, _signature
from communications.broadcast import broadcast_message_ws, broadcast_membership_ws
from communications.membership import add_members, remove_member
from communications.models import (
    Conversation, ConversationParticipant, ConversationType, Message, MessageAttachment, ParticipantRole
)
from notifications.models import Notification
from .base import BaseCommsTestCase, FirstMessageAuthCommunicator as WebsocketCommunicator

User = get_user_model()

CONV_URL = '/api/communications/conversations/'
PNG = (b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4'
       b'\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82')


def _items(data):
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class GroupApiTests(BaseCommsTestCase):
    """wh1_group: مالک manager_wh1، عضو staff_wh1"""

    def _list_ids(self, user):
        self.auth(user)
        resp = self.client.get(CONV_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return {str(c['id']) for c in _items(resp.data)}

    def _add(self, actor, *users):
        self.auth(actor)
        return self.client.post(f'{CONV_URL}{self.wh1_group.id}/members/', {
            'user_ids': [u.id for u in users]
        }, format='json')

    def _remove(self, actor, target):
        self.auth(actor)
        return self.client.delete(f'{CONV_URL}{self.wh1_group.id}/members/{target.id}/')

    def _set_role(self, actor, target, role):
        self.auth(actor)
        return self.client.patch(f'{CONV_URL}{self.wh1_group.id}/members/{target.id}/', {'role': role}, format='json')

    def _system_texts(self, conv):
        return list(Message.objects.filter(conversation=conv, is_system=True).values_list('text', flat=True))

    # ─── ساخت گروه ───

    def test_manager_creates_group(self):
        self.auth(self.manager_wh1)
        resp = self.client.post(CONV_URL, {
            'conv_type': 'group', 'title': '  تیم پروژه  ',
            'member_ids': [self.staff_wh2.id, self.unassigned_user.id, self.staff_wh2.id, self.manager_wh1.id],
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        conv = Conversation.objects.get(id=resp.data['id'])
        self.assertEqual(conv.title, 'تیم پروژه')
        self.assertIsNone(conv.warehouse_id)
        self.assertEqual(resp.data['my_role'], 'owner')
        self.assertEqual(resp.data['member_count'], 3)
        roles = dict(ConversationParticipant.objects.filter(conversation=conv).values_list('user_id', 'role'))
        self.assertEqual(roles, {
            self.manager_wh1.id: 'owner', self.staff_wh2.id: 'member', self.unassigned_user.id: 'member'
        })
        self.assertEqual(len(self._system_texts(conv)), 1)

    def test_non_manager_cannot_create_group(self):
        self.auth(self.staff_wh1)
        resp = self.client.post(CONV_URL, {'conv_type': 'group', 'title': 'گروه من'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_group_rejects_inactive_or_missing_user_and_empty_title(self):
        inactive = User.objects.create_user(username='inactive_member', password='x', is_active=False)
        self.auth(self.manager_wh1)
        resp = self.client.post(CONV_URL, {
            'conv_type': 'group', 'title': 'گروه', 'member_ids': [inactive.id, 999999]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        resp = self.client.post(CONV_URL, {'conv_type': 'group', 'title': '   '}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_warehouse_group_type_is_gone(self):
        self.auth(self.manager_wh1)
        resp = self.client.post(CONV_URL, {'conv_type': 'warehouse_group', 'title': 'قدیمی'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ─── افزودن، حذف و نقش ───

    def test_owner_and_admin_add_members_member_cannot(self):
        resp = self._add(self.staff_wh1, self.staff_wh2)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        resp = self._add(self.manager_wh1, self.staff_wh2)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual([m['id'] for m in resp.data['added']], [self.staff_wh2.id])
        self.assertTrue(self.wh1_group.participants.filter(id=self.staff_wh2.id).exists())

        self.assertEqual(self._set_role(self.manager_wh1, self.staff_wh1, 'admin').status_code, status.HTTP_200_OK)
        resp = self._add(self.staff_wh1, self.unassigned_user)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(len(self._system_texts(self.wh1_group)), 2)

    def test_only_owner_changes_roles(self):
        add_members(self.wh1_group, [self.staff_wh2])
        self.assertEqual(self._set_role(self.staff_wh1, self.staff_wh2, 'admin').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._set_role(self.manager_wh1, self.staff_wh2, 'owner').status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_cannot_remove_owner_or_admin(self):
        add_members(self.wh1_group, [self.staff_wh2])
        self._set_role(self.manager_wh1, self.staff_wh1, 'admin')
        self._set_role(self.manager_wh1, self.staff_wh2, 'admin')
        self.assertEqual(self._remove(self.staff_wh1, self.manager_wh1).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._remove(self.staff_wh1, self.staff_wh2).status_code, status.HTTP_403_FORBIDDEN)
        # حذف خود از این مسیر مجاز نیست (باید leave زد)
        self.assertEqual(self._remove(self.manager_wh1, self.manager_wh1).status_code, status.HTTP_400_BAD_REQUEST)

    def test_member_cannot_remove(self):
        add_members(self.wh1_group, [self.staff_wh2])
        self.assertEqual(self._remove(self.staff_wh1, self.staff_wh2).status_code, status.HTTP_403_FORBIDDEN)

    def test_removed_member_loses_access_everywhere(self):
        own = Message.objects.create(conversation=self.wh1_group, sender=self.staff_wh1, text='پیام خودم')
        self.assertIn(str(self.wh1_group.id), self._list_ids(self.staff_wh1))

        resp = self._remove(self.manager_wh1, self.staff_wh1)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT, resp.content)
        rec = ConversationParticipant.all_objects.get(conversation=self.wh1_group, user=self.staff_wh1)
        self.assertIsNotNone(rec.left_at)  # رکورد پاک نمی‌شود
        self.assertEqual(len(self._system_texts(self.wh1_group)), 1)

        self.assertNotIn(str(self.wh1_group.id), self._list_ids(self.staff_wh1))
        self.auth(self.staff_wh1)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.wh1_group.id}/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.wh1_group.id}/members/').status_code, status.HTTP_403_FORBIDDEN)
        resp = self.client.get(f'/api/communications/messages/?conversation_id={self.wh1_group.id}')
        self.assertEqual(_items(resp.data), [])
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.wh1_group.id), 'text': 'هنوز اینجام؟'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        resp = self.client.patch(f'/api/communications/messages/{own.id}/', {'text': 'ویرایش'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_readd_restores_membership_record(self):
        remove_member(self.wh1_group, self.staff_wh1)
        resp = self._add(self.manager_wh1, self.staff_wh1)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        recs = ConversationParticipant.all_objects.filter(conversation=self.wh1_group, user=self.staff_wh1)
        self.assertEqual(recs.count(), 1)
        self.assertIsNone(recs.first().left_at)

    def test_removed_member_gets_no_broadcast_or_notification(self):
        remove_member(self.wh1_group, self.staff_wh1)
        msg = Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text='سلام')
        layer = mock.MagicMock()
        layer.group_send = mock.AsyncMock()
        with mock.patch('communications.broadcast.get_channel_layer', return_value=layer):
            broadcast_message_ws(msg)
        rooms = [c.args[0] for c in layer.group_send.call_args_list]
        self.assertNotIn(f'chat_user_{self.staff_wh1.id}', rooms)
        self.assertFalse(Notification.objects.filter(recipient=self.staff_wh1, target_id=str(self.wh1_group.id)).exists())

    def test_membership_broadcast_revokes_removed_user(self):
        layer = mock.MagicMock()
        layer.group_send = mock.AsyncMock()
        remove_member(self.wh1_group, self.staff_wh1)
        with mock.patch('communications.broadcast.get_channel_layer', return_value=layer):
            broadcast_membership_ws(self.wh1_group, removed_user_ids=[self.staff_wh1.id])
        calls = [(c.args[0], c.args[1]['type']) for c in layer.group_send.call_args_list]
        self.assertIn((f'chat_user_{self.staff_wh1.id}', 'chat_membership_revoked'), calls)
        self.assertIn((f'chat_user_{self.manager_wh1.id}', 'chat_message_broadcast'), calls)
        self.assertNotIn((f'chat_user_{self.staff_wh1.id}', 'chat_message_broadcast'), calls)

    # ─── خروج ───

    def test_owner_leave_transfers_to_oldest_admin(self):
        add_members(self.wh1_group, [self.staff_wh2])
        self._set_role(self.manager_wh1, self.staff_wh2, 'admin')
        self.auth(self.manager_wh1)
        resp = self.client.post(f'{CONV_URL}{self.wh1_group.id}/leave/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.data['new_owner_id'], self.staff_wh2.id)
        self.assertFalse(self.wh1_group.participants.filter(id=self.manager_wh1.id).exists())
        self.assertEqual(len(self._system_texts(self.wh1_group)), 1)

    def test_owner_leave_without_admin_transfers_to_oldest_member(self):
        self.auth(self.manager_wh1)
        resp = self.client.post(f'{CONV_URL}{self.wh1_group.id}/leave/')
        self.assertEqual(resp.data['new_owner_id'], self.staff_wh1.id)

    def test_last_member_leaving_deactivates_group(self):
        for u in (self.staff_wh1, self.manager_wh1):
            self.auth(u)
            self.assertEqual(self.client.post(f'{CONV_URL}{self.wh1_group.id}/leave/').status_code, status.HTTP_200_OK)
        self.wh1_group.refresh_from_db()
        self.assertFalse(self.wh1_group.is_active)
        self.assertTrue(Conversation.objects.filter(id=self.wh1_group.id).exists())
        self.assertEqual(ConversationParticipant.all_objects.filter(conversation=self.wh1_group).count(), 2)

    # ─── سایر ───

    def test_rename_by_owner_creates_system_message_member_forbidden(self):
        self.auth(self.staff_wh1)
        resp = self.client.patch(f'{CONV_URL}{self.wh1_group.id}/', {'title': 'دستکاری'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'{CONV_URL}{self.wh1_group.id}/', {'title': 'نام تازه'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(len(self._system_texts(self.wh1_group)), 1)

    def test_unread_count_for_new_member_counts_from_join(self):
        for i in range(3):
            Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text=f'قدیمی {i}')
        self.assertEqual(self._add(self.manager_wh1, self.staff_wh2).status_code, status.HTTP_200_OK)
        self.auth(self.staff_wh2)
        resp = self.client.get(CONV_URL)
        conv = next(c for c in _items(resp.data) if str(c['id']) == str(self.wh1_group.id))
        self.assertEqual(conv['unread_count'], 1)  # فقط پیام سیستمی «افزودن»
        self.assertEqual(conv['my_role'], 'member')
        # کل تاریخچه دیده می‌شود (تصمیم ۴)
        resp = self.client.get(f'/api/communications/messages/?conversation_id={self.wh1_group.id}')
        self.assertEqual(len(_items(resp.data)), 4)

    def test_members_list(self):
        self.auth(self.staff_wh1)
        resp = self.client.get(f'{CONV_URL}{self.wh1_group.id}/members/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual({m['id']: m['role'] for m in resp.data},
                         {self.manager_wh1.id: 'owner', self.staff_wh1.id: 'member'})
        self.auth(self.staff_wh2)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.wh1_group.id}/members/').status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_mute_endpoint(self):
        self.auth(self.staff_wh1)
        resp = self.client.post(f'{CONV_URL}{self.wh1_group.id}/mute/', {'muted': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertTrue(ConversationParticipant.objects.get(conversation=self.wh1_group, user=self.staff_wh1).is_muted)
        self.auth(self.staff_wh2)
        resp = self.client.post(f'{CONV_URL}{self.wh1_group.id}/mute/', {'muted': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_endpoints_on_direct_conversation_rejected(self):
        self.auth(self.manager_wh1)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.direct_conv.id}/members/').status_code,
                         status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(f'{CONV_URL}{self.direct_conv.id}/leave/').status_code,
                         status.HTTP_400_BAD_REQUEST)

    def test_superuser_non_member_has_no_group_access(self):
        self.assertNotIn(str(self.wh1_group.id), self._list_ids(self.admin))
        self.auth(self.admin)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.wh1_group.id}/').status_code, status.HTTP_403_FORBIDDEN)
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.wh1_group.id), 'text': 'سلام'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.patch(f'{CONV_URL}{self.wh1_group.id}/', {'title': 'x'}, format='json').status_code,
                         status.HTTP_403_FORBIDDEN)


class ChatAttachmentDownloadTests(BaseCommsTestCase):

    def setUp(self):
        super().setUp()
        self.group_msg = Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text='فایل')
        self.auth(self.manager_wh1)
        resp = self.client.post('/api/communications/messages/upload/', {
            'file': SimpleUploadedFile('photo.png', PNG, content_type='image/png'),
            'message_id': str(self.group_msg.id)
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.att = MessageAttachment.objects.get(id=resp.data['id'])
        self.url = resp.data['download_url']

    def _get(self, user, url=None):
        self.auth(user)
        resp = self.client.get(url or self.url)
        # فقط فایل باز را می‌بندیم؛ resp.close() سیگنال request_finished را می‌زند و اتصال پایگاه‌دادهٔ تست را می‌بندد
        stream = getattr(resp, 'file_to_stream', None)
        if stream is not None:
            stream.close()
        return resp

    def test_member_downloads_inline(self):
        resp = self._get(self.staff_wh1)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'image/png')
        self.assertTrue(resp['Content-Disposition'].startswith('inline'))
        self.assertNotIn('immutable', resp['Cache-Control'])
        self.assertEqual(resp['X-Content-Type-Options'], 'nosniff')

    def test_non_member_and_missing_look_the_same(self):
        self.assertEqual(self._get(self.staff_wh2).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._get(self.admin).status_code, status.HTTP_403_FORBIDDEN)
        missing = self._get(self.staff_wh1, '/api/communications/attachments/999999/download/')
        self.assertEqual(missing.status_code, status.HTTP_403_FORBIDDEN)

    def test_removed_member_and_deleted_message_denied(self):
        remove_member(self.wh1_group, self.staff_wh1)
        self.assertEqual(self._get(self.staff_wh1).status_code, status.HTTP_403_FORBIDDEN)
        self.group_msg.soft_delete()
        self.assertEqual(self._get(self.manager_wh1).status_code, status.HTTP_403_FORBIDDEN)

    def test_thumbnail(self):
        self.att.thumbnail.save('thumb.png', ContentFile(PNG), save=True)
        self.auth(self.manager_wh1)
        resp = self.client.get(f'/api/communications/messages/?conversation_id={self.wh1_group.id}')
        att_out = _items(resp.data)[0]['attachments'][0]
        self.assertEqual(att_out['thumbnail_url'], f'{self.url}?thumb=1')
        self.assertNotIn('file', att_out)
        self.assertNotIn('thumbnail', att_out)
        resp = self._get(self.staff_wh1, att_out['thumbnail_url'])
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'image/png')

    def test_old_signed_media_link_refused(self):
        path = self.att.file.name
        expiry = _current_expiry()
        resp = Client().get(f'/media/{path}?e={expiry}&s={_signature(path, expiry)}')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn('?e=', signed_media_url(path))


class GroupRemovalWebSocketTests(TransactionTestCase):
    """حذف عضو فوراً اشتراک زندهٔ او در روم conv_<id> را قطع می‌کند"""

    def setUp(self):
        super().setUp()
        close_old_connections()
        self.owner = User.objects.create_user(username='ws_group_owner', password='x', is_staff=True)
        self.member = User.objects.create_user(username='ws_group_member', password='x')
        self.group = Conversation.objects.create(title='گروه وب‌سوکت', conv_type=ConversationType.GROUP,
                                                 created_by=self.owner)
        add_members(self.group, [self.owner], role=ParticipantRole.OWNER)
        add_members(self.group, [self.member])

    def tearDown(self):
        close_old_connections()
        super().tearDown()

    async def _connect_and_join(self, user):
        from config.asgi import application
        comm = WebsocketCommunicator(application, f"/ws/chat/?token={AccessToken.for_user(user)}")
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        await comm.send_json_to({'type': 'join_conversation', 'conversation_id': str(self.group.id)})
        while True:
            out = await comm.receive_json_from(timeout=5)
            if out.get('type') == 'joined_conversation':
                return comm

    async def _typing(self, comm):
        await comm.send_json_to({'type': 'typing', 'conversation_id': str(self.group.id), 'is_typing': True})

    async def test_removed_member_stops_receiving_room_events(self):
        owner_comm = await self._connect_and_join(self.owner)
        member_comm = await self._connect_and_join(self.member)
        await owner_comm.receive_nothing(timeout=0.3)  # presence عضو تازه

        await self._typing(owner_comm)
        got = await member_comm.receive_json_from(timeout=5)
        self.assertEqual(got.get('event'), 'chat.typing')

        def _remove():
            remove_member(self.group, self.member)
            broadcast_membership_ws(self.group, removed_user_ids=[self.member.id])
        await database_sync_to_async(_remove)()

        removed = await member_comm.receive_json_from(timeout=5)
        self.assertEqual(removed.get('event'), 'chat.conversation.removed')
        self.assertEqual(removed['data']['conversation_id'], str(self.group.id))

        await self._typing(owner_comm)
        self.assertTrue(await member_comm.receive_nothing(timeout=0.5))

        # پیوستن دوباره هم رد می‌شود
        await member_comm.send_json_to({'type': 'join_conversation', 'conversation_id': str(self.group.id)})
        denied = await member_comm.receive_json_from(timeout=5)
        self.assertEqual(denied.get('type'), 'error')

        await owner_comm.disconnect()
        await member_comm.disconnect()
