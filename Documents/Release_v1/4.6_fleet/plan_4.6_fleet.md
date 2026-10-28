<div dir="rtl" align="right">

# طرح جزئی ۴.۶ — ناوگان

- **تاریخ:** ۵ آبان ۱۴۰۵ (۲۷ اکتبر ۲۰۲۶)؛ کامل‌شده در ۶ آبان ۱۴۰۵ (۴.۶-الف)
- **طرح مادر:** `Documents/Release_v1/release_v1_master_plan.md`، مرحلهٔ ۴، بند ۴.۶؛ ص۶ طرح ۳.۶ (ناوگان در مرحلهٔ ۴ به موتور ۲.۳ می‌رود)؛ الگوی پرونده در طرح ۴.۳ (د۱ تا د۷) و الگوی دوره و خزانه در طرح ۴.۵ (د۴ تا د۶)
- **وضعیت:** کامل (۴.۶-الف). پرسشی از کاربر پرسیده نشد (اجرای زنجیرهٔ خودکار)؛ تصمیم‌ها با قانون‌های طرح مادر و الگوی ۴.۳ و ۴.۵ بسته شدند. تصمیم‌هایی که کاربر شاید جور دیگری بخواهد در §۶ آمده‌اند.

## ۰. قانون‌های مرتبط

- ق۶ (دامنهٔ شرکت و بخش)، ق۷ و ق۸ (گردش و سابقه)، ق۱۰ (خلاصهٔ سرویس ناوگان فقط از اکسل مرجع، `.agents/AGENTS.md` §6)، ق۱۲ (موبایل)، ق۱۶ (کد ملی، شبا و اسناد راننده و مالک)، ق۱۸ (سرعت).
- ناوگان از بقیه جداست و به ۴.۳ تا ۴.۵ وابسته نیست؛ فقط از الگوهای آن‌ها استفاده می‌کند.

## ۱. وضع فعلی (بررسی کد، ۶ آبان ۱۴۰۵)

همهٔ مسیرهای سرور زیر `backend/modules/accounting/personnel/` است، مگر خلافش گفته شود.

- **مدل‌ها** (`models_domains/fleet.py`):
  - `VehicleDriverProfile` (`:9`): پلاک، نوع، مالکیت (`contract`/`personal`/شرکتی)، راننده و مالک (کد ملی و تلفن)، نرخ سرویس پیش‌فرض، بانک و شبا، تاریخ‌های اعتبار، بخش و پروژه؛ وضعیت `approval_status` با ۱۲ مقدار (`:113-131`) و فیلدهای «تأییدکننده و زمان» هر مرحله، پرداخت خزانه، عبور خودکار، عودت (`:134-236`).
  - `VehicleBankAccount` (`:309`)، `VehicleDocument` (`:408`)، `VehicleChangeRequest` (`:472`؛ وضعیت‌ها `:476-488`؛ بی فیلد بخش و شرکت، از خودرو).
  - تردد: `VehicleTripLog` (`models_domains/attendance.py:397`): خودرو، بخش، پروژه، `warehouse_id`، تاریخ شمسی، تعداد سرویس، نرخ، مبلغ، `period` (FK به `MonthlyWorkPeriod`، `SET_NULL`)، `is_settled`/`settled_at`/`settled_by`/`payment_tracking_code`. `VehicleTripAuditLog` (`:554`).
- **گردش خودرو و درخواست تغییر روی مسیر قدیمی:**
  - `fleet_lifecycle_services.py`: `approve_vehicle_stage` (`:509`) با `FLEET_APPROVAL_STAGES` (`:472`)؛ **مجوز مرحله سراسری سنجیده می‌شود (`user_has_any_perm`)، نه در بخش خودرو**؛ مدیر از پیش‌نویس رد نمی‌شود ولی اگر سرپرست و حسابدار خالی باشند خودش جای آن‌ها پر می‌کند (`:556-562`)، یعنی دور زدن حسابدار (خلاف ق۷). `auto_pass_vehicle` (`:586`)، اعلان دستی (`:700`)، `apply_vehicle_change_request` (`:835`).
  - `views_domains/fleet_views.py`: `VehicleDriverProfileViewSet` (`:53`؛ `pagination_class = None`، `:68`) با اکشن‌های `submit` (`:690`)، `approve-supervisor/finance/manager` (`:742-797`)، `batch-approve` (`:799`)، `reject` (`:851`)، `request-revision` (`:945`)، `reopen` (`:1128`)، `end-collaboration` (`:1177`)، اکسل (`:1264-1955`). `VehicleChangeRequestViewSet` (`:1956`، بی صفحه‌بندی) با `cancel`، سه تأیید و `reject` (`:2015-2200`)؛ مدیر کل از هر وضعیتی تصویب می‌کند (`:2128-2130`).
  - `workflow_engine.py:440`، `:500`، `:538`، `:641` (`_apply_vehicle_changes`) مسیر موتور قدیمی برای درخواست تغییر.
  - دامنهٔ فهرست با `scope_vehicle_queryset` (`views_domains/scope_helpers.py:193`) درست است (بخش‌های کاربر یا ثبت خودش، در شرکت‌های مجاز).
