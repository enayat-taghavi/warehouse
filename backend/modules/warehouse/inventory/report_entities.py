"""
موجودیت‌ها و روابط JOIN ماژول موجودی کالا (inventory) برای موتور گزارش‌ساز پلتفرم.
طرح راه میانهٔ ماژولار (گام ۳-ب).
"""
from typing import Dict

from django.db.models import DateField, DecimalField
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast

from platform_core.query_engine import (
    EntityConfig,
    FieldDef,
    JoinDef,
    _person_name_annotation,
    register_entity,
    register_joins,
)

# ---------------------------------------------------------------------------
# JOINS whitelist ماژول انبارداری — روابط وارونهٔ مجاز
# ---------------------------------------------------------------------------
INVENTORY_JOINS: Dict[str, Dict[str, JoinDef]] = {
    'items': {
        'count_tasks': JoinDef(
            target='count_tasks',
            label='وظایف شمارش',
            path='count_tasks',          # CountTask.item related_name='count_tasks'
            cardinality='many',
            scope_path='item__warehouse_id',
            path_to_base='item',
            scope_kind='warehouse',
        ),
        'doc_tasks': JoinDef(
            target='doc_tasks',
            label='وظایف مدارک',
            path='doc_tasks',            # DocTask.item related_name='doc_tasks'
            cardinality='many',
            scope_path='item__warehouse_id',
            path_to_base='item',
            scope_kind='warehouse',
        ),
    },
    'count_tasks': {
        'ct_history': JoinDef(
            target='count_task_history',
            label='تاریخچه شمارش',
            path='history',              # CountTaskHistory.task related_name='history'
            cardinality='many',
            scope_path='task__item__warehouse_id',
            path_to_base='task',
            scope_kind='warehouse',
        ),
    },
    'doc_tasks': {
        'dt_history': JoinDef(
            target='doc_task_history',
            label='تاریخچه مدارک',
            path='history',              # DocTaskHistory.task related_name='history'
            cardinality='many',
            scope_path='task__item__warehouse_id',
            path_to_base='task',
            scope_kind='warehouse',
        ),
    },
}


def _dynamic_item_fields(warehouse_id):
    """فیلدهای پویای Item (ذخیره در JSONB dynamic_data) به‌صورت annotation."""
    from inventory.models import ItemFieldDefinition

    out = {}
    for d in ItemFieldDefinition.objects.filter(warehouse_id=warehouse_id, is_active=True):
        key = f'dyn__{d.name}'
        name = d.name

        if d.field_type == 'number':
            def factory(n=name, base_prefix=None):
                target_field = f'{base_prefix}__dynamic_data' if base_prefix else 'dynamic_data'
                return Cast(
                    KeyTextTransform(n, target_field),
                    DecimalField(max_digits=20, decimal_places=4),
                )
            ftype, aggregatable = 'number', True
        elif d.field_type == 'date':
            def factory(n=name, base_prefix=None):
                target_field = f'{base_prefix}__dynamic_data' if base_prefix else 'dynamic_data'
                return Cast(KeyTextTransform(n, target_field), DateField())
            ftype, aggregatable = 'date', False
        elif d.field_type == 'boolean':
            def factory(n=name, base_prefix=None):
                target_field = f'{base_prefix}__dynamic_data' if base_prefix else 'dynamic_data'
                return KeyTextTransform(n, target_field)
            ftype, aggregatable = 'text', False
        else:
            def factory(n=name, base_prefix=None):
                target_field = f'{base_prefix}__dynamic_data' if base_prefix else 'dynamic_data'
                return KeyTextTransform(n, target_field)
            ftype, aggregatable = 'text', False

        out[key] = FieldDef(
            key=key, source=key, label=d.label, type=ftype,
            aggregatable=aggregatable, annotation=factory,
        )
    return out


def _items_sensitive_keys_resolver(warehouse_id=None):
    """استخراج کلیدهای حساس کالا با توجه به تنظیمات انبار."""
    from settings_core.services import get_setting
    from settings_core.models import SystemSetting
    keys = set()
    restricted = get_setting('SENSITIVE_EXCEL_FIELDS', warehouse_id) or ['doc_status', 'field_status', 'tag_status']
    keys.update(restricted)

    if warehouse_id:
        is_blind = get_setting('blind_counting', warehouse_id) == 'blind'
    else:
        is_blind = (
            get_setting('blind_counting', None) == 'blind'
            or SystemSetting.objects.filter(key='blind_counting', value='blind').exists()
        )
    if is_blind:
        keys.update(('inventory', 'bal4miv'))
    return keys


