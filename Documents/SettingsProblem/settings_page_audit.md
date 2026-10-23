کاوش کامل شد. تنظیمات صفحه را از سه لایه بررسی کردم: کامپوننت و قالب، سرویس و اینترسپتورها، و endpoint‌های بک‌اند به‌همراه **مصرف‌کننده‌های واقعی** هر کلیدی که این صفحه می‌نویسد. مهم‌ترین یافته این است که بخش بزرگی از این صفحه فقط ظاهر دارد — مقدار را ذخیره می‌کند ولی هیچ کدی آن را نمی‌خواند.

---

# ۱) امنیت و مجوزها

**۱-۱. صفحه با مجوز «مشاهده» باز می‌شود ولی ذخیره مجوز «تغییر» می‌خواهد — و نتیجه از دست رفتن کار کاربر است**
گارد مسیر فقط `view_sys_settings` می‌خواهد ([auth.guard.ts](frontend/src/app/core/auth/auth.guard.ts))، اما `POST /api/settings/global/` مستلزم `perm_sys_settings` است ([warehouses/views.py:182](backend/warehouses/views.py:182)). دکمه ذخیره در قالب هیچ گیتی ندارد. یعنی مدیری با دسترسی فقط‌خواندنی می‌تواند ده‌ها فیلد را تغییر دهد، ذخیره بزند، ۴۰۳ بگیرد و **همه تغییراتش را از دست بدهد**.

**۱-۲. پیام واقعی خطای سرور دور ریخته می‌شود**
هندلر خطا در [settings.ts:296](frontend/src/app/components/settings/settings.ts:296) پارامتر خطا را نمی‌گیرد و پیام دقیق سرور («تنها مدیر ارشد سیستم مجاز به تغییر تنظیمات سراسری است») را با یک «خطا در ذخیره تنظیمات سیستم» جایگزین می‌کند. کاربر نمی‌فهمد مشکل دسترسی است یا شبکه.

**۱-۳. خواندن تنظیمات سراسری برای هر کاربر لاگین‌شده آزاد است**
متد GET همان endpoint فقط `IsAuthenticated` است. یعنی یک انبارگردان می‌تواند کل تنظیمات سیستم را بخواند — از جمله `blind_counting` و هر دو نقشهٔ `field_permissions_*` که ساختار کنترل دسترسی فیلدها را لو می‌دهد.

**۱-۴. بک‌اند هر کلید/مقداری را بدون اعتبارسنجی می‌پذیرد**
هیچ whitelist یا بررسی نوع وجود ندارد؛ حلقه مستقیماً `update_or_create` می‌زند. یک `offline_cache_ttl_minutes: "abc"` یا کلید غلط املایی برای همیشه در دیتابیس می‌نشیند. این نقض «اعتبارسنجی ورودی در مرزهای سیستم» در CLAUDE.md است.

**۱-۵. تب «دسترسی فیلدهای انبارگردان» عملاً تشریفاتی است**
`field_permissions_counter` در **هیچ‌کجای بک‌اند** اجرا نمی‌شود؛ تنها مصرف بک‌اندی مربوط به `field_permissions_doc` است و آن هم فقط برای انتخاب ستون‌های قالب اکسل ([inventory/views.py:3707](backend/inventory/views.py:3707)). اعمال محدودیت کاملاً سمت کلاینت است ([counter-dashboard.ts:1109](frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts:1109)). یعنی انبارگردانی که با ابزار توسعه‌دهنده یا درخواست مستقیم کار کند، می‌تواند `price_amount`، `inventory` و `total_value` را PATCH کند حتی وقتی سوئیچ «قابل ویرایش» خاموش است.

**۱-۶. مسیر بازیابی دیتابیس در این صفحه تأیید متنی ندارد**
سیستم دو مسیر بکاپ موازی دارد. `DatabaseBackupViewSet` در [accounts/views.py:2101](backend/accounts/views.py:2101) الزام `confirm_text == 'RESTORE_DATABASE_CONFIRM'` دارد، اما صفحه تنظیمات به [config/views_backup.py](backend/config/views_backup.py) می‌زند که این الزام را **ندارد**. مخرب‌ترین عملیات سیستم با یک درخواست ساده انجام می‌شود.

