# چک‌لیست وظایف تفصیلی: طرح فراگیر سازگاری تمامی صفحات و زیرصفحات
## (All-Pages & Subpages Responsive Clickable Ergonomics Checklist)

<div dir="rtl" align="right">

> [!NOTE]
> شماره ردیف‌ها همان شماره جدول‌های بخش ۴ طرح است. «کوچ» یعنی جایگزینی نشانه‌گذاری دستی با جعبه‌ابزار بخش ۲ و آیکون‌های فرهنگ بخش ۳. هر گام در یک نشست انجام می‌شود و پیش از تیک خوردن باید «معیار پایان هر گام» (بند ۵ طرح) را کامل بگذراند: سیاهه، بیلد، نگهبان‌های ۵۲ و ۵۵ (با ثبت عدد تازه خط مبنا)، تست‌ها، `zero_scroll_probe.js`، `ui-reviewer`، commit و یادداشت تحویل.
>
> **بیلد بررسی** (از پوشه `warehouse-front`): `npx ng build --output-path ../scratch/ng-build-check > ../scratch/logs/ergonomics-build.log 2>&1`؛ در گام‌های ۰، ۱ و ۱۳ همچنین با `--configuration accounting-only` و `--configuration warehouse-only`.

- [x] **گام ۰: فرهنگ آیکون و پایه**
  - [x] `shared/icons/semantic-icons.ts`: `ACTION_ICONS`، `STATUS_ICONS`، `PLATFORM_ENTITY_ICONS` با `satisfies Record<string, IconName>`
  - [x] `modules/warehouse/entity-icons.ts` و `modules/accounting/entity-icons.ts` (نهایی کردن جدول بند ۳-۳)
  - [x] `SvgIconDirective`: شناختن نام‌های `action-*` و `status-*`؛ نگهبان ۵۲: پذیرفتن همین نام‌ها
  - [x] **۵.۱۳ استایل‌های سراسری (`src/styles.css`):** `.tap-target`، حداقل `2.5rem` برای `.btn-icon-square` و `.btn-icon-sm` زیر ۶۴۰px، `.btn-icon-primary`
  - [x] بررسی اثر روی ارتفاع سطرهای جدول‌های فشرده (`audit`، `users`، `reports`)
  - [x] `scripts/e2e/guardian_55_clickable_ergonomics.py` و `clickable_ergonomics_baseline.json` (۴ قاعده بخش ۲)
  - [x] spec فرهنگ آیکون: نام‌ها در رجیستری، نبود اشتراک خارج از فهرست سفید بند ۳-۴
  - [x] معیار پایان گام

- [x] **گام ۱: جعبه‌ابزار مشترک**
  - [x] `shared/components/action-button/` (`button[appAction]`) با کاتالوگ کارها (آیکون، عنوان، رنگ، `sensitive`)
  - [x] `shared/components/tab-bar/` (`app-tab-bar`) و نوع `TabDef`
  - [x] `shared/components/overflow-menu/` (`app-overflow-menu`)
  - [x] `shared/components/command-center/` (`app-command-center`)
  - [x] `scripts/e2e/zero_scroll_probe.js`
  - [x] specهای Vitest هر جزء (برچسب دسترس‌پذیری، کار حساس، نقش‌های تب، `type="submit"`، Escape منو)
  - [x] معیار پایان گام (هنوز هیچ صفحه‌ای کوچ نکرده)

- [x] **گام ۲: پایلوت**
  - [x] **۲.۱۲ تنظیمات سراسری (`settings.html`):** `app-tab-bar` با ۵ تب و `mobile="icon"`، حذف `min-w-[150px]`، عنوان‌های کوتاه
  - [x] **۳.۹ تایید فاکتورهای سرپرست (`supervisor-invoices.html`):** همه اجزای جعبه‌ابزار در یک صفحه
  - [x] اصلاح API جعبه‌ابزار بر پایه نتیجه و ثبت تصمیم‌ها در «گزارش پیشرفت» طرح
  - [x] معیار پایان گام

