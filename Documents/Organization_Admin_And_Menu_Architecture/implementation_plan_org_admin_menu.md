<div dir="rtl" align="right">

# طرح بازنگری‌شده: برچیدن منوی عمومی «کارکرد و حسابداری»، انتقال کد به منوهای نقش و نقش تازهٔ «راهبر تشکیلات»

> [!IMPORTANT]
> **وضعیت:** این طرح در ۹ مهر ۱۴۰۵ (۱ اکتبر ۲۰۲۶) بازنویسی شد. مبنای آن ممیزی خط‌به‌خط کد و سرشماری فقط‌خواندنی دیتابیس عملیاتی است و تصمیم‌های کاربر (بند ۰) هم در آن آمده است. اجرای طرح با دستور صریح کاربر آغاز شد. هر گامی که مستقیم روی محیط عملیاتی اثر دارد (build فرانت، ری‌استارت بک‌اند، هر نوشتن در دیتابیس) جداگانه یک تأیید بله/خیر می‌خواهد.
>
> **قاعدهٔ حذف:** هیچ آیتم یا کدی حذف نمی‌شود، مگر آنکه تک‌تک قابلیت‌هایش در منوی نقش مربوط وجود داشته باشد و آزموده شده باشد. جدول‌های بند ۳، ۵ و ۶ ملاک این شرط‌اند.

---

## ۰. تصمیم‌های کاربر (۱ اکتبر ۲۰۲۶)

| موضوع | تصمیم |
| :--- | :--- |
| `finance-cartable` و `treasury-cartable` | قابلیت‌های انحصاری این دو به هاب‌های حسابدار و خزانه‌دار منتقل و آزموده شود. بعد کد قدیمی حذف و مسیرهایشان ریدایرکت شود. |
| تنظیمات پایه حقوق (`base-settings`) | در منوی مدیر و منوی حسابدار، فقط برای مشاهده. حق ویرایش **بدون تغییر** می‌ماند: فقط سوپریوزر یا دارندهٔ `perm_sys_settings`. |
| طرف‌حساب‌ها | صفحهٔ کامل (`CounterpartiesComponent`) جای هاب خالی حسابدار می‌نشیند و بک‌اند نوشتن طرف‌حساب را برای حسابدار باز می‌کند. |
| نقش راهبر تشکیلات | نشانگر نقش، مجوز موجود `perm_manage_projects_sections` است. هیچ مهاجرتی لازم نیست. |
| درون‌ریزی اکسل ساختار و طرف‌حساب (تصمیم دوم، پس از بازبینی تفکیک داده) | درون‌ریزی **شرکت‌محور** ساخته شود: فقط درون شرکت فعالِ مجاز بنویسد. سپس برای راهبر تشکیلات و حسابدار هم باز شود. |
| رخنه‌های قدیمی نویسندگان قدیمی ساختار (مدیران و…) | **همین حالا در همین کار** همان محدودیت شرکت برای آن‌ها هم اعمال و دوباره منتشر شود. |
| فهرست کاربران راهبر تشکیلات | همان‌طور که هست قبول است: فقط اعضای شرکت‌های مجاز، با فیلدهای کمینه. |

---

## ۱. ایرادهای طرح نسخهٔ قبل (یافته‌های ممیزی)

1. **مخاطب منوی عمومی اشتباه فهمیده شده بود.** در `layout.ts`، منوی `ACCOUNTING_NAV_ITEMS` برای هر پنج نقش (کارمند، سرپرست، حسابدار، مدیر، خزانه‌دار) خالی برگردانده می‌شود. پس فقط دارندهٔ `admin_all` یعنی سوپریوزر آن را می‌بیند. کاربران واقعی از راه **هدایت پس از ورود** به صفحه‌های قدیمی می‌رسند:
   - `login.ts` و `change-password.ts` حسابدار، مدیر شرکت و خزانه‌دار را به `finance-cartable` می‌فرستند. مدیر تاییدکننده را به `manager-approvals` و کارمند و سرپرست را به `attendance`.
   - مسیر ریشه (`''`)، `AuthGuard`، دکمهٔ «سامانه مالی» در `operations-layout` و `exitWarehouseMode` در layout هم به `finance-cartable` می‌روند.
   - ریدایرکت `attendance` در ماژول انبار هم به `/app/finance/attendance` اشاره می‌کند.

   طرح قبلی هیچ‌کدام از این مسیرها را ندیده بود.
2. **منوی مدیر:** طرح قبلی `manager-personnel` و `manager-fleet` را از منو انداخته بود. این دو هاب‌های واقعی تصویب مدیر هستند (commit `991906c`). هر دو باید بمانند و `manager-approvals` کنارشان اضافه شود. دلیلش این است که تصویب فاکتور، تنخواه، ارسال و بازگشایی دورهٔ کارکرد، ویرایش پرونده، ارجاع بازنگری پرسنل و تاریخچهٔ گردش‌کار **فقط** در `manager-approvals` هست.
3. **`finance-cartable`: «اعتبارسنجی تیرماه» کافی نیست.**
   - هاب‌های حسابدار دوره را روی «تیر ۱۴۰۵» ثابت کرده‌اند و انتخابگر ماه ندارند. `accountant-payroll`، `accountant-diskettes` و `accountant-fleet` همین مشکل را دارند.
   - در حالی که دیتابیس عملیاتی حقوق شهریور ۱۴۰۵ و دوره‌های سطح انبار را دارد.
   - قابلیت‌های انحصاری که در منوی حسابدار نیست:
     - انتخاب دوره و دامنه (کل شرکت یا یک انبار)
     - **تایید مالی درخواست تغییرات** پرسنل و ناوگان (در منو فقط «رد» هست)
     - یادداشت تایید
     - فیش حقوقی تکی و چاپ آن
     - ورود مالیات با چسباندن متن
     - جدول جزئیات حقوق، فیلتر گروه و شاخص‌های خلاصه (KPI)
     - وضعیت قفل دوره
     - فایل بانکی تسویهٔ ناوگان
     - گزارش خلاصهٔ کارکرد ماهانه
4. **`treasury-cartable`: ادعای «پوشش کامل» نادرست است.** این موارد در `treasurer-disbursements` نیست:
   - پرداخت یکجای دوره (`disburse_period`)
   - تسویهٔ گروهی ناوگان
   - دیسکت ساتنا
   - شناسهٔ دسته (Batch ID)
   - نمایش خطای شبا و علت آن
   - چهار شاخص خلاصه
