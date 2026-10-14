from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ConversationViewSet, MessageViewSet, GenericCommentViewSet, ChatContactsListView

router = DefaultRouter()
router.register(r'conversations', ConversationViewSet, basename='conversation')
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'comments', GenericCommentViewSet, basename='comment')

urlpatterns = [
    path('', include(router.urls)),
    path('contacts/', ChatContactsListView.as_view(), name='chat_contacts'),
]
