# طرح جامع ایزولاسیون چندشرکتی کارتابل‌های ۵ سطحی (Cartable Multi-Tenant Security)

<div dir="rtl" align="right">

## ۱. توصیف مسئله و انگیزه فنی (Problem & Context)

سامانه انبارداری و حقوق و دستمزد از معماری چندمستأجری (Multi-tenancy) بر پایه مدل `Company` پشتیبانی می‌کند؛ به طوری که شرکت‌های مستقلی مانند «فارس عالیش» (FA) و «پاینده توان ساینا» (PTS) با کاربران، پرسنل، قراردادها و گردش‌های مالی مجزا در سیستم تعریف شده‌اند.

در ماژول اصلی `personnel/views.py` بیش از ۴۶ بار منطق تفکیک و اعتبارسنجی شرکت (`get_user_allowed_companies`، `get_request_company_id`، `validate_user_company_access`) اعمال شده و دسترسی کاربر به شرکت انتخابی در هدر `X-Company-ID` بررسی می‌گردد. با این حال، در فایل **`personnel/cartable_views.py`** و موتور خزانه‌داری **`personnel/treasury_engine.py`** هیچ‌گونه فیلتر شرکتی وجود ندارد:

1. **نشت اطلاعات حساس (Data Leak):** در اندپوینت‌های `GET` کارتابل‌های سرپرست، حسابدار، مدیر و خزانه‌داری، کوئری‌ها بر روی تمامی داده‌های موجود در پایگاه‌داده بدون قید شرکت اجرا می‌شوند. بنابراین کاربرانِ یک شرکت، پرونده‌های استخدامی، فاکتورهای هزینه‌ای، کارکردها و حتی شماره شبای بانکی شرکت‌های دیگر را در صف کارتابل خود مشاهده می‌کنند.
2. **آسیب‌پذیری کنترل دسترسی در سطح شیء (BOLA / IDOR):** در متدهای `POST` کلیه کارتابل‌ها، تنها نقش کاربر (Tier) بررسی شده و هیچ کنترلی روی تعلق رکورد درخواستی (`instance.company_id`) به شرکت مجاز کاربر انجام نمی‌شود. در نتیجه یک مدیر یا حسابدار می‌تواند اسناد یا پرداخت‌های یک شرکت بیگانه را تصویب یا تسویه کند!
3. **عدم پوشش تست‌های چندشرکتی:** در فایل تست چندشرکتی موجود (`test_company_multitenant.py`) هیچ سناریویی برای راستی‌آزمایی ایزولاسیون کارتابل‌های ۵ سطحی و صدور دیسکت بانکی نوشته نشده است.

---

## ۲. ارزیابی امنیتی و جدول نیازمندی‌ها (Security Matrix)

| ردیف | اندپوینت / ماژول | ریسک امنیتی فعلی | اقدام اصلاحی الزامی |
| :--- | :--- | :--- | :--- |
| **۱** | `SupervisorCartableAPIView` | مشاهده و تایید پرسنل، ناوگان، تغییرات، فاکتور و تنخواه شرکت‌های دیگر | اعمال `_filter_by_company` در `GET` و بررسی مالکیت شرکت در `POST` |
| **۲** | `AccountantCartableAPIView` | مشاهده احکام مالی، حقوق و فاکتورهای همه شرکت‌ها | اعمال `_filter_by_company` در `GET` و اعتبارسنجی دسترسی شرکت در `POST` |
| **۳** | `ManagerCartableAPIView` | صدور مجوز پرداخت برای اسناد و فاکتورهای شرکت‌های بیگانه | محدودسازی صف تایید مدیر به شرکت جاری و ممانعت از تایید Cross-Company |
| **۴** | `TreasuryCartableAPIView` | نشت شماره شبا و صف پرداخت نقدی/بانکی شرکت‌های دیگر | فیلتر صف خزانه‌داری و رد درخواست تسویه برای شرکت غیرمجاز |
| **۵** | `TreasuryDisbursementService` | متد `get_pending_treasury_batches` بدون فیلتر شرکت | افزودن آرگومان `company_ids` و اعمال فیلتر بر دوره‌ها، سوابق حقوق و ناوگان |
| **۶** | `TreasuryDisketteExportAPIView` | دانلود دیسکت پایا/ساتنای هر دوره‌ای فقط با داشتن `period_id` | بررسی تعلق دوره حقوق به شرکت مجاز کاربر قبل از تولید فایل CSV |

---

## ۳. تغییرات پیشنهادی در معماری و کدها (Proposed Changes)

### الف) ماژول بک‌اند: `warehouse-backend/personnel/cartable_views.py`

#### ۱. پیاده‌سازی متدهای کمکی استخراج و فیلتر شرکت
استفاده از متدهای استاندارد موجود در `personnel/views.py`:
- `get_user_allowed_companies(user, required_level)`
- `get_request_company_id(request)`
- `validate_user_company_access(user, company_id)`

پیاده‌سازی هلپر هوشمند `_get_effective_company_ids(request, user)`:
- در صورت ارسال `company_id` (از طریق هدر `X-Company-ID` یا کوئری‌پارامتر): اعتبارسنجی دسترسی و بازگرداندن `[cid]` در صورت مجاز بودن کاربر.
- در صورت عدم ارسال: برای سوپریوزر بازگرداندن `None` (دسترسی به همه) و برای کاربر عادی بازگرداندن لیست شناسه‌های شرکت‌های مجاز کاربر (`allowed_ids`). در صورتی که کاربر به هیچ شرکتی دسترسی نداشته باشد، لیست خالی `[]` برگردانده می‌شود تا هیچ رکوردی لو نرود.