5. **طرف‌حساب:** `accountant-counterparties` واقعاً یک stub است و هیچ API صدا نمی‌زند. این تأیید شد. اما بک‌اند (`IsOrgStructureManagerOrReadOnly`) ویرایش، حذف و ورود اکسل طرف‌حساب را برای حسابدار رد می‌کند.
6. **`profiles`:**
   - «چاپ کارت» در این کامپوننت نیست؛ در ماژول انبار (`id-cards`) است.
   - قالبش دکمهٔ تایید درخواست تغییر ندارد.
   - مسیرش `view_sys_personnel` می‌خواهد.
7. **`base-settings`:**
   - مسیرش `view_sys_settings` می‌خواهد که هیچ کاربر غیرسوپریوزری ندارد. پس لینکش در منوی مدیر فقط برگشت می‌خورد.
   - «مدیر ارشد» در پرسوناها همان `superuser` است، نه `MANAGER_NAV_ITEMS`.
8. **`finance-audit` و `finance-health` «ریدایرکت ساده» نیستند.**
   - `/app/finance/health` را نشان همگام‌سازی سربرگ (`offline-pending-badge`) برای نقش‌های مالی باز می‌کند. مرکز عملیات هم فقط برای سوپریوزر است. پس **فقط آیتم منو حذف می‌شود و مسیر می‌ماند.**
   - `/app/finance/audit` برای دارندگان `view_sys_payroll` از راه URL در دسترس است؛ این مسیر هم می‌ماند.
   - ممیزی مرکز عملیات با قلمرو پیش‌فرض «انبارداری» باز می‌شود و در نصب فقط-مالی لاگ مالی را نشان نمی‌دهد. پیش‌فرضش «همه» می‌شود.
9. **نقش راهبر تشکیلات:**
   - الف) نقش باید در `get_user_valid_roles_for_app` و `ACCOUNTING_SPEC.roles` ثبت شود. الگوی `roles.append` در middleware آن‌طور که در طرح نوشته شده بود وجود ندارد.
   - ب) بک‌اند نوشتن پروژه، بخش و انتساب را برای `perm_manage_projects_sections` نمی‌پذیرد.
   - ج) فهرست کاربرانِ لازم برای انتساب، `view_sys_users` می‌خواهد.
   - د) افزودن این مجوز به `IsOrgStructureManagerOrReadOnly` **خطرناک است**، چون همین کلاس نوشتن `UserCompanyAccess` (اعطای دسترسی به شرکت) را هم کنترل می‌کند.
   - هـ) آیتم `users` زیر `/app/finance` مسیری ندارد (لینک شکسته). کامپوننت `Users` هم اجازهٔ تغییر مجوزها را می‌دهد، یعنی راهی برای ارتقای دسترسی است؛ پس حذف می‌شود. `company-documents` هم‌اکنون لینک مستقل در سایدبار دارد؛ تکرارش لازم نیست.
   - و) `ROLE_PRESETS` در `users.ts`، `module-registry`، ریدایرکت‌های ریشه و `canAccessRoute` هم باید نقش را بشناسند.
10. **فیلتر منوهای نقش به `ROUTE_PERMISSIONS` توجه نمی‌کند.**
    - آیتمی که گارد رد می‌کند باز هم نمایش داده می‌شود و کلیک رویش برگشت می‌خورد.
    - برای یک کاربر عملیاتی (مدیر تاییدکننده با `perm_approve_personnel_manager`، بدون `can_act_as_company_manager`) منوی مدیر خالی است.
    - مقصد پیش‌فرض همین کاربر (`manager-dashboard`) خودش را رد می‌کند. اگر هدایت ورود ساده عوض شود، این کاربر در **حلقهٔ ریدایرکت** می‌افتد.
11. **اشکال‌های هاب‌ها که انتقال را ناقص می‌کنند:**
    - زیرتب تسویه در `accountant-fleet` و `manager-fleet` کلید `res.items/settlements` را می‌خواند، ولی بک‌اند `{summary, records}` برمی‌گرداند. نتیجه اینکه جدول همیشه خالی است.
    - `accountant-payroll` دامنه را بی‌صدا از انبار فعالِ سامانهٔ انبار (`state.selectedWarehouseId`) می‌گیرد.
    - فهرست‌های `accountantTabs`، `managerTabs` و `supervisorTabs` در layout ناقص‌اند.
12. **نگهبان‌ها:**
    - `guardian_35` مقصد ریدایرکت‌های قدیمی را ثابت نوشته است.
    - `section_guardian.py` و `guardian_menu_redesign.py` وجود کامپوننت‌های قدیمی را چک می‌کنند.
    - هر سه باید همراه بازنشستگی به‌روز شوند.
    - کلیدهای SoD (`/finance-cartable`، `/treasury-cartable`، `/attendance`، `/profiles`، `/manager-approvals`) شناسهٔ سیاست‌اند، نه آدرس صفحه. هیچ‌کدام نباید تغییر کند.
13. **فهرست تسک‌ها با طرح هم‌خوان نبود.** مثلاً تسک ۷ («حذف تعاریف پایه از منوی مدیر») عکس خود طرح بود. برای منوی حسابدار، بازنشستگی، هدایت‌ها و نگهبان‌ها هم تسکی نبود.

---

## ۲. داده‌های مبنا (سرشماری فقط‌خواندنی، ۹ مهر ۱۴۰۵)

- **کاربران:** ۱۸ کاربر فعال، از جمله ۳ سوپریوزر. ترکیب مجوزهای بقیه:

  | تعداد | ترکیب | نکته |
  | :---: | :--- | :--- |
  | ۳ | کارمند | |
  | ۳ | سرپرست کارگاه | `view_sys_personnel_attendance` دارند؛ امروز پس از ورود به `attendance` می‌روند. |
  | ۲ | خزانه‌دار | `view_sys_payroll` هم دارند. |
  | ۲ | مدیر شرکت | `view_sys_payroll` دارند؛ امروز پس از ورود به `finance-cartable` می‌روند. |
  | ۱ | مدیر تاییدکننده | `perm_approve_personnel_manager`، `perm_approve_fleet_manager`، `can_act_as_manager` |
  | ۱ | تاییدکنندهٔ مالی | `perm_approve_personnel_finance`، `perm_approve_fleet_finance` |
  | ۱ | سرپرست تاییدکننده | |
  | ۱ | حسابدار کامل | |
  | ۱ | بدون مجوز مالی | |

- **راهبر تشکیلات:** هیچ کاربری `perm_manage_projects_sections` ندارد.
- **کارکرد:** ۶۲۵ رکورد، همه بخش‌محور (`section`). آخرین ثبت ۹ شهریور ۱۴۰۵ است. ثبت‌کننده یا سوپریوزر بوده یا خالی (ورود اکسل).
- **دوره‌های حقوق:**
  - `1405/04` در سطح انبار ۲۶
  - `1405/06` هم در سطح انبار ۱۹ و هم سراسری
  - یک دوره با کد معیوب `1405060`، حاصل ورودی متنی آزاد در `finance-cartable`

  نتیجه: در انتقال، **ورودی دوره باید کشویی باشد، نه متنی**، و دامنهٔ «کل شرکت یا انبار» باید حفظ شود.
