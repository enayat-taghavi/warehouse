"""
تعاریف هستهٔ گزارش‌ساز عام و قراردادهای رجیستری — فاز ۵ طرح جداسازی.
مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۵

این ماژول کاملاً مستقل از دامنه‌های انبارداری یا حسابداری است (پاکی هسته C3).
هیچ مدلی را سخت‌کد نمی‌کند و هر ماژول موجودیت‌ها و JOINهای خود را به این رجیستری ثبت می‌کند.
"""
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Set, Tuple
import re

from django.db.models import Count, DateField, DecimalField, F, Value
from django.db.models.functions import Cast, Concat

# ---------------------------------------------------------------------------
# اپراتورهای مجاز به تفکیک نوع فیلد (سمت سرور enforce می‌شود؛ متادیتا هم
# همین را به UI می‌دهد تا کنترل مناسب رندر شود) — بدون تغییر (تسک ۴۷)
# ---------------------------------------------------------------------------
OPERATORS_BY_TYPE: Dict[str, List[str]] = {
    'text':     ['eq', 'icontains', 'istartswith', 'in', 'isnull'],
    'number':   ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'isnull'],
    'date':     ['eq', 'gte', 'lte', 'between', 'isnull'],
    'datetime': ['eq', 'gte', 'lte', 'between', 'isnull'],
    'boolean':  ['eq'],
    'choice':   ['eq', 'in'],
}

AGG_FUNCTIONS: Tuple[str, ...] = ('count', 'sum', 'avg', 'min', 'max')

# کاربرانی با یکی از این مجوزها اجازه دیدن فیلدهای حساس را دارند — بدون تغییر (تسک ۴۷)
SENSITIVE_BYPASS_PERMS: Tuple[str, ...] = ('view_sys_manager_review',)


# ---------------------------------------------------------------------------
# JoinDef — تعریف یک JOIN مجاز از یک موجودیت پایه به مقصد (reverse FK)
# تعمیم‌یافته به scope_path برای پشتیبانی از ابعاد مختلف (تسک ۴۵)
# ---------------------------------------------------------------------------
class JoinDef:
    """
    تعریف یک JOIN مجاز از یک موجودیت پایه به مقصد.

    در فاز ۵ (تسک ۴۵)، فیلد `warehouse_path` به `scope_path` تعمیم داده شد تا
    هر ماژول بتواند بُعد قلمروبندی خود را اعلام کند (انبار: `warehouse_id`،
    حسابداری: `project_id`/`section_id`). سازگاری رو به عقب با `warehouse_path`
    حفظ شده است.
    """
    def __init__(
        self,
        target: str,
        label: str,
        path: str,
        cardinality: str,
        scope_path: Optional[str] = None,
        warehouse_path: Optional[str] = None,
        path_to_base: str = '',
        allowed_types: Tuple[str, ...] = ('left', 'inner'),
        scope_kind: str = 'warehouse',
    ):
        self.target = target
        self.label = label
        self.path = path
        self.cardinality = cardinality
        self.scope_path = scope_path if scope_path is not None else (warehouse_path or '')
        self.path_to_base = path_to_base
        self.allowed_types = tuple(allowed_types)
        self.scope_kind = scope_kind

    @property
    def warehouse_path(self) -> str:
        """سازگاری رو به عقب برای کدهایی که warehouse_path می‌خوانند."""
        return self.scope_path

    def __repr__(self):
        return f"<JoinDef target={self.target!r} path={self.path!r} scope_path={self.scope_path!r}>"


# ---------------------------------------------------------------------------
# FieldDef — تعریف متادیتای یک فیلد مجاز در گزارش‌ساز
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class FieldDef:
    key: str                      # کلید سمت کلاینت (مثلاً warehouse__name یا section__title)
    source: str                   # مسیر ORM؛ برای annotationها برابر alias (== key)
    label: str                    # برچسب فارسی
    type: str                     # text | number | boolean | date | datetime | choice
    choices: Optional[tuple] = None
    sensitive: bool = False
    groupable: bool = True
    aggregatable: bool = False    # فقط عددی‌ها برای sum/avg/min/max
    # سازنده تنبل expression برای فیلدهای پویا/محاسباتی — None یعنی فیلد مستقیم
    annotation: Optional[Callable] = None

    @property
    def operators(self):
        return OPERATORS_BY_TYPE.get(self.type, [])


