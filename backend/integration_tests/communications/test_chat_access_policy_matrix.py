"""
ماتریس آزمون API سیاست چت: فقط مدیر کل حوزهٔ `all` می‌دهد، نویسندگان پیش‌فرض شرکت، و ردیف‌های ممیزی.
"""
from rest_framework import status

from accounts.models import AuditLog
from communications.models import ChatCompanyPolicy, ChatUserPolicy
from integration_tests.communications.test_chat_access import (
    COMPANY_POLICY_URL, USER_POLICY_URL, ChatAccessTestBase,
)


class _PolicyMatrixBase(ChatAccessTestBase):
    def setUp(self):
        super().setUp()
        self.co_a, self.co_b = self.make_company(), self.make_company()
        self.member = self.make_user()
        self.link_company(self.member, self.co_a)

    def admin_of(self, company):
        u = self.make_user()
        self.assign_company(u, company, role='manager')
        self.link_company(u, company)
        return self.grant_perm(u, 'perm_usr_edit')

    def writer_of(self, company):
        u = self.make_user()
        self.assign_company(u, company, role='manager')
        self.link_company(u, company)
        return self.grant_perm(u, 'perm_sys_settings')


class ScopeAllOnlySuperuserTests(_PolicyMatrixBase):
    """فقط مدیر کل می‌تواند حوزهٔ all بدهد"""

    def test_admin_cannot_grant_user_scope_all(self):
        admin = self.admin_of(self.co_a)
        resp = self.put_user_policy(admin, self.member, contact_scope='all')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertFalse(ChatUserPolicy.objects.filter(user=self.member).exists())

    def test_writer_cannot_set_company_scope_all(self):
        writer = self.writer_of(self.co_a)
        resp = self.put_company_policy(writer, self.co_a, contact_scope='all')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertFalse(ChatCompanyPolicy.objects.filter(company=self.co_a).exists())

    def test_superuser_grants_all_to_user_and_company(self):
        resp = self.put_user_policy(self.superuser, self.member, contact_scope='all')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(ChatUserPolicy.objects.get(user=self.member).contact_scope, 'all')
        resp = self.put_company_policy(self.superuser, self.co_b, contact_scope='all')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(ChatCompanyPolicy.objects.get(company=self.co_b).contact_scope, 'all')

    def test_admin_edit_keeps_existing_all_scope(self):
        self.set_user_policy(self.member, contact_scope='all')
        admin = self.admin_of(self.co_a)
        resp = self.put_user_policy(admin, self.member, chat_allowed=False)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        policy = ChatUserPolicy.objects.get(user=self.member)
        self.assertFalse(policy.chat_allowed)
        self.assertEqual(policy.contact_scope, 'all')


class CompanyDefaultWriterTests(_PolicyMatrixBase):
    """نویسندگان پیش‌فرض شرکت و ممیزی"""

    def test_writer_changes_own_company_default_with_audit(self):
        writer = self.writer_of(self.co_a)
        before = AuditLog.objects.filter(target_model='ChatCompanyPolicy').count()
        resp = self.put_company_policy(writer, self.co_a, contact_scope='section')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        policy = ChatCompanyPolicy.objects.get(company=self.co_a)
        self.assertEqual(policy.contact_scope, 'section')
        self.assertEqual(policy.updated_by_id, writer.id)
        self.assertEqual(AuditLog.objects.filter(target_model='ChatCompanyPolicy').count(), before + 1)
        resp = self.put_company_policy(writer, self.co_a, contact_scope='section')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(AuditLog.objects.filter(target_model='ChatCompanyPolicy').count(), before + 1)

    def test_writer_of_a_cannot_change_b(self):
        writer = self.writer_of(self.co_a)
        resp = self.put_company_policy(writer, self.co_b, contact_scope='project')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertFalse(ChatCompanyPolicy.objects.filter(company=self.co_b).exists())
        self.auth(writer)
        self.assertEqual(self.client.get(COMPANY_POLICY_URL.format(self.co_b.id)).status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_member_without_structure_permission_forbidden(self):
        u = self.make_user()
        self.assign_company(u, self.co_a)
        self.link_company(u, self.co_a)
        resp = self.put_company_policy(u, self.co_a, contact_scope='section')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.auth(u)
        self.assertEqual(self.client.get(COMPANY_POLICY_URL.format(self.co_a.id)).status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_user_policy_change_writes_one_audit_row_and_noop_writes_none(self):
        def count():
            return AuditLog.objects.filter(target_model='ChatUserPolicy').count()
        before = count()
        resp = self.put_user_policy(self.superuser, self.member, chat_allowed=False)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(count(), before + 1)
        resp = self.put_user_policy(self.superuser, self.member, chat_allowed=False)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(count(), before + 1)
        resp = self.put_user_policy(self.superuser, self.member, chat_allowed=True)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(count(), before + 2)
        self.auth(self.member)
        resp = self.client.get(USER_POLICY_URL.format(self.member.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertTrue(resp.data['chat_allowed'])