- **دادهٔ حساس:** `serializers_domains/fleet.py` (`VehicleDriverProfileSerializer` `:110`، حساب بانکی `:29`، درخواست تغییر `:382`) هیچ چیزی را نمی‌پوشاند؛ کد ملی راننده و مالک، شماره حساب و شبا برای همهٔ اعضای بخش باز است.
- **تردد ماهانه** (`views_domains/trip_views.py`): ماتریس، `bulk-save`، `monthly-grid`، `update-day-trip`، `bulk-save-monthly-grid`، اکسل ماهانه (`:191-1064`). قفل فقط با **دورهٔ انبار‌دار** (`MonthlyWorkPeriod.objects.filter(warehouse_id=...)`، `:308`، `:523`، `:718`، `:893`)؛ ترددهای بخش‌دار هیچ‌وقت قفل نمی‌شوند. **کارکرد ماهانهٔ خودرو تأیید ندارد.**
- **تسویه:**
  - `fleet_settlement_engine.calculate_monthly_fleet_settlement` (`:15`): فقط با `warehouse_id`؛ **بی شناسه همهٔ خودروهای همهٔ شرکت‌ها** (`:32`)؛ خودروی پیش‌نویس و ردشده هم می‌آید؛ برای هر خودرو یک پرس‌وجوی حساب اصلی (`:69`، N+1). فرمول: تعداد × نرخ؛ شرکتی صفر (`:56-61`). `generate_fleet_bank_meli_excel` (`:119`).
  - نما `FleetSettlementViewSet` (`views_domains/payroll_views.py:1475`): فقط `IsAuthenticated`؛ **هر کاربر واردشده فهرست شبا و کد ملی همهٔ رانندگان همهٔ شرکت‌ها را می‌گیرد** (ق۶ و ق۱۶).
  - خزانه: `get_pending_treasury_batches` (`treasury_engine.py:97-110`) همهٔ ترددهای تسویه‌نشدهٔ خودروی مصوب را «آمادهٔ پرداخت» می‌شمارد، بی تأیید ماهانه؛ `disburse_fleet_trips` (`:226`) بی کنترل تکرار. کارتابل خزانه `disburse_fleet` (`cartable_views.py:1058-1086`) با فهرست `trip_ids`؛ `int()` روی ورودی بد 500 می‌دهد.
- **مجوزها** (`backend/modules/accounting/module.py`): `view_sys_fleet_attendance` (کارمند و سرپرست، `:99`)، `perm_approve_fleet_supervisor` (`:104`)، `perm_approve_fleet_finance` (`:106`)، `perm_approve_fleet_manager` (`:108`)، `view_sys_fleet_settlement` (حسابدار و مدیر، `:115`)؛ خزانه `perm_treasury_disburse_action`.
- **اکسل مرجع:** `Documents/SalaryCalculation/TirSalary.xlsm` فقط برگه‌های `Settings`، `Emp_info` و `تیر` را دارد؛ **هیچ برگه یا ستونی برای خلاصهٔ سرویس ناوگان ندارد** (فقط «فوق‌العادهٔ ایاب و ذهاب» حقوق و گزینهٔ خودروی اختصاصی در `Settings!C13`). پس ق۱۰ برای ناوگان منبعی ندارد (§۶، ن۱).
- **فرانت** (`frontend/src/app/modules/accounting/`):
  - `api/fleet-api.service.ts` (اکشن‌های تأیید `:96-114`، `batch-approve` `:180`، درخواست تغییر `:217-237`، تسویه `:245-256`).
  - صفحه‌ها در `components/finance/`: `employee/employee-new-vehicle` (۲۶۱۰ خط)، `employee/employee-fleet` (۱۳۱۸)، `supervisor/supervisor-fleet` (۷۱۵)، `accountant/accountant-fleet` (۹۳۵)، `manager/manager-fleet` (۶۲۸)، `supervisor/supervisor-new-profiles` و `accountant/accountant-new-profiles` (بخش خودرو)، `treasurer/treasurer-disbursements` (`disburse_fleet`، `:399`، `:470`).
  - **`prompt()` دیگر نیست:** در ۴.۳-ج (`d64d2866`) با پنجرهٔ دلیل مشترک جایگزین شد (`supervisor-new-profiles.ts:404`).
  - **کامپایل همهٔ تست‌های فرانت الان می‌شکند:** `supervisor/supervisor-attendance-and-lock.dom.spec.ts` (۱۲ خطای TS) هنوز API قدیمی کامپوننت‌های کارکرد را صدا می‌زند که در ۴.۴-ج (`f0630af6`) عوض شد (`currentPeriodSummary`، `lockAndSubmitPeriod`، `revisionReasonText`، `confirmRevision()` بی آرگومان، `selectedSection`، `fetchPeriodData`). تا درست نشود هیچ `ng test`ی اجرا نمی‌شود، پس شکست قدیمی `employee-new-vehicle.dom.spec.ts` هم الان دیده نمی‌شود (در ۲.۲ تا ۳.۴ دو شکست ثبت شده بود).
