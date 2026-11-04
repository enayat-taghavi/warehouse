"""
تست‌های API ل-ج: 404 برای شرکت دیگر، ساخت تکراری صف، برخورد نسخه بی‌از‌دست‌رفتن متن، قفل ویرایش،
مدیر کل فقط خواندن، فیلدهای قفل، هم‌شرکتی بودن ارجاع‌ها، پروژه‌ها، طرف بیرونی، متن بلوکی و N+1 فهرست.
"""
import uuid
from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from contacts.models import ExternalParty

from letters.models import LETTER_ENTITY, Letter, LetterDraftCopy, LetterRecipient
from letters.serializers import validate_body
from letters.tests.test_access_lc import LettersBase

BODY = [{'type': 'paragraph', 'align': 'right', 'runs': [{'text': 'salam', 'bold': True}]}]


class ApiBase(LettersBase):
    def api(self, user):
        client = APIClient()
        client.force_authenticate(self.fresh(user))
        return client

    def create(self, user=None, **data):
        data.setdefault('kind', 'internal')
        data.setdefault('company', self.co_a.pk)
        data.setdefault('subject', 'test')
        return self.api(user or self.author).post('/api/letters/', data, format='json')


class OtherCompanyTests(ApiBase):
    def test_outsider_gets_404_everywhere(self):
        d = self.letter()
        client = self.api(self.outsider)
        self.assertEqual(client.get(f'/api/letters/{d.pk}/').status_code, 404)
        self.assertEqual(client.patch(f'/api/letters/{d.pk}/', {'subject': 'x', 'revision': 1},
                                      format='json').status_code, 404)
        for action in ('lock', 'unlock', 'discard'):
            self.assertEqual(client.post(f'/api/letters/{d.pk}/{action}/').status_code, 404, action)
        self.assertEqual(client.get('/api/letters/').json()['count'], 0)
        self.assertFalse(LetterDraftCopy.objects.exists())

    def test_create_in_other_company_refused(self):
        self.assertEqual(self.create(company=self.co_b.pk).status_code, 403)

    def test_list_only_visible(self):
        mine = self.letter()
        self.letter(author=self.coauthor)
        res = self.api(self.author).get('/api/letters/')
        self.assertEqual([r['id'] for r in res.json()['results']], [mine.pk])


class CreateTests(ApiBase):
    def test_same_client_temp_id_creates_one_letter(self):
        tid = str(uuid.uuid4())
        first = self.create(client_temp_id=tid, body=BODY)
        self.assertEqual(first.status_code, 201)
        second = self.create(client_temp_id=tid, subject='other')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()['id'], first.json()['id'])
        self.assertEqual(Letter.objects.filter(client_temp_id=tid).count(), 1)
        # ل-ز: پخش دوبارهٔ ساخت مثل PATCH اعمال می‌شود (متن تازه‌تر صف گم نمی‌شود)
        self.assertEqual(Letter.objects.get(client_temp_id=tid).subject, 'other')

    def test_kind_permissions(self):
        self.assertEqual(self.create(kind='incoming').status_code, 403)
        self.assertEqual(self.create(kind='circular').status_code, 403)
        res = self.create(user=self.secretary, kind='incoming')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['status'], 'received')

    def test_cross_company_refs_are_400(self):
        party_b = ExternalParty.objects.create(company=self.co_b, name='party b')
        other_reg = self.registered(company=self.co_b, author=self.outsider)
        own_draft = self.letter()
        cases = [
            {'project': self.proj_b.pk},
            {'sender_party': party_b.pk},
            {'recipients': [{'target_type': 'party', 'party': party_b.pk}]},
            {'recipients': [{'target_type': 'user', 'user': self.outsider.pk}]},
            {'recipients': [{'target_type': 'section', 'section_id': self.sec_b.pk}]},
            {'signers': [{'user': self.outsider.pk}]},
            {'editors': [self.outsider.pk]},
            {'follow_up_of': other_reg.pk},
            {'reply_to': own_draft.pk},  # پیش‌نویس ثبت‌نشده
            {'links': [{'entity_kind': 'letters_letter', 'entity_id': str(other_reg.pk)}]},
        ]
        for extra in cases:
            self.assertEqual(self.create(**extra).status_code, 400, extra)
        self.assertEqual(Letter.objects.filter(subject='test').count(), 0)

    def test_same_company_refs_accepted(self):
        party = ExternalParty.objects.create(company=self.co_a, name='party a')
        reg = self.registered()
        res = self.create(project=self.proj_a.pk, sender_party=party.pk, follow_up_of=reg.pk, body=BODY,
                          recipients=[{'target_type': 'user', 'user': self.reader.pk},
                                      {'target_type': 'section', 'section_id': self.sec_a.pk, 'role': 'cc'},
                                      {'target_type': 'text', 'name_text': 'free'}],
                          signers=[{'user': self.signer.pk}], editors=[self.coauthor.pk],
                          links=[{'entity_kind': 'letters_letter', 'entity_id': str(reg.pk)}])
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(len(data['recipients']), 3)
        self.assertEqual(data['links'][0]['title'], '1405/د/1')
        self.assertEqual(data['body'], BODY)


