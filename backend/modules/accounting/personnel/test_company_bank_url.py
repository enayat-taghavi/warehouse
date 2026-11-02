"""آدرس سایت بانک حساب شرکت (گام ب طرح اصلاح فاکتور): فقط https پذیرفته می‌شود."""
from django.test import SimpleTestCase
from rest_framework import serializers

from personnel.serializers_domains.organization import CompanyBankAccountSerializer


class InternetBankUrlValidationTests(SimpleTestCase):
    def setUp(self):
        self.validate = CompanyBankAccountSerializer().validate_internet_bank_url

    def test_accepts_https(self):
        self.assertEqual(self.validate(' https://ib.bmi.ir/login '), 'https://ib.bmi.ir/login')

    def test_blank_and_none_become_empty(self):
        self.assertEqual(self.validate(''), '')
        self.assertEqual(self.validate(None), '')

    def test_rejects_unsafe_or_non_https(self):
        for bad in ('http://ib.bmi.ir', 'javascript:alert(1)', 'https://', 'ib.bmi.ir',
                    'https://ib bmi.ir', 'https://[bad', 'data:text/html,x'):
            with self.subTest(url=bad), self.assertRaises(serializers.ValidationError):
                self.validate(bad)

    def test_field_exposed_with_max_length(self):
        field = CompanyBankAccountSerializer().fields['internet_bank_url']
        self.assertEqual(field.max_length, 300)
        self.assertFalse(field.required)