- **تست‌های موجود:** `test_fleet_scenarios_10_vehicles.py`، `test_attendance_fleet_audit.py`، `test_role_based_cartables.py`، `test_cartable_multitenant.py`، `test_sheba_validation.py`، `test_section_guardian.py`؛ نگهبان `phase_guardian_approval.py` (`:585-622`، `calculate_monthly_fleet_settlement(year_month=...)`) دست نمی‌خورد.

## ۲. تصمیم‌ها

- **د۱. گردش پروندهٔ خودرو روی موتور ۲.۳** (الگوی د۱ طرح ۴.۳).
  - `VEHICLE_PROFILE_WORKFLOW_SPEC` در `workflows.py` (کلید و نوع `vehicle_profile`، عنوان «پروندهٔ خودرو»): `supervisor_ok` (`perm_approve_fleet_supervisor`، APPROVE)، `accountant_review` (`perm_approve_fleet_finance`، REVIEW؛ هرگز رد نمی‌شود)، `manager_ok` (`perm_approve_fleet_manager` یا نام مستعار مدیر، APPROVE).
  - `section_field='section'`، `company_field='company'`، بی مبلغ، `view_permission='view_sys_fleet_attendance'`، مسیر `/app/finance/employee-new-vehicle?vehicle={id}`.
  - نگاشت وضعیت مثل پرونده: مرحله‌ها ← `pending_supervisor`/`pending_accountant`/`pending_manager`؛ پایان ← `approved` و `is_active=True`؛ عودت ← `revision_required`؛ رد ← `rejected`؛ لغو ← `draft`. فیلدهای «تأییدکننده و زمان» از `on_state_change` پر می‌شوند. `ready_to_pay`/`paid` پرونده دیگر استفاده نمی‌شوند (choices دست نمی‌خورد).
  - شروع از سطح ثبت‌کننده، رد مرحلهٔ بی‌نفر، جانشین، یادآوری، کارهای من، اعلان و سابقه از موتور. `auto_pass_vehicle` و اعلان دستی کنار می‌روند؛ «پر کردن جای سرپرست و حسابدار به دست مدیر» برداشته می‌شود (ق۷).
  - گیت فیلدها: `get_vehicle_missing_fields(stage='submit')` پیش از `submit`، و `stage='accountant'` (نرخ و شبا) با قلاب `can_act:vehicle_profile` پیش از تأیید `accountant_review` (همان قلاب عمومی ۴.۳).
  - `reopen` و `end-collaboration` همان رفتار امروز را دارند ولی فقط روی خودروی `approved` و با مجوز در بخش خودرو.
