# گزارش گام‌به‌گام نتایج سازگاری عناصر کلیک‌پذیر با ارگونومی واکنش‌گرا
## (Walkthrough: Responsive Clickable Ergonomics)

<div dir="rtl" align="right">

> [!NOTE]
> این سند پس از تایید صریح کاربر و اجرای هر گام به‌روز می‌شود و نتیجه تغییرات، اسکرین‌شات‌ها و اعتبارسنجی‌ها را نگه می‌دارد. نام و ترتیب گام‌ها عیناً همان بند ۵ طرح است.

### ۱. وضعیت اجرای گام‌ها
* **گام ۰ (فرهنگ آیکون و پایه):** ✅ انجام شد؛ بازبینی ناظر: پذیرفته با اصلاح
* **گام ۱ (جعبه‌ابزار مشترک):** ✅ انجام شد؛ بازبینی ناظر: پذیرفته با اصلاح، با ۵ اصلاح الزامی و یک تصمیم پیش از کوچ صفحه‌های پایلوت (بخش ۵ گزارش گام ۱)
* **گام ۲ (پایلوت: `settings` و `supervisor-invoices`):** در نوبت اجرا
* **گام ۳ (پوسته و ناوبری):** در نوبت اجرا
* **گام ۴ (کامپوننت‌های مشترک):** در نوبت اجرا
* **گام ۵ (مرکز عملیات و صفحات عمومی):** در نوبت اجرا
* **گام ۶ (انبارگردانی الف):** در نوبت اجرا
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

</div>