**۱-۷. بکاپ و بازیابی هیچ لاگ حسابرسی ندارند**
`log_audit_event` در `views_backup.py` مطلقاً فراخوانی نمی‌شود — درحالی‌که ذخیرهٔ یک تنظیم عادی لاگ می‌گیرد. بعد از یک restore هیچ ردی از این‌که چه کسی، چه زمانی و با چه فایلی کل دیتابیس را جایگزین کرده باقی نمی‌ماند.

**۱-۸. رمز رمزنگاری بکاپ حداقل قدرت ندارد**
نه کلاینت و نه سرور طول/پیچیدگی را بررسی نمی‌کنند؛ سرور فقط رمز خالی را رد می‌کند. یک رمز تک‌کاراکتری روی فایل `.wbak` که حاوی کل دیتابیس است پذیرفته می‌شود.

**۱-۹. آپلود فایل بازیابی سقف حجم ندارد**
[views_backup.py:287](backend/config/views_backup.py:287) کل فایل را با `uploaded_file.read()` در حافظه می‌خواند. کلاینت هم فقط پسوند `.wbak` را چک می‌کند ([settings.ts:359](frontend/src/app/components/settings/settings.ts:359)) بدون بررسی حجم.

---

# ۲) از دست رفتن داده (بحرانی‌ترین دسته)

**۲-۱. یک خطای گذرا در بارگذاری فیلدهای داینامیک، تمام تنظیمات `dyn_*` را پاک می‌کند**
اگر `dynamicFieldApi.getFields()` شکست بخورد، کد `dynamicFieldsList = []` می‌گذارد و ادامه می‌دهد ([settings.ts:105](frontend/src/app/components/settings/settings.ts:105)). سپس `saveGlobalSettings` نقشه مجوزها را **از صفر** از روی لیست جاری می‌سازد ([settings.ts:264](frontend/src/app/components/settings/settings.ts:264)). نتیجه: یک ذخیرهٔ ساده تمام تنظیمات فیلدهای سازمانی را نابود می‌کند. این مستقیماً خلاف قاعدهٔ «داده کاربر هرگز نباید از بین برود» است.

**۲-۲. هر کلید ذخیره‌شده‌ای که در لیست پیش‌فرض جاری نباشد، بی‌صدا حذف می‌شود**
`mergeFieldPermissions` لیست را از پیش‌فرض‌ها + `dyn_*` بازمی‌سازد ([field-config.model.ts](frontend/src/app/core/models/field-config.model.ts)) و بقیه را دور می‌ریزد. یک فیلد تغییرنام‌یافته، تنظیماتش را در اولین ذخیره از دست می‌دهد.

**۲-۳. فایل rollback اضطراری همیشه پاک می‌شود — شاخهٔ «نگه‌داری برای بازیابی دستی» کد مرده است**
در [views_backup.py:439](backend/config/views_backup.py:439):
```python
if rollback_succeeded or 'exc' not in dir():
    _safe_remove(rollback_path)
else:
    logger.warning("Keeping rollback file for manual recovery: %s", rollback_path)
```
در پایتون، `except Exception as exc:` وقتی بلوک `return` می‌کند، `exc` را پیش از اجرای `finally` بیرونی حذف می‌کند. پس `'exc' not in dir()` **همیشه True است** و آخرین نسخهٔ نجات همیشه نابود می‌شود — دقیقاً در سناریویی که برای آن ساخته شده بود.

**۲-۴. پیام خطای بازیابی دروغ می‌گوید**
[views_backup.py:424](backend/config/views_backup.py:424) همیشه «سیستم به حالت قبل بازگردانده شد» برمی‌گرداند، حتی وقتی `rollback_path` تهی بوده یا خود rollback شکست خورده. اپراتور فکر می‌کند داده سالم است در حالی که نیست — بدترین نوع خطا برای این عملیات.

**۲-۵. ذخیره‌سازی last-write-wins بدون هیچ محافظتی**
`saveGlobalSettings` کل آبجکت `settings` را POST می‌کند. دو مدیر که هم‌زمان روی دو تب مختلف کار می‌کنند، تغییرات هم را بی‌صدا پاک می‌کنند. هیچ ETag، نسخه، یا ارسال دلتا وجود ندارد.

**۲-۶. هیچ محافظت dirty-state وجود ندارد**
مسیر `settings` نه `canDeactivate` دارد ([app.routes.ts:52](frontend/src/app/app.routes.ts:52)) و نه هشدار روی دکمهٔ بارگذاری مجدد یا تعویض تب. مقایسه کنید با `dispatch` و `docs` که `importLeaveGuard` دارند. یک کلیک اشتباه، دقایقی تنظیم فیلد را از بین می‌برد.

