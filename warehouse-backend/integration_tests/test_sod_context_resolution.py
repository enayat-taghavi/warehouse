"""
تست مشخصه‌یابی (Characterization Test) برای استخراج تابع resolve_sod_context
این تست رفتار فعلی استنتاج page_route و action_code را دقیقاً مطابق پیاده‌سازی اولیه پین می‌کند.
"""
import types
from django.test import SimpleTestCase
from accounts.permissions import resolve_sod_context


class SoDContextResolutionTests(SimpleTestCase):
    """
    مجموعه تست‌های پین‌کردن رفتار استنتاج زمینه SoD (route و action)
    """

    TEST_CASES = [
        # ۱. attendance + create
        {
            "name": "attendance_create",
            "path": "/api/personnel/attendance/",
            "method": "POST",
            "data": {},
            "action": "create",
            "view_attrs": {},
            "expected_route": "/attendance",
            "expected_action": "create_daily_attendance_entry",
        },
        # ۲. attendance + lock_period
        {
            "name": "attendance_lock_period",
            "path": "/api/personnel/attendance/lock/",
            "method": "POST",
            "data": {},
            "action": "lock_period",
            "view_attrs": {},
            "expected_route": "/attendance",
            "expected_action": "approve_attendance_period",
        },
        # ۳. a path without any keyword + create (fallback route /attendance, action create_daily_attendance_entry)
        {
            "name": "no_keyword_create_fallback",
            "path": "/api/items/",
            "method": "POST",
            "data": {},
            "action": "create",
            "view_attrs": {},
            "expected_route": "/attendance",
            "expected_action": "create_daily_attendance_entry",
        },
        # ۴. a path without any keyword + approve_period
        {
            "name": "no_keyword_approve_period",
            "path": "/api/items/",
            "method": "POST",
            "data": {},
            "action": "approve_period",
            "view_attrs": {},
            "expected_route": "/attendance",
            "expected_action": "approve_attendance_period",
        },
        # ۵. profiles + approve_manager
        {
            "name": "profiles_approve_manager",
            "path": "/api/personnel/profiles/1/",
            "method": "POST",
            "data": {},
            "action": "approve_manager",
            "view_attrs": {},
            "expected_route": "/profiles",
            "expected_action": "approve_manager",
        },
        # ۶. a path containing both profiles and finance
        {
            "name": "profiles_and_finance_in_path",
            "path": "/api/profiles/finance-summary/",
            "method": "GET",
            "data": {},
            "action": "list",
            "view_attrs": {},
            "expected_route": "/profiles",
            "expected_action": "list",
        },
        # ۷. monthly-payroll + disburse_period
        {
            "name": "monthly_payroll_disburse_period",
            "path": "/api/personnel/monthly-payroll/disburse/",
            "method": "POST",
            "data": {},
            "action": "disburse_period",
            "view_attrs": {},
            "expected_route": "/finance-cartable",
            "expected_action": "disburse_treasury_payment",
        },
        # ۸. treasury + list
        {
            "name": "treasury_list",
            "path": "/api/treasury/transactions/",
            "method": "GET",
            "data": {},
            "action": "list",
            "view_attrs": {},
            "expected_route": "/treasury-cartable",
            "expected_action": "list",
        },
        # ۹. manager + action=None with GET
        {
            "name": "manager_none_action_get",
            "path": "/api/manager/approvals/",
            "method": "GET",
            "data": {},
            "action": None,
            "view_attrs": {},
            "expected_route": "/manager-approvals",
            "expected_action": "get",
        },
        # ۱۰. a path containing both customs and manager
        {
            "name": "customs_and_manager_in_path",
            "path": "/api/warehouse/customs/manager/",
            "method": "GET",
            "data": {},
            "action": "retrieve",
            "view_attrs": {},
            "expected_route": "/manager-approvals",
            "expected_action": "retrieve",
        },
        # ۱۱. customs + create
        {
            "name": "customs_create",
            "path": "/api/warehouse/customs/",
            "method": "POST",
            "data": {},
            "action": "create",
            "view_attrs": {},
            "expected_route": "/customs",
            "expected_action": "create",
        },
        # ۱۲. PATCH with data={'base_wage': 1} on a path without keywords
        {
            "name": "patch_base_wage_no_keyword_path",
            "path": "/api/items/42/",
            "method": "PATCH",
            "data": {"base_wage": 1},
            "action": "partial_update",
            "view_attrs": {},
            "expected_route": "/attendance",
            "expected_action": "edit_base_wage_and_bonuses",
        },
        # ۱۳. an uppercase path such as /API/Personnel/Attendance/
        {
            "name": "uppercase_path",
            "path": "/API/Personnel/Attendance/",
            "method": "GET",
            "data": {},
            "action": "list",
            "view_attrs": {},
            "expected_route": "/attendance",
            "expected_action": "list",
        },
        # ۱۴. a view with sod_page_route='/x' and sod_action_code='y'
        {
            "name": "view_explicit_sod_overrides",
            "path": "/api/personnel/attendance/",
            "method": "POST",
            "data": {"base_wage": 100},
            "action": "create",
            "view_attrs": {"sod_page_route": "/x", "sod_action_code": "y"},
            "expected_route": "/x",
            "expected_action": "y",
        },
    ]

    def test_sod_context_resolution_cases(self):
        """
        اجرای تمام حالت‌های جدول مشخصه‌یابی و بررسی تطابق دقیق route و action_code.
        """
        for case in self.TEST_CASES:
            with self.subTest(case=case["name"]):
                request = types.SimpleNamespace(
                    path=case["path"],
                    method=case["method"],
                    data=case["data"],
                )
                view_kwargs = {"action": case["action"]}
                if case.get("view_attrs"):
                    view_kwargs.update(case["view_attrs"])
                view = types.SimpleNamespace(**view_kwargs)

                resolved_route, resolved_action = resolve_sod_context(request, view)
                self.assertEqual(
                    resolved_route,
                    case["expected_route"],
                    f"Route mismatch for {case['name']}: expected {case['expected_route']}, got {resolved_route}",
                )
                self.assertEqual(
                    resolved_action,
                    case["expected_action"],
                    f"Action mismatch for {case['name']}: expected {case['expected_action']}, got {resolved_action}",
                )
