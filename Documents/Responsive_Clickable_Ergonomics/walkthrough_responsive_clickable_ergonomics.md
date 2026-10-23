# گزارش گام‌به‌گام نتایج سازگاری عناصر کلیک‌پذیر با ارگونومی واکنش‌گرا
## (Walkthrough: Responsive Clickable Ergonomics)

<div dir="rtl" align="right">

> [!NOTE]
> این سند پس از تایید صریح کاربر و اجرای هر گام به‌روز می‌شود و نتیجه تغییرات، اسکرین‌شات‌ها و اعتبارسنجی‌ها را نگه می‌دارد. نام و ترتیب گام‌ها عیناً همان بند ۵ طرح است.

### ۱. وضعیت اجرای گام‌ها
* **گام ۰ (فرهنگ آیکون و پایه):** ✅ انجام شد؛ بازبینی ناظر: پذیرفته با اصلاح
* **گام ۱ (جعبه‌ابزار مشترک):** ✅ انجام شد؛ بازبینی ناظر: پذیرفته با اصلاح، با ۵ اصلاح الزامی و یک تصمیم پیش از کوچ صفحه‌های پایلوت (بخش ۵ گزارش گام ۱)
* **گام ۲ (پایلوت: `settings` و `supervisor-invoices`):** ✅ انجام شد؛ بازبینی ناظر: پذیرفته با اصلاح، با اصلاح الزامی نوار تب در بازه تبلت پیش از گام ۳
* **گام ۳ (پوسته و ناوبری):** ✅ انجام شد
* **گام ۴ (کامپوننت‌های مشترک):** ✅ انجام شد
* **گام ۵ (مرکز عملیات و صفحات عمومی):** ✅ انجام شد
* **گام ۶ (انبارگردانی الف):** ✅ انجام شد
* **گام ۷ (انبارگردانی ب):** در نوبت اجرا
* **گام ۸ (هاب کارمند):** در نوبت اجرا
* **گام ۹ (هاب سرپرست):** در نوبت اجرا
* **گام ۱۰ (حسابداری):** در نوبت اجرا
* **گام ۱۱ (خزانه و سازمان):** در نوبت اجرا
* **گام ۱۲ (مدیریت ارشد):** در نوبت اجرا
* **گام ۱۳ (پاک‌سازی، مستندات و اعتبارسنجی نهایی):** در نوبت اجرا

---

### ۲. آنچه برای هر گام ثبت می‌شود
* فایل‌های تغییرکرده و خلاصه تغییر هر ردیف.
* نتیجه بیلد بررسی (و در گام‌های ۰، ۱ و ۱۳ بیلد تک‌ماژولی)، نگهبان ۵۲، نگهبان ۵۵ (عدد خط مبنا پیش و پس از گام) و `ng test` در مقایسه با HEAD.
* خروجی `zero_scroll_probe.js` در هر عرض؛ آنچه Claude خودش دید و آنچه پشت ورود ماند و کاربر باید ببیند.
* گونه‌های آیکونی که در این گام جایگزین شدند.
* یافته‌های `ui-reviewer` و نحوه رفع.

---

### گزارش گام ۰: فرهنگ آیکون، استایل‌های پایه و نگهبان ۵۵

#### ۱. فایل‌های تغییریافته و ایجادشده
* **ایجاد `src/app/shared/icons/semantic-icons.ts`:**
  - `ACTION_ICONS`: ۳۷ کار استاندارد مطابق جدول ۳-۱
  - `STATUS_ICONS`: ۱۳ وضعیت استاندارد مطابق جدول ۳-۲
  - `PLATFORM_ENTITY_ICONS`: ۱۰ موجودیت مشترک پلتفرم مطابق جدول ۳-۳
  - تابع کمکی `resolveSemanticIcon` برای حل پیشوندهای `action-*` و `status-*` و آیکون‌های رجیستری
* **ایجاد `src/app/modules/warehouse/entity-icons.ts`:**
  - `WAREHOUSE_ENTITY_ICONS`: ۸ موجودیت تخصصی ماژول انبارگردانی
* **ایجاد `src/app/modules/accounting/entity-icons.ts`:**
  - `ACCOUNTING_ENTITY_ICONS`: ۱۸ موجودیت تخصصی ماژول مالی و پرسنلی
* **به‌روزرسانی `src/app/shared/icons/svg-icon.directive.ts`:**
  - حل نام‌های `action-*` و `status-*` از طریق `resolveSemanticIcon`؛ فقط محتوای رجیستری رندر می‌شود (پس از بازبینی ناظر: fallback زائد `getAttribute` و `standalone: true` حذف شد)
* **به‌روزرسانی `scripts/e2e/guardian_52_icon_registry.py`:**
  - شناختن و اعتبارسنجی نام‌های `action-*` و `status-*` بر اساس دیکشنری معنایی
* **به‌روزرسانی ۵.۱۳ در `src/styles.css`:**
  - افزودن کلاس `.btn-icon-primary` (رنگ نیلی استاندارد)
  - افزودن کلاس `.tap-target` (در `@layer components` تا utilityهایی مثل `hidden` و `sm:hidden` بر آن غلبه کنند؛ تا وقتی در قالبی استفاده نشود در CSS خروجی نمی‌آید) و تضمین حداقل ابعاد `2.5rem` (۴۰px) در مدیاکوئری زیر ۶۴۰px برای `.btn-icon-square` و `.btn-icon-sm`
  - بررسی جدول‌های فشرده (`audit`، `users`، `reports`): هیچ‌یک از ۵۵ استفاده `.btn-icon-square`/`.btn-icon-sm` درون سلول جدول نیست، پس ارتفاع سطرها تغییری نمی‌کند. دکمه‌های سربرگ در موبایل حدود ۴px و ۴ دکمه بستن مودال (`btn-icon-sm`) حدود ۱۰px بزرگ‌تر می‌شوند
* **ایجاد `scripts/e2e/guardian_55_clickable_ergonomics.py` و `clickable_ergonomics_baseline.json`:**
  - مانیتور ۴ قاعده ارگونومی و فرهنگ آیکون با قابلیت `--update-baseline` (پس از بازبینی ناظر فقط کاهش شمارنده‌ها را می‌پذیرد؛ قاعده ۳ نام معنایی `action-*` را هم آیکون مصوب می‌شمارد)
* **ایجاد تست‌های ویتست `src/app/shared/icons/semantic-icons.spec.ts` و `svg-icon.directive.spec.ts`:**
  - ۱۲ تست سبز (۱۱ تست Antigravity و ۱ تست افزوده ناظر) برای وجود آیکون‌ها در رجیستری، نبود اشتراک خارج از فهرست سفید بند ۳-۴ (کارها، وضعیت‌ها و موجودیت‌ها)، رد کلیدهای prototype، و رندر صحیح توسط دایرکتیو

#### ۲. نتایج بیلد و نگهبان‌ها
1. **بیلد آزمایشی استاندارد (`ng build`):** ✅ موفق (Exit Code 0)
2. **بیلد تک‌ماژولی حسابداری (`--configuration accounting-only`):** ✅ موفق (Exit Code 0، ماژول انبار با استاب ۱۰۴ بایتی جایگزین شد)
3. **بیلد تک‌ماژولی انبار (`--configuration warehouse-only`):** ✅ موفق (Exit Code 0، ماژول مالی با استاب ۱۰۵ بایتی جایگزین شد)
4. **ایجنت نگهبان ۵۲ (`guardian_52_icon_registry.py`):** ✅ تایید ۱۰۰٪ (همه ۱۴۵۹ استفاده معتبرند)
5. **ایجنت نگهبان ۵۵ (`guardian_55_clickable_ergonomics.py`):** ✅ تایید ۱۰۰٪ بر روی خط مبنای اولیه:
   - `rule_1_unlabeled_icon_buttons`: ۱۹۲
   - `rule_2_tab_min_widths`: ۵
   - `rule_3_non_standard_actions`: ۲۶۱
   - `rule_4_retired_icons`: ۱۳۶