**۲-۷. اثر جانبی پنهان: اولین ذخیره، تمام پیش‌فرض‌ها را به رکورد دیتابیس تبدیل می‌کند**
GET همهٔ کلیدهای `DEFAULT_SETTINGS` را برمی‌گرداند و ذخیره همه را به‌صورت ردیف دیتابیس می‌نویسد. بعد از اولین ذخیره، تغییر `DEFAULT_SETTINGS` در [warehouses/services.py](backend/warehouses/services.py) هرگز دیگر اثری نخواهد داشت.

---

# ۳) آفلاین و PWA

**۳-۴ مورد زیر همه ریشهٔ مشترک دارند: هیچ‌یک از سه درخواست این صفحه توکن `SKIP_OFFLINE` ندارند** ([services/settings.ts](frontend/src/app/services/settings.ts)).

**۳-۱. اسپینر بکاپ برای همیشه گیر می‌کند**
آفلاین (یا کد ۵۲x کلودفلر) → اینترسپتور درخواست را در صف می‌گذارد و یک `HttpResponse` جعلی با بدنهٔ **آبجکت** برمی‌گرداند ([offline.interceptor.ts](frontend/src/app/core/interceptors/offline.interceptor.ts)). `URL.createObjectURL(<object>)` در [settings.ts:319](frontend/src/app/components/settings/settings.ts:319) استثنا می‌دهد، هیچ توستی نمایش داده نمی‌شود و `isBackupLoading` تا ابد `true` می‌ماند.

**۳-۲. رمز بکاپ به‌صورت plaintext در IndexedDB ذخیره می‌شود**
همان ورودی صف، بدنهٔ درخواست را دست‌نخورده در `offlineDb.syncQueue` می‌نشاند ([offline-sync.service.ts:345](frontend/src/app/core/services/offline-sync.service.ts:345)) — یعنی رمز رمزنگاری کل دیتابیس روی دیسک دستگاه، احتمالاً دستگاه مشترک. و بعداً replay می‌شود و یک `pg_dump` سمت سرور تولید می‌کند که خروجی‌اش به هیچ‌جا نمی‌رود.

**۳-۳. ذخیرهٔ آفلاین تنظیمات، توست موفقیت دروغین نشان می‌دهد**
`POST /settings/global/` هم صف می‌شود و `next` اجرا می‌شود → «تنظیمات ذخیره شد» در حالی که هیچ‌چیز به سرور نرسیده.

**۳-۴. بعد از بازیابی دیتابیس، کش آفلاین پاک نمی‌شود**
[settings.ts:400](frontend/src/app/components/settings/settings.ts:400) فقط `auth.logout()` صدا می‌زند. کش IndexedDB و صف همگام‌سازی همچنان دادهٔ **پیش از restore** را دارند و روی دیتابیس بازیابی‌شده replay خواهند شد — یعنی آلوده‌کردن دیتابیسی که همین الان از بکاپ برگشته.

**۳-۵. کل تنظیمات سراسری در IndexedDB مقیم می‌شود**
`GET /settings/global/` با الگوی SWR کش می‌شود و روی دستگاه‌های مشترک باقی می‌ماند.

---

# ۴) تنظیماتی که هیچ اثری ندارند (کد مرده)

این‌ها را با grep روی کل مخزن تأیید کردم — کلید نوشته می‌شود، هیچ‌کس نمی‌خواند:

| تنظیم | محل در UI | وضعیت |
|---|---|---|
| `manager_approval_mode` | [settings.html:114](frontend/src/app/components/settings/settings.html:114) | **هیچ مصرف‌کننده‌ای ندارد** — نه فرانت، نه بک‌اند. فقط در همین صفحه و صفحه تنظیمات انبار نوشته می‌شود. |
| `scanner_camera_preset` | [settings.html:260](frontend/src/app/components/settings/settings.html:260) | اسکنر فقط `localStorage['wh_scanner_camera_preset']` را می‌خواند. یک `@Input() serverPreset` در [barcode-scanner.component.ts:424](frontend/src/app/shared/components/barcode-scanner/barcode-scanner.component.ts:424) تعریف شده ولی **هیچ قالبی به آن bind نمی‌کند** → همیشه undefined. |
| `scanner_custom_resolution` / `_interval_ms` / `_roi_size` / `_try_harder` | [settings.html:271-304](frontend/src/app/components/settings/settings.html:271) | هیچ‌جا خوانده نمی‌شوند. کل بلوک «کیفیت پیش‌فرض دوربین» بی‌اثر است. |
| `chat_enabled` / `chat_file_sharing` | بخش تازه‌افزوده‌شده، خطوط ~۳۴۷–۳۸۷ | در `DEFAULT_SETTINGS` **وجود ندارند** و هیچ مصرف‌کننده‌ای ندارند (`isChatEnabled` ثابتاً `true` است). |