class BodyValidationTests(ApiBase):
    def test_blocks(self):
        ok = validate_body([{'type': 'list', 'style': 'ordered', 'items': ['a', [{'text': 'b'}]]},
                            {'type': 'table', 'rows': [['a', 'b']], 'extra': 1}])
        self.assertEqual(ok[1], {'type': 'table', 'header': False, 'rows': [['a', 'b']]})
        for bad in ([{'type': 'html', 'html': '<b>'}], [{'type': 'paragraph', 'runs': [{'text': 'x', 'style': 'c'}]}],
                    [{'type': 'paragraph'}] * 201, [{'type': 'paragraph', 'runs': 'x' * 100_001}], 'text'):
            self.assertEqual(self.create(body=bad).status_code, 400)


class PatchTests(ApiBase):
    def patch(self, user, letter, **data):
        return self.api(user).patch(f'/api/letters/{letter.pk}/', data, format='json')

    def test_edit_bumps_revision(self):
        d = self.letter()
        res = self.patch(self.author, d, subject='new', revision=1)
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['conflict'])
        self.assertEqual(res.json()['revision'], 2)

    def test_stale_revision_keeps_incoming_text(self):
        d = self.letter(revision=3, subject='server')
        res = self.patch(self.author, d, subject='offline', body=BODY, revision=2)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['conflict'])
        self.assertEqual(res.json()['conflict_reason'], 'stale_revision')
        d.refresh_from_db()
        self.assertEqual((d.subject, d.revision), ('server', 3))
        copy = LetterDraftCopy.objects.get(letter=d)
        self.assertEqual((copy.subject, copy.body, copy.created_by_id), ('offline', BODY, self.author.pk))

    def test_refused_edit_still_keeps_text(self):
        d = self.letter()
        res = self.patch(self.author, d, subject='keep me', project=self.proj_b.pk, revision=1)
        self.assertEqual(res.status_code, 400)
        self.assertIn('draft_copy_id', res.json())
        self.assertEqual(LetterDraftCopy.objects.get(letter=d).subject, 'keep me')
        d.refresh_from_db()
        self.assertEqual((d.subject, d.project_id), ('موضوع آزمایشی', None))

    def test_locked_statuses_refuse_locked_fields(self):
        for st in Letter.LOCKED_STATUSES:
            r = self.registered(status=st, subject='fixed', number_display=f'n-{st}')
            res = self.patch(self.author, r, subject='changed', revision=1)
            self.assertEqual(res.status_code, 200, st)
            self.assertTrue(res.json()['conflict'])
            res = self.patch(self.author, r, recipients=[{'target_type': 'text', 'name_text': 'x'}], revision=1)
            self.assertEqual(res.status_code, 400, st)
            r.refresh_from_db()
            self.assertEqual(r.subject, 'fixed')
            self.assertFalse(LetterRecipient.objects.filter(letter=r).exists())
        reg = self.registered(number_display='n-proj')
        res = self.patch(self.secretary, reg, project=self.proj_a.pk)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['project'], self.proj_a.pk)

    def test_edit_lock(self):
        d = self.letter()
        from letters.models import LetterEditor
        LetterEditor.objects.create(letter=d, user=self.coauthor)
        self.assertEqual(self.api(self.coauthor).post(f'/api/letters/{d.pk}/lock/').status_code, 200)
        self.assertEqual(self.api(self.author).post(f'/api/letters/{d.pk}/lock/').status_code, 409)
        self.assertEqual(self.api(self.author).post(f'/api/letters/{d.pk}/unlock/').status_code, 409)
        res = self.patch(self.author, d, subject='blocked', revision=1)
        self.assertTrue(res.json()['conflict'])
        self.assertEqual(res.json()['conflict_reason'], 'edit_locked')
        res = self.patch(self.coauthor, d, subject='holder', revision=1)
        self.assertFalse(res.json()['conflict'])
        # قفل منقضی آزاد است
        Letter.objects.filter(pk=d.pk).update(edit_locked_until=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.api(self.author).post(f'/api/letters/{d.pk}/lock/').status_code, 200)
        self.assertEqual(self.api(self.author).post(f'/api/letters/{d.pk}/unlock/').status_code, 200)
        d.refresh_from_db()
        self.assertIsNone(d.edit_locked_by_id)
        # بیننده‌ای که نویسنده نیست قفل نمی‌گیرد
        reg = self.registered()
        LetterRecipient.objects.create(letter=reg, target_type='user', user=self.reader)
        self.assertEqual(self.api(self.reader).post(f'/api/letters/{reg.pk}/lock/').status_code, 403)

    def test_discard_is_void_not_delete(self):
        d = self.letter()
        self.assertEqual(self.api(self.coauthor).post(f'/api/letters/{d.pk}/discard/').status_code, 404)
        res = self.api(self.author).post(f'/api/letters/{d.pk}/discard/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Letter.objects.get(pk=d.pk).status, Letter.STATUS_VOID)
        reg = self.registered()
        self.assertEqual(self.api(self.author).post(f'/api/letters/{reg.pk}/discard/').status_code, 400)


class SuperuserTests(ApiBase):
    def test_read_only(self):
        d = self.letter(confidentiality=Letter.CONF_SECRET)
        client = self.api(self.admin)
        self.assertEqual(client.get(f'/api/letters/{d.pk}/').status_code, 200)
        self.assertEqual(client.get('/api/letters/').status_code, 200)
        self.assertEqual(client.patch(f'/api/letters/{d.pk}/', {'subject': 'x', 'revision': 1},
                                      format='json').status_code, 403)
        self.assertEqual(client.post('/api/letters/', {'kind': 'internal', 'company': self.co_a.pk},
                                     format='json').status_code, 403)
        self.assertEqual(client.post(f'/api/letters/{d.pk}/lock/').status_code, 403)
        self.assertEqual(client.post('/api/letters/parties/', {'company': self.co_a.pk, 'name': 'x'},
                                     format='json').status_code, 403)


class ProjectsAndPartiesTests(ApiBase):
    def test_project_counts_only_visible(self):
        self.letter(project=self.proj_a)
        self.letter(project=self.proj_a, author=self.coauthor)  # برای نویسنده نادیدنی
        self.letter(company=self.co_b, author=self.outsider, project=self.proj_b)
        res = self.api(self.author).get('/api/letters/projects/')
        rows = {r['id']: r for r in res.json()}
        self.assertEqual(rows[self.proj_a.pk]['letter_count'], 1)
        self.assertNotIn(self.proj_b.pk, rows)
        res = self.api(self.author).get('/api/letters/', {'project': self.proj_a.pk})
        self.assertEqual(res.json()['count'], 1)

    def test_parties(self):
        client = self.api(self.author)
        res = client.post('/api/letters/parties/', {'company': self.co_a.pk, 'name': 'p1', 'national_id': '0012345678'},
                          format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['national_id'], '••••')  # بی‌مجوز دبیرخانه پوشیده (ق۱۶)
        again = client.post('/api/letters/parties/', {'company': self.co_a.pk, 'name': 'p1b',
                                                      'national_id': '0012345678'}, format='json')
        self.assertEqual((again.status_code, again.json()['id']), (200, res.json()['id']))
        sec = self.api(self.secretary).get('/api/letters/parties/', {'company': self.co_a.pk, 'q': 'p1'})
        self.assertEqual(sec.json()[0]['national_id'], '0012345678')
        out = self.api(self.outsider)
        self.assertEqual(out.get('/api/letters/parties/', {'company': self.co_a.pk}).json(), [])
        self.assertEqual(out.post('/api/letters/parties/', {'company': self.co_a.pk, 'name': 'z'},
                                  format='json').status_code, 403)
        self.assertEqual(client.post('/api/letters/parties/', {'company': self.co_a.pk, 'name': 'bad',
                                                               'national_id': '12'}, format='json').status_code, 400)

    def test_link_kinds_lists_letters(self):
        kinds = [k['kind'] for k in self.api(self.author).get('/api/letters/link-kinds/').json()]
        self.assertIn('letters_letter', kinds)


class NoNPlusOneTests(ApiBase):
    def _count(self, n):
        Letter.objects.filter(author=self.author).delete()
        for i in range(n):
            self.letter(project=self.proj_a, subject=f's{i}')
        client = self.api(self.author)
        with CaptureQueriesContext(connection) as ctx:
            res = client.get('/api/letters/')
        self.assertEqual(res.json()['count'], n)
        return len(ctx.captured_queries)

    def test_list_query_count_is_constant(self):
        self.assertEqual(self._count(1), self._count(5))


class ReviewFixesTests(ApiBase):
    """یافته‌های بازبین دامنه در ادغام ل-ج."""

    def test_superuser_cannot_attach_to_letter(self):
        from platform_core.registry import can_attach
        d = self.letter()
        self.assertFalse(can_attach(self.fresh(self.admin), LETTER_ENTITY, d.pk))
        self.assertTrue(can_attach(self.fresh(self.author), LETTER_ENTITY, d.pk))

    def test_reader_patch_leaves_no_copy(self):
        d = self.registered()
        LetterRecipient.objects.create(letter=d, target_type=LetterRecipient.TARGET_USER, user=self.reader)
        res = self.api(self.reader).patch(f'/api/letters/{d.pk}/', {'subject': 'spam', 'body': BODY}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertFalse(LetterDraftCopy.objects.filter(letter=d).exists())
        # نویسنده: متن رسیده همچنان نسخهٔ ناهمگام می‌شود (ن۱۱)
        res = self.api(self.author).patch(f'/api/letters/{d.pk}/', {'subject': 'late', 'body': BODY}, format='json')
        self.assertEqual((res.status_code, res.json()['conflict_reason']), (200, 'not_draft'))
        self.assertEqual(LetterDraftCopy.objects.get(letter=d).subject, 'late')

    def test_masked_national_id_not_searchable(self):
        ExternalParty.objects.create(company=self.co_a, kind=ExternalParty.KIND_PERSON, name='person',
                                     national_id='0012345678', is_active=True)
        params = {'company': self.co_a.pk, 'q': '00123'}
        self.assertEqual(self.api(self.author).get('/api/letters/parties/', params).json(), [])
        self.assertEqual(len(self.api(self.secretary).get('/api/letters/parties/', params).json()), 1)


class StageEndReviewTests(ApiBase):
    """یافته‌های بازبین‌های پایانی ل-ط."""

    def revoke(self, user, company, codename):
        from django.contrib.auth.models import Permission
        from accounts.models import UserPermissionOverride
        perm = Permission.objects.get(content_type__app_label='accounts', codename=codename)
        UserPermissionOverride.objects.create(user=user, permission=perm, company=company, mode='remove')

    def test_secretariat_cannot_attach_to_hidden_confidential_incoming(self):
        from platform_core.registry import can_attach
        other_sec = self.member('l_secretary2', self.co_a)
        self.grant(other_sec, self.co_a, 'perm_letters_secretariat')
        d = self.letter(kind=Letter.KIND_INCOMING, author=self.secretary, status=Letter.STATUS_RECEIVED,
                        confidentiality=Letter.CONF_CONFIDENTIAL)
        self.assertTrue(can_attach(self.fresh(self.secretary), LETTER_ENTITY, d.pk))
        self.assertFalse(can_attach(self.fresh(other_sec), LETTER_ENTITY, d.pk))
        normal = self.letter(kind=Letter.KIND_INCOMING, author=self.secretary, status=Letter.STATUS_RECEIVED)
        self.assertTrue(can_attach(self.fresh(other_sec), LETTER_ENTITY, normal.pk))

    def test_parties_need_letters_access_and_contact_needs_compose(self):
        ExternalParty.objects.create(company=self.co_a, kind=ExternalParty.KIND_LEGAL, name='acme',
                                     phone='0211234', email='a@example.com', address='addr', is_active=True)
        params = {'company': self.co_a.pk}
        row = self.api(self.author).get('/api/letters/parties/', params).json()[0]
        self.assertEqual((row['phone'], row['email'], row['address']), ('0211234', 'a@example.com', 'addr'))
        reader_only = self.member('l_reader_only', self.co_a)
        self.revoke(reader_only, self.co_a, 'perm_letters_compose')
        row = self.api(reader_only).get('/api/letters/parties/', params).json()[0]
        self.assertEqual((row['name'], row['phone'], row['email'], row['address']), ('acme', '', '', ''))
        no_letters = self.member('l_no_letters', self.co_a)
        for code in ('view_letters_hub', 'perm_letters_compose'):
            self.revoke(no_letters, self.co_a, code)
        self.assertEqual(self.api(no_letters).get('/api/letters/parties/', params).json(), [])

    def test_replace_keeps_server_text_as_copy(self):
        d = self.letter(revision=3, subject='server', body=BODY)
        res = self.api(self.author).patch(f'/api/letters/{d.pk}/', {'subject': 'mine', 'revision': 3,
                                                                    'keep_server_copy': True}, format='json')
        self.assertEqual((res.status_code, res.json()['revision']), (200, 4))
        copy = LetterDraftCopy.objects.get(letter=d)
        self.assertEqual((copy.subject, copy.body, copy.reason), ('server', BODY, 'replaced'))
        # بی پرچم، ویرایش عادی نسخه نمی‌سازد
        self.api(self.author).patch(f'/api/letters/{d.pk}/', {'subject': 'again', 'revision': 4}, format='json')
        self.assertEqual(LetterDraftCopy.objects.filter(letter=d).count(), 1)

    def test_large_valid_body_is_kept_whole_in_conflict_copy(self):
        runs = [{'text': 'xx', 'bold': True} for _ in range(200)]
        body = [{'type': 'paragraph', 'align': 'right', 'runs': runs} for _ in range(100)]
        validate_body(body)
        d = self.letter(revision=3, subject='server')
        res = self.api(self.author).patch(f'/api/letters/{d.pk}/', {'subject': 'big', 'body': body, 'revision': 2},
                                          format='json')
        self.assertTrue(res.json()['conflict'])
        self.assertEqual(len(LetterDraftCopy.objects.get(letter=d).body), 100)
