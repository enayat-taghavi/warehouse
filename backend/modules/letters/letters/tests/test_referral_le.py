"""
تست‌های ل-ه: درخت ارجاع روی موتور هسته، مهلت پاسخ، ارجاع خودکار پس از ثبت، بخشنامه، بستن ارجاع با بایگانی و
ابطال، رویداد زنده و جانشینِ امضاکنندهٔ نامهٔ محرمانه. اجرا با WH_MODULES=warehouse,accounting,letters.
"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from companies.models import SectionAssignment
from notifications.models import Notification
from workflow import engine
from workflow.errors import WorkflowError
from workflow.models import WorkflowStep, WorkflowSubstitute, WorkflowTask, WorkflowTaskRecipient

from letters import referral
from letters.models import CircularAudience, Letter, LetterRecipient, LetterSigner
from letters.settings_spec import DEFAULT_DUE_DAYS
from letters.tests.test_signing_ld import SigningBase
from letters.workflows import LETTER_SIGN_WORKFLOW

User = get_user_model()


class ReferralBase(SigningBase):
    def refer(self, user, letter, targets, **data):
        data.setdefault('kind', 'refer')
        return self.api(user).post(f'/api/letters/{letter.pk}/refer/', {'targets': [t.pk for t in targets], **data},
                                   format='json')

    def tasks(self, letter, **kw):
        return WorkflowTask.objects.filter(track=WorkflowTask.TRACK_REFERRAL, instance__entity_id=letter.pk,
                                           instance__workflow_key=referral.LETTER_REFERRAL_WORKFLOW, **kw)

    def get(self, user, letter):
        return self.api(user).get(f'/api/letters/{letter.pk}/').status_code

    def recipient(self, letter, user, role=LetterRecipient.ROLE_TO):
        LetterRecipient.objects.create(letter=letter, role=role, target_type=LetterRecipient.TARGET_USER, user=user)


class ReferralTreeTests(ReferralBase):
    def test_secretariat_gives_root_referral_and_outsider_of_tree_sees_nothing(self):
        d = self.registered()
        self.assertEqual(self.get(self.reader, d), 404)
        res = self.refer(self.secretary, d, [self.reader], instruction='بررسی شود')
        self.assertEqual(res.status_code, 201, res.content)
        task = self.tasks(d).get()
        self.assertEqual((task.target_user_id, task.referred_by_id, task.parent_task_id),
                         (self.reader.pk, self.secretary.pk, None))
        self.assertEqual(self.get(self.reader, d), 200)
        self.assertEqual(self.get(self.stranger, d), 404)
        self.assertEqual(self.refer(self.stranger, d, [self.coauthor]).status_code, 404)
        tree = self.api(self.reader).get(f'/api/letters/{d.pk}/referrals/').json()
        self.assertEqual([n['task_id'] for n in tree['referrals']], [task.pk])
        self.assertEqual(tree['referrals'][0]['instruction'], 'بررسی شود')
        self.assertTrue(tree['can_refer'])

    def test_others_refer_only_inside_own_branch(self):
        d = self.registered()
        self.refer(self.secretary, d, [self.reader, self.coauthor])
        coauthor_task = self.tasks(d, target_user=self.coauthor).get()
        reader_task = self.tasks(d, target_user=self.reader).get()
        # شاخهٔ دیگری را والد نمی‌گیرد
        res = self.refer(self.reader, d, [self.stranger], parent_task=coauthor_task.pk)
        self.assertEqual(res.status_code, 403)
        res = self.refer(self.reader, d, [self.stranger])
        self.assertEqual(res.status_code, 201, res.content)
        child = self.tasks(d, target_user=self.stranger).get()
        self.assertEqual(child.parent_task_id, reader_task.pk)
        # کسی که کار باز ندارد و ارجاع ریشه برایش مجاز نیست (پس از بستن کار) ارجاع نمی‌دهد
        engine.complete_referral(self.fresh(self.stranger), child, action=WorkflowStep.DONE)
        self.assertEqual(self.refer(self.stranger, d, [self.signer]).status_code, 403)
        # متن شاخه برای کسی که طرف آن نیست خالی است
        tree = self.api(self.coauthor).get(f'/api/letters/{d.pk}/referrals/').json()['referrals']
        self.assertEqual({n['task_id']: n['instruction'] for n in tree}[child.pk], '')

    def test_recipient_still_sees_after_task_closed(self):
        d = self.registered()
        self.refer(self.secretary, d, [self.reader])
        task = self.tasks(d).get()
        engine.complete_referral(self.fresh(self.reader), task, action=WorkflowStep.DONE, reply='انجام شد')
        self.assertFalse(self.tasks(d, is_open=True).exists())
        self.assertTrue(engine.referral_grants_view(self.fresh(self.reader), 'letters_letter', d.pk))
        self.assertEqual(self.get(self.reader, d), 200)
        self.assertTrue(self.sees(self.reader, d))

    def test_author_and_signer_may_refer_root_but_draft_and_confidential_rules_hold(self):
        draft = self.letter()
        self.assertEqual(self.refer(self.author, draft, [self.reader]).status_code, 409)
        secret = self.registered(confidentiality=Letter.CONF_CONFIDENTIAL)
        LetterSigner.objects.create(letter=secret, user=self.signer, order=0)
        self.assertEqual(self.refer(self.secretary, secret, [self.reader]).status_code, 404)
        self.assertEqual(self.refer(self.signer, secret, [self.reader]).status_code, 201)
        self.assertFalse(referral.referral_instance(secret).allow_substitute)
        self.assertEqual(self.refer(self.author, secret, [self.coauthor]).status_code, 201)

    def test_no_referral_to_other_company_or_inactive_member(self):
        d = self.registered()
        res = self.refer(self.secretary, d, [self.outsider])
        self.assertEqual((res.status_code, res.json()['code']), (400, 'target_not_member'))
        User.objects.filter(pk=self.reader.pk).update(is_active=False)
        res = self.refer(self.secretary, d, [self.reader])
        self.assertEqual((res.status_code, res.json()['code']), (400, 'target_not_member'))
        SectionAssignment.objects.filter(user=self.stranger).update(is_active=False)
        self.assertEqual(self.refer(self.secretary, d, [self.stranger]).status_code, 400)
        self.assertFalse(self.tasks(d).exists())

    def test_superuser_never_refers(self):
        d = self.registered()
        admin = self.fresh(self.admin)
        self.assertFalse(referral.can_refer_letter(admin, d.pk))
        instance = referral.open_referrals(d, self.fresh(self.secretary))
        with self.assertRaises(WorkflowError) as ctx:
            engine.refer(admin, instance.pk, [self.reader.pk], kind='refer')
        self.assertEqual(ctx.exception.code, 'superuser_view_only')
        self.assertNotEqual(self.refer(self.admin, d, [self.reader]).status_code, 201)
        self.assertFalse(self.tasks(d).exists())


class DueDateTests(ReferralBase):
    def test_default_due_from_letter_then_company_setting(self):
        due = timezone.now() + timedelta(days=3)
        d = self.registered(response_due_at=due)
        self.refer(self.secretary, d, [self.reader])
        self.assertEqual(self.tasks(d).get().due_at, due)
        plain = self.registered()
        before = timezone.now()
        self.refer(self.secretary, plain, [self.reader])
        got = self.tasks(plain).get().due_at
        self.assertTrue(before + timedelta(days=DEFAULT_DUE_DAYS) <= got
                        <= timezone.now() + timedelta(days=DEFAULT_DUE_DAYS))
        # مهلت صریح بر پیش‌فرض می‌چربد
        explicit = (timezone.now() + timedelta(days=1)).replace(microsecond=0)
        other = self.registered(response_due_at=due)
        self.refer(self.secretary, other, [self.reader], due_at=explicit.isoformat())
        self.assertEqual(self.tasks(other).get().due_at, explicit)


class AutoReferralTests(ReferralBase):
    def signed(self, kind=Letter.KIND_INTERNAL, **kw):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET, kind=kind, **kw)
        self.recipient(d, self.reader)
        self.recipient(d, self.stranger, LetterRecipient.ROLE_CC)
        self.recipient(d, self.outsider)  # از شرکت دیگر: کنار می‌رود
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 200)
        self.assertEqual(self.post(self.signer, d, 'sign').status_code, 200)
        return self.reload(d)

    def test_internal_and_minutes_referred_after_registration_idempotent(self):
        for kind in (Letter.KIND_INTERNAL, Letter.KIND_MINUTES):
            d = self.signed(kind)
            self.assertEqual(d.status, Letter.STATUS_REGISTERED)
            rows = {t.target_user_id: (t.step_kind, t.referred_by_id) for t in self.tasks(d)}
            self.assertEqual(rows, {self.reader.pk: ('refer', self.author.pk),
                                    self.stranger.pk: ('inform', self.author.pk)})
            self.assertTrue(WorkflowTaskRecipient.objects.filter(task__in=self.tasks(d), user=self.reader).exists())
            with transaction.atomic():
                self.assertEqual(referral.auto_refer_in_tx(d, self.fresh(self.signer)), [])
            self.assertEqual(self.tasks(d).count(), 2)

    def test_outgoing_is_not_auto_referred(self):
        d = self.signed(Letter.KIND_OUTGOING)
        self.assertEqual(d.status, Letter.STATUS_REGISTERED)
        self.assertFalse(self.tasks(d).exists())


class CloseReferralTests(ReferralBase):
    def test_archive_and_void_close_open_referrals_without_deleting(self):
        for action, data in (('archive', {}), ('void', {'reason': 'اشتباه'})):
            d = self.registered()
            self.refer(self.secretary, d, [self.reader, self.coauthor])
            self.assertEqual(self.post(self.secretary, d, action, data).status_code, 200)
            tasks = self.tasks(d)
            self.assertEqual(tasks.count(), 2)
            self.assertEqual(set(tasks.values_list('is_open', 'outcome')), {(False, WorkflowTask.CANCELLED)})
            self.assertEqual(self.refer(self.secretary, d, [self.stranger]).status_code, 409)
            self.assertEqual(self.get(self.reader, d), 200)
        self.assertEqual(self.post(self.secretary, d, 'void', {'reason': 'x'}).status_code, 200)


class CircularTests(ReferralBase):
    def circular(self, scope, section=None):
        d = self.registered(kind=Letter.KIND_CIRCULAR)
        CircularAudience.objects.create(letter=d, scope=scope, section_id=getattr(section, 'pk', None))
        return d

    def test_audience_sees_and_others_do_not(self):
        other_section = User.objects.create_user(username='l_sec2', password='x')
        SectionAssignment.objects.create(user=other_section, section=self.sec_a2, role='employee')
        by_section = self.circular(CircularAudience.SCOPE_SECTION, self.sec_a)
        self.assertEqual(self.get(self.section_user, by_section), 200)
        self.assertEqual(self.get(other_section, by_section), 404)
        whole = self.circular(CircularAudience.SCOPE_COMPANY)
        self.assertEqual(self.get(other_section, whole), 200)
        self.assertEqual(self.get(self.outsider, whole), 404)

    def test_registered_circular_notifies_once_and_creates_no_task(self):
        self.grant(self.author, self.co_a, 'perm_letters_circular')
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET, kind=Letter.KIND_CIRCULAR)
        res = self.api(self.author).put(f'/api/letters/{d.pk}/audience/',
                                        {'audience': [{'scope': 'section', 'section_id': self.sec_a.pk}]},
                                        format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.post(self.author, d, 'submit')
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(self.signer, d, 'sign').status_code, 200)
        self.assertEqual(self.reload(d).status, Letter.STATUS_REGISTERED)
        self.assertFalse(self.tasks(d).exists())
        self.assertEqual(Notification.objects.filter(recipient=self.section_user,
                                                     notification_type='letters_circular').count(), 1)
        self.assertFalse(Notification.objects.filter(recipient=self.author,
                                                     notification_type='letters_circular').exists())
        # خوانده/نخوانده و «چه کسانی خواندند»
        rows = self.api(self.section_user).get('/api/letters/circulars/').json()
        self.assertEqual([(r['id'], r['is_read']) for r in rows], [(d.pk, False)])
        self.get(self.section_user, d)
        rows = self.api(self.section_user).get('/api/letters/circulars/').json()
        self.assertEqual([(r['id'], r['is_read']) for r in rows], [(d.pk, True)])
        viewers = self.api(self.author).get(f'/api/letters/{d.pk}/viewers/').json()
        self.assertIn(self.section_user.pk, [v['user']['id'] for v in viewers['viewers']])
        self.assertEqual(self.api(self.section_user).get(f'/api/letters/{d.pk}/viewers/').status_code, 403)

    def test_audience_validation(self):
        d = self.letter(kind=Letter.KIND_CIRCULAR)
        url = f'/api/letters/{d.pk}/audience/'
        body = {'audience': [{'scope': 'company'}]}
        self.assertEqual(self.api(self.author).put(url, body, format='json').status_code, 403)
        self.grant(self.author, self.co_a, 'perm_letters_circular')
        bad = {'audience': [{'scope': 'section', 'section_id': self.sec_b.pk}]}
        self.assertEqual(self.api(self.author).put(url, bad, format='json').status_code, 400)
        self.assertEqual(self.api(self.author).put(url, body, format='json').status_code, 200)
        self.assertEqual(list(d.audiences.values_list('scope', flat=True)), ['company'])


class LiveEventTests(ReferralBase):
    def test_live_event_only_to_people_who_see_the_letter(self):
        sent = []

        class Layer:
            async def group_send(self, group, payload):
                sent.append((group, payload['doc_id']))

        def groups_for(action):
            sent.clear()
            with mock.patch('channels.layers.get_channel_layer', return_value=Layer()), \
                    mock.patch('companies.realtime.broadcast_document_changed') as broadcast, \
                    self.captureOnCommitCallbacks(execute=True):
                action()
            return broadcast.called, {g for g, _ in sent}

        # یافتهٔ بازبینی ل-ه: نامهٔ عادی و پیش‌نویس هم به کانال شرکت نمی‌رود
        d = self.registered()
        called, groups = groups_for(lambda: self.refer(self.secretary, d, [self.reader]))
        self.assertFalse(called)
        self.assertEqual(groups, {f'user_{self.author.pk}', f'user_{self.reader.pk}', f'user_{self.secretary.pk}'})
        draft = self.letter()
        called, groups = groups_for(lambda: referral.emit_letter_changed(draft))
        self.assertFalse(called)
        self.assertNotIn(f'user_{self.stranger.pk}', groups)

        secret = self.registered(confidentiality=Letter.CONF_CONFIDENTIAL)
        called, groups = groups_for(lambda: self.refer(self.author, secret, [self.reader]))
        self.assertFalse(called)
        self.assertEqual(groups, {f'user_{self.author.pk}', f'user_{self.reader.pk}'})

        # فقط بخشنامهٔ ثبت‌شده با مخاطب «همهٔ شرکت» از کانال شرکت
        whole = self.registered(kind=Letter.KIND_CIRCULAR)
        CircularAudience.objects.create(letter=whole, scope=CircularAudience.SCOPE_COMPANY)
        called, _groups = groups_for(lambda: referral.emit_letter_changed(whole))
        self.assertTrue(called)


class GenericReferralPathTests(ReferralBase):
    """یافتهٔ بازبینی ل-ه: ارجاع ریشه فقط از مسیر نامه؛ ارجاعِ روی نمونهٔ امضا دیدن نمی‌دهد و با بایگانی بسته می‌شود."""

    def test_generic_workflow_api_gives_no_root_referral(self):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.post(self.author, d, 'submit')
        self.post(self.signer, d, 'sign')
        d = self.reload(d)
        self.assertEqual(d.status, Letter.STATUS_REGISTERED)
        sign = engine.instance_of(LETTER_SIGN_WORKFLOW, d.pk)
        mine = referral.open_referrals(d, self.fresh(self.secretary))
        for inst in (sign, mine):
            res = self.api(self.secretary).post(f'/api/workflow/instances/{inst.pk}/refer/',
                                                {'targets': [self.reader.pk], 'kind': 'refer'}, format='json')
            self.assertIn(res.status_code, (403, 404, 409))
        self.assertFalse(WorkflowTask.objects.filter(track=WorkflowTask.TRACK_REFERRAL,
                                                     instance__entity_id=d.pk).exists())
        self.assertEqual(self.refer(self.secretary, d, [self.reader]).status_code, 201)

    def test_sign_instance_referral_gives_no_view_and_closes_on_archive(self):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.post(self.author, d, 'submit')
        sign = engine.instance_of(LETTER_SIGN_WORKFLOW, d.pk)
        # امضاکننده با کار باز امضا از مسیر عمومی هسته ارجاع می‌دهد
        engine.refer(self.fresh(self.signer), sign.pk, [self.reader.pk], kind='refer')
        self.assertEqual(self.get(self.reader, d), 404)
        self.assertEqual(self.post(self.signer, d, 'sign').status_code, 200)
        self.assertEqual(self.get(self.reader, d), 404)
        self.assertEqual(self.post(self.secretary, d, 'archive').status_code, 200)
        task = WorkflowTask.objects.get(instance=sign, track=WorkflowTask.TRACK_REFERRAL)
        self.assertEqual((task.is_open, task.outcome), (False, WorkflowTask.CANCELLED))


class ConfidentialSubstituteTests(ReferralBase):
    """یافتهٔ بازبینی ل-د: جانشینِ امضاکنندهٔ نامهٔ محرمانه در نخستین ارسال و ارسال دوباره هیچ اعلان و کاری نمی‌گیرد."""

    def test_substitute_gets_nothing_for_confidential_letter(self):
        today = timezone.localdate()
        WorkflowSubstitute.objects.create(principal=self.signer, substitute=self.stranger, company=self.co_a,
                                          start_date=today - timedelta(days=1), end_date=today + timedelta(days=1))
        secret = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET,
                            confidentiality=Letter.CONF_CONFIDENTIAL)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(self.author, secret, 'submit').status_code, 200)
        self.assertFalse(engine.instance_of(LETTER_SIGN_WORKFLOW, secret.pk).allow_substitute)
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user=self.stranger).exists())
        self.assertFalse(Notification.objects.filter(recipient=self.stranger).exists())
        self.assertTrue(WorkflowTaskRecipient.objects.filter(user=self.signer).exists())
        # ارسال دوباره پس از عودت
        self.assertEqual(self.post(self.signer, secret, 'return', {'reason': 'اصلاح'}).status_code, 200)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(self.author, secret, 'submit').status_code, 200)
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user=self.stranger).exists())
        self.assertFalse(Notification.objects.filter(recipient=self.stranger).exists())
        # گواه: نامهٔ عادی جانشین را می‌پذیرد
        normal = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.post(self.author, normal, 'submit')
        self.assertTrue(engine.instance_of(LETTER_SIGN_WORKFLOW, normal.pk).allow_substitute)
        self.assertTrue(WorkflowTaskRecipient.objects.filter(user=self.stranger).exists())