- **ماژول‌های نصب‌شده:** `platform`، `warehouse`، `accounting`.

---

## ۳. جدول تعیین تکلیف نهایی ۱۱ آیتم منوی عمومی

| # | آیتم | کامپوننت | پوشش فعلی در منوی نقش | اقدام | شرط حذف |
| :---: | :--- | :--- | :--- | :--- | :--- |
| ۱ | `projects-and-sections` | `ProjectsAndSectionsComponent` | در هیچ منوی نقشی نیست | انتقال به منوی تازهٔ راهبر تشکیلات (`ORG_ADMIN_NAV_ITEMS`). کامپوننت می‌ماند. | حذف از منوی عمومی فقط پس از نمایش در منوی راهبر؛ کد حذف نمی‌شود. |
| ۲ | `employee-portal` | `EmployeePortalComponent` | ۱۰۰٪ APIهایش در ۶ هاب کارمند هست. | بازنشستگی: آیتم و کد حذف می‌شوند و مسیر به `employee-attendance` ریدایرکت می‌شود. | ارجاع درون‌برنامه‌ای جز مسیرها و layout ندارد (تأیید شد). نگهبان `section_guardian` باید به‌روز شود. |
| ۳ | `attendance` (و `fleet`، `fleet-attendance`، `timesheet`) | `WarehouseAttendance` | ۱۰۰٪ APIهایش در `employee-attendance` و `employee-fleet` هست. | بازنشستگی: آیتم، کد و spec حذف می‌شوند. مسیرها به `employee-attendance` و `employee-fleet` می‌روند. | اصلاح هدایت ورود، تغییر رمز و ریشه، و ریدایرکت `warehouse/attendance`. |
| ۴ | `manager-approvals` | `ManagerApprovals` | تصویب پرسنل، ناوگان و تغییرات در `manager-personnel/fleet` هست. فاکتور، تنخواه، دوره، ویرایش پرونده و تاریخچه فقط در همین کامپوننت است. | لینک در `MANAGER_NAV_ITEMS`. کامپوننت می‌ماند. | ندارد |
| ۵ | `finance-cartable` | `FinanceCartable` | ناقص (بند ۱-۳) | کدش به هاب‌های حسابدار منتقل می‌شود (جدول ۵). بعد کد و spec حذف و مسیر به `accountant-payroll` ریدایرکت می‌شود. | همهٔ ردیف‌های جدول ۵ منتقل و آزموده شده باشد. |
| ۶ | `treasury-cartable` (و `treasury`) | `TreasuryCartable` | ناقص (بند ۱-۴) | کدش به `treasurer-disbursements` منتقل می‌شود (جدول ۶). بعد حذف و ریدایرکت. | همهٔ ردیف‌های جدول ۶ منتقل و آزموده شده باشد. |
| ۷ | `counterparties` | `CounterpartiesComponent` | هاب `accountant-counterparties` خالی است. | مسیر `accountant-counterparties` کامپوننت کامل را رندر می‌کند و stub حذف می‌شود. `counterparties` ریدایرکت می‌شود. | مجوز نوشتن حسابدار در بک‌اند. |
| ۸ | `profiles` (و `personnel-profiles`) | `PersonnelProfilesHub` | بخشی از آن در `accountant-personnel` هست. | لینک در منوی حسابدار. کامپوننت می‌ماند. | ندارد |
| ۹ | `base-settings` | `BaseSettings` | در هیچ منوی نقشی نیست. | لینک در منوی مدیر و حسابدار (مشاهده). حق ویرایش بدون تغییر. | باز شدن `ROUTE_PERMISSIONS` برای نشانگرهای مدیر و حسابدار. |
| ۱۰ | `finance-audit` | `Audit` (`appScope: finance`) | ممیزی مرکز عملیات (فقط سوپریوزر) | آیتم منو و ویژه‌کاری‌های layout حذف می‌شوند. مسیر `/app/finance/audit` می‌ماند. قلمرو پیش‌فرض ممیزی مرکز عملیات «همه» می‌شود. | ندارد |
| ۱۱ | `finance-health` | `HealthDashboardComponent` | مرکز عملیات (فقط سوپریوزر) | آیتم منو و ویژه‌کاری layout حذف می‌شوند. مسیر `/app/finance/health` برای نشان همگام‌سازی می‌ماند. | ندارد |

«مرکز عملیات» در این طرح همان «مرکز (اتاق) فرماندهی» سامانه است (`/app/operations`، عنوان «اتاق فرماندهی کل»). ردیف‌های ۱۰ و ۱۱ موارد مرکز فرماندهی در منوی عمومی‌اند. این دو آیتم و ویژه‌کاری‌شان در layout حذف شدند، ولی کدشان حذف نشد، چون مسیرشان هنوز مصرف‌کننده دارد (بند ۱-۸).

پس از این جابه‌جایی‌ها `ACCOUNTING_NAV_ITEMS` خالی می‌شود. آرایه، computed `accountingNavItems` و آکاردئون «کارکرد و حسابداری» حذف می‌شوند. سوپریوزر همچنان همهٔ منوهای نقش را با هم می‌بیند.

### تأیید پیش از حذف (اجرای فاز هـ، ۹ مهر ۱۴۰۵)

پیش از حذف پنج کامپوننت (`EmployeePortalComponent`، `WarehouseAttendance`، `FinanceCartable`، `TreasuryCartable` و stub طرف‌حساب) این موارد بررسی شد:

- **فراخوانی‌های API:** همهٔ متدهای سرویسی که این پنج کامپوننت صدا می‌زدند به‌صورت ماشینی استخراج شد. همه جز ۹ متد در هاب‌های جانشین هم صدا زده می‌شوند. آن ۹ متد معادل احراز‌شده روی **همان endpoint** دارند:

  | متد قدیمی | معادل در هاب جانشین |
  | :--- | :--- |
  | `calculateMonthlyPayroll` | `calculatePeriodPayroll` (هر دو `calculate-period`) |
  | `getMonthlyExcelDownloadUrl` | `exportMonthlyPayrollExcel` |
  | `getBimehDiskettesDownloadUrl` | `exportBimehDisketteZip` (`export_bimeh_diskettes` در بک‌اند همان `export_dsk_zip` را صدا می‌زند) |
  | `getTaxWhDownloadUrl` و `getTaxWpDownloadUrl` | `exportTaxWh` و `exportTaxWp` |
  | `getBankExcelDownloadUrl` | `exportBankPaymentExcel` |
  | `getFleetBankExcelDownloadUrl` | `exportFleetBankExcel` |
  | `getTreasuryDisketteDownloadUrl` | `exportTreasuryDiskette` |
  | `getVehicleMonthlySummary` (گزارش کارکرد ناوگان) | زیرتب تسویهٔ `accountant-fleet`، با همهٔ ستون‌های گزارش قدیم (راننده، پلاک، نوع، تعداد سرویس، مبلغ قابل پرداخت) |

