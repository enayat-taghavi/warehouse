from django.urls import path

from .views import AttachmentDetailView, AttachmentDownloadView, AttachmentListCreateView, AttachmentReplaceView

urlpatterns = [
    path('', AttachmentListCreateView.as_view(), name='attachment-list'),
    path('<int:pk>/', AttachmentDetailView.as_view(), name='attachment-detail'),
    path('<int:pk>/replace/', AttachmentReplaceView.as_view(), name='attachment-replace'),
    path('<int:pk>/download/', AttachmentDownloadView.as_view(), name='attachment-download'),
]
