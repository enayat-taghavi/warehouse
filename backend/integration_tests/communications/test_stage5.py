"""
آزمون‌های مرحلهٔ ۵ چت (E12، E21): خبر زندهٔ حذف پیام، مهلت ویرایش و نشانهٔ «ویرایش‌شده»،
پاسخ فقط به پیام همان گفتگو و مکان‌نمای before_id برای پیام‌های قدیمی‌تر
"""
from datetime import timedelta
from unittest import mock

from rest_framework import status

from communications.models import Message
from .base import BaseCommsTestCase

MSG_URL = '/api/communications/messages/'


def _items(data):
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def _layer():
    layer = mock.MagicMock()
    layer.group_send = mock.AsyncMock()
    return layer


def _sent(layer):
    return [(c.args[0], c.args[1].get('event'), c.args[1].get('data')) for c in layer.group_send.call_args_list]


def _age(msg, minutes):
    """جابه‌جایی زمان ساخت پیام به گذشته بدون دست زدن به auto_now"""
    past = msg.created_at - timedelta(minutes=minutes)
    Message.all_objects.filter(id=msg.id).update(created_at=past, updated_at=past)
    msg.refresh_from_db()
    return msg


class Stage5DeleteEventTests(BaseCommsTestCase):

    def test_delete_broadcasts_ids_only_to_readers(self):
        self.auth(self.manager_wh1)
        layer = _layer()
        with mock.patch('communications.broadcast.get_channel_layer', return_value=layer):
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.delete(f'{MSG_URL}{self.direct_message.id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        sent = _sent(layer)
        rooms = {room for room, event, _ in sent if event == 'chat.message.deleted'}
        self.assertEqual(rooms, {f'chat_user_{self.manager_wh1.id}', f'chat_user_{self.staff_wh1.id}'})
        data = sent[0][2]
        self.assertEqual(data, {'id': self.direct_message.id, 'conversation': str(self.direct_conv.id)})
        self.assertNotIn(f'chat_user_{self.staff_wh2.id}', rooms)
        self.assertTrue(Message.all_objects.get(id=self.direct_message.id).is_deleted)

    def test_forbidden_delete_sends_nothing(self):
        self.auth(self.staff_wh1)
        layer = _layer()
        with mock.patch('communications.broadcast.get_channel_layer', return_value=layer):
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.delete(f'{MSG_URL}{self.direct_message.id}/')
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.assertEqual(layer.group_send.call_count, 0)


class Stage5EditTests(BaseCommsTestCase):

    def test_fresh_message_not_edited_and_has_window(self):
        self.auth(self.manager_wh1)
        resp = self.client.get(f'{MSG_URL}{self.direct_message.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data['edited_at'])
        self.assertIsNotNone(resp.data['editable_until'])

    def test_edit_within_window_marks_edited(self):
        msg = _age(self.direct_message, 5)
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'{MSG_URL}{msg.id}/', {'text': 'متن تازه'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['text'], 'متن تازه')
        self.assertIsNotNone(resp.data['edited_at'])

    def test_edit_after_window_is_refused(self):
        msg = _age(self.direct_message, 16)
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'{MSG_URL}{msg.id}/', {'text': 'دیر'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        msg.refresh_from_db()
        self.assertNotEqual(msg.text, 'دیر')

    def test_unchanged_text_is_not_marked_edited(self):
        msg = _age(self.direct_message, 5)
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'{MSG_URL}{msg.id}/', {'text': msg.text}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data['edited_at'])

    def test_empty_text_without_attachment_refused(self):
        self.auth(self.manager_wh1)
        resp = self.client.patch(f'{MSG_URL}{self.direct_message.id}/', {'text': '  '}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_others_cannot_edit_even_superuser(self):
        for user in (self.staff_wh1, self.admin):
            self.auth(user)
            resp = self.client.patch(f'{MSG_URL}{self.direct_message.id}/', {'text': 'x'}, format='json')
            self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_edit_cannot_change_reply_to(self):
        other = Message.objects.create(conversation=self.direct_conv, sender=self.staff_wh1, text='دیگری')
        self.auth(self.manager_wh1)
        resp = self.client.patch(
            f'{MSG_URL}{self.direct_message.id}/', {'text': 'ت', 'reply_to': str(other.id)}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(Message.objects.get(id=self.direct_message.id).reply_to_id)


class Stage5ReplyTests(BaseCommsTestCase):

    def test_reply_in_same_conversation_has_preview(self):
        self.auth(self.staff_wh1)
        resp = self.client.post(MSG_URL, {
            'conversation': str(self.direct_conv.id), 'text': 'جواب', 'reply_to': str(self.direct_message.id)
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        details = resp.data['reply_to_details']
        self.assertEqual(details['id'], self.direct_message.id)
        self.assertFalse(details['deleted'])
        self.assertEqual(details['text'], self.direct_message.text)

    def test_reply_to_other_conversation_refused(self):
        foreign = Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text='گروه')
        self.auth(self.staff_wh1)
        resp = self.client.post(MSG_URL, {
            'conversation': str(self.direct_conv.id), 'text': 'جواب', 'reply_to': str(foreign.id)
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('reply_to', resp.data)

    def test_missing_and_foreign_reply_to_give_same_error(self):
        foreign = Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text='گروه')
        self.auth(self.staff_wh1)
        errors = []
        for target in (foreign.id, 99999999):
            resp = self.client.post(MSG_URL, {
                'conversation': str(self.direct_conv.id), 'text': 'جواب', 'reply_to': target
            }, format='json')
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
            errors.append([str(e) for e in resp.data['reply_to']])
        self.assertEqual(errors[0], errors[1])

    def test_deleted_reply_target_shows_deleted_without_text(self):
        reply = Message.objects.create(
            conversation=self.direct_conv, sender=self.staff_wh1, text='جواب', reply_to=self.direct_message
        )
        self.direct_message.soft_delete()
        self.auth(self.staff_wh1)
        resp = self.client.get(f'{MSG_URL}{reply.id}/')
        self.assertEqual(resp.data['reply_to_details'], {'id': self.direct_message.id, 'deleted': True})


class Stage5BeforeIdTests(BaseCommsTestCase):

    def setUp(self):
        super().setUp()
        self.msgs = [self.direct_message] + [
            Message.objects.create(conversation=self.direct_conv, sender=self.staff_wh1, text=f'پیام {i}')
            for i in range(5)
        ]
        # زمان‌های جدا تا ترتیب به دقت ساعت ویندوز وابسته نباشد
        base = self.direct_message.created_at - timedelta(minutes=10)
        for i, m in enumerate(self.msgs):
            Message.all_objects.filter(id=m.id).update(created_at=base + timedelta(seconds=i))

    def _ids(self, **params):
        self.auth(self.staff_wh1)
        resp = self.client.get(MSG_URL, {'conversation_id': str(self.direct_conv.id), **params})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return [str(m['id']) for m in _items(resp.data)]

    def test_before_id_returns_only_older(self):
        ids = self._ids(before_id=str(self.msgs[3].id), limit=10)
        self.assertEqual(ids, [str(m.id) for m in reversed(self.msgs[:3])])

    def test_before_id_pages_without_gaps(self):
        first = self._ids(limit=2)
        second = self._ids(limit=2, before_id=first[-1])
        third = self._ids(limit=2, before_id=second[-1])
        self.assertEqual(first + second + third, [str(m.id) for m in reversed(self.msgs)])

    def test_before_id_from_other_conversation_returns_nothing(self):
        foreign = Message.objects.create(conversation=self.wh1_group, sender=self.manager_wh1, text='گروه')
        self.assertEqual(self._ids(before_id=str(foreign.id)), [])
        self.assertEqual(self._ids(before_id='not-a-uuid'), [])

    def test_offset_still_works(self):
        self.assertEqual(len(self._ids(limit=2, offset=2)), 2)
