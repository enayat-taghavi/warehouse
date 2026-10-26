"""
طرح ۲.۳-و-ج: API ارجاع (ر۱۴)، رؤیت (ر۸)، دیدن سند پس از بستن کار (ر۱۱)، زمان‌بند مهلت (ر۱۰) و اعلان (ر۱۳).
"""
import datetime

from django.utils import timezone

from companies.models import SectionAssignment
from notifications.models import Notification
from workflow import engine, events, notify, scheduler
from workflow.models import WorkflowStep, WorkflowTask
from workflow.registry import INFORM, REFER

from .test_api import ApiBase


class ReferralApiBase(ApiBase):
    def refer_api(self, user, inst, targets, kind=REFER, **extra):
        return self.post(user, f'instances/{inst.pk}/refer/',
                         {'targets': [t.pk for t in targets], 'kind': kind, **extra})

    def make_referral(self, kind=REFER, target=None, **kw):
        _d, inst = self.submit()
        task = engine.refer(self.fresh(self.lead), inst, [(target or self.payer).pk], kind=kind, **kw)[0]
        return inst, task


class ReferApiTests(ReferralApiBase):
    def test_refer_returns_cards(self):
        _d, inst = self.submit()
        due = (timezone.now() + datetime.timedelta(days=2)).isoformat()
        r = self.refer_api(self.lead, inst, [self.payer, self.reviewer], instruction='بررسی شود', due_at=due)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(r.data), 2)
        card = r.data[0]
        self.assertEqual((card['track'], card['kind'], card['actions']), ('referral', REFER, ['done']))
        self.assertEqual(card['instruction'], 'بررسی شود')
        self.assertEqual(card['referred_by']['id'], self.lead.pk)
        self.assertTrue(card['due_at'] and card['due_at_shamsi'])

    def test_outsider_and_unknown_instance_get_404(self):
        _d, inst = self.submit()
        self.assertEqual(self.refer_api(self.outsider, inst, [self.payer]).status_code, 404)
        r = self.post(self.lead, 'instances/999999/refer/', {'targets': [self.payer.pk], 'kind': REFER})
        self.assertEqual(r.status_code, 404)

    def test_member_without_task_gets_404(self):
        _d, inst = self.submit()
        self.assertEqual(self.refer_api(self.boss, inst, [self.payer]).status_code, 404)

    def test_target_not_member_is_400(self):
        _d, inst = self.submit()
        r = self.refer_api(self.lead, inst, [self.outsider])
        self.assertEqual((r.status_code, r.data['code']), (400, 'target_not_member'))

    def test_bad_due_at_is_400(self):
        _d, inst = self.submit()
        r = self.refer_api(self.lead, inst, [self.payer], due_at='not-a-date')
        self.assertEqual((r.status_code, r.data['code']), (400, 'invalid_due_at'))


class ReferralActionApiTests(ReferralApiBase):
    def test_done_and_seen(self):
        inst, ref = self.make_referral()
        r = self.do(self.payer, ref, 'done', reason='انجام دادم', revision=ref.revision)
        self.assertEqual(r.status_code, 200, r.data)
        ref.refresh_from_db()
        self.assertEqual((ref.is_open, ref.reply), (False, 'انجام دادم'))
        self.assertEqual(self.do(self.payer, ref, 'done').status_code, 409)
        _i, inf = self.make_referral(kind=INFORM)
        self.assertEqual(self.do(self.payer, inf, 'done').status_code, 403)
        self.assertEqual(self.do(self.payer, inf, 'seen').status_code, 200)

    def test_step_task_rejects_done_and_referral_rejects_act(self):
        _inst, ref = self.make_referral()
        self.assertEqual(self.do(self.payer, ref, 'act').status_code, 403)
        step = WorkflowTask.objects.get(instance=ref.instance, track=WorkflowTask.TRACK_STEP, is_open=True)
        self.assertEqual(self.do(self.lead, step, 'done').status_code, 403)

    def test_closed_referral_hidden_from_other_members(self):
        _inst, ref = self.make_referral()
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)
        # عضو شرکت بی‌نقش در این ارجاع و سابقه: 404 (نه 409)
        self.assertEqual(self.do(self.boss, ref, 'done').status_code, 404)
        self.assertEqual(self.do(self.payer, ref, 'done').status_code, 409)
        self.assertEqual(self.do(self.lead, ref, 'done').status_code, 409)


class ReadAndListApiTests(ReferralApiBase):
    def test_read_idempotent_and_unread_filter(self):
        _inst, ref = self.make_referral()
        r = self.get(self.payer, 'tasks/', track='referral', unread='1')
        self.assertEqual([c['task_id'] for c in r.data['results']], [ref.pk])
        self.assertIsNone(r.data['results'][0]['read_at'])
        first = self.post(self.payer, f'tasks/{ref.pk}/read/')
        second = self.post(self.payer, f'tasks/{ref.pk}/read/')
        self.assertEqual((first.status_code, first.data['read']), (200, True))
        self.assertEqual((second.status_code, second.data['read']), (200, False))
        self.assertEqual(self.get(self.payer, 'tasks/', unread='1').data['count'], 0)
        card = self.get(self.payer, 'tasks/', track='referral').data['results'][0]
        self.assertTrue(card['read_at'])
        self.assertEqual(self.post(self.outsider, f'tasks/{ref.pk}/read/').status_code, 404)

    def test_track_filter_and_bad_value(self):
        _inst, ref = self.make_referral(target=self.reviewer)
        self.assertEqual(self.get(self.lead, 'tasks/', track='referral').data['count'], 0)
        self.assertEqual(self.get(self.lead, 'tasks/', track='step').data['count'], 1)
        self.assertEqual(self.get(self.lead, 'tasks/', track='x').status_code, 400)