- **د۲. درخواست تغییر خودرو هم روی موتور.** `VEHICLE_CHANGE_WORKFLOW_SPEC` (کلید و نوع `vehicle_change`) با همان سه مرحله؛ بخش و شرکت از خودرو (property های فقط‌خواندنی `wf_section`/`wf_company` روی مدل، بی migration). پایان ← `apply_vehicle_change_request` در همان تراکنش (خطا = برگشت کل اقدام)؛ عودت ← `revision_required`؛ رد ← `rejected`؛ لغو ← `cancelled`؛ `has_pending_changes` با `refresh_vehicle_has_pending_changes`. مسیرهای خودروی `workflow_engine.py` (`:440`، `:500`، `:538`، `:641`) دیگر برای خودرو صدا زده نمی‌شوند و اگر فراخوانی نماند حذف می‌شوند.
- **د۳. اکشن‌های قدیمی پوستهٔ نازک روی موتور** (الگوی د۴ طرح ۴.۳): `submit`، `approve-supervisor/finance/manager`، `reject`، `request-revision`، `batch-approve` و اکشن‌های درخواست تغییر (`cancel`، سه تأیید، `reject`) همان پاسخ و کدهای خطا را می‌دهند؛ مجوز را موتور در بخش خودرو می‌سنجد. تأیید گروهی برای هر خودرو جدا `act` می‌کند و نتیجهٔ هر ردیف را برمی‌گرداند. اگر پس از ۴.۶-ج فراخوانی نماند، در ۴.۶-ج حذف می‌شوند.
- **د۴. پرونده‌های در جریان قدیمی.** دستور بی‌خطر و تکرارپذیر `fleet_open_workflows --dry-run` (الگوی `personnel_open_workflows`): خودروها و درخواست‌های تغییر در `pending_*`/`*_approved` (به‌جز `approved`) بی نمونهٔ موتور، کارشان در مرحلهٔ متناظر باز می‌شود (بی حذف، بی برگرداندن)؛ `manager_approved` قدیمی معادل مصوب. روی `app` به دست آنتی‌گرویتی در انتشار بعدی.
- **د۵. کارکرد ماهانهٔ ناوگان روی دورهٔ بخش و گردش موتور** (الگوی د۴ و د۶ طرح ۴.۵).
  - تردد بخش‌دار به `MonthlyWorkPeriod` همان بخش و ماه وصل می‌شود (`attendance_periods.get_or_create_period`)؛ فیلد `period` فعلی، بی migration. ترددهای قدیمی انبار‌دار رفتار امروز را دارند.
  - `FLEET_PERIOD_WORKFLOW_SPEC` (کلید و نوع `fleet_period`، عنوان «کارکرد ماهانهٔ ناوگان»)، نمونهٔ جدا روی همان دوره (مثل حقوق): `supervisor_ok` (`perm_approve_fleet_supervisor`)، `accountant_review` (`perm_approve_fleet_finance`؛ گیت: هر خودروی کرایه‌ای دارای تردد، شبای معتبر دارد؛ وگرنه `action_blocked` با فهرست پلاک‌ها)، `manager_ok` (`perm_approve_fleet_manager`، مبلغ = جمع قابل پرداخت؛ تأیید و عودت، **بی رد**)، `treasury_pay` (`perm_treasury_disburse_action`، EXECUTE، کد رهگیری اجباری؛ پرداخت و عودت). `section_field='section'`، `company_field='company'`، `view_permission='view_sys_fleet_attendance'`، مسیر `/app/finance/employee-fleet?period={id}`.
  - شروع (`submit`) به دست ثبت‌کنندهٔ تردد یا سرپرست، فقط اگر دوره دست‌کم یک تردد دارد و کار باز ناوگان ندارد.
  - **قفل ناوگان** `is_fleet_locked(period)` = کار باز ناوگان از `supervisor_ok` به بعد، یا ترددهای تسویه‌شده. همهٔ نوشتن‌های تردد (`perform_create/update`، `bulk-save`، `update-day-trip`، `bulk-save-monthly-grid`، ورود اکسل ماهانه، حذف) در دورهٔ قفل 400 `fleet_locked`. عودت قفل را باز می‌کند. قفل و وضعیت کارکرد پرسنل (۴.۴) روی تردد اثری ندارد.
  - پایان `treasury_pay` ← همهٔ ترددهای تسویه‌نشدهٔ خودروهای کرایه‌ای همان دوره در همان تراکنش تسویه می‌شوند (`select_for_update`، کد رهگیری، رویداد `FLEET_TRIP_SETTLED`)؛ خودروی شرکتی تسویهٔ صفر نمی‌گیرد. `disburse_fleet_trips` تابع درونی قلاب این گام می‌شود.
- **د۶. خزانه** (الگوی د۶ طرح ۴.۵).
  - فهرست ناوگان آمادهٔ پرداخت در `get_pending_treasury_batches` از کارهای باز `treasury_pay` ناوگان (در دامنهٔ کاربر) ساخته می‌شود، نه از «هر تردد تسویه‌نشدهٔ خودروی مصوب».
  - `disburse_fleet` در کارتابل خزانه `period_id` می‌گیرد و پوستهٔ نازک روی اقدام موتور در گام `treasury_pay` است؛ فقط `trip_ids` بی دوره 400 `fleet_period_required`؛ ورودی نامعتبر 400 و شناسهٔ ناموجود یا بیرون از دامنه **404** (نه 500).
- **د۷. تسویه و خلاصهٔ ماهانه (ق۶، ق۱۰، ق۱۸).**
  - `calculate_monthly_fleet_settlement` دامنه می‌گیرد: `period_id` یا `section_id + year_month` (دورهٔ بخش)؛ مسیر `warehouse_id` قدیمی می‌ماند، ولی **بی هیچ شناسه، فقط شرکت‌های مجاز کاربر** (امضای فعلی برای نگهبان می‌ماند؛ دامنه در نما اعمال می‌شود). فقط خودروهای `approved` یا دارای تردد در آن دوره.
  - فرمول و ستون‌ها همان امروز (تعداد × نرخ؛ شرکتی صفر) و ساختار اکسل ماهانه و بانک ملی دست نمی‌خورد، تا کاربر فایل مرجع بدهد (§۶، ن۱). خروجی‌ها قاعدهٔ اکسل ق۱۰ را دارند (سربرگ دو ردیفی، `freeze_panes='A3'`، زمان شمسی) اگر ندارند.
  - `FleetSettlementViewSet`: `view_sys_fleet_settlement` در بخش دوره یا در شرکت (403 بی مجوز؛ دورهٔ بیرون از دامنه 404). وضعیت گردش ناوگان و «تأییدشده یا نه» در `summary` می‌آید؛ **اکسل بانک فقط برای دوره‌ای که تأیید مدیر گرفته** (وگرنه 400 `fleet_not_approved`).
  - حساب اصلی با `prefetch_related` (بی N+1)؛ تست با ۳۰۰ خودرو و `assertNumQueries` ثابت.
