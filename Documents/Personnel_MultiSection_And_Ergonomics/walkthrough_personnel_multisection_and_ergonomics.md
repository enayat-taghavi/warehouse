# مستند پیاده‌سازی و راستی‌آزمایی: چندبخشی پرسنل و ارگونومی ثبت پرسنل

این سند، راهنمای جامع تغییرات انجام‌شده، تست‌ها و راستی‌آزمایی طرح چندبخشی پرسنل (`Personnel Multi-Section Support`)، استعلام خودکار کد ملی (`National Code Auto-fill`)، ارگونومی فرم ثبت پرسنل و تفکیک کارکردها می‌باشد.

---

## ۱. جدول جامع تغییرات و نحوه مشاهده آثار

| ردیف | تسک / قابلیت | فایل‌های تغییریافته و متدها | نحوه مشاهده آثار و راستی‌آزمایی عملیاتی |
| :---: | :--- | :--- | :--- |
| **۱** | **چیدمان ارگونومیک ردیف اول فرم پرسنل** | `frontend/src/app/components/finance/employee/employee-new-personnel/employee-new-personnel.html` | باز کردن مودال ثبت پرسنل در صفحه پرسنل: فیلد «کد ملی (۱۰ رقم)» در اولین ستون سمت راست، نام در وسط و نام خانوادگی در چپ قرار گرفته است. |
| **۲** | **دکمه کپی ۱-کلیک شماره همراه** | `employee-new-personnel.html`, `employee-new-personnel.ts` (`copyPhoneNumber`) | در کادر ورودی شماره همراه، آیکون `📋` تعبیه شده که با کلیک روی آن، شماره کپی شده و آیکون به مدت ۲ ثانیه به `✓` سبز تغییر یافته و پیام توست موفقیت نمایش داده می‌شود. |
| **۳** | **حذف فیلد اضافی نوع قرارداد کاری** | `employee-new-personnel.html`, `employee-new-personnel.ts` | دراپ‌داون نوع قرارداد از ظاهر فرم حذف شده و سیستم به صورت خودکار مقدار پیش‌فرض `daily` (روزانه/پیمانی) را در پشت صحنه ذخیره می‌کند. |
| **۴** | **رفع قفل فیلد تعداد فرزندان** | `employee-new-personnel.html` | فیلد تعداد فرزندان برای همه وضعیت‌های تاهل (مجرد، متاهل، مطلقه) فعال است و قفل اجباری آن برداشته شده است. |
| **۵** | **استعلام هوشمند کد ملی و بنر هویت** | `backend/personnel/views.py` (`lookup_by_national_code`), `frontend/src/app/core/api/personnel-api.service.ts`, `employee-new-personnel.ts` (`lookupExistingPersonnel`), `employee-new-personnel.html` | هنگام ثبت پرسنل در یک بخش جدید، با وارد کردن ۱۰ رقم کد ملی پرسنلی که قبلاً در سامانه ثبت شده، بنر سبز رنگ استعلام با مشخصات هویتی و بخش فعلی ظاهر شده و دکمه «فراخوانی خودکار مشخصات هویتی و بانکی» فعال می‌شود. |
| **۶** | **فراخوانی ۱-کلیک اطلاعات هویتی و بانکی** | `employee-new-personnel.ts` (`applyFoundPersonnelData`) | با کلیک روی دکمه استعلام در بنر، نام، نام خانوادگی، شماره همراه، شماره حساب، شماره شبا، بانک، تاریخ تولد و سایر مشخصات تکمیل می‌شوند؛ در عین حال سمت شغلی و دستمزد خالی مانده تا برای بخش جدید مستقلاً تعیین شوند. |
| **۷** | **مدل انتساب چندبخشی پرسنل** | `backend/personnel/models.py` (`PersonnelSectionAssignment`), `backend/personnel/migrations/0025_personnelsectionassignment.py` | ساختار داده‌ای استاندارد ایجاد شده تا پرسنل بتوانند بدون نقض یکتایی کد ملی، به پروژه‌ها و بخش‌های نامحدود منتسب شوند. |
| **۸** | **اندپوینت انتساب پرسنل به بخش جدید** | `backend/personnel/views.py` (`assign_section`), `personnel-api.service.ts` (`assignPersonnelToSection`) | فراخوانی `POST /api/personnel/profiles/{id}/assign-section/` با ارسال `section_id`، `job_title` و `daily_base_wage` پرسنل را به بخش جدید با سمت و دستمزد اختصاصی متصل می‌کند. |
| **۹** | **نمایش همزمان در تمام بخش‌های منتسب** | `backend/personnel/views.py` (`PersonnelProfileViewSet.get_queryset`), `backend/personnel/serializers.py` (`PersonnelProfileSerializer.to_representation`) | مراجعه به لینک `https://app.farsalish.ir/app/finance/employee-new-personnel?section_id=3` و `https://app.farsalish.ir/app/finance/employee-new-personnel?section_id=5`: پرسنل در هر دو صفحه با سمت و دستمزد خاص همان بخش لیست می‌شود. |
| **۱۰** | **ماتریس کارکرد روزانه مستقل در هر بخش** | `backend/personnel/views.py` (`DailyAttendanceViewSet.get_matrix`) | مراجعه به حضور و غیاب روزانه با فیلتر `section_id`: پرسنل در ماتریس کارکرد هر دو بخش حاضر است و سمت شغلی مختص آن بخش را نشان می‌دهد. |
| **۱۱** | **اعتبارسنجی تداخل کارکرد در دو بخش** | `backend/personnel/views.py` (`DailyAttendanceViewSet.bulk_save`) | اگر برای پرسنل در بخش ۱ «حاضر کامل» (۱۰ ساعت) ثبت شود و در همان روز کاربری در بخش ۲ مجدداً «حاضر کامل» ثبت کند، سامانه با خطای ۴۰۰ هشدار داده و مانع تداخل ساعت می‌شود، اما ثبت شیفت‌های مجاز یا نیمه‌وقت (مثلاً ۵ ساعت) پذیرفته می‌شود. |
| **۱۲** | **پاکسازی ایزوله روزانه و حفظ سوابق** | `backend/personnel/views.py` (`DailyAttendanceViewSet.clear_day`) | دکمه پاکسازی روز جاری در یک بخش، فقط کارکرد همان بخش را پاک کرده و کارکرد ثبت‌شده در سایر بخش‌ها و پروژه‌ها دست‌نخورده باقی می‌ماند. |
| **۱۳** | **شیت ماهانه و اکسل چندبخشی** | `backend/personnel/views.py` (`get_monthly_grid`, `bulk_save_monthly_grid`, `export_monthly_excel`, `import_monthly_excel`) | شیت ماهانه و فایل خروجی دو سطری اکسل بر مبنای پرسنل فعال مستقیم و انتساب‌های بخش فیلتر و ذخیره می‌شوند. |

---

## ۲. نتایج تست‌ها و راستی‌آزمایی خودکار

1. **تست‌های واحد بک‌اند جنگو (`tests_multi_section_and_lookup.py`):**
   - تست استعلام کد ملی (`test_lookup_by_national_code`): **PASSED**
   - تست انتساب به بخش دوم و سمت/دستمزد مستقل (`test_assign_personnel_to_second_section`): **PASSED**
   - تست ثبت کارکرد، تفکیک ماتریس، اعتبارسنجی تداخل و پاکسازی ایزوله (`test_attendance_in_both_sections_and_conflict_prevention`): **PASSED**
   - دستور اجرا: `python manage.py test personnel.tests_multi_section_and_lookup` -> **OK (3 tests in 1.078s)**

2. **تست چرخه کامل پرسنل جنگو (`tests_personnel_cycle.py`):**
   - اجرای کامل ۷ تست یکپارچه پرسنل و گردش کار -> **OK (7 tests in 0.813s)**

3. **بیلد پروژه فرانت‌اند (`npm run build`):**
   - کامپایل بدون خطا (`Exit Code 0`)
   - تولید باندل کامل در مسیر `dist/warehouse-app` و پچ موفق PWA Worker.
