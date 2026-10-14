from datetime import date, datetime
from django.test import SimpleTestCase
from django.core.exceptions import ValidationError
from common.date_utils import (
    parse_date_smart,
    normalize_digits,
    format_to_shamsi_str,
    _parse_date_flexible
)


class DateUtilsComprehensiveTestCase(SimpleTestCase):
    """
    مجموعه آزمون‌های جامع برای موتور سراسری پارسر تاریخ (Dual-Path Date Parser Engine)
    پوشش کامل مسیر سریع، مسیر کمکی و هر ۴ اصل فنی تعیین‌شده
    """

    def test_fast_path_standard_dates(self):
        """آزمون مسیر سریع (Fast-Path) برای فرمت‌های رایج و استاندارد"""
        # تاریخ خورشیدی استاندارد با اسلش
        res = parse_date_smart("1403/05/12")
        self.assertEqual(res, date(2024, 8, 2))

        # تاریخ خورشیدی با خط تیره
        res = parse_date_smart("1403-05-12")
        self.assertEqual(res, date(2024, 8, 2))

        # تاریخ میلادی استاندارد
        res = parse_date_smart("2024-08-02")
        self.assertEqual(res, date(2024, 8, 2))

        # تاریخ و زمان استاندارد
        res = parse_date_smart("1403/05/12 14:30:45", as_datetime=True)
        self.assertEqual(res, datetime(2024, 8, 2, 14, 30, 45))

        # ارسال مستقیم شیء date و datetime
        now_dt = datetime(2024, 8, 2, 10, 0, 0)
        self.assertEqual(parse_date_smart(now_dt), date(2024, 8, 2))
        self.assertEqual(parse_date_smart(now_dt, as_datetime=True), now_dt)

        today_d = date(2024, 8, 2)
        self.assertEqual(parse_date_smart(today_d), today_d)

    def test_point_1_variable_lengths_and_century_pivot(self):
        """
        نکته ۱: پشتیبانی از طول‌های متغیر ارقام و قانون آستانه محوری ۵۰ (Pivot=50)
        """
        # سال دو رقمی >= 50 -> سده ۱۳ (1393)
        res_93 = parse_date_smart("930520")
        self.assertEqual(res_93, date(2014, 8, 11))

        # سال دو رقمی < 50 -> سده ۱۴ (1403)
        res_03 = parse_date_smart("030520")
        self.assertEqual(res_03, date(2024, 8, 10))

        # ۸ رقم پیوسته بدون جداکننده (YYYYMMDD)
        res_8 = parse_date_smart("14030512")
        self.assertEqual(res_8, date(2024, 8, 2))

        # ۱۲ رقم پیوسته (YYYYMMDDHHmm)
        res_12 = parse_date_smart("140305121430")
        self.assertEqual(res_12, datetime(2024, 8, 2, 14, 30, 0))

        # ۱۴ رقم پیوسته (YYYYMMDDHHmmss)
        res_14 = parse_date_smart("14030512143045")
        self.assertEqual(res_14, datetime(2024, 8, 2, 14, 30, 45))

    def test_point_2_persian_and_arabic_numerals(self):
        """
        نکته ۲: تبدیل خودکار ارقام فارسی و عربی به ارقام انگلیسی
        """
        # ارقام فارسی با اسلش
        res_fa_slash = parse_date_smart("۱۴۰۳/۰۵/۱۲")
        self.assertEqual(res_fa_slash, date(2024, 8, 2))

        # ارقام فارسی پیوسته ۸ رقمی
        res_fa_digits = parse_date_smart("۱۴۰۳۰۵۱۲")
        self.assertEqual(res_fa_digits, date(2024, 8, 2))

        # سال دو رقمی فارسی
        res_fa_yy = parse_date_smart("۹۳۰۵۲۰")
        self.assertEqual(res_fa_yy, date(2014, 8, 11))

        # ارقام عربی
        res_ar = parse_date_smart("١٤٠٣/٠٥/١٢")
        self.assertEqual(res_ar, date(2024, 8, 2))

    def test_point_3_single_digit_token_padding(self):
        """
        نکته ۳: پیش‌پردازش قطعات جداکننده‌دار و حل بحران برخورد تک‌رقمی‌ها (1403/5/8)
        اگر پدینگ نباشد رشته به 140358 تبدیل شده و با سال ۲ رقمی تداخل می‌کند.
        """
        # ماه و روز تک‌رقمی با اسلش
        res_slash = parse_date_smart("1403/5/8")
        self.assertEqual(res_slash, date(2024, 7, 29))

        # ماه و روز تک‌رقمی با خط تیره
        res_dash = parse_date_smart("1403-5-8")
        self.assertEqual(res_dash, date(2024, 7, 29))

        # ماه و روز تک‌رقمی با نقطه
        res_dot = parse_date_smart("1403.5.8")
        self.assertEqual(res_dot, date(2024, 7, 29))

        # ماه و روز تک‌رقمی با فاصله
        res_space = parse_date_smart("1403 5 8")
        self.assertEqual(res_space, date(2024, 7, 29))

        # ماه و روز تک‌رقمی با ارقام فارسی
        res_fa_pad = parse_date_smart("۱۴۰۳/۵/۸")
        self.assertEqual(res_fa_pad, date(2024, 7, 29))

    def test_point_4_and_strict_error_handling(self):
        """
        نکته ۴ و سیاست اعتبارسنجی سخت‌گیرانه (Strict Error Policy)
        """
        # ماه نامعتبر (۱۳) در حالت strict=True باید ValidationError پرتاب کند
        with self.assertRaises(ValidationError):
            parse_date_smart("1403/13/10", strict=True)

        with self.assertRaises(ValidationError):
            parse_date_smart("14031310", strict=True)

        # روز نامعتبر (۳۵)
        with self.assertRaises(ValidationError):
            parse_date_smart("1403/05/35", strict=True)

        with self.assertRaises(ValidationError):
            parse_date_smart("14030535", strict=True)

        # زمان نامعتبر (ساعت ۲۵)
        with self.assertRaises(ValidationError):
            parse_date_smart("1403/05/12 25:10:00", strict=True)

        # طول ارقام نامعتبر (مثلاً ۷ رقم)
        with self.assertRaises(ValidationError):
            parse_date_smart("1403051", strict=True)

        # رشته‌های متن تصادفی
        with self.assertRaises(ValidationError):
            parse_date_smart("تاریخ نامعتبر_abc", strict=True)

        # در حالت strict=False باید خروجی None بازگردد (بدون خطا جهت ایمپورت امن)
        self.assertIsNone(parse_date_smart("1403/13/10", strict=False))
        self.assertIsNone(parse_date_smart("14030535", strict=False))
        self.assertIsNone(parse_date_smart("1403/07/31", strict=False))
        self.assertIsNone(parse_date_smart("متن_ناهنجار", strict=False))
        self.assertIsNone(parse_date_smart(None, strict=False))
        self.assertIsNone(parse_date_smart("", strict=False))

    def test_month_length_boundaries_and_overflow_prevention(self):
        """آزمون عدم سرریز تاریخ در ماه‌های ۳۰ روزه و سال‌های کبیسه/غیرکبیسه"""
        # مهر ۳۰ روزه است و روز ۳۱ نامعتبر است
        with self.assertRaises(ValidationError):
            parse_date_smart("1403/07/31", strict=True)

        # اسفند ۱۴۰۳ کبیسه است (حداکثر ۳۰ روز)، روز ۳۱ نامعتبر است
        with self.assertRaises(ValidationError):
            parse_date_smart("1403/12/31", strict=True)

        # اسفند ۱۴۰۴ غیرکبیسه است (حداکثر ۲۹ روز)، روز ۳۰ نامعتبر است
        with self.assertRaises(ValidationError):
            parse_date_smart("1404/12/30", strict=True)

        # میلادی: ۳۰ فوریه در سال کبیسه ۲۰۲۴ نامعتبر است
        with self.assertRaises(ValidationError):
            parse_date_smart("2024-02-30", strict=True)

        # میلادی: ۲۹ فوریه در سال غیرکبیسه ۲۰۲۳ نامعتبر است
        with self.assertRaises(ValidationError):
            parse_date_smart("2023-02-29", strict=True)

        # روزهای معتبر مرز ماه‌ها
        self.assertEqual(parse_date_smart("1403/07/30"), date(2024, 10, 21))
        self.assertEqual(parse_date_smart("1403/12/30"), date(2025, 3, 20))
        self.assertEqual(parse_date_smart("1404/12/29"), date(2026, 3, 20))
        self.assertEqual(parse_date_smart("2024-02-29"), date(2024, 2, 29))

    def test_format_to_shamsi_str(self):
        """آزمون تولید رشته استاندارد خورشیدی اسلش‌دار"""
        sample_date = date(2024, 8, 2)
        shamsi_str = format_to_shamsi_str(sample_date)
        self.assertEqual(shamsi_str, "1403/05/12")

        sample_dt = datetime(2024, 8, 2, 14, 30, 45)
        shamsi_dt_str = format_to_shamsi_str(sample_dt, include_time=True)
        self.assertEqual(shamsi_dt_str, "1403/05/12 14:30:45")

    def test_backward_compatibility_alias(self):
        """آزمون سازگاری کامل نام مستعار _parse_date_flexible با سیستم‌های موجود"""
        self.assertEqual(_parse_date_flexible("1403/05/12"), date(2024, 8, 2))
        self.assertEqual(_parse_date_flexible("14030512"), date(2024, 8, 2))
        self.assertEqual(_parse_date_flexible("930520"), date(2014, 8, 11))
        self.assertIsNone(_parse_date_flexible(None))
        self.assertIsNone(_parse_date_flexible("تاریخ_خراب"))

    def test_make_aware_parameter(self):
        """آزمون تولید datetime دارای منطقه زمانی (timezone-aware) با پارامتر make_aware"""
        from django.utils import timezone

        # ۱. مسیر سریع با رشته تاریخ و زمان استاندارد
        res_aware = parse_date_smart("1403/05/12 14:30:00", as_datetime=True, make_aware=True)
        self.assertIsNotNone(res_aware)
        self.assertTrue(timezone.is_aware(res_aware))
        self.assertEqual(res_aware.year, 2024)
        self.assertEqual(res_aware.month, 8)
        self.assertEqual(res_aware.day, 2)
        self.assertEqual(res_aware.hour, 14)
        self.assertEqual(res_aware.minute, 30)

        # ۲. پیش‌فرض make_aware=False باید شیء naive برگرداند تا سازگاری کامل حفظ شود
        res_naive = parse_date_smart("1403/05/12 14:30:00", as_datetime=True, make_aware=False)
        self.assertIsNotNone(res_naive)
        self.assertTrue(timezone.is_naive(res_naive))

        # ۳. مسیر کمکی (Fallback) با ارقام پیوسته یا فارسی
        res_fallback_aware = parse_date_smart("۱۴۰۳۰۵۱۲۱۴۳۰۰۰", as_datetime=True, make_aware=True)
        self.assertIsNotNone(res_fallback_aware)
        self.assertTrue(timezone.is_aware(res_fallback_aware))

        # ۴. ارسال شیء datetime موجود (تبدیل شیء naive به aware)
        naive_dt = datetime(2024, 8, 2, 10, 0, 0)
        res_from_dt = parse_date_smart(naive_dt, as_datetime=True, make_aware=True)
        self.assertTrue(timezone.is_aware(res_from_dt))

        # ۵. ارسال شیء date با درخواست datetime و make_aware
        sample_d = date(2024, 8, 2)
        res_from_d = parse_date_smart(sample_d, as_datetime=True, make_aware=True)
        self.assertTrue(timezone.is_aware(res_from_d))
        self.assertEqual(res_from_d.hour, 0)
