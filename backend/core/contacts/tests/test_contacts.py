from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from companies.models import Company
from companies.testing import grant_membership
from contacts.models import ExternalParty
from contacts.services import (
    create_party, find_party, infer_kind, national_id_error, normalize_party_data, parties_for_user, update_party,
)

User = get_user_model()


class ExternalPartyServiceTests(TestCase):
    """ص۱ طرح ۳.۱: یکسان‌سازی، یکتایی شناسه در هر شرکت و دامنهٔ شرکت."""

    def setUp(self):
        self.company = Company.objects.create(code='CT_A', name='شرکت الف')
        self.other = Company.objects.create(code='CT_B', name='شرکت ب')

    def test_normalize_digits_and_kind(self):
        data = normalize_party_data({'name': '  طرف  ', 'national_id': '۱۲۳۴۵۶۷۸۹۰۱', 'phone': '۰۲۱۸۸'})
        self.assertEqual(data['name'], 'طرف')
        self.assertEqual(data['national_id'], '12345678901')
        self.assertEqual(data['phone'], '02188')
        self.assertEqual(data['kind'], ExternalParty.KIND_LEGAL)
        self.assertIsNone(normalize_party_data({'national_id': '  '})['national_id'])
        self.assertEqual(infer_kind('1234567890'), ExternalParty.KIND_PERSON)
        self.assertEqual(infer_kind(None, ExternalParty.KIND_LEGAL), ExternalParty.KIND_LEGAL)

    def test_national_id_error(self):
        self.assertIsNone(national_id_error('person', '1234567890'))
        self.assertIsNone(national_id_error('legal', None))
        self.assertIsNotNone(national_id_error('person', '12345678901'))
        self.assertIsNotNone(national_id_error('legal', '12a45678901'))

    def test_unique_national_id_per_company_only(self):
        create_party(self.company, {'name': 'یک', 'national_id': '1234567890'})
        create_party(self.other, {'name': 'یک', 'national_id': '1234567890'})
        with transaction.atomic(), self.assertRaises(IntegrityError):
            create_party(self.company, {'name': 'دو', 'national_id': '1234567890'})
        # شناسهٔ خالی و نام تکراری آزاد است
        create_party(self.company, {'name': 'بی‌شناسه'})
        create_party(self.company, {'name': 'بی‌شناسه'})
        self.assertEqual(find_party(self.company.id, '۱۲۳۴۵۶۷۸۹۰').name, 'یک')
        self.assertIsNone(find_party(self.company.id, ''))

    def test_update_keeps_company_and_kind_when_id_cleared(self):
        party = create_party(self.company, {'name': 'حقوقی', 'national_id': '12345678901'})
        update_party(party, {'national_id': '', 'company': self.other.id, 'mobile': '۰۹۱۲'})
        party.refresh_from_db()
        self.assertEqual(party.company_id, self.company.id)
        self.assertIsNone(party.national_id)
        self.assertEqual(party.kind, ExternalParty.KIND_LEGAL)
        self.assertEqual(party.mobile, '0912')

    def test_parties_for_user_scoped_to_allowed_companies(self):
        mine = create_party(self.company, {'name': 'خودی'})
        create_party(self.other, {'name': 'بیگانه'})
        user = User.objects.create_user(username='ct_member', password='x')
        grant_membership(user, self.company)
        self.assertEqual(list(parties_for_user(user)), [mine])
        admin = User.objects.create_superuser(username='ct_admin', password='x')
        self.assertEqual(parties_for_user(admin).count(), 2)
