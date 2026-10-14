from django.contrib.admin.sites import site
from django.test import RequestFactory
from communications.models import (
    Conversation, ConversationParticipant, Message,
    MessageAttachment, GenericComment
)
from communications.admin import (
    ConversationAdmin, ConversationParticipantAdmin,
    MessageAdmin, MessageAttachmentAdmin, GenericCommentAdmin
)
from communications.tests.base import BaseCommsTestCase


class AdminSecurityTestCase(BaseCommsTestCase):
    def setUp(self):
        super().setUp()
        self.factory = RequestFactory()

    def test_staff_cannot_add_or_delete_conversations_in_admin(self):
        conv_admin = ConversationAdmin(Conversation, site)
        req = self.factory.get('/admin/')
        req.user = self.manager_wh1

        self.assertFalse(conv_admin.has_add_permission(req))
        self.assertFalse(conv_admin.has_change_permission(req, self.wh1_group))
        self.assertFalse(conv_admin.has_delete_permission(req, self.wh1_group))

    def test_staff_cannot_delete_attachments_in_admin(self):
        att_admin = MessageAttachmentAdmin(MessageAttachment, site)
        req = self.factory.get('/admin/')
        req.user = self.manager_wh1

        self.assertFalse(att_admin.has_add_permission(req))
        self.assertFalse(att_admin.has_change_permission(req))
        self.assertFalse(att_admin.has_delete_permission(req))

    def test_staff_cannot_edit_or_delete_messages_in_admin(self):
        msg_admin = MessageAdmin(Message, site)
        req = self.factory.get('/admin/')
        req.user = self.manager_wh1

        self.assertFalse(msg_admin.has_add_permission(req))
        self.assertFalse(msg_admin.has_change_permission(req, self.direct_message))
        self.assertFalse(msg_admin.has_delete_permission(req, self.direct_message))

    def test_superuser_retains_admin_override(self):
        conv_admin = ConversationAdmin(Conversation, site)
        att_admin = MessageAttachmentAdmin(MessageAttachment, site)
        req = self.factory.get('/admin/')
        req.user = self.admin

        self.assertTrue(conv_admin.has_add_permission(req))
        self.assertTrue(conv_admin.has_delete_permission(req, self.wh1_group))
        self.assertTrue(att_admin.has_delete_permission(req))
