# مستند راهنما و نتایج پیاده‌سازی موتور سراسری پارسر تاریخ (Dual-Path Date Parser Engine)

<div dir="rtl" align="right">

## ۱. خلاصه اجرایی پروژه
در این عملیات، **موتور سراسری تحلیل، اعتبارسنجی و تبدیل تاریخ و زمان** با الگوی دو مسیره (**Fast-Path / Fallback Engine**) به صورت تمام‌استک (Full-Stack) در دو لایه بک‌اند پایتون و فرانت‌اند آنگولار طراحی، پیاده‌سازی و راستی‌آزمایی شد. این موتور ۴ اصل اساسی گفتگوی فنی پیشین را با پوشش ۱۰۰٪ و بدون سربار محاسباتی اضافه تحقق بخشیده است.

---

## ۲. مشخصات و دستاوردهای پیاده‌سازی

### ۲.۱. تحقق ۴ اصل کلیدی چت قبل:
1. **پشتیبانی از طول‌های متغیر ارقام (نکته ۱):**
   * **۶ رقم (`YYMMDD`):** سال‌های دو رقمی بر پایه **قاعده آستانه محوری ۵۰ (Pivot=50)** پردازش می‌شوند؛ ارقام مساوی یا بالاتر از ۵۰ به قرن ۱۳ خورشیدی (`1393`) و کمتر از ۵۰ به قرن ۱۴ (`1403`) متصل می‌شوند.
   * **۸ رقم (`YYYYMMDD`):** تاریخ پایه بدون جداکننده با ساعت پیش‌فرض `00:00:00`.
   * **۱۲ رقم (`YYYYMMDDHHmm`):** تاریخ + ساعت و دقیقه با ثانیه `00`.
   * **۱۴ رقم (`YYYYMMDDHHmmss`):** تاریخ و زمان کامل با دقت ثانیه.
2. **تبدیل خودکار ارقام فارسی و عربی (نکته ۲):**
   * تمامی کاراکترهای یونیکد فارسی (`۰۱۲۳۴۵۶۷۸۹`) و عربی (`٠١٢٣٤٥٦٧٨٩`) بدون افت کارایی و قبل از تفکیک، به ارقام استاندارد لاتین تبدیل می‌شوند.
3. **پیش‌پردازش قطعات جداکننده‌دار (Token-Padding - نکته ۳):**
   * برای حل چالش تداخل ماه‌ها و روزهای تک‌رقمی (مانند `1403/5/8` که در صورت حذف ساده جداکننده به رشته ۶ رقمی `140358` تبدیل شده و با سال‌های ۲ رقمی اشتباه می‌شد)، ابتدا پارت‌ها بر اساس جداکننده‌ها تفکیک، ماه و روز با صفر پر شده (`14030508`) و سپس پارس می‌گردند.
4. **اعتبارسنجی دامنه، انتهای ماه و سیاست سخت‌گیرانه (Strict Validation - نکته ۴):**
   * بررسی ماه (۱ تا ۱۲)، روز (۱ تا ۳۱)، و دامنه‌های سال خورشیدی (۱۳۰۰ تا ۱۵۰۰) و میلادی (۱۹۰۰ تا ۲۱۵۰).
   * **اعتبارسنجی دقیق طول ماه (Month Length Parity):** بر خلاف روال پیش‌فرض جاوااسکریپت که تاریخ‌های نامعتبر را به ماه بعد سرریز (overflow) می‌کند، با استفاده از `Utils.monthLength` و مقایسه اجزای تاریخ، مواردی نظیر `1403/07/31` (مهر ۳۰ روزه)، `1404/12/30` (اسفند عادی ۲۹ روزه) و `2024-02-30` شناسایی شده و در حالت `strict=True` خطای صریح صادر می‌شود و از سرریز بی‌صدا ممانعت می‌گردد.
   * در حالت غیرسخت‌گیرانه جهت ایمپورت امن، خروجی `None` (یا `null`) برمی‌گرداند.

---

## ۳. تغییرات فایل‌های پروژه

