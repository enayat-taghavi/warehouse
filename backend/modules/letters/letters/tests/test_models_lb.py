"""
تست‌های ل-ب ماژول نامه‌ها: مانیفست، مجوزها، مدل‌ها، سری‌های شماره، کلیدهای تنظیم و قلاب‌های رجیستری.
اجرا فقط با پروفایلی که letters را دارد (opt-in)، مثل WH_MODULES=warehouse,accounting,letters.
"""
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from companies.models import Company, Project
from contacts.models import ExternalParty
from numbering.registry import series_specs
from numbering.services import allocate
from platform_core.module_catalog import (
    MODULE_CATALOG, MODULE_PERMISSION_SPECS, MODULE_SUPERUSER_FENCE, default_module_codes,
)
from platform_core.registry import (
    company_of, contributions, installed_modules, is_entity_confidential, is_entity_locked, resolve_entity,
)
from settings_core.company_settings import company_setting_specs, get_company_setting

from letters.models import (
    LETTER_ENTITY, CircularAudience, Letter, LetterEditor, LetterRecipient, LetterSigner, Secretariat,
)
from letters.numbering import series_key_for

LETTER_CODES = (
    'view_letters_hub', 'perm_letters_compose', 'perm_letters_circular', 'perm_letters_secretariat',
    'perm_letters_settings',
)


class ManifestTests(TestCase):
    def test_module_is_opt_in_and_installed_here(self):
        spec = MODULE_CATALOG['letters']
        self.assertTrue(spec.opt_in)
        self.assertNotIn('letters', default_module_codes())
        self.assertIn('letters', installed_modules())
        self.assertEqual(spec.django_apps, ('letters.apps.LettersConfig',))
        self.assertIn(('letters', 'نامه‌ها'), spec.audit_modules)

    def test_superuser_write_fence(self):
        self.assertEqual(MODULE_SUPERUSER_FENCE['letters'][0], ('/api/letters/',))

    def test_permission_specs_section_scoped(self):
        specs = {s['code']: s for s in MODULE_PERMISSION_SPECS['letters']}
        self.assertEqual(set(specs), set(LETTER_CODES))
        self.assertTrue(all(s['scope'] == 'section' and s['category'] == 'letters' for s in specs.values()))
        self.assertEqual(specs['perm_letters_secretariat']['defaults'], ())
        self.assertEqual(specs['perm_letters_circular']['defaults'], ('manager',))
        self.assertIn('employee', specs['perm_letters_compose']['defaults'])

    def test_permissions_created_by_post_migrate(self):
        found = set(Permission.objects.filter(content_type__app_label='accounts', codename__in=LETTER_CODES)
                    .values_list('codename', flat=True))
        self.assertEqual(found, set(LETTER_CODES))

    def test_not_sensitive(self):
        from accounts.models import SENSITIVE_PERMISSION_CODENAMES
        self.assertFalse(set(SENSITIVE_PERMISSION_CODENAMES) & set(LETTER_CODES))


class SeriesAndSettingsTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='LT-S', name='S')
        self.user = get_user_model().objects.create_user(username='lt_s', password='x')

    def test_five_series_declared(self):
        specs = series_specs()
        expected = {'internal': 'د', 'outgoing': 'ص', 'incoming': 'و', 'minutes': 'صج', 'circular': 'ب'}
        for kind, prefix in expected.items():
            spec = specs[f'letters.{kind}']
            self.assertEqual(spec.default_template, f'{{period}}/{prefix}/{{seq}}')
            self.assertEqual(spec.manage_perm, 'perm_letters_settings')
            self.assertIsNone(spec.period_key)  # سال شمسی

    def test_series_key_for(self):
        self.assertEqual(series_key_for('outgoing'), 'letters.outgoing')
        with self.assertRaises(ValueError):
            series_key_for('unknown')

    def test_allocate_outgoing_number(self):
        letter = Letter.objects.create(company=self.company, kind='outgoing', author=self.user)
        issued = allocate(self.company.pk, 'letters.outgoing', LETTER_ENTITY, letter.pk, self.user)
        self.assertRegex(issued.display, r'^\d{4}/ص/1$')
        # تکرار امن: همان شماره
        again = allocate(self.company.pk, 'letters.outgoing', LETTER_ENTITY, letter.pk, self.user)
        self.assertEqual(again.pk, issued.pk)

    def test_company_settings_declared(self):
        specs = company_setting_specs()
        for key, default in (('letterhead_a4', 0), ('letterhead_a5', 0), ('secretariat_stamp', 0),
                             ('default_due_days', 7)):
            spec = specs[('letters', key)]
            self.assertEqual(spec.type, 'int')
            self.assertEqual(spec.perm, 'perm_letters_settings')
            self.assertEqual(get_company_setting(self.company.pk, 'letters', key), default)


class ModelAndHookTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='LT-A', name='A')
        self.other = Company.objects.create(code='LT-B', name='B')
        self.user = get_user_model().objects.create_user(username='lt_a', password='x')
        self.letter = Letter.objects.create(company=self.company, kind='internal', author=self.user,
                                            subject='آزمون')

    def test_defaults(self):
        self.assertEqual(self.letter.status, 'draft')
        self.assertEqual(self.letter.confidentiality, 'normal')
        self.assertEqual(self.letter.sign_mode, 'electronic')
        self.assertEqual(self.letter.source, 'internal')
        self.assertEqual(self.letter.revision, 1)
        self.assertEqual(self.letter.body, [])
        self.assertEqual(self.letter.number_display, '')

    def test_project_and_party_links(self):
        project = Project.objects.create(company=self.company, code='LP', name='پروژه')
        party = ExternalParty.objects.create(company=self.company, name='طرف')
        letter = Letter.objects.create(company=self.company, kind='incoming', author=self.user, project=project,
                                       sender_party=party, status='received')
        self.assertEqual(Letter.objects.filter(company=self.company, project=project).get(), letter)

    def test_entity_hooks(self):
        self.assertEqual(company_of(LETTER_ENTITY, self.letter.pk), self.company.pk)
        self.assertEqual(company_of(LETTER_ENTITY, str(self.letter.pk)), self.company.pk)
        self.assertEqual(resolve_entity(LETTER_ENTITY, self.letter.pk), self.letter)
        self.assertIsNone(company_of(LETTER_ENTITY, 999999))
        self.assertIsNone(resolve_entity(LETTER_ENTITY, 'x'))

    def test_is_locked(self):
        self.assertFalse(is_entity_locked(LETTER_ENTITY, self.letter.pk))
        for status in ('signing', 'received'):
            Letter.objects.filter(pk=self.letter.pk).update(status=status)
            self.assertFalse(is_entity_locked(LETTER_ENTITY, self.letter.pk))
        for status in ('registered', 'sent', 'archived', 'void'):
            Letter.objects.filter(pk=self.letter.pk).update(status=status)
            self.assertTrue(is_entity_locked(LETTER_ENTITY, self.letter.pk))
        # نامهٔ ناموجود یا شناسهٔ بد: قفل (بسته در برابر خطا)
        self.assertTrue(is_entity_locked(LETTER_ENTITY, 999999))
        self.assertTrue(is_entity_locked(LETTER_ENTITY, 'abc'))

    def test_is_confidential(self):
        self.assertFalse(is_entity_confidential(LETTER_ENTITY, self.letter.pk))
        for level in ('confidential', 'secret'):
            Letter.objects.filter(pk=self.letter.pk).update(confidentiality=level)
            self.assertTrue(is_entity_confidential(LETTER_ENTITY, self.letter.pk))
        self.assertTrue(is_entity_confidential(LETTER_ENTITY, 999999))

    def test_audit_entity_kind(self):
        self.assertIn(('Letter', LETTER_ENTITY), list(contributions('audit_entity_kinds')))

    def test_client_temp_id_unique_per_author(self):
        tid = uuid.uuid4()
        Letter.objects.create(company=self.company, kind='internal', author=self.user, client_temp_id=tid)
        other_user = get_user_model().objects.create_user(username='lt_a2', password='x')
        Letter.objects.create(company=self.company, kind='internal', author=other_user, client_temp_id=tid)
        Letter.objects.create(company=self.company, kind='internal', author=self.user)  # بی‌شناسه آزاد
        with self.assertRaises(IntegrityError), transaction.atomic():
            Letter.objects.create(company=self.company, kind='internal', author=self.user, client_temp_id=tid)

    def test_recipient_target_constraint(self):
        LetterRecipient.objects.create(letter=self.letter, target_type='user', user=self.user)
        LetterRecipient.objects.create(letter=self.letter, target_type='section', section_id=5, role='cc')
        LetterRecipient.objects.create(letter=self.letter, target_type='text', name_text='اداره')
        for bad in ({'target_type': 'user'}, {'target_type': 'text'}, {'target_type': 'party'}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                LetterRecipient.objects.create(letter=self.letter, **bad)

    def test_signer_and_editor_unique(self):
        LetterSigner.objects.create(letter=self.letter, user=self.user, order=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LetterSigner.objects.create(letter=self.letter, user=self.user, order=2)
        LetterEditor.objects.create(letter=self.letter, user=self.user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LetterEditor.objects.create(letter=self.letter, user=self.user)

    def test_circular_audience_constraint(self):
        CircularAudience.objects.create(letter=self.letter, scope='company')
        CircularAudience.objects.create(letter=self.letter, scope='section', section_id=3)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CircularAudience.objects.create(letter=self.letter, scope='section')

    def test_protect_core_rows(self):
        LetterSigner.objects.create(letter=self.letter, user=self.user)
        with self.assertRaises(ProtectedError):
            self.company.delete()
        with self.assertRaises(ProtectedError):
            self.letter.delete()  # داده‌های فرزند هرگز آبشاری پاک نمی‌شوند

    def test_secretariat_one_per_company(self):
        sec, created = Secretariat.objects.get_or_create(company=self.company)
        self.assertTrue(created)
        self.assertEqual(Secretariat.objects.get_or_create(company=self.company)[0], sec)
        self.assertEqual(sec.title, 'دبیرخانه')