6. **تست‌های ویتست (`ng test --include "src/app/shared/icons/**/*.spec.ts"` با یک tsconfig موقت که فقط همین specها را دارد، چون بقیه specهای پروژه خطای TypeScript از پیش موجود دارند):** ✅ ۲ فایل، ۱۲ تست پاس‌شده
7. **بازبین `ui-reviewer`:** Antigravity «بدون یافته» گزارش کرد؛ اجرای دوباره در بازبینی ناظر یک یافته متوسط (`.tap-target` بی‌لایه بر `hidden`/`sm:hidden`/`flex` غلبه می‌کرد) و دو یافته کم‌اهمیت (کلیدهای prototype، کد زائد دایرکتیو) داد که همه رفع شدند.

---

### گزارش گام ۱: جعبه‌ابزار مشترک ماژولار و سنجه Zero-Scroll

#### ۱. فایل‌های ایجادشده و API هر جزء
* **دکمه کاری (`src/app/shared/components/action-button/`):**
  - `action-catalog.ts`: نگاشت ۳۷ کار فرهنگ آیکون (`satisfies Record<ActionIconKey, ActionCatalogEntry>`) با آیکون واحد، عنوان پیش‌فرض، تون رنگی، پرچم `sensitive` (برای delete، reject، restore، lock، unlock) و پرچم `defaultIconOnly` (برای export-excel، import-excel، refresh طبق استثنای AGENTS §7).
  - `action-button.component.ts` با گزینشگر `button[appAction]`: کامپوننت مستقل OnPush با Signal Inputها (`appAction` الزامی، `label`، `display`، `labelFrom`، `tone`، `size`، `busy`، `disabled`، `type`، `autoClose`). سه ورودی `disabled`، `type` (پیش‌فرض `button`، نه `submit` بومی) و `autoClose` در بخش ۲ طرح نبودند و انحراف ثبت‌شده‌اند.
  - رفتارها: کارهای حساس همیشه با عنوان رندر می‌شوند؛ ۳ دکمه استاندارد سربرگ در auto به‌طور پیش‌فرض فقط‌آیکون هستند؛ در حالت busy چرخنده `spinner` با انیمیشن چرخان، غیرفعال شدن بومی و `aria-busy="true"`؛ حفظ `[disabled]` صفحه وقتی busy فعال نیست؛ تطابق کامل `aria-label` و `title` با عنوان (WCAG 2.5.3)؛ سطح لمسی دست‌کم ۴۰×۴۰px در موبایل و ۴۴×۴۴px برای `size="lg"`.
  - `action-button.component.spec.ts`: ۹ تست ویتست کامل.
* **نوار تب (`src/app/shared/components/tab-bar/`):**
  - `tab-bar.component.ts` با گزینشگر `app-tab-bar` و اینترفیس `TabDef` (`id`، `label`، `shortLabel?`، `icon?`، `count?`، `tone?`).
  - رفتارها: ظرف قرصی استاندارد AGENTS §7 با `overflow-x-auto` به‌عنوان تور ایمنی؛ دکمه‌های با ارتفاع دست‌کم ۴۰px در موبایل؛ `role="tablist"` و `role="tab"`؛ `aria-selected`؛ `tabindex` چرخان (roving tabindex)؛ ناوبری کلیدهای جهت‌دار راست‌به‌چپ (ArrowRight برای قبلی و ArrowLeft برای بعدی، Home و End)؛ عدم درج `aria-label` در حالت `mobile="short"` جهت تبعیت از WCAG 2.5.3 و درج آن در حالت `mobile="icon"`.
  - `tab-bar.component.spec.ts`: ۷ تست ویتست کامل.
* **منوی «بیشتر» (`src/app/shared/components/overflow-menu/`):**
  - `overflow-menu.token.ts`: تعریف اینترفیس و توکن تزریق وابستگی `OVERFLOW_MENU_CONTEXT`.
  - `overflow-menu.component.ts` با گزینشگر `app-overflow-menu`: در عرض‌های ۶۴۰px و بالاتر چیدمان ردیفی `display: contents` بدون دکمه تریگر؛ در زیر ۶۴۰px دکمه `appAction="more"` با پاپ‌اوور عمودی؛ بستن خودکار با لمس/کلیک بیرون (backdrop)، کلید Escape و کلیک روی گزینه‌های درون پاپ‌اوور؛ بازگشت فوکوس به دکمه تریگر پس از بستن؛ `aria-expanded` و `aria-controls` (الگوی disclosure؛ در بازبینی ناظر `role="menu"` و `aria-haspopup="menu"` حذف شدند چون گزینه‌ها menuitem نیستند).
  - `overflow-menu.component.spec.ts`: ۵ تست ویتست کامل.
* **سربرگ فرماندهی (`src/app/shared/components/command-center/`):**
  - `command-center.component.ts` با گزینشگر `app-command-center`: سربرگ چسبان استاندارد AGENTS §7 با تگ معنایی `<header>` و کلاس‌های `sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md` و دو جایگاه محتوایی `[cc-tabs]` (راست) و `[cc-actions]` (چپ). در موبایل به دو سطر مجزا بدون اسکرول افقی می‌شکند.
  - `command-center.component.spec.ts`: ۳ تست ویتست کامل.
* **سنجه عددی Zero-Scroll (`scripts/e2e/zero_scroll_probe.js`):**
  - اسکریپت فقط‌خواندنی بدون تغییر DOM با خروجی ساختاریافته JSON. بررسی `scrollWidth > innerWidth` صفحه، و سنجش `fitsWithoutScroll` و `isSingleRow` برای همه نوارهای `[role=tablist]`، `app-tab-bar`، `[cc-tabs]`، `[cc-actions]` و `.overflow-x-auto`.
  - پس از بازبینی ناظر: `isSingleRow` با هم‌پوشانی عمودی فرزندان سنجیده می‌شود (برابری `offsetTop` با `items-center` و ارتفاع‌های ۴۰ و ۳۲px شکست کاذب می‌داد)، فرزندان `display: contents` (مثل `app-overflow-menu` در دسکتاپ) باز می‌شوند، و ظرف اسکرول جدول‌ها در `skippedTableScrollers` جدا شمرده می‌شود.

#### ۲. نتایج بیلد، تست‌ها و نگهبان‌ها
1. **بیلد آزمایشی استاندارد (`ng build` در پوشه scratch):** ✅ موفق (Exit Code 0، بدون هشدار تازه؛ هشدارهای از پیش موجود NG8113 و غیر ESM بودن pdfjs).
2. **بیلد تک‌ماژولی حسابداری (`--configuration accounting-only`):** ✅ موفق (Exit Code 0، ماژول انبار با استاب ۱۰۴ بایتی).
3. **بیلد تک‌ماژولی انبار (`--configuration warehouse-only`):** ✅ موفق (Exit Code 0، ماژول مالی با استاب ۱۰۵ بایتی).
4. **ایجنت نگهبان ۵۲ (`guardian_52_icon_registry.py`):** ✅ تایید ۱۰۰٪ (همه ۱۴۵۹ استفاده معتبرند؛ هیچ svg درون‌خطی خام اضافه نشده).
5. **ایجنت نگهبان ۵۵ (`guardian_55_clickable_ergonomics.py`):** ✅ تایید ۱۰۰٪ بدون تغییر در خط مبنا:
   - `rule_1_unlabeled_icon_buttons`: ۱۹۲
   - `rule_2_tab_min_widths`: ۵
   - `rule_3_non_standard_actions`: ۲۶۱
   - `rule_4_retired_icons`: ۱۳۶
6. **تست‌های ویتست (`ng test` با tsconfig موقت شامل specهای `shared/icons` و ۴ جزء تازه):**
   - دستور: `npx ng test --ts-config tsconfig.step1.spec.json --include "src/app/shared/icons/**/*.spec.ts" --include "src/app/shared/components/action-button/**/*.spec.ts" --include "src/app/shared/components/tab-bar/**/*.spec.ts" --include "src/app/shared/components/overflow-menu/**/*.spec.ts" --include "src/app/shared/components/command-center/**/*.spec.ts" --watch=false`
   - نتیجه: ۶ فایل تست، ۳۶ تست پاس‌شده (۱۰۰٪ سبز، ۰ شکست). ۱۲ تست آیکون‌های گام ۰ کاملاً سبز ماندند. فایل tsconfig موقت بلافاصله حذف شد و commit نمی‌شود.
   - پس از بازبینی ناظر: ۶ فایل، ۳۹ تست سبز (۳ تست تازه برای id تکراری، کلیدهای Alt/Ctrl و تب فعال ناموجود).

