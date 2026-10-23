<div dir="rtl" align="right">

# 🏗️ طرح جامع فازبندی‌شده اصلاح فرانت‌اند چرخه انبارگردانی (Detailed Phased Plan)

این طرح برای رفع ۱۱ ایراد شناسایی‌شده در ۵ فاز متوالی و مشروط (Gated Phases) تدوین شده است. طبق الزام، تا زمان قبولی و راستی‌آزمایی کامل هر فاز، ورود به فاز بعدی ممنوع خواهد بود.

---

## 🗺️ نمای کلی فازهای اجرایی

| فاز | عنوان فاز | ماژول‌های هدف | خروجی کلیدی | گیت راستی‌آزمایی (Gate Condition) |
| :-: | :--- | :--- | :--- | :--- |
| **۱** | **مدل‌ها و کارتابل سرپرست** | `count-task.model`, `api`, `supervisor` | رفع فیلتر سرور، رفع پرمیشن رد، افزودن رد گروهی | تست بک‌اند + نمایش اقلام `MANAGER_REJECTED` |
| **۲** | **کارتابل بررسی مدیر** | `manager-review` | رد گروهی مدیر با علت، اصلاح `isMatched` | اجرای `bulkManagerReject` + تست اعتبارسنجی مقادیر |
| **۳** | **میزکار انبارگردان و سینک** | `counter-dashboard` | رفع خطای ۴۰۳، اصلاح پیش‌نویس بازشماری، پیام‌های هوشمند | ذخیره لوکیشن بدون ارور ۴۰۳ + تغییر وضعیت چیپ |
| **۴** | **تخصیص و پیگیری شمارش** | `dispatch`, `count-tracking` | اصلاح لاجیک بازشماری ارجاع، اصلاح مغایرت شمارش کور | بیلد موفق + تست صفحه پیگیری در شمارش کور |
| **۵** | **آزمون جامع یکپارچه** | کل فرانت‌اند و بک‌اند | اجرای چرخه کامل End-to-End | تست سوئیت ۱۰۰٪ پاس + بیلد کامل بدون هشدار |

---

## 📌 فاز ۱: مدل‌های پایه، سرویس API و کارتابل سرپرست شمارش

### 🎯 اهداف فاز ۱:
1. افزودن فیلدهای `skip_supervisor` و `new_location` به اینترفیس `CountTask`.
2. افزودن متد `bulkReject` در `CountTaskApiService`.
3. اصلاح پارامترهای فراخوانی `loadTasks()` در کارتابل سرپرست جهت بارگذاری هم‌زمان اقلام `COUNTED` و `MANAGER_REJECTED`.
4. حذف پرمیشن اشتباه `*appHasPermission="'view_sys_recounts'"` از دکمه رد در تمپلیت سرپرست.
5. پیاده‌سازی دکمه و دیالوگ رد گروهی (`bulkReject`) در کارتابل سرپرست.

### 📁 فایل‌های تحت تغییر:
* #### [MODIFY] [count-task.model.ts](file:///E:/warehouse%20project/frontend/src/app/core/models/count-task.model.ts)
  - افزودن `skip_supervisor?: boolean;`
  - افزودن `new_location?: string;`
* #### [MODIFY] [count-task-api.service.ts](file:///E:/warehouse%20project/frontend/src/app/core/api/count-task-api.service.ts)
  - افزودن متد `bulkReject(taskIds: number[], note: string): Observable<{ message: string }>`
* #### [MODIFY] [supervisor-dashboard.ts](file:///E:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts)
  - در متد `loadTasks()`: تغییر `params` از `{ as_role: 'supervisor', status: 'COUNTED' }` به `{ as_role: 'supervisor' }` تا اقلام ردشده توسط مدیر هم دریافت شوند.
  - پیاده‌سازی متدهای `openBulkRejectDialog()`, `cancelBulkReject()`, `confirmBulkReject()`.
* #### [MODIFY] [supervisor-dashboard.html](file:///E:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html)
  - حذف `*appHasPermission="'view_sys_recounts'"` از دکمه رد تکی.
  - افزودن دکمه «رد گروهی (بازشماری)» در نوار شناور پایین (`Sticky Bar`).
  - افزودن مودال ثبت دلیل رد گروهی با ورودی متنی اجباری.

### 🧪 گیت راستی‌آزمایی فاز ۱ (Gate 1 Verification):
- [ ] اجرای تست‌های خودکار بک‌اند: `.\venv\Scripts\python.exe manage.py test inventory.tests` (باید ۷ تست پاس شوند).
- [ ] اجرای بیلد آزمایشی فرانت‌اند: `npm run build --prefix "frontend"`.
- [ ] تست دستی بازگشت کالا از مدیر به سرپرست و نمایش بج `رد شده توسط مدیر`.

---

## 📌 فاز ۲: کارتابل بررسی نهایی مدیر (Manager Review Dashboard)

### 🎯 اهداف فاز ۲:
1. پیاده‌سازی قابلیت رد گروهی اقلام توسط مدیر (`bulkManagerReject`) به همراه ثبت دستورات بازشماری.
2. ایمن‌سازی متد `isMatched()` برای جلوگیری از رفتارهای غیرمنتظره در مقادیر اعشاری، رشته‌ای و شمارش کور.