- **د۸. دامنه و دادهٔ حساس (ق۶، ق۱۶)** (الگوی د۶ طرح ۴.۳).
  - فیلدهای حساس: `driver_national_code`، `owner_national_code`، `account_number`، `sheba_number` روی خودرو؛ `account_number`، `sheba_number`، `card_number`، `account_owner_national_code` روی حساب بانکی؛ همان کلیدها در `proposed_changes`/`previous_values` درخواست تغییر؛ و در خروجی تسویه.
  - دید کامل `can_view_vehicle_sensitive(user, vehicle, cache)`: مدیر کل، خود راننده (`user`)، ثبت‌کننده تا وقتی `draft`/`revision_required` است، و دارندهٔ `perm_approve_fleet_finance`، `perm_approve_fleet_manager` (یا نام مستعار مدیر)، `view_sys_fleet_settlement` یا `perm_treasury_disburse_action` **در بخش همان خودرو**. بقیه (سرپرست و کارمند) `mask_tail` (چهار رقم آخر).
  - نوشتن مقدار ستاره‌دار نادیده گرفته می‌شود (بی 400، تا صف آفلاین پاک نشود). اکسل خروجی پرونده‌ها همان قاعده. مدرک‌های خودرو (`documents`) فقط برای دید کامل و بارگذارنده.
  - مجوز هر مرحله در **بخش خودرو** سنجیده می‌شود (موتور)، نه سراسری.
- **د۹. صفحه‌بندی (ق۱۸).** فهرست خودرو و درخواست تغییر الگوی `InvoicePagePagination` (فقط با `page`)؛ `select_related`/`prefetch_related` بی پرس‌وجو در سریالایزر.
- **د۱۰. آفلاین (ق۳).** ساخت و ویرایش پیش‌نویس خودرو و ثبت تردد در دورهٔ باز مثل امروز آفلاین می‌مانند. ارسال، تأیید، عودت، رد، درخواست تغییر، ارسال کارکرد ماهانه، پرداخت و خروجی‌ها فقط آنلاین‌اند. ترددی که از صف آفلاین به دورهٔ قفل برسد 400 `fleet_locked` می‌گیرد (رد صریح، طبق قانون صف حذف می‌شود و کاربر پیام می‌بیند)؛ هیچ مسیر حذف دادهٔ تازه‌ای باز نمی‌شود. سریالایزر هیچ فیلد تازهٔ لازمی نمی‌خواهد.
- **د۱۱. بی migration ساختاری.** وضعیت‌ها و فیلدها همان؛ اگر -ب فیلدی لازم دید، فقط افزودنی و با مهارت `safe-migration`.
- **د۱۲. spec های فرانت.** `supervisor-attendance-and-lock.dom.spec.ts` با API فعلی کامپوننت‌های ۴.۴-ج بازنویسی می‌شود (همان سناریوها)، تا `ng test` دوباره کامپایل شود. شکست `employee-new-vehicle.dom.spec.ts` پس از آن در ۴.۶-ج ریشه‌یابی و درست می‌شود (اگر رفتار کامپوننت درست است، spec؛ وگرنه کامپوننت).

## ۳. کارها (هر زیرمرحله در گفتگوی جدا و با کامیت جدا)

- **۴.۶-ب — سرور** — دو تکهٔ پشت سر هم (فایل مشترک `workflows.py`):
  - **ب۱، اجراکنندهٔ Opus + high** (دامنه و دادهٔ حساس): د۱، د۲، د۳، د۴، د۸، د۹ — `workflows.py` (بخش تازهٔ خودرو)، `fleet_lifecycle_services.py`، `views_domains/fleet_views.py`، `serializers_domains/fleet.py`، `models_domains/fleet.py` (فقط property های `wf_*`)، `apps.py` (ثبت spec و قلاب‌ها)، دستور `management/commands/fleet_open_workflows.py`.
  - **ب۲، اجراکنندهٔ Opus + high** (پول، همزمانی، دامنه): د۵، د۶، د۷ — `workflows.py` (بخش ناوگان ماهانه)، `views_domains/trip_views.py`، `fleet_settlement_engine.py`، `views_domains/payroll_views.py` (فقط `FleetSettlementViewSet`)، `treasury_engine.py`، `cartable_views.py` (فقط شاخهٔ `disburse_fleet`). تست‌هایی که مسیر قدیمی را می‌سنجند (`test_fleet_scenarios_10_vehicles.py`، `test_role_based_cartables.py`، `test_cartable_multitenant.py`) هماهنگ می‌شوند؛ `phase_guardian_approval.py` دست نمی‌خورد.
  - `tenant-scope-reviewer` روی diff ۴.۶-ب.
  - **سهم آنتی‌گرویتی** (یک نشست، ≤ ۸ مورد، دو فایل): (۱) د۱۲ بازنویسی `supervisor-attendance-and-lock.dom.spec.ts` (فرانت، بی هم‌پوشانی با سرور؛ از ابتدای ۴.۶-ب)؛ (۲) پس از کامیت ب۱، تست‌های API دامنه و پوشش §۴ (د۸) در فایل جدای `test_fleet_46_scope.py`.
