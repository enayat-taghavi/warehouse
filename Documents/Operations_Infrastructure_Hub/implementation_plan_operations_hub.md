# طرح جامع پیاده‌سازی: مرکز عملیات و زیرساخت سازمان (Enterprise Operations & Infrastructure Hub)

این سند فنی، طرح معماری و گام‌های پیاده‌سازی سومین قلمرو مستقل سازمانی تحت عنوان **«مرکز عملیات و زیرساخت سازمان» (Operations & Infrastructure Hub)** به آدرس `/app/operations` را بر اساس توافقات مصاحبه تعاملی Grill-Me مستند می‌نماید.

---

## ۱. مرور نیازمندی‌ها و توافقات مصاحبه (Grill-Me Alignment Decisions)

> [!NOTE]
> کلیه جزئیات فنی بر پایه ۵ تصمیم مصاحبه تعاملی تدوین شده است:
> ۱. **معماری ماژولار و روتینگ:** ایجاد قلمرو و ماژول سوم مستقل (`/app/operations`) در کنار انبارداری (`/app/warehouse`) و مالی (`/app/finance`)، مجهز به کارت سوم در پورتال ورودی (App Launcher) و ادغام در سوئیچر بالای صفحه.
> ۲. **دامنه وظایف و زیرماژول‌ها:** تجمیع جامع تمام ۵ رکن زیرساختی: ۱) اسنپ‌شات و بازیابی اضطراری، ۲) ماتریس پایش سلامت، ۳) ممیزی امنیتی و حوادث، ۴) پایش همگام‌سازی و کلاینت‌های آفلاین، ۵) مدیریت کاربران و مجوزهای حساس ۶گانه.
> ۳. **سد امنیتی و کنترل دسترسی (Strict Superuser-Only):** سد نفوذناپذیر احراز هویت؛ تنها کاربران با `is_superuser=True` مجاز به مشاهده کارت در لانچر، روت‌های `/app/operations` و فراخوانی APIها خواهند بود.
> ۴. **سبک بصری و لایوت (Cyber Dark Cockpit / SOC Theme):** طراحی تم نئونی و مدرن اتاق کنترل (Slate-950, Indigo, Cyan)، سایدبار اختصاصی، کارت‌های پایش پالس‌دار و دسترسی سریع.
> ۵. **فازبندی اجرا (۳ مرحله متوالی):** فاز ۱ (هسته ماژول، لایوت دارک، لانچر و سد امنیتی) ➔ فاز ۲ (استقرار ۵ تب و ابزارهای عملیاتی) ➔ فاز ۳ (ایجنت نگهبان ۲۶ و اعتبارسنجی بیلد).

---

## ۲. معماری فایل‌ها و تغییرات پیشنهادی (Proposed Architecture & File Changes)

| ردیف | لایه | فایل | نوع تغییر | شرح وظیفه فنی |
| :---: | :---: | :--- | :---: | :--- |
| ۱ | Frontend | `frontend/src/app/core/services/app-persona.service.ts` | [MODIFY] | افزودن قلمرو `operations` به `AppModuleType`، نقش `superuser` در این قلمرو و متدهای ناوبری |
| ۲ | Frontend | `frontend/src/app/core/guards/operations.guard.ts` | [NEW] | سد گارد فعال جهت بررسی `is_superuser` و جلوگیری از ورود کاربران عادی با ثبت لاگ امنیتی |
| ۳ | Frontend | `frontend/src/app/components/operations/operations-layout/operations-layout.ts` | [NEW] | منطق لایوت اختصاصی اتاق عملیات، ناوبری تب‌ها، سوئیچ سریع، نشانگر پینگ و آمار سرور |
| ۴ | Frontend | `frontend/src/app/components/operations/operations-layout/operations-layout.html` | [NEW] | ساختار بصری تم تیره SOC/NOC، سایدبار اختصاصی با آیکون‌های نئونی، هدر مدرن و ناحیه router-outlet |
| ۵ | Frontend | `frontend/src/app/components/operations/operations-cockpit/operations-cockpit.ts` | [NEW] | کامپوننت داشبورد اجرایی اتاق فرماندهی، واکشی کارت‌های ۵گانه سلامت، اسنپ‌شات و امنیت |
| ۶ | Frontend | `frontend/src/app/components/operations/operations-cockpit/operations-cockpit.html` | [NEW] | طراحی بصری کارت‌های مانیتورینگ ۵گانه، نمودارهای حلقوی سلامت، لاگ رویدادها و کلیدهای عملیات فوری |
| ۷ | Frontend | `frontend/src/app/components/app-launcher/app-launcher.ts` | [MODIFY] | افزودن بررسی دسترسی سوپریوزر و متد ورود به مرکز عملیات (`enterOperations`) |
| ۸ | Frontend | `frontend/src/app/components/app-launcher/app-launcher.html` | [MODIFY] | افزودن کارت سوم شیک و بنفش/فیروزه‌ای برای مرکز فرماندهی و زیرساخت سازمان |
| ۹ | Frontend | `frontend/src/app/shared/components/app-role-switcher/app-role-switcher.component.ts` | [MODIFY] | پشتیبانی از قلمرو `operations` در انتخاب ماژول بالای صفحه |
| ۱۰ | Frontend | `frontend/src/app/shared/components/app-role-switcher/app-role-switcher.component.html` | [MODIFY] | دکمه سوئیچ سریع به مرکز عملیات در منوی بازشونده پرسنلی برای سوپریوزر |
| ۱۱ | Frontend | `frontend/src/app/app.routes.ts` | [MODIFY] | ثبت کامل مسیر `/app/operations` با فرزندان (cockpit, snapshots, health, audit, sync-monitor, rbac-governance) |
| ۱۲ | Testing | `backend/personnel/phase_guardian_approval.py` | [MODIFY] | پیاده‌سازی و اجرای خودکار ایجنت نگهبان ۲۶ (`audit_guardian_26_operations_hub_and_infrastructure_cockpit`) |

