from rest_framework.routers import DefaultRouter

from .views import CompanyViewSet, UserCompanyAccessViewSet

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='org-companies')
router.register(r'user-company-access', UserCompanyAccessViewSet, basename='org-user-company-access')

urlpatterns = router.urls
