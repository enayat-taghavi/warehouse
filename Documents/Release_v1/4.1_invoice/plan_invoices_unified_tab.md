<div dir="rtl" align="right">

# طرح تب یکپارچهٔ «فاکتورها»

تاریخ: ۹ آبان ۱۴۰۵ (31 Oct 2026) — وضعیت: **انجام شد** (۹ آبان ۱۴۰۵)

## هدف

در منوی سرپرست، حسابدار، مدیر و خزانه‌دار فقط یک آیتم «فاکتورها» باشد. کاربر هم فاکتور ثبت می‌کند و هم کار نقش خودش را انجام می‌دهد: تایید، ممیزی، صدور مجوز پرداخت یا پرداخت.
**تن‌خواه کاملاً جداست** و هیچ بخشی از آن داخل این تب نمی‌آید.

## وضع فعلی (کد)

| نقش | آیتم‌های فعلی منو (`frontend/src/app/modules/accounting/nav-items.ts`) |
|---|---|
| سرپرست | `employee-invoices` «ثبت فاکتور» (خط 35) + `supervisor-invoices` «تایید فاکتورها» (خط 36) |
| حسابدار | `employee-invoices` (خط 45) + `accountant-invoices` «ممیزی فاکتورها» (خط 46) |
| مدیر | `employee-invoices` (خط 60)؛ تایید فاکتور زیرتب `invoices` در `manager-approvals` است (`manager-approvals.ts` خط 37، 310، 859–941) |
| خزانه‌دار | `employee-invoices` (خط 68) + `treasurer-invoices` «تسویه فاکتور و تن‌خواه» (خط 69)؛ این صفحه دو زیرتب دارد: `payable_invoices` و `petty_cash_refills` (`treasurer-invoices.ts` خط 87–92) |

- صفحهٔ سرپرست و حسابدار خودشان زیرتب وضعیت دارند (`pending/approved/all` و `pending_audit/booked/all`).
- بک‌اند جلوی تایید فاکتور خود را می‌گیرد (کد `self_approval`)؛ خزانه‌دارِ ثبت‌کننده فقط مرحلهٔ پرداخت را برای فاکتور خودش انجام می‌دهد (`creator_may_act` در `workflows.py` خط 108).
- منوی کارمند (`EMPLOYEE_NAV_ITEMS`) در این طرح عوض نمی‌شود.

## تصمیم‌ها

- ت۱. مسیر تازه: `/app/finance/invoices` با شناسهٔ منو `invoices` و برچسب «فاکتورها». یک آیتم، به‌جای دو آیتم، در منوی چهار نقش.
- ت۲. صفحهٔ تازه `InvoicesHubComponent` فقط پوسته است. دو زیرتب بالا دارد (پارامتر آدرس `view`):
  1. **«کارتابل»** (`view=cartable`، پیش‌فرض): صفحهٔ نقش فعال کاربر (`AppPersonaService.activeRole`) به همان شکل امروز، با زیرتب‌های وضعیت خودش.
     - سرپرست ← `SupervisorInvoicesHubComponent`
     - حسابدار ← `AccountantInvoicesHubComponent`
     - مدیر ← `ManagerInvoicesComponent` (تازه، بند ت۴)
     - خزانه‌دار ← `TreasurerInvoicesComponent` فقط با فاکتورهای آماده پرداخت (بند ت۵)
     - برچسب زیرتب به نقش بستگی دارد: «تایید فاکتورها» / «ممیزی» / «مجوز پرداخت» / «پرداخت»، با شمارندهٔ موارد منتظر.
  2. **«فاکتورهای من»** (`view=mine`): همان `EmployeeInvoicesHubComponent` (ثبت و پیگیری فاکتورهای خود کاربر).