- **اقدام‌های گردش دوره:** `WarehouseAttendance` فقط `submit` و `unlock` داشت: `submit` در `employee-attendance` و `unlock` در `manager-approvals` هست.
- **دروازه‌های SoD:** getterهای `canUnlockPeriod` و `canDirectEditAttendance` در `WarehouseAttendance` هیچ‌جا (نه قالب و نه متد) استفاده نمی‌شدند. تفکیک وظایف کارکرد با ایزولاسیون مسیر نقش‌ها در `canAccessRoute` اعمال می‌شود: هاب کارمند فقط «ارسال» دارد و حسابدار به هاب‌های کارمند راه ندارد.
- **مودال بانکی ناوگان** (مرجع استاندارد شبا در `.agents/AGENTS.md`) بی‌تغییر در `employee-fleet` هست. ارجاع آن سند به `employee-fleet` به‌روز شد.
- **دسترسی پس از ریدایرکت:** مسیر قدیمی `attendance` مجوزهای `view_wh_attendance`، `perm_register_daily_attendance` و `can_act_as_supervisor` را هم می‌پذیرفت که `employee-attendance` نمی‌پذیرد. سرشماری فقط‌خواندنی نشان داد **هیچ‌یک از ۱۸ کاربر فعال** با ریدایرکت‌ها دسترسی از دست نمی‌دهد. همین برای `fleet` و `finance-cartable` هم بررسی شد.
- **عمداً منتقل نشد:** نگه‌داشتن وضعیت نما در URL صفحهٔ کارکرد قدیمی (`tab`، `mode`، `wh`، `date`، `month`). هاب‌های جانشین بر اساس کارکرد جدا شده‌اند و `section_id` را نگه می‌دارند. هیچ پیوند درون‌برنامه‌ای یا اعلان بک‌اندی به این پارامترها وجود ندارد (بررسی شد).
- همهٔ ۱۷ فایل حذف‌شده در git ثبت و بدون تغییر بودند؛ بازیابی از HEAD ممکن است.

---

## ۴. منوهای نهایی نقش‌ها

**قاعدهٔ نمایش:** هر آیتم منوی نقش فقط وقتی دیده می‌شود که دو شرط برقرار باشد:
1. کاربر یکی از نشانگرهای آن نقش را داشته باشد (مثل قبل).
2. کاربر از گارد مسیر (`ROUTE_PERMISSIONS`) رد شود.

این قاعده در تابع خالص `filterRoleNavItems` (فایل `nav-items.ts`) پیاده می‌شود و layout و spec هر دو از همان تابع استفاده می‌کنند. به این ترتیب دیگر لینکی که کلیکش برگشت بخورد نمایش داده نمی‌شود.

### منوها

| نقش | آیتم‌ها (به ترتیب) |
| :--- | :--- |
| کارمند | بدون تغییر: ۶ هاب |
| سرپرست | بدون تغییر: ۵ هاب |
| حسابدار | `accountant-personnel`، `accountant-payroll` **(تازه)**، `accountant-fleet`، `accountant-invoices`، `accountant-petty-cash`، `accountant-diskettes`، `accountant-counterparties` (حالا صفحهٔ کامل)، `profiles` **(تازه)**، `base-settings` **(تازه، مشاهده)** |
| مدیر | `manager-dashboard`، `manager-personnel`، `manager-fleet`، `manager-approvals` **(تازه)**، `manager-budget`، `manager-reports`، `base-settings` **(تازه، مشاهده)** |
| خزانه‌دار | بدون تغییر در آیتم‌ها؛ هاب `treasurer-disbursements` کامل می‌شود. |
| راهبر تشکیلات **(تازه)** | `projects-and-sections` |

### نشانگرهای نقش مدیر در فیلتر

`can_act_as_company_manager`، `perm_manager_payment_authorize`، `perm_approve_personnel_manager` و `perm_approve_fleet_manager`. این فهرست با `availableRoles` و سطح ۴ بک‌اند (`determine_user_tier`) یکی است.

### تغییر `ROUTE_PERMISSIONS`

- `manager-dashboard` ← `+ perm_approve_personnel_manager، perm_approve_fleet_manager`. این‌ها همان سطح ۴ بک‌اند در `ManagerCartableAPIView` هستند و حلقهٔ بند ۱-۱۰ را از بین می‌برند.
- `base-settings` ← `+ perm_sys_settings، can_act_as_accountant، perm_approve_personnel_finance، view_sys_payroll، can_act_as_company_manager، perm_manager_payment_authorize، perm_approve_personnel_manager`
- `projects-and-sections` ← `+ perm_manage_projects_sections`
- `accountant-counterparties` ← `+ perm_approve_personnel_finance`

### ایمنی گارد

`AuthGuard` یک محافظ حلقه می‌گیرد: اگر مسیر جایگزین همان مسیر درخواستی باشد، کاربر به `/app/launcher` می‌رود.

---

## ۵. انتقال کد `finance-cartable` به هاب‌های حسابدار

