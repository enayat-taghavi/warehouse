"""
تست‌های سناریوی ل-ط (ق۱۴): چرخهٔ کامل کسب‌وکار نامه از راه API، هر سناریو یک متد با بررسی وضعیت پس از هر گام.
صادره با امضای الکترونیکی تا ارسال، پاسخ، چاپ و صحت‌سنجی؛ وارده با اسکن و ارجاع سه‌سطحی؛ سری با جانشین؛
بخشنامهٔ بخشی. اجرا با WH_MODULES=warehouse,accounting,letters.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from attachments.models import Attachment
from companies.models import SectionAssignment
from contacts.models import ExternalParty
from notifications.models import Notification
from numbering.models import IssuedNumber
from reports.document_pdf import verify_token
from workflow.models import WorkflowSubstitute

from letters.models import LETTER_ENTITY, Letter, LetterSigner
from letters.tests.test_api_lc import BODY
from letters.tests.test_print_lh import PrintBase, png
from letters.tests.test_referral_le import ReferralBase

User = get_user_model()

NEW_BODY = [{'type': 'paragraph', 'align': 'right', 'runs': [{'text': 'متن اصلاح‌شده'}]}]


class ScenarioBase(ReferralBase, PrintBase):
    def sig_image(self, *users):
        # تصویر امضای واقعی در MEDIA موقت تا PDF هم بتواند آن را بخواند
        for user in users:
            Attachment.objects.create(entity_kind='user', entity_id=str(user.pk), label='signature',
                                      file=SimpleUploadedFile('sig.png', png('black', (80, 40))))

    def detail(self, user, letter):
        return self.api(user).get(f'/api/letters/{letter.pk}/')

    def upload(self, user, letter, label='signed_scan', via='scan'):
        f = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        client = self.api(user)
        if via == 'scan':
            return client.post(f'/api/letters/{letter.pk}/scan/', {'file': f, 'label': label}, format='multipart')
        return client.post('/api/attachments/', {'kind': LETTER_ENTITY, 'id': letter.pk, 'file': f, 'label': label},
                           format='multipart')

    def task_action(self, user, task, action, **data):
        return self.api(user).post(f'/api/workflow/tasks/{task.pk}/action/', {'action': action, **data},
                                   format='json')

    def verify(self, letter, confidential=False):
        token = verify_token(LETTER_ENTITY, letter.pk, letter.number_display, company_id=letter.company_id,
                             title='نامه', date='1405/08/14', confidential=confidential)
        res = self.client.get(f'/api/public/verify/{token}/')
        self.assertEqual(res.status_code, 200)
        return res.json()

    def substitute(self, principal, substitute):
        today = timezone.localdate()
        WorkflowSubstitute.objects.create(principal=principal, substitute=substitute, company=self.co_a,
                                          start_date=today - timedelta(days=1), end_date=today + timedelta(days=1))


class OutgoingScenarioTests(ScenarioBase):
    def test_outgoing_from_draft_to_send_reply_print_and_verify(self):
        party = ExternalParty.objects.create(company=self.co_a, name='شرکت بیرونی')
        self.sig_image(self.signer)
        # ۱) نویسنده پیش‌نویس صادره می‌سازد
        res = self.create(kind='outgoing', subject='پیشنهاد همکاری', body=BODY,
                          recipients=[{'target_type': 'party', 'party': party.pk}],
                          signers=[{'user': self.signer.pk}])
        self.assertEqual(res.status_code, 201, res.content)
        letter = Letter.objects.get(pk=res.json()['id'])
        self.assertEqual((letter.status, letter.number_display), (Letter.STATUS_DRAFT, ''))
        self.assertEqual(self.get(self.signer, letter), 200)
        for user in (self.secretary, self.reader, self.outsider):
            self.assertEqual(self.get(user, letter), 404, user.username)

        # ۲) ویرایش با نسخه
        res = self.api(self.author).patch(f'/api/letters/{letter.pk}/', {'body': NEW_BODY, 'revision': 1},
                                          format='json')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['conflict'])
        letter = self.reload(letter)
        self.assertEqual((letter.body, letter.revision), (NEW_BODY, 2))

        # ۳) ارسال برای امضا: هنوز شماره ندارد
        self.assertEqual(self.post(self.author, letter, 'submit').status_code, 200)
        letter = self.reload(letter)
        self.assertEqual((letter.status, letter.number_display), (Letter.STATUS_SIGNING, ''))
        self.assertFalse(IssuedNumber.objects.exists())
        self.assertEqual(self.task_of(letter).target_user_id, self.signer.pk)
        # پیش از ثبت دبیرخانه آن را نمی‌فرستد و چاپ نمی‌شود
        self.assertEqual(self.post(self.secretary, letter, 'send', {'method': 'post'}).status_code, 404)
        self.assertEqual(self.pdf(self.author, letter).status_code, 404)

        # ۴) امضای الکترونیکی نهایی: شماره در همان لحظه و ثبت خودکار (ثبت جدا برای صادره نیست)
        self.assertEqual(self.post(self.signer, letter, 'sign').status_code, 200)
        letter = self.reload(letter)
        self.assertEqual(letter.status, Letter.STATUS_REGISTERED)
        self.assertTrue(letter.number_display and letter.issued_number_id and letter.registered_at)
        self.assertEqual(IssuedNumber.objects.get().entity_id, str(letter.pk))
        self.assertEqual(self.reload(letter).signers.get().status, LetterSigner.STATUS_SIGNED)
        self.assertEqual(self.post(self.secretary, letter, 'register').status_code, 400)
        number = letter.number_display
        # صادره ارجاع خودکار نمی‌گیرد؛ دبیرخانه حالا آن را می‌بیند
        self.assertFalse(self.tasks(letter).exists())
        self.assertEqual(self.get(self.secretary, letter), 200)
        self.assertEqual(self.get(self.outsider, letter), 404)

        # ۵) ارسال با دبیرخانه
        self.assertEqual(self.post(self.author, letter, 'send', {'method': 'post'}).status_code, 403)
        self.assertEqual(self.post(self.secretary, letter, 'send', {'method': 'post'}).status_code, 200)
        letter = self.reload(letter)
        self.assertEqual((letter.status, letter.sent_method, letter.number_display),
                         (Letter.STATUS_SENT, 'post', number))

        # ۶) پاسخ طرف بیرونی: دبیرخانه وارده‌ای در پاسخ به همین نامه ثبت می‌کند
        res = self.create(user=self.secretary, kind='incoming', subject='پاسخ پیشنهاد', sender_party=party.pk,
                          reply_to=letter.pk, external_number='EXT-77')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual((res.json()['reply_to'], res.json()['status']), (letter.pk, Letter.STATUS_RECEIVED))
        reply = Letter.objects.get(pk=res.json()['id'])
        self.assertEqual(self.post(self.secretary, reply, 'register').status_code, 200)
        reply = self.reload(reply)
        self.assertEqual(reply.status, Letter.STATUS_REGISTERED)
        self.assertIn('/و/', reply.number_display)
        self.assertNotEqual(reply.number_display, number)
        # پیرو: نویسنده نامهٔ تازه‌ای پیرو نامهٔ خودش می‌سازد؛ پیرو نامهٔ نادیدنی رد می‌شود
        res = self.create(kind='outgoing', follow_up_of=letter.pk, signers=[{'user': self.signer.pk}])
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['follow_up_of'], letter.pk)
        self.assertEqual(self.create(follow_up_of=reply.pk).status_code, 400)  # وارده را نویسنده نمی‌بیند

        # ۷) چاپ: مجاز 200 PDF، بیگانه و هم‌شرکتیِ بی‌ربط 404
        res = self.pdf(self.author, letter)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(res.streaming_content if res.streaming else [res.content]).startswith(b'%PDF'))
        self.assertEqual(self.pdf(self.signer, letter).status_code, 200)
        self.assertEqual(self.pdf(self.outsider, letter).status_code, 404)
        self.assertEqual(self.pdf(self.reader, letter).status_code, 404)

        # ۸) صحت‌سنجی عمومی شمارهٔ زنده را نشان می‌دهد و موضوع را نه
        data = self.verify(letter)
        self.assertEqual(data['current']['number'], number)
        self.assertEqual(data['current']['status'], 'ارسال‌شده')
        self.assertNotIn(letter.subject, str(data))


class IncomingScenarioTests(ScenarioBase):
    def test_incoming_with_scan_and_three_level_referral(self):
        manager, deputy, expert = self.reader, self.coauthor, self.stranger
        # ۱) دبیرخانه وارده را با اسکن می‌سازد
        res = self.create(user=self.secretary, kind='incoming', subject='درخواست پیمانکار', external_number='IN-5')
        self.assertEqual(res.status_code, 201, res.content)
        letter = Letter.objects.get(pk=res.json()['id'])
        self.assertEqual(letter.status, Letter.STATUS_RECEIVED)
        self.assertEqual(self.upload(self.secretary, letter, label='', via='generic').status_code, 201)
        self.assertEqual(self.upload(self.outsider, letter, label='', via='generic').status_code, 403)
        # ۲) ثبت دبیرخانه با شمارهٔ وارده
        self.assertEqual(self.post(self.author, letter, 'register').status_code, 404)
        self.assertEqual(self.post(self.secretary, letter, 'register').status_code, 200)
        letter = self.reload(letter)
        self.assertEqual(letter.status, Letter.STATUS_REGISTERED)
        self.assertIn('/و/', letter.number_display)
        # پس از ثبت API عمومی بسته است و اسکن از مسیر scan می‌آید
        self.assertEqual(self.upload(self.secretary, letter, label='', via='generic').status_code, 403)
        self.assertEqual(self.upload(self.secretary, letter, label='after_register').status_code, 201)
        self.assertEqual(Attachment.objects.filter(entity_kind=LETTER_ENTITY, entity_id=str(letter.pk)).count(), 2)
        for user in (manager, deputy, expert, self.signer, self.outsider):
            self.assertEqual(self.get(user, letter), 404, user.username)

        # ۳) ارجاع ریشه به مدیر
        self.assertEqual(self.refer(self.secretary, letter, [manager], instruction='بررسی').status_code, 201)
        root = self.tasks(letter, target_user=manager).get()
        self.assertIsNone(root.parent_task_id)
        self.assertEqual(self.get(manager, letter), 200)
        for user in (deputy, expert, self.outsider):
            self.assertEqual(self.get(user, letter), 404, user.username)
        self.assertEqual(self.refer(deputy, letter, [expert]).status_code, 404)

        # ۴) مدیر به معاون
        self.assertEqual(self.refer(manager, letter, [deputy], instruction='پیگیری').status_code, 201)
        mid = self.tasks(letter, target_user=deputy).get()
        self.assertEqual(mid.parent_task_id, root.pk)
        self.assertEqual(self.get(deputy, letter), 200)
        self.assertEqual(self.get(expert, letter), 404)

        # ۵) معاون به کارشناس (سطح سوم)
        self.assertEqual(self.refer(deputy, letter, [expert], instruction='اقدام').status_code, 201)
        leaf = self.tasks(letter, target_user=expert).get()
        self.assertEqual(leaf.parent_task_id, mid.pk)
        for user in (manager, deputy, expert, self.secretary):
            self.assertEqual(self.get(user, letter), 200, user.username)
        tree = self.api(expert).get(f'/api/letters/{letter.pk}/referrals/').json()['referrals']
        self.assertEqual([n['task_id'] for n in tree], [root.pk, mid.pk, leaf.pk])
        self.assertTrue({n['task_id']: n['can_close'] for n in tree}[leaf.pk])

        # ۶) کارشناس «انجام شد» می‌زند؛ دیگران کار او را نمی‌بندند
        self.assertIn(self.task_action(manager, leaf, 'done').status_code, (403, 404))
        res = self.task_action(expert, leaf, 'done', reply='انجام شد')
        self.assertEqual(res.status_code, 200, res.content)
        leaf.refresh_from_db()
        self.assertFalse(leaf.is_open)
        self.assertEqual(self.task_action(expert, leaf, 'done').status_code, 409)
        self.assertEqual(self.tasks(letter, is_open=True).count(), 2)
        self.assertEqual(self.get(expert, letter), 200)  # کار بسته هم دیدن را نگه می‌دارد

        # بیگانه همه‌جا 404
        out = self.api(self.outsider)
        for url in (f'/api/letters/{letter.pk}/', f'/api/letters/{letter.pk}/referrals/',
                    f'/api/letters/{letter.pk}/audience/'):
            self.assertEqual(out.get(url).status_code, 404, url)
        for action in ('register', 'send', 'archive', 'void'):
            self.assertEqual(self.post(self.outsider, letter, action, {'reason': 'x'}).status_code, 404, action)
        self.assertEqual(self.refer(self.outsider, letter, [manager]).status_code, 404)
        self.assertEqual(self.upload(self.outsider, letter).status_code, 404)
        self.assertEqual(self.pdf(self.outsider, letter).status_code, 404)
        self.assertEqual(self.task_action(self.outsider, root, 'done').status_code, 404)
        self.assertEqual(out.get('/api/letters/').json()['count'], 0)


class SecretScenarioTests(ScenarioBase):
    def test_secret_letter_with_substitutes(self):
        sub_signer = self.member('l_sub_signer', self.co_a)
        sub_secretary = self.member('l_sub_secretary', self.co_a)
        self.substitute(self.signer, sub_signer)
        self.substitute(self.secretary, sub_secretary)
        self.sig_image(self.signer)
        # ۱) پیش‌نویس سری
        res = self.create(kind='internal', subject='موضوع سری', confidentiality='secret', body=BODY,
                          signers=[{'user': self.signer.pk}],
                          recipients=[{'target_type': 'user', 'user': self.reader.pk}])
        self.assertEqual(res.status_code, 201, res.content)
        letter = Letter.objects.get(pk=res.json()['id'])
        self.assertEqual(letter.confidentiality, Letter.CONF_SECRET)

        # ۲) ارسال برای امضا: جانشین امضاکننده هیچ نمی‌بیند
        self.assertEqual(self.post(self.author, letter, 'submit').status_code, 200)
        for user in (sub_signer, sub_secretary, self.secretary, self.outsider):
            self.assertEqual(self.get(user, letter), 404, user.username)
        self.assertEqual(self.post(sub_signer, letter, 'sign').status_code, 404)
        self.assertEqual(self.task_action(sub_signer, self.task_of(letter), 'act').status_code, 404)

        # ۳) امضای نهایی و ثبت
        self.assertEqual(self.post(self.signer, letter, 'sign').status_code, 200)
        letter = self.reload(letter)
        self.assertEqual(letter.status, Letter.STATUS_REGISTERED)
        self.assertTrue(letter.number_display)
        self.assertEqual(self.get(self.reader, letter), 200)
        for user in (sub_signer, sub_secretary, self.secretary, self.stranger, self.outsider):
            self.assertEqual(self.get(user, letter), 404, user.username)

        # ۴) دفتر دبیرخانه: فقط ردیف پوشیده با شماره
        rows = self.api(self.secretary).get('/api/letters/register/', {'company': self.co_a.pk}).json()
        row = next(r for r in rows if r['id'] == letter.pk)
        self.assertTrue(row['covered'])
        self.assertEqual(row['number_display'], letter.number_display)
        self.assertIsNone(row['author'])
        self.assertNotIn('موضوع سری', str(rows))
        self.assertEqual(self.api(sub_secretary).get('/api/letters/register/',
                                                     {'company': self.co_a.pk}).status_code, 403)
        self.assertEqual(self.refer(self.secretary, letter, [self.stranger]).status_code, 404)
        self.assertEqual(self.post(self.secretary, letter, 'void', {'reason': 'x'}).status_code, 404)

        # ۵) پیوست پس از ثبت: API عمومی بسته، scan با signed_scan برای امضاکننده باز
        for user in (self.author, self.signer):
            self.assertEqual(self.upload(user, letter, via='generic').status_code, 403, user.username)
        res = self.upload(self.signer, letter)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Attachment.objects.get(pk=res.json()['id']).label, 'signed_scan')
        self.assertEqual(self.upload(self.secretary, letter).status_code, 404)  # نامه را نمی‌بیند
        self.assertEqual(self.upload(sub_signer, letter).status_code, 404)
        self.assertEqual(self.upload(self.reader, letter).status_code, 403)

        # ۶) صحت‌سنجی عمومی فقط شماره
        self.assertEqual(self.verify(letter, confidential=True), {'valid': True, 'number': letter.number_display})


class CircularScenarioTests(ScenarioBase):
    def test_section_circular_audience_and_single_notification(self):
        other_section = User.objects.create_user(username='l_sec_other', password='x')
        SectionAssignment.objects.create(user=other_section, section=self.sec_a2, role='employee')
        # ۱) بی‌مجوز بخشنامه ساخته نمی‌شود
        self.assertEqual(self.create(kind='circular').status_code, 403)
        self.grant(self.author, self.co_a, 'perm_letters_circular')
        res = self.create(kind='circular', subject='بخشنامهٔ ایمنی', body=BODY, sign_mode='wet',
                          signers=[{'user': self.signer.pk}])
        self.assertEqual(res.status_code, 201, res.content)
        letter = Letter.objects.get(pk=res.json()['id'])

        # ۲) مخاطب بخش الف
        url = f'/api/letters/{letter.pk}/audience/'
        res = self.api(self.author).put(url, {'audience': [{'scope': 'section', 'section_id': self.sec_a.pk}]},
                                        format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.get(self.section_user, letter), 404)  # پیش از ثبت مخاطب نمی‌بیند

        # ۳) امضا و ثبت؛ یک اعلان برای عضو بخش
        self.assertEqual(self.post(self.author, letter, 'submit').status_code, 200)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(self.signer, letter, 'sign').status_code, 200)
        letter = self.reload(letter)
        self.assertEqual(letter.status, Letter.STATUS_REGISTERED)
        self.assertFalse(self.tasks(letter).exists())

        def notes(user):
            return Notification.objects.filter(recipient=user, notification_type='letters_circular').count()
        self.assertEqual(notes(self.section_user), 1)
        self.assertEqual(notes(other_section), 0)
        self.assertEqual(notes(self.outsider), 0)
        self.assertEqual(notes(self.author), 0)

        # ۴) دیدن: عضو بخش آری، بخش دیگر و شرکت دیگر نه
        self.assertEqual(self.get(self.section_user, letter), 200)
        self.assertEqual(self.get(other_section, letter), 404)
        self.assertEqual(self.get(self.outsider, letter), 404)
        ids = [r['id'] for r in self.api(self.section_user).get('/api/letters/circulars/').json()]
        self.assertEqual(ids, [letter.pk])
        self.assertEqual(self.api(other_section).get('/api/letters/circulars/').json(), [])
        self.assertEqual(self.api(self.outsider).get('/api/letters/circulars/').json(), [])

        # ۵) کنش‌های دوباره اعلان تازه نمی‌سازند
        with self.captureOnCommitCallbacks(execute=True):
            self.post(self.secretary, letter, 'register')
            self.post(self.signer, letter, 'sign')
            self.api(self.author).put(url, {'audience': [{'scope': 'section', 'section_id': self.sec_a.pk}]},
                                      format='json')
        self.assertEqual(notes(self.section_user), 1)
        self.assertEqual(self.reload(letter).audiences.get().section_id, self.sec_a.pk)