- [x] **گام ۳: پوسته و ناوبری**
  - [x] **۵.۱۴ پوسته اصلی و منوی کناری (`layout.html`، `modules/*/nav-items.ts`):** حذف ایموجی از ۳۳ برچسب، فیلد `icon` از `entity-icons.ts`، کوتاه کردن برچسب‌ها؛ به‌روزرسانی `accountant-new-profiles.dom.spec.ts` خط ۲۵۱
  - [x] **۵.۱۵ پوسته مرکز عملیات (`operations-layout`)**
  - [x] **۵.۳ منوی کاربری (`user-menu.component.html`)**
  - [x] **۵.۹ سوئیچر نقش (`app-role-switcher.component.html`)**
  - [x] **۵.۱۰ انتخابگر انبار (`warehouse-selector.component.ts`)**
  - [x] **۵.۱۱ لانچر برنامه‌ها (`app-launcher.html`)**
  - [x] **۵.۱۶ تعویض و انتخاب شرکت (`company-switcher`، `company-selection-modal`)**
  - [x] **۵.۱۷ مرکز اعلان‌ها (`notification-center.component.ts`)**
  - [x] معیار پایان گام

- [ ] **گام ۴: کامپوننت‌های مشترک** (ظاهر انجام شد؛ کوچ به `appAction` و بندهای باز به گام ۵ رفت)
  - [x] **۵.۱ هدر کارتابل (`cartable-header.component.ts`):** سوئیچر دامنه با `app-tab-bar`
  - [ ] **۵.۲ جدول داده (`data-table.component.ts`):** نوار ابزار و صفحه‌بندی با `appAction` (نوار ابزار دست نخورده است)
  - [x] **۵.۴ دراور چت (`chat-drawer.component.html`)**
  - [x] **۵.۵ گالری عکس (`item-photo-gallery.component.html`)**
  - [x] **۵.۶ مودال اکسل (`excel-import-modal.html`)**
  - [x] **۵.۷ مودال حذف هوشمند (`smart-delete-modal.html`):** `delete` حساس با `size="lg"`
  - [x] **۵.۸ مودال آواتار (`avatar-cropper-modal.html`)**
  - [x] **۵.۱۸ مودال‌ها و دیالوگ‌ها (`modal`، `confirm-dialog`، `conflict-resolution-modal`، `deep-sync-modal`):** فقط ظاهر
  - [ ] **۵.۱۹ اجزای کوچک مشترک و آیکون `status-badge` / `offline-pending-badge` از `STATUS_ICONS`** (پاپ‌اوور `offline-pending-badge` باز است)
  - [x] **۵.۲۱ نظرات زمینه‌ای (`contextual-comments.component.html`)**
  - [x] معیار پایان گام

- [x] **گام ۵: مرکز عملیات و صفحات عمومی**
  - [x] **باقی‌مانده‌های گام ۴:** کوچ اجزای گام ۴ به `button[appAction]` و نام‌های `action-*`، نوار ابزار `data-table`، پاپ‌اوور `offline-pending-badge`، `tap-target` خنثی‌شده، آیکون نقش‌ها (فهرست در «بازبینی ناظر — گام ۴»)
  - [x] **۱.۱ شرکت‌ها (`companies.html`)**
  - [x] **۱.۲ تب گوگل‌درایو (`company-gdrive-tab.html`)**
  - [x] **۱.۳ کاربران و نقش‌ها (`users.html`)**
  - [x] **۱.۴ کوکپیت عملیات (`operations-cockpit.html`)**
  - [x] **۱.۵ حاکمیت نقش‌ها (`operations-rbac-governance.html`)**
  - [x] **۱.۶ مانیتور همگام‌سازی (`operations-sync-monitor.html`):** پاک‌سازی خطاها و لغو نشست حساس
  - [x] **۱.۷ پشتیبان‌گیری (`settings-backup-tab.html`):** بازیابی و بازگشت `restore` حساس
  - [x] **۱.۸ سلامت سیستم (`health-dashboard.ts`)**
  - [x] **۱.۹ ممیزی و لاگ‌ها (`audit.html`)**
  - [x] **۱.۱۰ راه‌انداز نخستین (`first-boot-wizard.html`)**
  - [x] **۵.۱۲ ورود و تغییر رمز (`login.html`، `change-password.html`)**
  - [x] **۵.۲۲ استعلام کارت (`verify-card.html`)**
  - [x] معیار پایان گام

