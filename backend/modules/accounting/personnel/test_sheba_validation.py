from django.test import TestCase
from personnel.sheba_utils import (
    IRANIAN_BANKS_MAP,
    validate_sheba,
    clean_sheba,
    get_bank_from_sheba,
    get_bank_by_name,
    extract_sheba_digits,
    extract_account_number_from_sheba,
    generate_sheba_from_account,
    validate_account_number
)
from personnel.serializers import VehicleDriverProfileSerializer, PersonnelProfileSerializer

class ShebaValidationTests(TestCase):
    def test_validate_account_number(self):
        is_val, err, _ = validate_account_number("0")
        self.assertFalse(is_val)
        self.assertIn("صفر", err)

        is_val2, err2, _ = validate_account_number("12")
        self.assertFalse(is_val2)
        self.assertIn("ناقص", err2)

        is_val3, err3, clean = validate_account_number("101111111001")
        self.assertTrue(is_val3)
        self.assertIsNone(err3)
        self.assertEqual(clean, "101111111001")

        # generate_sheba_from_account must reject 0
        self.assertEqual(generate_sheba_from_account("017", "0"), "")
        self.assertEqual(generate_sheba_from_account("017", "0000000"), "")

    def test_reject_zero_account_in_validate_sheba(self):
        zero_sheba = "IR260700000000000000000000"
        is_val, err, _ = validate_sheba(zero_sheba)
        self.assertFalse(is_val)
        self.assertIn("صفر", err)

    def test_generate_sheba_from_account_and_bank(self):
        sheba = generate_sheba_from_account("017", "101111111001")
        self.assertTrue(sheba.startswith("IR"))
        is_valid, err, bank = validate_sheba(sheba)
        self.assertTrue(is_valid)
        self.assertEqual(bank['name'], 'بانک ملی ایران')

        # Test with Bank Name string
        tejarat_sheba = generate_sheba_from_account("بانک تجارت", "801458494059")
        self.assertTrue(tejarat_sheba.startswith("IR"))
        is_val, _, b = validate_sheba(tejarat_sheba)
        self.assertTrue(is_val)
        self.assertEqual(b['name'], 'بانک تجارت')

    def test_banks_map_completeness(self):
        self.assertGreaterEqual(len(IRANIAN_BANKS_MAP), 30)
        self.assertIn('017', IRANIAN_BANKS_MAP)
        self.assertEqual(IRANIAN_BANKS_MAP['017']['name'], 'بانک ملی ایران')
        self.assertIn('018', IRANIAN_BANKS_MAP)
        self.assertEqual(IRANIAN_BANKS_MAP['018']['name'], 'بانک تجارت')

    def test_extract_account_number_from_sheba(self):
        sheba = "IR120170000000101111111001"
        acc = extract_account_number_from_sheba(sheba)
        self.assertEqual(acc, "101111111001")

    def test_extract_digits_from_messy_pasted_strings(self):
        messy_input = "I090ث180ل0یی000080145$849405ق957"
        digits = extract_sheba_digits(messy_input)
        self.assertEqual(digits, "090180000008014584940595")
        self.assertEqual(len(digits), 24)

    def test_clean_sheba_digits_and_ir(self):
        persian_input = "IR۱۲ ۰۱۷۰ ۰۰۰۰ ۰۰۱۰ ۱۱۱۱ ۱۱۱۰ ۰۱"
        cleaned = clean_sheba(persian_input)
        self.assertEqual(cleaned, "IR120170000000101111111001")

        raw_24 = "120170000000101111111001"
        cleaned_24 = clean_sheba(raw_24)
        self.assertEqual(cleaned_24, "IR120170000000101111111001")

    def test_get_bank_from_sheba(self):
        sheba = "120170000000101111111001"
        bank = get_bank_from_sheba(sheba)
        self.assertIsNotNone(bank)
        self.assertEqual(bank['name'], 'بانک ملی ایران')

    def test_math_valid_sheba(self):
        payload = "0180000000801458494059182700"
        rem = int(payload) % 97
        check_digits = str(98 - rem).zfill(2)
        valid_sheba = f"{check_digits}0180000000801458494059"

        is_valid, err, bank = validate_sheba(valid_sheba)
        self.assertTrue(is_valid)
        self.assertIsNone(err)
        self.assertIsNotNone(bank)
        self.assertEqual(bank['name'], 'بانک تجارت')

    def test_invalid_sheba_raises_in_serializer(self):
        serializer = VehicleDriverProfileSerializer(data={
            'driver_name': 'راننده تست',
            'plate_number': '11ع123-45',
            'sheba_number': '000170000000101111111001' # Invalid check digits
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('sheba_number', serializer.errors)