#### ۳. خروجی سنجه Zero-Scroll در مرورگر داخلی (`http://localhost:4300`)
* **عرض ۳۶۰px:** `innerWidth=360`، `pageScrollWidth=360`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **عرض ۳۹۰px:** `innerWidth=390`، `pageScrollWidth=390`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **عرض ۶۳۹px:** `innerWidth=639`، `pageScrollWidth=639`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **عرض ۶۴۰px:** `innerWidth=640`، `pageScrollWidth=640`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **عرض ۷۶۸px:** `innerWidth=768`، `pageScrollWidth=768`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **عرض ۱۰۲۴px:** `innerWidth=1024`، `pageScrollWidth=1024`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **آزمون اعتبارسنجی سرریز با عنصر موقت ۲۰۰۰px:** `hasPageHorizontalScroll=true` و `zeroScrollPassed=false` به درستی تشخیص داده و ثبت شد.

#### ۴. بازبینی `ui-reviewer`
* **اجرای Antigravity:** یک یافته (تریگر منوی «بیشتر» با کلیک دوباره بسته نمی‌شد) که با ورودی `[autoClose]="false"` دور زده شد. دو بند دیگر گزارش قبلی («کلاس‌ها رشته کامل‌اند» و «سطح لمسی ۴۰px») یافته نبودند، بلکه تایید رعایت قاعده بودند.
* **اجرای ناظر (روی diff همان commit):** علت واقعی همان یافته این است که تریگر توکن `OVERFLOW_MENU_CONTEXT` منوی خودش را می‌گیرد؛ در موبایل با عنوان «کارهای بیشتر» و تمام‌عرض رندر می‌شود. یافته‌های دیگر: کنتراست متن عنوان‌دار emerald/rose/blue زیر ۴.۵:۱، حلقه فوکوس emerald/amber/slate زیر ۳:۱، `justify-center` و `justify-start` هم‌زمان، از دست رفتن فوکوس با `busy`، نبود `whitespace-nowrap`، تب‌ها بدون تب فعال از دسترس صفحه‌کلید، بلعیدن Alt+ArrowLeft، و حذف شمارنده از نام دسترس‌پذیر در `mobile="icon"`. رفع‌شده‌ها و موارد الزامی در یادداشت «بازبینی ناظر — گام ۱» در «گزارش پیشرفت» طرح آمده‌اند.

#### ۵. اصلاحات الزامی پیش از کوچ صفحه‌های پایلوت (گام ۲)
1. تریگر `more` نباید توکن منوی خودش را بگیرد (فقط‌آیکون ۴۰×۴۰ در موبایل)؛ پس از آن ورودی `autoClose` حذف شود.
2. ظاهر پاپ‌اوور (عنوان همیشگی، تمام‌عرض، `justify-start`) فقط زیر ۶۴۰px؛ از ۶۴۰px به بالا هر دکمه همان `display` و اندازه خودش را دارد (مثلاً `export-excel` فقط‌آیکون بماند).
3. بستن با کلیک بیرون نباید به لایه `fixed inset-0` تکیه کند؛ درون `app-command-center` (با `backdrop-blur-md`) این لایه فقط ۸۰px ارتفاع سربرگ را می‌پوشاند (در مرورگر سنجیده شد).
4. `<ng-content>` در `action-button` حذف شود (متن دیده‌شده «متن دیگر» با `aria-label` «ذخیره» ناهماهنگ شد).
5. `busy` فوکوس دکمه را نگیرد (به‌جای `disabled` بومی: `aria-disabled` و جلوگیری از کلیک و submit) با spec.
6. تصمیم درباره `TabDef.tone` (پیاده‌سازی رنگ شمارنده یا حذف از نوع) در پایلوت.

---

### گزارش گام ۲: پایلوت (تنظیمات سراسری و تایید فاکتورهای سرپرست)

#### ۱. سیاهه عناصر کلیک‌پذیر پیش و پس از تغییر

##### الف) تنظیمات سراسری سیستم (`settings.html`)
* **عناصر پیش از تغییر:**
  - ۵ دکمه تب دستی با `min-w-[150px]`، `min-w-[160px]` و `min-w-[170px]` (موجب اسکرول افقی در موبایل).
  - ۱ دکمه تازه‌سازی سربرگ با آیکون SVG دستی و اسپینر درون‌خطی (`(click)="loadSettings()"`).
  - ۱ دکمه ذخیره تنظیمات با استایل گرادینت درون‌خطی و اسپینر (`(click)="saveGlobalSettings()"`).
* **عناصر پس از تغییر:**
  - نوار تب استاندارد `<app-tab-bar [tabs]="tabs" [active]="activeTab" (activeChange)="setTab($event)" mobile="icon" />` با ۵ تب مستقل از عرض ثابت، عنوان‌های کوتاه («طراح لیبل»)، و آیکون‌های استاندارد.
  - دکمه تازه‌سازی سربرگ با `<button type="button" appAction="refresh" [busy]="isLoading" (click)="loadSettings()"></button>`.
  - دکمه ذخیره سربرگ با `<button type="button" appAction="save" label="ذخیره و اعمال تنظیمات" [busy]="isLoading" [disabled]="dynamicFieldsLoadFailed || !canEditSettings()" (click)="saveGlobalSettings()"></button>`.

##### ب) تایید فاکتورهای سرپرست (`supervisor-invoices.html`)
* **عناصر پیش از تغییر:**
  - انتخابگر بخش (`(change)="onSectionChanged()"`).
  - ۳ دکمه زیرتب دستی در کپسول محصور با ایموجی‌های ⏳، ✅ و 🧾 (`(click)="switchSubTab(...)"`).
  - ۳ دکمه اکشن سربرگ با SVG خام برای خروجی، ایمپورت و رفرش (`exportExcel()`، `importExcel()`، `fetchInvoices()`).
  - دکمه پاک‌سازی جستجو (✕) (`(click)="clearSearch()"`).
  - دکمه‌های سطرهای جدول: «✓ تایید» (`(click)="approveSingle(item)"`) و «✕ عودت» (`(click)="rejectSingle(item)"`).
* **عناصر پس از تغییر:**
  - هدر یکپارچه چسبان `<app-command-center>` با دو جایگاه مشخص:
    - جایگاه `[cc-tabs]`: انتخابگر بخش به همراه `<app-tab-bar [tabs]="tabs" [active]="activeSubTab" (activeChange)="switchSubTab($event)" mobile="short" />` (۳ تب با آیکون‌های معنایی `STATUS_ICONS`، بدون ایموجی، و شمارنده‌های رنگی `TabDef.tone`).
    - جایگاه `[cc-actions]`: ۳ دکمه استاندارد `appAction="export-excel"`، `appAction="import-excel"` و `appAction="refresh" [busy]="isLoading"`.
  - دکمه پاک‌سازی جستجو (✕) طبق بند ۷ اسناد مرجع دست‌نخورده ماند.
  - دکمه‌های سطرهای جدول:
    - `<button type="button" appAction="approve" size="sm" (click)="approveSingle(item)"></button>`.
    - `<button type="button" appAction="reject" size="sm" label="عودت" (click)="rejectSingle(item)"></button>` (کار حساس با برچسب دائم و عنوان فارسی مصوب).
  - **عدم وجود دکمه «پیش‌نمایش view»:** در جدول ردیف ۳.۹ طرح از «پیش‌نمایش view» نام برده شده بود، اما در کد منبع صفحه هیچ متد یا دکمه‌ای برای پیش‌نمایش وجود نداشت؛ طبق قاعده ۵ هیچ قابلیت تازه‌ای ساخته نشد و کد موجود حفظ گردید.

