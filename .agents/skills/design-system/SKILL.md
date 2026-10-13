---
name: design-system
description: زبان طراحی و قواعد ظاهری فرانت انبار و حسابداری (Angular + Tailwind، فارسی و راست‌به‌چپ). هنگام ساختن یا تغییر هر قالب، استایل، کامپوننت یا صفحهٔ UI در warehouse-front این را به کار ببر تا ظاهر یکدست، دسترس‌پذیر و آفلاین‌محور بماند.
---

# زبان طراحی فرانت (Front-end Design System)

قاعدهٔ اول: **اول الگوی موجود را پیدا کن و همان را تکرار کن.** قالب‌ها را عامل‌های مختلف نوشته‌اند و یکدستی از هر سلیقهٔ تازه‌ای مهم‌تر است. بعد از هر تغییر ظاهری، اسکیل `ui-reviewer` و اسکیل `verification-before-completion` را به کار ببر.

## پایه‌ها
- Tailwind 3.4 (`tailwind.config.js`) و استایل‌های سراسری در `src/styles.css`.
- `<html lang="fa" dir="rtl">`.
- فونت Vazirmatn **محلی** است (`public/fonts/vazirmatn/`، کش‌شده در Service Worker). هیچ فونت یا CDN خارجی اضافه نکن.

## رنگ
توکن‌های معنایی (کد تازه همین‌ها را به کار ببرد):

| کاربرد | کلاس | برابر با |
|---|---|---|
| کارت و مودال | `bg-surface` | white |
| پنل ملایم، سرستون | `bg-surface-muted` | slate-50 |
| زمینهٔ صفحه | `bg-surface-canvas` | slate-100 |
| متن اصلی | `text-fg` | slate-800 |
| متن ثانویه | `text-fg-muted` | slate-600 |
| راهنما، placeholder | `text-fg-subtle` | slate-400 |
| حاشیه | `border-line` | slate-200 |
| جداکنندهٔ کم‌رنگ | `border-line-subtle` | slate-100 |

- مقدارها در `:root` فایل `styles.css` تعریف شده‌اند. کلاس‌های قدیمی (`bg-white`، `text-slate-800` و…) عیناً همین رنگ‌اند؛ برای «یکدست‌سازی» آن‌ها را عوض نکن.
- **عمل اصلی:** `bg-indigo-600 hover:bg-indigo-700 text-white` (پالت `brand-*` همان indigo است).
- **رنگ وضعیت** (مثل کلاس‌های `btn-icon-*`): emerald برای موفق، rose برای خطر و حذف، amber برای هشدار، blue برای اطلاع، slate برای خنثی.
- رنگ ثابت (`#...`، `rgb()`) داخل `style` ممنوع است؛ هوک هشدار می‌دهد.

## تایپوگرافی و فاصله
- متن اصلی `text-xs`، متن معمول `text-sm`، فرادادهٔ ریز `text-[11px]` یا `text-[10px]`.
- **متن تازه کوچک‌تر از ۱۰ پیکسل ننویس** (`text-[9px]` و `text-[8px]` خوانا نیستند).
- وزن: عنوان و برچسب `font-bold` یا `font-black`؛ متن توضیحی بدون وزن اضافه.
- فاصله: `gap-1` تا `gap-3` رایج است؛ برای بخش‌های بزرگ‌تر `gap-4`.
- ستون‌های عددی جدول خودکار `tabular-nums` دارند. برای عدد بیرون از جدول (KPI، شمارنده) کلاس `tabular-nums` بگذار.

## الگوهای موجود (همین‌ها را تکرار کن)
- **کارت:** `bg-surface rounded-2xl border border-line shadow-xs p-4`
- **دکمه و ورودی:** `rounded-xl`؛ دکمهٔ فقط‌آیکن با `btn-icon-square` یا `btn-icon-sm` به‌اضافهٔ یکی از `btn-icon-indigo|emerald|rose|blue|purple|amber|slate` (در `styles.css`)
- **مودال:**
  - ظرف: `fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5`
  - پس‌زمینه: `absolute inset-0 bg-slate-900/60 backdrop-blur-sm`
  - پنل: `bg-surface rounded-3xl shadow-2xl w-full max-w-* max-h-[90vh] flex flex-col modal-enter`
  - یا کامپوننت `shared/components/modal`
- **سربرگ صفحه:** یک نوار `bg-surface rounded-2xl border border-line shadow-sm`؛ تب‌ها در راست و دکمه‌های عمل در چپ
- **کامپوننت‌های مشترک** (پیش از ساختن تازه، این‌ها را به کار ببر) در `src/app/shared/components/`:
  - `data-table`، `modal`، `confirm-dialog` (سرویس `ConfirmDialogService`)، `toast` (سرویس `ToastService`)
  - `status-badge`، `loading-skeleton`، `offline-pending-badge`، `toggle-switch`، `file-upload`
  - `smart-delete-modal`، `barcode-scanner`، `cartable-header`، `cartable-card-base`، `warehouse-selector`