---

## ۳. جزئیات فازبندی اجرا (Step-by-Step Implementation Roadmap)

### 🔹 فاز ۱: زیرساخت هسته ماژول، لایوت دارک و سد امنیتی سوپریوزر
1. **ایجاد گارد امنیتی `OperationsGuard`:**
   - اعتبارسنجی `AuthService.isSuperuser()` و `user.is_superuser`.
   - در صورت عدم تطابق: هدایت به `/app/launcher` و جلوگیری از لود ماژول.
2. **ارتقای `AppPersonaService`:**
   - توسعه `AppModuleType = 'warehouse' | 'personnel' | 'operations'`.
   - پشتیبانی از انتخاب قلمرو عملیات برای مدیران ارشد کل.
3. **طراحی `OperationsLayoutComponent` (تم SOC Dark Cockpit):**
   - پس‌زمینه تیره مدرن (Slate-950) با گرید نئونی بنفش/فیروزه‌ای.
   - سایدبار ارگونومیک با ۵ لینک اصلی + لینک بازگشت به انبار/مالی/لانچر.
   - هدر مجهز به نمره سلامت زنده، وضعیت آنلاین/آفلاین و دکمه‌های اقدام سریع.
4. **به‌روزرسانی پورتال لانچر (`AppLauncherComponent`):**
   - افزودن کارت سوم بصری با نشانگر "مخصوص مدیران ارشد سازمان" و انیمیشن لایو.

---

### 🔹 فاز ۲: کامپوننت اتاق فرماندهی (Cockpit Dashboard) و ادغام ۵ رکن عملیاتی
1. **طراحی `OperationsCockpitComponent`:**
   - **ویجت ۱ (پشتیبان‌گیری و اسنپ‌شات‌ها):** تعداد اسنپ‌شات‌های دیتابیس، آخرین پشتیبان‌گیری، حجم، دکمه سریع ایجاد اسنپ‌شات لحظه‌ای.
   - **ویجت ۲ (ماتریس پایش سلامت و تست همروندی):** نمره سلامت (Health Score)، پینگ سرور، وضعیت دیتابیس/ردیس/وب‌سوکت، دکمه اجرای تست استرس بن‌بست.
   - **ویجت ۳ (رویدادهای امنیتی و ممیزی):** خلاصه رویدادهای نقض دسترسی (`CROSS_APP_DENIED`)، سوئیچ‌های قلمرو و لاگین‌های مشکوک.
   - **ویجت ۴ (ناوگان تبلت‌ها و آفلاین):** صف همگام‌سازی، خطاهای تداخل داده (۴۰۹) و کلاینت‌های در صف.
   - **ویجت ۵ (حاکمیت کاربران و مجوزها):** تعداد سوپریوزرهای فعال و تفکیک مجوزهای حساس ۶گانه.
2. **پیکربندی ساب‌روت‌های فرانت‌اند در `app.routes.ts`:**
   - `/app/operations/cockpit` -> داشبورد جامع اتاق فرماندهی
   - `/app/operations/snapshots` -> مرکز اسنپ‌شات‌ها و بازیابی سرور + IndexedDB
   - `/app/operations/health` -> داشبورد جامع ماتریس سلامت
   - `/app/operations/audit` -> ممیزی رویدادهای امنیتی با فیلتر قلمرو
   - `/app/operations/sync-monitor` -> مانیتورینگ تبلت‌ها و حل تداخل
   - `/app/operations/rbac-governance` -> حاکمیت کاربران ارشد و کنترل مجوزهای ۶گانه

---

### 🔹 فاز ۳: ایجنت نگهبان ۲۶، اعتبارسنجی خودکار و بیلد پروژه
1. **پیاده‌سازی ایجنت نگهبان ۲۶ در `phase_guardian_approval.py`:**
   - تست سد امنیتی `OperationsGuard` (ممانعت از ورود کاربران عادی و ثبت رخداد).
   - اعتبارسنجی روتینگ کامل `/app/operations` و فرزندان آن.
   - تایید کارت سوم در تمپلیت و منطق `AppLauncherComponent`.
   - بررسی استقرار کامپوننت‌های لایوت و داشبورد فرماندهی (`OperationsCockpitComponent`).
   - اجرای کامل ۲۶ ایجنت با خروجی ۱۰۰٪ PASS.
2. **اعتبارسنجی بیلد فرانت‌اند:**
   - اجرای `npm run build` در `frontend` و تضمین Exit Code 0 بدون هیچ خطای کامپایل.

---

## ۴. طرح اعتبارسنجی و آزمون (Verification & Testing Plan)

### الف) آزمون‌های خودکار (Automated Tests)
- `python personnel/phase_guardian_approval.py`:
  - تایید ۱۰۰٪ قبولی تمامی ۲۶ ایجنت نگهبان در لایه بک‌اند و فرانت‌اند.
- `npm run build`:
  - تایید بیلد تمیز و موفق اپلیکیشن انگولار بدون خطای تایپ یا تمپلیت.

### ب) آزمون دستی (Manual Verification)
- ورود با کاربر مدیر ارشد (`admin`) و مشاهده ۳ کارت در پورتال لانچر (`/app/launcher`).
- کلیک روی کارت سوم و ورود موفق به مرکز عملیات (`/app/operations/cockpit`).
- بررسی تغییر استایل به تم دارک نئونی اتاق فرماندهی و عملکرد سایدبار.
- ورود با کاربر عادی (مانند `counter` یا `operator`) و اطمینان از عدم نمایش کارت سوم و مسدودسازی دسترسی به روت‌های عملیات.