def build_inventory_entities():
    """ساخت تعاریف موجودیت‌های ماژول کالا و انبارگردانی."""
    from inventory.models import (
        CountTask, CountTaskHistory, DocTask, DocTaskHistory, Item,
    )

    def fk_text(key, label, groupable=True):
        return FieldDef(key=key, source=key, label=label, type='text', groupable=groupable)

    sync_exclude = ('sync_id', 'is_deleted')

    return [
        EntityConfig(
            key='items', label='کالاها', model=Item,
            permissions=('view_wh_docs', 'view_sys_export'),
            scope_path='warehouse_id',
            scope_kind='warehouse',
            exclude=sync_exclude + ('dynamic_data',),
            related={
                'warehouse__name': fk_text('warehouse__name', 'نام انبار'),
                'warehouse__project_name': fk_text('warehouse__project_name', 'نام پروژه'),
                'created_by__username': fk_text('created_by__username', 'نام کاربری سازنده'),
            },
            select_related=('warehouse', 'created_by'),
            blind_sensitive=('inventory', 'bal4miv'),
            dynamic_fields_factory=_dynamic_item_fields,
            sensitive_keys_resolver=_items_sensitive_keys_resolver,
            module_code='warehouse',
        ),
        EntityConfig(
            key='count_tasks', label='وظایف شمارش', model=CountTask,
            permissions=('view_sys_supervisor', 'view_sys_manager_review', 'view_sys_recounts'),
            scope_path='item__warehouse_id',
            scope_kind='warehouse',
            exclude=sync_exclude,
            related={
                'item__fa_unic_code': fk_text('item__fa_unic_code', 'کد یکتای کالا'),
                'item__description': fk_text('item__description', 'شرح کالا'),
                'item__unit': fk_text('item__unit', 'واحد سنجش'),
                'item__warehouse__name': fk_text('item__warehouse__name', 'نام انبار'),
                'item__inventory': FieldDef(
                    key='item__inventory', source='item__inventory', label='موجودی فیزیکی کالا',
                    type='number', aggregatable=True, sensitive=False,
                ),
            },
            extra={
                'counter_name': FieldDef(
                    key='counter_name', source='counter_name', label='نام شمارشگر',
                    type='text', annotation=_person_name_annotation('counter'),
                ),
                'supervisor_name': FieldDef(
                    key='supervisor_name', source='supervisor_name', label='نام سرپرست',
                    type='text', annotation=_person_name_annotation('supervisor'),
                ),
            },
            select_related=('item', 'counter', 'supervisor'),
            blind_sensitive=('counted_balance', 'item__inventory'),
            module_code='warehouse',
        ),
        EntityConfig(
            key='count_task_history', label='تاریخچه شمارش', model=CountTaskHistory,
            permissions=('view_sys_supervisor', 'view_sys_manager_review', 'view_sys_recounts'),
            scope_path='task__item__warehouse_id',
            scope_kind='warehouse',
            exclude=sync_exclude,
            related={
                'task__item__fa_unic_code': fk_text('task__item__fa_unic_code', 'کد یکتای کالا'),
                'action_by__username': fk_text('action_by__username', 'نام کاربری اقدام‌کننده'),
            },
            select_related=('task', 'action_by'),
            blind_sensitive=('counted_balance',),
            module_code='warehouse',
        ),
        EntityConfig(
            key='doc_tasks', label='وظایف مدارک', model=DocTask,
            permissions=('view_wh_doc_approvals', 'view_wh_customs'),
            scope_path='item__warehouse_id',
            scope_kind='warehouse',
            related={
                'item__fa_unic_code': fk_text('item__fa_unic_code', 'کد یکتای کالا'),
                'item__description': fk_text('item__description', 'شرح کالا'),
                'item__warehouse__name': fk_text('item__warehouse__name', 'نام انبار'),
            },
            extra={
                'doc_worker_name': FieldDef(
                    key='doc_worker_name', source='doc_worker_name', label='نام بررسی‌کننده',
                    type='text', annotation=_person_name_annotation('doc_worker'),
                ),
            },
            select_related=('item', 'doc_worker'),
            module_code='warehouse',
        ),
        EntityConfig(
            key='doc_task_history', label='تاریخچه مدارک', model=DocTaskHistory,
            permissions=('view_wh_doc_approvals', 'view_wh_customs'),
            scope_path='task__item__warehouse_id',
            scope_kind='warehouse',
            related={
                'task__item__fa_unic_code': fk_text('task__item__fa_unic_code', 'کد یکتای کالا'),
                'action_by__username': fk_text('action_by__username', 'نام کاربری انجام‌دهنده'),
            },
            select_related=('task', 'action_by'),
            module_code='warehouse',
        ),
    ]


def register_inventory_report_entities():
    """ثبت موجودیت‌ها و JOINهای کالا در رجیستری گزارش‌ساز."""
    for ent in build_inventory_entities():
        register_entity(ent, module_code='warehouse')
    for ent_key, joins_dict in INVENTORY_JOINS.items():
        register_joins(ent_key, joins_dict, module_code='warehouse')
