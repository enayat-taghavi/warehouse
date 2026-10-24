"""
طرح ۲.۳-ب ت۱۰: API جانشین موقت — تعیین به دست خود فرد و مدیر کاربران (دامنه و عضویت)، عضویت جانشین، تاریخ شمسی،
هم‌پوشانی، لغو بی‌حذف ردیف، AuditLog، کار جانشین در بازه و نه بعد از آن، بی‌زنجیره و بی‌مجوز اضافه.
"""
import datetime
from unittest import mock

import jdatetime
from django.contrib.auth.models import Permission
from django.utils import timezone

from accounts.models import AuditLog
from accounts.scoped_permissions import can
from companies.models import UserCompanyAccess
from workflow.models import WorkflowSubstitute

from .base import KIND
from .test_api import ApiBase


def _days(n):
    return timezone.localdate() + datetime.timedelta(days=n)


def _shamsi(day, persian=False):
    s = jdatetime.date.fromgregorian(date=day).strftime('%Y/%m/%d')
    return s.translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')) if persian else s


class SubstituteApiBase(ApiBase):
    def setUp(self):
        super().setUp()
        self.helper = self.user('helper', 'wf_member')
        self.helper2 = self.user('helper2', 'wf_member')
        perm = Permission.objects.get(codename='perm_usr_role', content_type__app_label='accounts')
        self.manager = self.user('manager', 'wf_member')
        self.manager.user_permissions.add(perm)
        self.far_manager = self.user('far_manager', 'wf_member', section=self.other_sec)
        self.far_manager.user_permissions.add(perm)
        UserCompanyAccess.objects.create(user=self.lead, company=self.co)

    def create(self, editor, **data):
        body = {'substitute_id': self.helper.pk, 'start_date': _days(0).isoformat(),
                'end_date': _days(3).isoformat()}
        body.update(data)
        return self.post(editor, 'substitutes/', body)


class SubstituteCreateTests(SubstituteApiBase):
    def test_self_with_shamsi_dates_and_audit(self):
        r = self.create(self.lead, start_date=_shamsi(_days(0), persian=True), end_date=_shamsi(_days(5)))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['principal']['id'], r.data['substitute']['id']), (self.lead.pk, self.helper.pk))
        self.assertEqual(r.data['start_date'], _days(0).isoformat())
        self.assertEqual(r.data['end_date'], _days(5).isoformat())
        self.assertEqual(r.data['end_date_shamsi'], _shamsi(_days(5)))
        self.assertTrue(r.data['is_current'] and r.data['can_revoke'])
        self.assertEqual(AuditLog.objects.filter(module='workflow', target_model='WorkflowSubstitute',
                                                 action='CREATE').count(), 1)
        # ردیف سابقهٔ جانشینی همیشه شرکت دارد (بازبینی ۲.۳-ب)
        self.assertFalse(AuditLog.objects.filter(module='workflow', company_id__isnull=True).exists())

    def test_validation(self):
        su_case = self.create(self.lead, substitute_id=self.su.pk)
        self.assertEqual((su_case.status_code, su_case.data['code']), (400, 'invalid_substitute'))
        self.assertEqual(self.create(self.lead, substitute_id=self.lead.pk).data['code'], 'invalid_substitute')
        self.assertEqual(self.create(self.lead, substitute_id=self.outsider.pk).data['code'], 'invalid_substitute')
        self.assertEqual(self.create(self.lead, end_date=_days(-1).isoformat(),
                                     start_date=_days(-3).isoformat()).data['code'], 'invalid_range')
        self.assertEqual(self.create(self.lead, start_date=_days(4).isoformat()).data['code'], 'invalid_range')
        self.assertEqual(self.create(self.lead, start_date='نامعتبر').data['code'], 'invalid_date')
        self.assertEqual(self.create(self.lead, company_id=self.co2.pk).data['code'], 'principal_not_member')
        self.assertEqual(self.create(self.su).data['code'], 'principal_superuser')
        self.assertEqual(self.create(self.lead).status_code, 201)
        r = self.create(self.lead, start_date=_days(2).isoformat(), end_date=_days(9).isoformat())
        self.assertEqual((r.status_code, r.data['code']), (400, 'overlap'))
        # شرکت مشخص ردیف جدایی است و با ردیف «همه» هم‌پوشان شمرده نمی‌شود
        self.assertEqual(self.create(self.lead, company_id=self.co.pk).status_code, 201)

    def test_substitute_must_be_member_of_all_principal_companies(self):
        self.assign(self.lead, 'wf_lead', section=self.other_sec)
        self.assertEqual(self.create(self.lead).data['code'], 'invalid_substitute')
        self.assertEqual(self.create(self.lead, company_id=self.co.pk).status_code, 201)

    def test_manager_rules(self):
        r = self.create(self.manager, principal_id=self.lead.pk)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['created_by']['id'], self.manager.pk)
        # مدیر بیرون از دامنه، کاربر بی perm_usr_role، هدف مدیر کل و هدف ناموجود: 403 یکسان
        for editor, principal in ((self.far_manager, self.lead.pk), (self.helper2, self.lead.pk),
                                  (self.manager, self.su.pk), (self.manager, 999999)):
            r = self.create(editor, principal_id=principal, substitute_id=self.helper2.pk)
            self.assertEqual((r.status_code, r.data['code']), (403, 'out_of_scope'), (editor, principal))

    def test_manager_must_be_member_of_target_company(self):
        UserCompanyAccess.objects.create(user=self.far_manager, company=self.co)
        UserCompanyAccess.objects.create(user=self.lead, company=self.co2)
        # far_manager عضو شرکت دوم است و lead را می‌بیند، ولی عضو شرکت جانشینی (co) نیست
        r = self.create(self.far_manager, principal_id=self.lead.pk, company_id=self.co.pk)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.create(self.far_manager, principal_id=self.lead.pk).status_code, 403)


