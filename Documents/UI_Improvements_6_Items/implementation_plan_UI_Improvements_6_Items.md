<div dir="rtl" align="right">

# بهبودهای ظاهری سیستم انبار

پیاده‌سازی ۶ تغییر ظاهری و عملکردی در فرانت‌اند سیستم اتوماسیون انبار.

---

## خلاصه تغییرات پیشنهادی

| # | عنوان | فایل(های) هدف | پیچیدگی |
|---|-------|-------------|---------|
| 1 | باز/بسته شدن (Toggle) منوی سمت راست در دسکتاپ | `layout.html`, `layout.ts`, `layout.css` | متوسط |
| 2 | نمایش داده واقعی شمارش کور (Blind Count) در تخصیص کالا | `dispatch.html`, `dispatch.ts` | ساده |
| 3 | اعتبارسنجی نام سیستمی فیلد داینامیک (فقط انگلیسی) | `dynamic-fields.html`, `dynamic-fields.ts` | ساده |
| 4 | جایگزینی `confirm()` مرورگر با دیالوگ سفارشی در حذف فیلد داینامیک | `dynamic-fields.ts` | ساده |
| 5 | اصلاح عنوان صفحه تنظیمات انبار (به جای wh-settings) | `layout.ts` | خیلی ساده |
| 6 | پیشنهادات ظاهری اضافی | چند فایل | متوسط |

---

## ۱. منوی Sidebar قابل باز/بسته شدن در دسکتاپ (Collapsible Sidebar)

> [!NOTE]
> در حال حاضر sidebar فقط روی موبایل با دکمه‌ی hamburger باز و بسته می‌شود. در دسکتاپ همیشه ثابت و باز است. این تغییر یک دکمه Toggle به هدر اضافه می‌کند که sidebar را در دسکتاپ هم مخفی/آشکار کند.

### تغییرات

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- اضافه کردن پراپرتی `isSidebarCollapsed` به `AuthStore` یا به‌صورت لوکال
- متد `toggleSidebar()` برای تغییر وضعیت
- ذخیره وضعیت در `localStorage` تا بعد از رفرش حفظ شود

#### [MODIFY] [layout.html](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html)
- اضافه کردن دکمه Toggle به `header` (کنار آیکون اعلانات) که روی دسکتاپ نمایش داده شود
- اعمال کلاس‌های شرطی روی `<aside>` برای جمع شدن/باز شدن با انیمیشن
- وقتی sidebar جمع شود: `width: 0` و `overflow: hidden` با `transition`

#### [MODIFY] [layout.css](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.css)
- انیمیشن `transition` برای باز/بسته شدن نرم sidebar
- کلاس‌های `sidebar-collapsed` و `sidebar-expanded`

---

## ۲. نمایش داده واقعی شمارش کور (Blind Count) در منوی تخصیص کالا

> [!IMPORTANT]
> در حال حاضر در [dispatch.html](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html) خط ۱۴، متن "شمارش کور فعال است" به‌صورت هاردکد نمایش داده می‌شود. باید از تنظیمات واقعی انبار (`blind_counting`) خوانده شود.

### تغییرات

#### [MODIFY] [dispatch.ts](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts)
- در بخش `ngOnInit()` خط ۱۲۸-۱۴۶ جایی که `settingsService.getWarehouseSettings` صدا زده می‌شود، مقدار `blind_counting` را نیز بخوانیم و در یک متغیر جدید `isBlindCounting: boolean` ذخیره کنیم

#### [MODIFY] [dispatch.html](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html)
- خطوط ۱۱-۱۶: نمایش شرطی badge بر اساس مقدار `isBlindCounting`
- اگر `isBlindCounting === true` → badge بنفش "شمارش کور (Blind Count) فعال است"
- اگر `false` → badge سبز "موجودی سیستمی قابل مشاهده است"

---

## ۳. اعتبارسنجی نام سیستمی فیلد داینامیک (فقط انگلیسی بدون فاصله)

> [!NOTE]
> در حال حاضر هیچ اعتبارسنجی روی فیلد "نام سیستمی (انگلیسی بدون فاصله)" وجود ندارد و کاربر می‌تواند متن فارسی وارد کند.

### تغییرات