- [x] **گام ۶: انبارگردانی (الف)** (تکمیل کوچ ۲.۶ تا ۲.۹؛ بازبینی ناظر: پذیرفته با اصلاح، جدول و مودال خروجی حذف‌شده `count-tracking` بازگشت؛ باقی‌مانده‌ها در «بازبینی ناظر — تکمیل گام ۶»)
  - [x] **باقی‌مانده‌های بازبینی ناظر گام ۵:** ۹ بند (ایمن‌سازی پاک‌سازی خطاها با ConfirmDialogService و data-loss-reviewer، ۳۰ نام خام، وضعیت‌های offline-badge، کنترل‌های بارکدخوان، هدر و تب‌های users، لینک‌های operations-cockpit، تب گوگل‌درایو و حذف [class.]=، ۴ آیکون معنایی، کش modalTabs)
  - [x] **۲.۱ داشبورد انبار (`dashboard.html`)**
  - [x] **۲.۲ مدیریت انبارها (`projects.html`)**
  - [x] **۲.۳ هدایت و تخصیص کالا (`dispatch.html`)**
  - [x] **۲.۴ مدارک و پرونده‌ها (`docs.html`)**
  - [x] **۲.۵ تغذیه داده اقلام (`feeding.html`)**
  - [x] **۲.۶ کارتابل انبارگردان (`counter-dashboard.html`)** (ثبت شمارش `size="lg"`، هدر و مودال‌ها با `appAction`)
  - [x] **۲.۷ کارتابل سرپرست انبار (`supervisor-dashboard.html`)** (`app-tab-bar`، `approve`/`return` و ضدشکست فوتر در ۳۶۰px)
  - [x] **۲.۸ بازبینی مدیر انبار (`manager-review.html`)** (`app-tab-bar`، `approve`/`reject` و ضدشکست فوتر در ۳۶۰px)
  - [x] **۲.۹ رهگیری شمارش (`count-tracking.html`)** (تب‌های مودال با `app-tab-bar`، هدر دو سطری با `app-overflow-menu`، `export-excel` و `approve`)
  - [x] معیار پایان گام (هر ۳ بیلد با کد ۰، نگهبان ۵۲ و ۵۵ سبز، خط مبنا بهبودیافته، ۲۰۷ تست واحد سبز)

- [x] **گام ۷: انبارگردانی (ب)** (بازبینی ناظر: پذیرفته با اصلاح؛ ۳۳ دکمه مرده `(actionClick)` اصلاح شد؛ باقی‌مانده‌ها در «بازبینی ناظر — گام ۷»)
  - [x] **۲.۱۰ گزارش‌های انبار (`reports.html`)**
  - [x] **۲.۱۱ کارتابل مالی و گمرک (`customs.html`)**
  - [x] **۲.۱۳ تنظیمات اختصاصی انبار (`wh-settings.html`)**
  - [x] **۲.۱۴ زیرتب‌های تنظیمات (operations، counter-fields، doc-fields، label)**
  - [x] **۲.۱۵ طراح لیبل (`label-designer.html`)**
  - [x] **۲.۱۶ کارت‌های شناسایی (`id-cards.html`):** قالب چاپ دست نخورد
  - [x] **۲.۱۷ فیلدهای پویا و شمارش فیلد (`dynamic-fields.html`، `field.html`)**
  - [x] **۵.۲۰ اجزای گزارش‌ساز (`saved-reports`، `filter-group`، `filter-value`، `export-progress`، `report-chart`)**
  - [x] معیار پایان گام

- [x] **گام ۸: هاب کارمند** (بازبینی ناظر: پذیرفته با اصلاح؛ نشانگر وضعیت مراحل مودال‌ها و نقطه «ذخیره‌نشده» برگشت؛ باقی‌مانده‌ها در «بازبینی ناظر — گام ۸»)
  - [x] **۳.۱ حضور و غیاب کارمند (`employee-attendance.html`)**
  - [x] **۳.۲ تردد ناوگان کارمند (`employee-fleet.html`):** مودال شبا دست نخورد
  - [x] **۳.۳ فاکتورهای کارمند (`employee-invoices.html`)**
  - [x] **۳.۴ تنخواه‌گردان کارمند (`employee-petty-cash.html`)**
  - [x] **۳.۵ ثبت خودرو/راننده (`employee-new-vehicle.html`)**
  - [x] **۳.۶ ثبت پرسنل جدید (`employee-new-personnel.html`):** ساختار شبا دست نخورد
  - [x] معیار پایان گام

- [x] **گام ۹: هاب سرپرست** (بازبینی ناظر: پذیرفته با اصلاح؛ NG0100 سه getter تب، سرریز موبایل چهار نوار و دکمه قفل دوره، «عودت» روی `reject`، عنوان‌های گم‌شده در موبایل و دکمه‌های مرده مودال پرونده personnel اصلاح شد؛ سرریز تبلت و دسکتاپ با سایدبار باز در «بازبینی ناظر — گام ۹» باز ماند)
  - [x] **۳.۷ تایید کارکرد (`supervisor-attendance.html`)**
  - [x] **۳.۸ تایید ناوگان (`supervisor-fleet.html`)**
  - [x] **۳.۱۰ تایید تنخواه (`supervisor-petty-cash.html`)**
  - [x] **۳.۱۱ مدیریت پرسنل (`supervisor-personnel.html`)**
  - [x] **۳.۱۲ بستن دوره کارکرد (`supervisor-period-lock.html`):** `lock` حساس
  - [x] **۳.۱۳ پرسنل و خودروهای جدید (`supervisor-new-profiles.html`)**
  - [x] معیار پایان گام

