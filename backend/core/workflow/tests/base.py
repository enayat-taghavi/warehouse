"""
پایهٔ تست موتور گردش کار: نقش‌ها، مجوزها، گردش و سند جعلی (هیچ وابستگی به اعلام واقعی ماژول‌ها).
رتبه‌ها: عضو ۱۰، سرپرست ۲۰، بررسی‌کننده ۳۰، پرداخت‌کننده ۳۰، رئیس ۴۰.
"""
import itertools
import types
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from accounts.models import CustomUser, UserPermissionOverride
from companies.models import Company, Project, ProjectSection, SectionAssignment
from platform_core import module_catalog as mc
from platform_core import registry as preg
from workflow import events
from workflow.registry import APPROVE, EXECUTE, REVIEW, StepSpec, WorkflowSpec, reset_workflow_cache

KIND = 'zz_wf_doc'
WF = 'zz_wf_flow'

ROLES = [
    ('wf_member', 'عضو', 10),
    ('wf_lead', 'سرپرست', 20),
    ('wf_reviewer', 'بررسی‌کننده', 30),
    ('wf_payer', 'پرداخت‌کننده', 30),
    ('wf_boss', 'رئیس', 40),
    ('wf_legacy', 'بی‌رتبه', None),
]


def _pspec(code, scope='section', defaults=()):
    return {'code': code, 'label_fa': code, 'category': None, 'scope': scope, 'defaults': tuple(defaults),
            'module': 'fake'}


PERM_SPECS = {
    'zz_wf_approve': _pspec('zz_wf_approve', defaults=('wf_lead', 'wf_boss')),
    'zz_wf_review': _pspec('zz_wf_review', defaults=('wf_reviewer',)),
    'zz_wf_pay': _pspec('zz_wf_pay', defaults=('wf_payer',)),
    'zz_wf_sys': _pspec('zz_wf_sys', scope='system'),
}

STEPS = (
    StepSpec('lead_ok', 'تأیید سرپرست', 'wf_lead', 'zz_wf_approve', APPROVE),
    StepSpec('review', 'بررسی', 'wf_reviewer', 'zz_wf_review', REVIEW),
    StepSpec('boss_ok', 'تأیید رئیس', 'wf_boss', 'zz_wf_approve', APPROVE),
    StepSpec('pay', 'پرداخت', 'wf_payer', 'zz_wf_pay', EXECUTE, actions=('act', 'return')),
)


def record_state(obj, state, instance):
    obj.states.append(state)


def summary(obj):
    return {'title': f'سند {obj.pk}', 'amount': obj.amount}


def make_spec(key=WF, version=1, steps=STEPS, **kw):
    params = dict(key=key, version=version, entity_kind=KIND, title_fa='گردش آزمایشی', steps=steps,
                  on_state_change=record_state, summary=summary, route='/app/zz/{id}', amount_field='amount')
    params.update(kw)
    return WorkflowSpec(**params)


class WorkflowTestBase(TestCase):
    _ids = itertools.count(1)

    def setUp(self):
        self.docs = {}
        self.specs = [make_spec()]
        self.contrib = {
            'section_roles': [ROLES],
            'workflows': self.specs,
            f'entity_resolver:{KIND}': [lambda i: self.docs.get(int(i))],
        }
        p1 = mock.patch.dict(preg._CONTRIBUTIONS, self.contrib)
        p2 = mock.patch.object(mc, 'installed_permission_specs', side_effect=lambda: PERM_SPECS)
        p1.start()
        p2.start()
        self.addCleanup(p1.stop)
        self.addCleanup(p2.stop)
        reset_workflow_cache()
        self.addCleanup(reset_workflow_cache)

        ct = ContentType.objects.get_for_model(CustomUser)
        self.perms = {
            code: Permission.objects.get_or_create(codename=code, content_type=ct, defaults={'name': code})[0]
            for code in PERM_SPECS
        }
        self.co = Company.objects.create(code='WF-A', name='شرکت گردش')
        self.co2 = Company.objects.create(code='WF-B', name='شرکت دیگر')
        self.pr = Project.objects.create(company=self.co, code='WP', name='پروژه')
        self.pr2 = Project.objects.create(company=self.co2, code='WP2', name='پروژه ۲')
        self.sec = ProjectSection.objects.create(project=self.pr, code='WS1', name='بخش ۱')
        self.sec2 = ProjectSection.objects.create(project=self.pr, code='WS2', name='بخش ۲')
        self.other_sec = ProjectSection.objects.create(project=self.pr2, code='WS3', name='بخش شرکت دیگر')

        self.member = self.user('member', 'wf_member')
        self.lead = self.user('lead', 'wf_lead')
        self.reviewer = self.user('reviewer', 'wf_reviewer')
        self.boss = self.user('boss', 'wf_boss')
        self.payer = self.user('payer', 'wf_payer')
        self.su = CustomUser.objects.create_user(username='wf_su', password='x', is_superuser=True, is_staff=True)

        self.events = []
        receiver = lambda sender, event, **kw: self.events.append(event)  # noqa: E731
        events.task_event.connect(receiver, weak=False, dispatch_uid='wf_test_receiver')
        self.addCleanup(events.task_event.disconnect, dispatch_uid='wf_test_receiver')

    # ── کمکی‌ها ──
    def user(self, name, role=None, section=None, **target):
        u = CustomUser.objects.create_user(username=f'wf_{name}', password='x')
        if role:
            self.assign(u, role, section=section, **target)
        return u

    def assign(self, user, role, section=None, **target):
        if not target:
            target = {'section': section or self.sec}
        return SectionAssignment.objects.create(user=user, role=role, is_active=True, **target)

    def override(self, user, code, mode, company=None):
        return UserPermissionOverride.objects.create(user=user, permission=self.perms[code],
                                                     company=company or self.co, mode=mode)

    def doc(self, amount=Decimal('100'), section=None):
        pk = next(self._ids)
        d = types.SimpleNamespace(pk=pk, id=pk, section_id=(section or self.sec).pk, amount=amount, states=[])
        self.docs[pk] = d
        return d

    def fresh(self, user):
        return CustomUser.objects.get(pk=user.pk)

    def recipients(self, task):
        return set(task.recipients.values_list('user_id', flat=True))