- ت۳. منطق، APIها و مجوزها عوض نمی‌شوند. اجزای فعلی درون پوسته نشانده می‌شوند. ظاهر زیرتب‌ها با `TabBarComponent` و قاعدهٔ §7 فایل `.agents/AGENTS.md` (موبایل: آیکن + برچسب کوتاه).
- ت۴. **مدیر:** بخش فاکتور از `manager-approvals` بیرون می‌آید و جزء تازهٔ `manager-invoices` می‌شود (لیست، تایید، بازنگری، PDF). زیرتب `invoices` از کارتابل تاییدات حذف می‌شود. تن‌خواه مدیر در «کارتابل تاییدات» می‌ماند.
- ت۵. **خزانه‌دار:** زیرتب `petty_cash_refills` از `treasurer-invoices` بیرون می‌آید و صفحهٔ جدای `treasurer-petty-cash` با آیتم منوی تازهٔ «تن‌خواه» در منوی خزانه‌دار می‌شود. `treasurer-invoices` فقط فاکتورهای آماده پرداخت را نشان می‌دهد.
- ت۶. **مسیرهای قدیمی می‌مانند و هدایت می‌شوند** تا لینک اعلان‌ها، «کارهای من» و نشانک‌ها نشکنند:
  - `supervisor-invoices`، `accountant-invoices`، `treasurer-invoices` ← `invoices?view=cartable` (پارامترهای `tab`، `section_id`، `q` و `invoice` حفظ شوند).
  - `manager-approvals?tab=invoices` ← `invoices?view=cartable`.
  - `treasurer-invoices?tab=petty_cash_refills` ← `treasurer-petty-cash`.
  - `employee-invoices` برای کارمند همان صفحهٔ مستقل می‌ماند؛ لینک بک‌اند `/app/finance/employee-invoices?invoice={id}` (`workflows.py` خط 114) بدون تغییر کار می‌کند.
- ت۷. **دسترسی:**
  - `route-access.ts`: ورودی `invoices` = اجتماع مجوزهای فعلی چهار صفحه (`perm_invoice_record`، `perm_invoice_approve`، `perm_invoice_review`، `perm_treasury_disburse_action`، مجوز مدیر، `admin_all`).
  - هر زیرتب فقط وقتی نشان داده می‌شود که کاربر مجوز همان صفحهٔ قبلی را داشته باشد. اگر کاربر فقط مجوز ثبت دارد، فقط «فاکتورهای من» دیده می‌شود.
  - `isAccountingRouteDeniedForRole` در `personas.ts`: مسیر `/invoices` برای چهار نقش آزاد و برای `org_admin` بسته.
  - `treasurer-petty-cash` با همان مجوز `perm_treasury_disburse_action`.
- ت۸. کاربر چندنقشه: کارتابل بر اساس نقش فعال است. با عوض کردن نقش از منوی کاربر، کارتابل همان نقش می‌آید (مثل امروز).
- ت۹. فاکتور خود کاربر در «کارتابل» تاییدپذیر نیست. اگر لیست کارتابل فعلی آن را نشان می‌دهد، دکمهٔ اقدام برایش نمایش داده نشود (بک‌اند همین حالا رد می‌کند؛ این فقط برای ظاهر است). استثنا: پرداخت فاکتور خود خزانه‌دار (`creator_may_act`).

## زیرگام‌ها

### الف — پوسته و منو (Claude + اجراکنندهٔ Sonnet/medium)
- `InvoicesHubComponent` تازه در `components/finance/invoices-hub/`.
- مسیر `invoices` در `accounting.routes.ts` و `module.ts` (هدایت قدیمی خط 68 به بعد).
- `nav-items.ts`: در چهار منو، دو آیتم با یک `invoices` «فاکتورها» جایگزین شود.
- `route-access.ts`، `personas.ts`، عنوان صفحه در `layout.ts` (حدود خط 1404–1436).
- هدایت مسیرهای قدیمی (ت۶) به‌جز مدیر و تن‌خواه خزانه‌دار.
- در این زیرگام کارتابل مدیر موقتاً همان لینک «کارتابل تاییدات» است.

### ب — جداسازی فاکتور مدیر (Claude)
- جزء `manager-invoices` از `manager-approvals.ts` (خطوط 69، 159، 231، 310–316، 859–941 و بخش قالب) با همان APIها.
- حذف زیرتب `invoices` از `manager-approvals` و هدایت `?tab=invoices`.

