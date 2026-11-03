"""
تست‌های ل-د: امضای خطی روی موتور هسته، ثبت با شماره در همان تراکنش، ارسال، بایگانی، ابطال و وارده.
اجرا با WH_MODULES=warehouse,accounting,letters.
"""
import threading
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from accounts.models import AuditLog
from attachments.models import Attachment
from companies.models import Company, SectionAssignment
from numbering.models import IssuedNumber, NumberCounter
from workflow import engine
from workflow.models import WorkflowSubstitute

from letters.hooks import letter_is_locked
from letters.models import Letter, LetterSigner
from letters.services import lifecycle
from letters.tests.test_api_lc import BODY, ApiBase
from letters.workflows import LETTER_SIGN_WORKFLOW

User = get_user_model()


class SigningBase(ApiBase):
    def draft(self, signers=None, **kw):
        letter = self.letter(**kw)
        for i, user in enumerate(signers if signers is not None else [self.signer, self.reader]):
            LetterSigner.objects.create(letter=letter, user=user, order=i)
        return letter

    def image(self, *users):
        for user in users:
            Attachment.objects.create(entity_kind='user', entity_id=str(user.pk), label='signature',
                                      file='attachments/sig.png')

    def post(self, user, letter, action, data=None):
        return self.api(user).post(f'/api/letters/{letter.pk}/{action}/', data or {}, format='json')

    def reload(self, letter):
        return Letter.objects.get(pk=letter.pk)

    def task_of(self, letter):
        return engine.open_task(LETTER_SIGN_WORKFLOW, letter.pk)


class SigningTests(SigningBase):
    def test_number_only_at_final_signature(self):
        d = self.draft()
        self.image(self.signer, self.reader)
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 200)
        d = self.reload(d)
        self.assertEqual((d.status, d.number_display), (Letter.STATUS_SIGNING, ''))
        self.assertEqual(self.task_of(d).target_user_id, self.signer.pk)
        # نفر دوم پیش از نوبتش اقدام نمی‌کند
        self.assertEqual(self.post(self.reader, d, 'sign').status_code, 403)
        self.assertEqual(self.post(self.signer, d, 'sign').status_code, 200)
        d = self.reload(d)
        self.assertEqual(d.status, Letter.STATUS_SIGNING)
        self.assertFalse(IssuedNumber.objects.exists())
        self.assertEqual(self.task_of(d).target_user_id, self.reader.pk)
        res = self.post(self.reader, d, 'sign')
        self.assertEqual(res.status_code, 200)
        d = self.reload(d)
        self.assertEqual(d.status, Letter.STATUS_REGISTERED)
        self.assertTrue(d.number_display and d.issued_number_id and d.registered_at)
        self.assertEqual(d.registered_by_id, self.reader.pk)
        self.assertEqual(set(d.signers.values_list('status', flat=True)), {LetterSigner.STATUS_SIGNED})
        self.assertEqual(IssuedNumber.objects.get().entity_id, str(d.pk))

    def test_electronic_without_signature_image_is_400_wet_is_not(self):
        d = self.draft(signers=[self.signer])
        self.post(self.author, d, 'submit')
        res = self.post(self.signer, d, 'sign')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'action_blocked')
        self.assertEqual(self.reload(d).status, Letter.STATUS_SIGNING)
        wet = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.post(self.author, wet, 'submit')
        self.assertEqual(self.post(self.signer, wet, 'sign').status_code, 200)
        self.assertEqual(self.reload(wet).status, Letter.STATUS_REGISTERED)

    def test_return_makes_letter_editable_and_starts_new_round(self):
        d = self.draft()
        self.image(self.signer, self.reader)
        self.post(self.author, d, 'submit')
        self.post(self.signer, d, 'sign')
        self.assertEqual(self.post(self.reader, d, 'return').status_code, 400)  # دلیل اجباری
        self.assertEqual(self.post(self.reader, d, 'return', {'reason': 'اصلاح بند دو'}).status_code, 200)
        d = self.reload(d)
        self.assertEqual(d.status, Letter.STATUS_DRAFT)
        self.assertEqual(set(d.signers.values_list('status', flat=True)), {LetterSigner.STATUS_PENDING})
        res = self.api(self.author).patch(f'/api/letters/{d.pk}/', {'body': BODY, 'revision': d.revision},
                                          format='json')
        self.assertFalse(res.json()['conflict'])
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 200)
        self.assertEqual(self.task_of(d).target_user_id, self.signer.pk)  # دور تازه از نفر اول

    def test_sign_and_return_from_core_my_tasks(self):
        d = self.draft()
        self.image(self.signer, self.reader)
        self.post(self.author, d, 'submit')
        url = f'/api/workflow/tasks/{self.task_of(d).pk}/action/'
        self.assertEqual(self.api(self.signer).post(url, {'action': 'act'}, format='json').status_code, 200)
        url = f'/api/workflow/tasks/{self.task_of(d).pk}/action/'
        res = self.api(self.reader).post(url, {'action': 'return', 'reason': 'اصلاح'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.reload(d).status, Letter.STATUS_DRAFT)
        self.post(self.author, d, 'submit')
        for user in (self.signer, self.reader):
            url = f'/api/workflow/tasks/{self.task_of(d).pk}/action/'
            self.assertEqual(self.api(user).post(url, {'action': 'act'}, format='json').status_code, 200)
        self.assertEqual(self.reload(d).status, Letter.STATUS_REGISTERED)

    def test_submit_rules(self):
        d = self.draft(signers=[])
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 400)
        d = self.draft()
        self.assertEqual(self.post(self.signer, d, 'submit').status_code, 403)  # امضاکننده نویسنده نیست
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 200)
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 409)

    def test_substitute_never_sees_confidential_letter(self):
        today = timezone.localdate()
        WorkflowSubstitute.objects.create(principal=self.signer, substitute=self.stranger, company=self.co_a,
                                          start_date=today - timedelta(days=1), end_date=today + timedelta(days=1))
        self.image(self.signer, self.reader)
        normal = self.draft()
        self.post(self.author, normal, 'submit')
        self.assertEqual(self.api(self.stranger).get(f'/api/letters/{normal.pk}/').status_code, 200)
        secret = self.draft(confidentiality=Letter.CONF_CONFIDENTIAL)
        self.post(self.author, secret, 'submit')
        self.assertFalse(engine.instance_of(LETTER_SIGN_WORKFLOW, secret.pk).allow_substitute)
        self.assertEqual(self.api(self.stranger).get(f'/api/letters/{secret.pk}/').status_code, 404)
        self.assertEqual(self.post(self.stranger, secret, 'sign').status_code, 404)
        self.assertNotIn('موضوع', engine.instance_of(LETTER_SIGN_WORKFLOW, secret.pk).summary['title'])


