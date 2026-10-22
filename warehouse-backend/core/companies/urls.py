from django.urls import path
from rest_framework.routers import DefaultRouter

from .org_views import ProjectSectionViewSet, ProjectViewSet, SectionAssignmentViewSet
from .views import CompanyViewSet, UserCompanyAccessViewSet, company_permission_sections

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='org-companies')
router.register(r'user-company-access', UserCompanyAccessViewSet, basename='org-user-company-access')
# پروژه، بخش و انتساب کاربر به بخش (طرح Project_Section_To_Core، گام ۲)
router.register(r'projects', ProjectViewSet, basename='org-projects')
router.register(r'project-sections', ProjectSectionViewSet, basename='org-project-sections')
router.register(r'section-assignments', SectionAssignmentViewSet, basename='org-section-assignments')

urlpatterns = [
    path('company-permission-sections/', company_permission_sections, name='company-permission-sections'),
] + router.urls
