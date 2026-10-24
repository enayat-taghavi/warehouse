"""
API مجوزهای ریز (طرح ۲.۲، الف۲): فهرست کامل، مجوزهای کاربر جاری، بستهٔ نقش انتساب و تفاوت‌های کاربر.
قرارداد دقیق در scratch/handoff_2.2_alef2.md؛ منطق و قواعد ت۱۰ در accounts/permission_admin.py.
"""
import hashlib
import json

from django.http import Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import permission_admin as pa
from ..scoped_permissions import user_permission_map


def _catalog_readers():
    from ..permissions import HasMenuAccess
    return [HasMenuAccess('view_sys_users') | HasMenuAccess('perm_usr_role')]


def permission_map_version(perm_map) -> str:
    """نسخهٔ پایدار نقشه (sha256 کوتاه روی JSON مرتب) تا فرانت بفهمد نسخهٔ آفلاینش کهنه شده است."""
    raw = json.dumps(perm_map, sort_keys=True, ensure_ascii=False, separators=(',', ':'), default=str)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]


def my_permissions_payload(user):
    perm_map = json.loads(json.dumps(user_permission_map(user)))  # کلیدهای عددی همان رشته‌های JSON
    return {**perm_map, 'version': permission_map_version(perm_map)}


class PermissionCatalogView(APIView):
    """
    GET /api/accounts/permission-catalog/
    هر کاربر واردشده دسته‌ها، مجوزها و نقش‌ها را می‌خواند (منوی هر دسته، ت۵، باید برای همه باز شود)؛
    بسته‌های نقش فقط برای مدیر کل سامانه یا خوانندهٔ صفحهٔ کاربران (view_sys_users / perm_usr_role) می‌آید.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        catalog = pa.permission_catalog()
        if not all(p.has_permission(request, self) for p in _catalog_readers()):
            catalog['bundles'] = {}
        return Response(catalog)


class MyPermissionsView(APIView):
    """GET /api/accounts/my-permissions/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(my_permissions_payload(request.user))


class RoleBundleView(APIView):
    """PUT /api/accounts/role-bundles/<role_key>/ با {"effective": [...]}؛ فقط مدیر کل سامانه."""
    permission_classes = [IsAuthenticated]

    def put(self, request, role_key):
        details = pa.set_role_bundle(request.user, role_key, request.data if hasattr(request.data, 'get') else {})
        return Response(pa.bundle_detail_json(role_key, details))


class RoleBundleResetView(APIView):
    """POST /api/accounts/role-bundles/<role_key>/reset/؛ فقط مدیر کل سامانه."""
    permission_classes = [IsAuthenticated]

    def post(self, request, role_key):
        details = pa.reset_role_bundle(request.user, role_key)
        return Response(pa.bundle_detail_json(role_key, details))


class UserPermissionsView(APIView):
    """GET/PUT /api/accounts/users/<id>/permissions/"""

    def get_permissions(self):
        return _catalog_readers()

    def _target(self, request, user_id):
        from ..models import CustomUser
        from ..scope import get_visible_users_for_user
        qs = CustomUser.objects.all() if request.user.is_superuser else get_visible_users_for_user(request.user)
        target = qs.filter(pk=user_id).first()
        if target is None:
            raise Http404
        return target

    def get(self, request, user_id):
        return Response(pa.user_permissions_detail(request.user, self._target(request, user_id)))

    def put(self, request, user_id):
        target = self._target(request, user_id)
        pa.set_user_overrides(request.user, target, request.data if hasattr(request.data, 'get') else {})
        from ..models import CustomUser
        return Response(pa.user_permissions_detail(request.user, CustomUser.objects.get(pk=target.pk)))


__all__ = [
    'PermissionCatalogView', 'MyPermissionsView', 'RoleBundleView', 'RoleBundleResetView',
    'UserPermissionsView', 'my_permissions_payload',
]