#### [MODIFY] [dynamic-fields.ts](file:///e:/warehouse%20project/frontend/src/app/components/dynamic-fields/dynamic-fields.ts)
- اضافه کردن Regex اعتبارسنجی: `/^[a-zA-Z][a-zA-Z0-9_]*$/`
- اعتبارسنجی در متد `addField()` و `saveEdit()` قبل از ارسال به سرور
- نمایش پیام خطای فارسی مناسب از طریق `toast.show('error', ...)`

#### [MODIFY] [dynamic-fields.html](file:///e:/warehouse%20project/frontend/src/app/components/dynamic-fields/dynamic-fields.html)
- اضافه کردن `pattern` و `dir="ltr"` به input نام سیستمی (خط ۱۵ و ۹۴)
- نمایش پیام اخطار زیر فیلد وقتی کاربر حروف غیر‌انگلیسی تایپ کند (Realtime validation)

---

## ۴. جایگزینی `confirm()` مرورگر با دیالوگ سفارشی برای حذف فیلد داینامیک

> [!IMPORTANT]
> در حال حاضر [dynamic-fields.ts](file:///e:/warehouse%20project/frontend/src/app/components/dynamic-fields/dynamic-fields.ts) خط ۱۳۹ از `confirm()` بومی مرورگر استفاده می‌کند. باید از `ConfirmDialogService` موجود در سیستم استفاده شود.

### تغییرات

#### [MODIFY] [dynamic-fields.ts](file:///e:/warehouse%20project/frontend/src/app/components/dynamic-fields/dynamic-fields.ts)
- تزریق `ConfirmDialogService` در constructor
- تبدیل متد `deleteField()` به `async` و استفاده از `this.confirmDialog.open({...})`
- استفاده از type `danger` برای نمایش آیکون قرمز حذف

---

## ۵. اصلاح عنوان صفحه تنظیمات انبار

> [!NOTE]
> در حال حاضر وقتی کاربر به صفحه `wh-settings` می‌رود، عنوان در هدر "wh-settings" نمایش داده می‌شود. باید "تنظیمات انبار" نمایش داده شود.

### تغییرات

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- اضافه کردن مدخل `'wh-settings': 'تنظیمات انبار'` به آرایه `titles` در متد `updateTitle()` (خط ۲۵۵)

---

## ۶. پیشنهادات ظاهری اضافی

> [!TIP]
> موارد زیر مشکلاتی هستند که در بررسی کد مشاهده شدند و بهتر است اصلاح شوند.

### ۶.الف — آیکون‌های ناشناس در sidebar
آیکون `activity` (برای "پیگیری وضعیت شمارش") در لیست `rawIcons` تعریف نشده‌ است. فقط حروف icon خالی در sidebar نمایش داده می‌شود.

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- اضافه کردن آیکون `activity` به لیست `rawIcons`

### ۶.ب — عنوان صفحات دیگر در `updateTitle()` ناقص است
صفحات `export` و `wh-settings` و `count-tracking` در آبجکت `titles` وجود ندارند و نام route نمایش داده می‌شود.

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- اضافه کردن عناوین: `'export': 'صدور فایل برای تغذیه'` و `'count-tracking': 'پیگیری وضعیت شمارش'`

### ۶.ج — فیلد Blind Count در کارتابل انبارگردان (Field) هم هاردکد است
در [field.html](file:///e:/warehouse%20project/frontend/src/app/components/field/field.html) خط ۶۴-۶۷ هم وضعیت Blind Count هاردکد نمایش داده می‌شود و باید داده واقعی نشان دهد (مشابه مورد ۲).

---

## طرح تأیید (Verification Plan)

### تأیید دستی
| # | بررسی | روش |
|---|-------|-----|
| 1 | Sidebar در دسکتاپ باز/بسته شود | کلیک روی دکمه Toggle و مشاهده انیمیشن |
| 2 | وضعیت sidebar بعد از رفرش حفظ شود | رفرش صفحه و بررسی localStorage |
| 3 | Badge شمارش کور تغییر کند بر اساس تنظیمات | تغییر تنظیم در wh-settings و بررسی dispatch |
| 4 | ورودی نام سیستمی حروف فارسی قبول نکند | تایپ فارسی و مشاهده خطا |
| 5 | دیالوگ حذف فیلد سفارشی نمایش داده شود | کلیک روی حذف فیلد داینامیک |
| 6 | عنوان صفحه "تنظیمات انبار" نمایش داده شود | رفتن به صفحه wh-settings |
| 7 | آیکون activity در sidebar نمایش داده شود | مشاهده منوی "پیگیری وضعیت شمارش" |

</div>