- **پایپ‌ها:** `PersianDatePipe` و `StatusLabelPipe` در `src/app/shared/pipes/`؛ ابزار تاریخ در `core/utils/date-utils.ts`

## دکمه‌ها، تب‌ها و عناصر کلیک‌پذیر واکنش‌گرا (موبایل و دسکتاپ)
- **دسکتاپ:** آیکون + متن کوتاه و رسا (`<span class="hidden sm:inline ms-1.5">عنوان</span>`).
- **موبایل:** اولویت مطلق با فقط‌آیکون (Icon-only). متن مختصر در موبایل تنها زمانی مجاز است که کل ردیف بدون اسکرول افقی و بدون چندخطی شدن جا شود (Zero-Scroll).
- **ابعاد لمسی در موبایل:** دکمه‌های بدون متن نباید ریز شوند؛ دست‌کم ۴۰×۴۰ تا ۴۴×۴۴ پیکسل (`w-10 h-10`، یا `w-9 h-9` / `btn-icon-square` همراه با `min-w-[40px] min-h-[40px]`؛ `w-9 h-9` به‌تنهایی فقط ۳۶ پیکسل است).
- **دسترس‌پذیری دکمه‌های آیکونی:** درج `aria-label` و `title` فارسی برای تمام دکمه‌های بدون متن الزامی است.

## جعبه‌ابزار مشترک ارگونومی (راه پیش‌فرض رابط کاربری)
تمام عناصر کلیک‌پذیر و ناوبری در `warehouse-front` باید به‌صورت پیش‌فرض از جعبه‌ابزار مشترک ماژولار استفاده کنند:
- **`button[appAction]`:** دایرکتیو پیش‌فرض دکمه‌ها. کارها را از کاتالوگ می‌گیرد (شامل کلید حساس `terminate` برای پایان همکاری، `delete`، `approve`، `reject`، `return`، `lock`، `unlock` و...). کارهای حساس همیشه با عنوان می‌مانند. کارهای غیرآشنا در موبایل `display="label"` با عنوان کوتاه می‌گیرند. از گذاشتن `title` ایستا خودداری کن (دایرکتیو خودکار از `label` می‌سازد).
- **`app-tab-bar`:** کامپوننت پیش‌فرض نوار تب (`role="tablist"`، کلیدهای جهت‌دار راست‌به‌چپ، رویداد `activeChange`). هرگز از getter با آرایه تازه `get tabs(): TabDef[]` استفاده نکن (خطای NG0100 در dev mode)؛ از آرایه `readonly` یا الگوی کش کلیددار (`xKey`/`xCache`) استفاده کن. ۱ تا ۳ تب با `mobile="short"`؛ ۴ تب یا بیشتر با `mobile="icon"`.
- **`app-overflow-menu`:** منوی پیش‌فرض گزینه‌های بیشتر برای اکشن‌هایی که در ۳۶۰px جا نمی‌شوند. در دسکتاپ درون‌خطی (`display: contents`) و در موبایل در پاپ‌اوور با آیکون `more-vertical`.
- **`app-command-center`:** سربرگ چسبان پیش‌فرض با دو جایگاه `[cc-tabs]` (راست) و `[cc-actions]` (چپ)، همراه با `flex-wrap` و سازگار با Zero-Scroll در موبایل.
- **فرهنگ‌های آیکون یکسان:** منابع پیش‌فرض آیکون (`ACTION_ICONS`، `STATUS_ICONS`، `ROLE_ICONS`، `PLATFORM_ENTITY_ICONS`، `ACCOUNTING_ENTITY_ICONS` و `WAREHOUSE_ENTITY_ICONS`). نام خام رجیستری برای کارهای دارای کلید ممنوع است.
- **ضدالگوها و بودجه عرض (بندهای ۹-۲ و ۹-۳ طرح):**
  - تمایز «عودت برای اصلاح» (`appAction="return"`) و «رد» (`appAction="reject"`).
  - حداکثر ۳ کلمه برای عنوان دکمه‌ها تا سطر موبایل بیرون نزند.
  - کارهای بی‌کلید (مثل «محاسبه»، پیش‌تنظیم‌ها) با دکمه بومی `<button type="button">`، `.tap-target` و `title`/`aria-label` فارسی بدون ساخت کلید ساختگی.
  - بودجه ۳۶۰px: سربرگ‌ها حداکثر ۳۰۹px، کارت‌های موبایل ۳۰۲ تا ۳۰۶px، فوتر مودال ۲۸۰ تا ۳۰۲px.