class RegistrationTests(SigningBase):
    def incoming(self, **kw):
        return self.letter(kind=Letter.KIND_INCOMING, status=Letter.STATUS_RECEIVED, author=self.secretary, **kw)

    def test_incoming_register_is_idempotent_and_numbers_differ(self):
        a, b = self.incoming(), self.incoming()
        self.assertEqual(self.post(self.secretary, a, 'register').status_code, 200)
        self.assertEqual(self.post(self.secretary, b, 'register').status_code, 200)
        a, b = self.reload(a), self.reload(b)
        self.assertEqual((a.status, b.status), (Letter.STATUS_REGISTERED, Letter.STATUS_REGISTERED))
        self.assertNotEqual(a.number_display, b.number_display)
        self.assertIn('/و/', a.number_display)
        self.assertEqual(self.post(self.secretary, a, 'register').json()['number_display'], a.number_display)
        self.assertEqual(IssuedNumber.objects.count(), 2)

    def test_register_needs_secretariat_and_hides_from_others(self):
        a = self.incoming()
        self.assertEqual(self.post(self.author, a, 'register').status_code, 404)
        self.assertEqual(self.post(self.outsider, a, 'register').status_code, 404)
        out = self.draft()
        self.assertEqual(self.post(self.author, out, 'register').status_code, 400)

    def test_rollback_gives_number_back(self):
        a = self.incoming()
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                lifecycle.register_in_tx(Letter.objects.select_for_update().get(pk=a.pk), self.secretary)
                raise RuntimeError('boom')
        self.assertFalse(IssuedNumber.objects.exists())
        self.assertFalse(NumberCounter.objects.filter(last_seq__gt=0).exists())
        self.assertEqual(self.reload(a).status, Letter.STATUS_RECEIVED)
        self.post(self.secretary, a, 'register')
        self.assertTrue(self.reload(a).number_display.endswith('/1'))

    def test_locked_after_registration(self):
        d = self.registered_via_signing()
        self.assertTrue(letter_is_locked(d.pk))
        res = self.api(self.author).patch(f'/api/letters/{d.pk}/', {'body': BODY, 'revision': d.revision},
                                          format='json')
        self.assertTrue(res.json()['conflict'])
        self.assertEqual(self.reload(d).body, [])
        res = self.api(self.author).patch(f'/api/letters/{d.pk}/', {'signers': [], 'revision': d.revision},
                                          format='json')
        self.assertEqual(res.status_code, 400)

    def registered_via_signing(self, **kw):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET, **kw)
        self.post(self.author, d, 'submit')
        self.post(self.signer, d, 'sign')
        return self.reload(d)

    def test_void_keeps_number_voided(self):
        d = self.registered_via_signing()
        self.assertEqual(self.post(self.author, d, 'void', {'reason': 'x'}).status_code, 403)
        self.assertEqual(self.post(self.secretary, d, 'void').status_code, 400)
        self.assertEqual(self.post(self.secretary, d, 'void', {'reason': 'اشتباه'}).status_code, 200)
        d = self.reload(d)
        self.assertEqual(d.status, Letter.STATUS_VOID)
        issued = IssuedNumber.objects.get(pk=d.issued_number_id)
        self.assertEqual((issued.status, issued.void_reason), (IssuedNumber.STATUS_VOID, 'اشتباه'))
        self.assertTrue(d.number_display)
        nxt = self.registered_via_signing()
        self.assertNotEqual(nxt.number_display, d.number_display)
        self.assertTrue(Letter.objects.filter(pk=d.pk).exists())

    def test_void_draft_by_author_only_with_reason(self):
        d = self.draft()
        self.assertEqual(self.post(self.author, d, 'void').status_code, 400)
        self.assertEqual(self.post(self.signer, d, 'void', {'reason': 'x'}).status_code, 403)
        self.assertEqual(self.post(self.author, d, 'void', {'reason': 'لازم نیست'}).status_code, 200)
        self.assertEqual(self.reload(d).status, Letter.STATUS_VOID)
        s = self.draft(signers=[self.signer])
        self.post(self.author, s, 'submit')
        self.assertEqual(self.post(self.author, s, 'void', {'reason': 'x'}).status_code, 409)

    def test_outgoing_send_archive_unarchive(self):
        d = self.registered_via_signing(kind=Letter.KIND_OUTGOING)
        self.assertEqual(self.post(self.author, d, 'send', {'method': 'post'}).status_code, 403)
        self.assertEqual(self.post(self.secretary, d, 'send', {'method': 'fax'}).status_code, 400)
        self.assertEqual(self.post(self.secretary, d, 'send', {'method': 'post'}).status_code, 200)
        d = self.reload(d)
        self.assertEqual((d.status, d.sent_method), (Letter.STATUS_SENT, 'post'))
        self.assertEqual(self.post(self.author, d, 'archive').status_code, 200)
        self.assertEqual(self.reload(d).status, Letter.STATUS_ARCHIVED)
        self.assertEqual(self.post(self.secretary, d, 'unarchive').status_code, 200)
        self.assertEqual(self.reload(d).status, Letter.STATUS_SENT)
        internal = self.registered_via_signing()
        self.assertEqual(self.post(self.secretary, internal, 'send', {'method': 'post'}).status_code, 400)

    def test_outsider_404_on_every_action_and_audit_has_no_subject(self):
        d = self.registered_via_signing()
        for action in ('submit', 'sign', 'return', 'register', 'send', 'archive', 'unarchive', 'void'):
            self.assertEqual(self.post(self.outsider, d, action, {'reason': 'x'}).status_code, 404, action)
        logs = AuditLog.objects.filter(target_model='Letter', target_object_id=str(d.pk))
        events = {log.details.get('event') for log in logs}
        self.assertTrue({'submit', 'sign', 'register'} <= events, events)
        self.assertFalse(logs.filter(target_repr__contains=d.subject).exists())


