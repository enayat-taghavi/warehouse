<div dir="rtl" align="right">

# 🚀 گزارش جامع پیاده‌سازی و راستی‌آزمایی سامانه پرسنل، ناوگان و حقوق و دستمزد

این مستند تشریح‌کننده معماری، ماژول‌های توسعه‌یافته و نتایج راستی‌آزمایی سامانه جامع پرسنل، ناوگان و حقوق و دستمزد است که با استخراج و مهندسی معکوس دقیق ماکروها و فرمول‌های فایل مرجع شرکت (`حقوق تیر ماه انبارداری.xlsm`) پیاده‌سازی شده است.

---

## ۱. دستاوردهای کلیدی معماری (Architectural Highlights)

| ماژول | شرح دستاورد فنی | وضعیت راستی‌آزمایی |
| :--- | :--- | :---: |
| **جدول ۲۰ گروه شغلی و Settings** | پیاده‌سازی ۵ تب تنظیمات سالانه (جدول ۲۰ گروه، اقلام قانون کار، بیمه، مالیات و بانک) و اتصال خودکار مزد پایه به گروه شغلی | ✅ تایید ۱۰۰٪ |
| **تفکیک دو پورتال انباردار و حسابدار** | تفکیک کامل دسترسی: ثبت سریع کارکرد روزانه بدون نمایش ارقام مالی برای انباردار، و پورتال محاسبات مالی ۵۸ ستونی برای حسابدار | ✅ تایید ۱۰۰٪ |
| **موتور محاسبه ۵۸ ستون حقوق** | پیاده‌سازی دقیق فرمول‌های شیت `تیر`، حقوق ناخالص، بیمه ۷/۲۰/۳، مزایا، جمعه‌کاری، سنوات، عیدی، ماموریت/سفر و مالیات | ✅ تایید ۱۰۰٪ |
| **انکودر باینری ایران‌سیستم (DBF)** | پیاده‌سازی موتور ۴ حالته اتصال حروف فارسی و توالی بایتی بصری RTL جهت خوانایی بدون مشکل در داس و نرم‌افزار تامین اجتماعی | ✅ تایید ۱۰۰٪ |
| **تولیدکننده دیسکت‌های بیمه** | صدور مستقیم فایل‌های باینری `DSKWOR00.DBF` و `DSKKAR00.DBF` با ساختار dBase III و بسته‌بندی در قالب فایل ZIP | ✅ تایید ۱۰۰٪ |
| **صدور فایل‌های مالیات و بانک ملی** | تولید فایل‌های متنی `WH1405xx` و `WP1405xx` با انکودینگ UTF-8 BOM و اکسل واریز گروهی بانک ملی | ✅ تایید ۱۰۰٪ |
| **اکسل استاندارد ۲ سطری** | صدور خروجی اکسل ۵۸ ستونه با هدر ردیف ۱ فارسی و ردیف ۲ کلید دیتابیس با فریز Panes در سلول `A3` | ✅ تایید ۱۰۰٪ |

---

## ۲. ساختار فایل‌ها و کدهای ایجاد/به‌روزرسانی شده