## آیکن‌ها
- فقط از رجیستری مشترک: `<svg appIcon="trash-2" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>`
- دایرکتیو: `shared/icons/svg-icon.directive.ts` (در `imports` کامپوننت، `SvgIconDirective`). رجیستری: `shared/icons/icon-registry.ts`.
- ویژگی‌های بیرونی (اندازه، رنگ، stroke) در قالب می‌ماند. رنگ آیکن از `currentColor` می‌آید، پس با کلاس `text-*` والد تعیین می‌شود.
- نام‌ها به سبک Feather و Lucide‌اند (`x`، `check`، `trash-2`، `search`، `chevron-down`)؛ گونه‌های Heroicons پیشوند `hero-` دارند.
- **آیکن تازه:** اول رجیستری را بگرد. اگر نبود، فقط محتوای درونی را با نام kebab-case اضافه کن.
- svg درون‌خطی تازه در قالب ممنوع است؛ نگهبان ۵۲ (`scripts/e2e/guardian_52_icon_registry.py`) آن را و نام‌های ناشناخته را می‌گیرد.
- دکمهٔ فقط‌آیکن حتماً `aria-label` یا `title` فارسی داشته باشد.

## راست‌به‌چپ و فارسی
- کد تازه کلاس‌های منطقی را به کار ببرد: `ms-`، `me-`، `ps-`، `pe-`، `start-`، `end-`، `text-start`، `text-end` (کد قدیمی کلاس فیزیکی دارد؛ دست نزن).
- فلش «بعدی» در RTL به چپ است (`chevron-left`) و «قبلی» به راست.
- عدد فارسی با `Intl.NumberFormat('fa-IR')` و تاریخ شمسی با `PersianDatePipe`.
- کد، شناسه، ایمیل یا متن لاتین درون متن فارسی را در `<bdi>` یا `dir="ltr"` بگذار.
- نیم‌فاصله (ZWNJ) درست بنویس: «می‌شود»، «داده‌ها».

## دسترس‌پذیری (WCAG 2.2 AA)
- کنتراست متن دست‌کم ۴.۵:۱ (متن درشت و اجزای رابط ۳:۱).
- نشانگر فوکوس دیدنی: اگر `outline-none` می‌گذاری، `focus-visible:ring-2 focus-visible:ring-indigo-500` هم بگذار (هوک هشدار می‌دهد).
- عمل کلیک‌پذیر را با `<button type="button">` بساز، نه `div`.
- هر فیلد فرم `label` داشته باشد.
- تصویر معنادار `alt` توصیفی فارسی دارد و تصویر تزئینی `alt=""` (هوک هشدار می‌دهد).
- هدف لمسی دست‌کم ۲۴×۲۴ پیکسل؛ در صفحه‌های موبایلِ انبار ترجیحاً ۴۴.
- کاهش حرکت سراسری است (`prefers-reduced-motion` در `styles.css`). انیمیشن تازه ۱۵۰ تا ۳۰۰ میلی‌ثانیه باشد.

## حالت‌ها (برنامه آفلاین‌محور است)
هر فهرست یا صفحهٔ داده‌محور این چهار حالت را دارد:
1. **بارگذاری:** `loading-skeleton`
2. **خالی:** متن راهنما و در صورت امکان عمل بعدی
3. **خطا:** پیام روشن و راه تلاش دوباره
4. **آفلاین یا کهنه:** نشان `isStale` یا `offline-pending-badge`

قطعی سرور را فقط با `isServerUnreachable()` تشخیص بده.

## تصویرها
- تصویر سرور در جعبهٔ اندازه‌ثابت: `NgOptimizedImage` با `[ngSrc]` و `width`/`height` برابر همان جعبه (کلاس‌های CSS اندازهٔ واقعی را تعیین می‌کنند).
- برای پیش‌نمایش `data:` یا `blob:` (FileReader، cropper) از `src` معمولی استفاده کن؛ `NgOptimizedImage` آن‌ها را نمی‌پذیرد.
- قالب‌های **چاپی** (کارت شناسایی و…) `src` معمولی بمانند، چون بارگذاری تنبل ممکن است عکس را در چاپ خالی بگذارد.

## حالت تیره
`darkMode: 'selector'` است و هیچ‌جا کلاس `dark` فعال نمی‌شود. کلاس `dark:` تازه ننویس، مگر در پروژهٔ «تم تیرهٔ کامل» که فقط با بازتعریف متغیرهای توکن زیر `.dark` انجام می‌شود.

## کارایی
- بخش سنگین (نمودار `chart.js`، نمایشگر PDF، ویرایشگر) را با `@defer` یا `import()` پویا تنبل کن.
- گذار بین صفحه‌ها سراسری است (`withViewTransitions` در `app.config.ts`)؛ کد تازه لازم ندارد.

## پیش از اعلام اتمام
- `npx tsc --noEmit -p tsconfig.app.json` در `warehouse-front`
- `python scripts/e2e/guardian_52_icon_registry.py`
- اسکیل `ui-reviewer` برای بازبینی ظاهر و دسترس‌پذیری
