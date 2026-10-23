# برنامه جامع رفع ایرادات چرخهٔ حیات ناوگان و آماده‌سازی انتشار عملیاتی
### (ویرایش ممیزی ۱۲ مهر ۱۴۰۵ — منطبق بر پروتکل DUAL-SAVE و استانداردهای کلود اوپوس ۴.۶)

<div dir="rtl" align="right">

> [!IMPORTANT]
> **خلاصه نتایج بررسی و اعتبارسنجی عمیق:**
> تمامی ۷ بند مطرح‌شده در گزارش کاربر با تحلیل مستقیم سورس‌کدها، اجرای دستورات بیلد `npx ng build`، بررسی لاگ تست‌های پایتون، گیت و مایگریشن‌ها **به‌صورت ۱۰۰٪ قطعی تأیید شدند**. هیچ‌کدام از بندهای گزارش رد نشد. علاوه بر این، **۳ ایراد تکمیلی جدید** نیز در جریان این واکاوی کشف و در این طرح گنجانده شد (مجموعاً ۱۰ ایراد عملیاتی).

---

## ۱. جدول ماتریس اعتبارسنجی گزارش و ایرادات جدید

| ردیف | موضوع و بند گزارش | وضعیت ارزیابی | فایل‌ها و موقعیت در کد | پیامد فنی و راه‌حل نهایی |
| :---: | :--- | :---: | :--- | :--- |
| **۱** | خطاهای کامپایل TypeScript بیلد فرانت‌اند (۱۰ خطا) | **تأیید قطعی** | `accountant-fleet.html:690,692`<br>`manager-fleet.html:641-651`<br>`supervisor-fleet.html:187,627` | شکست ساخت `dist/`؛ تغییر `shebaValidationResult.error` به `.errorMessage`، اصلاح اینپوت/آوتپوت‌های `<app-smart-delete-modal>`، مجاز کردن `undefined` در `copyToClipboard`، و جایگزینی `model_name` با `vehicle_type_display`. |
| **۲** | عدم اجرای تسک ۱۰.۶ و بخش ۵.۳ (پروتکل انتشار سرور) | **تأیید قطعی** | `task_fleet_lifecycle.md:99`<br>`implementation_plan_fleet_lifecycle.md:289` | سرور Daphne و بیلد فرانت‌اند کدهای قدیمی را اجرا می‌کنند؛ اجرای پشتیبان، مایگریشن‌ها، بیلد فرانت، ری‌استارت Daphne و تست سلامت الزامی است. |
| **۳** | بلاتکلیفی تصمیم‌های باز در جدول بخش ۶.۲ (ت-۱ تا ت-۴) | **تأیید قطعی** | `implementation_plan_fleet_lifecycle.md:316` | جدول ۶.۲ سند نیاز به تعیین‌تکلیف و اخذ تاییدیه از کاربر دارد تا وضعیت‌های اکتشافی به تصویب نهایی برسند. |
| **۴** | انحراف مقصد اعلان‌ها (Navigation Mismatch) | **تأیید قطعی** | `fleet_lifecycle_services.py:656`<br>`notification-center.component.ts:289,303` | کاربر از روی نوتیفیکیشن رد/عودت به صفحه جدول تردد روزانه هدایت می‌شد نه کارتابل پیش‌نویس؛ تغییر مسیر به `/app/finance/employee-new-vehicle`. |
| **۵** | نشت اطلاعات مالی در لاگ ممیزی (SoD Leakage) | **تأیید قطعی** | `serializers.py:1693,1700-1712` | نرخ خودرو (`default_service_rate`) در لاگ‌ها به سرپرست/راننده نمایش داده می‌شد؛ افزودن `FLEET_RATE_FIELDS` به فیلتر ممیزی و اضافه کردن `plate_number` و `driver_name` به خلاصه اسنپ‌شات. |
| **۶** | فقدان گارد دفاع در عمق مدل (`VehicleTripLog.clean`) | **تأیید قطعی** | `personnel/models.py:2624` | عدم وجود متد `clean()` روی مدل باعث می‌شد ثبت تردد از طریق شل جنگو یا پنل ادمین بدون ارزیابی انقضا انجام شود؛ پیاده‌سازی متد `clean()` و اعتبارسنجی با `assert_vehicle_trip_allowed`. |
| **۷** | عدم همگام‌سازی چک‌باکس‌های فازهای ۰ تا ۳ سند تسک‌ها | **تأیید قطعی** | `task_fleet_lifecycle.md:7-48` | تسک‌های فازهای ۰ تا ۳ علیرغم پیاده‌سازی با علامت خالی `[ ]` رها شده بودند؛ علامت‌گذاری کامل به عنوان `[x]`. |
| **۸** *(جدید)* | خطای یونیکد در مایگریشن هنگام اجرای تست در ویندوز | **کشف جدید** | `warehouses/migrations/0005_assign_warehouse_to_pts.py:15` | متن فارسی در دستور `print` مایگریشن بدون انکودینگ UTF-8 در شل ویندوز باعث `UnicodeEncodeError (charmap)` می‌شود؛ تنظیم خودکار یا اصلاح خروجی کنسول. |
| **۹** *(جدید)* | فقدان دیالوگ مسدودسازی حذف خودروی دارای سابقه | **کشف جدید** | `manager-fleet.html:641-652` | در کارتابل مدیر، در صورت داشتن سابقه تردد، پیام خطای بازدارنده (مشابه `manager-personnel.html`) رندر نمی‌شد و کاربر علت غیرفعال بودن دکمه حذف را نمی‌دید. |
| **۱۰** *(جدید)* | عدم یکپارچگی خطای تردد در اکسل با `assert_vehicle_trip_allowed` | **کشف جدید** | `fleet_excel_engine.py:307-310` | فراخوانی مستقیم `validate_vehicle_validity` بدون استفاده از ساختار استاندارد خطای `VehicleWorkflowError` در موتور اکسل. |