class SubstituteTaskTests(SubstituteApiBase):
    def test_substitute_card_window_and_revoke(self):
        sub = self.create(self.lead, end_date=_days(2).isoformat()).data
        d, _ = self.submit()
        task = self.task(d)
        r = self.get(self.helper, 'tasks/')
        self.assertEqual(r.data['count'], 1)
        card = r.data['results'][0]
        self.assertEqual(card['on_behalf_of']['id'], self.lead.pk)
        self.assertEqual((card['valid_from'], card['valid_to']), (_days(0).isoformat(), _days(2).isoformat()))
        self.assertEqual(card['valid_to_shamsi'], _shamsi(_days(2)))
        # جانشین فقط کار را می‌گیرد، نه مجوز بخش صاحب کار را
        self.assertFalse(can(self.fresh(self.helper), 'zz_wf_approve', self.sec))
        # سند از راه کار دیده می‌شود (task_grants_view)
        self.assertEqual(self.get(self.helper, 'history/', kind=KIND, id=d.pk).status_code, 200)

        # بعد از پایان بازه: نه کارت، نه اقدام
        later = _days(5)
        with mock.patch('django.utils.timezone.localdate', return_value=later):
            self.assertEqual(self.get(self.helper, 'tasks/').data['count'], 0)
            r = self.do(self.helper, task)
            self.assertEqual((r.status_code, r.data['code']), (403, 'not_recipient'))

        # لغو: جانشین نمی‌تواند، بیگانه 404، صاحب کار می‌تواند؛ ردیف می‌ماند
        c = self.client_for
        self.assertEqual(c(self.helper).delete(f'/api/workflow/substitutes/{sub["id"]}/').status_code, 403)
        self.assertEqual(c(self.outsider).delete(f'/api/workflow/substitutes/{sub["id"]}/').status_code, 404)
        r = c(self.lead).delete(f'/api/workflow/substitutes/{sub["id"]}/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['revoked_at'])
        self.assertEqual(c(self.lead).delete(f'/api/workflow/substitutes/{sub["id"]}/').status_code, 409)
        self.assertTrue(WorkflowSubstitute.objects.filter(pk=sub['id'], revoked_at__isnull=False).exists())
        self.assertEqual(AuditLog.objects.filter(module='workflow', target_model='WorkflowSubstitute',
                                                 action='DELETE').count(), 1)
        self.assertEqual(self.get(self.helper, 'tasks/').data['count'], 0)
        self.assertEqual(self.do(self.helper, task).status_code, 404)

    def test_substitute_acts_inside_window(self):
        self.create(self.lead)
        d, _ = self.submit()
        r = self.do(self.helper, self.task(d))
        self.assertEqual((r.status_code, r.data['current_step']), (200, 'review'))
        hist = self.get(self.lead, 'history/', kind=KIND, id=d.pk).data['instances'][0]['steps']
        self.assertEqual(hist[-1]['on_behalf_of']['id'], self.lead.pk)
        self.assertEqual(hist[-1]['actor']['id'], self.helper.pk)

    def test_no_chain(self):
        self.assertEqual(self.create(self.lead).status_code, 201)
        self.assertEqual(self.create(self.helper, substitute_id=self.helper2.pk).status_code, 201)
        d, _ = self.submit()
        self.assertEqual(self.get(self.helper, 'tasks/').data['count'], 1)
        self.assertEqual(self.get(self.helper2, 'tasks/').data['count'], 0)
        self.assertEqual(self.do(self.helper2, self.task(d)).status_code, 404)

    def test_list_scope(self):
        mine = self.create(self.lead).data
        self.assertEqual([x['id'] for x in self.get(self.lead, 'substitutes/').data], [mine['id']])
        self.assertEqual([x['id'] for x in self.get(self.helper, 'substitutes/').data], [mine['id']])
        self.assertFalse(self.get(self.helper, 'substitutes/').data[0]['can_revoke'])
        self.assertEqual(self.get(self.helper2, 'substitutes/').data, [])
        self.assertEqual(self.get(self.helper2, 'substitutes/', principal=self.lead.pk).status_code, 403)
        self.assertEqual(self.get(self.far_manager, 'substitutes/', principal=self.lead.pk).status_code, 403)
        r = self.get(self.manager, 'substitutes/', principal=self.lead.pk)
        self.assertEqual(([x['id'] for x in r.data], r.data[0]['can_revoke']), ([mine['id']], True))
        # مدیر در دامنه لغو هم می‌کند
        self.assertEqual(self.client_for(self.manager).delete(
            f'/api/workflow/substitutes/{mine["id"]}/').status_code, 200)


class SubstituteCandidatesTests(SubstituteApiBase):
    """نامزدهای جانشین (۲.۳-ه): همان شرط تعیین، فقط {id, name}، بی‌نیاز به مجوز فهرست کاربران."""

    def ids(self, editor, **params):
        r = self.get(editor, 'substitutes/candidates/', **params)
        self.assertEqual(r.status_code, 200, r.data)
        return {x['id'] for x in r.data}

    def test_self_candidates_are_live_members_only(self):
        UserCompanyAccess.objects.create(user=self.outsider, company=self.co)  # ردیف دسترسی تنها عضویت نیست
        self.helper2.is_active = False
        self.helper2.save()
        r = self.get(self.lead, 'substitutes/candidates/')
        self.assertTrue(r.data and all(set(x) == {'id', 'name'} for x in r.data))
        got = {x['id'] for x in r.data}
        self.assertIn(self.helper.pk, got)
        self.assertIn(self.manager.pk, got)
        for absent in (self.lead, self.helper2, self.outsider, self.far_manager, self.su):
            self.assertNotIn(absent.pk, got, absent.username)
        # هر نامزد را create_substitute هم می‌پذیرد
        self.assertEqual(self.create(self.lead, substitute_id=self.manager.pk).status_code, 201)

    def test_all_principal_companies_or_given_company(self):
        both = self.user('both', 'wf_member')
        self.assign(both, 'wf_member', section=self.other_sec)
        self.assign(self.lead, 'wf_lead', section=self.other_sec)
        self.assertEqual(self.ids(self.lead) - {self.outsider.pk, self.far_manager.pk}, {both.pk})
        self.assertIn(self.helper.pk, self.ids(self.lead, company=self.co.pk))
        self.assertNotIn(self.helper.pk, self.ids(self.lead, company=self.co2.pk))

    def test_company_principal_not_member_and_bad_input(self):
        r = self.get(self.helper, 'substitutes/candidates/', company=self.co2.pk)
        self.assertEqual((r.status_code, r.data['code']), (400, 'principal_not_member'))
        self.assertEqual(self.get(self.helper, 'substitutes/candidates/', company='x').status_code, 400)
        self.assertEqual(self.get(self.su, 'substitutes/candidates/').data, [])

    def test_manager_mode_same_rule_as_create(self):
        self.assertIn(self.helper.pk, self.ids(self.manager, principal=self.lead.pk))
        self.assertNotIn(self.lead.pk, self.ids(self.manager, principal=self.lead.pk))
        for editor, principal in ((self.far_manager, self.lead.pk), (self.helper2, self.lead.pk),
                                  (self.manager, self.su.pk), (self.manager, 999999)):
            r = self.get(editor, 'substitutes/candidates/', principal=principal)
            self.assertEqual((r.status_code, r.data['code']), (403, 'out_of_scope'), (editor, principal))