def _map_model_field(f):
    """نگاشت نوع فیلد جنگو به نوع گزارش‌ساز؛ None یعنی قابل استفاده نیست."""
    if getattr(f, 'choices', None):
        return 'choice'
    internal = f.get_internal_type()
    if internal in ('CharField', 'TextField', 'EmailField', 'SlugField'):
        return 'text'
    if internal in ('IntegerField', 'BigIntegerField', 'SmallIntegerField',
                    'PositiveIntegerField', 'PositiveSmallIntegerField',
                    'PositiveBigIntegerField', 'DecimalField', 'FloatField',
                    'AutoField', 'BigAutoField'):
        return 'number'
    if internal == 'DateField':
        return 'date'
    if internal == 'DateTimeField':
        return 'datetime'
    if internal == 'BooleanField':
        return 'boolean'
    return None


COMMON_FIELD_LABELS = {
    'id': 'شناسه',
    'created_at': 'تاریخ ایجاد',
    'updated_at': 'تاریخ ویرایش',
    'created_by': 'ایجادکننده',
    'modified_by': 'ویرایش‌کننده',
    'username': 'نام کاربری',
    'first_name': 'نام',
    'last_name': 'نام خانوادگی',
    'phone_number': 'شماره تلفن',
    'operational_zone': 'منطقه عملیاتی',
    'is_active': 'وضعیت فعال',
    'date_joined': 'تاریخ عضویت',
    'assigned_warehouses_count': 'تعداد انبارهای مجاز',
    'status': 'وضعیت',
    'action_type': 'نوع اقدام',
    'note': 'توضیحات',
    'file_name': 'نام فایل',
    'date_shamsi': 'تاریخ شمسی',
    'effective_hours': 'ساعت کارکرد موثر',
    'overtime_hours': 'اضافه‌کار',
    'amount': 'مبلغ',
}


def _clean_persian_label(name: str, label: str) -> str:
    if not label or label.lower() == name.lower() or label == 'ID':
        return COMMON_FIELD_LABELS.get(name, label or name)
    cleaned = re.sub(r'\s*\([A-Za-z0-9_\-\s]+\)', '', label).strip()
    return cleaned or COMMON_FIELD_LABELS.get(name, label)


def _auto_fields(model, exclude=(), include=None, sensitive_keys=()):
    """
    تولید خودکار FieldDef از فیلدهای مستقیم مدل.
    قاعده ضد ضرب دکارتی: `model._meta.fields` شامل M2M نیست.
    """
    out = {}
    for f in model._meta.fields:
        if include is not None and f.name not in include:
            continue
        if f.name in exclude:
            continue
        ftype = _map_model_field(f)
        if ftype is None:
            continue
        raw_label = str(getattr(f, 'verbose_name', '') or f.name)
        label = _clean_persian_label(f.name, raw_label)
        choices = tuple(c[0] for c in f.choices) if getattr(f, 'choices', None) else None
        out[f.name] = FieldDef(
            key=f.name, source=f.name, label=label, type=ftype,
            choices=choices,
            sensitive=(f.name in sensitive_keys),
            aggregatable=(ftype == 'number' and f.name != 'id'),
        )
    return out


def _person_name_annotation(prefix):
    """نام کامل شخص از روی FK کاربر."""
    def factory(base_prefix=None):
        p = f'{base_prefix}__{prefix}' if base_prefix else prefix
        return Concat(
            F(f'{p}__first_name'), Value(' '), F(f'{p}__last_name'),
        )
    return factory


