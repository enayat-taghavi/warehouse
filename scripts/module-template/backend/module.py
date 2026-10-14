"""
مشخصات ماژول __MODULE_TITLE_FA__ (__MODULE_CODE__) — مانیفست رسمی ماژول بک‌اند
"""
from platform_core.registry import ModuleSpec

__MODULE_UPPER___SPEC = ModuleSpec(
    code='__MODULE_CODE__',
    title_fa='__MODULE_TITLE_FA__',
    django_apps=('__MODULE_CODE__.apps.__MODULE_PASCAL__Config',),
    api_prefixes=('api/__MODULE_CODE__/',),
    permission_markers=(
        'accounts.view_sys___MODULE_CODE__',
    ),
    roles=('operator', 'supervisor', 'manager'),
    url_includes=(
        ('api/__MODULE_CODE__/', '__MODULE_CODE__.urls'),
    ),
    audit_modules=(
        ('__MODULE_CODE__', '__MODULE_TITLE_FA__'),
    ),
    sod_app_module='__MODULE_CODE__',
)

MODULE_SPEC = __MODULE_UPPER___SPEC
SPEC = __MODULE_UPPER___SPEC

__MODULE_UPPER___PERMISSION_CODENAMES = (
    'view_sys___MODULE_CODE__',
)

PERMISSION_CODENAMES = __MODULE_UPPER___PERMISSION_CODENAMES
