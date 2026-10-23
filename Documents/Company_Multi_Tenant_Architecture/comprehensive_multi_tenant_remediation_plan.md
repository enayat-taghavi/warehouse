# طرح جامع اصلاح و تحکیم معماری سطح شرکت (Enterprise Multi-Tenancy Architecture Plan)

<div dir="rtl" align="right">

## ۱. توصیف هدف (Goal Description)
هدف این طرح، گذار کامل سامانه از معماری قدیمی **تک‌شرکتی انبار-محور** به یک معماری اصولی، ماژولار و امن **چندشرکتی سازمانی (Enterprise Multi-Tenancy)** است.
در وضعیت فعلی، موجودیت حقوقی «شرکت» به صورت یک پوسته ظاهری بر روی برخی جداول کشیده شده است؛ در حالی که رگه‌های اصلی سامانه (شامل انبار، کالاها، کاردکس، اسناد، لاگ‌های امنیتی، کانال‌های وب‌سوکت و محاسبات کارکرد و حقوق) همچنان از مفهوم شرکت بی‌خبرند یا فیلترهای آن به صورت دستی و ناقص اعمال می‌شود که منجر به نشت داده (Data Leakage)، تناقض در کلیدهای یکتا (Integrity Conflicts) و خطاهای کاربری می‌گردد.

---

## ۲. موارد نیازمند بررسی کاربر (User Review Required)

> [!IMPORTANT]
> **۱. استراتژی کدهای ملی تکراری در سطح هلدینگ:**
> در حال حاضر فیلد `national_code` در جدول `PersonnelProfile` دارای قید `unique=True` در کل دیتابیس است. در ساختار چندشرکتی، اگر فردی در دو شرکت زیرمجموعه یک هلدینگ شاغل باشد یا بین دو شرکت جابه‌جا شود، این قید مانع ایجاد پروفایل در شرکت دوم می‌شود.
> **راهکار پیشنهادی:** تبدیل قید به `unique_together = ('company', 'national_code')`.
> *آیا تایید می‌فرمایید که یک کد ملی بتواند در دو شرکت مختلف دارای پرونده مستقل باشد؟*

> [!WARNING]
> **۲. استراتژی کد کالاها و کد پروژه‌ها:**
> در حال حاضر `FinancialProject.code` یکتای سراسری است. با اصلاح معماری، یکتایی به سطح هر شرکت محدود می‌شود (`unique_together = ('company', 'code')`). بدین ترتیب دو شرکت مستقل می‌توانند هر دو پروژه‌ای با کد `PRJ-01` داشته باشند.

> [!CAUTION]
> **۳. الزام وجود شرکت در محاسبات حقوق و کارکرد:**
> در حال حاضر بستن دوره کارکرد (`MonthlyWorkPeriod`) و محاسبه حقوق به شدت وابسته به `warehouse_id` است. در معماری جدید، مرجع اصلی بستن دوره کارکرد و دیسکت‌های بیمه و مالیات، **شرکت (`company_id`)** خواهد بود و انبار صرفاً یک فیلتر مکانی اختیاری است.

---

## ۳. فهرست کامل ایرادات کشف‌شده (Comprehensive Defect Inventory)

