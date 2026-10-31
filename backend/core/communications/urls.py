from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ConversationViewSet, MessageViewSet, GenericCommentViewSet, ChatContactsListView, ChatAttachmentDownloadView,
    ChatCapabilitiesView, ChatUserPolicyView, ChatCompanyPolicyView,
)

router = DefaultRouter()
router.register(r'conversations', ConversationViewSet, basename='conversation')
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'comments', GenericCommentViewSet, basename='comment')

urlpatterns = [
    path('', include(router.urls)),
    path('contacts/', ChatContactsListView.as_view(), name='chat_contacts'),
    path('capabilities/', ChatCapabilitiesView.as_view(), name='chat_capabilities'),
    path('policies/users/<int:user_id>/', ChatUserPolicyView.as_view(), name='chat_user_policy'),
    path('policies/companies/<int:company_id>/', ChatCompanyPolicyView.as_view(), name='chat_company_policy'),
    path('attachments/<int:pk>/download/', ChatAttachmentDownloadView.as_view(), name='chat_attachment_download'),
]