| # | قابلیت مبدا | مقصد | پیاده‌سازی |
| :---: | :--- | :--- | :--- |
| ۱ | انتخاب دوره (سال و ماه) و دامنه (کل شرکت یا انبار) | `accountant-payroll`، `accountant-diskettes`، زیرتب تسویهٔ `accountant-fleet` | کشوی سال (از `getAvailableFiscalYears`) و ۱۲ ماه؛ کشوی دامنه با انبارها (اگر ماژول انبار نصب باشد)؛ همگام با query params. وابستگی `accountant-payroll` به `state.selectedWarehouseId` برداشته می‌شود. |
| ۲ | پنج شاخص خلاصهٔ حقوق | `accountant-payroll` | محاسبه از رکوردهای دوره |
| ۳ | فیلتر گروه وضعیت (نفرات شرکتی / سرپرستی) | `accountant-payroll` | فیلتر سمت کاربر |
| ۴ | جدول جزئیات حقوق (کارکرد، اضافه‌کار، جمعه‌کاری، مأموریت، مزد مبنا، مسکن، خواربار، تأهل، اولاد، ایاب، شبا) | `accountant-payroll` | کلید «نمای جزئیات» |
| ۵ | فیش حقوقی تکی و چاپ آن | `accountant-payroll` | مودال فیش، مثل مبدا |
| ۶ | ورود مالیات: فایل اکسل و چسباندن متن با پیش‌نمایش تطبیق | `accountant-payroll` | مودال مبدا جای input خام را می‌گیرد. |
| ۷ | وضعیت قفل دوره | `accountant-payroll` | نمایش وضعیت و غیرفعال شدن «محاسبه» در دورهٔ قفل. دکمهٔ «قفل» فقط برای `perm_lock_work_period` یا سوپریوزر؛ «بازگشایی» فقط برای سوپریوزر (مطابق بک‌اند). |
| ۸ | گزارش خلاصهٔ کارکرد ماهانهٔ پرسنل | زیرتب «خلاصه کارکرد» در `accountant-payroll` | `getAttendanceMonthlySummary` |
| ۹ | گزارش کارکرد ناوگان | زیرتب تسویهٔ `accountant-fleet` | اصلاح نگاشت `records/summary`، شاخص‌های خلاصه، ستون‌های سرویس و مبلغ |
| ۱۰ | تایید مالی درخواست تغییرات پرسنل | زیرتب تغییرات `accountant-personnel` | `approvePersonnelChangeRequestFinance` |
| ۱۱ | تایید مالی درخواست تغییرات ناوگان | زیرتب تغییرات `accountant-fleet` | `approveVehicleChangeRequestFinance` |
| ۱۲ | یادداشت تایید مالی | `accountant-personnel`، `accountant-fleet` | مودال تایید با یادداشت اختیاری |
| ۱۳ | فایل بانکی تسویهٔ ناوگان | تسویهٔ `accountant-fleet` و `accountant-diskettes` | متد تازهٔ `exportFleetBankExcel`، دانلود با احراز هویت |
| ۱۴ | دیسکت بیمه، WH، WP، بانک ملی و اکسل ۵۸ ستونی | `accountant-diskettes` / `accountant-payroll` | از قبل موجود است؛ endpointها یکی‌اند (`export-bimeh-diskettes` نام دیگر `export-dsk-zip` است). فقط دوره و دامنه درست می‌شود. |
| ۱۵ | کارت «فیش‌های حقوقی ZIP» | منتقل نمی‌شود | در مبدا همان دیسکت بیمه را دانلود می‌کرد؛ قابلیت مستقلی نبود. |
| ۱۶ | محاسبهٔ ۵۸ ستون | `accountant-payroll` | از قبل موجود است (`calculateMonthlyPayroll` و `calculatePeriodPayroll` هر دو به `calculate-period` می‌روند). |
| ۱۷ | تایید، رد و بازنگری پرونده‌های تازه و مقایسهٔ تغییرات | `accountant-personnel/fleet` | از قبل موجود است. |

زیرتب تسویه در `manager-fleet` همان اشکال نگاشت را دارد و هم‌زمان اصلاح می‌شود (یک خط).

## ۶. انتقال کد `treasury-cartable` به `treasurer-disbursements`

| # | قابلیت مبدا | پیاده‌سازی در هاب |
| :---: | :--- | :--- |
| ۱ | چهار شاخص خلاصه (دوره‌های آماده، جمع حقوق، جمع ناوگان، کل صف) | کارت‌های شاخص از پاسخ `getTreasuryCartable` |
| ۲ | فهرست دوره‌های آماده پرداخت، با دیسکت پایا و ساتنا برای هر دوره | بخش «دوره‌های آماده پرداخت» با دانلود احراز‌شده (`exportTreasuryDiskette`) |
| ۳ | پرداخت یکجای دوره (`disburse_period`) | مودال با کد رهگیری و شناسهٔ دسته |
| ۴ | تسویهٔ گروهی ناوگان (`disburse_fleet` با همهٔ `trip_ids` در صف) | دکمهٔ تسویهٔ گروهی |
| ۵ | وضعیت خطای شبا و علت آن | برچسب «خطای شبا» و ستون علت در صف |
| ۶ | شناسهٔ دسته در پرداخت تکی | فیلد اختیاری در مودال پرداخت |

پرداخت تکیِ حقوق و ناوگان، فایل پایای دوره، اکسل و بایگانی در هاب از قبل هست.

---

## ۷. معماری نقش «راهبر تشکیلات» (`org_admin`)

**بک‌اند:**
- **`accounts/middleware.py` → `get_user_valid_roles_for_app`:**
  - اگر کاربر `perm_manage_projects_sections` داشته باشد، `org_admin` به فهرست اضافه می‌شود.
  - در **ابتدای** فهرست درج می‌شود، تا «آخرین نقش معتبر» (پیش‌فرض `resolve_effective_role`) برای کاربر چندنقشه عوض نشود.
  - فال‌بک `operator` برای راهبر اعمال نمی‌شود.
- **`platform_core/module_catalog.py`:** `ACCOUNTING_SPEC.roles` ← `+ 'org_admin'`. سوپریوزر هم می‌تواند این پرسونا را انتخاب کند.
- **`personnel/permissions.py`:**
  - کلاس تازهٔ `IsProjectStructureManagerOrReadOnly` = قواعد فعلی + `perm_manage_projects_sections`. فقط برای `FinancialProjectViewSet`، `ProjectSectionViewSet` و `UserSectionAssignmentViewSet`.
  - کلاس تازهٔ `IsCounterpartyManagerOrReadOnly` = قواعد فعلی + `can_act_as_accountant` + `perm_approve_personnel_finance`. فقط برای نوشتن در `CounterpartyViewSet`.
  - **کلاس `IsOrgStructureManagerOrReadOnly` بدون تغییر می‌ماند**، پس راهبر حق نوشتن `UserCompanyAccess` را نمی‌گیرد. محدودیت شرکتی که بعدها برای همهٔ نویسندگان به `UserCompanyAccessViewSet` اضافه شد، در زیربند «محدودسازی شرکت» آمده است.
- **`accounts/views.py` → `UserViewSet`:** فقط action `list` برای `perm_manage_projects_sections` هم باز می‌شود (برای کشوی انتساب کاربر به بخش). مجوز `retrieve`، `create`، `update` و `delete` بدون تغییر می‌ماند. محدودیت شرکتِ `company_ids` در ویرایش کاربر در همان زیربند آمده است.
- هیچ مهاجرتی لازم نیست.

