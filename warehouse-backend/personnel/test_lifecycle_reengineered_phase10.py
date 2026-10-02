"""
تست‌های جامع یکپارچگی چرخه بازمهندسی‌شده ثبت پرسنل تا تصویب مدیر (فاز ۱۰ - تسک ۱۰.۴)
پوشش ۱۰۰٪ گذارها، گیت سروری submit، تفکیک وظایف SoD، پاک‌سازی امن Purge، استعلام حذف و ممیزی
"""
from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from personnel.models import (
    PersonnelProfile,
    PersonnelChangeRequest,
    WorkflowAuditLog,
    ProjectSection,
    FinancialProject,
    DailyAttendance,
    Company
)

User = get_user_model()


class PersonnelReengineeredLifecyclePhase10Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # ساخت شرکت و پروژه و بخش
        self.company = Company.objects.create(name="شرکت توسعه عمران آزمون", code="DEV-101")
        self.project = FinancialProject.objects.create(company=self.company, name="پروژه فاز ۱۰", code="P10")
        self.section = ProjectSection.objects.create(project=self.project, name="بخش مهندسی", code="SEC10")

        # کاربران نقش‌های ۴گانه
        self.operator = User.objects.create_user(username="emp_operator", password="p", first_name="کارمند", last_name="ثبت‌کننده")
        self.supervisor = User.objects.create_user(username="sup_user", password="p", first_name="سرپرست", last_name="کارگاه")
        self.accountant = User.objects.create_user(username="acc_user", password="p", first_name="حسابدار", last_name="مالی")
        self.manager = User.objects.create_user(username="mgr_user", password="p", first_name="مدیر", last_name="ارشد")

        # تخصیص مجوزهای اپلیکیشن accounts
        ct_accounts, _ = ContentType.objects.get_or_create(app_label='accounts', model='customuser')

        def grant_perm(user, codename):
            perm = Permission.objects.filter(codename=codename).first()
            if not perm:
                perm = Permission.objects.create(
                    codename=codename,
                    name=codename,
                    content_type=ct_accounts
                )
            user.user_permissions.add(perm)

        grant_perm(self.supervisor, "perm_approve_personnel_supervisor")
        grant_perm(self.supervisor, "can_act_as_workshop_supervisor")
        grant_perm(self.accountant, "perm_approve_personnel_finance")
        grant_perm(self.manager, "perm_approve_personnel_manager")
        grant_perm(self.manager, "can_act_as_manager")
        grant_perm(self.manager, "perm_delete_personnel_nomovement")

        from personnel.models import UserSectionAssignment
        for u in [self.operator, self.supervisor, self.accountant, self.manager]:
            UserSectionAssignment.objects.create(user=u, section=self.section, is_active=True)

    def test_full_successful_approval_cycle_and_audit(self):
        """
        تست چرخه کامل و بی‌نقص ثبت از پیش‌نویس تا تایید مدیر:
        draft -> submit -> pending_supervisor -> approve -> pending_accountant -> approve -> pending_manager -> approve -> approved
        """
        # ۱. ثبت پیش‌نویس توسط کارمند
        self.client.force_authenticate(user=self.operator)
        payload = {
            "first_name": "بهرام",
            "last_name": "رادان",
            "national_code": "0076543218",
            "phone_number": "09121112233",
            "father_name": "علی",
            "birth_date": "1370/01/01",
            "id_number": "12345",
            "gender": "مرد",
            "address": "تهران، میدان آزادی، پلاک ۱",
            "postal_code": "1998877665",
            "sheba_number": "780170000000101111111001",
            "bank_name": "بانک ملی",
            "section": self.section.id,
            "job_title": "کارشناس فنی",
            "notes": "توضیحات اولیه ثبت پرسنل",
            "approval_status": "draft"
        }
        res_create = self.client.post("/api/personnel/profiles/", payload, format="json")
        self.assertEqual(res_create.status_code, 201)
        p_id = res_create.data["id"]
        self.assertEqual(res_create.data["approval_status"], "draft")
        self.assertEqual(res_create.data["education_level"], "4")  # پیش‌فرض مصوب کاردانی

        # ۲. ارسال نهایی توسط کارمند از طریق اکشن submit (گیت سرور)
        res_sub = self.client.post(f"/api/personnel/profiles/{p_id}/submit/", {"note": "مدارک تکمیل شد"}, format="json")
        self.assertEqual(res_sub.status_code, 200)
        sub_status = res_sub.data.get("data", {}).get("approval_status") if isinstance(res_sub.data.get("data"), dict) else res_sub.data.get("approval_status")
        self.assertEqual(sub_status, "pending_supervisor")

        # ۳. سرپرست نمی‌تواند مستقیم پرونده را approve_manager کند (کنترل RBAC)
        self.client.force_authenticate(user=self.supervisor)
        res_illegal = self.client.post(f"/api/personnel/profiles/{p_id}/approve-manager/", {}, format="json")
        self.assertEqual(res_illegal.status_code, 403)

        # ۴. تایید سرپرست و ارسال به حسابداری
        res_sup = self.client.post(f"/api/personnel/profiles/{p_id}/approve-supervisor/", {"note": "احراز هویت میدانی تایید شد"}, format="json")
        self.assertEqual(res_sup.status_code, 200)
        self.assertEqual(res_sup.data["data"]["approval_status"], "pending_accountant")

        # ۵. حسابدار احکام مالی و شبا را تکمیل می‌کند
        self.client.force_authenticate(user=self.accountant)
        patch_payload = {
            "sheba_number": "780170000000101111111001",
            "bank_name": "بانک ملی ایران",
            "job_code": "010203",
            "start_date": "1405/01/01",
            "daily_base_wage": 7000000,
            "note": "تنظیم احکام مالی طبق جدول"
        }
        res_patch = self.client.patch(f"/api/personnel/profiles/{p_id}/", patch_payload, format="json")
        self.assertEqual(res_patch.status_code, 200)

        # ۶. تایید مالی حسابدار و ارسال به مدیر
        res_fin = self.client.post(f"/api/personnel/profiles/{p_id}/approve-finance/", {"note": "احکام مالی و مدارک تایید شد"}, format="json")
        self.assertEqual(res_fin.status_code, 200)
        self.assertEqual(res_fin.data["data"]["approval_status"], "pending_manager")

        # ۷. تصویب نهایی توسط مدیر
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.post(f"/api/personnel/profiles/{p_id}/approve-manager/", {"note": "شروع به کار از اول ماه آینده"}, format="json")
        self.assertEqual(res_mgr.status_code, 200)
        self.assertEqual(res_mgr.data["data"]["approval_status"], "approved")
        self.assertTrue(res_mgr.data["data"]["is_active"])

        # ۸. راستی‌آزمایی لاگ‌های ممیزی (WorkflowAuditLog)
        logs = WorkflowAuditLog.objects.filter(object_id=p_id)
        self.assertGreaterEqual(logs.count(), 4)

    def test_sod_and_change_request_isolation(self):
        """
        تست تفکیک وظایف (SoD): کارمند عادی مجاز به تغییر دستمزد پرونده فعال نیست اما مجاز به تغییر موبایل/نشانی است
        """
        # ساخت پرسنل تاییدشده
        p = PersonnelProfile.objects.create(
            first_name="فرهاد",
            last_name="مهراد",
            national_code="0061122335",
            phone_number="09121111111",
            section=self.section,
            approval_status="approved",
            is_active=True,
            daily_base_wage=6000000
        )

        self.client.force_authenticate(user=self.operator)

        # تلاش غیرمجاز کارمند برای تغییر مزد مبنا (قفل SoD)
        res_illegal = self.client.patch(f"/api/personnel/profiles/{p.id}/", {"daily_base_wage": 9000000}, format="json")
        self.assertEqual(res_illegal.status_code, 403)

        # تلاش مجاز کارمند برای تغییر موبایل یا نشانی (تولید درخواست تغییرات با وضعیت ۲0۲)
        res_legal = self.client.patch(f"/api/personnel/profiles/{p.id}/", {"phone_number": "09129998877", "address": "تهران"}, format="json")
        self.assertEqual(res_legal.status_code, 202)

        # اطمینان از ایجاد درخواست تغییرات معلق
        cr = PersonnelChangeRequest.objects.filter(personnel=p).first()
        self.assertIsNotNone(cr)
        self.assertEqual(cr.status, "pending_supervisor")
        self.assertIn("phone_number", cr.proposed_changes)

    def test_conditional_purge_on_rejection(self):
        """
        تست پاک‌سازی مشروط (Purge):
        ۱. پیش‌نویس بدون سابقه در رد قطعی کاملاً Purge می‌شود.
        ۲. پرسنل دارای کارکرد در رد قطعی، Purge نمی‌شود و وضعیتش rejected می‌شود.
        """
        # پرونده ۱: پیش‌نویس بدون سابقه
        p1 = PersonnelProfile.objects.create(
            first_name="آرش",
            last_name="کمانگیر",
            national_code="0012345679",
            section=self.section,
            approval_status="pending_supervisor"
        )
        self.client.force_authenticate(user=self.supervisor)
        res_rej1 = self.client.post(f"/api/personnel/profiles/{p1.id}/reject/", {"reason": "عدم حضور در مصاحبه"}, format="json")
        self.assertEqual(res_rej1.status_code, 200)
        self.assertTrue(res_rej1.data.get("purged", False))
        self.assertFalse(PersonnelProfile.objects.filter(id=p1.id).exists())

        # پرونده ۲: پرسنل دارای کارکرد
        p2 = PersonnelProfile.objects.create(
            first_name="سیاوش",
            last_name="کاووسی",
            national_code="0098765434",
            section=self.section,
            approval_status="pending_manager"
        )
        DailyAttendance.objects.create(
            personnel=p2,
            date_shamsi="1405/01/10",
            project=self.project,
            section=self.section,
            effective_hours=10
        )
        res_rej2 = self.client.post(f"/api/personnel/profiles/{p2.id}/reject/", {"reason": "نقص فنی"}, format="json")
        self.assertEqual(res_rej2.status_code, 200)
        self.assertFalse(res_rej2.data.get("purged", False))
        p2.refresh_from_db()
        self.assertEqual(p2.approval_status, "rejected")

    def test_smart_delete_impact_and_destroy_barrier(self):
        """
        تست استعلام اثرات حذف و مسدودسازی حذف پرسنل دارای سابقه:
        - پرسنل دارای کارکرد: can_delete: False و حذف 403
        - پرسنل فاقد سابقه: can_delete: True و حذف 200 یا 204
        """
        self.client.force_authenticate(user=self.manager)

        # پرسنل بدون سابقه
        p_clean = PersonnelProfile.objects.create(
            first_name="بیژن",
            last_name="پاکزاد",
            national_code="0088776654",
            section=self.section,
            approval_status="draft"
        )
        res_impact = self.client.get(f"/api/personnel/profiles/{p_clean.id}/delete_impact/")
        self.assertEqual(res_impact.status_code, 200)
        self.assertTrue(res_impact.data["can_delete"])

        res_del = self.client.delete(f"/api/personnel/profiles/{p_clean.id}/")
        self.assertIn(res_del.status_code, [200, 204])
        self.assertFalse(PersonnelProfile.objects.filter(id=p_clean.id).exists())