- **۴.۶-ج — فرانت** — اجراکنندهٔ Sonnet + medium:
  - `employee-new-vehicle`، `supervisor-fleet`، `accountant-fleet`، `manager-fleet`، بخش خودروی `supervisor-new-profiles`/`accountant-new-profiles`: وضعیت گردش و پیوند «سابقه و پیگیری در کارهای من»؛ تأیید و عودت از «کارهای من» (`/app/my-tasks?workflow=vehicle_profile`)؛ پیام `action_blocked` با فهرست فیلدهای ناقص؛ مقدارهای پوشیده؛ صفحه‌بندی.
  - `employee-fleet` (کارکرد ماهانه): انتخاب بخش و ماه روی دورهٔ بخش، دکمهٔ «ارسال کارکرد ماهانه»، وضعیت گردش ناوگان، پیام `fleet_locked` و غیرفعال شدن ویرایش در دورهٔ قفل.
  - `treasurer-disbursements`: فهرست ناوگان از کارهای `treasury_pay` و پرداخت دوره با کد رهگیری (`period_id`)؛ اکسل بانک فقط برای دورهٔ تأییدشده.
  - درست کردن شکست `employee-new-vehicle.dom.spec.ts` (د۱۲)؛ حذف کد بی‌استفادهٔ تأیید قدیمی و اکشن‌های پوسته‌ای که فراخوانی ندارند (د۳).
  - همهٔ دکمه‌های گردش و پرداخت در آفلاین غیرفعال با پیام (د۱۰)؛ ق۱۲ در ۳۶۰ پیکسل.
  - `ui-reviewer` روی diff.
  - **سهم آنتی‌گرویتی:** spec های DOM (ارسال کارکرد، قفل، پرداخت دوره، آفلاین) و متن‌های فارسی؛ تست‌های سناریوی گردش ناوگان ماهانه در `test_fleet_46_workflow.py`.

## ۴. تست‌ها

- **گردش خودرو (د۱ تا د۳):** پیش‌نویس ← ارسال ← سرپرست ← حسابدار (بی شبا `action_blocked`) ← مدیر ← `approved` و فعال؛ ثبت سرپرست از `supervisor_ok` رد می‌شود؛ مدیر نمی‌تواند حسابدار را دور بزند؛ مجوز سرپرست بخش دیگر 403؛ عودت ← `revision_required` و ارسال دوباره از اول؛ رد با دلیل اجباری؛ تأیید گروهی نتیجهٔ هر ردیف؛ اکشن‌های قدیمی همان پاسخ.
- **درخواست تغییر (د۲):** پایان ← تغییر اعمال و `has_pending_changes` پاک؛ اعمال نامعتبر کل اقدام را برمی‌گرداند؛ لغو به دست ثبت‌کننده پیش از اولین اقدام.
- **سازگاری (د۴):** `fleet_open_workflows` دو بار اجرا شود، نمونهٔ تکراری نمی‌سازد؛ `--dry-run` چیزی نمی‌نویسد.
- **کارکرد ماهانه (د۵):** تردد بخش‌دار به دورهٔ بخش وصل می‌شود؛ ارسال ← سرپرست ← حسابدار (شبای ناقص `action_blocked`) ← مدیر ← خزانه با کد رهگیری ← همهٔ ترددهای کرایه‌ای `is_settled`؛ در دورهٔ قفل همهٔ مسیرهای نوشتن 400 `fleet_locked`؛ عودت قفل را باز می‌کند؛ دو پرداخت همزمان یکی می‌شود؛ قفل کارکرد پرسنل روی تردد اثر ندارد.
- **خزانه (د۶):** ناوگان بی تأیید مدیر در فهرست خزانه نیست؛ `disburse_fleet` با دورهٔ ناموجود یا شرکت دیگر 404؛ ورودی نامعتبر 400 (نه 500)؛ فقط `trip_ids` 400 `fleet_period_required`.
- **تسویه (د۷):** کاربر بی `view_sys_fleet_settlement` 403؛ دورهٔ شرکت دیگر 404؛ بی شناسه فقط شرکت‌های مجاز؛ اکسل بانک دورهٔ تأییدنشده 400 `fleet_not_approved`؛ ۳۰۰ خودرو با تعداد پرس‌وجوی ثابت؛ عددها همان فرمول امروز (تست‌های فعلی سبز).
- **دادهٔ حساس (د۸):** سرپرست و کارمند کد ملی و شبای راننده و مالک را پوشیده می‌بینند (پرونده، حساب بانکی، درخواست تغییر، اکسل، تسویه)؛ حسابدار و مدیر بخش کامل؛ حسابدار بخش دیگر پوشیده یا 404؛ ذخیرهٔ مقدار ستاره‌دار داده را عوض نمی‌کند.
- **موجود:** تست‌های ناوگان و کارتابل بالا، `test_sheba_validation.py`، `test_section_guardian.py`، `core/workflow/tests` سبز می‌مانند.
- **فرانت:** spec های DOM؛ `ng test` دوباره کامپایل می‌شود (د۱۲)؛ نگهبان‌های 29، 52، 56، 57، 58، 59.
- در هر زیرمرحله فقط تست‌های سریع؛ مجموعهٔ کامل در بررسی سنگین پایان مرحلهٔ ۴.

