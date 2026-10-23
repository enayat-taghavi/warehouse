"""
تست رجیستری موجودیت‌های گزارش‌ساز در پروفایل کامل (گام ۳-ب طرح راه میانهٔ ماژولار).
این تست برابری دقیق فهرست کلیدهای موجودیت‌ها، فیلدها و JOINها را پس از ماژولارشدن
با نسخهٔ پیش از تغییر اعتبارسنجی می‌کند.
"""
from unittest.mock import patch
from django.test import SimpleTestCase

from reports.registry import get_registry, get_all_joins


EXPECTED_ENTITIES = [
    'count_task_history',
    'count_tasks',
    'doc_task_history',
    'doc_tasks',
    'fleet_trips',
    'items',
    'monthly_payrolls',
    'personnel_profiles',
    'users',
    'warehouses',
]

EXPECTED_ENTITY_FIELDS = {
    'count_task_history': [
        'action_by__username', 'action_type', 'counted_balance', 'created_at',
        'id', 'note', 'task__item__fa_unic_code', 'updated_at',
    ],
    'count_tasks': [
        'counted_balance', 'counter_name', 'counter_note', 'created_at', 'id',
        'item__description', 'item__fa_unic_code', 'item__inventory', 'item__unit',
        'item__warehouse__name', 'manager_note', 'skip_supervisor', 'status',
        'supervisor_name', 'supervisor_note', 'updated_at',
    ],
    'doc_task_history': [
        'action_by__username', 'action_type', 'created_at', 'id', 'note',
        'task__item__fa_unic_code',
    ],
    'doc_tasks': [
        'added_rti_no', 'created_at', 'currency', 'doc_supplier', 'doc_worker_name',
        'folder_address', 'id', 'inv_rti_number', 'invoice_date', 'invoice_page',
        'invoice_type', 'is_deleted', 'item__description', 'item__fa_unic_code',
        'item__warehouse__name', 'manager_note', 'page_row', 'price_amount',
        'signature', 'similar_unit_price', 'skip_supervisor', 'stamp', 'status',
        'supervisor_note', 'total_value', 'updated_at', 'worker_note',
    ],
    'fleet_trips': [
        'id', 'is_settled', 'settled_at', 'total_amount',
    ],
    'items': [
        'added_rti_no', 'bal4miv', 'created_at', 'created_by__username', 'currency',
        'desc_from_standard_system', 'description', 'doc_assignee', 'doc_status',
        'doc_supplier', 'fa_unic_code', 'field_assignee', 'field_status',
        'folder_address', 'has_conflict', 'hov_date', 'hov_no', 'hyperlink',
        'id', 'indent', 'inv_rti_number', 'inventory', 'invoice_date',
        'invoice_page', 'invoice_type', 'irn_no', 'msr_status', 'my_tag',
        'new_location', 'page_row', 'pk_number', 'pl', 'po', 'price_amount',
        'remark', 'request_number_of_table', 'scope_discipline', 'signature',
        'similar_unit_price', 'size', 'stamp', 'supplier', 'tag', 'tag_status',
        'total_value', 'unit', 'unit_from_standard_system', 'updated_at',
        'vendor', 'warehouse__name', 'warehouse__project_name',
    ],
    'monthly_payrolls': [
        'full_name', 'gross_salary', 'id', 'income_tax', 'national_code',
        'net_salary', 'payable_amount', 'payment_status', 'worker_insurance',
    ],
    'personnel_profiles': [
        'contract_type', 'created_at', 'first_name', 'id', 'last_name', 'national_code',
    ],
    'users': [
        'assigned_warehouses_count', 'date_joined', 'first_name', 'id', 'is_active',
        'last_name', 'operational_zone', 'phone_number', 'username',
    ],
    'warehouses': [
        'capacity', 'code', 'color', 'company_name', 'created_at', 'description',
        'gps_coordinates', 'id', 'is_active', 'location', 'manager__username',
        'name', 'operator_company', 'parent_warehouse__name', 'phone_number',
        'project_name', 'type', 'updated_at',
    ],
}

EXPECTED_JOINS = {
    'count_tasks': ['ct_history'],
    'doc_tasks': ['dt_history'],
    'items': ['count_tasks', 'doc_tasks'],
}


class ReportEntitiesRegistryTestCase(SimpleTestCase):
    """آزمون صحت و ثبات فهرست موجودیت‌ها و کلیدهای گزارش‌ساز در پروفایل کامل."""

    def test_all_expected_entities_registered(self):
        reg = get_registry()
        actual_entities = sorted(reg.keys())
        self.assertEqual(
            actual_entities,
            EXPECTED_ENTITIES,
            f"عدم تطابق در موجودیت‌های گزارش‌ساز: {set(actual_entities) ^ set(EXPECTED_ENTITIES)}"
        )

    @patch('settings_core.services.get_setting', return_value='normal')
    @patch('settings_core.models.SystemSetting.objects.filter')
    def test_entity_fields_match_baseline(self, mock_filter, mock_get_setting):
        mock_filter.return_value.exists.return_value = False
        reg = get_registry()
        for ent_key, expected_fields in EXPECTED_ENTITY_FIELDS.items():
            self.assertIn(ent_key, reg, f"موجودیت {ent_key} در رجیستری یافت نشد.")
            actual_fields = sorted(reg[ent_key].get_fields().keys())
            self.assertEqual(
                actual_fields,
                expected_fields,
                f"فیلدهای موجودیت {ent_key} با مبنا هم‌خوانی ندارد: {set(actual_fields) ^ set(expected_fields)}"
            )

    def test_joins_match_baseline(self):
        all_joins = get_all_joins()
        actual_joins = {k: sorted(v.keys()) for k, v in all_joins.items() if v}
        self.assertEqual(
            actual_joins,
            EXPECTED_JOINS,
            f"روابط JOIN گزارش‌ساز با مبنا هم‌خوانی ندارد: {actual_joins} vs {EXPECTED_JOINS}"
        )