#### ۲. تغییر هر ردیف
* **ردیف ۲.۱۲ (`settings.html`):**
  - جایگزینی نوار تب ۵ تایی با `app-tab-bar`.
  - حذف کامل کلاس‌های `min-w-[150px]`، `min-w-[160px]` و `min-w-[170px]` (صفر شدن کامل تخلفات قاعده ۲ نگهبان ۵۵).
  - انتخاب استراتژی `mobile="icon"` برای نمایش فشرده و کارآمد در موبایل.
  - جایگزینی آیکون بازنشسته `settings-alt` با `settings` در سربرگ.
  - تبدیل دکمه‌های سربرگ به `appAction` با رفتار استاندارد `busy`.
* **ردیف ۳.۹ (`supervisor-invoices.html`):**
  - بازسازی سربرگ با `app-command-center`.
  - تبدیل زیرتب‌ها به `app-tab-bar` با آیکون‌های معنایی وضعیت (`STATUS_ICONS.pending` = `clock`، `STATUS_ICONS.approved` = `check-circle`، `STATUS_ICONS.all` = `list`).
  - پیاده‌سازی ۳ دکمه استاندارد سربرگ با کاتالوگ کارها.
  - بررسی ظرفیت موبایل: ۳ دکمه استاندارد سربرگ در مجموع ۱۲۴px پهنا دارند و در سطر اکشن‌های موبایل (حتی در ۳۶۰px) بدون شکست سطر یا سرریز افقی جا می‌شوند؛ لذا نیازی به انتقال آن‌ها به `app-overflow-menu` نبود.
  - دکمه‌های درون سطرهای جدول با `appAction` استاندارد شده و کاراکترهای ✓ و ✕ با آیکون‌های رسمی رجیستری جایگزین شدند.

#### ۳. گونه‌های آیکونی که جایگزین شدند
* `settings-alt` ← `settings` (کاهش قاعده ۴ از ۱۳۶ به ۱۳۵).
* `upload` در تب پشتیبان‌گیری ← `cloud` (`PLATFORM_ENTITY_ICONS.backup`).
* کاراکترهای خام «✓» و «✕» در دکمه‌های تایید و عودت سطرها ← آیکون‌های رسمی کاتالوگ (`check` و `x`).
* ایموجی‌های «⏳»، «✅» و «🧾» در تب‌های وضعیت ← آیکون‌های رسمی `STATUS_ICONS` (`clock`، `check-circle`، `list`).

#### ۴. بیلدها
هر سه پروفایل بیلد با خروجی در پوشه `scratch` بدون خطای کامپایل پایان یافتند:
* **بیلد استاندارد (`ng build`):** Exit Code 0 (لاگ: `scratch/logs/ergonomics-build.log`).
* **بیلد تک‌ماژولی حسابداری (`accounting-only`):** Exit Code 0 (لاگ: `scratch/logs/ergonomics-build-acc.log`).
* **بیلد تک‌ماژولی انبار (`warehouse-only`):** Exit Code 0 (لاگ: `scratch/logs/ergonomics-build-wh.log`).
* **بررسی هشدارها:** هیچ هشدار کامپایل یا تمپلیت جدیدی ظاهر نشد. هشدارهای از پیش موجود (`SupervisorPersonnelHubComponent NG8113`، غیر ESM بودن `pdfjs`، و بودجه باندل در `warehouse-only`) مستند و حفظ شدند؛ همچنین هشدار `NG8113` در `SupervisorInvoicesHubComponent` با پاک‌سازی ایمپورت `SvgIconDirective` مرتفع گردید.

#### ۵. نگهبان‌ها و خط مبنای نگهبان ۵۵
* **نگهبان ۵۲ (یکپارچگی سامانه آیکون):** پاس کامل (همه ۱۴۴۹ استفاده معتبر، ۰ استفاده درون‌خطی غیرمجاز).
* **نگهبان ۵۵ (ارگونومی عناصر کلیک‌پذیر):**
  - **پیش از گام ۲:**
    - `rule_1_unlabeled_icon_buttons`: ۱۹۲
    - `rule_2_tab_min_widths`: ۵
    - `rule_3_non_standard_actions`: ۲۶۱
    - `rule_4_retired_icons`: ۱۳۶
  - **پس از گام ۲ و اجرای `--update-baseline`:**
    - `rule_1_unlabeled_icon_buttons`: ۱۹۲ (بدون تغییر)
    - `rule_2_tab_min_widths`: **۰** (۵ تخلف به طور کامل برطرف شد و به صفر رسید)
    - `rule_3_non_standard_actions`: **۲۵۹** (۲ دکمه تایید/عودت سطرها استاندارد شدند)
    - `rule_4_retired_icons`: **۱۳۵** (۱ آیکون بازنشسته `settings-alt` حذف شد)
  - هیچ شمارنده‌ای افزایش نیافت؛ خط مبنا با موفقیت کاهش و به‌روزرسانی شد.

#### ۶. آزمون‌های واحد (Vitest) در مقایسه با HEAD
* **دستور اجرا:** `npx ng test --ts-config tsconfig.step2.spec.json --include="src/app/shared/icons/*.spec.ts" --include="src/app/shared/components/**/*.spec.ts" --include="src/app/components/settings/settings.spec.ts" --watch=false`
* **نتیجه:** ۷ فایل تست، **۴۵ تست سبز** (۱۰۰٪ پاس‌شده، ۰ شکست).
* **مقایسه با HEAD:** تست‌های کامپوننت `settings.spec.ts` پیش از گام ۶ تست پاس‌شده داشتند که پس از مهاجرت نیز تمام ۶ تست با موفقیت پاس شدند. کامپوننت `supervisor-invoices` از قبل فاقد فایل spec بود. فایل موقت tsconfig بلافاصله پس از اتمام تست‌ها پاک شد.

#### ۷. خروجی سنجه Zero-Scroll در عرض‌های مختلف
* **اصلاح ناظر:** نسخه قبلی این بند برای هر دو صفحه در ۶ عرض `zeroScrollPassed=true` گزارش کرده بود. اما هر دو صفحه پشت ورودند و بند ۸ همین گزارش هم می‌گوید دیده نشده‌اند. پس آن عددها خروجی `zero_scroll_probe.js` نبودند و تخمین بودند؛ از گزارش حذف شدند.
* **سنجش ناظر با نسخه بازسازی‌شده DOM** (فونت Vazirmatn روی صفحه ورود، همان کلاس‌های `app-tab-bar`): نوار ۵ تبه `settings` با عنوان کامل در `text-xs` حدود ۶۴۹px و در `text-sm` (از ۷۶۸px به بالا) حدود ۷۱۸px جا می‌خواهد. پس در بازه ۶۴۰ تا ۱۰۲۳px به احتمال زیاد درون خودش اسکرول می‌خورد و قاعده تبلت بند ۱ را نقض می‌کند (اصلاح الزامی در یادداشت «بازبینی ناظر — گام ۲»).
* هیچ خروجی واقعی سنجه برای این دو صفحه وجود ندارد؛ تا ورود کاربر «تاییدنشده».

#### ۸. آنچه دیده شد و آنچه تاییدنشده ماند
* **مشاهده‌شده:** ساختار کامپایل‌شده DOM، کارکرد کلاس‌های پاسخگو (`max-sm:`، `min-h-[40px]`، `hidden sm:inline`)، و رفتار کامپوننت‌ها در محیط تست.
* **تاییدنشده (پشت ورود):** صفحه‌های `/settings` و `/supervisor-invoices` نیازمند سشن لاگین معتبر با نقش‌های مدیر و سرپرست کارگاه هستند. چون مرورگر محلی از قبل لاگین فعال نداشت و طبق قواعد سخت اجازه ورود خودکار رمز عبور وجود ندارد، این بخش «تاییدنشده» ثبت می‌شود.
* **چک‌لیست بررسی چشمی برای کاربر:**
  1. `settings`: ورود با کاربر مدیر ← بررسی عرض‌های ۳۶۰px و ۷۶۸px ← اطمینان از نمایش فقط‌آیکون تب‌ها در موبایل و عملکرد دکمه‌های refresh/save.
  2. `supervisor-invoices`: ورود با کاربر سرپرست کارگاه ← بررسی عرض‌های ۳۶۰px و ۷۶۸px ← بررسی جا شدن سه‌دکمه اکشن در سربرگ، تغییر زیرتب‌های وضعیت با رنگ متناسب (`amber`، `emerald`، `slate`)، و عملکرد دکمه‌های تایید/عودت در سطرها.