| ردیف | حوزه / لایه | محل در کد | ماهیت و شرح دقیق ایراد | ریسک امنیتی / عملیاتی |
| :---: | :--- | :--- | :--- | :--- |
| **۱** | **معماری مدل‌ها** | [personnel/models.py#L88](file:///e:/warehouse%20project/backend/personnel/models.py#L88) | مدل `Company` درون اپ پرسنل تعریف شده و اپ `warehouses` به اپ `personnel` وابستگی معکوس دارد. | نقض DDD و ناتوانی در تفکیک ماژول‌ها |
| **۲** | **امنیت وب‌سوکت** | [personnel/views.py#L198](file:///e:/warehouse%20project/backend/personnel/views.py#L198) | ارسال تمام پیام‌های تغییرات پرسنل و ناوگان با کدملی و نام به روم عمومی `'global_notifications'`. | نشت بحرانی اطلاعات هویتی به سایر شرکت‌ها |
| **۳** | **ایزولاسیون کاردکس** | [inventory/views.py#L462](file:///e:/warehouse%20project/backend/inventory/views.py#L462) | ویوی `ItemViewSet.get_queryset` اصلاً `company_id` را فیلتر نمی‌کند؛ فقط انبارهای کاربر را می‌سنجد. | مشاهده اقلام سایر شرکت‌ها توسط کاربر |
| **۴** | **ایزولاسیون کارتابل‌ها** | [inventory/views.py#L3097](file:///e:/warehouse%20project/backend/inventory/views.py#L3097) | ویوهای `CountTaskViewSet` و `DocTaskViewSet` بدون فیلتر شرکت هستند. | دسترسی سرپرستان به تسک‌های انبار شرکت دیگر |
| **۵** | **لاگ ممیزی (Audit)** | [accounts/models.py#L338](file:///e:/warehouse%20project/backend/accounts/models.py#L338) | جدول `AuditLog` فیلد `warehouse_id` دارد اما فاقد فیلد `company_id` است. | عدم امکان ممیزی تفکیک‌شده برای شرکت‌ها |
| **۶** | **فیلدهای پویا** | [inventory/models.py#L21](file:///e:/warehouse%20project/backend/inventory/models.py#L21) | فیلدهای داینامیک انبار (`ItemFieldDefinition`) فاقد فیلد شرکت هستند؛ فیلد سراسری به همه اعمال می‌شود. | تحمیل فیلدهای سفارشی یک شرکت به شرکت‌های دیگر |
| **۷** | **میان‌افزار کانتکست** | [accounts/middleware.py#L213](file:///e:/warehouse%20project/backend/accounts/middleware.py#L213) | `AuditContextMiddleware` هدر `X-Company-ID` را بدون بررسی صحت دسترسی کاربر ذخیره می‌کند. | امکان جعل شرکت (Tenant Spoofing) |
| **۸** | **قیدهای یکتایی** | `FinancialProject.code`, `PersonnelProfile.national_code` | کدهای یکتای سراسری به جای یکتای شرکتی تعریف شده‌اند. | مسدود شدن ثبت پروژه‌ها و پرسنل مشترک |
| **۹** | **محاسبه حقوق** | [personnel/views.py#L5606](file:///e:/warehouse%20project/backend/personnel/views.py#L5606) | الزام اجباری `warehouse_id` برای بستن دوره و محاسبه حقوق ۵۸ ستونه. | شکست محاسبات در شرکت‌های بدون انبار فیزیکی |
| **۱۰** | **ایمپورت اکسل** | [personnel/views.py#L886](file:///e:/warehouse%20project/backend/personnel/views.py#L886) | نادیده گرفتن `X-Company-ID` در درون‌ریزی اکسل پرسنل و ایجاد رکوردهای بدون شرکت (`null`). | تولید داده‌های یتیم (Orphan Records) |
| **۱۱** | **فرانت‌اند و URL** | [active-company.service.ts#L148](file:///e:/warehouse%20project/frontend/src/app/core/services/active-company.service.ts#L148) | شرکت فعال فقط در استوریج مرورگر است و در URL روتینگ منعکس نمی‌شود. | سردرگمی در اشتراک لینک و خطای دیداری |
| **۱۲** | **واکنش‌پذیری UI** | صفحات مختلف فرانت‌اند | کامپوننت‌ها به تعویض شرکت واکنش نشان نمی‌دهند مگر با لیسنر دستی جداگانه. | نمایش داده‌های کهنه پس از سوییچ شرکت |

---

## ۴. تغییرات پیشنهادی در معماری (Proposed Architectural Changes)

### فاز ۱: تصحیح مدل‌ها و قیدهای چندشرکتی در پایگاه داده (Data Models & Integrity)
* **مدل `FinancialProject`:** تبدیل `code` به `unique_together = ('company', 'code')`.
* **مدل `PersonnelProfile`:** تبدیل `national_code` به `unique_together = ('company', 'national_code')`.
* **مدل `VehicleDriverProfile`:** افزودن مستقیم کلید خارجی `company = ForeignKey(Company)`.
* **مدل `MonthlyWorkPeriod`:** اصلاح قید یکتا به `(company, year_month)`.
* **مدل `ItemFieldDefinition`:** افزودن کلید خارجی `company = ForeignKey(Company)`.
* **مدل `AuditLog`:** افزودن ستون `company_id = IntegerField(db_index=True)`.

### فاز ۲: ارتقای میان‌افزار و فیلترینگ خودکار سراسری (Tenant Guard Middleware & Manager)
* پیاده‌سازی گارد ضدجعل در `AuditContextMiddleware` با اعتبارسنجی `validate_user_company_access` و ارجاع خطای ۴۰۳ در صورت عدم تطابق.
* تعریف کلاس کمکی `TenantScopeMixin` در `common/tenant_scope.py`.

### فاز ۳: ایزولاسیون کامل ماژول‌های انبار و کارکرد (QuerySet Hardening)
* ایزولاسیون `ItemViewSet`، `CountTaskViewSet` و `DocTaskViewSet` با فیلتر شرکت فعال.
* ایزولاسیون `MonthlyPayrollViewSet` بر مبنای شرکت.
* اصلاح `import_personnel_excel` جهت انتساب خودکار شرکت فعال به پرسنل جدید.

### فاز ۴: ایزولاسیون کانال‌های بلادرنگ وب‌سوکت (Tenant WebSocket Isolation)
* ارسال کلیه پیام‌ها به کانال اختصاصی هر شرکت: `f'company_{cid}_notifications'`.
* اتصال کلاینت‌ها فقط به کانال‌های شرکت‌های مجاز خود در اتصال وب‌سوکت.

### فاز ۵: فرانت‌اند، هماهنگی URL و واکنش‌پذیری عمومی (Frontend Architecture)
* همگام‌سازی دوطرفه شرکت فعال با کوئری‌پارامترهای URL در `ActiveCompanyService`.
* تقویت `auth.interceptor.ts` برای ارسال تضمین‌شده هدر `X-Company-ID`.
* اتصال واکنش‌گرای کامپوننت‌های انبار و کارگزینی به سیگنال تغییر شرکت.

</div>
