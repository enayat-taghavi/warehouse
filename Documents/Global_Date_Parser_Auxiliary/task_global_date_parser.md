# چک‌لیست وظایف پیاده‌سازی: موتور سراسری تحلیل و پارس تاریخ (Dual-Path Date Parser Engine)

<div dir="rtl" align="right">

| شناسه | لایه / بخش | شرح وظیفه فنی | وضعیت |
| :---: | :--- | :--- | :---: |
| **T-01** | بک‌اند (Core) | پیاده‌سازی ماژول مرکزی `backend/common/date_utils.py` شامل مسیر سریع Fast-Path و مسیر کمکی Fallback | [x] |
| **T-02** | بک‌اند (FallBack Engine) | اعمال دقیق ۴ نکته (طول متغیر، ارقام فارسی/عربی، Token-Padding تک‌رقمی‌ها، اعتبارسنجی دامنه) | [x] |
| **T-03** | بک‌اند (Refactor) | اتصال تابع جدید به `inventory/views.py` (`_parse_date_flexible`) و ایمپورت‌های اکسل اسناد | [x] |
| **T-04** | فرانت‌اند (Core) | پیاده‌سازی ماژول متناظر `frontend/src/app/core/utils/date-utils.ts` با منطق تطبیق‌یافته کلاینت | [x] |
| **T-05** | آزمون واحد (Unit Tests) | نگارش تست‌های خودکار در `backend/common/tests/test_date_utils.py` با پوشش ۱۰۰٪ ماتریس سناریوها | [x] |
| **T-06** | اعتبارسنجی نهایی | اجرای تست‌های بک‌اند و بیلد فرانت‌اند و اطمینان از سلامت کامل سامانه | [x] |
| **T-07** | بک‌اند (Stability) | احیای متغیر ماژول لاگر در `inventory/views.py` و حذف ایمپورت‌های مرده | [x] |
| **T-08** | کلاینت (Parity & Integrity) | اعتبارسنجی انتهای ماه، جلوگیری از سرریز بی‌صدا و اتصال واقعی `audit.ts` و `customs.ts` با حفظ مقدار خام و نیمه‌شب UTC | [x] |
| **T-09** | فرانت‌اند (Clean Build) | رفع خطای تایپینگ `reports.spec.ts` و افزودن `jalali-ts` به `allowedCommonJsDependencies` جهت بیلد کاملاً بدون اخطار | [x] |
| **T-10** | تست بک‌اند (Coverage) | نگارش آزمون جامع پوشش پارامتر `make_aware` و اطمینان از پشتیبانی صحیح از Timezone | [x] |

</div>
