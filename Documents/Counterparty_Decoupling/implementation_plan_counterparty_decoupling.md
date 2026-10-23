# طرح جامع مستقل‌سازی و ارتقای ماژول طرف‌حساب‌های مالی (Decoupling Counterparties Architecture)

<div dir="rtl" align="right">

> [!IMPORTANT]
> این سند بر اساس خروجی مصاحبه تعاملی `/grill-me` و تصمیم مشترک برای اصلاح معماری داده‌ها تنظیم شده است. طبق توافق:
> ۱. طرف‌حساب‌ها به عنوان یک داده پایه مالی مستقل (Master Data) تعریف می‌شوند و وابستگی مستقیم دیتابیسی آنها به بخش‌های پروژه حذف می‌گردد.
> ۲. صفحه و آیتم منوی مستقل «🤝 مدیریت طرف‌حساب‌های مالی» در سایدبار ماژول مالی ایجاد می‌شود.
> ۳. صفحه پروژه‌ها و بخش‌ها منحصراً به چارت سازمانی، پروژه‌ها، بخش‌ها و ماتریس انتساب نقش‌ها اختصاص می‌یابد.

---

## ۱. اهداف و دلایل فنی تغییرات (Architecture & Rationale)

1. **تفکیک مسئولیت‌ها (Separation of Concerns):**
   - «پروژه‌ها و بخش‌ها» نماینده مراکز هزینه و چارت سلسله‌مراتبی سازمان هستند.
   - «طرف‌حساب‌ها» اشخاص حقیقی یا حقوقی مستقل هستند که ممکن است با چند پروژه و بخش قرارداد داشته باشند.
2. **رفع افزونگی و داده‌های تکراری (Eliminating Data Redundancy):**
   - با حذف وابستگی مستقیم طرف‌حساب به بخش، دیگر نیازی به تعریف چندباره یک راننده، تعمیرگاه یا پمپ بنزین برای بخش‌های مختلف نیست.
3. **انتقال پیوند به فاکتورهای هزینه (Transaction-Level Association):**
   - ارتباط هر طرف‌حساب با پروژه و بخش، صرفاً در لحظه صدور فاکتور هزینه (`ExpenseInvoice`) و بر اساس سرفصل تراکنش تعیین می‌شود.

---

## ۲. خلاصه تغییرات به تفکیک لایه‌ها

| ردیف | لایه | فایل‌های هدف | شرح تغییرات |
| :---: | :---: | :--- | :--- |
| **۱** | دیتابیس و مدل | `backend/personnel/models.py` | حذف فیلد `section` از مدل `Counterparty` و تبدیل آن به یک رکورد سراسری Master Data. |
| **۲** | مایگریشن جنگو | `backend/personnel/migrations/0004_...` | ایجاد و اجرای مایگریشن پیش‌رونده استاندارد جهت حذف فیلد بدون آسیب به سایر جداول. |
| **۳** | سریالایزر و کوئری‌ست | `personnel/serializers.py`<br>`personnel/views.py` | حذف فیلدهای بخش از `CounterpartySerializer` و بهینه‌سازی `CounterpartyViewSet` (حذف کوئری‌های جوین بخش). |
| **۴** | موتور اکسل | `personnel/org_excel_engine.py` | اصلاح قالب اکسل، ورودی و خروجی طرف‌حساب‌ها بدون ستون‌های پروژه و بخش. |
| **۵** | کامپوننت فرانت جدید | `frontend/src/app/components/finance/counterparties/` | ساخت کامپوننت مستقل و کامل مدیریت طرف‌حساب‌ها با فرم، جستجو، فیلتر نوع، اعتبارسنجی شبا و اکسل. |
| **۶** | پالایش صفحه پروژه‌ها | `projects-and-sections.ts`<br>`projects-and-sections.html` | حذف کامل تب چهارم (طرف‌حساب‌ها) و متغیرها/متدهای آن جهت تمرکز ۱۰۰٪ روی چارت سازمانی. |
| **۷** | روتینگ، منو و گارد | `accounting.routes.ts`<br>`nav-items.ts`<br>`auth.guard.ts` | اضافه کردن روت `counterparties`، آیتم منوی مستقل و مجوزهای امنیتی RBAC. |

---

## ۳. تغییرات تفصیلی کدها (Proposed Changes)

### الف) بک‌اند (Backend)