**فرانت:**
- **پرسونا:** `{ code: 'org_admin', title: 'راهبر تشکیلات و سیستم', app: 'personnel', badgeColor: '#0284c7', bgClass: 'bg-sky-600', icon: '🏢', tierLevel: 4 }`. رنگ sky با نقش `counter` تداخلی ندارد، چون نقش‌ها بر اساس app فیلتر می‌شوند.
- **`availableRoles`:** `org_admin` در انتهای فهرست می‌آید تا نقش عملیاتی کاربر پیش‌فرض بماند. `perm_manage_projects_sections` جزو «نقش صریح دیگر» شمرده می‌شود.
- **`getDefaultRouteForRole('org_admin')`:** `/app/finance/projects-and-sections`
- **`canAccessRoute`:** برای `org_admin` در `/app/finance` یک **فهرست مجاز** اعمال می‌شود: `projects-and-sections`، `company-documents`، `documents` و `health`.
- **منو و layout:** `ORG_ADMIN_NAV_ITEMS` و `orgAdminNavItems`، آکاردئون در layout با رنگ sky و آیکن `folder` از رجیستری مشترک (بدون svg درون‌خطی).
- **ثبت نقش در بقیهٔ نقاط:**
  - `ROUTE_PERMISSIONS`
  - نشانگرها و نقش‌های `module-registry`
  - ریدایرکت‌های `/app`، `''` و ریشهٔ ماژول مالی
  - `hasFinance` در `login.ts` و `change-password.ts`
- **`users.ts`:** preset تازهٔ «راهبر تشکیلات و سیستم» با `['perm_manage_projects_sections']`.
- **خطوط قرمز** (بدون تایید کارکرد، بدون مجوز پرداخت، بدون ابزار زیرساخت) از سه راه اعمال می‌شوند:
  - نداشتن مجوزهای تایید و پرداخت در preset
  - فهرست مجاز `canAccessRoute`
  - گارد مرکز عملیات که فقط سوپریوزر را راه می‌دهد

  `SoDPolicyPermission` در هیچ ویوست عملیاتی به کار نرفته است. پس افزودن قاعدهٔ SoD برای `org_admin` اثر اجرایی ندارد و انجام نمی‌شود.

### محدودسازی شرکت برای همهٔ نویسندگان غیرسوپریوزر (یافتهٔ بازبینی تفکیک داده و تصمیم کاربر، ۹ مهر ۱۴۰۵)

بازبینی `tenant-scope-reviewer` پس از فاز «الف» نشان داد که باز کردن نوشتن برای راهبر و حسابدار، رخنه‌های قدیمیِ این ویوست‌ها را به دست آن‌ها هم می‌دهد:
- **عضویت فعال در بخش، خودش دسترسی `workspace_full` به شرکتِ آن بخش است** (`get_user_allowed_companies`). نوشتن انتساب هیچ بررسی شرکتی نداشت. پس هر نویسندهٔ ساختار می‌توانست خودش را به بخشی از شرکت دیگر منتسب کند و به آن شرکت راه یابد. فرض بند ۷ («دسترسی شرکت فقط از `UserCompanyAccess` می‌آید») نادرست بود. `UserCompanyAccessViewSet` هم محدودیت شرکت نداشت.
- درون‌ریزی اکسل پروژه، بخش، انتساب و طرف‌حساب روی کل جدول و بی‌شرکت کار می‌کرد و خروجی‌ها همهٔ شرکت‌ها را صادر می‌کردند.
- فیلد `company` طرف‌حساب در ویرایش قابل تغییر بود و رکورد سراسری (بدون شرکت) برای همه قابل ویرایش و حذف بود.
- `list` کاربران پارامتر `company_id` را نمی‌سنجید.

کاربر تصمیم گرفت (بند ۰): درون‌ریزی شرکت‌محور ساخته و باز شود، و همین محدودیت برای نویسندگان قدیمی (مدیران و…) هم همین حالا اعمال شود. در دیتابیس عملیاتی سه مدیرِ نویسنده هستند (شرکت ۱، و شرکت‌های ۱ و ۲) و هیچ نقشی جز آن‌ها اثر نمی‌پذیرد.

**قاعده (`requires_company_scope`: هر کاربر احراز هویت‌شدهٔ غیرسوپریوزر):**
- `personnel/permissions.py`: `has_structure_write_permission` (همان قواعد قبلی «چه کسی می‌نویسد») و `requires_company_scope` («در کجا می‌نویسد»).
- **پروژه، بخش و انتساب** (`personnel/views.py`):
  - نوشتن فقط در شرکت‌های مجاز کاربر. رکوردهای سراسری فقط خواندنی‌اند و انتقال به شرکت دیگر یا سراسری ممنوع است.
  - انتساب فقط برای کاربری که **از قبل عضو همان شرکت** است: دسترسی صریح `workspace_full`، یا هر انتسابی (فعال یا غیرفعال) در همان شرکت. پس انتساب هرگز دسترسی شرکت تازه نمی‌سازد.
  - `bulk-assign` همه یا هیچ است. `clone-assignments` فقط بین بخش‌های یک شرکت مجاز است.
  - فهرست انتساب‌ها فقط بخش‌های شرکت‌های مجاز، بخش‌های سراسری و انتساب‌های خود کاربر را نشان می‌دهد.
- **دسترسی شرکت** (`UserCompanyAccessViewSet`): اعطا، ویرایش و حذف فقط برای شرکت‌های مجاز کاربر؛ خواندن فقط همان شرکت‌ها و ردیف‌های خود کاربر.
- **طرف‌حساب**:
  - ساخت هرگز در شرکت غیرمجاز انجام نمی‌شود، ولی درخواست هم رد نمی‌شود. ترتیب تعیین شرکت در «اصلاح‌های بازبینی دوم» آمده است.
  - ویرایش و حذف فقط در شرکت‌های مجاز است و طرف‌حساب سراسری فقط خواندنی است.
- **درون‌ریزی اکسل** (`org_excel_engine.py`):
  - برای غیرسوپریوزر، شرکت مقصد همان شرکت فعال درخواست است (`resolve_write_company`، هدر `X-Company-ID`) و باید مجاز باشد.
  - تطبیق و ساخت پروژه، بخش و طرف‌حساب فقط در همان شرکت انجام می‌شود، و انتساب فقط برای اعضای همان شرکت.
  - سوپریوزر محدودیتی ندارد. اگر شرکت فعال آمده باشد، همان را به کار می‌برد.
  - دکمهٔ درون‌ریزی برای راهبر و حسابدار هم نمایش داده می‌شود.
- **خروجی اکسل**: برای غیرسوپریوزر فقط شرکت‌های مجاز و رکوردهای سراسری.
- **فهرست کاربران** (`accounts/views.py`):
  - راهبری که `view_sys_users` ندارد، فقط اعضای شرکت‌های مجاز خودش را با فیلدهای کمینه (`UserDirectorySerializer`) می‌بیند.
  - برای دیگران `company_id` شرکتِ غیرمجاز ۴۰۳ می‌گیرد، و کاربر بی‌شرکت فقط خودش را می‌بیند.
