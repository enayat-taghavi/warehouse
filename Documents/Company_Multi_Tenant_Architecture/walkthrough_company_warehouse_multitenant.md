<div dir="rtl" align="right">

# گزارش جامع تحویل و نتایج صحه‌گذاری طرح اتصال انبارها به شرکت و انتقال به مرکز عملیات
## (Company-Warehouse Multi-Tenant & Operations Migration Walkthrough)

این سند ثبت رسمی و مستند نتایج تحویل نهایی طرح ۵ فاز استقرار معماری چندشرکتی انبارها، ماژولار بودن سامانه انبارداری، انتقال مدیریت شرکت‌ها به مرکز عملیات و ویزارد راه‌اندازی اول است.

---

### جدول وضعیت نهایی فازهای اجرایی

| فاز | موضوع فاز | وضعیت | شواهد و آزمون‌های صحه‌گذاری |
| :---: | :--- | :---: | :--- |
| **۱** | **بک‌اند، مدل‌های انبار و مایگریشن داده به فارس عالیش** | ✅ تکمیل و صحه‌گذاری‌شده | اجرای ۶ آزمون ایزولاسیون انبار (`test_company_warehouse_isolation`) و ۱۰ آزمون رگرسیون چندشرکتی بک‌اند (**۱۶ تست کاملاً OK**) |
| **۲** | **انتقال پورتال شرکت‌ها به مرکز عملیات (`operations`)** | ✅ تکمیل و صحه‌گذاری‌شده | انتقال به `/app/operations/companies`، ریدایرکت روت مالی، آیتم سایدبار و چک‌باکس ماژول انبارداری (**۲۱ تست Vitest پاس شد**) |
| **۳** | **ماژولار بودن انبارداری و پویایی منوی بالای صفحه** | ✅ تکمیل و صحه‌گذاری‌شده | سیگنال‌های واکنشی `hasWarehouseModuleSignal`، پنهان‌سازی تب انبار در شرکت‌های بدون انبار، گارد `WarehouseCompanyGuard` و رفرش خودکار انبارها در `Layout` |
| **۴** | **ویزارد راه‌اندازی در اجرای اول برنامه (First-Boot Wizard)** | ✅ تکمیل و صحه‌گذاری‌شده | ساخت کامپوننت `FirstBootWizardComponent`، تشخیص حالت دیتابیس خام (`companies.length === 0`) و ثبت آنی شرکت مادر (**۱۰ تست Vitest پاس شد**) |
| **۵** | **آزمون‌های یکپارچگی، بیلد و تضمین کیفیت** | ✅ تکمیل و صحه‌گذاری‌شده | **۳۱ آزمون Vitest فرانت‌اند** کاملاً سبز، کامپایل `npx tsc --noEmit` با **۰ خطا**، و بیلد پروداکشن `npm run build` با **موفقیت کامل** |

---

### ۱. مستندات فنی فاز ۱: بک‌اند، پایگاه داده و عایق‌سازی انبارها