---

## ۲. بررسی نیازمند تصمیم کاربر (User Review Required)

> [!WARNING]
> پیش از شروع فاز انتشار عملیاتی روی سرور، لطفاً تصمیم‌های چهارگانه زیر را تایید بفرمایید:
> 
> ۱. **تصمیم ت-۱ (تخصیص ۱۱ خودروی قدیمی بدون شرکت):** آیا تخصیص خودروی ۱۴۴ به «پاینده توان ساینا» (شناسه ۱) و خودروهای [۲، ۳، ۴، ۵، ۶، ۱۰، ۱۱، ۱۳، ۱۶، ۱۸] به «فارس عالیش» (شناسه ۲) مورد تایید قطعی است؟ *(پیشنهاد: بله، تایید می‌شود)*
> ۲. **تصمیم ت-۲ (مجوز حسابدار عمومی):** آیا حسابدار با مجوز عمومی `can_act_as_accountant` می‌تواند خودرو را تایید مالی کند یا صرفاً مجوز سخت‌گیرانه `perm_approve_fleet_finance` مدنظر است؟ *(پیشنهاد: برای تفکیک وظایف، صرفاً مجوز سخت‌گیرانه تایید مالی ناوگان)*
> ۳. **تصمیم ت-۳ (انقضای گواهینامه):** آیا انقضای گواهینامه راننده ثبت تردد روزانه را مسدود کند یا فقط در صورت پر بودن فیلد بررسی شود؟ *(پیشنهاد: فقط در صورت پر بودن فیلد تاریخ گواهینامه)*
> ۴. **تصمیم ت-۴ (بازفعال‌سازی خودروهای قطع‌همکاری‌شده):** در صورت بازگشت راننده قطع‌همکاری‌شده، ثبت مجدد چگونه باشد؟ *(پیشنهاد: در این فاز خارج از دامنه؛ خودرو در صورت بازگشت با شماره پرونده قبلی از ادمین یا ایجاد پرونده جدید مدیریت شود)*

---

## ۳. تغییرات پیشنهادی به تفکیک فایل و مؤلفه (Proposed Changes)

### مؤلفه ۱: رفع خطاهای کامپایل فرانت‌اند (`frontend`)

#### [MODIFY] [accountant-fleet.html](file:///e:/warehouse%20project/frontend/src/app/components/finance/accountant/accountant-fleet/accountant-fleet.html)
- خط ۶۹۰ و ۶۹۲: اصلاح `shebaValidationResult.error` به `shebaValidationResult.errorMessage`.

#### [MODIFY] [manager-fleet.html](file:///e:/warehouse%20project/frontend/src/app/components/finance/manager/manager-fleet/manager-fleet.html)
- هماهنگ‌سازی تگ `<app-smart-delete-modal>` با اینپوت‌های واقعی کامپوننت اشتراکی و اضافه کردن دیالوگ بازدارنده در صورت وجود سابقه تردد (مشابه `manager-personnel.html`).

#### [MODIFY] [supervisor-fleet.html](file:///e:/warehouse%20project/frontend/src/app/components/finance/supervisor/supervisor-fleet/supervisor-fleet.html) & [supervisor-fleet.ts](file:///e:/warehouse%20project/frontend/src/app/components/finance/supervisor/supervisor-fleet/supervisor-fleet.ts)
- در `supervisor-fleet.ts` خط ۶۱۳: تغییر تایپ ورودی `copyToClipboard` به `id?: number`.
- در `supervisor-fleet.html` خط ۶۲۷: اصلاح `selectedViewVehicle.model_name` به `selectedViewVehicle.vehicle_type_display || selectedViewVehicle.vehicle_type`.

---

### مؤلفه ۲: هدایت صحیح اعلان‌ها (Navigation Mismatch)

