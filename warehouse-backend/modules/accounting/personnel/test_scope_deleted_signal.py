# -*- coding: utf-8 -*-
"""
آزمون واحد رویداد scope_deleted و پاکسازی شناسه‌های انبار در ۵ مدل پرسنلی/مالی.
طرح راه میانهٔ ماژولار (گام ۳-الف).
"""
from django.test import TestCase
from platform_core.events import scope_deleted
from personnel.models import (
    Company,
    PersonnelProfile,
    VehicleDriverProfile,
    MonthlyWorkPeriod,
    DailyAttendance,
    VehicleTripLog,
)


class ScopeDeletedSignalTestCase(TestCase):
    """
    راستی‌آزمایی برابری رفتار رویداد scope_deleted با سیگنال پیشین حذف انبار:
    با دریافت رویداد حذف انبار ('warehouse', id)، شناسه‌های متناظر در ۵ مدل مالی
    خالی می‌شوند (None)، بدون اینکه رکوردهای مالی حذف شوند.
    """

    def setUp(self):
        self.company = Company.objects.create(
            code='TEST_COMP',
            name='شرکت آزمایشی',
            national_id='10101010101',
            is_active=True
        )

        self.wh_target_id = 999
        self.wh_other_id = 888

        # ۱. PersonnelProfile
        self.personnel_target = PersonnelProfile.objects.create(
            company=self.company,
            first_name='علی',
            last_name='انصاری',
            national_code='0011223344',
            assigned_warehouse_id=self.wh_target_id,
        )
        self.personnel_other = PersonnelProfile.objects.create(
            company=self.company,
            first_name='رضا',
            last_name='اکبری',
            national_code='0055667788',
            assigned_warehouse_id=self.wh_other_id,
        )

        # ۲. VehicleDriverProfile
        self.vehicle_target = VehicleDriverProfile.objects.create(
            company=self.company,
            driver_name='احمد نوری',
            plate_number='12-345-67',
            assigned_warehouse_id=self.wh_target_id,
        )
        self.vehicle_other = VehicleDriverProfile.objects.create(
            company=self.company,
            driver_name='محمد حسنی',
            plate_number='98-765-43',
            assigned_warehouse_id=self.wh_other_id,
        )

        # ۳. MonthlyWorkPeriod
        self.period_target = MonthlyWorkPeriod.objects.create(
            company=self.company,
            warehouse_id=self.wh_target_id,
            year_month='1405/01',
        )
        self.period_other = MonthlyWorkPeriod.objects.create(
            company=self.company,
            warehouse_id=self.wh_other_id,
            year_month='1405/02',
        )

        # ۴. DailyAttendance
        self.att_target = DailyAttendance.objects.create(
            personnel=self.personnel_target,
            date_shamsi='1405/01/10',
            warehouse_id=self.wh_target_id,
        )
        self.att_other = DailyAttendance.objects.create(
            personnel=self.personnel_other,
            date_shamsi='1405/01/10',
            warehouse_id=self.wh_other_id,
        )

        # ۵. VehicleTripLog
        self.trip_target = VehicleTripLog.objects.create(
            vehicle=self.vehicle_target,
            date_shamsi='1405/01/10',
            warehouse_id=self.wh_target_id,
        )
        self.trip_other = VehicleTripLog.objects.create(
            vehicle=self.vehicle_other,
            date_shamsi='1405/01/10',
            warehouse_id=self.wh_other_id,
        )


    def test_scope_deleted_clears_target_warehouse_without_deleting_records(self):
        """رویداد scope_deleted('warehouse', 999) باید فیلد انبار ۵ مدل هدف را None کند و رکوردهای دیگر دست‌نخورده بمانند."""
        # فراخوانی رویداد هسته
        scope_deleted('warehouse', self.wh_target_id)

        # بازخوانی رکوردها از پایگاه‌داده
        self.personnel_target.refresh_from_db()
        self.vehicle_target.refresh_from_db()
        self.period_target.refresh_from_db()
        self.att_target.refresh_from_db()
        self.trip_target.refresh_from_db()

        self.personnel_other.refresh_from_db()
        self.vehicle_other.refresh_from_db()
        self.period_other.refresh_from_db()
        self.att_other.refresh_from_db()
        self.trip_other.refresh_from_db()

        # ۱. فیلدهای انبار برای رکورد هدف باید None شده باشند
        self.assertIsNone(self.personnel_target.assigned_warehouse_id)
        self.assertIsNone(self.vehicle_target.assigned_warehouse_id)
        self.assertIsNone(self.period_target.warehouse_id)
        self.assertIsNone(self.att_target.warehouse_id)
        self.assertIsNone(self.trip_target.warehouse_id)

        # ۲. رکوردهای مالی حذف نشده‌اند و داده‌های آن‌ها سالم است
        self.assertEqual(self.personnel_target.first_name, 'علی')
        self.assertEqual(self.vehicle_target.driver_name, 'احمد نوری')
        self.assertEqual(self.period_target.year_month, '1405/01')

        # ۳. رکوردهای مربوط به انبار دیگر (wh_other_id) دست‌نخورده باقی مانده‌اند
        self.assertEqual(self.personnel_other.assigned_warehouse_id, self.wh_other_id)
        self.assertEqual(self.vehicle_other.assigned_warehouse_id, self.wh_other_id)
        self.assertEqual(self.period_other.warehouse_id, self.wh_other_id)
        self.assertEqual(self.att_other.warehouse_id, self.wh_other_id)
        self.assertEqual(self.trip_other.warehouse_id, self.wh_other_id)

    def test_scope_deleted_ignores_unrelated_kind(self):
        """رویداد با نوع غیر از 'warehouse' نباید فیلدهای انبار را پاک کند."""
        scope_deleted('company', self.wh_target_id)

        self.personnel_target.refresh_from_db()
        self.assertEqual(self.personnel_target.assigned_warehouse_id, self.wh_target_id)