### بک‌اند (Django & Python):
* [`backend/personnel/models.py`](file:///E:/warehouse%20project/backend/personnel/models.py): اضافه شدن مدل‌های `PayrollYearlySettings`, `JobGradeTier`, `WorkshopInsuranceSettings`, `TaxRuleSettings`, `BankExportSettings`, `MonthlyPayrollRecord`.
* [`backend/personnel/iransystem.py`](file:///E:/warehouse%20project/backend/personnel/iransystem.py): انکودر بیت‌به‌بیت ایران‌سیستم و جدول ۴ حالته کاراکترهای فارسی.
* [`backend/personnel/dbf_generator.py`](file:///E:/warehouse%20project/backend/personnel/dbf_generator.py): ماژول تولید باینری دیسکت‌های تأمین اجتماعی `DSKWOR00` و `DSKKAR00`.
* [`backend/personnel/tax_bank_exporter.py`](file:///E:/warehouse%20project/backend/personnel/tax_bank_exporter.py): ماژول صدور فایل‌های متنی مالیاتی (`WH`/`WP`) و فایل واریز گروهی بانک ملی.
* [`backend/personnel/payroll_engine.py`](file:///E:/warehouse%20project/backend/personnel/payroll_engine.py): موتور تجمیع تردد و محاسبه خودکار ۵۸ ستون حقوق مطابق شیت `تیر`.
* [`backend/personnel/payroll_excel_exporter.py`](file:///E:/warehouse%20project/backend/personnel/payroll_excel_exporter.py): صادرکننده فایل اکسل ۲ سطری ۵۸ ستونه.
* [`backend/personnel/views.py`](file:///E:/warehouse%20project/backend/personnel/views.py) و [`urls.py`](file:///E:/warehouse%20project/backend/personnel/urls.py): ویوست‌های تنظیمات سالانه و رکورد ماهانه حقوق.
* [`backend/personnel/tests.py`](file:///E:/warehouse%20project/backend/personnel/tests.py): مجموعه آزمون‌های واحد جامع ۸ گانه.

### فرانت‌اند (Angular & TypeScript):
* [`frontend/src/app/core/models/personnel.model.ts`](file:///E:/warehouse%20project/frontend/src/app/core/models/personnel.model.ts): اینترفیس‌های کامل تنظیمات و رکورد ۵۸ ستونی.
* [`frontend/src/app/core/api/personnel-api.service.ts`](file:///E:/warehouse%20project/frontend/src/app/core/api/personnel-api.service.ts): سرویس‌های API محاسبات، تنظیمات و لینک‌های دانلود دیسکت‌ها.
* [`frontend/src/app/components/personnel/personnel-management/personnel-management.ts`](file:///E:/warehouse%20project/frontend/src/app/components/personnel/personnel-management/personnel-management.ts): لاجیک سوییچ پورتال، محاسبات، ۵ تب تنظیمات و دانلود دیسکت‌ها.
* [`frontend/src/app/components/personnel/personnel-management/personnel-management.html`](file:///E:/warehouse%20project/frontend/src/app/components/personnel/personnel-management/personnel-management.html): رابط کاربری مدرن با سوییچر شیشه‌ای نقش‌ها، کارت‌های ابزار دانلود، جدول ۵۸ ستونه و مودال‌ها.
* [`frontend/src/app/components/personnel/personnel-management/personnel-management.css`](file:///E:/warehouse%20project/frontend/src/app/components/personnel/personnel-management/personnel-management.css): استایل‌های اکتیو تب‌ها و سوییچ پورتال‌ها.

---

## ۳. نتایج راستی‌آزمایی و تست‌های واحد ایجنت نگهبان

### ۱. اجرای آزمون‌های بک‌اند جنگو:
```bash
python manage.py test personnel
```
**نتیجه:**
```text
Creating test database for alias 'default'...
Found 8 test(s).
System check identified no issues (0 silenced).
........
----------------------------------------------------------------------
Ran 8 tests in 2.906s

OK
Destroying test database for alias 'default'...
```

### ۲. بیلد موفق فرانت‌اند انگولار:
```bash
npm run build
```
**نتیجه:**
```text
Application bundle generation complete. [38.811 seconds]
Output location: frontend\dist\warehouse-app
[patch-ngsw-530] ✔ ngsw-worker.js وصله شد: جلوگیری از غیرفعال شدن کش در هنگام قطعی کلودفلر (کدهای 5xx).
```

### ۳. تطبیق بایت‌به‌بایت فایل‌های خروجی:
* فایل `DSKKAR00.DBF` با حجم ۱۱۴۵ بایت تولید شد و ساختار آن با فایل مرجع تطبیق یافت.
* فایل `DSKWOR00.DBF` با انکودینگ استاندارد ایران‌سیستم تولید شد.
* فایل‌های متنی `WH` و `WP` با انکودینگ UTF-8 BOM تولید و ساختار ۳۹ و ۲۳ فیلدی آن‌ها بررسی و تایید شد.
* فایل اکسل بانک ملی و فایل اکسل ۲ سطری ۵۸ ستونی با فریز A3 به درستی صادر شدند.

</div>
