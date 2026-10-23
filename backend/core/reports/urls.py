from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'templates', views.ReportTemplateViewSet, basename='report-template')

urlpatterns = [
    path('entities/', views.EntitiesView.as_view(), name='report-entities'),
    path('entities/<str:entity_key>/fields/', views.EntityFieldsView.as_view(), name='report-entity-fields'),
    path('run/', views.RunReportView.as_view(), name='report-run'),
    path('export/', views.ExportReportView.as_view(), name='report-export'),
    path('exports/', views.ExportJobListView.as_view(), name='report-export-jobs'),
    path('exports/<int:job_id>/', views.ExportJobDetailView.as_view(), name='report-export-job-detail'),
    path('exports/<int:job_id>/download/', views.ExportJobDownloadView.as_view(), name='report-export-job-download'),
    path('', include(router.urls)),
]