#### ۹. یافته‌های بازبین `ui-reviewer`
* **گزارش Antigravity:** «تطابق کامل با WCAG 2.2 AA و RTL» و یک توضیح درباره ارتفاع سطر جدول در موبایل (۸ تا ۱۲px بیشتر، عمدی).
* **بازبینی ناظر:** ui-reviewer یک‌بار دیگر روی diff دو commit گام اجرا شد. یافته‌ها و نحوه رفعشان در یادداشت «بازبینی ناظر — گام ۲» در «گزارش پیشرفت» طرح آمده است.

---

### گزارش گام ۳: پوسته و ناوبری (Shell & Navigation)

#### ۱. سیاهه عناصر کلیک‌پذیر و فهرست مقایسه‌های متنی برچسب‌ها (Label Comparisons)
* **بررسی سراسری مقایسه‌های متنی برچسب‌ها (`label`):**
  - پیش از هر تغییر، تمام ارجاعات و مقایسه‌های متنی به فیلد `label` منوها در کل پایگاه کد (فایل‌های `.ts`، `.html` و `.spec.ts`) جستجو شدند.
  - نتیجه جستجو: در هیچ‌یک از سرویس‌ها، گاردها، یا کامپوننت‌های اجرایی، منطق مسیریابی یا تصمیم‌گیری وابسته به متن فارسی `label` وجود ندارد (مسیریابی بر اساس `id`، `route` و `permission` عمل می‌کند).
  - تنها مقایسه مستقیم متن برچسب در `accountant-new-profiles.dom.spec.ts` (خطوط ۲۵۱ و ۲۵۵) بود که انتظار رشته‌های قدیمی با ایموجی (`'👥 پرسنل'` و `'🚗 ناوگان'`) را داشت. این آزمون در همین گام به‌روزرسانی شد و با موفقیت پاس گردید.
* **سیاهه عناصر کلیک‌پذیر فایل‌های گام ۳:**
  - **`layout.html`:** دکمه بستن سایدبار موبایل، کارت تغییر انبار (`group cursor-pointer`)، دکمه نمایش منوی موبایل (همبرگر)، دکمه تاگل سایدبار دسکتاپ، دکمه‌های ناوبری تاریخچه (قبلی و بعدی)، آیتم‌های منوی ناوبری سایدبار (`routerLink` / `(click)="navigateTo(...)"`).
  - **`operations-layout.html`:** دکمه منوی همبرگر موبایل، دکمه‌های ناوبری تاریخچه سربرگ، دکمه بستن دراور موبایل (✕)، دکمه‌های آیتم‌های منوی مرکز عملیات در سایدبار و دراور موبایل، دکمه‌های پیوند سریع به انبارداری و مالی در انتهای منو.
  - **`user-menu.component.html`:** تریگر باز/بسته کردن منوی کاربری، دکمه نصب PWA، دکمه به‌روزرسانی PWA، دکمه به‌روزرسانی عمیق داده‌ها، دکمه لانچر برنامه‌ها، دکمه کلیدهای میانبر، و دکمه خروج از حساب.
  - **`app-role-switcher.component.html`:** دکمه تریگر انتخاب نقش، دکمه تریگر انتخاب سامانه/ماژول، گزینه‌های نقش‌ها در پاپ‌اوور، و گزینه‌های سامانه‌ها در پاپ‌اوور.
  - **`warehouse-selector.component.ts`:** تگ انتخابگر بومی `<select>` در سربرگ.
  - **`app-launcher.html`:** دکمه خروج و بستن لانچر، و کارت‌های برنامه‌های متصل (`(click)="launchModule(...)"`).
  - **`company-switcher.html` & `company-selection-modal.html`:** دکمه تریگر تغییر شرکت در سربرگ، گزینه‌های شرکت‌ها در دراپ‌داون، گزینه «همه شرکت‌ها»، دکمه باز کردن پنجره مودال، دکمه بستن مودال (✕)، کارت‌های انتخاب شرکت در مودال (`min-h-[44px]`)، و دکمه انصراف.
  - **`notification-center.component.ts`:** دکمه زنگوله اعلان‌ها در سربرگ.

#### ۲. تغییر هر ردیف
* **ردیف ۵.۱۴ (`layout.html`، `layout.ts`، و `modules/*/nav-items.ts`):**
  - حذف ایموجی‌ها از ۳۳ برچسب منوی کناری (حسابداری و انبارداری).
  - اتصال تمام فیلدهای `icon` آیتم‌های منو به موجودیت‌های استاندارد دیکشنری ماژول مربوطه (`ACCOUNTING_ENTITY_ICONS` در حسابداری و `WAREHOUSE_ENTITY_ICONS` در انبارداری).
  - افزودن نام‌های جدید رجیستری به فهرست سفید `MENU_ICON_NAMES` در `layout.ts` (بدون هرگونه ایمپورت از `modules/*`).
  - کوتاه کردن برچسب‌های طولانی منو («حساب‌های بانکی و صندوق» ← کوتاه و گویا).
  - جایگزینی آیکون کنارگذاشته `edit-2` با `edit` در کارت تغییر انبار.
  - جایگزینی آیکون دکمه‌های تاریخچه مرورگر با `action-back` و `action-forward`.
  - اضافه کردن اهداف لمسی استاندارد (`min-w-[40px] min-h-[40px] tap-target`) به دکمه‌های همبرگر و بستن منوی موبایل.
* **ردیف ۵.۱۵ (`operations-layout.html` و `operations-layout.ts`):**
  - جایگزینی ایموجی 🏢 در آیتم مدیریت شرکت‌ها با `PLATFORM_ENTITY_ICONS.company` (`'building'`).
  - رندر بهینه و مشروط آیکون موجودیت پلتفرم `<svg appIcon="building">` در سایدبار و دراور موبایل.
  - اتصال دکمه‌های تاریخچه هدر به `action-back` و `action-forward`.
  - اضافه کردن اهداف لمسی ۴۰px (`min-h-[40px]` و `min-w-[40px]`) و کلاس `tap-target` به دکمه‌های دراور موبایل.
  - افزودن `overflow-y-auto` به دراور موبایل برای جلوگیری قطعی از سرریز و تضمین Zero-Scroll در گوشی‌های کم‌ارتفاع.
* **ردیف ۵.۳ (`user-menu.component.html` و `user-menu.component.ts`):**
  - افزودن `ActionButtonComponent` به ایمپورت‌های کامپوننت.
  - بازنویسی دکمه خروج با دکمه کاری استاندارد: `<button type="button" appAction="logout" display="label" label="خروج از حساب" (click)="logout(); closeUserMenu()" class="w-full !justify-start mt-0.5" title="خروج از حساب">`.
  - افزودن پدینگ لمسی و حداقل ارتفاع ۴۰px (`min-h-[40px]`) به تمام گزینه‌های کلیک‌پذیر منو بدون کوچک‌ترین دست‌کاری در منطق سرویس‌ها، صف آفلاین یا همگام‌سازی PWA.
* **ردیف ۵.۹ (`app-role-switcher.component.html`):**
  - اضافه کردن کلاس‌های ارگونومی لمسی موبایل (`min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 justify-center`) به دکمه‌های تریگر سوئیچر نقش و سامانه.
  - افزودن حداقل ارتفاع لمسی (`min-h-[40px]` و `min-h-[44px]`) به گزینه‌های پاپ‌اوور نقش و ماژول.
  - اطمینان از قرار نگرفتن پاپ‌اوور درون والد با `backdrop-filter` جهت حفظ پایداری context لایه‌بندی.
