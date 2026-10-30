"""
آزمون‌های مرحلهٔ ۴ چت: گیرندگان اطلاعیه (E3)، شمارندهٔ نخوانده (E4)، حضور با شمارش اتصال (E10)،
نشانگر خواندن یکنواخت (E11)، یکتایی گفتگوی دو‌نفره (E13)، can_post (E14)، جمع‌سازی اعلان (E15)،
هماهنگی دستگاه‌های خود کاربر (E26) و وضعیت خواندن اعضا (U8)
"""
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status

from communications import presence
from communications.access import effective_reader_ids
from communications.broadcast import broadcast_message_ws, broadcast_read_receipt_ws
from communications.models import Conversation, ConversationParticipant, ConversationType, Message
from notifications.models import Notification
from .base import BaseCommsTestCase, User

CONV_URL = '/api/communications/conversations/'


def _items(data):
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def _layer():
    layer = mock.MagicMock()
    layer.group_send = mock.AsyncMock()
    return layer


def _sent(layer):
    """(room, event, data) هر group_send"""
    return [(c.args[0], c.args[1].get('event'), c.args[1].get('data')) for c in layer.group_send.call_args_list]


class Stage4Tests(BaseCommsTestCase):

    def setUp(self):
        super().setUp()
        self.wh1_announcement = Conversation.objects.create(
            title='اطلاعیهٔ انبار ۱', conv_type=ConversationType.ANNOUNCEMENT,
            warehouse=self.wh1, created_by=self.manager_wh1
        )
        self.wh1_announcement.participants.add(self.manager_wh1)

    def _broadcast(self, msg):
        layer = _layer()
        with mock.patch('communications.broadcast.get_channel_layer', return_value=layer):
            broadcast_message_ws(msg)
        return layer

    # ─── E3: گیرندگان اطلاعیه ───
    def test_warehouse_announcement_reaches_every_eligible_reader(self):
        ids = effective_reader_ids(self.wh1_announcement)
        self.assertTrue({self.manager_wh1.id, self.staff_wh1.id, self.unassigned_user.id, self.admin.id} <= ids)
        self.assertNotIn(self.staff_wh2.id, ids)

        msg = Message.objects.create(conversation=self.wh1_announcement, sender=self.manager_wh1, text='جلسه')
        rooms = {room for room, event, _ in _sent(self._broadcast(msg)) if event == 'chat.message.new'}
        self.assertIn(f'chat_user_{self.staff_wh1.id}', rooms)
        self.assertNotIn(f'chat_user_{self.staff_wh2.id}', rooms)
        notified = set(Notification.objects.filter(target_id=str(self.wh1_announcement.id)).values_list('recipient_id', flat=True))
        self.assertIn(self.staff_wh1.id, notified)
        self.assertNotIn(self.staff_wh2.id, notified)
        self.assertNotIn(self.manager_wh1.id, notified)

    def test_global_announcement_reaches_all_active_users(self):
        self.staff_wh1.is_active = False
        self.staff_wh1.save(update_fields=['is_active'])
        ids = effective_reader_ids(self.announcement)
        self.assertIn(self.staff_wh2.id, ids)
        self.assertNotIn(self.staff_wh1.id, ids)

    # ─── E4: شمارندهٔ نخوانده برای خوانندهٔ ضمنی ───
    def test_implicit_reader_unread_counts_from_date_joined(self):
        old = Message.objects.create(conversation=self.announcement, sender=self.admin, text='قدیمی')
        Message.objects.filter(id=old.id).update(created_at=self.staff_wh1.date_joined - timedelta(days=30))
        Message.objects.create(conversation=self.announcement, sender=self.admin, text='تازه')
        self.auth(self.staff_wh1)
        listed = {str(c['id']): c for c in _items(self.client.get(CONV_URL).data)}
        self.assertEqual(listed[str(self.announcement.id)]['unread_count'], 1)
        self.client.post(f'{CONV_URL}{self.announcement.id}/mark-read/')
        listed = {str(c['id']): c for c in _items(self.client.get(CONV_URL).data)}
        self.assertEqual(listed[str(self.announcement.id)]['unread_count'], 0)
        # خوانندهٔ ضمنی با mark-read عضو صریح نمی‌شود
        self.assertFalse(self.announcement.participants.filter(id=self.staff_wh1.id).exists())

    # ─── E10: حضور با شمارش اتصال ───
    def test_presence_counts_connections(self):
        cache.clear()
        uid = self.staff_wh1.id
        self.assertEqual(presence.connect_user_sync(uid), 1)
        self.assertEqual(presence.connect_user_sync(uid), 2)
        self.assertEqual(presence.disconnect_user_sync(uid), 1)
        self.assertIn(uid, presence.get_online_users_sync())
        presence.touch_online_user_sync(uid)  # ping شمارنده را بالا نمی‌برد
        self.assertEqual(presence.disconnect_user_sync(uid), 0)
        self.assertNotIn(uid, presence.get_online_users_sync())
        # بستن اضافه شمارنده را منفی نمی‌کند
        self.assertEqual(presence.disconnect_user_sync(uid), 0)
        self.assertEqual(presence.connect_user_sync(uid), 1)
        self.assertIn(uid, presence.get_online_users_sync())

    # ─── E11: نشانگر خواندن یکنواخت و رسید با شناسهٔ پیام ───
    def test_mark_read_never_moves_backwards(self):
        m1 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text='۱')
        m2 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text='۲')
        self.auth(self.staff_wh1)
        layer = _layer()
        with mock.patch('communications.broadcast.get_channel_layer', return_value=layer):
            resp = self.client.post(f'{CONV_URL}{self.direct_conv.id}/mark-read/', {'until_message_id': m2.id}, format='json')
            self.assertEqual(resp.data['last_read_message_id'], str(m2.id))
            resp = self.client.post(f'{CONV_URL}{self.direct_conv.id}/mark-read/', {'until_message_id': m1.id}, format='json')
        self.assertEqual(resp.data['last_read_message_id'], str(m2.id))
        rec = ConversationParticipant.objects.get(conversation=self.direct_conv, user=self.staff_wh1)
        self.assertEqual(rec.last_read_message_id, m2.id)
        receipts = [(room, data) for room, event, data in _sent(layer) if event == 'chat.read_receipt']
        # فقط پیشروی رسید می‌فرستد؛ به فرستنده و دستگاه‌های دیگر خود خواننده (E26)
        self.assertEqual({room for room, _ in receipts},
                         {f'chat_user_{self.manager_wh1.id}', f'chat_user_{self.staff_wh1.id}'})
        self.assertTrue(all(d['last_read_message_id'] == str(m2.id) and d['reader_id'] == self.staff_wh1.id
                            for _, d in receipts))

    # ─── E13: گفتگوی دو‌نفره ───
    def test_direct_requires_active_target_and_dedups(self):
        self.auth(self.staff_wh1)
        self.assertEqual(self.client.post(CONV_URL, {'conv_type': 'direct'}, format='json').status_code,
                         status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(CONV_URL, {'conv_type': 'direct', 'target_user_id': self.staff_wh1.id},
                                          format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.unassigned_user.is_active = False
        self.unassigned_user.save(update_fields=['is_active'])
        self.assertEqual(self.client.post(CONV_URL, {'conv_type': 'direct', 'target_user_id': self.unassigned_user.id},
                                          format='json').status_code, status.HTTP_400_BAD_REQUEST)

        first = self.client.post(CONV_URL, {'conv_type': 'direct', 'target_user_id': self.staff_wh2.id}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(first.data['participants']), {self.staff_wh1.id, self.staff_wh2.id})
        again = self.client.post(CONV_URL, {'conv_type': 'direct', 'target_user_id': self.staff_wh2.id}, format='json')
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.data['id'], first.data['id'])
        self.auth(self.staff_wh2)
        reverse = self.client.post(CONV_URL, {'conv_type': 'direct', 'target_user_id': self.staff_wh1.id}, format='json')
        self.assertEqual(reverse.data['id'], first.data['id'])
        self.assertEqual(Conversation.objects.filter(conv_type=ConversationType.DIRECT, participants=self.staff_wh2).count(), 1)

    # ─── E14: can_post برابر قاعدهٔ سرور ───
    def test_can_post_matches_server_rule(self):
        self.auth(self.staff_wh1)
        detail = self.client.get(f'{CONV_URL}{self.announcement.id}/')
        self.assertFalse(detail.data['can_post'])
        resp = self.client.post('/api/communications/messages/', {
            'conversation': str(self.announcement.id), 'text': 'x'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(self.client.get(f'{CONV_URL}{self.direct_conv.id}/').data['can_post'])
        self.auth(self.admin)
        self.assertTrue(self.client.get(f'{CONV_URL}{self.announcement.id}/').data['can_post'])

    # ─── E15: جمع‌سازی اعلان و بی‌صدا ───
    def test_notifications_are_batched_per_conversation(self):
        for text in ('یک', 'دو', 'سه'):
            self._broadcast(Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text=text))
        notifs = Notification.objects.filter(recipient=self.staff_wh1, target_id=str(self.direct_conv.id))
        self.assertEqual(notifs.count(), 1)
        self.assertTrue(notifs.first().message.startswith('3 '))
        notifs.update(is_read=True)
        self._broadcast(Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text='چهار'))
        self.assertEqual(notifs.count(), 2)

    def test_muted_member_gets_no_notification(self):
        ConversationParticipant.objects.update_or_create(
            conversation=self.direct_conv, user=self.staff_wh1, defaults={'is_muted': True})
        self._broadcast(Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text='x'))
        self.assertFalse(Notification.objects.filter(recipient=self.staff_wh1).exists())

    # ─── E26: نسخهٔ فرستنده ───
    def test_sender_own_room_gets_copy_without_notification(self):
        msg = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text='x', client_temp_id='t1')
        sent = _sent(self._broadcast(msg))
        own = [d for room, event, d in sent if room == f'chat_user_{self.manager_wh1.id}' and event == 'chat.message.new']
        other = [d for room, event, d in sent if room == f'chat_user_{self.staff_wh1.id}' and event == 'chat.message.new']
        self.assertEqual(len(own), 1)
        self.assertTrue(own[0]['is_me'])
        self.assertFalse(other[0]['is_me'])
        self.assertFalse(Notification.objects.filter(recipient=self.manager_wh1).exists())

    def test_left_sender_gets_no_own_copy(self):
        from communications.membership import remove_member
        remove_member(self.wh1_group, self.staff_wh1)
        msg = Message.objects.create(conversation=self.wh1_group, sender=self.staff_wh1, text='خروج', is_system=True)
        rooms = {room for room, _, _ in _sent(self._broadcast(msg))}
        self.assertNotIn(f'chat_user_{self.staff_wh1.id}', rooms)

    # ─── U8: وضعیت خواندن اعضا ───
    def test_read_status_members_only(self):
        m1 = Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text='۱')
        self.auth(self.staff_wh1)
        self.client.post(f'{CONV_URL}{self.wh1_group.id}/mark-read/', {'until_message_id': m1.id}, format='json')
        resp = self.client.get(f'{CONV_URL}{self.wh1_group.id}/read_status/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        by_user = {m['user_id']: m for m in resp.data['members']}
        self.assertEqual(set(by_user), {self.manager_wh1.id, self.staff_wh1.id})
        self.assertEqual(by_user[self.staff_wh1.id]['last_read_message_id'], str(m1.id))

        for outsider in (self.staff_wh2, self.admin):
            self.auth(outsider)
            self.assertEqual(self.client.get(f'{CONV_URL}{self.direct_conv.id}/read_status/').status_code,
                             status.HTTP_403_FORBIDDEN)
        self.auth(self.staff_wh1)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.announcement.id}/read_status/').status_code,
                         status.HTTP_403_FORBIDDEN)
        self.auth(self.admin)
        self.assertEqual(self.client.get(f'{CONV_URL}{self.announcement.id}/read_status/').status_code,
                         status.HTTP_200_OK)
        # مدیر غیرسوپرکاربرِ اطلاعیه فقط تعداد خوانندگان را می‌بیند، نه نام‌ها
        Message.objects.create(conversation=self.wh1_announcement, sender=self.manager_wh1, text='الف')
        self.auth(self.staff_wh1)
        self.client.post(f'{CONV_URL}{self.wh1_announcement.id}/mark-read/')
        self.auth(self.manager_wh1)
        resp = self.client.get(f'{CONV_URL}{self.wh1_announcement.id}/read_status/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['read_count'], 1)
        self.assertEqual(resp.data['members'], [])
