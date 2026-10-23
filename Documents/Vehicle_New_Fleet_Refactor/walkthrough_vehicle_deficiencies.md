<div dir="rtl" align="right">

# گزارش ممیزی و مستندسازی دقیق تغییرات طرح تکمیلی نواقص ناوگان (Vehicle Fleet Deficiencies Implementation Walkthrough)

> [!NOTE]
> این سند حاوی آدرس دقیق خط به خط فایل‌ها و تغییرات اعمال‌شده در بک‌اند، فرانت‌اند و تست‌ها در راستای اجرای مو به موی سند `implementation_plan_vehicle_deficiencies.md` می‌باشد. کلیه تغییرات با تست‌های واحد خودکار و بیلد تایپ‌اسکریپت اعتبارسنجی شده‌اند.

---

## ۱. جدول تطبیقی محل دقیق تغییرات بر اساس نواقص ۹ گانه

| ردیف | شرح نقص برطرف‌شده | فایل‌های تغییریافته | محدوده خطوط | شرح فنی تغییر اعمال‌شده |
| :---: | :--- | :--- | :---: | :--- |
| **۱** | **تفکیک راننده و مالک خودرو** | `backend/personnel/models.py`<br>`backend/personnel/migrations/0010_vehicledriverprofile_is_driver_owner_and_more.py`<br>`backend/personnel/serializers.py`<br>`backend/personnel/views.py`<br>`frontend/src/app/core/models/personnel.model.ts`<br>`frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts`<br>`frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | Models: خطوط ۸۵۰-۸۵۵<br>Serializers: خطوط ۳۹۲-۴۰۸<br>Views: خطوط ۱۰۸۰-۱۲۰۵<br>Model TS: خطوط ۱۲۶-۱۳۰<br>Component TS: خطوط ۹۱-۹۴، ۵۴۲-۵۵۰، ۷۷۱-۸۰۰، ۸۲۹-۸۵۶<br>HTML: خطوط ۷۰۸-۷۶۶ | افزودن فیلدهای `is_driver_owner`، `owner_name`، `owner_national_code`، `owner_phone` به مدل دیتابیس، سریالایزر با الگوریتم Mod 11، قالب و ایمپورت اکسل ۱۴ ستونه، چک‌باکس و فرم مشخصات مالک در مودال ثبت |
| **۲** | **حالت فقط‌خواندنی (`isReadOnlyMode`) برای رکوردهای در جریان** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts`<br>`frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | TS: خطوط ۵۲۸-۵۴۰، ۸۰۶-۸۰۹، ۹۳۸-۹۴۱<br>HTML: خطوط ۳۲۶-۳۳۵، ۴۳۰-۴۳۵، ۵۷۴-۷۷۵ | تعریف گتر `isReadOnlyMode`، متد `isReadOnlyVehicle(v)`، نمایش دکمه «👁️ مشاهده»، غیرفعال‌سازی تمامی ورودی‌های فرم (`[disabled]="isReadOnlyMode"`)، و تغییر فوتر مودال به تک دکمه «بستن پرونده» |
| **۳** | **رفتار دوحالته (Toggle) تب‌های وضعیت** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts` | TS: خطوط ۳۶۶-۳۷۶ | در متد `setStatusFilter` در صورت کلیک مجدد روی تب فعال، وضعیت به `'all'` بازمی‌گردد و کوئری‌پارامتر URL حذف می‌شود |
| **۴** | **استاندارد Bottom Sheet موبایل و خروج با Backdrop Click** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | HTML: خطوط ۵۱۳-۵۱۶ (مودال ثبت)، خطوط ۸۰۹-۸۱۵ (مودال Diff) | کانتینر مودال‌ها با کلاس‌های `items-end sm:items-center p-0 sm:p-4` و رویداد کلیک پس‌زمینه `(click)="close..."`، و کادر داخلی با `(click)="$event.stopPropagation()"` و `rounded-t-3xl sm:rounded-3xl` |
| **۵** | **مودال دوطرفه مقایسه تغییرات (Diff Viewer)** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts`<br>`frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | TS: خطوط ۱۶۰-۱۸۰، ۹۴۳-۹۸۲<br>HTML: خطوط ۸۳۳-۸۵۵ | دیکشنری `fieldLabelsMap` جهت ترجمه نام فارسی فیلدها، متدهای نمایش مقدار قبلی (`line-through`) و مقدار پیشنهادی (بج سبز) با فلش `◀` |
| **۶** | **عدم حذف تب‌های عودت و رد شده در صفر و تفکیک دکمه اصلاح** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | HTML: خطوط ۶۰-۹۶، ۳۴۴-۳۵۱، ۴۳۹-۴۴۵، ۸۰۱-۸۰۵ | حذف `*ngIf` از تب‌های نیازمند اصلاح و رد شده، ایجاد دکمه نارنجی «↩️ اصلاح» در سطر جدول و کارت موبایل، و تغییر پویای عنوان دکمه ثبت به «اصلاح و ارسال مجدد به سرپرست» |
| **۷** | **گروه‌بندی کشویی انواع خودرو با تجهیزات انبار** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts`<br>`frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | TS: خطوط ۱۱۵-۱۳۹<br>HTML: خطوط ۶۸۰-۶۸۶ | ساختار ۳ گانه `vehicleGroups` (سبک و نیمه‌باری، سنگین و تجاری، ماشین‌آلات و تجهیزات انبار شامل لیفتراک و سایر) و رندر با `<optgroup>` |
| **۸** | **انطباق هوشمند کد ملی راننده با پرسنل شرکت** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts`<br>`frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | TS: خطوط ۷۳۵-۷۶۸<br>HTML: خطوط ۶۶۸-۶۷۰ | استعلام خودکار کد ملی ۱۰ رقمی راننده در وب‌سرویس پرسنل، پر کردن خودکار نام، شماره تماس و شماره شبا و نمایش بج اطلاع‌رسانی |
| **۹** | **استانداردسازی و تقارن دکمه ثبت خودرو در هدر** | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html` | HTML: خطوط ۱۴۵-۱۵۴ | تبدیل دکمه عریض به دکمه مربعی آیکونی شاخص ایندیگو `w-9 h-9 rounded-xl` متقارن با دکمه‌های اکسل و سینک |

---

## ۲. گزارش نتایج آزمون‌های راستی‌آزمایی (Verification Test Results)

### الف. آزمون‌های بک‌اند (Django Test Runner)
```bash
.\venv\Scripts\python.exe manage.py test personnel.tests_vehicle_cycle
```
- **نتیجه:** ۷ آزمون از ۷ آزمون با موفقیت پاس شد (`Ran 7 tests in 0.374s - OK`).
- **پوشش آزمون‌ها:**
  1. `test_complete_vehicle_approval_lifecycle`
  2. `test_prevent_demotion_bug_on_change_request_approval`
  3. `test_prevent_cross_section_access_bola`
  4. `test_soft_delete_for_vehicles_with_trip_logs`
  5. `test_excel_download_template`
  6. `test_excel_import_lifecycle_vehicles`
  7. `test_vehicle_owner_fields_and_validation` (آزمون اعتبارسنجی Mod 11 فیلدهای مالک)

### ب. آزمون‌های فرانت‌اند (Vitest Component & DOM Tests)
```bash
npx vitest run src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.spec.ts src/app/components/finance/employee/employee-new-personnel/employee-new-personnel.spec.ts
```
- **نتیجه:** ۹۹ آزمون از ۹۹ آزمون سبز شدند (`Tests: 99 passed (99)`).
- **پوشش ناوگان:** ۳۱ تست جامع شامل تاگل تب‌ها، فیلدهای مالک، کدملی راننده و مالک، حالت فقط‌خواندنی، مودال مقایسه تغییرات و گروه‌بندی خودروها.

### ج. وارسی استاتیک تایپ‌اسکریپت
```bash
npx tsc --noEmit
```
- **نتیجه:** خروج با کد ۰ و بدون هیچ‌گونه خطای کامپایل.

</div>
