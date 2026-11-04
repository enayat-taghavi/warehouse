"""
تست‌های ل-ز (بک‌اند): کنش‌های مجاز در جزئیات، نام گیرندهٔ کاربری، فیلترهای شخصی فهرست (همیشه درون دیدن)،
پخش دوبارهٔ ساخت مثل PATCH با نسخهٔ ناهمگام، و «می‌توانم ببندم» در درخت ارجاع.
اجرا با WH_MODULES=warehouse,accounting,letters.
"""
import uuid
from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from contacts.models import ExternalParty

from letters.models import Letter, LetterDraftCopy, LetterEditor, LetterRecipient
from letters.tests.test_api_lc import BODY
from letters.tests.test_signing_ld import SigningBase

NEW_BODY = [{'type': 'paragraph', 'align': 'right', 'runs': [{'text': 'newer text'}]}]


class AllowedActionsTests(SigningBase):
    def actions(self, user, letter):
        return self.api(user).get(f'/api/letters/{letter.pk}/').json()['actions']

    def test_draft_actions_for_author_only(self):
        d = self.draft(signers=[self.signer])
        self.assertEqual(self.actions(self.author, d), ['edit', 'submit', 'void'])
        self.assertEqual(self.actions(self.signer, d), [])
        self.assertEqual(self.actions(self.admin, d), [])

    def test_sign_and_return_only_for_current_signer(self):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.assertEqual(self.post(self.author, d, 'submit').status_code, 200)
        self.assertEqual(self.actions(self.signer, d), ['sign', 'return'])
        self.assertNotIn('sign', self.actions(self.author, d))
        self.assertEqual(self.actions(self.admin, d), [])

    def test_registered_actions_follow_lifecycle_rules(self):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.post(self.author, d, 'submit')
        self.post(self.signer, d, 'sign')
        self.assertEqual(self.reload(d).status, Letter.STATUS_REGISTERED)
        self.assertEqual(self.actions(self.author, d), ['archive', 'refer'])
        self.assertEqual(self.actions(self.secretary, d), ['archive', 'void', 'refer'])
        self.post(self.secretary, d, 'archive')
        self.assertEqual(self.actions(self.author, d), ['unarchive'])

    def test_incoming_register_for_secretariat(self):
        d = self.letter(kind=Letter.KIND_INCOMING, status=Letter.STATUS_RECEIVED, author=self.secretary)
        self.assertIn('register', self.actions(self.secretary, d))


class RecipientNameTests(SigningBase):
    def test_detail_and_list_show_user_names(self):
        self.reader.first_name, self.reader.last_name = 'Ali', 'Rezaei'
        self.reader.save()
        d = self.letter()
        LetterRecipient.objects.create(letter=d, role='to', target_type='user', user=self.reader)
        LetterRecipient.objects.create(letter=d, role='cc', target_type='text', name_text='Office')
        detail = self.api(self.author).get(f'/api/letters/{d.pk}/').json()
        names = {r['target_type']: r['user_name'] for r in detail['recipients']}
        self.assertEqual(names, {'user': 'Ali Rezaei', 'text': ''})
        row = self.api(self.author).get('/api/letters/').json()['results'][0]
        self.assertCountEqual(row['recipients_brief'], [{'role': 'to', 'name': 'Ali Rezaei'},
                                                       {'role': 'cc', 'name': 'Office'}])

    def test_list_has_no_n_plus_one(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.api(self.author).get('/api/letters/').status_code, 200)
            return len(ctx.captured_queries)

        d = self.letter()
        LetterRecipient.objects.create(letter=d, role='to', target_type='user', user=self.reader)
        one = count()
        for _ in range(3):
            more = self.letter()
            LetterRecipient.objects.create(letter=more, role='to', target_type='user', user=self.signer)
        self.assertEqual(count(), one)


