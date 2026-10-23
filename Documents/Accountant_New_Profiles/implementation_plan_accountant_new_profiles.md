<div dir="rtl" align="right">

# طرح جامع پیاده‌سازی کارتابل «تایید پرسنل و ناوگان» در منوی حسابدار (Accountant New Profiles Hub)

## خلاصه طرح (Executive Summary)
در چرخه ۳ مرحله‌ای تاییدات سازمانی (کارمند ◀ سرپرست کارگاه ◀ حسابدار مالی ◀ مدیر ارشد)، کارمند مشخصات اولیه را ثبت می‌کند و سرپرست کارگاه حضور و کارکرد فرد را تایید می‌نماید. پرونده پس از تایید سرپرست در وضعیت «در انتظار تایید حسابدار» (`pending_accountant`) قرار می‌گیرد (نمونه عینی: پرونده ثبت‌شده **مرتضی منصوریان** با شناسه ۹۳۸ و کد ملی ۰۰۷۵۳۰۱۹۸۹).  
در حال حاضر در منوی حسابدار گزینه‌ای برای مشاهده این پرونده‌ها و ورود ارقام مالی وجود ندارد. طبق تصمیم اتخاذ شده (رویکرد اول)، یک بخش اختصاصی جدید تحت عنوان **«👥 تایید پرسنل و ناوگان»** به عنوان **آیتم هفتم منوی حسابدار** ایجاد می‌شود که ظاهر آن کاملاً با سایر صفحات حسابدار هماهنگ بوده و با **بازاستفاده حداکثری (Reuse)** از کدهای مودال و موتور محاسباتی حقوق صفحه [`personnel-profiles`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/personnel-profiles/personnel-profiles.ts)، امکان ویرایش کامل مدارک، تعیین گروه شغلی، سنوات، مزد مبنا، حق مسکن، بن کارگری، شماره بیمه، مالیات و حساب بانکی را پیش از تایید مالی فراهم می‌آورد.

---

## الزامات کلیدی کاربر و نکات مهم معماری

> [!IMPORTANT]
> **۱. بازاستفاده حداکثری و عدم بازنویسی کد از صفر (DRY Principle):**  
> تمامی فرمول‌های محاسباتی مزد بر اساس جدول ۲۰ گانه قانون کار، سابقه سنواتی، اعتبارسنجی الگوریتم Mod 11 کد ملی، الگوریتم ISO 7064 Mod 97 شبا، کومبوباکس بانک‌ها و مودال ۴ تبِ احکام مالی، مستقیماً از کامپوننت [`personnel-profiles`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/personnel-profiles/personnel-profiles.ts) الگوبرداری و استفاده می‌شوند و هیچ فرمول جدیدی اختراع نخواهد شد.

> [!IMPORTANT]
> **۲. اختیارات ویرایش و تکمیل مدارک مالی توسط حسابدار:**  
> حسابدار صرفاً یک تاییدکننده (Approve/Reject) نیست؛ بلکه پرونده‌های در انتظار تایید مالی (`pending_accountant`) نیازمند **تکمیل ارقام مالی و قانونی** هستند. حسابدار باید بتواند:
> - گروه شغلی و مزد مبنای کارگری را تعیین/اصلاح کند.
> - شماره بیمه تامین اجتماعی و نوع استخدام دارایی (مالیات) را ثبت کند.
> - اطلاعات شماره حساب و شبای بانکی را ویرایش و با دکمه `⚡` شبا را مجدداً بسازد.
> - نرخ پایه سرویس ناوگان را در صورت لزوم تدقیق کند.
> - پس از اطمینان کامل، دکمه **«💳 تایید مالی (ارسال به مدیر)»** را برای ارجاع به مرحله سوم ثبت کند.

---

## تفکیک فازهای اجرایی (Phase-by-Phase Plan)

### فاز ۱: زیرساخت سایدبار و ناوبری ماژول حسابداری (Navigation & Routing Layer)
1. **ویرایش [`nav-items.ts`](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/nav-items.ts):**
   - افزودن آیتم هفتم به آرایه `ACCOUNTANT_NAV_ITEMS`:
     ```typescript
     { id: 'accountant-new-profiles', label: '👥 تایید پرسنل و ناوگان', icon: 'users', permission: 'view_sys_payroll', module: 'accounting', isAccounting: true }
     ```
2. **ویرایش [`accounting.routes.ts`](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/accounting.routes.ts):**
   - افزودن روت اختصاصی `accountant-new-profiles`.
3. **ویرایش [`app.routes.ts`](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts):**
   - افزودن ریدایرکت مستقیم ریشه `accountant-new-profiles`.
4. **ویرایش [`layout.ts`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts):**
   - اضافه نمودن `'accountant-new-profiles'` به آرایه تب‌های مجاز مالی در متد `switchTab`.

### فاز ۲: ساخت شل و هدر مرکز فرماندهی کامپوننت حسابدار (Component Shell & Layout)
1. ایجاد فایل‌های کامپوننت در `src/app/components/finance/accountant/accountant-new-profiles/`.
2. طراحی هدر یکپارچه چسبان (Unified Sticky Command Center Header) با دراپ‌داون بخش و زیرتب‌های کپسولی محصور.
3. شمارنده‌های زنده و دقیق عددی برای هر تب (`pending_accountant`).

### فاز ۳: پیاده‌سازی کارت‌ها، جداول و مودال جامع ویرایش مدارک مالی (Financial Wage & Documents Engine)
1. رندر کارت‌ها و جدول پرسنل و ناوگان با دکمه‌های اقدام حسابدار.
2. مودال جامع ۴ تبِ تکمیل مدارک و احکام مالی (هویتی، مزد و مزایا، بیمه و مالیات، اطلاعات بانکی و شبا).
3. ذخیره‌سازی هوشمند تغییرات در دیتابیس با بازخورد توست.

### فاز ۴: پیاده‌سازی اکشن‌های چرخه ۳ مرحله‌ای مالی (Approval, Revision & Rejection Workflow)
1. تایید مالی پرسنل (`approvePersonnelFinance`) و ارسال به کارتابل مدیر (`pending_manager`).
2. ارجاع پرونده به بازنگری (`revision_required`) با ذکر دلیل عودت.
3. رد قطعی پرونده (`rejected`) با ذکر علت مستند.
4. تاییدات ناوگان و خودروها (`approveVehicleFinance`).
5. رسیدگی به درخواست‌های تغییرات معلق (`Change Requests`) با مودال Diff Viewer.

### فاز ۵: تست‌های جامع، بیلد پروژه و آزمون عملکردی مرورگر (Testing & Build Verification)
1. نوشتن تست جامع کامپوننت [`accountant-new-profiles.spec.ts`](file:///e:/warehouse%20project/frontend/src/app/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.spec.ts).
2. راستی‌آزمایی با پرونده عینی «مرتضی منصوریان» (شناسه ۹۳۸).
3. اجرای تست‌های Vitest فرانت‌اند و پاس شدن ۱۰۰٪ آزمون‌ها.
4. اجرای بیلد نهایی پروژه `npm run build` بدون هیچ خطای کامپایل.

</div>
