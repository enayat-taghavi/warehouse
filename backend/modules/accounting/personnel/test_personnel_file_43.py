"""
Step 4.3-b: personnel file scenario API tests on workflow engine 2.3.
Full flow, step enforcement, accountant gates, rejection & SoD, change requests,
batch approve, command idempotency, and cross-company scoping + pagination.
"""
import io
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.models import (
    PersonnelChangeRequest,
    PersonnelProfile,
    Project,
    ProjectSection,
    SectionAssignment,
)
from personnel.scoped_test_support import grant_section_perms
from personnel.sheba_utils import generate_sheba_from_account
from workflow.models import WorkflowInstance, WorkflowTask

User = get_user_model()


def make_nc(prefix: str) -> str:
    s = sum(int(prefix[i]) * (10 - i) for i in range(9))
    r = s % 11
    check = r if r < 2 else 11 - r
    return f"{prefix}{check}"


VALID_SHEBA = generate_sheba_from_account("بانک ملی ایران", "0105678901004")


class PersonnelFile43Tests(TestCase):
    def setUp(self):
        self.company, _ = Company.objects.get_or_create(
            code="PF43-CO",
            defaults={"name": "شرکت تست پرونده ۴۳", "is_active": True}
        )
        self.project, _ = Project.objects.get_or_create(
            code="PF43-P",
            defaults={"name": "پروژه ۴۳", "company": self.company, "is_active": True}
        )
        if not self.project.company_id:
            self.project.company = self.company
            self.project.save(update_fields=['company'])
        self.section, _ = ProjectSection.objects.get_or_create(
            project=self.project,
            code="PF43-S",
            defaults={"name": "بخش ۴۳", "is_active": True}
        )

        self.operator, _ = User.objects.get_or_create(
            username="pf43_operator",
            defaults={"first_name": "قاسم", "last_name": "عالیشوندی"}
        )
        self.supervisor, _ = User.objects.get_or_create(
            username="pf43_supervisor",
            defaults={"first_name": "رزاق", "last_name": "حسینی"}
        )
        self.accountant, _ = User.objects.get_or_create(
            username="pf43_accountant",
            defaults={"first_name": "مهری", "last_name": "باقری"}
        )
        self.manager, _ = User.objects.get_or_create(
            username="pf43_manager",
            defaults={"first_name": "سید", "last_name": "موسوی"}
        )

        for codename in ["perm_approve_personnel_supervisor", "perm_approve_fleet_supervisor", "view_sys_personnel"]:
            p = Permission.objects.filter(codename=codename).first()
            if p:
                self.supervisor.user_permissions.add(p)

        for codename in ["perm_approve_personnel_finance", "perm_approve_fleet_finance", "view_sys_personnel"]:
            p = Permission.objects.filter(codename=codename).first()
            if p:
                self.accountant.user_permissions.add(p)

        for codename in ["perm_approve_personnel_manager", "can_act_as_manager", "perm_approve_fleet_manager", "view_sys_personnel"]:
            p = Permission.objects.filter(codename=codename).first()
            if p:
                self.manager.user_permissions.add(p)

        p_view = Permission.objects.filter(codename="view_sys_personnel").first()
        if p_view:
            self.operator.user_permissions.add(p_view)

        for u, r in [
            (self.operator, "employee"),
            (self.supervisor, "supervisor"),
            (self.accountant, "accountant"),
            (self.manager, "manager"),
        ]:
            SectionAssignment.objects.get_or_create(user=u, section=self.section, defaults={"role": r, "is_active": True})
            UserCompanyAccess.objects.get_or_create(user=u, company=self.company, defaults={"is_default": True})

        self.client = APIClient()

    def call(self, user, method, url, data=None, company=None, fmt='json'):
        c = APIClient()
        c.force_authenticate(user)
        kwargs = {'HTTP_X_COMPANY_ID': str((company or self.company).pk)}
        if method == 'get':
            return c.get(url, data or {}, **kwargs)
        return getattr(c, method)(url, data or {}, format=fmt, **kwargs)

    def make_payload(self, nat_code=None, **overrides):
        nc = nat_code or make_nc("228012345")
        data = {
            "first_name": "سهراب",
            "last_name": "مرادی",
            "national_code": nc,
            "father_name": "محمد",
            "birth_date": "1365/03/08",
            "id_number": "1234",
            "gender": "مرد",
            "address": "بوشهر، دالان، کوی کارگران",
            "postal_code": "7514765432",
            "job_title": "استادکار تعمیرات و نگهداری",
            "contract_type": "daily",
            "daily_base_wage": 3850000,
            "daily_seniority_bonus": 70000,
            "housing_allowance": 9000000,
            "food_allowance": 14000000,
            "marital_status": "married",
            "spouse_allowance": 5000000,
            "children_count": 1,
            "phone_number": "09171234567",
            "bank_name": "بانک ملی ایران",
            "account_number": "0105678901004",
            "sheba_number": VALID_SHEBA,
            "section": self.section.id,
            "project": self.project.id,
            "approval_status": "draft",
            "is_active": True,
        }
        data.update(overrides)
        return data

    def _create_and_submit_profile(self, user=None, nat_code=None, **overrides):
        u = user or self.operator
        payload = self.make_payload(nat_code=nat_code, **overrides)
        resp_c = self.call(u, "post", "/api/personnel/profiles/", payload)
        self.assertEqual(resp_c.status_code, 201)
        pid = resp_c.data["id"]
        resp_s = self.call(u, "post", f"/api/personnel/profiles/{pid}/submit/", {})
        self.assertEqual(resp_s.status_code, 200)
        return pid

    def _create_approved_profile(self, nat_code=None):
        pid = self._create_and_submit_profile(nat_code=nat_code)
        resp_sup = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid}/approve-supervisor/", {})
        self.assertEqual(resp_sup.status_code, 200)
        resp_patch = self.call(self.accountant, "patch", f"/api/personnel/profiles/{pid}/", {
            "job_code": "000255",
            "start_date": "1405/01/01",
            "daily_base_wage": 3850000,
            "daily_seniority_bonus": 70000,
            "note": "تعیین احکام مالی",
        })
        self.assertEqual(resp_patch.status_code, 200)
        resp_fin = self.call(self.accountant, "post", f"/api/personnel/profiles/{pid}/approve-finance/", {})
        self.assertEqual(resp_fin.status_code, 200)
        resp_mgr = self.call(self.manager, "post", f"/api/personnel/profiles/{pid}/approve-manager/", {})
        self.assertEqual(resp_mgr.status_code, 200)
        return pid

    def test_full_flow_on_engine(self):
        payload = self.make_payload(make_nc("228012301"))
        payload.pop("father_name", None)
        payload.pop("address", None)
        resp_create = self.call(self.operator, "post", "/api/personnel/profiles/", payload)
        self.assertEqual(resp_create.status_code, 201)
        created_id = resp_create.data["id"]
        self.assertEqual(resp_create.data["approval_status"], "draft")

        resp_submit_fail = self.call(self.operator, "post", f"/api/personnel/profiles/{created_id}/submit/", {})
        self.assertEqual(resp_submit_fail.status_code, 400)
        self.assertIn("missing_fields", resp_submit_fail.data)
        missing_keys = [m["field"] for m in resp_submit_fail.data["missing_fields"]]
        self.assertIn("father_name", missing_keys)
        self.assertIn("address", missing_keys)

        resp_patch = self.call(self.operator, "patch", f"/api/personnel/profiles/{created_id}/", {
            "father_name": "محمد",
            "address": "بوشهر، دالان، کوی کارگران",
        })
        self.assertEqual(resp_patch.status_code, 200)

        resp_submit = self.call(self.operator, "post", f"/api/personnel/profiles/{created_id}/submit/", {})
        self.assertEqual(resp_submit.status_code, 200)
        self.assertEqual(resp_submit.data["approval_status"], "pending_supervisor")

        resp_sup = self.call(self.supervisor, "post", f"/api/personnel/profiles/{created_id}/approve-supervisor/", {})
        self.assertEqual(resp_sup.status_code, 200)
        self.assertEqual(resp_sup.data["data"]["approval_status"], "pending_accountant")

        resp_acc_edit = self.call(self.accountant, "patch", f"/api/personnel/profiles/{created_id}/", {
            "job_code": "000255",
            "start_date": "1405/01/01",
            "daily_base_wage": 3850000,
            "daily_seniority_bonus": 70000,
            "note": "تعیین احکام مالی",
        })
        self.assertEqual(resp_acc_edit.status_code, 200)

        resp_fin = self.call(self.accountant, "post", f"/api/personnel/profiles/{created_id}/approve-finance/", {})
        self.assertEqual(resp_fin.status_code, 200)
        self.assertEqual(resp_fin.data["data"]["approval_status"], "pending_manager")

        resp_mgr = self.call(self.manager, "post", f"/api/personnel/profiles/{created_id}/approve-manager/", {})
        self.assertEqual(resp_mgr.status_code, 200)
        self.assertEqual(resp_mgr.data["data"]["approval_status"], "approved")
        self.assertTrue(resp_mgr.data["data"]["is_active"])

        wf_inst = WorkflowInstance.objects.filter(
            entity_kind="personnel_profile",
            entity_id=str(created_id),
            status=WorkflowInstance.COMPLETED,
        ).first()
        self.assertIsNotNone(wf_inst)

    def test_manager_cannot_skip_accountant(self):
        pid = self._create_and_submit_profile(nat_code=make_nc("228012302"))

        resp_mgr1 = self.call(self.manager, "post", f"/api/personnel/profiles/{pid}/approve-manager/", {})
        self.assertEqual(resp_mgr1.status_code, 400)
        self.assertEqual(resp_mgr1.data.get("code"), "wrong_step")

        resp_sup = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid}/approve-supervisor/", {})
        self.assertEqual(resp_sup.status_code, 200)
        self.assertEqual(resp_sup.data["data"]["approval_status"], "pending_accountant")

        resp_mgr2 = self.call(self.manager, "post", f"/api/personnel/profiles/{pid}/approve-manager/", {})
        self.assertEqual(resp_mgr2.status_code, 400)
        self.assertEqual(resp_mgr2.data.get("code"), "wrong_step")

        prof = PersonnelProfile.objects.get(pk=pid)
        self.assertEqual(prof.approval_status, "pending_accountant")

    def test_accountant_gate_on_both_paths(self):
        pid = self._create_and_submit_profile(nat_code=make_nc("228012303"))
        resp_sup = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid}/approve-supervisor/", {})
        self.assertEqual(resp_sup.status_code, 200)
        self.assertEqual(resp_sup.data["data"]["approval_status"], "pending_accountant")

        resp_fin = self.call(self.accountant, "post", f"/api/personnel/profiles/{pid}/approve-finance/", {})
        self.assertEqual(resp_fin.status_code, 400)
        self.assertEqual(resp_fin.data.get("code"), "action_blocked")

        task = WorkflowTask.objects.filter(
            instance__entity_kind="personnel_profile",
            instance__entity_id=str(pid),
            is_open=True,
        ).first()
        self.assertIsNotNone(task)

        resp_task = self.call(self.accountant, "post", f"/api/workflow/tasks/{task.pk}/action/", {"action": "act"})
        self.assertEqual(resp_task.status_code, 400)
        self.assertEqual(resp_task.data.get("code"), "action_blocked")

        resp_rev = self.call(self.accountant, "post", f"/api/personnel/profiles/{pid}/request-revision/", {
            "reason": "لطفاً کد شغل و احکام مالی تعیین شود",
        })
        self.assertEqual(resp_rev.status_code, 200)
        self.assertEqual(resp_rev.data["data"]["approval_status"], "revision_required")

        resp_resub = self.call(self.operator, "post", f"/api/personnel/profiles/{pid}/submit/", {})
        self.assertEqual(resp_resub.status_code, 200)
        self.assertEqual(resp_resub.data["approval_status"], "pending_supervisor")

        prof = PersonnelProfile.objects.get(pk=pid)
        self.assertEqual(prof.approval_status, "pending_supervisor")

    def test_reject_and_self_approval(self):
        pid1 = self._create_and_submit_profile(nat_code=make_nc("228012304"))

        resp_rej_no_reason = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid1}/reject/", {})
        self.assertEqual(resp_rej_no_reason.status_code, 400)
        self.assertEqual(resp_rej_no_reason.data.get("code"), "reason_required")

        resp_rej = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid1}/reject/", {
            "reason": "مدارک هویتی مخدوش است",
        })
        self.assertEqual(resp_rej.status_code, 200)
        self.assertEqual(resp_rej.data["data"]["approval_status"], "rejected")
        self.assertFalse(resp_rej.data.get("purged", True))
        self.assertTrue(PersonnelProfile.objects.filter(pk=pid1).exists())

        pid_sup = self._create_and_submit_profile(user=self.supervisor, nat_code=make_nc("228012305"))
        resp_self = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid_sup}/approve-supervisor/", {})
        self.assertIn(resp_self.status_code, (400, 403))
        self.assertNotEqual(resp_self.status_code, 200)

    def test_change_request_applies_on_completion(self):
        pid = self._create_approved_profile(nat_code=make_nc("228012306"))
        prof = PersonnelProfile.objects.get(pk=pid)
        orig_phone = prof.phone_number

        new_phone = "09170000000"
        resp_patch = self.call(self.operator, "patch", f"/api/personnel/profiles/{pid}/", {
            "phone_number": new_phone,
        })
        self.assertEqual(resp_patch.status_code, 202)
        cr_id = resp_patch.data["change_request_id"]

        prof.refresh_from_db()
        self.assertTrue(prof.has_pending_changes)
        self.assertEqual(prof.phone_number, orig_phone)

        resp_self_app = self.call(self.operator, "post", f"/api/personnel/personnel-change-requests/{cr_id}/approve-supervisor/", {})
        self.assertIn(resp_self_app.status_code, (400, 403))

        resp_sup = self.call(self.supervisor, "post", f"/api/personnel/personnel-change-requests/{cr_id}/approve-supervisor/", {})
        self.assertEqual(resp_sup.status_code, 200)

        resp_acc = self.call(self.accountant, "post", f"/api/personnel/personnel-change-requests/{cr_id}/approve-finance/", {})
        self.assertEqual(resp_acc.status_code, 200)

        resp_mgr = self.call(self.manager, "post", f"/api/personnel/personnel-change-requests/{cr_id}/approve-manager/", {})
        self.assertEqual(resp_mgr.status_code, 200)

        cr = PersonnelChangeRequest.objects.get(pk=cr_id)
        self.assertEqual(cr.status, "approved")

        prof.refresh_from_db()
        self.assertEqual(prof.phone_number, new_phone)
        self.assertFalse(prof.has_pending_changes)

        newer_phone = "09171111111"
        resp_patch2 = self.call(self.operator, "patch", f"/api/personnel/profiles/{pid}/", {
            "phone_number": newer_phone,
        })
        self.assertEqual(resp_patch2.status_code, 202)
        cr_id2 = resp_patch2.data["change_request_id"]

        prof.refresh_from_db()
        self.assertTrue(prof.has_pending_changes)

        resp_rej = self.call(self.supervisor, "post", f"/api/personnel/personnel-change-requests/{cr_id2}/reject/", {
            "reason": "تغییر شماره مجدداً تأیید نمی‌شود",
        })
        self.assertEqual(resp_rej.status_code, 200)

        cr2 = PersonnelChangeRequest.objects.get(pk=cr_id2)
        self.assertEqual(cr2.status, "rejected")

        prof.refresh_from_db()
        self.assertFalse(prof.has_pending_changes)
        self.assertEqual(prof.phone_number, new_phone)

    def test_batch_approve_per_row(self):
        pid1 = self._create_and_submit_profile(nat_code=make_nc("228012307"))
        pid2 = self._create_and_submit_profile(nat_code=make_nc("228012308"))

        payload3 = self.make_payload(nat_code=make_nc("228012309"))
        resp_c3 = self.call(self.operator, "post", "/api/personnel/profiles/", payload3)
        self.assertEqual(resp_c3.status_code, 201)
        pid3 = resp_c3.data["id"]

        resp_batch = self.call(self.supervisor, "post", "/api/personnel/profiles/batch-approve/", {
            "ids": [pid1, pid2, pid3],
            "stage": "supervisor",
        })
        self.assertEqual(resp_batch.status_code, 200)
        results = resp_batch.data.get("results", [])
        self.assertEqual(len(results), 3)

        res_map = {r["id"]: r for r in results}
        self.assertTrue(res_map[pid1]["success"])
        self.assertEqual(res_map[pid1]["approval_status"], "pending_accountant")

        self.assertTrue(res_map[pid2]["success"])
        self.assertEqual(res_map[pid2]["approval_status"], "pending_accountant")

        self.assertFalse(res_map[pid3]["success"])

        p1 = PersonnelProfile.objects.get(pk=pid1)
        p2 = PersonnelProfile.objects.get(pk=pid2)
        p3 = PersonnelProfile.objects.get(pk=pid3)
        self.assertEqual(p1.approval_status, "pending_accountant")
        self.assertEqual(p2.approval_status, "pending_accountant")
        self.assertEqual(p3.approval_status, "draft")

    def test_open_workflows_command_idempotent(self):
        nc = make_nc("228012310")
        prof = PersonnelProfile.objects.create(
            company=self.company,
            project=self.project,
            section=self.section,
            created_by=self.operator,
            first_name="محمود",
            last_name="صادقی",
            national_code=nc,
            job_title="انباردار",
            approval_status="pending_accountant",
            is_active=True,
        )
        self.assertEqual(WorkflowInstance.objects.filter(workflow_key="personnel_profile", entity_id=str(prof.id)).count(), 0)

        out = io.StringIO()
        call_command("personnel_open_workflows", stdout=out)

        tasks = WorkflowTask.objects.filter(
            instance__entity_kind="personnel_profile",
            instance__entity_id=str(prof.id),
            is_open=True,
        )
        self.assertEqual(tasks.count(), 1)
        task = tasks.first()
        self.assertEqual(task.step_key, "accountant_review")

        prof.refresh_from_db()
        self.assertEqual(prof.approval_status, "pending_accountant")

        out2 = io.StringIO()
        call_command("personnel_open_workflows", stdout=out2)

        instances = WorkflowInstance.objects.filter(
            workflow_key="personnel_profile",
            entity_id=str(prof.id),
        )
        self.assertEqual(instances.count(), 1)

    def test_other_company_and_paging(self):
        co_other = Company.objects.create(code="PF43-OTHER", name="شرکت دیگر", is_active=True)
        proj_other = Project.objects.create(code="PF43-OP", name="پروژه دیگر", company=co_other, is_active=True)
        sec_other = ProjectSection.objects.create(code="PF43-OS", name="بخش دیگر", project=proj_other, is_active=True)

        other_accountant = User.objects.create_user(username="pf43_other_acc", password="x")
        UserCompanyAccess.objects.create(user=other_accountant, company=co_other, is_default=True)
        grant_section_perms(other_accountant, ["perm_approve_personnel_finance", "view_sys_personnel"], section=sec_other, role="accountant", exact=False)

        pid = self._create_and_submit_profile(nat_code=make_nc("228012311"))
        resp_sup = self.call(self.supervisor, "post", f"/api/personnel/profiles/{pid}/approve-supervisor/", {})
        self.assertEqual(resp_sup.status_code, 200)

        task = WorkflowTask.objects.filter(
            instance__entity_kind="personnel_profile",
            instance__entity_id=str(pid),
            is_open=True,
        ).first()
        self.assertIsNotNone(task)

        resp_get = self.call(other_accountant, "get", f"/api/personnel/profiles/{pid}/", company=co_other)
        self.assertEqual(resp_get.status_code, 404)

        resp_app = self.call(other_accountant, "post", f"/api/personnel/profiles/{pid}/approve-finance/", {}, company=co_other)
        self.assertEqual(resp_app.status_code, 404)

        resp_print = self.call(other_accountant, "get", f"/api/print/personnel_profile/{pid}/pdf/", company=co_other)
        self.assertEqual(resp_print.status_code, 404)

        resp_tasks = self.call(other_accountant, "get", "/api/workflow/tasks/", company=co_other)
        self.assertEqual(resp_tasks.status_code, 200)
        results = resp_tasks.data.get("results", []) if isinstance(resp_tasks.data, dict) else resp_tasks.data
        task_ids = [t.get("task_id") for t in results]
        entity_ids = [str(t.get("entity_id")) for t in results]
        self.assertNotIn(task.pk, task_ids)
        self.assertNotIn(str(pid), entity_ids)

        resp_list = self.call(self.accountant, "get", "/api/personnel/profiles/")
        self.assertEqual(resp_list.status_code, 200)
        self.assertIsInstance(resp_list.data, list)

        resp_paged = self.call(self.accountant, "get", "/api/personnel/profiles/", {"page": 1, "page_size": 1})
        self.assertEqual(resp_paged.status_code, 200)
        self.assertIsInstance(resp_paged.data, dict)
        self.assertIn("count", resp_paged.data)
        self.assertIn("results", resp_paged.data)
        self.assertEqual(len(resp_paged.data["results"]), 1)
