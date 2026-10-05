# طرح جامع معماری و اجرایی بازطراحی منوی کاربری، نصب برنامه (PWA) و سوئیچر شرکت

<div dir="rtl" align="right">

## ۱. اهداف کلان و شرح نیازمندی‌ها (Requirements Overview)
بر اساس بررسی‌ها و توافقات، هدف این طرح اجرای ۴ دگرگونی کلیدی در لایه فرانت‌اند سامانه است:
1. **حذف انتخاب شرکت از منوی کاربری (`app-user-menu`):** رفع افزونگی و دوبارکاری، سبک‌سازی منوی کاربری و تمرکز آن بر هویت فردی کاربر.
2. **افزودن امکان «نصب هوشمند برنامه» (PWA Install):** فراهم‌سازی قابلیت نصب مستقیم سامانه روی ویندوز، اندروید و راهنمای نصب در iOS، به همراه تشخیص خودکار وضعیت نصب‌شده (Standalone Mode).
3. **هوشمندسازی سوئیچر شرکت (`app-company-switcher`):** نمایش منوی انتخاب و دراپ‌داون صرفاً برای کاربران چندشرکتی یا مدیران ارشد سیستم (Superuser)، و تبدیل آن به یک برچسب اطلاع‌رسانی ثابت برای کاربران تک‌شرکتی.
4. **بهینه‌سازی هدر در حالت موبایل (Mobile Icon-Only Ergonomics):** آیکونی شدن کامل دکمه‌های هدر در صفحات کوچک برای جلوگیری از شکست خطوط، و حفظ ترکیب کامل «آیکون + متن» در منوهای بازشونده.
5. **یکپارچه‌سازی هدر مرکز عملیات (`operations-layout`):** اضافه کردن سوئیچر شرکت به هدر مرکز فرماندهی و زیرساخت.

---

## ۲. درخت تصمیم‌گیری و جزئیات معماری (Architecture & Decisions)

```
┌────────────────────────────────────────────────────────┐
│                   Top Header Layer                     │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
   ┌─────────────────┐             ┌─────────────────────┐
   │ app-user-menu   │             │ app-company-switcher│
   └────────┬────────┘             └──────────┬──────────┘
            │                                 │
     (حذف بخش شرکت)                     (فقط کاربران چندشرکتی)
            │                                 │
     (افزودن نصب PWA)                         ├─ تک‌شرکتی: بج ثابت
            │                                 ├─ چندشرکتی: منوی کشویی
            ▼                                 └─ موبایل: آیکون خالص (w-9 h-9)
   ┌───────────────────┐
   │ PwaInstallService │
   │ (رویداد install)  │
   └───────────────────┘
```

---

## ۳. فازبندی گام‌به‌گام و جزئیات تغییرات فایل‌ها (Phased Implementation)

### فاز ۱: سرویس اختصاصی هوشمند نصب PWA (`PwaInstallService`)
* **فایل جدید:** `warehouse-front/src/app/core/services/pwa-install.service.ts`
* **شرح وظایف:**
  * گوش دادن به رویداد `window.addEventListener('beforeinstallprompt', evt)` و ذخیره ارجاع آن در یک Signal.
  * تشخیص اجرای اپلیکیشن در حالت وب‌اپ نصب‌شده (`display-mode: standalone` یا `window.navigator.standalone`).
  * ارائه متد `installApp()` برای فراخوانی `deferredPrompt.prompt()` و بررسی واکنش کاربر.
  * ارائه متد `showIosInstallGuide()` برای راهنمایی کاربران آیفون و آیپد.
  * ارائه متد `isAppInstalled()` جهت مخفی‌سازی یا تغییر وضعیت دکمه در صورت نصب بودن قبلی.

### فاز ۲: بازطراحی قالب و منطق منوی کاربری (`UserMenuComponent`)
* **فایل‌های هدف:**
  * `warehouse-front/src/app/shared/components/user-menu/user-menu.component.html`
  * `warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts`
* **تغییرات کد:**
  * حذف خطوط ۲۱ تا ۸۱ در `user-menu.component.html` (کارت و ساب‌منوی انتخاب شرکت).
  * پاکسازی کدهای TypeScript مرتبط (`isCompanySubmenuOpen`, `toggleCompanySubmenu`, `selectCompanyFromMenu`, `openCompanySelectionModal`).
  * تزریق `PwaInstallService` و قرار دادن دکمه استاندارد «نصب برنامه» با ویژگی‌های زیر:
    * اگر برنامه قبلاً نصب شده: نمایش وضعیت غیرفعال با بج زمردی «برنامه نصب است ✓».
    * اگر قابلیت نصب دارد: دکمه فعال آبی/نیلی با آیکون دانلود و بج `PWA`.
    * اگر در iOS باز شده: باز کردن مودال یا پیام راهنمای افزودن به صفحه اصلی.
  * مرتب‌سازی دسته‌بندی‌های منو:
    1. هویت (نام، نقش، ویرایش آواتار، تغییر پسورد).
    2. ابزارهای PWA و سینک (نصب برنامه، استعلام بروزرسانی نسخه، بروزرسانی عمیق داده‌ها).
    3. ابزارهای کمکی (لانچر برنامه‌ها، میانبرهای کیبورد `Shift + ?`).
    4. خروج از سیستم.
  * اضافه کردن پلاک شماره نسخه فرانت‌اند در پایین منو (مثلاً `نسخه ۱.۴.۲ - بیلد فعال`).