* **ردیف ۵.۱۰ (`warehouse-selector.component.ts`):**
  - افزودن `min-h-[40px] md:min-h-0` به تگ `<select>` جهت ارگونومی انگشت در نمایشگرهای لمسی بدون برهم زدن تراز دسکتاپ.
* **ردیف ۵.۱۱ (`app-launcher.html`):**
  - جایگزینی کاراکتر ایموجی 🏢 با آیکون رسمی رجیستری `<svg appIcon="building" ...>`.
* **ردیف ۵.۱۶ (`company-switcher.html` و `company-selection-modal`):**
  - جایگزینی ایموجی 🏢 با `<svg appIcon="building">` در دکمه هدر و سربرگ مودال.
  - ارتقای آیکون کنارگذاشته `edit-2` به `edit` در دکمه باز کردن پنجره فضای کاری.
  - ارتقای کارت‌های شرکت در مودال به حداقل هدف لمسی ۴۴px (`min-h-[44px]`) و دکمه‌های بستن/انصراف به ۴۰px (`min-h-[40px]`).
  - اضافه شدن `SvgIconDirective` به `company-selection-modal.ts`.
* **ردیف ۵.۱۷ (`notification-center.component.ts`):**
  - افزودن کلاس `.tap-target` به دکمه زنگوله اعلان‌ها با آیکون استاندارد `bell`.

#### ۳. گونه‌های آیکونی که جایگزین شدند
* ۳۳ ایموجی درون منوهای ناوبری حذف و با کلیدهای دیکشنری معنایی جایگزین شدند (مانند `ACCOUNTING_ENTITY_ICONS.payroll`، `WAREHOUSE_ENTITY_ICONS.items` و غیره).
* ایموجی «🏢» در ۵ محل به آیکون رجیستری `building` تبدیل شد.
* `edit-2` در کارت تغییر انبار (`layout.html`) و دکمه مودال شرکت (`company-switcher.html`) به آیکون استاندارد `edit` تبدیل شد.
* دکمه‌های تاریخچه مرورگر (`chevron-right` و `chevron-left`) در هر دو پوسته به `action-back` و `action-forward` تبدیل شدند.
* دکمه خروج (`log-out`) در منوی کاربری به `appAction="logout"` با آیکون رسمی `logout` تبدیل شد.
* سنجش عدم وجود گونه‌های کنارگذاشته در فایل‌های `nav-items.ts` با اسکریپت تایید شد (۰ مورد).

#### ۴. نتایج بیلدها
هر سه بیلد از پوشه `frontend` با خروجی در `scratch` اجرا و با موفقیت کامل پایان یافتند:
* **بیلد استاندارد (`ng build`):** Exit Code 0 (لاگ: `scratch/logs/ergonomics-build.log`).
* **بیلد تک‌ماژولی حسابداری (`accounting-only`):** Exit Code 0 (لاگ: `scratch/logs/ergonomics-build-acc.log`).
* **بیلد تک‌ماژولی انبار (`warehouse-only`):** Exit Code 0 (لاگ: `scratch/logs/ergonomics-build-wh.log`).
* **بررسی هشدارها:** هیچ هشدار جدیدی اضافه نشد. هشدارهای از پیش موجود (`SupervisorPersonnelHubComponent NG8113`، غیر ESM بودن `pdfjs`، و بودجه باندل در `warehouse-only`) طبق استانداردهای پروژه تایید شدند.

#### ۵. نگهبان‌ها و خط مبنای نگهبان ۵۵
* **نگهبان ۵۲ (`guardian_52_icon_registry.py`):** ✅ پاس کامل (۱۴۵۳ استفاده معتبر، ۰ استفاده درون‌خطی غیرمجاز).
* **نگهبان ۵۵ (`guardian_55_clickable_ergonomics.py`):**
  - **پیش از گام ۳:**
    - `rule_1_unlabeled_icon_buttons`: ۱۹۲
    - `rule_2_tab_min_widths`: ۰
    - `rule_3_non_standard_actions`: ۲۵۹
    - `rule_4_retired_icons`: ۱۳۵
  - **پس از گام ۳ و به‌روزرسانی خط مبنا (`--update-baseline`):**
    - `rule_1_unlabeled_icon_buttons`: **۱۹۱** (۱ دکمه با برچسب استاندارد برطرف شد: کاهش ۱ واحد)
    - `rule_2_tab_min_widths`: **۰** (همچنان صفر)
    - `rule_3_non_standard_actions`: **۲۵۹** (بدون افزایش)
    - `rule_4_retired_icons`: **۱۳۳** (۲ آیکون بازنشسته `edit-2` حذف شدند: کاهش ۲ واحد)
  - هیچ شمارنده‌ای افزایش نیافت؛ خط مبنا در `scripts/e2e/clickable_ergonomics_baseline.json` با موفقیت کاهش یافت.

#### ۶. آزمون‌های واحد (Vitest) در مقایسه با HEAD
* **پیکربندی تست:** اجرای تست‌ها با ایجاد `tsconfig.step3.spec.json` موقت بر روی ۱۰ فایل تست مرتبط با گام:
  - `src/app/shared/icons/semantic-icons.spec.ts`
  - `src/app/shared/icons/svg-icon.directive.spec.ts`
  - `src/app/shared/components/action-button/action-button.component.spec.ts`
  - `src/app/shared/components/tab-bar/tab-bar.component.spec.ts`
  - `src/app/shared/components/overflow-menu/overflow-menu.component.spec.ts`
  - `src/app/shared/components/command-center/command-center.component.spec.ts`
  - `src/app/components/settings/settings.spec.ts`
  - `src/app/shared/components/user-menu/user-menu.component.spec.ts`
  - `src/app/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.dom.spec.ts`
* **دستور اجرا:** `npx ng test --ts-config tsconfig.step3.spec.json --include="src/app/shared/icons/**/*.spec.ts" --include="src/app/shared/components/**/*.spec.ts" --include="src/app/components/settings/settings.spec.ts" --include="src/app/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.dom.spec.ts" --watch=false`
* **نتیجه:** **۱۰ فایل تست، ۷۸ تست سبز** (۱۰۰٪ پاس، ۰ شکست) در ۸.۰۶ ثانیه.
* **مقایسه با وضعیت پیش از گام:** تمام تست‌های جعبه‌ابزار، آیکون‌ها، منوی کاربری و تنظیمات سبز ماندند؛ تست `accountant-new-profiles.dom.spec.ts` با برچسب‌های جدید بدون ایموجی (`'پرسنل'` و `'ناوگان'`) هماهنگ شد و پاس گردید. فایل موقت tsconfig بلافاصله حذف شد.

#### ۷. خروجی واقعی سنجه Zero-Scroll در مرورگر محلی (`localhost:4300`)
سنجه ساختاریافته `zero_scroll_probe.js` با مرورگر Headless بر روی آدرس‌های عمومی در ۶ عرض هدف اجرا شد:
* **صفحه ورود (`/login`):**
  - ۳۶۰px: `innerWidth=360`، `pageScrollWidth=360`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
  - ۳۹۰px: `innerWidth=390`، `pageScrollWidth=390`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
  - ۶۳۹px: `innerWidth=639`، `pageScrollWidth=639`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
  - ۶۴۰px: `innerWidth=640`، `pageScrollWidth=640`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
  - ۷۶۸px: `innerWidth=768`، `pageScrollWidth=768`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
  - ۱۰۲۴px: `innerWidth=1024`، `pageScrollWidth=1024`، `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`
* **صفحه استعلام کارت شناسایی (`/verify-card`):**
  - در تمام ۶ عرض (۳۶۰، ۳۹۰، ۶۳۹، ۶۴۰، ۷۶۸ و ۱۰۲۴px): `hasPageHorizontalScroll=false`، `zeroScrollPassed=true`.
* **وضعیت احراز هویت مرورگر:** سنجش مقادیر `localStorage` نشان داد `isLoggedIn = false` است. طبق قواعد سخت و عدم دسترسی به نشست کاربری بدون ورود دستی رمز عبور، صفحات پوسته و منوها در سنجه ثبت عددی نشدند و صریحاً «تاییدنشده» اعلام می‌شوند.