### ج — جداسازی تن‌خواه خزانه‌دار (Claude + اجراکنندهٔ Sonnet/medium)
- صفحهٔ `treasurer-petty-cash` از بخش `petty_cash_refills` و `refillPettyCash` (`treasurer-invoices.ts` حدود خط 237–260 و 613–660 و قالب).
- آیتم منوی «تن‌خواه» در `TREASURER_NAV_ITEMS`، مسیر، دسترسی و هدایت `?tab=petty_cash_refills`.
- `treasurer-invoices` بدون زیرتب تن‌خواه.

### د — تست‌ها و اسناد (Antigravity، کم‌خطر)
- به‌روزرسانی specها: `nav-items-35.spec.ts`، `route-access.characterization.spec.ts`، `app.legacy-redirects.spec.ts`، `finance-operations-workflow.dom.spec.ts`، `treasurer-invoices*.spec.ts`، `manager-approvals.dom.spec.ts`.
- spec تازهٔ DOM برای پوسته: انتخاب کارتابل بر اساس نقش، پنهان شدن زیرتب بدون مجوز، هدایت مسیرهای قدیمی.
- سناریوهای Playwright: `03a`، `03b`، `03c` و طرح ویدیوهای آموزشی و `manual_test_guide.md`.
- `section_guardian.py` خط 444 و 704 اگر به نام صفحه‌ها وابسته است.

## معیار پذیرش

- در منوی هر چهار نقش فقط یک «فاکتورها» هست و هیچ آیتم فاکتوری دیگری نیست.
- در هیچ صفحهٔ «فاکتورها» اثری از تن‌خواه نیست؛ تن‌خواه خزانه‌دار در آیتم جدای خودش است.
- همهٔ لینک‌های قدیمی به جای درست می‌روند.
- کاربری که فقط مجوز ثبت دارد کارتابل نمی‌بیند؛ نقش‌های دیگر کارتابل نقش خود را می‌بینند.
- تست‌های سریع مربوط، گاردین‌های 29، 52، 56، 57، 58 سبز؛ `tenant-scope-reviewer` روی تغییر دسترسی‌ها.

## گزارش پیشرفت

- ۹ آبان ۱۴۰۵: طرح نوشته شد و کاربر تایید کرد.
- ۹ آبان ۱۴۰۵: **زیرگام‌های الف، ب و ج انجام شد** (در یک چت، چون هر سه کوچک بودند و فایل مشترک داشتند).
  - الف: `InvoicesHubComponent` (`components/finance/invoices-hub/`)، مسیر `invoices`، آیتم «فاکتورها» در چهار منو، `route-access.ts` (کلید `invoices` و `treasurer-petty-cash`)، عنوان صفحه در `layout.ts`. مسیرهای `supervisor-invoices`، `accountant-invoices`، `treasurer-invoices` (و شکل‌های `x/invoices`) به `invoices` هدایت می‌شوند؛ `treasurer-invoices?tab=petty_cash_refills` به `treasurer-petty-cash`.
  - ب: `ManagerInvoicesComponent` (`components/finance/manager/manager-invoices/`) با همان APIها و بازخوانی زنده؛ زیرتب `invoices` و منطقش از `manager-approvals` حذف شد؛ `manager-approvals?tab=invoices` به `invoices?view=cartable` می‌رود.
  - ج: `TreasurerPettyCashComponent` (`components/finance/treasurer/treasurer-petty-cash/`) با آیتم منوی «تن‌خواه» خزانه‌دار؛ `treasurer-invoices` فقط فاکتورهای آماده پرداخت را دارد.
  - انحراف‌ها:
    - زیرتب «کارتابل» شمارنده ندارد؛ هر صفحهٔ نقش شمارندهٔ وضعیت خودش را دارد و شمارندهٔ پوسته درخواست اضافه به سرور می‌خواست.
    - ت۹ (پنهان کردن دکمهٔ اقدام روی فاکتور خود کاربر) انجام نشد؛ بک‌اند همین حالا با `self_approval` رد می‌کند.
    - `personas.ts` تغییر نکرد؛ مسیر `/invoices` برای چهار نقش آزاد و برای `org_admin` بسته است (در spec آزموده شد).
    - مجوز آیتم منو برای کاربر بدون نشانگر نقش، مجوز اقدام همان نقش است؛ کاربرِ فقط با مجوز ثبت، «ثبت فاکتور» را از منوی کارمند می‌بیند.
  - تست‌ها: spec تازهٔ پوسته (۷ مورد)، `manager-invoices` و `treasurer-petty-cash`؛ به‌روزرسانی `nav-items-35`، `route-access.characterization`، `treasurer-invoices.spec`، `manager-approvals(.dom).spec`. ۱۰ فایل spec سبز. `ngc` روی کل برنامه بی‌خطا. گاردین‌های 29، 52، 56، 57، 58 سبز.
  - نکته: specهای `components/personnel/**` در `tsconfig.spec.json` کنار گذاشته شده‌اند و در اجرای عادی اجرا نمی‌شوند؛ این بار با tsconfig موقت اجرا و سبز شدند.
  - بررسی نشده: دیدن صفحه در مرورگر (پشت ورود است) و reviewerها (تغییر فقط در فرانت است و دسترسی بک‌اند عوض نشده).