## ۵. معیار پذیرش

- پرونده و درخواست تغییر خودرو فقط از راه موتور ۲.۳ (کارهای من، سابقه، جانشین، اعلان) تصویب می‌شوند و کسی حسابدار را دور نمی‌زند.
- کارکرد ماهانهٔ ناوگان هر بخش پیش از پرداخت تأیید سرپرست، حسابدار و مدیر را می‌گیرد و خزانه فقط با کد رهگیری پرداخت می‌کند؛ پس از ارسال، تردد آن ماه قفل است.
- هیچ کاربری خودرو، تردد یا تسویهٔ بیرون از دامنه را نمی‌بیند؛ شبا و کد ملی فقط برای دارندهٔ مجوز کامل است (ق۶، ق۱۶)؛ شناسهٔ نادرست 404 است، نه 500.
- فهرست‌ها و تسویه با دادهٔ زیاد کند نمی‌شوند (ق۱۸).
- `ng test` کامل دوباره کامپایل و اجرا می‌شود و spec خودرو سبز است.
- سناریوی کامل ناوگان (تعریف خودرو، تردد ماهانه، تأیید، پرداخت) با همهٔ نقش‌ها روی وب و اندروید بی خطا (بررسی سنگین پایان مرحلهٔ ۴).

## ۶. نکته‌های باز

تصمیم‌های زیر بی پرسش گرفته شدند؛ اگر کاربر جور دیگری بخواهد، پیش از اجرای زیرمرحلهٔ مربوط گفته شود:
- **ن۱ (۴.۶-ب):** اکسل مرجع (`TirSalary.xlsm`) برگهٔ ناوگان ندارد. فرمول (تعداد سرویس × نرخ؛ خودروی شرکتی صفر) و ساختار اکسل ماهانه و بانک ملی همان امروز می‌ماند. اگر کاربر فایل مرجع خلاصهٔ سرویس ناوگان دارد، بدهد تا مطابقش شود.
- **ن۲ (۴.۶-ب):** کارکرد ماهانهٔ ناوگان گردش تأیید تازه می‌گیرد (سرپرست ← حسابدار ← مدیر ← خزانه). امروز خزانه هر تردد خودروی مصوب را بی تأیید ماهانه پرداخت می‌کند.
- **ن۳ (۴.۶-ب):** مدیر کارکرد ماهانهٔ ناوگان را رد نمی‌کند، فقط برای اصلاح عودت می‌دهد (مثل حقوق).
- **ن۴ (۴.۶-ب):** سرپرست کد ملی و شبای راننده را پوشیده (چهار رقم آخر) می‌بیند، مثل پروندهٔ پرسنل.
- بررسی پشت ورود صفحه‌های ناوگان روی `app` ← بررسی سنگین پایان مرحلهٔ ۴ (آنتی‌گرویتی). `fleet_open_workflows` روی `app` در انتشار بعدی (آنتی‌گرویتی).

## ۷. گزارش پیشرفت

- **۵ آبان ۱۴۰۵ — «۴-الف»:** اسکلت نوشته شد. **اقدام بعدی:** ۴.۶-الف پس از ۴.۵.
- **۶ آبان ۱۴۰۵ — «۴.۶-الف»:** طرح کامل شد (§۱ تا §۶). پرسشی پرسیده نشد؛ تصمیم‌های قابل بازنگری در §۶ (ن۱ تا ن۴).
  - **یافته‌ها:** تسویهٔ ناوگان (`FleetSettlementViewSet`) برای هر کاربر واردشده شبا و کد ملی رانندگان همهٔ شرکت‌ها را می‌دهد؛ مجوز مرحله‌های خودرو سراسری سنجیده می‌شود و مدیر جای حسابدار را پر می‌کند؛ کارکرد ماهانهٔ ناوگان تأیید ندارد و خزانه هر تردد را مستقیم پرداخت می‌کند؛ قفل تردد فقط با دورهٔ انبار‌دار است؛ اکسل مرجع برگهٔ ناوگان ندارد؛ `prompt()` در ۴.۳-ج برداشته شده بود؛ `supervisor-attendance-and-lock.dom.spec.ts` (مانده از ۴.۴-ج) کامپایل همهٔ `ng test` را می‌شکند (د۱۲).
  - **تصمیم‌ها:** د۱ تا د۴ پرونده و درخواست تغییر خودرو روی موتور (الگوی ۴.۳)؛ د۵ و د۶ کارکرد ماهانهٔ ناوگان روی دورهٔ بخش با گردش `fleet_period` و پرداخت خزانه روی موتور (الگوی ۴.۵)؛ د۷ دامنهٔ تسویه و بی N+1؛ د۸ پوشش دادهٔ حساس؛ د۹ صفحه‌بندی؛ د۱۰ آفلاین؛ د۱۱ بی migration؛ د۱۲ درست کردن spec ها.
  - **اقدام بعدی:** ۴.۶-ب (سرور، دو تکهٔ Opus + high پشت سر هم، و نشست آنتی‌گرویتی) با بریف `scratch/brief_4_6_b.md`.