class ReferralTreeAndViewTests(ReferralApiBase):
    def test_tree_visible_to_target_after_close_not_to_outsider(self):
        inst, ref = self.make_referral()
        child = engine.refer(self.fresh(self.payer), inst, [self.reviewer.pk], kind=INFORM, parent_task=ref.pk)[0]
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)
        r = self.get(self.payer, f'instances/{inst.pk}/referrals/')
        self.assertEqual(r.status_code, 200)
        nodes = {n['task_id']: n for n in r.data['referrals']}
        self.assertEqual(nodes[child.pk]['parent_task_id'], ref.pk)
        self.assertEqual(self.get(self.outsider, f'instances/{inst.pk}/referrals/').status_code, 404)
        # ر۱۱: گیرنده پس از بستن کار سابقه را هم می‌بیند
        self.assertTrue(engine.referral_grants_view(self.fresh(self.payer), inst.entity_kind, inst.entity_id))
        self.assertFalse(engine.referral_grants_view(self.fresh(self.outsider), inst.entity_kind, inst.entity_id))
        h = self.get(self.payer, 'history/', kind=inst.entity_kind, id=inst.entity_id)
        self.assertEqual(h.status_code, 200)


    def test_tree_hides_other_branch_text(self):
        inst, ref = self.make_referral(instruction='محرمانه برای پرداخت')
        mine = engine.refer(self.fresh(self.lead), inst, [self.reviewer.pk], kind=INFORM, instruction='مال من')[0]
        nodes = {n['task_id']: n for n in self.get(self.reviewer, f'instances/{inst.pk}/referrals/').data['referrals']}
        self.assertEqual(nodes[ref.pk]['instruction'], '')
        self.assertEqual(nodes[mine.pk]['instruction'], 'مال من')
        lead_nodes = {n['task_id']: n for n in self.get(self.lead, f'instances/{inst.pk}/referrals/').data['referrals']}
        self.assertEqual(lead_nodes[ref.pk]['instruction'], 'محرمانه برای پرداخت')

    def test_grant_needs_current_membership(self):
        inst, ref = self.make_referral()
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)
        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)
        self.assertFalse(engine.referral_grants_view(self.fresh(self.payer), inst.entity_kind, inst.entity_id))

    def test_impossible_due_date_and_list_body_are_400(self):
        _d, inst = self.submit()
        r = self.refer_api(self.lead, inst, [self.payer], due_at='2026-13-45T10:00:00')
        self.assertEqual(r.status_code, 400)
        r = self.client_for(self.lead).post(f'/api/workflow/instances/{inst.pk}/refer/', [1, 2], format='json')
        self.assertEqual(r.status_code, 400)


class ReferralSchedulerTests(ReferralApiBase):
    def test_reminder_before_due_and_escalation_at_due_once(self):
        start = timezone.now()
        inst, ref = self.make_referral(due_at=start + datetime.timedelta(hours=10))
        today = timezone.localdate()
        scheduler.send_reminders(start + datetime.timedelta(hours=4), today)
        ref.refresh_from_db()
        self.assertIsNone(ref.reminder_sent_at)
        scheduler.send_reminders(start + datetime.timedelta(hours=5, minutes=1), today)
        ref.refresh_from_db()
        self.assertIsNotNone(ref.reminder_sent_at)
        stamped = ref.reminder_sent_at
        scheduler.send_reminders(start + datetime.timedelta(hours=6), today)
        ref.refresh_from_db()
        self.assertEqual(ref.reminder_sent_at, stamped)
        scheduler.send_escalations(start + datetime.timedelta(hours=9), today)
        ref.refresh_from_db()
        self.assertIsNone(ref.escalated_at)
        scheduler.send_escalations(start + datetime.timedelta(hours=10, minutes=1), today)
        ref.refresh_from_db()
        self.assertIsNotNone(ref.escalated_at)

    def test_long_due_reminds_24h_before(self):
        start = timezone.now()
        _inst, ref = self.make_referral(due_at=start + datetime.timedelta(days=5))
        today = timezone.localdate()
        scheduler.send_reminders(start + datetime.timedelta(days=3, hours=23), today)
        ref.refresh_from_db()
        self.assertIsNone(ref.reminder_sent_at)
        scheduler.send_reminders(start + datetime.timedelta(days=4, minutes=1), today)
        ref.refresh_from_db()
        self.assertIsNotNone(ref.reminder_sent_at)


class ReferralNotifyTests(ReferralApiBase):
    def test_received_body_has_kind_and_instruction(self):
        inst, ref = self.make_referral(instruction='x' * 300)
        event = events.build_payload(events.RECEIVED, inst, ref, [self.payer.pk], actor_id=self.lead.pk)
        created = notify.create_for_event(event)
        body = created[self.payer.pk].message
        self.assertIn('ارجاع', body)
        self.assertIn('x' * 199, body)
        self.assertNotIn('x' * 201, body)

    def test_done_notifies_referrer_only(self):
        inst, ref = self.make_referral()
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE, reply='تمام')
        event = events.build_payload(events.DONE, inst, ref, [self.payer.pk, self.lead.pk], actor_id=self.payer.pk)
        Notification.objects.all().delete()
        created = notify.create_for_event(event)
        self.assertEqual(set(created), {self.lead.pk})
        self.assertIn('تمام', created[self.lead.pk].message)

    def test_step_done_still_silent(self):
        _d, inst = self.submit()
        step = WorkflowTask.objects.get(instance=inst, is_open=True)
        event = events.build_payload(events.DONE, inst, step, [self.lead.pk], actor_id=self.lead.pk)
        self.assertEqual(notify.create_for_event(event), {})
