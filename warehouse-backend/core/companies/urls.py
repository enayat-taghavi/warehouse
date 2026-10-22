from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CompanyViewSet, UserCompanyAccessViewSet, company_permission_sections

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='org-companies')
router.register(r'user-company-access', UserCompanyAccessViewSet, basename='org-user-company-access')

urlpatterns = [
    path('company-permission-sections/', company_permission_sections, name='company-permission-sections'),
] + router.urls