### 📁 فایل‌های تحت تغییر:
* #### [MODIFY] [manager-review.ts](file:///E:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts)
  - پیاده‌سازی متغیرها و متدهای: `showBulkRejectDialog`, `bulkRejectNote`, `openBulkRejectDialog()`, `cancelBulkReject()`, `confirmBulkReject()`.
  - بازنویسی متد `isMatched(task)` به صورت مقایسه ایمن عددی با بررسی نال و شرایط شمارش کور.
* #### [MODIFY] [manager-review.html](file:///E:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.html)
  - افزودن دکمه «رد گروهی و بازشماری» در نوار عملیات گروهی پایین صفحه.
  - افزودن مودال رد گروهی با فیلد یادداشت اجباری.

### 🧪 گیت راستی‌آزمایی فاز ۲ (Gate 2 Verification):
- [ ] اجرای بیلد فرانت‌اند و اطمینان از عدم وجود خطای تایپ‌اسکریپت.
- [ ] تست انتخاب گروهی اقلام و اجرای موفقیت‌آمیز رد گروهی با ثبت علت.
- [ ] تست صحت عملکرد بج برابری موجودی در کارت‌های کالا.

---

## 📌 فاز ۳: میزکار انبارگردان میدانی و همگام‌سازی (Counter Dashboard & Sync)

### 🎯 اهداف فاز ۳:
1. تصحیح ارتقای وضعیت رکوردهای بازشماری (`SUPERVISOR_REJECTED` / `MANAGER_REJECTED`) به `INITIAL_COUNT` در زمان ذخیره مقدار جدید.
2. رفع خطای ۴۰۳ در متد `saveExtraEditedFields` از طریق ذخیره `new_location` و یادداشت‌ها روی شیء تسک شمارش.
3. داینامیک‌سازی پیام‌های ارسالی بر اساس وضعیت `skip_supervisor`.

### 📁 فایل‌های تحت تغییر:
* #### [MODIFY] [counter-dashboard.ts](file:///E:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
  - اصلاح لاجیک `saveDraft()`: در صورتی که مقدار عددی وارد شود، وضعیت تسک‌های بازشماری به `INITIAL_COUNT` (آماده ارسال) تغییر کند.
  - اصلاح `saveExtraEditedFields()`: جلوگیری از فراخوانی غیرمجاز `PATCH /api/inventory/items/{id}/` و ثبت در `task.new_location`.
  - اصلاح متدهای `submitDirectlyToSupervisor()` و `submitAll()` جهت نمایش هوشمند پیام «ارسال مستقیم به مدیر» در حالت پرش از سرپرست.

### 🧪 گیت راستی‌آزمایی فاز ۳ (Gate 3 Verification):
- [ ] اجرای بیلد فرانت‌اند `npm run build`.
- [ ] تست ثبت مقدار روی تسک ردشده و مشاهده تغییر وضعیت چیپ به «آماده ارسال».
- [ ] ثبت موقعیت فیزیکی جدید کالا و تایید عدم صدور خطای ۴۰۳ در کنسول و صف آفلاین.

---

## 📌 فاز ۴: ارجاع و پیگیری لحظه‌ای شمارش (Dispatch & Count Tracking)

### 🎯 اهداف فاز ۴:
1. اصلاح لاجیک دکمه بازشماری در جدول ارجاع کالا (`dispatch.ts`).
2. ایمن‌سازی محاسبات مغایرت در پیگیری شمارش (`count-tracking.ts`) در حالت فعال بودن شمارش کور.

### 📁 فایل‌های تحت تغییر:
* #### [MODIFY] [dispatch.ts](file:///E:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts)
  - اصلاح متد `requestRecount()` جهت ارسال صحیح درخواست بازشماری به سرور.
* #### [MODIFY] [count-tracking.ts](file:///E:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
  - اصلاح محاسبه `_discrepancy` به گونه‌ای که در صورت نبود موجودی دفتری (شمارش کور)، با نال به درستی رفتار کند و دچار ارور `NaN` نشود.

### 🧪 گیت راستی‌آزمایی فاز ۴ (Gate 4 Verification):
- [ ] بیلد فرانت‌اند بدون خطا.
- [ ] بررسی صفحه پیگیری شمارش با فعال و غیرفعال بودن شمارش کور.

---

## 📌 فاز ۵: آزمون جامع یکپارچه و راستی‌آزمایی نهایی (End-to-End Verification)

### 🎯 اهداف فاز ۵:
1. اجرای کامل چرخه انبارگردانی از ارجاع $\rightarrow$ شمارش میدانی $\rightarrow$ تایید/رد سرپرست $\rightarrow$ تایید/رد مدیر.
2. اجرای تست‌های کامل رگرسیون بک‌اند و بیلد نهایی فرانت‌اند.
3. ثبت گزارش عملکرد نهایی در مستندات پروژه (`walkthrough.md`).

---

> [!IMPORTANT]
> **قانون تایید کاربر:** هیچ کدی تغییر نخواهد کرد تا زمانی که شما این فازبندی را تایید نمایید. با ارسال کلمه **«تایید»** یا **«شروع فاز ۱»** اجرای گام اول آغاز خواهد شد.

</div>