**۴-۱. پیش‌تنظیم‌های جداکنندهٔ اسکنر جز حالت پیش‌فرض هیچ‌کدام کار نمی‌کنند**
`onScannerPresetChange` رشته‌های **خوانا برای انسان** ذخیره می‌کند ([settings.ts:139](frontend/src/app/components/settings/settings.ts:139)): `'Chr(30)'`، `'Chr(30) & ";"'`، و `'\\n'` / `'\\t'` (دو کاراکتر بک‌اسلش و n). اما پارسر آن‌ها را به‌صورت **متن خام** مقایسه می‌کند: `text.includes(rSep)` در [customs-scanner-parser.ts:54](frontend/src/app/components/customs/customs-scanner-parser.ts:54) و [:85](frontend/src/app/components/customs/customs-scanner-parser.ts:85). هیچ بارکدی هرگز رشتهٔ «Chr(30)» را در خود ندارد. عملاً هر پیش‌تنظیم غیر از `default` بی‌اثر است و کار فقط به‌لطف تشخیص خودکار داخلی پارسر (قواعد ۱ و ۲ که کاراکترهای کنترلی واقعی و TSV را می‌بینند) پیش می‌رود. `detectScannerPreset` هم رفت‌وبرگشت را درست نشان می‌دهد و همین مشکل را پنهان می‌کند. اگر انباری واقعاً به جداکنندهٔ سفارشی نیاز داشته باشد، متن UI او را به وارد کردن توکنی تشویق می‌کند که هرگز مطابقت نمی‌یابد.

**۴-۲. سوئیچ‌های چت به‌خاطر نبودن در `DEFAULT_SETTINGS` وضعیت شکننده دارند**
قالب از الگوی `!== false` استفاده می‌کند، پس مقدار undefined «روشن» دیده می‌شود؛ اولین کلیک آن را `false` می‌کند. یعنی وضعیت بصری و معنای واقعی از ابتدا هم‌راستا نیستند.

---

# ۵) صحت عملکرد، دسترس‌پذیری و کیفیت

**۵-۱. سوئیچ‌ها با صفحه‌کلید داده را از مدل جدا می‌کنند**
الگوی ردیف‌ها: `(click)` روی `div` بیرونی، `[checked]` یک‌طرفه روی `input`، و `pointer-events-none` روی `label` ([settings.html:120-129](frontend/src/app/components/settings/settings.html:120)). هیچ `(change)` وجود ندارد. اما `input` هنوز در ترتیب Tab است — کاربر صفحه‌کلید با Space وضعیت DOM چک‌باکس را عوض می‌کند در حالی که مدل تغییر نمی‌کند. **نمایش و داده از هم واگرا می‌شوند و تغییر هرگز ذخیره نمی‌شود.** ردیف هم به‌هیچ شکل دیگری با صفحه‌کلید قابل استفاده نیست (نه `tabindex`، نه `(keydown.enter)`).

**۵-۲. `role="switch"` روی `<label>` گذاشته شده** — ARIA نامعتبر؛ نقش باید روی خود کنترل باشد.

**۵-۳. «نمایش همه» / «مخفی‌سازی همه» فقط روی نتایج فیلترشده اثر می‌کنند**
این دکمه‌ها ([settings.html:416](frontend/src/app/components/settings/settings.html:416) و [:613](frontend/src/app/components/settings/settings.html:613)) روی `filteredFieldConfigs` کار می‌کنند. با یک جست‌وجو یا دستهٔ فعال، برچسب «همه» می‌گوید ولی زیرمجموعه‌ای تغییر می‌کند.

**۵-۴. بازنشانی همه فیلدها بدون هیچ تأییدی**
[settings.ts:195](frontend/src/app/components/settings/settings.ts:195) و [:245](frontend/src/app/components/settings/settings.ts:245) تمام سازگارسازی‌ها (از جمله برچسب‌های سفارشی) را با یک کلیک پاک می‌کنند — بدون دیالوگ. توجه کنید که `wh-settings` برای عملیات مشابه `confirm.open()` دارد؛ این صفحه ندارد.

