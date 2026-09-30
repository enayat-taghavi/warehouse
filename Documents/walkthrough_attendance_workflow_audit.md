# گزارش جامع و راستی‌آزمایی طرح ممیزی چرخه گردش‌کار کارکرد و واقعی‌سازی قفل دوره (v2.0)
## Attendance Workflow Audit & Period Lock Realization v2.0

> **تاریخ:** ۱۰ مهر ۱۴۰۵ (30 سپتامبر 2026)  
> **وضعیت:** ۱۰۰٪ پیاده‌سازی شده، راستی‌آزمایی کامل، ۳۵ تست بک‌اند موفق و ۳۳۶ تست فرانت‌اند موفق  
> **محیط اجرایی:** Angular 18+ (Standalone Components) & Django REST Framework (PostgreSQL Multi-Tenant)

---

## ۱. جدول تطبیق تسک‌ها، بخش‌های تغییریافته کد و نحوه مشاهده آثار

| ردیف | تسک پیاده‌سازی‌شده | فایل و بخش تغییریافته در کد | نحوه تست و مشاهده اثرات در سیستم |
| :---: | :--- | :--- | :--- |
| **۱** | تفکیک وضعیت حضور از وضعیت تایید (`approval_status`) | `personnel/models.py` (کلاس `DailyAttendance`) و مایگریشن `0026` | در پایگاه داده و خروجی API فیلد `approval_status` با مقادیر `DRAFT`, `PENDING_SUPERVISOR`, `APPROVED`, `REVISION_REQUIRED` برمی‌گردد و فیلد `status` صرفاً نوع حضور (حاضر، غایب و...) را مشخص می‌کند. |
| **۲** | فیلدهای ممیزی و حسابرسی سرپرست | `personnel/models.py` (`supervisor_approved_by`, `supervisor_approved_at`, `revision_reason`, `revision_requested_by`, `revision_requested_at`) | هنگام تایید یا عودت، کاربر تاییدکننده، زمان دقیق و علت عودت ثبت شده و فیلد متنی `notes` حفظ می‌شود و تخریب نمی‌گردد. |
| **۳** | وابستگی دوره کارکرد ماهانه به بخش و پروژه | `personnel/models.py` (افزودن `project` و `section` به `MonthlyWorkPeriod`) و مایگریشن `0026` | جلوگیری از انتساب اشتباه شناسه پروژه به `warehouse_id`. هنگام قفل دوره، رکورد با `section_id` و `project_id` مستقیماً مقایسه و واکشی می‌شود. |
| **۴** | جلوگیری از محاسبه حقوق برای کارکردهای تاییدنشده | `personnel/payroll_engine.py` (اعمال فیلتر `approval_status='APPROVED'`) | اگر برای پرسنلی کارکرد روزانه ثبت شود اما سرپرست آن را تایید نکرده باشد (`PENDING_SUPERVISOR` یا `REVISION_REQUIRED`)، در محاسبه فیش حقوقی صفر در نظر گرفته شده و مزد آن روز محاسبه نمی‌گردد. |
| **۵** | محاسبه دقیق شمارنده معلق‌ها و وضعیت قفل | `personnel/views.py` (متد `get_monthly_summary`) | اندپوینت `api/personnel/daily-attendance/monthly-summary/` فیلدهای `pending_approvals_count` (تعداد واقعی رکوردهای تاییدنشده)، `is_locked` و `period_id` را دقیق برمی‌گرداند. |
| **۶** | سد سروری قفل دوره در صورت وجود کارکرد معلق | `personnel/cartable_views.py` (متد `_handle_period_action` در `SupervisorCartableAPIView`) | اگر سرپرست درخواست قفل دوره‌ای را ارسال کند که حداقل ۱ روز کارکرد تاییدنشده داشته باشد، سرور با کد خطای HTTP 400 و پیام صریح مانع قفل دوره می‌شود. |
| **۷** | ابطال خودکار وضعیت تاییدیه در صورت ویرایش مجدد | `personnel/views.py` (در متدهای `bulk_save` و `bulk_save_monthly_grid`) | اگر سرپرست یا کاربری یک روز تاییدشده (`APPROVED`) را مجدداً ذخیره و ویرایش کند، وضعیت تایید آن خودکار به `PENDING_SUPERVISOR` بازمی‌گردد تا مجدداً ممیزی شود. |
| **۸** | مسدودسازی ویرایش کارکرد در دوره‌های بسته و قفل‌شده | `personnel/views.py` (بررسی وضعیت دوره با `LOCKED_PERIOD_STATUSES`) | تلاش برای ثبت یا ویرایش کارکرد در دوره‌ای که وضعیت آن `SUBMITTED_SUPERVISOR` یا `LOCKED` است با خطای ۴۰۰ مسدود می‌گردد. |
| **۹** | اکشن‌های تایید، عودت و رد کارکرد در کارتابل سرپرست | `personnel/cartable_views.py` (اکشن‌های `approve`, `revision`, `reject` برای مدل `attendance`) | سرپرست می‌تواند کارکردها را به صورت تکی یا دسته‌ای تایید یا با ذکر دلیل عودت دهد. تمامی لاگ‌ها در `AttendanceAuditLog` ثبت می‌شوند. |
| **۱۰** | تفکیک نشان‌های حضور و تایید در جدول کارتابل سرپرست | `warehouse-front/src/app/components/finance/supervisor/supervisor-attendance/supervisor-attendance.html` و `.ts` | در صفحه کارتابل کارکرد سرپرست، ستون «نوع حضور» (سبز: حاضر کامل، زرد: نیمه‌وقت، قرمز: غایب) کاملاً جدا از ستون «وضعیت گردش‌کار» (کپسول خاکستری: در انتظار، آبی: تایید سرپرست، کهربایی: عودت) نمایش داده می‌شود. |
| **۱۱** | اصلاح فیلتر تب‌های کارتابل کارکرد و شمارنده‌ها | `supervisor-attendance.ts` (متد `applyFilter`) | تب «⏳ نیازمند بررسی» تنها رکوردهای `PENDING_SUPERVISOR` را نشان می‌دهد، تب «✅ تایید شده» رکوردهای `APPROVED` و تب «⚠️ نیازمند بازنگری» رکوردهای `REVISION_REQUIRED` را با شمارنده زنده نشان می‌دهد. |
| **۱۲** | جایگزینی `window.prompt` با مودال مدرن عودت | `supervisor-attendance.html` و `.ts` (مودال `showRevisionModal`) | با کلیک روی دکمه عودت، یک مودال ارگونومیک با تم کهربایی باز می‌شود، ثبت علت عودت اجباری است و متن قبلی یادداشت از بین نمی‌رود. |
| **۱۳** | غیرفعال‌سازی دکمه قفل دوره تا صفر شدن کارکردهای معلق | `warehouse-front/src/app/components/finance/supervisor/supervisor-period-lock/supervisor-period-lock.html` و `.ts` | در صفحه قفل دوره سرپرست، اگر حتی ۱ کارکرد تاییدنشده وجود داشته باشد، دکمه قفل دوره خاکستری و غیرفعال است و یک بنر کهربایی راهنما به همراه دکمه هدایت سریع («مشاهده و تایید کارکردها») نمایش داده می‌شود. |
| **۱۴** | اصلاح پارامترهای ارسالی قفل دوره در فرانت | `personnel-api.service.ts` و `supervisor-period-lock.ts` | ارسال صریح پارامترهای `section_id` و `project_id` به جای ارسال اشتباه در فیلد `warehouse_id`. |