- **صف آفلاین:** درخواست نوشتنِ مشروع درون شرکت خود کاربر رد نمی‌شود. فقط نوشتن در شرکت دیگر یا رکورد سراسری ۴۰۳ می‌گیرد، که «رد صریح» است.
- **اصلاح‌های بازبینی دوم:**
  - **ویرایش کاربر** (`company_ids` و `company_accesses` در `UserSerializer`): نویسندهٔ غیرسوپریوزر فقط دسترسی شرکت‌های مجاز خودش را می‌دهد یا حذف می‌کند. دسترسی موجودِ کاربر در شرکت‌های دیگر دست نمی‌خورد.
  - **ساخت طرف‌حساب:** شرکت به این ترتیب تعیین می‌شود: بدنه (اگر مجاز) ← هدر (اگر مجاز) ← تنها شرکت مجاز کاربر.
    - شرکت غیرمجاز نادیده گرفته می‌شود و رد نمی‌شود، تا رکورد صف آفلاین حذف نشود.
    - فرانت شرکت فعال را در بدنهٔ ساخت می‌گذارد، چون بازپخش صف هدر شرکت ندارد.
  - **عضویت:** انتساب غیرفعالِ قبلی در همان شرکت هم عضویت شمرده می‌شود و غیرفعال‌سازی شرط عضویت ندارد. پس فعال‌سازی دوباره و جابه‌جایی درون شرکت رد نمی‌شود.
  - **جابه‌جایی بین شرکت‌ها:** انتقال بخش به پروژهٔ شرکت دیگر، یا انتقال پروژه به شرکت دیگر، فقط با سوپریوزر است.
  - **انتساب خود:** راهبر تشکیلاتِ بدون مجوز قدیمی نوشتن نمی‌تواند خودش را منتسب کند. این شامل create، bulk، clone و درون‌ریزی است. مدیران مثل قبل.
  - **تنخواه:** سنجش نقش در حساب‌ها و اسناد تنخواه فقط انتساب **فعال** را حساب می‌کند.
  - **پیام‌ها:** پیام `bulk-assign` کاربران ردشده را نام می‌برد. کاربر ناموجود و غیرعضو یک پیام مشترک می‌گیرند تا وجود نام کاربری لو نرود.
  - **درون‌ریزی سوپریوزر:** شرکت فعال را به کار می‌برد، اگر آمده باشد.
  - **جستجوی فهرست کمینهٔ راهبر:** دیگر روی کد ملی و تلفن نیست.
  - **رکوردهای سراسری عملیاتی:** فقط یک پروژهٔ آزمایشی (`test_no_comp`، بدون انتساب) و طرف‌حساب «عنایت» (بدون فاکتور) هستند. پس سراسری ماندنشان اثر عملی ندارد.
- **آزمون‌ها:**
  - ۲۴ آزمون در کلاس `OrgAdminAndAccountantTenantScopeTestCase` (۱۷ آزمون دور اول و ۷ آزمون بازبینی دوم)، کنار ۱۲ آزمون نقش راهبر و طرف‌حساب. هر ۳۶ آزمون پاس می‌شوند.
  - با خاموش کردن قاعده، ۱۴ آزمون از ۱۷ آزمون دور اول رد می‌شوند. سه آزمونِ باقی رفتار عادی مدیر در شرکت خودش و فهرست کاربران را می‌سنجند.
  - نگهبان ۲۹ هیچ نقض تازه‌ای نشان نمی‌دهد.

---

## ۸. مسیرها و هدایت‌ها (بدون ریدایرکت زنجیره‌ای)

| محل | تغییر |
| :--- | :--- |
| `accounting.routes.ts` | این مسیرها ریدایرکت می‌شوند: `employee-portal`، `attendance`، `timesheet` ← `employee-attendance`؛ `fleet`، `fleet-attendance` ← `employee-fleet`؛ `finance-cartable`، `personnel`، `payroll` ← `accountant-payroll`؛ `treasury-cartable`، `treasury`، `fleet-settlement` ← `treasurer-disbursements`؛ `counterparties` ← `accountant-counterparties`. مسیر `accountant-counterparties` ← `CounterpartiesComponent`. ریشهٔ `''` یک شاخهٔ `org_admin` می‌گیرد. |
| `app.routes.ts` (ریدایرکت‌های قدیمی سطح بالا) | مستقیم به مقصد نهایی: `finance-cartable`، `personnel`، `payroll` ← `app/finance/accountant-payroll`؛ `attendance` و `employee-portal` ← `app/finance/employee-attendance`؛ `fleet`، `fleet-attendance` ← `app/finance/employee-fleet`؛ `treasury-cartable`، `treasury`، `fleet-settlement` ← `app/finance/treasurer-disbursements`. شاخهٔ مالی در ریشهٔ `''` ← `app/finance` (نقش‌محور). |
| `warehouse.routes.ts` | `attendance` ← `/app/finance/employee-attendance` |
| `login.ts`، `change-password.ts` | کاربر فقط-مالی ← `/app/finance` (نقش‌محور). `goBack` ← `/app/finance`. |
| `operations-layout.ts`، `layout.ts` (`exitWarehouseMode`)، `auth.guard.ts` (مسیرهای جایگزین)، `module-registry.ts` (`defaultRoute`) | ← `/app/finance` |
| `nav-items.ts` | حذف `ACCOUNTING_NAV_ITEMS`. افزودن `ORG_ADMIN_NAV_ITEMS` و تابع `filterRoleNavItems`. |

---

## ۹. آزمون و نگهبان

- **آزمون بک‌اند** (`personnel/test_org_admin_menu_permissions.py`):
  - نقش‌های معتبر راهبر
  - اجازهٔ نوشتن پروژه، بخش و انتساب برای راهبر
  - **رد** نوشتن `UserCompanyAccess` برای راهبر
  - اجازهٔ نوشتن طرف‌حساب برای حسابدار و رد آن برای کاربر عادی
  - اجازهٔ `list` کاربران برای راهبر و رد `update` کاربر برای او
  - محدودسازی شرکت برای همهٔ نویسندگان غیرسوپریوزر (بند ۷، زیربند «محدودسازی شرکت»)

  اگر دیتابیس آزمون postgres در دسترس نباشد، صریح گزارش می‌شود.