**۵-۵. دانلود بکاپ در بعضی مرورگرها می‌شکند**
[settings.ts:319-324](frontend/src/app/components/settings/settings.ts:319): انکر هرگز به DOM اضافه نمی‌شود و `URL.revokeObjectURL` بلافاصله بعد از `click()` اجرا می‌شود. این الگو در فایرفاکس شکسته و در بقیه ریسک مسابقهٔ زمانی دارد — روی فایل بزرگ بکاپ.

**۵-۶. مدیریت ضعیف فیلدهای رمز**
`autocomplete="new-password"` ندارند و `backupPassword` فقط در مسیر موفق پاک می‌شود، نه در خطا — رمز در حافظهٔ کامپوننت و DOM باقی می‌ماند.

**۵-۷. مودال تأیید بازیابی الزامات مودال را ندارد** — نه Escape، نه focus trap، نه بازگرداندن focus.

**۵-۸. نشتی اشتراک و `detectChanges` در `ngOnInit`**
[settings.ts:81](frontend/src/app/components/settings/settings.ts:81): `route.queryParams.subscribe()` هرگز unsubscribe نمی‌شود (نه `takeUntilDestroyed`، نه `ngOnDestroy`) و درون همان اشتراک، در حین مقدماتی‌سازی، `cdr.detectChanges()` صدا زده می‌شود ([:86](frontend/src/app/components/settings/settings.ts:86)).

**۵-۹. `settings: any = {}`** ([settings.ts:26](frontend/src/app/components/settings/settings.ts:26)) — بدون هیچ تایپی. یک غلط املایی در نام کلید کاملاً بی‌صدا است و همان کلید غلط برای همیشه در دیتابیس ذخیره می‌شود (به‌خاطر مورد ۱-۴).

**۵-۱۰. getter‌های فیلترشده در هر چرخهٔ تشخیص تغییر چند بار اجرا می‌شوند** — `filteredFieldConfigs` و `filteredDocFieldConfigs` هر بار روی همهٔ فیلدها `filter` می‌زنند؛ روی جدولی با ده‌ها فیلد و `detectChanges` مکرر قابل حس است.

**۵-۱۱. کد و فایل مرده** — `isSuperUser` در [settings.ts:46](frontend/src/app/components/settings/settings.ts:46) تعریف شده و در قالب استفاده نمی‌شود؛ `settings.css` صفر بایت است ولی همچنان در `styleUrl` ارجاع دارد.

**۵-۱۲. پوشش تست تقریباً صفر** — [settings.spec.ts](frontend/src/app/components/settings/settings.spec.ts) فقط یک `should create` دارد. سریال‌سازی ذخیره، گیت مجوزها، و کل مسیر بکاپ/بازیابی هیچ تستی ندارند.

**۵-۱۳. قالب ۱۰۰۸ خط است** — بیش از دو برابر سقف ۵۰۰ خطی CLAUDE.md.

---

## اولویت پیشنهادی برای اصلاح

۱. مورد ۲-۳ و ۲-۴ (تخریب فایل نجات + پیام دروغین) — ریسک از دست رفتن کل دیتابیس.
۲. مورد ۳-۱ تا ۳-۴ (افزودن `SKIP_OFFLINE` به سه درخواست + پاکسازی IndexedDB بعد از restore) — یک تغییر کوچک، چهار باگ.
۳. مورد ۲-۱ (اگر بارگذاری فیلدهای داینامیک شکست خورد، ذخیره را مسدود کن).
۴. مورد ۱-۱ و ۱-۲ (گیت‌کردن دکمه ذخیره + نمایش پیام سرور).
۵. مورد ۱-۵ و ۱-۶ (اجرای سمت سرور مجوز فیلدها؛ یکی‌کردن دو مسیر بکاپ روی نسخه‌ای که `confirm_text` و لاگ حسابرسی دارد).
۶. مورد ۴ (یا تنظیمات مرده را به مصرف‌کننده وصل کن، یا از UI حذفشان کن — نگه‌داشتنشان یعنی مدیر فکر می‌کند سیستم را پیکربندی کرده).

هیچ فایلی تغییر نکرده — این فقط گزارش بود.
