"""
تست‌های واحد سیستم ارتباطات (Communications Unit Tests).
تست‌های یکپارچگی چندانباری و وب‌سوکت در integration_tests/communications قرار دارند.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from communications.models import Conversation, Message, GenericComment, ConversationType, ConversationParticipant
from communications.broadcast import broadcast_message_ws
from notifications.models import Notification

User = get_user_model()


class CommunicationsUnitTestCase(TestCase):
    def test_conversation_type_choices(self):
        self.assertEqual(ConversationType.DIRECT, 'direct')
        self.assertEqual(ConversationType.GROUP, 'group')
        self.assertEqual(ConversationType.ANNOUNCEMENT, 'announcement')

    def test_conversation_warehouse_property_without_warehouse(self):
        conv = Conversation(title="گفتگوی عمومی", warehouse_id=None)
        self.assertIsNone(conv.warehouse)

    def test_broadcast_message_creates_notifications_for_active_non_muted_participants(self):
        sender = User.objects.create_user(username='sender_user', password='password123')
        recipient1 = User.objects.create_user(username='recip1', password='password123')
        recipient2 = User.objects.create_user(username='recip2', password='password123')
        muted_user = User.objects.create_user(username='muted_user', password='password123')

        conv = Conversation.objects.create(title="گروه انبار", conv_type=ConversationType.GROUP)
        conv.participants.add(sender, recipient1, recipient2, muted_user)

        ConversationParticipant.objects.create(conversation=conv, user=muted_user, is_muted=True)

        msg = Message.objects.create(
            conversation=conv,
            sender=sender,
            text="سلام به همگی، بار جدید رسید",
            is_system=False
        )

        broadcast_message_ws(msg)

        notifs = Notification.objects.filter(target_model='Conversation', target_id=str(conv.id))
        recip_ids = set(notifs.values_list('recipient_id', flat=True))

        self.assertIn(recipient1.id, recip_ids)
        self.assertIn(recipient2.id, recip_ids)
        self.assertNotIn(sender.id, recip_ids)
        self.assertNotIn(muted_user.id, recip_ids)

        sample_notif = notifs.filter(recipient=recipient1).first()
        self.assertEqual(sample_notif.notification_type, 'chat_message')
        self.assertIn('گروه انبار', sample_notif.title)
        self.assertIn('سلام به همگی', sample_notif.message)

    def test_system_messages_do_not_create_chat_notifications(self):
        sender = User.objects.create_user(username='sys_sender', password='password123')
        recipient = User.objects.create_user(username='sys_recip', password='password123')

        conv = Conversation.objects.create(title="چت سیستم", conv_type=ConversationType.DIRECT)
        conv.participants.add(sender, recipient)

        msg = Message.objects.create(
            conversation=conv,
            sender=sender,
            text="پیام سیستمی بروزرسانی",
            is_system=True
        )

        broadcast_message_ws(msg)

        self.assertFalse(
            Notification.objects.filter(target_model='Conversation', target_id=str(conv.id)).exists()
        )
