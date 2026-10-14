"""
موتور کوئری گزارش‌ساز عام — فاز ۵ طرح جداسازی.
مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۵

تبدیل ساختار spec (JSON) به QuerySet امن و مستقل از دامنه‌های خاص، با پشتیبانی از:
  - Whitelist فیلدها و موجودیت‌ها
  - ابعاد قلمروبندی پویا (scope_path / scope_kind)
  - ارتباطات JOIN امن با FilteredRelation و EXISTS subquery
  - درخت فیلتر تو در تو با پشتیبانی از عملگرهای مجاز
  - تجمیع (Group By / Having)
  - صفحه‌بندی و مرتب‌سازی
  - خروجی ساختاریافته برای نمایش یا دانلود Excel/PDF
"""
import datetime as _dt
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Set, Tuple

from django.db import DataError, OperationalError, connection, transaction
from django.db.models import Avg, Count, Exists, Max, Min, OuterRef, Q, Sum
from django.db.models import FilteredRelation
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from .definitions import (
    AGG_FUNCTIONS,
    FieldDef,
    JoinDef,
    OPERATORS_BY_TYPE,
    get_all_entities,
    get_all_joins,
    get_entity,
    get_joins_for_entity,
)

MAX_FILTER_DEPTH = 5
MAX_FILTER_CONDITIONS = 60
MAX_HAVING_CONDITIONS = 10
MAX_PAGE_SIZE = 200
MAX_JOINS = 2          # حداکثر JOIN در هر گزارش

HAVING_OPERATORS = ('eq', 'gt', 'gte', 'lt', 'lte', 'between')
STATEMENT_TIMEOUT_MS = 15000  # فیوز ایمنی کوئری‌های run

ALIAS_RE = re.compile(r'^[a-z_][a-z0-9_]{0,40}$')

AGG_MAP = {'count': Count, 'sum': Sum, 'avg': Avg, 'min': Min, 'max': Max}

OPERATOR_LOOKUPS = {
    'eq': '',           # exact (برای datetime → __date)
    'icontains': '__icontains',
    'istartswith': '__istartswith',
    'in': '__in',
    'isnull': '__isnull',
    'gt': '__gt',
    'gte': '__gte',
    'lt': '__lt',
    'lte': '__lte',
}


