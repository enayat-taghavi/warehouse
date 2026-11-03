from django.urls import path

from . import views

app_name = 'letters'

urlpatterns = [
    path('', views.LetterListCreateView.as_view(), name='letter-list'),
    path('register/', views.SecretariatRegisterView.as_view(), name='letter-register'),
    path('projects/', views.LetterProjectsView.as_view(), name='letter-projects'),
    path('link-kinds/', views.LinkKindsView.as_view(), name='letter-link-kinds'),
    path('parties/', views.PartiesView.as_view(), name='letter-parties'),
    path('<int:pk>/', views.LetterDetailView.as_view(), name='letter-detail'),
    path('<int:pk>/lock/', views.LetterLockView.as_view(), name='letter-lock'),
    path('<int:pk>/unlock/', views.LetterUnlockView.as_view(), name='letter-unlock'),
    path('<int:pk>/discard/', views.LetterDiscardView.as_view(), name='letter-discard'),
]