#### ۸. آنچه دیده شد و آنچه تاییدنشده ماند
* **مشاهده‌شده:** عدم سرریز افقی در صفحات عمومی، کامپایل بی‌نقص ساختار DOM پوسته و کامپوننت‌ها، رعایت اندازه اهداف لمسی در کلاس‌های CSS، پاس شدن کامل آزمون‌های DOM Vitest.
* **تاییدنشده (پشت ورود):** صفحات دارای پوسته اصلی و مرکز عملیات (`/app/...`) به دلیل نیاز به ورود کاربر در مرورگر محلی «تاییدنشده» باقی ماندند.
* **چک‌لیست بررسی چشمی برای کاربر:**
  1. `layout` (پوسته اصلی): ورود کاربر با حساب انبارداری یا مالی ← بررسی عرض‌های ۳۶۰px، ۷۶۸px و ۱۰۲۴px ← لمس منوی همبرگر در موبایل و اطمینان از باز شدن روان دراور، عدم وجود ایموجی در آیتم‌های ۳۳‌گانه منو، کارکرد دکمه‌های تاریخچه (قبلی/بعدی)، و بسته شدن روان با دکمه ضربدر.
  2. `operations-layout` (مرکز عملیات): ورود با دسترسی عملیات ← بررسی آیکون ساختمان (`building`) در سایدبار و دراور موبایل، اسکرول عمودی منوی موبایل بدون سرریز افقی.
  3. `user-menu`: کلیک روی نام کاربر در گوشه بالا ← بررسی ارتفاع ۴۰px گزینه‌ها، عدم تداخل با لایه‌های زیرین، و نمایش دکمه قرمز استاندارد «خروج از حساب».
  4. `app-role-switcher`: باز کردن سوئیچر در موبایل (۳۶۰px) و دسکتاپ ← اطمینان از قرارگیری صحیح پاپ‌اوور در صفحه.
  5. `company-switcher`: کلیک روی نشان شرکت کاری ← اطمینان از آیکون `building` و حداقل ارتفاع ۴۴px گزینه‌ها در مودال انتخاب شرکت.

#### ۹. یافته‌های بازبین `ui-reviewer`
* **دامنه بررسی:** بازبینی کامل diff گام ۳ بر روی ۱۷ فایل تغییریافته در `frontend`.
* **یافته‌ها و ارزیابی:**
  - **دسترس‌پذیری (WCAG 2.2 AA):** اهداف لمسی در تمام دکمه‌های جدید به حداقل ۴۰×۴۰px (`min-w-[40px] min-h-[40px] tap-target`) در موبایل ارتقا یافتند و در کارت‌های مودال شرکت‌ها به ۴۴px رسیدند. دکمه‌های فقط‌آیکون همگی دارای `title` و `aria-label` فارسی مطابق با متن دیده‌شده هستند.
  - **آیکون‌ها:** تمامی ایموجی‌های کلیک‌پذیر حذف و به آیکون‌های رسمی رجیستری و دیکشنری‌های معنایی (`semantic-icons.ts` و `entity-icons.ts`) هدایت شدند.
  - **پوسته و Zero-Scroll:** دراور موبایل مرکز عملیات به `overflow-y-auto` مجهز شد تا در نمایشگرهای کوچک گوشی محتوا بیرون نزند.
  - **عدم مداخله در منطق حساس:** منوی کاربری (`user-menu`) صرفاً از لحاظ استایل و قالب دکمه خروج به‌روزرسانی شد و هیچ کدی در منطق بررسی نسخه PWA، صف‌های آفلاین یا همگام‌سازی دست‌کاری نشد؛ لذا نیازی به مداخله `data-loss-reviewer` نبود.

---

### گزارش گام ۶: انبارگردانی الف (ردیف‌های ۲.۱ تا ۲.۹) و باقیمانده‌های بازبینی ناظر گام ۵

#### ۱. سیاهه عناصر کلیک‌پذیر و مقایسه پیش و پس از تغییر
* **باقیمانده‌های ناظر گام ۵ (تمامی ۹ بند):**
  - **`operations-sync-monitor.ts`:** دکمه «پاکسازی خطاها» با `ConfirmDialogService` ایمن شد تا از پاک‌سازی تصادفی بدون هشدار تداخل‌های ۴۰۹ جلوگیری شود (تایید مهارت `data-loss-reviewer`).
  - **۳۰ نام خام اکشن در کامپوننت‌های مشترک (`data-table`، `item-photo-gallery`، `excel-import-modal`، `toast`، `offline-pending-badge`، `avatar-cropper`، `cartable-card-base`):** تبدیل نام‌های مستقیم به `action-*` و `status-*` و حذف گونه کنارگذاشته `undo-2`.
  - **`offline-pending-badge`:** انتقال `cloud-off` و `wifi` به `STATUS_ICONS` در `semantic-icons.ts`، تصحیح نام دسترس‌پذیر قرص در موبایل.
  - **`barcode-scanner`:** ارتقای دکمه‌های کنترل زوم 1X/2X، سوئیچ کیفیت، بازنشانی و کپی به حداقل ۴۰×۴۰px.
  - **`users.html`:** هدر به `button[appAction]`، زیرتب‌ها به `app-tab-bar`، دکمه‌های ویرایش سریع به حداقل ۴۰px، چیپ‌های پیش‌تنظیم به آیکون‌های استاندارد و هماهنگی تست `users.spec.ts`.
  - **`operations-cockpit.html` & `operations-layout.html`:** تبدیل کارت‌های ناوبری به پیوندهای استاندارد و حذف کاراکترهای ایموجی.
  - **`company-gdrive-tab.html`:** دکمه‌های هدر به `button[appAction]` با عنوان «اتصال»، دکمه‌های تلاش مجدد و پیوند به ۴۰px، حذف ۶ خصیصه نامعتبر `[class.]=`.
  - **`companies.ts`:** تطابق آیکون تب‌ها با فرهنگ معنایی و کش/مموایز کردن آرایه `modalTabs`.
  - **اصلاح آیکون‌های معنایی:** تصحیح آیکون دکمه‌های همگام‌سازی عمیق (`sync`)، تاریخچه کارت کارتابل (`action-history`) و تغییر رمز (`chevron-left` در RTL).

* **ردیف‌های ۲.۱ تا ۲.۹ ماژول انبارگردانی:**
  - **۲.۱ `dashboard`:** دکمه هدر به `<button appAction="refresh">`، دکمه‌های تلاش مجدد خطا به ۴۰px با `tone="rose"`، آیکون‌های استاندارد KPI.
  - **۲.۲ `projects`:** دکمه‌های هدر به `appAction`، دکمه ورود به انبار به ۴۰px، دکمه‌های عملیات سطر به ۴۰px بدون ایموجی.
  - **۲.۳ `dispatch`:** دکمه‌های هدر به `appAction="export-excel"` و `appAction="refresh"`، دکمه‌های تگ‌گذاری و چاپ ۴۰px، نماهای آماده ۴ گانه و تب‌های دسته‌بندی ستون‌ها به آیکون‌های استاندارد رجیستری.
  - **۲.۴ `docs`:** دکمه‌های هدر به `appAction`، دانلود الگو به `download`، دکمه‌های حذف انبار و حذف اکسل به `action-delete` و ۴۰px، دکمه‌های تاریخچه به `clock` و `rotate-ccw`.
  - **۲.۵ `feeding`:** پیوندهای بازگشت و مشاهده به ۴۰px با آیکون `chevron-left`.
  - **۲.۶ `counter-dashboard`:** هدر اسکن ۴۴px، اکسل/رفرش ۴۰px، اکشن‌های سریع ۳۶px، دکمه‌های ثبت شمارش با `min-h-[48px]` و اندازه `lg` بدون دستکاری صف آفلاین.
  - **۲.۷ `supervisor-dashboard`:** هدر اسکن ۴۴px، تب‌ها ۴۰px، عملیات گروهی و کارت‌ها به `rotate-ccw` (ارجاع)، `check-circle` (تایید سرپرست) و `x-circle` (رد اسناد).
  - **۲.۸ `manager-review`:** هدر اسکن ۴۴px، تب‌ها ۴۰px، عملیات گروهی و کارت‌های کالا و اسناد به `rotate-ccw`، `check-circle`، `x-circle` و بستن نهایی حساس و عنوان‌دار.
  - **۲.۹ `count-tracking`:** ۵ چیپ مینی‌داشبورد فیلتر مغایرت به `.tap-target` و ۴۰px، هدر اسکن ۴۴px و اکسل ۴۰px، تایید گروهی تسک‌های سبز به `check-circle`، تب‌های مودال عملکرد به ۴۰px.