- **specهای فرانت:**
  - بازنویسی `all-users-permissions-dom.spec.ts` بر پایهٔ `filterRoleNavItems` و تعداد لینک‌های تازه
  - spec پرسونای راهبر
  - specهای قابلیت‌های منتقل‌شده در هاب‌ها
  - جایگزینی `FinanceCartable` در `personnel-approval-cycle.spec.ts`
  - حذف `finance-cartable.spec.ts` و `warehouse-attendance.spec.ts` همراه کامپوننت‌هایشان
- **نگهبان‌ها:**
  - به‌روزرسانی نقشهٔ مورد انتظار `guardian_35`
  - `section_guardian.py` و `guardian_menu_redesign.py`: به‌جای «وجود فایل قدیمی»، ریدایرکت جایگزین بررسی شود.
  - `phase_guardian_approval.py`:
    - نگهبان ۱۴: بررسی SoD کارکرد از فایل حذف‌شده به ایزولاسیون مسیر نقش‌ها در `canAccessRoute` و «فقط ارسال» در هاب کارمند منتقل می‌شود.
    - چک ۶ نگهبان ۱۹ و چک ۴ نگهبان ۲۳ روی HEAD هم رد می‌شدند (مسیرها پس از بارگذاری تنبل در routes ماژول‌اند). با طرح هم‌راستا می‌شوند: مسیرها می‌مانند و آیتم منوی ممیزی و سلامت مالی عمداً حذف شده است.
    - کلیدهای قدیمی `ROUTE_PERMISSIONS` برای نگهبان ۱۵ می‌مانند.
  - فهرست قالب‌های `tools/dom-verify.js`: سه قالب حذف‌شده جای خود را به هاب‌های جانشین می‌دهند.
  - نگهبان‌های ۱۵ و ۱۹ و تابع اصلی `guardian_menu_redesign.py` دادهٔ آزمایشی در دیتابیس می‌سازند. روی این ماشین فقط بخش‌های ایستای آن‌ها اجرا می‌شود.
  - نگهبان ۵۲ (نبود svg درون‌خطی) باید پاس شود.
  - اجرای `guardian_all.py`
- **کامپایل و ظاهر:**
  - `npx tsc -p tsconfig.app.json --noEmit`؛ `npm run build` همان انتشار است و فقط در گام انتشار اجرا می‌شود.
  - بازبینی دیداری روی `ng serve` پورت 4300.
  - صفحه‌های پشت ورود را کاربر تأیید می‌کند.

---

## ۱۰. پروتکل اجرا

| گام | کار | دروازهٔ عبور |
| :---: | :--- | :--- |
| الف | بک‌اند: نقش و مجوزها + آزمون | `manage.py check` و آزمون‌های بند ۹ |
| ب | زیرساخت فرانت: پرسونا، `nav-items`، فیلتر مشترک، layout، گارد، `ROUTE_PERMISSIONS`، ریدایرکت‌ها، منوی راهبر، اتصال `manager-approvals`، `profiles`، `base-settings`، `accountant-payroll` و طرف‌حساب کامل | کامپایل |
| ج | انتقال کد `finance-cartable` (جدول ۵) | کامپایل + spec |
| د | انتقال کد `treasury-cartable` (جدول ۶) | کامپایل + spec |
| هـ | بازنشستگی: حذف `employee-portal`، `WarehouseAttendance`، `FinanceCartable`، `TreasuryCartable` و stub طرف‌حساب و specهایشان؛ به‌روزرسانی نگهبان‌ها | ۰ ارجاع باقی‌مانده در grep + نگهبان‌ها |
| و | تأیید نهایی: کامپایل، `ng test`، نگهبان‌ها، آزمون و check بک‌اند، بازبینی 4300، ممیزی ui-reviewer | همه سبز یا تفاوت‌ها صریح گزارش‌شده |
| ز | انتشار روی محیط عملیاتی: پشتیبان‌گیری، build، ری‌استارت daphne و بررسی 200 | **تأیید بله/خیر کاربر** |

---

## ۱۱. خارج از دامنه (برای کار جداگانه)

- **`determine_user_tier`:** خزانه‌دار (سطح ۵) از سطح مدیر (۴) بالاتر شمرده می‌شود. پس از راه API می‌تواند مرحلهٔ مدیر را تایید کند.
- **قفل دوره:** action `lock` در `MonthlyWorkPeriodViewSet` مجوزی بررسی نمی‌کند.
- **مودال‌های پرداخت خزانه** کد رهگیری ساختگی از پیش پر می‌کنند.
- **زیرتب حقوق در `accountant-personnel`** ماه ثابت ۰۴ دارد.
- **کشوی «بخش» در `accountant-payroll`** اثری بر دادهٔ حقوق ندارد؛ بک‌اند فیلتر بخش ندارد.
- **`manager-budget/reports/contracts`** دادهٔ ماک دارند.
- **`PersonnelProfilesHub`:** متدهای تایید ناوگان و تغییرات در قالبش استفاده نمی‌شوند.
- **مجوز `view_wh_attendance`** («ثبت کارکرد و سرویس ناوگان (انبار)») پس از بازنشستگی صفحهٔ کارکرد مشترک هیچ صفحه‌ای باز نمی‌کند، اما ویرایشگر نقش هنوز آن را عرضه می‌کند.
- **`personnel-api.service.ts`:** ده متد دیگر فراخوانی ندارند: `calculateMonthlyPayroll`، `getVehicleMonthlySummary`، `getDskZipDownloadUrl`، `getBimehDiskettesDownloadUrl`، `getTaxWhDownloadUrl`، `getTaxWpDownloadUrl`، `getBankExcelDownloadUrl`، `getMonthlyExcelDownloadUrl`، `getFleetBankExcelDownloadUrl` و `getTreasuryDisketteDownloadUrl`. سازنده‌های URL خام بدون توکن دانلود می‌کردند.
- **نگهبان‌هایی که داده می‌سازند:** نگهبان‌های ۱۵ و ۱۹ (`phase_guardian_approval.py`) و `guardian_menu_redesign.py` کاربر یا لاگ آزمایشی در دیتابیسِ همان محیط می‌سازند و بعد پاک می‌کنند. روی این ماشین آن دیتابیس عملیاتی است.
- **طرف‌حساب سراسری** را هر کاربر احراز هویت‌شده هنوز می‌تواند بسازد (مثلاً از فاکتور کارمند بدون شرکت فعال). نوشتن روی آن پس از ساخت فقط برای سوپریوزر است. بستن ساخت، صف آفلاین کارمندان را در معرض رد شدن قرار می‌دهد و تصمیم جدا می‌خواهد.
- **مانده‌های پایین بازبینی ظاهر:** رقم لاتین `| number` و `font-mono` در کد تازه. همچنین در چاپ، فیشِ بلندتر از یک صفحه به‌خاطر `#app-screen` با `overflow-hidden` بریده می‌شود.

</div>