#### [MODIFY] [fleet_lifecycle_services.py](file:///e:/warehouse%20project/backend/personnel/fleet_lifecycle_services.py)
- خط ۶۵۶ تا ۶۶۲: تغییر نشانی اعلان‌های مربوط به بازگشایی، رد، عودت و پیش‌نویس از `/app/finance/employee-fleet` به `/app/finance/employee-new-vehicle`.

#### [MODIFY] [notification-center.component.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/notification-center/notification-center.component.ts)
- خط ۲۸۹ و ۳۰۳: هدایت اعلان‌های ناوگان برای راننده/کارمند و پرونده‌های نیازمند اصلاح به صفحهٔ `/app/finance/employee-new-vehicle`.

---

### مؤلفه ۳: امنیت ممیزی و دفاع در عمق بک‌اند (`backend`)

#### [MODIFY] [personnel/serializers.py](file:///e:/warehouse%20project/backend/personnel/serializers.py)
- خطوط ۱۶۹۳ تا ۱۷۱۲ در `WorkflowAuditLogSerializer`:
  - اضافه کردن `driver_name`، `plate_number` و `vehicle_type` به `SNAPSHOT_SUMMARY_KEYS`.
  - فیلتر کردن فیلد حساس مالی نرخ خودرو (`FLEET_RATE_FIELDS = ('default_service_rate',)` از `fleet_lifecycle_services`) برای کاربران غیرمالی در `diff`، `old_diff` و `snapshot`.

#### [MODIFY] [personnel/models.py](file:///e:/warehouse%20project/backend/personnel/models.py)
- اضافه کردن متد دفاع در عمق `clean()` در مدل `VehicleTripLog`.

#### [MODIFY] [personnel/fleet_excel_engine.py](file:///e:/warehouse%20project/backend/personnel/fleet_excel_engine.py)
- خطوط ۳۰۷ تا ۳۱۰: ارتقا به متد دفاعی `assert_vehicle_trip_allowed` جهت یکپارچگی خطاها و جلوگیری از ثبت داده نامعتبر.

---

### مؤلفه ۴: همگام‌سازی اسناد تسک‌ها و جدول تصمیم‌ها

#### [MODIFY] [task_fleet_lifecycle.md](file:///e:/warehouse%20project/Documents/Fleet_Registration_To_Approval_Workflow/task_fleet_lifecycle.md)
- علامت‌گذاری چک‌باکس‌های فازهای ۰ تا ۳ (خطوط ۷ تا ۴۸) از `[ ]` به `[x]` متناسب با وضعیت پیاده‌سازی‌شده در سند اصلی.
- درج تسک‌های اصلاحی جدید (۱۰.۷: رفع خطاهای بیلد، ۱۰.۸: یکپارچه‌سازی اعلان‌ها، ۱۰.۹: SoD ممیزی).

#### [MODIFY] [implementation_plan_fleet_lifecycle.md](file:///e:/warehouse%20project/Documents/Fleet_Registration_To_Approval_Workflow/implementation_plan_fleet_lifecycle.md)
- به‌روزرسانی بخش ۶.۲ و تثبیت تصمیم‌های ت-۱ تا ت-۴ بر اساس تایید کاربر.

---

### مؤلفه ۵: اجرای پروتکل انتشار سرور عملیاتی (تسک ۱۰.۶ و بخش ۵.۳)

پس از اعمال و تثبیت کدهای فوق و تأیید نهایی، مراحل پنج‌گانه انتشار عملیاتی اجرا خواهد شد:
1. پشتیبان‌گیری از دیتابیس عملیاتی (`create_database_backup()`).
2. اعمال مایگریشن‌ها با `python manage.py migrate`.
3. بیلد بدون قطعی فرانت‌اند (`npx ng build --delete-output-path=false && node tools/patch-ngsw-530.js`).
4. راه‌اندازی مجدد Daphne روی پورت ۸۰۰۰.
5. اجرای تست سلامت و پاسخ ۲۰۰.

---

## ۴. برنامه آزمون و راستی‌آزمایی (Verification Plan)

### آزمون‌های خودکار (Automated Tests)
1. **بیلد فرانت‌اند:** اجرای کامل `npx ng build --no-progress` در `frontend` و احراز خروج با کد صفر.
2. **تست‌های مرورگر و DOM فرانت‌اند (Type 1 Invariant):**
   ```powershell
   npx vitest run src/app/components/finance/accountant/accountant-fleet/
   npx vitest run src/app/components/finance/manager/manager-fleet/
   npx vitest run src/app/components/finance/supervisor/supervisor-fleet/
   npx vitest run src/app/components/finance/employee/employee-new-vehicle/
   ```
3. **تست‌های بک‌اند و چرخه حیات ناوگان:**
   ```powershell
   $env:PYTHONIOENCODING="utf-8"; .\backend\venv\Scripts\python.exe backend\manage.py test personnel.tests_vehicle_cycle --noinput
   ```
4. **تست‌های ایزولاسیون آیکون‌ها:**
   ```powershell
   .\backend\venv\Scripts\python.exe scripts/e2e/guardian_52_icon_registry.py
   ```

</div>