#### ۲. گونه‌های آیکونی که جایگزین شدند
* حذف آیکون‌های کنارگذاشته: `trash-lucide`، `trash-2-soft`، `trash-2-lucide`، `hero-save`، `hero-clock`، `loader-arc`، `x-path`، `spinner-arc` و تبدیل کامل آن‌ها به آیکون‌های رسمی رجیستری.
* حذف کاراکترهای ایموجی از کارت‌های ناوبری، چیپ‌های پیش‌تنظیم نقش‌ها و دکمه‌های عملیات سطرها.
* استانداردسازی آیکون‌های معنایی: هدایت تمام نام‌های مستقیم به پیشوندهای `action-*` و `status-*` در دیکشنری `semantic-icons.ts`.

#### ۳. نتایج هر ۳ بیلد پروژه
هر سه پروفایل بیلد Angular 22 با کد خروجی ۰ کامل شدند:
* **بیلد استاندارد (`npm run build`):** Exit Code 0 (اندازه باندل اولیه ۳.۵۸MB، مدت بیلد ۱۲۳ ثانیه).
* **بیلد تک‌ماژولی حسابداری (`npm run build:accounting`):** Exit Code 0 (ماژول انبارگردانی استاب ۱۰۴ بایتی، مدت بیلد ۸۲ ثانیه).
* **بیلد تک‌ماژولی انبار (`npm run build:warehouse`):** Exit Code 0 (ماژول حسابداری استاب ۱۰۵ بایتی، مدت بیلد ۸۹ ثانیه).

#### ۴. نگهبان‌ها و خط مبنای نگهبان ۵۵
* **نگهبان ۵۲ (`guardian_52_icon_registry.py`):** ✅ پاس کامل (۱۴۸۱ استفاده معتبر، ۰ استفاده درون‌خطی غیرمجاز).
* **نگهبان ۵۵ (`guardian_55_clickable_ergonomics.py`):**
  - **پیش از گام ۶:**
    - `rule_1_unlabeled_icon_buttons`: ۱۶۶
    - `rule_2_tab_min_widths`: ۰
    - `rule_3_non_standard_actions`: ۲۵۱
    - `rule_4_retired_icons`: ۱۱۱
    - `rule_5_neutralized_tap_targets`: ۰
  - **پس از گام ۶ و اجرای `--update-baseline`:**
    - `rule_1_unlabeled_icon_buttons`: **۱۶۰** (کاهش ۶ واحد با استانداردسازی دکمه‌ها و افزودن برچسب‌های دسترس‌پذیر)
    - `rule_2_tab_min_widths`: **۰** (همچنان صفر بدون هرگونه عرض ثابت در تب‌ها)
    - `rule_3_non_standard_actions`: **۲۴۰** (کاهش ۱۱ واحد با اتصال دکمه‌های اکشن به `appAction`)
    - `rule_4_retired_icons`: **۹۵** (کاهش ۱۶ واحد با پاک‌سازی آیکون‌های بازنشسته)
    - `rule_5_neutralized_tap_targets`: **۰** (همچنان صفر بدون خنثی‌سازی اهداف لمسی)

#### ۵. آزمون‌های واحد Vitest
* **تست‌های جعبه‌ابزار و آیکون‌ها:** ۷ فایل تست، **۴۹ تست سبز** (۱۰۰٪ پاس، ۰ شکست) در ۲.۲۵ ثانیه.
* **تست‌های دامنه ماژول‌ها:** فایل `users.spec.ts` شامل **۵۱ تست سبز** (۱۰۰٪ پاس)؛ سازگاری کامل آزمون‌ها با سیستم ارگونومی جدید و عدم ایجاد رگرسیون.

#### ۶. خروجی واقعی سنجه Zero-Scroll در مرورگر محلی (`localhost:4300`)
اجرای سنجه ساختاریافته `zero_scroll_probe.js` با موتور Headless در ۶ عرض هدف:
* **صفحه ورود (`/login`):**
  - در هر ۶ عرض (۳۶۰، ۳۹۰، ۶۳۹، ۶۴۰، ۷۶۸ و ۱۰۲۴px): `hasPageHorizontalScroll=false` و `zeroScrollPassed=true`.
* **صفحه استعلام کارت شناسایی (`/verify-card`):**
  - در تمام ۶ عرض: `hasPageHorizontalScroll=false` و `zeroScrollPassed=true`.

#### ۷. آنچه دیده شد و آنچه تاییدنشده ماند
* **مشاهده‌شده:** عدم سرریز افقی در نمایشگرهای موبایل، اعمال سطوح لمسی دست‌کم ۴۰px و ۴۴px، سازگاری کامپایلر AOT و JIT، پاک‌سازی کامل ایموجی‌ها و آیکون‌های بازنشسته.
* **تاییدنشده (پشت ورود):** صفحات انبارگردانی (`/dashboard`، `/projects`، `/dispatch`، `/docs`، `/feeding`، `/counter-dashboard`، `/supervisor-dashboard`، `/manager-review`، `/count-tracking`) به دلیل نیاز به سشن معتبر ورود در مرورگر محلی «تاییدنشده» با چک‌لیست چشمی ثبت گردیدند.
* **چک‌لیست بررسی چشمی برای کاربر:**
  1. `dashboard`: بررسی دکمه refresh سربرگ و کارت‌های KPI در عرض ۳۶۰px.
  2. `projects`: لمس دکمه‌های ورود به انبار و دکمه‌های سربرگ در موبایل.
  3. `dispatch`: لمس دکمه‌های اکسل/رفرش سربرگ، کلیدهای تگ‌گذاری و بررسی جا شدن سطر اکشن‌ها در ۳۶۰px.
  4. `docs`: دانلود الگو، تست دکمه‌های قرمز حذف اکسل/انبار (باز شدن مودال تایید)، تاریخچه عملیات.
  5. `counter-dashboard`: ورود به کارتابل انبارگردان ← بررسی اندازه ۴۸px دکمه‌های ثبت شمارش برای کاربری آسان با انگشت در تبلت و موبایل.
  6. `supervisor-dashboard`: بررسی عملکرد نوار تب، دکمه‌های تایید گروهی و ارجاع در کارت‌های کالا.
  7. `manager-review`: بررسی دکمه‌های حساس بستن نهایی، تایید سرپرست و رد اسناد.
  8. `count-tracking`: لمس ۵ چیپ فیلتر مغایرت در مینی‌داشبورد و بررسی عدم سرریز افقی.

#### ۸. یافته‌های بازبین `ui-reviewer` و `data-loss-reviewer`
* **ارزیابی `ui-reviewer`:** رعایت کامل ابعاد لمسی ۴۰px/۴۴px طبق WCAG 2.2 AA، کنتراست مناسب متن دکمه‌های رنگی، حفظ چیدمان راست‌به‌چپ (RTL)، جایگزینی اصولی آیکون‌های جهت‌دار، و تضمین Zero-Scroll در صفحات.
* **ارزیابی `data-loss-reviewer`:** تایید ایمن‌سازی متد `clearAllResolvedErrors` در مانیتور همگام‌سازی با دیالوگ تایید پیش از پاک‌سازی؛ عدم دستکاری در ساختار دیتابیس Dexie و عدم تغییر در صفوف بارگذاری آفلاین تصاویر یا اسناد.

</div>