پیاده‌سازی هلپر `_filter_by_company(queryset, model_name, company_ids)`:
- اعمال فیلتر مناسب متناسب با ساختار هر مدل:
  - پرسنل (`PersonnelProfile`): `Q(company_id__in=ids) | Q(section__project__company_id__in=ids)`
  - ناوگان (`VehicleDriverProfile`): `Q(company_id__in=ids) | Q(section__project__company_id__in=ids)`
  - تغییرات پرسنل (`PersonnelChangeRequest`): `Q(personnel__company_id__in=ids) | Q(personnel__section__project__company_id__in=ids)`
  - تغییرات ناوگان (`VehicleChangeRequest`): `Q(vehicle__company_id__in=ids) | Q(vehicle__section__project__company_id__in=ids)`
  - دوره ماهانه (`MonthlyWorkPeriod`): `company_id__in=ids`
  - فاکتور هزینه (`ExpenseInvoice`): `section__project__company_id__in=ids`
  - تنخواه (`PettyCashTransaction`): `section__project__company_id__in=ids`
  - لاگ ناوگان (`VehicleTripLog`): `Q(vehicle__company_id__in=ids) | Q(project__company_id__in=ids) | Q(section__project__company_id__in=ids)`
  - رکورد حقوق (`MonthlyPayrollRecord`): `Q(period__company_id__in=ids) | Q(personnel__company_id__in=ids)`

#### ۲. ایمن‌سازی متدهای POST و جلوگیری از BOLA
در کلیه اکشن‌های تایید، رد و بازنگری (`post`):
- استخراج شناسه شرکت نمونه هدف (`instance`) از طریق روابط فوق
- فراخوانی `validate_user_company_access(user, target_company_id)`
- در صورت عدم تطابق، پرتاب خطای صریح `PermissionDenied("شما مجوز اقدام بر روی رکوردهای این شرکت را ندارید.")` با کد HTTP 403.

---

### ب) ماژول بک‌اند: `warehouse-backend/personnel/treasury_engine.py`

#### به‌روزرسانی `TreasuryDisbursementService.get_pending_treasury_batches`
- افزودن پارامتر `company_ids: Optional[List[int]] = None`
- اعمال فیلتر بر روی `ready_periods`, `ready_payrolls`, `ready_trips` در صورت ارسال `company_ids`.
- به‌روزرسانی محاسبه سرجمع‌های مبالغ قابل پرداخت (`total_payroll_payable`, `total_fleet_payable`) متناسب با شرکت فیلترشده.

---

### ج) فرانت‌اند: وضعیت ارسال هدر و همگام‌سازی

بررسی عمیق کدها نشان داد که در فایل `warehouse-front/src/app/core/auth/auth.interceptor.ts` خطوط ۱۰۵ تا ۱۱۰:
```typescript
const activeCompanyId = typeof window !== 'undefined'
  ? (sessionStorage.getItem('active_company_id') || localStorage.getItem('active_company_id'))
  : null;
if (activeCompanyId) {
  headers['X-Company-ID'] = activeCompanyId;
}
```
هدر `X-Company-ID` به طور خودکار بر روی تمامی درخواست‌های HTTP فرانت‌اند اضافه می‌شود. بنابراین با ایمن‌سازی لایه بک‌اند، فرانت‌اند به صورت آنی و خودکار تنها داده‌های شرکت انتخابی جاری را نمایش خواهد داد.

---

### د) آزمون‌های خودکار چندشرکتی (Automated Test Suite)

#### ایجاد فایل تست اختصاصی `warehouse-backend/personnel/test_cartable_multitenant.py`
شامل سناریوهای آزمایشی دقیق:
1. **جداسازی نمایش در کارتابل سرپرست:** سرپرست شرکت FA تنها رکوردهای FA را در لیست و شمارنده‌ها می‌بیند و رکوردهای PTS برایش مخفی است.
2. **جداسازی نمایش در کارتابل حسابدار و مدیر:** بررسی عدم تداخل رکوردهای استخدامی و فاکتورها بین FA و PTS.
3. **جداسازی در کارتابل خزانه‌داری:** اطمینان از اینکه خزانه‌دار FA شماره شبا و مبالغ پرداختی پرسنل PTS را مشاهده نمی‌کند.
4. **دفاع در برابر حمله BOLA:** اقدام سرپرست/مدیر شرکت FA برای تایید یا رد رکوردی از شرکت PTS باید با خطای ۴۰۳ (PermissionDenied) مسدود شود.
5. **کنترل خروجی دیسکت بانکی خزانه‌داری:** ممانعت از دانلود دیسکت پایا برای دوره شرکت دیگر.
6. **رفتار کاربر ارشد (Superuser):** سوپریوزر در صورت ارسال هدر شرکت، داده‌های همان شرکت و در صورت عدم ارسال، داده‌های تجمیعی را دریافت می‌کند.

---

## ۴. مراحل گام‌به‌گام پیاده‌سازی (Implementation Phases)

1. **فاز ۱ (Backend Hardening):** اصلاح و ایمن‌سازی `cartable_views.py` و `treasury_engine.py` با هلپرهای شرکت و کنترل‌های BOLA.
2. **فاز ۲ (Test Suite Creation):** نگارش و اجرای آزمون‌های اختصاصی `test_cartable_multitenant.py` و اجرای کل سوئیت تست‌های چندشرکتی.
3. **فاز ۳ (Regression Testing):** اجرای تست‌های رول‌بیس قبلی (`test_role_based_cartables.py`) جهت تضمین عدم شکست فرآیندهای موجود.
4. **فاز ۴ (Frontend Validation):** راستی‌آزمایی هماهنگی فرانت‌اند و بیلد نهایی پروژه.

</div>
