"""
تنظیمات شرکت و ماژول (ص۱۱ طرح ۲.۶).

هر ماژول کلیدهایش را با contribute('company_settings', CompanySettingSpec(...)) اعلام می‌کند و هسته نام هیچ ماژولی
را نمی‌داند. API فقط کلید اعلام‌شده را می‌پذیرد، نوع مقدار را می‌سنجد و نوشتن را با مجوز اعلام‌شده در همان شرکت:
  GET   /api/settings/company/<company_id>/[?module=]   فهرست کلیدهای اعلام‌شده با مقدار فعلی یا پیش‌فرض
  PATCH /api/settings/company/<company_id>/             {module, key, value}
"""
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from platform_core.registry import contributions

from .models import CompanySetting

SETTING_TYPES = ('bool', 'int', 'float', 'str', 'list', 'dict', 'json')


@dataclass(frozen=True)
class CompanySettingSpec:
    module: str
    key: str
    default: Any
    type: str
    title_fa: str
    perm: str = ''  # مجوز نوشتن؛ خالی = فقط مدیر کل


def company_setting_specs() -> dict:
    """{(module, key): spec} از همهٔ اعلام‌های ماژول‌ها؛ اعلام بدشکل نادیده گرفته می‌شود."""
    out = {}
    for spec in contributions('company_settings'):
        if isinstance(spec, CompanySettingSpec) and spec.module and spec.key and spec.type in SETTING_TYPES:
            out[(spec.module, spec.key)] = spec
    return out


def value_matches_type(value, type_name) -> bool:
    if type_name == 'bool':
        return isinstance(value, bool)
    if type_name == 'int':
        return isinstance(value, int) and not isinstance(value, bool)
    if type_name == 'float':
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if type_name == 'str':
        return isinstance(value, str)
    if type_name == 'list':
        return isinstance(value, list)
    if type_name == 'dict':
        return isinstance(value, dict)
    return type_name == 'json'


def get_company_setting(company_id, module, key):
    """مقدار یک کلید برای کد ماژول‌ها: ردیف ذخیره‌شده یا پیش‌فرض اعلام‌شده (کلید اعلام‌نشده = None)."""
    spec = company_setting_specs().get((module, key))
    row = CompanySetting.objects.filter(company_id=company_id, module=module, key=key).values_list('value', flat=True)
    for value in row:
        return value
    return spec.default if spec else None


def can_write_company_setting(user, spec, company_id) -> bool:
    """مدیر کل فعال؛ وگرنه مجوز اعلام‌شده: سامانه‌ای از نقش کاربر، بخشی فقط اگر در همین شرکت داشته باشد."""
    if not getattr(user, 'is_active', False):
        return False
    if user.is_superuser:
        return True
    if not spec.perm:
        return False
    from accounts.scoped_permissions import SYSTEM, can, codes_in_company, permission_scope
    if permission_scope(spec.perm) == SYSTEM:
        return can(user, spec.perm)
    codename = spec.perm.split('.', 1)[-1]
    return codename in codes_in_company(user, company_id)


def _company_or_error(request, company_id):
    from companies.access import validate_user_company_access
    from companies.models import Company
    company = get_object_or_404(Company, pk=company_id)
    validate_user_company_access(request.user, company.pk)  # PermissionDenied → ۴۰۳
    return company


def _serialize(spec, stored, user, company_id):
    has_row = (spec.module, spec.key) in stored
    return {
        'module': spec.module, 'key': spec.key, 'type': spec.type, 'title_fa': spec.title_fa,
        'default': spec.default, 'value': stored[(spec.module, spec.key)] if has_row else spec.default,
        'is_default': not has_row, 'can_edit': can_write_company_setting(user, spec, company_id),
    }


class CompanySettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = _company_or_error(request, company_id)
        module = (request.query_params.get('module') or '').strip()
        specs = [s for s in company_setting_specs().values() if not module or s.module == module]
        stored = {(m, k): v for m, k, v in
                  CompanySetting.objects.filter(company=company).values_list('module', 'key', 'value')}
        items = [_serialize(s, stored, request.user, company.pk)
                 for s in sorted(specs, key=lambda s: (s.module, s.key))]
        return Response({'company_id': company.pk, 'results': items})

    def patch(self, request, company_id):
        company = _company_or_error(request, company_id)
        data = request.data if isinstance(request.data, dict) else {}
        spec = company_setting_specs().get((str(data.get('module') or ''), str(data.get('key') or '')))
        if spec is None:
            return Response({'detail': 'این کلید تنظیم اعلام نشده است.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'value' not in data:
            return Response({'detail': 'مقدار تنظیم الزامی است.'}, status=status.HTTP_400_BAD_REQUEST)
        value = data.get('value')
        if not value_matches_type(value, spec.type):
            return Response({'detail': 'نوع مقدار با این تنظیم جور نیست.'}, status=status.HTTP_400_BAD_REQUEST)
        if not can_write_company_setting(request.user, spec, company.pk):
            return Response({'detail': 'اجازهٔ تغییر این تنظیم را ندارید.'}, status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            CompanySetting.objects.update_or_create(
                company=company, module=spec.module, key=spec.key,
                defaults={'value': value, 'updated_by': request.user},
            )
        return Response(_serialize(spec, {(spec.module, spec.key): value}, request.user, company.pk))

    put = patch