#### [MODIFY] `backend/personnel/models.py`
- حذف فیلد `section` از مدل `Counterparty`.

#### [NEW MIGRATION] `backend/personnel/migrations/0004_remove_counterparty_section.py`
- تولید خودکار مایگریشن پیش‌رونده جنگو از طریق `makemigrations` و اعمال با `migrate`.

#### [MODIFY] `backend/personnel/serializers.py`
- حذف `section`, `section_name`, `project_name` از فیلدهای `CounterpartySerializer`.

#### [MODIFY] `backend/personnel/views.py`
- پاکسازی `select_related('section', 'section__project')` و فیلتر `section_id` در `CounterpartyViewSet`.

#### [MODIFY] `backend/personnel/org_excel_engine.py`
- به‌روزرسانی توابع اکسل طرف‌حساب‌ها (`export_counterparties_excel`, `import_counterparties_from_excel`, `download_counterparties_template`).

---

### ب) فرانت‌اند (Frontend)

#### [NEW] `frontend/src/app/components/finance/counterparties/counterparties.ts`
- کامپوننت مستقل و کامل مدیریت طرف‌حساب‌ها شامل:
  - فرم ثبت و ویرایش هوشمند با اسکرول نرم
  - دراپ‌داون هوشمند بانک‌های ایرانی و اعتبارسنجی خودکار شبا / شماره حساب
  - فیلتر نوع طرف‌حساب (راننده، تعمیرگاه، پمپ بنزین، پیمانکار، سایر)
  - جستجوی سریع درجا در نام، تلفن، کد ملی، شبا، شماره حساب و کد تفصیلی
  - سوییچ تغییر وضعیت فعال/غیرفعال بلادرنگ
  - پشتیبانی از ایمپورت پیش‌نمایش‌دار اکسل (`dry_run`) و اکسپورت استاندارد ۲ سطری
  - شنود رویدادهای زنده وب‌سوکت برای همگام‌سازی بین تب‌ها
  - مدیریت کش آفلاین SWR

#### [NEW] `frontend/src/app/components/finance/counterparties/counterparties.html`
- رابط کاربری مدرن، ارگونومیک، واکنش‌گرا و سازگار با استانداردهای زیبایی‌شناسی.

#### [NEW] `frontend/src/app/components/finance/counterparties/counterparties.css`
- استایل‌های تکمیلی.

#### [MODIFY] `frontend/src/app/modules/accounting/accounting.routes.ts`
- ثبت روت `{ path: 'counterparties', component: CounterpartiesComponent, data: { reuse: true } }`.

#### [MODIFY] `frontend/src/app/modules/accounting/nav-items.ts`
- افزودن آیتم:
  `{ id: 'counterparties', label: '🤝 مدیریت طرف‌حساب‌های مالی', icon: 'users', permission: 'view_sys_payroll', module: 'accounting', isAccounting: true }`.

#### [MODIFY] `frontend/src/app/core/auth/auth.guard.ts`
- ثبت مجوزهای روت `counterparties` در `ROUTE_PERMISSIONS`.

#### [MODIFY] `frontend/src/app/components/organization/projects-and-sections/`
- حذف ساب‌تب `counterparties`، فرم و جدول آن و پاکسازی متدهای مربوطه از کامپوننت.

---

## ۴. برنامه راستی‌آزمایی و آزمون‌ها (Verification Plan)

### ۱. آزمون‌های خودکار بک‌اند:
- اجرای دستور `python manage.py check` برای اطمینان از سلامت کامل اتصالات و تنظیمات.
- اجرای تست‌های خودکار با `python manage.py test personnel.test_section_guardian`.

### ۲. آزمون کامپایل فرانت‌اند:
- اجرای `npx ng build --configuration=development` برای تضمین عدم وجود هرگونه خطای تایپ‌اسکریپت یا تمپلیت.

### ۳. بررسی عملکردی در مرورگر:
- بررسی باز شدن روت `/app/finance/counterparties` و نمایش صحیح منوی جدید در سایدبار مالی.
- بررسی ثبت یک طرف‌حساب جدید، اعتبارسنجی شبا و تغییر وضعیت فعال/غیرفعال.
- بررسی صفحه پروژه‌ها و بخش‌ها و اطمینان از تمرکز کامل آن بر روی ۳ تب اختصاصی ساختار سازمانی.

</div>