### فاز ۳: هوشمندسازی سوئیچر شرکت برای افراد تک‌شرکتی و چندشرکتی
* **فایل‌های هدف:**
  * `warehouse-front/src/app/components/organization/company-switcher/company-switcher.ts`
  * `warehouse-front/src/app/components/organization/company-switcher/company-switcher.html`
* **تغییرات منطقی:**
  * اضافه کردن یک Getter به نام `isMultiCompanyUser`:
    ```typescript
    get isMultiCompanyUser(): boolean {
      const companies = this.companyService.availableCompanies || [];
      return companies.length > 1 || this.companyService.isSuperuser;
    }
    ```
  * اگر `isMultiCompanyUser === false`:
    * کلیک روی دکمه هیچ دراپ‌داونی باز نمی‌کند.
    * آیکون فلش رو به پایین (`chevron-down`) مخفی می‌شود.
    * ظاهر آن به شکل یک نشانگر ثابت (Badge) درمی‌آید که فقط عنوان شرکت جاری را نشان می‌دهد.
  * اگر `isMultiCompanyUser === true`:
    * کلیک منوی دراپ‌داون را باز می‌کند.
    * برای کاربران سوپریوزر گزینه «🌍 همه شرکت‌ها (سراسری)» نیز در دسترس است.

### فاز ۴: استانداردسازی ارگونومی هدر موبایل (Icon-Only Mode)
* **فایل‌های هدف:**
  * `warehouse-front/src/app/components/organization/company-switcher/company-switcher.html`
  * `warehouse-front/src/app/components/organization/company-switcher/company-switcher.css`
* **تغییرات طراحی:**
  * در اندازه‌های موبایل (`sm:hidden`):
    * حذف کامل متن‌های نام و کد شرکت از روی دکمه در نوار هدر.
    * دکمه سوئیچر دقیقاً به ابعاد `w-9 h-9 rounded-xl` با حاشیه و مرکزیت آیکون ساختمان 🏢 و یک نقطه وضعیت رنگی (Dot Indicator) تبدیل می‌شود.
    * تایتل (Tooltip) دکمه نام شرکت را هنگام لمس یا نگه داشتن نشان می‌دهد.
  * در حالت دسکتاپ و تبلت (`hidden sm:flex`):
    * ساختار خوانا و گسترده با نام، کد شرکت و فلش بازشونده حفظ می‌شود.
  * داخل منوی بازشونده (Dropdown):
    * حفظ ساختار کامل متنی + آیکون + کد شرکت برای خوانایی بی‌نقص.

### فاز ۵: افزودن سوئیچر شرکت به هدر مرکز عملیات
* **فایل‌های هدف:**
  * `warehouse-front/src/app/components/operations/operations-layout/operations-layout.html`
  * `warehouse-front/src/app/components/operations/operations-layout/operations-layout.ts`
* **تغییرات:**
  * ایمپورت `CompanySwitcherComponent` در `operations-layout.ts`.
  * درج `<app-company-switcher class="shrink-0"></app-company-switcher>` در کنار `<app-user-menu>` در هدر عملیات.

### فاز ۶: به‌روزرسانی تست‌ها و اعتبارسنجی نهایی
* **فایل‌های تست:**
  * `warehouse-front/src/app/shared/components/user-menu/user-menu.component.spec.ts`
  * ایجاد `pwa-install.service.spec.ts`
  * ایجاد یا تکمیل تست برای `company-switcher`
* **فرمان‌های اعتبارسنجی:**
  * اجرای تست‌های Vitest برای بررسی رگرسیون.
  * اجرای بیلد تمیز انگولار (`npx ng build --delete-output-path=false`).

---

## ۴. ماتریس فایل‌های تغییریافته (Files Matrix)

| ردیف | مسیر فایل | نوع عملیات | هدف تغییر |
| :--- | :--- | :--- | :--- |
| ۱ | `src/app/core/services/pwa-install.service.ts` | **جدید** | مدیریت رویداد قبل از نصب و وضعیت Standalone |
| ۲ | `src/app/shared/components/user-menu/user-menu.component.html` | **ویرایش** | حذف بخش شرکت و درج دکمه نصب برنامه PWA |
| ۳ | `src/app/shared/components/user-menu/user-menu.component.ts` | **ویرایش** | حذف متدهای زائد شرکت و اتصال به سرویس نصب |
| ۴ | `src/app/components/organization/company-switcher/company-switcher.html` | **ویرایش** | حالت آیکون خالص در موبایل و شرط تک‌شرکتی/چندشرکتی |
| ۵ | `src/app/components/organization/company-switcher/company-switcher.ts` | **ویرایش** | اعمال منطق شرطی برای کاربران تک‌شرکتی |
| ۶ | `src/app/components/operations/operations-layout/operations-layout.html` | **ویرایش** | افزودن سوئیچر شرکت به هدر مرکز عملیات |
| ۷ | `src/app/components/operations/operations-layout/operations-layout.ts` | **ویرایش** | اضافه کردن کامپوننت سوئیچر به imports |
| ۸ | `src/app/shared/components/user-menu/user-menu.component.spec.ts` | **ویرایش** | به‌روزرسانی ماک‌ها و تست‌ها بدون وابستگی به متدهای حذف‌شده |

</div>