class ReportError(Exception):
    """خطای اعتبارسنجی یا اجرای گزارش با پیام مناسب کاربر."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


class ReportEngine:
    def __init__(self, user, spec: dict):
        self.user = user
        if not isinstance(spec, dict):
            raise ReportError('مشخصات گزارش (spec) باید یک شیء JSON باشد.')
        self.spec = spec
        self._condition_count = 0
        self._joins: Dict[str, JoinDef] = {}
        self._join_types: Dict[str, str] = {}
        self._has_many_join = False
        self._exists_aliases: Set[str] = set()

        entity_key = self.spec.get('entity')
        if not entity_key:
            raise ReportError('موجودیت گزارش مشخص نشده است.')

        cfg = get_entity(entity_key)
        if cfg is None:
            # بررسی fallback در رجیستری کلی
            all_ent = get_all_entities()
            cfg = all_ent.get(entity_key)
        if cfg is None:
            raise ReportError(f'موجودیت نامعتبر: {entity_key}')
        self.config = cfg
        self._entity_key = entity_key

        if not self.config.user_has_access(user):
            raise ReportError('شما به این موجودیت دسترسی ندارید.', status=403)

        # قلمرو شناسه: پشتیبانی همزمان از scope_id و warehouse_id (تسک ۴۵)
        raw_scope = self.spec.get('scope_id') or self.spec.get('warehouse_id') or None
        if raw_scope is not None:
            try:
                self.scope_id = int(raw_scope)
            except (ValueError, TypeError):
                raise ReportError('شناسه قلمرو/انبار نامعتبر است.')
        else:
            self.scope_id = None
        self.warehouse_id = self.scope_id  # سازگاری رو به عقب

        self._check_scope_access()
        self.fields = self.config.allowed_fields(user, scope_id=self.scope_id, warehouse_id=self.warehouse_id)

        # پردازش JOINها و گسترش فضای فیلد
        self._process_joins()

    def _process_joins(self):
        """اعتبارسنجی JOINهای spec و افزودن فیلدهای مقصد به self.fields."""
        joins_spec = self.spec.get('joins') or []
        if not isinstance(joins_spec, list):
            raise ReportError('ساختار joins نامعتبر است.')
        if len(joins_spec) > MAX_JOINS:
            raise ReportError(f'حداکثر {MAX_JOINS} JOIN در هر گزارش مجاز است.')

        entity_joins = get_joins_for_entity(self._entity_key)
        if not entity_joins:
            all_j = get_all_joins()
            entity_joins = all_j.get(self._entity_key, {})

        used_aliases = set(self.fields.keys())

        for jspec in joins_spec:
            if not isinstance(jspec, dict):
                raise ReportError('هر عنصر joins باید یک آبجکت باشد.')
            to = jspec.get('to')
            alias = jspec.get('as') or to
            join_type = str(jspec.get('type') or 'left').lower()

            jd = entity_joins.get(to)
            if jd is None:
                raise ReportError(f'JOIN نامعتبر یا مجاز نیست: {to}')

            if not alias or not ALIAS_RE.match(alias):
                raise ReportError(f'alias نامعتبر برای JOIN {to}: {alias!r}')
            if alias in used_aliases:
                raise ReportError(f'alias تکراری یا تداخل با فیلد پایه: {alias}')
            used_aliases.add(alias)

            if join_type not in jd.allowed_types:
                raise ReportError(f'نوع JOIN نامعتبر برای {to}: {join_type}')

            target_cfg = get_entity(jd.target)
            if target_cfg is None:
                target_cfg = get_all_entities().get(jd.target)
            if target_cfg is None:
                raise ReportError(f'موجودیت مقصد JOIN یافت نشد: {jd.target}')
            if not target_cfg.user_has_access(self.user):
                raise ReportError(
                    f'به موجودیت مقصد JOIN دسترسی ندارید: {target_cfg.label}', status=403
                )

            self._joins[alias] = jd
            self._join_types[alias] = join_type
            if jd.cardinality == 'many':
                self._has_many_join = True

            target_fields = target_cfg.allowed_fields(self.user, scope_id=self.scope_id, warehouse_id=self.warehouse_id)
            for fkey, fd in target_fields.items():
                prefixed_key = f'{alias}.{fkey}'
                fr_alias = f'{alias}_fr'
                if fd.annotation is not None:
                    orm_source = f'{fr_alias}_{fd.source}'.replace('__', '_')
                    def make_joined_ann(orig_ann=fd.annotation, fr=fr_alias):
                        def _ann(base_prefix=None):
                            target_base = f'{base_prefix}__{fr}' if base_prefix else fr
                            try:
                                return orig_ann(base_prefix=target_base)
                            except TypeError:
                                return orig_ann()
                        return _ann
                    joined_ann = make_joined_ann()
                else:
                    orm_source = f'{fr_alias}__{fd.source}'
                    joined_ann = None

                self.fields[prefixed_key] = FieldDef(
                    key=prefixed_key,
                    source=orm_source,
                    label=f'{fd.label} ({target_cfg.label})',
                    type=fd.type,
                    choices=fd.choices,
                    sensitive=fd.sensitive,
                    groupable=fd.groupable,
                    aggregatable=fd.aggregatable,
                    annotation=joined_ann,
                )

    def _build_join_scope_q(self, jd: JoinDef, alias: str) -> Q:
        """شرط قلمرو (انبار/بخش) برای FilteredRelation — در سطح ON نه WHERE."""
        path = jd.scope_path
        if not path:
            return Q()
        if jd.path_to_base and (path.startswith(f'{jd.path_to_base}__') or path == jd.path_to_base):
            return Q()
        scope_q = Q()
        if jd.scope_kind == 'warehouse':
            if not self.user.is_superuser:
                assigned = getattr(self, '_assigned_ids', None)
                if assigned is not None:
                    scope_q &= Q(**{f'{path}__in': assigned})
            if self.warehouse_id:
                scope_q &= Q(**{f'{path}': self.warehouse_id})
        return scope_q

    # ------------------------------------------------------------------ scope
    def _check_scope_access(self):
        """اعتبارسنجی دسترسی به قلمرو انتخابی."""
        if self.config.scope_kind == 'warehouse':
            from common.warehouse_scope import can_access_warehouse, user_warehouse_ids
            target_wh = int(self.warehouse_id) if self.warehouse_id else None
            if target_wh is not None and not can_access_warehouse(self.user, target_wh):
                raise ReportError('به این انبار دسترسی ندارید.', status=403)
            self._assigned_ids = user_warehouse_ids(self.user)
        else:
            self._assigned_ids = None

    def _check_warehouse_access(self):
        """نام مستعار سازگار رو به عقب."""
        return self._check_scope_access()

    def _scope_queryset(self, qs):
        path = self.config.scope_path
        if not path:
            return qs
        if self.config.scope_kind == 'warehouse':
            from common.warehouse_scope import scope_queryset
            qs = scope_queryset(qs, self.user, field=path)
            if self.warehouse_id:
                qs = qs.filter(**{path: self.warehouse_id})
        return qs

    # ------------------------------------------------------------- validation
    def _field(self, key: str, usage='فیلد') -> FieldDef:
        fd = self.fields.get(key)
        if fd is None:
            raise ReportError(f'{usage} نامعتبر یا غیرمجاز: {key}')
        return fd

    def _coerce(self, fd: FieldDef, value: Any) -> Any:
        try:
            if fd.type == 'number':
                if isinstance(value, bool):
                    raise ValueError
                return Decimal(str(value))
            if fd.type == 'date':
                d = parse_date(str(value))
                if d is None:
                    raise ValueError
                return d
            if fd.type == 'datetime':
                s = str(value).strip()
                d = parse_date(s)
                if d and len(s) == 10:
                    return d
                dt = parse_datetime(s) or d
                if dt is None:
                    raise ValueError
                if isinstance(dt, _dt.datetime) and timezone.is_naive(dt) and timezone.is_aware(timezone.now()):
                    dt = timezone.make_aware(dt)
                return dt
            if fd.type == 'boolean':
                if isinstance(value, bool):
                    return value
                if str(value).lower() in ('true', '1'):
                    return True
                if str(value).lower() in ('false', '0'):
                    return False
                raise ValueError
            if fd.type == 'choice':
                v = str(value)
                if fd.choices and v not in fd.choices:
                    raise ValueError
                return v
            return str(value)
        except (ValueError, TypeError, InvalidOperation):
            raise ReportError(f'مقدار نامعتبر برای فیلد «{fd.label}»: {value!r}')

    # ---------------------------------------------------------------- filters
    def _wrap_exists(self, q: Q, alias: str) -> Q:
        jd = self._joins[alias]
        fr_alias = f'{alias}_fr'
        scope_q = self._build_join_scope_q(jd, alias)

        if self._join_types.get(alias) == 'inner':
            q = q & Q(**{f'{fr_alias}__isnull': False})

        subq = self.config.base_queryset().filter(
            pk=OuterRef('pk')
        ).annotate(
            **{fr_alias: FilteredRelation(jd.path, condition=scope_q)}
        )

        subq_annotations = {}
        for k, fd in self.fields.items():
            if k.startswith(f'{alias}.') and fd.annotation is not None:
                subq_annotations[fd.source] = fd.annotation()
        if subq_annotations:
            subq = subq.annotate(**subq_annotations)

        subq = subq.filter(q).values('pk')
        return Q(Exists(subq))

    def _process_filter_node(self, node: dict, depth=0) -> Tuple[Q, Optional[Set[str]]]:
        if not isinstance(node, dict):
            raise ReportError('ساختار فیلتر نامعتبر است.')
        if depth > MAX_FILTER_DEPTH:
            raise ReportError(f'عمق درخت فیلتر بیش از حد مجاز ({MAX_FILTER_DEPTH}) است.')

        if 'op' in node:
            op = str(node.get('op', '')).upper()
            if op not in ('AND', 'OR'):
                raise ReportError(f'عملگر گروه نامعتبر: {op}')
            children = node.get('children') or []
            if not isinstance(children, list):
                raise ReportError('children باید لیست باشد.')

            processed_children = [self._process_filter_node(c, depth + 1) for c in children]

            if op == 'AND':
                alias_groups = {}
                base_qs = []
                mixed_qs = []

                for cq, cpure in processed_children:
                    if cpure is None:
                        mixed_qs.append(cq)
                    elif not cpure:
                        base_qs.append(cq)
                    else:
                        alias = list(cpure)[0]
                        alias_groups.setdefault(alias, []).append(cq)

                if not mixed_qs and not base_qs and len(alias_groups) == 1:
                    alias = list(alias_groups.keys())[0]
                    combined_q = Q()
                    for q in alias_groups[alias]:
                        combined_q &= q
                    final_q = combined_q
                    final_pure = {alias}
                elif not mixed_qs and not alias_groups:
                    combined_q = Q()
                    for q in base_qs:
                        combined_q &= q
                    final_q = combined_q
                    final_pure = set()
                else:
                    final_q = Q()
                    for q in base_qs + mixed_qs:
                        final_q &= q
                    for alias, qs_list in alias_groups.items():
                        combined_alias_q = Q()
                        for q in qs_list:
                            combined_alias_q &= q
                        final_q &= self._wrap_exists(combined_alias_q, alias)
                    final_pure = None

            elif op == 'OR':
                first_pure = processed_children[0][1] if processed_children else set()
                is_pure = all(cpure == first_pure for _, cpure in processed_children)

                if is_pure and first_pure is not None:
                    final_q = Q()
                    for cq, _ in processed_children:
                        final_q |= cq
                    final_pure = first_pure
                else:
                    final_q = Q()
                    for cq, cpure in processed_children:
                        if cpure and len(cpure) == 1:
                            final_q |= self._wrap_exists(cq, list(cpure)[0])
                        else:
                            final_q |= cq
                    final_pure = None

            if node.get('not'):
                if final_pure and len(final_pure) == 1:
                    final_q = self._wrap_exists(final_q, list(final_pure)[0])
                    final_pure = None
                final_q = ~final_q

            return final_q, final_pure

        self._condition_count += 1
        if self._condition_count > MAX_FILTER_CONDITIONS:
            raise ReportError(f'تعداد شرط‌های فیلتر بیش از حد مجاز ({MAX_FILTER_CONDITIONS}) است.')

        fd = self._field(node.get('field'), usage='فیلد فیلتر')
        operator = node.get('operator')
        if operator not in fd.operators:
            raise ReportError(f'اپراتور «{operator}» برای فیلد «{fd.label}» مجاز نیست.')
        value = node.get('value')

        if operator == 'isnull':
            base_q = Q(**{f'{fd.source}__isnull': bool(value)})
        elif operator == 'between':
            if not isinstance(value, (list, tuple)) or len(value) != 2:
                raise ReportError(f'مقدار بازه برای «{fd.label}» باید دو عضو داشته باشد.')
            lo, hi = self._coerce(fd, value[0]), self._coerce(fd, value[1])
            if fd.type == 'datetime':
                if isinstance(lo, _dt.date) and not isinstance(lo, _dt.datetime):
                    dt_lo = _dt.datetime.combine(lo, _dt.time.min)
                    lo = timezone.make_aware(dt_lo) if timezone.is_aware(timezone.now()) else dt_lo
                if isinstance(hi, _dt.date) and not isinstance(hi, _dt.datetime):
                    dt_hi = _dt.datetime.combine(hi, _dt.time.max)
                    hi = timezone.make_aware(dt_hi) if timezone.is_aware(timezone.now()) else dt_hi
            base_q = Q(**{f'{fd.source}__gte': lo, f'{fd.source}__lte': hi})
        elif operator == 'in':
            if not isinstance(value, (list, tuple)) or not value:
                raise ReportError(f'مقدار لیستی برای «{fd.label}» نامعتبر است.')
            base_q = Q(**{f'{fd.source}__in': [self._coerce(fd, v) for v in value]})
        else:
            coerced = self._coerce(fd, value)
            if fd.type == 'datetime' and isinstance(coerced, _dt.date) and not isinstance(coerced, _dt.datetime):
                if operator == 'eq':
                    base_q = Q(**{f'{fd.source}__date': coerced})
                elif operator == 'lte':
                    dt_end = _dt.datetime.combine(coerced, _dt.time.max)
                    end_of_day = timezone.make_aware(dt_end) if timezone.is_aware(timezone.now()) else dt_end
                    base_q = Q(**{f'{fd.source}__lte': end_of_day})
                elif operator == 'gt':
                    dt_end = _dt.datetime.combine(coerced, _dt.time.max)
                    end_of_day = timezone.make_aware(dt_end) if timezone.is_aware(timezone.now()) else dt_end
                    base_q = Q(**{f'{fd.source}__gt': end_of_day})
                elif operator == 'gte':
                    dt_start = _dt.datetime.combine(coerced, _dt.time.min)
                    start_of_day = timezone.make_aware(dt_start) if timezone.is_aware(timezone.now()) else dt_start
                    base_q = Q(**{f'{fd.source}__gte': start_of_day})
                elif operator == 'lt':
                    dt_start = _dt.datetime.combine(coerced, _dt.time.min)
                    start_of_day = timezone.make_aware(dt_start) if timezone.is_aware(timezone.now()) else dt_start
                    base_q = Q(**{f'{fd.source}__lt': start_of_day})
                else:
                    lookup = OPERATOR_LOOKUPS[operator]
                    base_q = Q(**{f'{fd.source}{lookup}': coerced})
            else:
                lookup = OPERATOR_LOOKUPS[operator]
                base_q = Q(**{f'{fd.source}{lookup}': coerced})

        field_key = node.get('field', '')
        alias = field_key.split('.')[0] if '.' in field_key else None
        pure = {alias} if alias and alias in getattr(self, '_exists_aliases', set()) else set()

        if node.get('not'):
            if pure and len(pure) == 1:
                base_q = self._wrap_exists(base_q, list(pure)[0])
                pure = None
            base_q = ~base_q

        return base_q, pure

    # ------------------------------------------------------------------ build
    def build(self):
        """ساخت queryset نهایی + توصیف ستون‌ها. خروجی: (queryset, columns, join_mode)"""
        spec = self.spec
        field_keys = spec.get('fields') or []
        group_by = spec.get('group_by') or []
        aggregations = spec.get('aggregations') or []
        sort = spec.get('sort') or []

        if not isinstance(field_keys, list) or not isinstance(group_by, list) \
                or not isinstance(aggregations, list) or not isinstance(sort, list):
            raise ReportError('ساختار spec نامعتبر است.')

        grouped = bool(group_by)
        if not grouped and not field_keys:
            raise ReportError('حداقل یک فیلد انتخاب کنید.')
        if grouped and not aggregations:
            raise ReportError('برای گروه‌بندی حداقل یک تابع تجمیعی لازم است.')

        having = spec.get('having') or []
        if having and not isinstance(having, list):
            raise ReportError('ساختار HAVING نامعتبر است.')
        if having and not grouped:
            raise ReportError('شرط روی نتایج تجمیع (HAVING) فقط با گروه‌بندی معنا دارد.')
        if len(having) > MAX_HAVING_CONDITIONS:
            raise ReportError(f'تعداد شرط‌های HAVING بیش از حد مجاز ({MAX_HAVING_CONDITIONS}) است.')

        for k in field_keys:
            self._field(k)
        group_defs = [self._field(k, usage='فیلد گروه‌بندی') for k in group_by]
        for gd in group_defs:
            if not gd.groupable:
                raise ReportError(f'فیلد «{gd.label}» قابل گروه‌بندی نیست.')

        agg_specs = []
        used_aliases = set()
        for agg in aggregations:
            if not isinstance(agg, dict):
                raise ReportError('ساختار تجمیع نامعتبر است.')
            fn = str(agg.get('fn', '')).lower()
            if fn not in AGG_FUNCTIONS:
                raise ReportError(f'تابع تجمیعی نامعتبر: {fn}')
            fd = self._field(agg.get('field'), usage='فیلد تجمیع')
            if fn != 'count' and not fd.aggregatable:
                raise ReportError(f'فیلد «{fd.label}» قابل جمع/میانگین نیست.')
            alias = agg.get('alias') or f'{fn}_{fd.key}'.replace('__', '_').replace('.', '_')
            if not ALIAS_RE.match(alias):
                raise ReportError(f'نام alias نامعتبر: {alias}')
            if alias in self.fields or alias in used_aliases:
                raise ReportError(f'alias تکراری یا رزروشده: {alias}')
            used_aliases.add(alias)
            raw_label = str(agg.get('label') or '').strip()
            if raw_label and len(raw_label) > 60:
                raise ReportError('طول عنوان ستون نمی‌تواند بیشتر از ۶۰ کاراکتر باشد.')
            label = raw_label or self._agg_label(fn, fd)
            agg_specs.append((alias, fn, fd, label))

        qs = self._scope_queryset(self.config.base_queryset())

        # ── تشخیص فیلدهای JOIN در spec ──
        join_field_keys = {k for k in field_keys if '.' in k}
        join_group_keys = {k for k in group_by if '.' in k}
        join_agg_keys = {fd.key for _, _, fd, _ in agg_specs if '.' in fd.key}
        join_used_in_output = join_field_keys | join_group_keys | join_agg_keys
        output_join_aliases = {k.split('.')[0] for k in join_used_in_output}

        has_many_output = any(self._joins.get(a) and self._joins[a].cardinality == 'many' for a in output_join_aliases)
        if grouped and has_many_output:
            for alias, fn, fd, _ in agg_specs:
                if fn in ('sum', 'avg', 'min', 'max') and '.' not in fd.key:
                    raise ReportError(
                        f'در ترکیب با جدول چندمقداری، {fn} روی فیلد «{fd.label}» '
                        f'نادرست است. فیلد جدول مقصد را جمع بزنید یا از Count استفاده کنید.'
                    )

        many_output_count = sum(1 for a in output_join_aliases if self._joins.get(a) and self._joins[a].cardinality == 'many')
        if many_output_count > 1:
            raise ReportError('امکان نمایش همزمان ستون‌ها از چند جدول چندمقداری وجود ندارد. فیلدهای خروجی را فقط از یکی از این جداول انتخاب کنید.')

        join_mode = 'none'
        self._exists_aliases = set()
        fr_aliases = set()

        for alias, jd in self._joins.items():
            if jd.cardinality == 'many' and alias not in output_join_aliases:
                self._exists_aliases.add(alias)
            else:
                fr_aliases.add(alias)

        if fr_aliases:
            join_mode = 'aggregated' if grouped else 'flat'
        elif self._exists_aliases:
            join_mode = 'exists'

        for alias in fr_aliases:
            jd = self._joins[alias]
            fr_alias = f'{alias}_fr'
            scope_q = self._build_join_scope_q(jd, alias)
            qs = qs.annotate(**{fr_alias: FilteredRelation(jd.path, condition=scope_q)})
            if self._join_types.get(alias) == 'inner':
                qs = qs.filter(**{f'{fr_alias}__isnull': False})

        # annotationهای موردنیاز (پویا/محاسباتی برای فیلدهای پایه و JOIN) — قبل از فیلتر
        referenced = set(field_keys) | set(group_by)
        referenced |= {fd.key for _, _, fd, _ in agg_specs}
        referenced |= self._filter_field_keys(spec.get('filters'))
        referenced |= {s.get('field') for s in sort if isinstance(s, dict)}

        annotations = {}
        for k in referenced:
            fd = self.fields.get(k)
            if fd is not None and fd.annotation is not None:
                alias = k.split('.')[0] if '.' in k else None
                if alias and alias in self._exists_aliases:
                    continue
                annotations[fd.source] = fd.annotation()
        if annotations:
            qs = qs.annotate(**annotations)

        # ── فیلترها (شامل شرط‌های روی فیلدهای JOIN از طریق FilteredRelation و EXISTS) ──
        filters = spec.get('filters')
        if filters:
            self._condition_count = 0
            q, pure = self._process_filter_node(filters)
            if pure and len(pure) == 1:
                q = self._wrap_exists(q, list(pure)[0])
            qs = qs.filter(q)

        # ── ساخت queryset نهایی ──
        if grouped:
            group_sources = [gd.source for gd in group_defs]
            agg_exprs = {}
            for alias, fn, fd, _ in agg_specs:
                if fn == 'count' and (fd.key == 'id' or fd.key.endswith('.id') or fd.source == 'id') and has_many_output:
                    agg_exprs[alias] = Count(fd.source, distinct=True)
                else:
                    agg_exprs[alias] = AGG_MAP[fn](fd.source)
            qs = qs.values(*group_sources).annotate(**agg_exprs)
            # HAVING
            for h in having:
                if not isinstance(h, dict):
                    raise ReportError('ساختار شرط HAVING نامعتبر است.')
                alias = h.get('alias')
                if alias not in used_aliases:
                    raise ReportError(f'شرط HAVING فقط روی نتایج تجمیع همین گزارش مجاز است: {alias}')
                op = h.get('operator')
                if op not in HAVING_OPERATORS:
                    raise ReportError(f'اپراتور HAVING نامعتبر: {op}')
                value = h.get('value')
                if op == 'between':
                    if not isinstance(value, (list, tuple)) or len(value) != 2:
                        raise ReportError(f'مقدار بازه HAVING برای «{alias}» باید دو عضو داشته باشد.')
                    lo = self._having_value(alias, value[0])
                    hi = self._having_value(alias, value[1])
                    qs = qs.filter(**{f'{alias}__gte': lo, f'{alias}__lte': hi})
                else:
                    coerced = self._having_value(alias, value)
                    qs = qs.filter(**{f'{alias}{OPERATOR_LOOKUPS[op]}': coerced})
            columns = (
                [{'key': gd.key, 'label': gd.label, 'type': gd.type, 'source': gd.source} for gd in group_defs]
                + [{'key': alias, 'label': label, 'type': 'number', 'source': alias}
                   for alias, fn, fd, label in agg_specs]
            )
            sortable = {gd.key for gd in group_defs} | used_aliases
        else:
            sources = [self.fields[k].source for k in field_keys]
            columns = [
                {'key': k, 'label': self.fields[k].label, 'type': self.fields[k].type, 'source': self.fields[k].source}
                for k in field_keys
            ]
            sortable = set(field_keys)

        # مرتب‌سازی
        order = []
        for s in sort:
            if not isinstance(s, dict):
                raise ReportError('ساختار مرتب‌سازی نامعتبر است.')
            key = s.get('field')
            if key not in sortable:
                raise ReportError(f'مرتب‌سازی فقط روی ستون‌های انتخاب‌شده مجاز است: {key}')
            direction = s.get('dir', 'asc')
            if direction not in ('asc', 'desc'):
                raise ReportError(f'جهت مرتب‌سازی نامعتبر: {direction}')
            source = self.fields[key].source if key in self.fields else key
            order.append(f'-{source}' if direction == 'desc' else source)
        if grouped:
            for gs in group_sources:
                if gs not in order and f'-{gs}' not in order:
                    order.append(gs)
        else:
            order.append('pk')  # tiebreak پایدار برای صفحه‌بندی
            if getattr(self, '_has_many_join', False):
                if 'id' not in sources and 'pk' not in sources:
                    sources.append('id')
                for alias in fr_aliases:
                    if self._joins[alias].cardinality == 'many':
                        alias_pk = f'{alias}_fr__id'
                        if alias_pk not in sources:
                            sources.append(alias_pk)
                        order.append(alias_pk)
                # در حالت distinct پایگاه‌داده PostgreSQL نیازمند تطابق دقیق نام ستون‌هاست
                order = ['id' if o == 'pk' else ('-id' if o == '-pk' else o) for o in order]
                for ord_item in order:
                    clean_ord = ord_item.lstrip('-')
                    if clean_ord not in sources:
                        sources.append(clean_ord)
                qs = qs.values(*sources).distinct()
            else:
                qs = qs.values(*sources)

        if order:
            qs = qs.order_by(*order)

        return qs, columns, join_mode

    def _having_value(self, alias, value):
        """مقدار عددی شرط HAVING — نامعتبر ← 400 فارسی (نتایج تجمیع همیشه عددی‌اند)."""
        try:
            if isinstance(value, bool):
                raise ValueError
            return Decimal(str(value))
        except (ValueError, TypeError, InvalidOperation):
            raise ReportError(f'مقدار نامعتبر در شرط HAVING «{alias}»: {value!r}')

    def _filter_field_keys(self, node, depth=0):
        """کلیدهای فیلد استفاده‌شده در درخت فیلتر (برای annotation پیش‌نیاز)."""
        keys = set()
        if not isinstance(node, dict) or depth > MAX_FILTER_DEPTH:
            return keys
        if 'op' in node:
            for child in (node.get('children') or []):
                keys |= self._filter_field_keys(child, depth + 1)
        elif node.get('field'):
            keys.add(node['field'])
        return keys

    def _agg_label(self, fn: str, fd: FieldDef) -> str:
        fn_fa = {
            'count': 'تعداد',
            'sum': 'مجموع',
            'avg': 'میانگین',
            'min': 'حداقل',
            'max': 'حداکثر',
        }.get(fn, fn)
        return f'{fn_fa} {fd.label}'

    def _filter_field_keys(self, node: Any) -> Set[str]:
        keys = set()
        if not isinstance(node, dict):
            return keys
        if 'field' in node:
            keys.add(node['field'])
        for child in node.get('children') or []:
            keys |= self._filter_field_keys(child)
        return keys

    # -------------------------------------------------------------------- run
    def run(self) -> dict:
        """اجرای گزارش با صفحه‌بندی و timeout ایمن."""
        qs, columns, join_mode = self.build()

        page = self.spec.get('page') or 1
        page_size = self.spec.get('page_size') or 50
        try:
            page = int(page)
            page_size = int(page_size)
            if page < 1 or page_size < 1 or page_size > MAX_PAGE_SIZE:
                raise ValueError
        except (ValueError, TypeError):
            raise ReportError('صفحه‌بندی نامعتبر است.')

        offset = (page - 1) * page_size
        try:
            with transaction.atomic():
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cur:
                        cur.execute(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT_MS}ms'")
                total = qs.count()
                rows = list(qs[offset:offset + page_size])
        except OperationalError:
            raise ReportError(
                'اجرای گزارش بیش از حد طول کشید؛ فیلتر دقیق‌تری بگذارید یا بازه را کوچک کنید.'
            )
        except DataError:
            raise ReportError(
                'داده نامعتبر در یکی از فیلدهای پویا (مثلاً متن در فیلد عددی). '
                'مقادیر آن فیلد را اصلاح کنید یا فیلترش را بردارید.'
            )

        source_to_key = {c.get('source', c['key']): c['key'] for c in columns}
        rows = [_jsonable(r, source_to_key) for r in rows]
        result = {
            'columns': columns,
            'count': total,
            'page': page,
            'page_size': page_size,
            'rows': rows,
        }
        if join_mode != 'none':
            result['join_mode'] = join_mode
        return result

    # ----------------------------------------------------------------- export
    def export_queryset(self):
        """queryset بدون صفحه‌بندی برای خروجی Excel + ستون‌ها + تعداد کل."""
        qs, columns, _join_mode = self.build()
        try:
            with transaction.atomic():
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cur:
                        cur.execute(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT_MS}ms'")
                total = qs.count()
        except OperationalError:
            raise ReportError(
                'محاسبه تعداد ردیف‌های خروجی بیش از حد طول کشید؛ فیلتر دقیق‌تری بگذارید یا بازه را کوچک کنید.'
            )
        except DataError:
            raise ReportError('داده نامعتبر در یکی از فیلدهای پویا.')
        return qs, columns, total


def _jsonable(row: dict, source_to_key: Optional[dict] = None) -> dict:
    out = {}
    if source_to_key is not None:
        for src, key in source_to_key.items():
            if src in row:
                out[key] = row[src]
    else:
        out = dict(row)

    for k, v in list(out.items()):
        if isinstance(v, Decimal):
            out[k] = _safe_float(v)
        elif isinstance(v, (_dt.datetime, _dt.date, _dt.time)):
            out[k] = v.isoformat()
    return out


def _safe_float(d: Decimal) -> Any:
    if d is None:
        return None
    try:
        f = float(d)
        return int(f) if f.is_integer() else f
    except (ValueError, OverflowError):
        return str(d)
