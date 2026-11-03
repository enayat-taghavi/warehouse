"""
تست‌های دسترسی ل-ج (ن۹): can_view و can_attach نامه، queryset فهرست، پوشش محرمانه در دفتر دبیرخانه،
و پنهان ماندن پیوست و سابقهٔ نامهٔ منع‌شده. اجرا با WH_MODULES=warehouse,accounting,letters.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import UserPermissionOverride
from accounts.scoped_permissions import clear_scoped_permission_cache
from companies.models import Company, Project, ProjectSection, SectionAssignment
from platform_core.registry import can_attach, can_view, contributions, entity_view_decision

from letters import access
from letters.models import (
    LETTER_ENTITY, CircularAudience, Letter, LetterEditor, LetterRecipient, LetterSigner,
)

User = get_user_model()


class LettersBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.co_a = Company.objects.create(code='LTA', name='شرکت الف')
        cls.co_b = Company.objects.create(code='LTB', name='شرکت ب')
        cls.proj_a = Project.objects.create(company=cls.co_a, code='PA', name='پروژهٔ الف')
        cls.proj_b = Project.objects.create(company=cls.co_b, code='PB', name='پروژهٔ ب')
        cls.sec_a = ProjectSection.objects.create(project=cls.proj_a, code='SA', name='بخش الف')
        cls.sec_a2 = ProjectSection.objects.create(project=cls.proj_a, code='SA2', name='بخش دوم الف')
        cls.sec_b = ProjectSection.objects.create(project=cls.proj_b, code='SB', name='بخش ب')
        cls.author = cls.member('l_author', cls.co_a)
        cls.coauthor = cls.member('l_coauthor', cls.co_a)
        cls.signer = cls.member('l_signer', cls.co_a)
        cls.reader = cls.member('l_reader', cls.co_a)
        cls.stranger = cls.member('l_stranger', cls.co_a)
        cls.section_user = User.objects.create_user(username='l_section', password='x')
        SectionAssignment.objects.create(user=cls.section_user, section=cls.sec_a, role='employee')
        cls.secretary = cls.member('l_secretary', cls.co_a)
        cls.grant(cls.secretary, cls.co_a, 'perm_letters_secretariat')
        cls.outsider = cls.member('l_outsider', cls.co_b)
        cls.admin = User.objects.create_superuser(username='l_admin', password='x', email='a@example.com')

    @classmethod
    def member(cls, username, company, role='employee'):
        user = User.objects.create_user(username=username, password='x')
        SectionAssignment.objects.create(user=user, company=company, role=role)
        return user

    @classmethod
    def grant(cls, user, company, codename):
        perm = Permission.objects.get(content_type__app_label='accounts', codename=codename)
        UserPermissionOverride.objects.create(user=user, permission=perm, company=company, mode='add')

    def fresh(self, user):
        user = User.objects.get(pk=user.pk)
        clear_scoped_permission_cache(user)
        return user

    def letter(self, company=None, author=None, **kw):
        kw.setdefault('kind', Letter.KIND_INTERNAL)
        kw.setdefault('subject', 'موضوع آزمایشی')
        return Letter.objects.create(company=company or self.co_a, author=author or self.author, **kw)

    def registered(self, **kw):
        kw.setdefault('status', Letter.STATUS_REGISTERED)
        kw.setdefault('registered_at', timezone.now())
        kw.setdefault('number_display', '1405/د/1')
        return self.letter(**kw)

    def sees(self, user, letter):
        return can_view(self.fresh(user), LETTER_ENTITY, letter.pk)


class HookRegistrationTests(LettersBase):
    def test_view_and_attach_hooks_registered(self):
        self.assertIn(access.can_view_letter, contributions(f'can_view:{LETTER_ENTITY}'))
        self.assertIn(access.can_attach_letter, contributions(f'can_attach:{LETTER_ENTITY}'))


class CanViewTests(LettersBase):
    def test_participants_see_draft_others_do_not(self):
        d = self.letter()
        LetterEditor.objects.create(letter=d, user=self.coauthor)
        LetterSigner.objects.create(letter=d, user=self.signer)
        LetterRecipient.objects.create(letter=d, target_type='user', user=self.reader)
        for u in (self.author, self.coauthor, self.signer):
            self.assertTrue(self.sees(u, d), u.username)
        # گیرندهٔ پیش‌نویس، دبیرخانه و بیگانه پیش‌نویس را نمی‌بینند
        for u in (self.reader, self.secretary, self.stranger, self.outsider):
            self.assertFalse(self.sees(u, d), u.username)

    def test_recipients_and_section_see_registered(self):
        r = self.registered()
        LetterRecipient.objects.create(letter=r, target_type='user', user=self.reader, role='cc')
        LetterRecipient.objects.create(letter=r, target_type='section', section_id=self.sec_a.pk)
        self.assertTrue(self.sees(self.reader, r))
        self.assertTrue(self.sees(self.section_user, r))
        # انتساب سطح شرکت همهٔ بخش‌های شرکت را می‌پوشاند؛ عضو بخش دیگر نامهٔ بخش دوم را نمی‌بیند
        self.assertTrue(self.sees(self.stranger, r))
        other = self.registered(number_display='1405/D/3')
        LetterRecipient.objects.create(letter=other, target_type='section', section_id=self.sec_a2.pk)
        self.assertFalse(self.sees(self.section_user, other))
        self.assertFalse(self.sees(self.outsider, other))

    def test_outsider_is_explicitly_denied_even_as_recipient(self):
        r = self.registered()
        LetterRecipient.objects.create(letter=r, target_type='user', user=self.outsider)
        self.assertIs(access.can_view_letter(self.fresh(self.outsider), r.pk), False)
        self.assertIs(entity_view_decision(self.fresh(self.outsider), LETTER_ENTITY, r.pk), False)

    def test_secretariat_sees_only_normal(self):
        normal = self.registered()
        secret = self.registered(confidentiality=Letter.CONF_SECRET, number_display='1405/د/2')
        incoming = self.letter(kind=Letter.KIND_INCOMING, status=Letter.STATUS_RECEIVED)
        self.assertTrue(self.sees(self.secretary, normal))
        self.assertTrue(self.sees(self.secretary, incoming))
        self.assertFalse(self.sees(self.secretary, secret))
        self.assertTrue(self.sees(self.admin, secret))  # مدیر کل طبق هسته (س۵)

    def test_circular_audience(self):
        c = self.registered(kind=Letter.KIND_CIRCULAR)
        CircularAudience.objects.create(letter=c, scope='company')
        self.assertTrue(self.sees(self.stranger, c))
        self.assertFalse(self.sees(self.outsider, c))
        s = self.registered(kind=Letter.KIND_CIRCULAR, number_display='1405/ب/2')
        CircularAudience.objects.create(letter=s, scope='section', section_id=self.sec_a.pk)
        self.assertTrue(self.sees(self.section_user, s))
        t = self.registered(kind=Letter.KIND_CIRCULAR, number_display='1405/B/3')
        CircularAudience.objects.create(letter=t, scope='section', section_id=self.sec_a2.pk)
        self.assertFalse(self.sees(self.section_user, t))
        self.assertFalse(self.sees(self.outsider, t))

    def test_bad_ids_are_denied(self):
        for bad in (None, '', 'x', 0, -1, 999999):
            self.assertIs(access.can_view_letter(self.fresh(self.author), bad), False)

    def test_list_queryset_has_no_duplicates(self):
        r = self.registered()
        LetterRecipient.objects.create(letter=r, target_type='user', user=self.author)
        LetterSigner.objects.create(letter=r, user=self.author)
        self.assertEqual(list(access.visible_letters(self.fresh(self.author))), [r])


class CanAttachTests(LettersBase):
    def test_before_and_after_registration(self):
        d = self.letter()
        LetterSigner.objects.create(letter=d, user=self.signer)
        self.assertTrue(can_attach(self.fresh(self.author), LETTER_ENTITY, d.pk))
        self.assertFalse(can_attach(self.fresh(self.signer), LETTER_ENTITY, d.pk))
        self.assertFalse(can_attach(self.fresh(self.outsider), LETTER_ENTITY, d.pk))
        Letter.objects.filter(pk=d.pk).update(status=Letter.STATUS_REGISTERED, registered_at=timezone.now())
        self.assertTrue(can_attach(self.fresh(self.signer), LETTER_ENTITY, d.pk))
        self.assertTrue(can_attach(self.fresh(self.secretary), LETTER_ENTITY, d.pk))
        self.assertFalse(can_attach(self.fresh(self.author), LETTER_ENTITY, d.pk))
        Letter.objects.filter(pk=d.pk).update(status=Letter.STATUS_VOID)
        self.assertFalse(can_attach(self.fresh(self.secretary), LETTER_ENTITY, d.pk))


class HiddenAttachmentsAndAuditTests(LettersBase):
    def test_attachment_list_of_hidden_letter_is_refused(self):
        secret = self.registered(confidentiality=Letter.CONF_CONFIDENTIAL)
        client = APIClient()
        client.force_authenticate(self.fresh(self.secretary))
        res = client.get('/api/attachments/', {'kind': LETTER_ENTITY, 'id': secret.pk})
        self.assertEqual(res.status_code, 403)
        client.force_authenticate(self.fresh(self.author))
        self.assertEqual(client.get('/api/attachments/', {'kind': LETTER_ENTITY, 'id': secret.pk}).status_code, 200)

    def test_audit_decision_is_explicit_deny(self):
        d = self.letter()
        # سابقهٔ ممیزی «بی‌نظر» را نمایش می‌دهد؛ پس منع باید False صریح باشد
        self.assertIs(entity_view_decision(self.fresh(self.stranger), LETTER_ENTITY, d.pk), False)
        self.assertIs(entity_view_decision(self.fresh(self.author), LETTER_ENTITY, d.pk), True)


class SecretariatRegisterTests(LettersBase):
    def test_confidential_row_is_covered(self):
        normal = self.registered(subject='موضوع عادی')
        secret = self.registered(confidentiality=Letter.CONF_SECRET, subject='موضوع سری',
                                 body=[{'type': 'paragraph', 'runs': [{'text': 'متن سری'}]}], number_display='1405/د/9')
        client = APIClient()
        client.force_authenticate(self.fresh(self.secretary))
        res = client.get('/api/letters/register/', {'company': self.co_a.pk})
        self.assertEqual(res.status_code, 200)
        rows = {r['id']: r for r in res.json()}
        self.assertEqual(rows[normal.pk]['subject'], 'موضوع عادی')
        self.assertEqual(rows[secret.pk]['number_display'], '1405/د/9')
        self.assertTrue(rows[secret.pk]['covered'])
        self.assertNotIn('موضوع سری', res.content.decode())
        self.assertNotIn('متن سری', res.content.decode())
        # صفحهٔ خود نامهٔ سری برای دبیرخانه 404 است
        self.assertEqual(client.get(f'/api/letters/{secret.pk}/').status_code, 404)

    def test_register_needs_secretariat_permission(self):
        client = APIClient()
        client.force_authenticate(self.fresh(self.stranger))
        self.assertEqual(client.get('/api/letters/register/', {'company': self.co_a.pk}).status_code, 403)
        client.force_authenticate(self.fresh(self.outsider))
        self.assertEqual(client.get('/api/letters/register/', {'company': self.co_a.pk}).status_code, 403)