class ListFilterTests(SigningBase):
    def ids(self, user, **params):
        res = self.api(user).get('/api/letters/', params)
        self.assertEqual(res.status_code, 200, res.content)
        return {r['id'] for r in res.json()['results']}

    def test_mine_and_to_me(self):
        own = self.letter()
        coauthored = self.letter(author=self.signer)
        LetterEditor.objects.create(letter=coauthored, user=self.author)
        to_me = self.registered(author=self.signer)
        LetterRecipient.objects.create(letter=to_me, role='to', target_type='user', user=self.author)
        self.assertEqual(self.ids(self.author, mine=1), {own.pk, coauthored.pk})
        self.assertEqual(self.ids(self.author, to_me=1), {to_me.pk})

    def test_to_me_includes_referral_tree(self):
        d = self.draft(signers=[self.signer], sign_mode=Letter.SIGN_WET)
        self.post(self.author, d, 'submit')
        self.post(self.signer, d, 'sign')
        res = self.post(self.secretary, d, 'refer', {'targets': [self.reader.pk], 'kind': 'refer'})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(self.ids(self.reader, to_me=1), {d.pk})
        tree = self.api(self.reader).get(f'/api/letters/{d.pk}/referrals/').json()['referrals']
        self.assertTrue(tree[0]['can_close'])
        tree = self.api(self.secretary).get(f'/api/letters/{d.pk}/referrals/').json()['referrals']
        self.assertFalse(tree[0]['can_close'])

    def test_date_and_party_filters_stay_inside_visibility(self):
        old = self.registered(registered_at=timezone.now() - timedelta(days=10))
        new = self.registered()
        today = timezone.localdate().isoformat()
        self.assertEqual(self.ids(self.author, date_from=today), {new.pk})
        self.assertEqual(self.ids(self.author, date_to=(timezone.localdate() - timedelta(days=5)).isoformat()),
                         {old.pk})
        self.assertEqual(self.api(self.author).get('/api/letters/', {'date_from': 'x'}).status_code, 400)
        party = ExternalParty.objects.create(company=self.co_a, kind='legal', name='Acme')
        sent = self.letter(sender_party=party, kind=Letter.KIND_INCOMING, status=Letter.STATUS_RECEIVED)
        hidden = self.letter(author=self.signer, sender_party=party)
        self.assertEqual(self.ids(self.author, party=party.pk), {sent.pk})
        self.assertNotIn(hidden.pk, self.ids(self.outsider, party=party.pk))
        self.assertEqual(self.ids(self.outsider, mine=1, to_me=1), set())


class ReplayCreateTests(SigningBase):
    def test_replayed_create_applies_newer_body(self):
        tid = str(uuid.uuid4())
        first = self.create(client_temp_id=tid, body=BODY)
        self.assertEqual(first.status_code, 201)
        replay = self.create(client_temp_id=tid, body=NEW_BODY, subject='newer')
        self.assertEqual(replay.status_code, 200)
        data = replay.json()
        self.assertTrue(data['duplicate'])
        self.assertFalse(data['conflict'])
        letter = Letter.objects.get(client_temp_id=tid)
        self.assertEqual((letter.subject, letter.body, letter.revision), ('newer', NEW_BODY, 2))

    def test_stale_replay_keeps_conflict_copy_and_same_text_is_noop(self):
        tid = str(uuid.uuid4())
        pk = self.create(client_temp_id=tid, body=BODY).json()['id']
        patched = self.api(self.author).patch(f'/api/letters/{pk}/', {'subject': 'edited', 'revision': 1},
                                              format='json')
        self.assertEqual(patched.status_code, 200)
        stale = self.create(client_temp_id=tid, body=NEW_BODY, subject='old queued')
        self.assertEqual(stale.status_code, 200)
        self.assertTrue(stale.json()['conflict'])
        self.assertTrue(stale.json()['duplicate'])
        self.assertEqual(Letter.objects.get(pk=pk).subject, 'edited')
        copy = LetterDraftCopy.objects.get(letter_id=pk)
        self.assertEqual((copy.subject, copy.body), ('old queued', NEW_BODY))
        same = self.create(client_temp_id=tid, body=BODY, subject='edited')
        self.assertEqual(same.status_code, 200)
        self.assertFalse(same.json().get('conflict'))
        self.assertEqual(LetterDraftCopy.objects.filter(letter_id=pk).count(), 1)

    def test_replay_on_registered_letter_keeps_text(self):
        tid = uuid.uuid4()
        d = self.registered(client_temp_id=tid)
        res = self.create(client_temp_id=str(tid), body=NEW_BODY, subject='late')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['conflict'])
        self.assertEqual(Letter.objects.get(pk=d.pk).subject, 'موضوع آزمایشی')
        self.assertTrue(LetterDraftCopy.objects.filter(letter_id=d.pk, subject='late').exists())
