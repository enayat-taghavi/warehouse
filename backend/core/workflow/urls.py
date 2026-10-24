"""مسیرهای API گردش کار (۲.۳-ب)، زیر api/workflow/."""
from django.urls import path

from . import views

urlpatterns = [
    path('tasks/', views.MyTasksView.as_view(), name='workflow-tasks'),
    path('tasks/count/', views.MyTasksCountView.as_view(), name='workflow-tasks-count'),
    path('tasks/unassigned/', views.UnassignedTasksView.as_view(), name='workflow-tasks-unassigned'),
    path('tasks/<int:task_id>/action/', views.TaskActionView.as_view(), name='workflow-task-action'),
    path('instances/<int:instance_id>/cancel/', views.InstanceCancelView.as_view(), name='workflow-instance-cancel'),
    path('history/', views.HistoryView.as_view(), name='workflow-history'),
    path('definitions/', views.DefinitionsView.as_view(), name='workflow-definitions'),
    path('thresholds/', views.ThresholdListView.as_view(), name='workflow-thresholds'),
    path('thresholds/<int:threshold_id>/', views.ThresholdDetailView.as_view(), name='workflow-threshold-detail'),
    path('settings/<int:company_id>/', views.CompanySettingsView.as_view(), name='workflow-company-settings'),
    path('substitutes/', views.SubstituteListView.as_view(), name='workflow-substitutes'),
    path('substitutes/candidates/', views.SubstituteCandidatesView.as_view(), name='workflow-substitute-candidates'),
    path('substitutes/<int:substitute_id>/', views.SubstituteDetailView.as_view(), name='workflow-substitute-detail'),
]