- [x] **گام ۱۰: حسابداری**
  - [x] **۴.۱ حقوق و دستمزد (`accountant-payroll.html`)**
  - [x] **۴.۲ ناوگان حسابدار (`accountant-fleet.html`)**
  - [x] **۴.۳ پرسنل حسابدار (`accountant-personnel.html`)**
  - [x] **۴.۴ فاکتورهای حسابدار (`accountant-invoices.html`)**
  - [x] **۴.۵ رسیدگی تنخواه (`accountant-petty-cash.html`)**
  - [x] **۴.۶ دیسکت‌های بیمه و مالیات (`accountant-diskettes.html`)**
  - [x] **۴.۷ طرف‌های حساب (`counterparties.html`):** ساختار شبا دست نخورد
  - [x] **۴.۲۲ پرونده‌های جدید حسابدار (`accountant-new-profiles.html`)**
  - [x] معیار پایان گام

- [x] **گام ۱۱: خزانه و سازمان**
  - [x] **۴.۸ پرداخت حقوق و ناوگان (`treasurer-disbursements.html`)**
  - [x] **۴.۹ تسویه فاکتورها (`treasurer-invoices.html`)**
  - [x] **۴.۱۰ حساب‌های بانکی (`treasurer-bank-accounts.html`)**
  - [x] **۴.۱۱ مدیریت چک‌ها (`treasurer-cheques.html`)**
  - [x] **۴.۱۲ مغایرت‌گیری بانکی (`treasurer-reconciliation.html`)**
  - [x] **۴.۱۸ پروژه‌ها و بخش‌ها (`projects-and-sections.html`)**
  - [x] **۴.۱۹ بایگانی مدارک شرکت (`company-documents-archive.html`)**
  - [x] **۴.۲۰ شناسنامه پرسنل (`personnel-profiles.html`)**
  - [x] **۴.۲۱ تنظیمات پایه مالی (`base-settings.html`)**
  - [x] معیار پایان گام

- [ ] **گام ۱۲: مدیریت ارشد**
  - [x] **۴.۱۳ داشبورد هوش مالی (`manager-dashboard.html`)**
  - [x] **۴.۱۴ کنترل بودجه (`manager-budget.html`)**
  - [x] **۴.۱۵ قراردادها و احکام (`manager-contracts.html`)**
  - [x] **۴.۱۶ گزارش‌های مدیر (`manager-reports.html`)**
  - [ ] **۴.۱۷ کارتابل تاییدات (`manager-approvals.html`):** `unlock` و `send` دوره حساس
  - [ ] **۴.۲۳ ناوگان مدیر (`manager-fleet.html`):** حذف و پایان همکاری حساس
  - [ ] **۴.۲۴ پرسنل مدیر (`manager-personnel.html`):** حذف و پایان همکاری حساس
  - [ ] معیار پایان گام

- [ ] **گام ۱۳: پاک‌سازی، مستندات و اعتبارسنجی نهایی**
  - [ ] حذف گونه‌های بی‌استفاده از `icon-registry.ts` (بند ۳-۵)
  - [ ] به‌روزرسانی AGENTS §7 و §9 و مهارت `design-system` (جعبه‌ابزار و فرهنگ آیکون راه پیش‌فرض)
  - [ ] بیلد هر سه پروفایل (پیش‌فرض، `accounting-only`، `warehouse-only`)
  - [ ] نگهبان‌های ۵۲ و ۵۵ (خط مبنا به صفر یا کمترین مقدار رسیده باشد)
  - [ ] `ng test` کامل و مقایسه با HEAD پیش از گام ۰
  - [ ] بازبینی چشمی سراسری با `zero_scroll_probe.js` در ۳۶۰، ۳۹۰، ۶۳۹، ۶۴۰، ۷۶۸ و ۱۰۲۴px؛ صفحه‌های پشت ورود اگر مرورگر داخلی وارد نشده باشد، با فهرست بررسی به کاربر سپرده و «تاییدنشده» گزارش شوند

</div>