- **۶ آبان ۱۴۰۵ — «۴.۶-ب»:** سرور ناوگان انجام شد (ب۱ `a9f4aa09`، ب۲ و رفع یافته‌ها در کامیت `feat(release-v1 4.6-b)` بعدی؛ spec آنتی‌گرویتی `e7de1dce`).
  - **ب۱ (د۱ تا د۴، د۸، د۹):** `VEHICLE_PROFILE_WORKFLOW_SPEC` و `VEHICLE_CHANGE_WORKFLOW_SPEC` در `workflows.py`؛ اکشن‌های قدیمی پوستهٔ نازک روی موتور؛ `approve_vehicle_stage` و `auto_pass_vehicle` و دور زدن حسابدار حذف شد؛ دستور `fleet_open_workflows`؛ پوشش کد ملی، حساب و شبا با `can_view_vehicle_sensitive`؛ صفحه‌بندی فقط با `page`. مسیر خودروی موتور قدیمی (`workflow_engine.py`) حذف و کارتابل عمومی برای خودرو 400 می‌دهد.
  - **ب۲ (د۵ تا د۷، د۱۰):** `FLEET_PERIOD_WORKFLOW_SPEC` (سرپرست ← حسابدار با گیت شبا ← مدیر ← خزانه با کد رهگیری؛ همهٔ مرحله‌ها فقط تأیید و عودت)؛ قفل `is_fleet_locked` روی همهٔ مسیرهای نوشتن تردد (400 `fleet_locked`)؛ تسویهٔ ترددها در همان تراکنش پرداخت با `select_for_update`؛ فهرست خزانه از کارهای `treasury_pay`؛ `disburse_fleet` با `period_id` (404/400، `fleet_period_required`)؛ تسویه با دامنه، بی N+1، `fleet_not_approved`؛ API تازه: `POST trips/submit-fleet-period/`، `GET trips/fleet-period-status/`.
  - **انحراف‌ها:** مرحلهٔ مدیر خودرو فقط `perm_approve_fleet_manager` (موتور یک مجوز می‌گیرد)؛ رد هرگز حذف نمی‌کند؛ عودت همیشه به ثبت‌کننده؛ `disburse_fleet_trips` امضای قدیمی را برای نگهبان نگه داشت؛ اکسل بانک بی سربرگ دو ردیفی (فایل درگاه بانک) و بی پوشش (فقط دارندهٔ مجوز تسویه و دورهٔ تأییدشده)؛ فیلدهای تسویهٔ تردد در سریالایزر فقط‌خواندنی شدند.
  - **بازبینی:** `tenant-scope-reviewer` دو بار و `data-loss-reviewer` یک بار؛ رفع شد: حساب بانکی و کارتابل‌ها بی context پوشیده نمی‌شدند، metadata سابقهٔ خودرو پوشیده نبود، `@transaction.atomic` از `advance_workflow_step` جدا شده بود، مجوز مالی ویرایش سراسری بود، جست‌وجوی بخشی کد ملی، خودروی شرکت دیگر در ثبت تردد، حذف سخت تردد. مبنای نگهبان 58 به‌روز شد (کاهش). ۹ تست قدیمی `tests_vehicle_cycle.py` با رفتار عمدی تازه هماهنگ شد.
  - **تست‌ها:** مجموعهٔ سریع ناوگان و کارتابل و حقوق و `workflow` سبز؛ `check`، `makemigrations --check`، نگهبان‌های 29، 52، 56، 57، 58، 59 سبز. آنتی‌گرویتی: spec سرپرست ۱۴ سبز (د۱۲)؛ تست‌های دامنهٔ `test_fleet_46_scope.py` در نشست دوم.
  - **باز:** `is_vehicle_global_auditor` (`scope_helpers.py:183`) سراسری است (دارندهٔ مجوز مالی ناوگان در یک بخش فهرست خودروهای همهٔ بخش‌های شرکت‌های مجازش را می‌بیند؛ داده پوشیده و نوشتن بخشی)؛ `fleet_open_workflows` روی `app` در انتشار بعدی.
  - **اقدام بعدی:** ۴.۶-ج (فرانت) با بریف `scratch/brief_4_6_c.md`.

</div>
