"""
تست‌های واحد سیستم ارتباطات (Communications Unit Tests).
تست‌های یکپارچگی چندانباری و وب‌سوکت در integration_tests/communications قرار دارند.
"""
from django.test import TestCase
from communications.models import Conversation, Message, GenericComment, ConversationType


class CommunicationsUnitTestCase(TestCase):
    def test_conversation_type_choices(self):
        self.assertEqual(ConversationType.DIRECT, 'direct')
        self.assertEqual(ConversationType.WAREHOUSE_GROUP, 'warehouse_group')
        self.assertEqual(ConversationType.ANNOUNCEMENT, 'announcement')

    def test_conversation_warehouse_property_without_warehouse(self):
        conv = Conversation(title="گفتگوی عمومی", warehouse_id=None)
        self.assertIsNone(conv.warehouse)
