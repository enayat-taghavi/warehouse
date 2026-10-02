import jdatetime
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import CustomUser
from personnel.models import (
    Company,
    FinancialProject,
    ProjectSection,
    PersonnelProfile,
    DailyAttendance,
    PersonnelSectionAssignment
)


class MultiSectionAndLookupTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # شرکت و پروژه و بخش‌ها
        self.company = Company.objects.create(name="شرکت نفت و گاز پارسیان", national_id="10101010101")
        self.project1 = FinancialProject.objects.create(name="پروژه ۱ دالان", code="PRJ01", company=self.company)
        self.section1 = ProjectSection.objects.create(name="بخش کارگاه دالان", code="SEC01", project=self.project1)

        self.project2 = FinancialProject.objects.create(name="پروژه ۲ پارسیان", code="PRJ02", company=self.company)
        self.section2 = ProjectSection.objects.create(name="بخش ایستگاه پارسیان", code="SEC02", project=self.project2)

        # کاربر مدیر
        self.user = CustomUser.objects.create_user(
            username="admin_test",
            password="password123",
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        # پرسنل نمونه در بخش ۱
        self.personnel = PersonnelProfile.objects.create(
            first_name="رضا",
            last_name="پاینده",
            national_code="0012345679",  # کد ملی با رقم کنترلی معتبر (تسک ۲.۲)
            father_name="علی",
            phone_number="09121234567",
            job_title="کارشناس فنی دالان",
            daily_base_wage=Decimal("5000000"),
            bank_name="بانک ملی ایران",
            account_number="0101234567001",
            sheba_number="IR000170000000101234567001",
            section=self.section1,
            company=self.company,
            approval_status="approved",
            is_active=True
        )

    def test_lookup_by_national_code(self):
        """تست ۱: استعلام پرونده پرسنل با کد ملی جهت فراخوانی خودکار مشخصات هویتی و بانکی"""
        # کد ملی موجود
        resp = self.client.get(f"/api/personnel/profiles/lookup-by-national-code/?national_code=0012345679")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["found"])
        p_data = resp.data["personnel"]
        self.assertEqual(p_data["first_name"], "رضا")
        self.assertEqual(p_data["last_name"], "پاینده")
        self.assertEqual(p_data["phone_number"], "09121234567")
        self.assertEqual(p_data["bank_name"], "بانک ملی ایران")
        self.assertEqual(p_data["current_section_id"], self.section1.id)
        self.assertEqual(p_data["current_section_name"], self.section1.name)

        # کد ملی معتبر ولی ناموجود
        resp_nf = self.client.get(f"/api/personnel/profiles/lookup-by-national-code/?national_code=0098765434")
        self.assertEqual(resp_nf.status_code, 200)
        self.assertFalse(resp_nf.data["found"])

        # کد ملی با رقم کنترلی نامعتبر در سرور رد می‌شود (تسک ۲.۲)
        resp_bad = self.client.get(f"/api/personnel/profiles/lookup-by-national-code/?national_code=9999999999")
        self.assertEqual(resp_bad.status_code, 400)

    def test_assign_personnel_to_second_section(self):
        """تست ۲: انتساب پرسنل موجود به بخش دوم با سمت و دستمزد مجزا و نمایش در هر دو بخش"""
        assign_payload = {
            "section_id": self.section2.id,
            "job_title": "سرپرست کارگاه پارسیان",
            "daily_base_wage": 7500000,
            "notes": "انتقال ماموریتی جهت هماهنگی فاز دوم"
        }
        resp = self.client.post(f"/api/personnel/profiles/{self.personnel.id}/assign-section/", assign_payload, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("با موفقیت به بخش", resp.data["message"])

        # پرسنل باید در بخش ۱ دیده شود و سمت شغلی بخش ۱ را نشان دهد
        resp_sec1 = self.client.get(f"/api/personnel/profiles/?section_id={self.section1.id}")
        self.assertEqual(resp_sec1.status_code, 200)
        p1 = next((p for p in resp_sec1.data if p["id"] == self.personnel.id), None)
        self.assertIsNotNone(p1)
        self.assertEqual(p1["job_title"], "کارشناس فنی دالان")
        self.assertEqual(float(p1["daily_base_wage"]), 5000000.0)

        # پرسنل باید در بخش ۲ نیز دیده شود و سمت شغلی و دستمزد مستقل بخش ۲ را نشان دهد
        resp_sec2 = self.client.get(f"/api/personnel/profiles/?section_id={self.section2.id}")
        self.assertEqual(resp_sec2.status_code, 200)
        p2 = next((p for p in resp_sec2.data if p["id"] == self.personnel.id), None)
        self.assertIsNotNone(p2)
        self.assertEqual(p2["job_title"], "سرپرست کارگاه پارسیان")
        self.assertEqual(float(p2["daily_base_wage"]), 7500000.0)

    def test_attendance_in_both_sections_and_conflict_prevention(self):
        """تست ۳: ثبت کارکرد در دو بخش و جلوگیری از تداخل دو حاضر کامل در یک روز"""
        # انتساب به بخش ۲
        PersonnelSectionAssignment.objects.create(
            personnel=self.personnel,
            section=self.section2,
            project=self.project2,
            job_title="سرپرست کارگاه پارسیان",
            daily_base_wage=Decimal("7500000"),
            is_active=True
        )

        test_date = jdatetime.date.today().strftime("%Y/%m/%d")

        # ثبت حاضر کامل در بخش ۱
        payload1 = {
            "date_shamsi": test_date,
            "section_id": self.section1.id,
            "project_id": self.project1.id,
            "items": [
                {
                    "personnel_id": self.personnel.id,
                    "status": "PRESENT_10H",
                    "effective_hours": 10.0,
                    "overtime_hours": 0.0,
                    "is_friday_work": False,
                    "is_mission": False,
                    "advance_payment": 0
                }
            ]
        }
        res1 = self.client.post("/api/personnel/attendance/bulk-save/", payload1, format="json")
        self.assertEqual(res1.status_code, 200)

        # تلاش برای ثبت مجدد «حاضر کامل» (۱۰ ساعت) در همان روز در بخش ۲ -> باید با خطا رد شود
        payload2_conflicting = {
            "date_shamsi": test_date,
            "section_id": self.section2.id,
            "project_id": self.project2.id,
            "items": [
                {
                    "personnel_id": self.personnel.id,
                    "status": "PRESENT_10H",
                    "effective_hours": 10.0,
                    "overtime_hours": 0.0,
                    "is_friday_work": False,
                    "is_mission": False,
                    "advance_payment": 0
                }
            ]
        }
        res2 = self.client.post("/api/personnel/attendance/bulk-save/", payload2_conflicting, format="json")
        self.assertEqual(res2.status_code, 400)
        self.assertIn("حاضر کامل", res2.data["error"])

        # ثبت قانونی به صورت نیمه‌وقت (۵ ساعت) در بخش ۲ -> باید با موفقیت ثبت شود
        payload2_valid = {
            "date_shamsi": test_date,
            "section_id": self.section2.id,
            "project_id": self.project2.id,
            "items": [
                {
                    "personnel_id": self.personnel.id,
                    "status": "HALF_5H",
                    "effective_hours": 5.0,
                    "overtime_hours": 0.0,
                    "is_friday_work": False,
                    "is_mission": False,
                    "advance_payment": 0
                }
            ]
        }
        res3 = self.client.post("/api/personnel/attendance/bulk-save/", payload2_valid, format="json")
        self.assertEqual(res3.status_code, 200)

        # بررسی تفکیک ماتریس حضور و غیاب هر دو بخش
        mat1 = self.client.get(f"/api/personnel/attendance/matrix/?section_id={self.section1.id}&date_shamsi={test_date}")
        self.assertEqual(mat1.status_code, 200)
        row1 = next(r for r in mat1.data["rows"] if r["personnel_id"] == self.personnel.id)
        self.assertEqual(row1["status"], "PRESENT_10H")
        self.assertEqual(row1["effective_hours"], 10.0)

        mat2 = self.client.get(f"/api/personnel/attendance/matrix/?section_id={self.section2.id}&date_shamsi={test_date}")
        self.assertEqual(mat2.status_code, 200)
        row2 = next(r for r in mat2.data["rows"] if r["personnel_id"] == self.personnel.id)
        self.assertEqual(row2["status"], "HALF_5H")
        self.assertEqual(row2["effective_hours"], 5.0)

        # بررسی عدم تداخل در پاکسازی: پاکسازی کارکرد روز در بخش ۱ نباید بخش ۲ را پاک کند
        clear_res = self.client.post("/api/personnel/attendance/clear-day/", {
            "date_shamsi": test_date,
            "section_id": self.section1.id
        }, format="json")
        self.assertEqual(clear_res.status_code, 200)

        # کارکرد بخش ۲ همچنان باید ۵ ساعت و فعال باقی بماند
        mat2_after = self.client.get(f"/api/personnel/attendance/matrix/?section_id={self.section2.id}&date_shamsi={test_date}")
        row2_after = next(r for r in mat2_after.data["rows"] if r["personnel_id"] == self.personnel.id)
        self.assertEqual(row2_after["status"], "HALF_5H")
        self.assertEqual(row2_after["effective_hours"], 5.0)
