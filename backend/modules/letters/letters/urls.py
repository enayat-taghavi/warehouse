from django.urls import path

from . import views

app_name = 'letters'

urlpatterns = [
    path('', views.LetterListCreateView.as_view(), name='letter-list'),
    path('register/', views.SecretariatRegisterView.as_view(), name='letter-register'),
    path('register/export/', views.SecretariatRegisterExportView.as_view(), name='letter-register-export'),
    path('projects/', views.LetterProjectsView.as_view(), name='letter-projects'),
    path('link-kinds/', views.LinkKindsView.as_view(), name='letter-link-kinds'),
    path('parties/', views.PartiesView.as_view(), name='letter-parties'),
    path('<int:pk>/', views.LetterDetailView.as_view(), name='letter-detail'),
    path('<int:pk>/lock/', views.LetterLockView.as_view(), name='letter-lock'),
    path('<int:pk>/unlock/', views.LetterUnlockView.as_view(), name='letter-unlock'),
    path('<int:pk>/discard/', views.LetterDiscardView.as_view(), name='letter-discard'),
    # چرخهٔ نامه (ل-د)
    path('<int:pk>/submit/', views.LetterSubmitView.as_view(), name='letter-submit'),
    path('<int:pk>/sign/', views.LetterSignView.as_view(), name='letter-sign'),
    path('<int:pk>/return/', views.LetterReturnView.as_view(), name='letter-return'),
    path('<int:pk>/register/', views.LetterRegisterView.as_view(), name='letter-register-one'),
    path('<int:pk>/send/', views.LetterSendView.as_view(), name='letter-send'),
    path('<int:pk>/archive/', views.LetterArchiveView.as_view(), name='letter-archive'),
    path('<int:pk>/unarchive/', views.LetterUnarchiveView.as_view(), name='letter-unarchive'),
    path('<int:pk>/void/', views.LetterVoidView.as_view(), name='letter-void'),
    # ارجاع، بخشنامه و «چه کسی دید» (ل-ه)
    path('circulars/', views.CircularListView.as_view(), name='letter-circulars'),
    path('<int:pk>/refer/', views.LetterReferView.as_view(), name='letter-refer'),
    path('<int:pk>/referrals/', views.LetterReferralsView.as_view(), name='letter-referrals'),
    path('<int:pk>/audience/', views.LetterAudienceView.as_view(), name='letter-audience'),
    path('<int:pk>/viewers/', views.LetterViewersView.as_view(), name='letter-viewers'),
]