# ---------------------------------------------------------------------------
# EntityConfig — پیکربندی یک موجودیت گزارش‌پذیر
# ---------------------------------------------------------------------------
class EntityConfig:
    def __init__(
        self,
        key: str,
        label: str,
        model,
        permissions: Tuple[str, ...],
        scope_path: Optional[str] = None,
        warehouse_path: Optional[str] = None,
        scope_kind: str = 'warehouse',
        exclude=(),
        include=None,
        related=None,
        extra=None,
        select_related=(),
        blind_sensitive=(),
        module_code: str = 'warehouse',
        dynamic_fields_factory: Optional[Callable] = None,
        sensitive_keys_resolver: Optional[Callable] = None,
    ):
        self.key = key
        self.label = label
        self.model = model
        self.permissions = tuple(permissions)
        self.scope_path = scope_path if scope_path is not None else warehouse_path
        self.scope_kind = scope_kind
        self.exclude = tuple(exclude)
        self.include = include
        self.related = related or {}
        self.extra = extra or {}
        self.select_related = tuple(select_related)
        self.blind_sensitive = tuple(blind_sensitive)
        self.module_code = module_code
        self.dynamic_fields_factory = dynamic_fields_factory
        self.sensitive_keys_resolver = sensitive_keys_resolver

    @property
    def warehouse_path(self) -> Optional[str]:
        """سازگاری رو به عقب."""
        return self.scope_path

    def user_has_access(self, user) -> bool:
        if user.is_superuser:
            return True
        return any(user.has_perm(f'accounts.{c}') for c in self.permissions)

    def base_queryset(self):
        qs = self.model.objects.all()
        if self.select_related:
            qs = qs.select_related(*self.select_related)
        return qs

    def get_fields(self, scope_id=None, warehouse_id=None) -> Dict[str, FieldDef]:
        """همه FieldDefهای این موجودیت با اعمال پرچم‌های فیلد حساس."""
        target_scope = scope_id if scope_id is not None else warehouse_id
        sensitive_keys: Set[str] = set()

        if self.sensitive_keys_resolver:
            sensitive_keys.update(self.sensitive_keys_resolver(target_scope))
        elif self.blind_sensitive:
            from settings_core.services import get_setting
            from settings_core.models import SystemSetting
            if target_scope and self.scope_kind == 'warehouse':
                is_blind = get_setting('blind_counting', target_scope) == 'blind'
            else:
                is_blind = (
                    get_setting('blind_counting', None) == 'blind'
                    or SystemSetting.objects.filter(key='blind_counting', value='blind').exists()
                )
            if is_blind:
                sensitive_keys.update(self.blind_sensitive)

        fields = _auto_fields(
            self.model, exclude=self.exclude, include=self.include,
            sensitive_keys=sensitive_keys,
        )
        fields.update(self.related)
        fields.update(self.extra)

        if self.dynamic_fields_factory and target_scope:
            fields.update(self.dynamic_fields_factory(target_scope))

        out = {}
        for k, fd in fields.items():
            if k in sensitive_keys and not fd.sensitive:
                fd = FieldDef(
                    key=fd.key, source=fd.source, label=fd.label, type=fd.type,
                    choices=fd.choices, sensitive=True, groupable=fd.groupable,
                    aggregatable=fd.aggregatable, annotation=fd.annotation,
                )
            out[k] = fd
        return out

    def allowed_fields(self, user, scope_id=None, warehouse_id=None) -> Dict[str, FieldDef]:
        """فیلدهای مجاز برای کاربر جاری."""
        fields = self.get_fields(scope_id=scope_id, warehouse_id=warehouse_id)
        if user.is_superuser or any(
            user.has_perm(f'accounts.{p}') for p in SENSITIVE_BYPASS_PERMS
        ):
            return fields
        return {k: fd for k, fd in fields.items() if not fd.sensitive}


# ---------------------------------------------------------------------------
# رجیستری مرکزی گزارش‌ساز در platform_core
# ---------------------------------------------------------------------------
_ENTITIES: Dict[str, EntityConfig] = {}
_JOINS: Dict[str, Dict[str, JoinDef]] = {}
_REPORTING_MODULES: Set[str] = set()


def register_entity(config: EntityConfig, module_code: str = 'warehouse') -> None:
    """ثبت یک موجودیت در رجیستری گزارش‌ساز."""
    _ENTITIES[config.key] = config
    _REPORTING_MODULES.add(module_code)


def register_joins(entity_key: str, joins: Dict[str, JoinDef], module_code: str = 'warehouse') -> None:
    """ثبت روابط JOIN مجاز برای یک موجودیت."""
    if entity_key not in _JOINS:
        _JOINS[entity_key] = {}
    _JOINS[entity_key].update(joins)
    _REPORTING_MODULES.add(module_code)


def get_entity(key: str) -> Optional[EntityConfig]:
    """دریافت تنظیمات یک موجودیت از روی کلید."""
    return _ENTITIES.get(key)


def get_all_entities() -> Dict[str, EntityConfig]:
    """دریافت همه موجودیت‌های ثبت‌شده."""
    return dict(_ENTITIES)


def get_joins_for_entity(entity_key: str) -> Dict[str, JoinDef]:
    """دریافت JOINهای مجاز یک موجودیت."""
    return dict(_JOINS.get(entity_key, {}))


def get_all_joins() -> Dict[str, Dict[str, JoinDef]]:
    """دریافت کل دیکشنری JOINها."""
    return {k: dict(v) for k, v in _JOINS.items()}


def get_reporting_modules() -> Tuple[str, ...]:
    """فهرست ماژول‌هایی که قابلیت گزارش‌دهی یا JOIN ثبت کرده‌اند (تسک ۴۶)."""
    return tuple(_REPORTING_MODULES)


def clear_registry() -> None:
    """پاک‌سازی رجیستری (مفید برای ریست و تست‌ها)."""
    _ENTITIES.clear()
    _JOINS.clear()
    _REPORTING_MODULES.clear()