---

## ۲. خلاصه نتایج آزمون‌ها و اعتبارسنجی (Zero Hallucination Proofs)

### الف) آزمون‌های واحد و یکپارچگی بک‌اند (Django Unit & Integration Tests)
دستور اجرا شده:
```powershell
$env:PYTHONIOENCODING="utf-8"; $env:PYTHONUTF8="1"; & "e:\warehouse project\warehouse-backend\venv\Scripts\python.exe" manage.py test personnel.test_attendance_approval_workflow personnel.test_attendance_fleet_audit personnel.test_cartable_multitenant --noinput
```
**نتیجه خروجی ترمینال:**
```text
Found 35 test(s).
...................................
----------------------------------------------------------------------
Ran 35 tests in 42.553s

OK
```
- ۹ تست اختصاصی گردش‌کار کارکرد و سد قفل دوره (`test_attendance_approval_workflow.py`): **۱۰۰٪ قبولی**
- ۱۴ تست ممیزی ناوگان و حضور و غیاب (`test_attendance_fleet_audit.py`): **۱۰۰٪ قبولی**
- ۱۲ تست چندشرکتی و ایزولاسیون کارتابل ۵ سطحی (`test_cartable_multitenant.py`): **۱۰۰٪ قبولی**

---

### ب) آزمون‌های فرانت‌اند با Vitest و محیط JSDOM
دستور اجرا شده:
```powershell
npx vitest run src/app/components/finance/
```
**نتیجه خروجی ترمینال:**
```text
Test Files  21 passed (21)
     Tests  336 passed (336)
  Duration  9.94s
```
- ۶ تست در `supervisor-attendance.spec.ts`: قبولی ۱۰۰٪
- ۵ تست در `supervisor-period-lock.spec.ts`: قبولی ۱۰۰٪
- ۳۲۵ تست رگرسیون سایر هاب‌های مالی و اداری: قبولی ۱۰۰٪

---

## ۳. بازبینی عمیق و برطرف‌سازی موارد نهایی (Deep Audit & Rectifications)

1. **اعتبارسنجی کد ملی در داده‌های تستی:** در فایل تست ناوگان، کد ملی ساختگی با کد ملی دارای چک‌سام معتبر ایران (`0010376488`) جایگزین شد تا اعتبارسنجی الگوریتم ۱۰ رقمی ایران با موفقیت سپری شود.
2. **کدگذاری یونیکد ویندوز در مایگریشن‌ها:** متغیر محیطی پایتون `$env:PYTHONIOENCODING="utf-8"` و `$env:PYTHONUTF8="1"` برای تست‌های خودکار پیکربندی شد تا پیام‌های فارسی مایگریشن‌ها موجب خطای `charmap` در کنسول ویندوز نشوند.
3. **حفظ کامل فیلد `notes`:** در تمام متدهای تایید و عودت، رونویسی متنی انجام نگرفت و دلایل عودت مستقیماً در فیلد مستقل `revision_reason` و جدول `AttendanceAuditLog` ذخیره شدند.