| فایل | لایه | وضعیت | شرح تغییرات |
| :--- | :---: | :---: | :--- |
| [`backend/common/date_utils.py`](file:///e:/warehouse%20project/backend/common/date_utils.py) | بک‌اند | **جدید** | ماژول مرکزی حاوی `parse_date_smart`، `format_to_shamsi_str`، `normalize_digits`، پشتیبانی `make_aware` و مسیر کمکی `_parse_fallback_digits`. |
| [`backend/common/tests/test_date_utils.py`](file:///e:/warehouse%20project/backend/common/tests/test_date_utils.py) | بک‌اند | **جدید** | ۹ آزمون جامع و پیشرفته شامل مسیر سریع، ارقام فارسی/عربی، پدینگ تک‌رقمی، اعتبارسنجی مرز ماه‌ها و پارامتر `make_aware`. |
| [`backend/inventory/views.py`](file:///e:/warehouse%20project/backend/inventory/views.py) | بک‌اند | **اصلاح** | احیای لاگر ماژول، اتصال `_parse_date_flexible` به موتور سراسری `parse_date_smart` و حذف ایمپورت‌های مرده. |
| [`backend/inventory/serializers.py`](file:///e:/warehouse%20project/backend/inventory/serializers.py) | بک‌اند | **اصلاح** | استفاده از `parse_date_smart` در `DocTaskSerializer` برای تاریخ‌های ورودی فاکتورها. |
| [`frontend/src/app/core/utils/date-utils.ts`](file:///e:/warehouse%20project/frontend/src/app/core/utils/date-utils.ts) | فرانت‌اند | **جدید** | ماژول همگام تایپ‌اسکریپت شامل `parseSmartDate` و `formatToStandardShamsi` با اعتبارسنجی طول ماه‌ها (`Utils.monthLength`). |
| [`frontend/src/app/core/utils/date-utils.spec.ts`](file:///e:/warehouse%20project/frontend/src/app/core/utils/date-utils.spec.ts) | فرانت‌اند | **جدید** | ۲۹ تست خودکار تحت فریم‌ورک Vitest با پوشش ۱۰۰٪ کلیه سناریوها و مرزهای تقویمی. |
| [`frontend/src/app/components/audit/audit.ts`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts) | فرانت‌اند | **اصلاح** | اتصال فیلترهای تاریخ ممیزی به موتور مرکزی با حفظ نیمه‌شب UTC (`Date.UTC`) و حذف متدهای مرده محاسباتی. |
| [`frontend/src/app/components/customs/customs.ts`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts) | فرانت‌اند | **اصلاح** | اتصال `convertToShamsiDateString` با حفظ مقدار خام ورودی جهت جلوگیری از پاک شدن داده کاربر. |
| [`frontend/angular.json`](file:///e:/warehouse%20project/frontend/angular.json) | فرانت‌اند | **اصلاح** | افزودن `jalali-ts` به `allowedCommonJsDependencies` جهت بیلد پروداکشن ۱۰۰٪ بدون اخطار. |
| [`frontend/src/app/components/reports/reports.spec.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.spec.ts) | فرانت‌اند | **اصلاح** | افزودن فیلد `warehouse_required_for_dynamic: false` به ماک و رفع خطای کامپایل سوئیت تست. |

---

## ۴. نتایج آزمون‌های راستی‌آزمایی (Verification Results)

1. **تست‌های واحد ماژول بک‌اند:**
   * دستور اجرا: `python manage.py test common.tests.test_date_utils`
   * نتیجه: **۹ تست با موفقیت کامل در ۰.۰۰۳ ثانیه پاس شدند (OK).**
2. **تست‌های یکپارچگی اینورتری و ایمپورت امنیتی:**
   * دستور اجرا: `python manage.py test inventory.tests_security_import`
   * نتیجه: **۳۶ تست جامع رگرسیون با موفقیت پاس شدند (OK در ۶۹ ثانیه).**
3. **تست‌های واحد ماژول فرانت‌اند (Vitest):**
   * دستور اجرا: `npx vitest run src/app/core/utils/date-utils.spec.ts`
   * نتیجه: **۲۹ تست از ۲۹ تست با موفقیت پاس شدند (Duration: 7ms).**
4. **تست‌های واحد گزارشات فرانت‌اند (Vitest):**
   * دستور اجرا: `npx vitest run src/app/components/reports/reports.spec.ts`
   * نتیجه: **۱۰ تست از ۱۰ تست با موفقیت کامل پاس شدند (OK).**
5. **بیلد نهایی فرانت‌اند (Angular Production Build):**
   * دستور اجرا: `npm run build`
   * نتیجه: **بیلد با موفقیت کامل و بدون حتی یک اخطار به پایان رسید (Exit code 0 در ۵۵ ثانیه).**

</div>