class ConcurrentRegistrationTests(TransactionTestCase):
    """دو ثبت هم‌زمان در یک سری هرگز یک شماره نمی‌گیرند (قفل شمارنده)."""

    def test_parallel_registrations_get_distinct_numbers(self):
        if connection.vendor != 'postgresql':
            self.skipTest('needs row locks')
        co = Company.objects.create(code='LTC', name='شرکت ج')
        user = User.objects.create_user(username='l_conc', password='x')
        SectionAssignment.objects.create(user=user, company=co, role='employee')
        letters = [Letter.objects.create(company=co, author=user, kind=Letter.KIND_INCOMING,
                                         status=Letter.STATUS_RECEIVED) for _ in range(4)]
        barrier = threading.Barrier(len(letters))
        errors = []

        def run(pk):
            try:
                barrier.wait(timeout=10)
                with transaction.atomic():
                    lifecycle.register_in_tx(Letter.objects.select_for_update().get(pk=pk), user)
            except Exception as exc:  # pragma: no cover - گزارش در assert
                errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=run, args=(x.pk,)) for x in letters]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(errors, [])
        numbers = list(Letter.objects.filter(company=co).values_list('number_display', flat=True))
        self.assertEqual(len(set(numbers)), len(letters))
        self.assertEqual(sorted(IssuedNumber.objects.filter(company_id=co.pk).values_list('seq', flat=True)),
                         [1, 2, 3, 4])