- **باقی‌مانده (زیرگام د، کم‌خطر):** سناریوهای Playwright `03a`/`03b`/`03c`، طرح ویدیوهای آموزشی و `manual_test_guide.md` با نام‌های تازهٔ منو؛ بررسی دیداری صفحه با هر چهار نقش در بررسی‌های پایان مرحله.
- ۹ آبان ۱۴۰۵: **زیرگام د انجام شد؛ طرح بسته شد.**
  - Antigravity (commit `4f2ec921`): سناریوهای `03b` و `03c` و زیرنویس‌هایشان، جدول و گزارش طرح ویدیوها و ردیف‌های ۱.۱۱ تا ۱.۱۶ راهنمای آزمون دستی با منوی «فاکتورها» و «تن‌خواه». `03a` عوض نشد (کارمند همان «ثبت فاکتور» را دارد). همهٔ خط‌های verify سبز.
  - ایراد کار Antigravity: نیم‌فاصله‌ها در متن‌های فارسی افتاده بود؛ Claude درست کرد.
  - بررسی مرورگر روی `localhost:4300` با چهار حساب موقت `qa_*` (پس از بررسی پاک شدند): هر نقش در منو یک «فاکتورها» دارد، کارتابل نقش خودش («تایید فاکتورها»، «ممیزی فاکتورها»، «مجوز پرداخت فاکتورها»، «پرداخت فاکتورها») پیش‌فرض است و «فاکتورهای من» کنارش؛ در فاکتورهای خزانه‌دار اثری از تن‌خواه نیست و «تن‌خواه» آیتم جداست. لینک‌های قدیمی `supervisor-invoices`، `accountant-invoices?tab=booked` (زیرتب حفظ می‌شود) و `treasurer-invoices?tab=petty_cash_refills` درست هدایت شدند.
  - ایراد پیداشده و رفع‌شده: `manager-approvals?tab=invoices` با بار اول صفحه هدایت نمی‌شد (هدایت داخل جزء بود). یک گارد `canActivate` در مسیر `manager-approvals` (`accounting.routes.ts`) گذاشته شد و در مرورگر آزموده شد؛ هدایت داخل جزء برای تغییر زیرتب درون صفحه ماند.
  - تست‌ها: `tsc` برنامه و پروژهٔ Playwright بی‌خطا؛ گاردین‌های 29، 52، 56، 57، 58 سبز.
  - مانده: آزمون و ضبط دوبارهٔ فیلم‌های ۳-ب و ۳-ج (کار زنجیرهٔ ویدیوهای آموزشی)؛ خطای 403 `auth/login-logs/heartbeat/` پس از هر ورود در کنسول دیده شد (به این طرح ربطی ندارد).

</div>