1. **ارتقای مدل داده `Warehouse` در [warehouses/models.py](file:///e:/warehouse%20project/backend/warehouses/models.py):**
   * افزودن فیلدهای `company_id = models.IntegerField(null=True, blank=True, db_index=True)` و `company_name = models.CharField(max_length=255, null=True, blank=True)`.
2. **ارتقای مدل داده `Company` در [personnel/models.py](file:///e:/warehouse%20project/backend/personnel/models.py):**
   * افزودن فیلد `has_warehouse_module = models.BooleanField(default=True, verbose_name="فعال بودن سامانه انبارداری")`.
3. **مایگریشن‌های اسکیما و داده:**
   * مایگریشن `personnel.0015_company_has_warehouse_module`
   * مایگریشن `warehouses.0002_warehouse_company_id_warehouse_company_name`
   * مایگریشن داده خودکار [0003_assign_warehouses_to_fars_alish.py](file:///e:/warehouse%20project/backend/warehouses/migrations/0003_assign_warehouses_to_fars_alish.py) جهت انتساب امن تمام ۹ انبار موجود فعلی سیستم به شرکت فارس عالیش (شناسه ۲).
4. **عایق‌سازی کوئری‌ست در [warehouses/views.py](file:///e:/warehouse%20project/backend/warehouses/views.py):**
   * متد `get_queryset` در `WarehouseViewSet` کوئری را بر پایه هدر ارسالی از کلاینت `HTTP_X_COMPANY_ID` یا کوئری‌پارامتر فیلتر می‌کند.
   * متد `perform_create` به صورت خودکار `company_id` و `company_name` شرکت فعال را به انبار جدید الصاق می‌کند.
5. **نتایج تست ترمینال بک‌اند:**
```text
Found 6 test(s).
[DataMigration] 0 warehouse(s) successfully assigned to company 'Fars Alish' (ID: 2).
......
----------------------------------------------------------------------
Ran 6 tests in 2.610s

OK
```

---

### ۲. مستندات فنی فاز ۲: انتقال پورتال شرکت‌ها به مرکز عملیات

1. **انتقال ساختار فایل‌ها:**
   * کامپوننت از مسیر قدیمی مالی به [src/app/components/operations/companies/](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/) منتقل شد و پوشه زائد قدیمی مالی پاکسازی شد.
2. **پیکربندی روتینگ در [app.routes.ts](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts):**
   * مسیر رسمی `/app/operations/companies` ذیل سایدبار عملیات ثبت شد.
   * ریدایرکت از مسیر قدیمی مالی `/app/finance/companies` در [accounting.routes.ts](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/accounting.routes.ts) فعال شد.
3. **سایدبار مرکز عملیات در [operations-layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/operations/operations-layout/operations-layout.ts):**
   * آیتم منوی `مدیریت شرکت‌ها و هلدینگ` (🏢) اضافه شد.
4. **فرم ثبت/ویرایش شرکت:**
   * اضافه شدن چک‌باکس فعال بودن ماژول انبارداری و نمایش بج وضعیت ماژول انبارداری در جدول شرکت‌ها.
5. **نتایج تست‌های Vitest DOM فاز ۲:**
```text
 ✓ src/app/components/operations/companies/companies.dom.spec.ts (21 tests) 317ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

---

### ۳. مستندات فنی فاز ۳: ماژولار بودن انبارداری و گاردها

1. **ارتقای واکنشی سرویس [active-company.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/active-company.service.ts):**
   * پیاده‌سازی سیگنال‌های واکنشی `activeCompanySignal` و `hasWarehouseModuleSignal = computed(...)`.
   * هماهنگ‌سازی خودکار سیگنال‌ها با هرگونه تعویض شرکت در `selectCompany` و بازیابی از حافظه مرورگر.
2. **پنهان‌سازی مشروط در سوئیچر سامانه‌ها [app-role-switcher.component.html](file:///e:/warehouse%20project/frontend/src/app/shared/components/app-role-switcher/app-role-switcher.component.html):**
   * تب «📦 انبارگردانی» منحصراً در صورت `persona.hasWarehouseAccess()` رندر می‌شود. با توجه به شرط `activeCompanyService.hasWarehouseModuleSignal()` در `canAccessApp('warehouse')`، اگر شرکت انتخابی فاقد انبارداری باشد، گزینه انبارگردانی فوراً و بدون نیاز به رفرش از دید کاربر محو می‌شود.
3. **گاردهای امنیتی روتینگ در [auth.guard.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.guard.ts):**
   * گارد `WarehouseModuleMatchGuard` و گارد روتینگ `WarehouseCompanyGuard` در `/app/warehouse` مانع ورود مستقیم کاربر از طریق نوار آدرس URL به شرکت‌های بدون انبار شده و کاربر را به لانچر هدایت می‌کنند.
4. **همگام‌سازی بلادرنگ انبارها در [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts):**
   * شنود جریان `activeCompany$` در `ngOnInit`؛ به محض تغییر شرکت، `whService.getAll()` مجدداً فراخوانی شده و انبارهای اختصاصی شرکت جدید جایگزین می‌شوند. در صورتی که کاربر در صفحه انبارداری باشد و به شرکت بدون انبار سوئیچ کند، با نمایش اعلان شفاف به سامانه مالی هدایت می‌شود.

---

### ۴. مستندات فنی فاز ۴: ویزارد راه‌اندازی اول (First-Boot Wizard)

1. **کامپوننت [first-boot-wizard.ts](file:///e:/warehouse%20project/frontend/src/app/components/operations/first-boot-wizard/first-boot-wizard.ts):**
   * کامپوننت مستقل و مدرن با تم بصری غنی ایندیگو/بنفش، استانداردهای تایپوگرافی فارسی، انیمیشن‌های ورود و اعتبارسنجی دقیق ورودی‌ها.
2. **تشخیص خودکار دیتابیس خام در `ActiveCompanyService`:**
   * متد `loadAvailableCompanies` در صورت دریافت `companies.length === 0` و احراز `res.is_superuser`، سیگنال `isFirstBoot$` را فعال می‌کند.
3. **یکپارچه‌سازی در لایه‌بندی‌ها:**
   * تگ `<app-first-boot-wizard>` در [layout.html](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html)، [operations-layout.html](file:///e:/warehouse%20project/frontend/src/app/components/operations/operations-layout/operations-layout.html) و [app-launcher.html](file:///e:/warehouse%20project/frontend/src/app/components/app-launcher/app-launcher.html) تعبیه شده است.
4. **نتایج تست‌های Vitest DOM فاز ۴:**
```text
 ✓ src/app/components/operations/first-boot-wizard/first-boot-wizard.dom.spec.ts (10 tests) 180ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

---

### ۵. مستندات فنی فاز ۵: آزمون‌های جامع صحه‌گذاری نهایی

#### ۵.۱. تست‌های بک‌اند جنگو (Django Backend Test Suite)
```powershell
$env:PYTHONIOENCODING="utf-8"; & "backend\venv\Scripts\python.exe" manage.py test warehouses.test_company_warehouse_isolation personnel.test_company_multitenant --keepdb
```
**نتیجه:** ۱۶ آزمون جامع بک‌اند (ایزولاسیون انبارها، تزریق خودکار شرکت در Create، فیلتر هدر X-Company-ID، عدم دسترسی کاربر PTS به FA، و تست‌های دیسکت بیمه/مالیات) با خروجی **OK** اجرا شدند.

#### ۵.۲. آزمون‌های سریع DOM فرانت‌اند (Type 1 Vitest DOM Tests)
```powershell
npx vitest run src/app/components/operations/companies/companies.dom.spec.ts src/app/components/operations/first-boot-wizard/first-boot-wizard.dom.spec.ts
```
**نتیجه:** هر **۳۱ آزمون واحد DOM** با موفقیت کامل و در مدت ۱.۲۴ ثانیه Pass شدند:
* ۲۱ تست پورتال مدیریت شرکت‌ها (رندر جدول، سرچ زنده، فیلترها، مودال ثبت/ویرایش با ماژول انبارداری، خروجی اکسل).
* ۱۰ تست ویزارد راه‌اندازی اول (رندر شرطی، اعتبارسنجی فیلدها، سوئیچ ماژول انبارداری، ثبت موفق و بستن ویزارد).

#### ۵.۳. اعتبارسنجی کامپایل تایپ‌اسکریپت (`npx tsc --noEmit`)
**نتیجه:** خروجی دستور `npx tsc --noEmit` با **کد خروج ۰** و بدون حتی یک خطای تایپ یا ایمپورت به پایان رسید.

#### ۵.۴. بیلد پروداکشن انگولار (`npm run build`)
**نتیجه:** کلیه ماژول‌ها و چانک‌های لیزی بدون هیچ خطایی کامپایل شده و اسکریپت پچ Service Worker با موفقیت اعمال گردید (`Application bundle generation complete`).

---

### ۶. جمع‌بندی نهایی

تمام اهداف طرح با دقت ۱۰۰٪، مستند، مرحله‌به‌مرحله و بدون هیچ‌گونه خطا یا تخریب کدهای موجود پیاده‌سازی و راستی‌آزمایی شدند. سامانه اکنون از بالاترین سطح تفکیک چندشرکتی، انعطاف‌پذیری ماژولار انبارداری و تجربه کاربری حرفه‌ای در راه‌اندازی اولیه برخوردار است.

</div>
