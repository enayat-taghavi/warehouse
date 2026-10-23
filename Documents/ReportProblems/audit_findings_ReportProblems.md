# ایرادات صفحه گزارش‌ساز (`/reports`)

> نسخه مو‌به‌موی گزارش کاوش عمیق ارائه‌شده در چت — تاریخ: ۱۴۰۵/۰۶/۰۳ (2026-08-25).
> مسیرهای لینک‌شده نسبت به ریشه پروژه (`E:\warehouse project`) هستند.

---

## ۱) باگ‌های کارکردی — گزارش را می‌شکنند

**۱-۱. فیلتر روی «فیلد محاسباتی» جدول پیوندی وقتی آن جدول در خروجی نیست → خطای قطعی**
در [engine.py:481-484](../../backend/reports/engine.py) اگر JOIN چندمقداری فقط در فیلتر استفاده شود، به `_exists_aliases` می‌رود و `FilteredRelation` برایش ساخته **نمی‌شود**. اما [engine.py:507-512](../../backend/reports/engine.py) بدون توجه به این، انوتیشن را روی کوئری بیرونی می‌نشاند — انوتیشنی که به alias `count_tasks_fr` اشاره می‌کند و وجود ندارد → `FieldError: Cannot resolve keyword 'count_tasks_fr'`. همین مشکل داخل subquery در [engine.py:266-273](../../backend/reports/engine.py) هم هست (انوتیشن به subquery اضافه نمی‌شود).

بازتولید: موجودیت «کالاها» + JOIN «وظایف شمارش» + فیلتر روی `نام شمارشگر` + **هیچ** ستونی از وظایف شمارش در خروجی. فیلدهای درگیر: `counter_name`، `supervisor_name`، `doc_worker_name`.
تست‌های `JoinQueryTests` ([tests.py:596-639](../../backend/reports/tests.py)) فقط مسیر خروجی‌دار (FilteredRelation) را پوشش می‌دهند؛ مسیر EXISTS بدون تست است.

**۱-۲. نام مستعار فارسی — درست همان مثالی که خودِ UI پیشنهاد می‌دهد رد می‌شود**
placeholder در [reports.html:358](../../frontend/src/app/components/reports/reports.html) می‌گوید «عنوان دلخواه ستون (مثال: جمع موجودی)»، اما بک‌اند در [engine.py:443](../../backend/reports/engine.py) با `ALIAS_RE = ^[a-z_][a-z0-9_]{0,40}$` اعتبارسنجی می‌کند. یعنی فارسی، حروف بزرگ و فاصله همه رد می‌شوند: «نام alias نامعتبر: جمع موجودی». این فیلد در UI «عنوان ستون» معرفی شده ولی در واقع یک شناسه SQL است.

**۱-۳. تغییر خودکار تابع تجمیع، HAVING و نمودار را معلق می‌گذارد**
[reports.ts:309-321](../../frontend/src/app/components/reports/reports.ts) هنگام افزودن JOIN چندمقداری، `fn` را به `count` عوض می‌کند ولی `pruneAggDependents()` را صدا نمی‌زند. چون alias خودکار از `fn` ساخته می‌شود ([report-store.ts:101-103](../../frontend/src/app/components/reports/report-store.ts))، `sum_inventory` به `count_inventory` تبدیل می‌شود و هر شرط HAVING یا محور Y نمودار که به alias قبلی اشاره داشت بی‌مرجع می‌ماند → خطای ۴۰۰ بک‌اند: «شرط HAVING فقط روی نتایج تجمیع همین گزارش مجاز است». همین اتفاق با تغییر دستی `fn` در [reports.ts:487](../../frontend/src/app/components/reports/reports.ts) هم می‌افتد اگر آنجا هم هرس انجام نشود.

**۱-۴. صفحه‌بندی حالت گروه‌بندی ناپایدار است**
در [engine.py:582-583](../../backend/reports/engine.py) فقط برای حالت غیرگروهی `order.append('pk')` به‌عنوان tiebreak اضافه می‌شود. در حالت گروه‌بندی اگر کاربر مرتب‌سازی نداده باشد، هیچ `ORDER BY` ای وجود ندارد → PostgreSQL ترتیب را تضمین نمی‌کند و ورق زدن صفحه‌ها می‌تواند ردیف تکراری نشان دهد یا ردیف جا بیندازد.

**۱-۵. محدودیت اشتباه روی جمع/میانگین**
[engine.py:449-454](../../backend/reports/engine.py) هر `sum/avg/min/max` روی فیلد پایه را وقتی «هر» JOIN چندمقداری وجود دارد رد می‌کند. اما `_has_many_join` در `_process_joins` ست می‌شود، در حالی که تفکیک EXISTS/FilteredRelation بعداً در [engine.py:477-484](../../backend/reports/engine.py) انجام می‌شود. نتیجه: اگر JOIN چندمقداری **فقط برای فیلتر** باشد (EXISTS، بدون تکثیر ردیف)، جمع درست است ولی سیستم آن را ممنوع می‌کند. سناریوی مسدودشده: «جمع موجودی به تفکیک دیسیپلین، فقط برای کالاهایی که وظیفه شمارش دارند».

**۱-۶. پنل پیشرفت خروجی، job دوم را نادیده می‌گیرد**
`exportJobId` فقط در [reports.ts:755](../../frontend/src/app/components/reports/reports.ts) ست می‌شود و هیچ‌جا قبل از شروع خروجی جدید صفر نمی‌شود. اگر پنل باز باشد و job قبلی `done` شده باشد، interval در [export-progress.component.ts:86-89](../../frontend/src/app/components/reports/export-progress.component.ts) قبلاً لغو شده و `ngOnInit` دوباره اجرا نمی‌شود → job جدید هرگز poll نمی‌شود، پنل وضعیت job قبلی را نشان می‌دهد و دکمه دانلود برای jobِ آماده‌نشده کلیک می‌شود (خطای ۴۰۹ «فایل هنوز آماده نیست»).

---

## ۲) پایداری و کارایی

**۲-۱. مسیر خروجی هیچ فیوز زمانی ندارد**
`run()` کوئری را داخل `SET LOCAL statement_timeout` می‌بندد ([engine.py:648-657](../../backend/reports/engine.py))، ولی `export_queryset()` در [engine.py:678-685](../../backend/reports/engine.py) نه timeout دارد و نه `OperationalError` را مدیریت می‌کند. `qs.count()` روی گزارش سنگین می‌تواند از سقف ~۱۰۰ ثانیه Cloudflare Tunnel رد شود — کاربر ۵۲۴ می‌گیرد و کوئری روی PostgreSQL همچنان در حال اجراست.

**۲-۲. job گیرکرده = poll بی‌پایان**
[export-progress.component.ts:64-75](../../frontend/src/app/components/reports/export-progress.component.ts) فقط با `done`/`failed`/۴۰۴/۳ خطای پیاپی متوقف می‌شود. اگر job در `running` بماند (thread مرده، worker خاموش)، هر ۲ ثانیه تا ابد درخواست می‌رود. هیچ سقف زمانی یا تشخیص «نبض کهنه» سمت کلاینت وجود ندارد.

**۲-۳. پاک‌سازی و بازیابی job یتیم عملاً وابسته به worker است**
`cleanup_old_jobs()` تنها از دو نقطه صدا زده می‌شود: worker ([run_export_worker.py:41-43](../../backend/reports/management/commands/run_export_worker.py)) و `ExportJobListView` ([views.py:163](../../backend/reports/views.py)). اما فرانت‌اند **هیچ متدی** برای `/api/reports/exports/` ندارد ([report-api.service.ts](../../frontend/src/app/core/api/report-api.service.ts) فقط `exports/<id>/` را صدا می‌زند). پس در حالت fallback به Thread (worker خاموش)، نه فایل قدیمی پاک می‌شود، نه job یتیم به `failed` تبدیل می‌شود.

**۲-۴. خروجی پس‌زمینه با یک رفرش گم می‌شود**
`exportJobId` فقط در حافظه است و در URL/localStorage ذخیره نمی‌شود. با رفرش صفحه یا رفتن به صفحه دیگر، فایل روی سرور ساخته می‌شود ولی کاربر هیچ راهی برای رسیدن به آن ندارد (endpoint فهرست jobها بی‌استفاده است) و فایل بعد از ۲۴ ساعت پاک می‌شود.

**۲-۵. رقابت thread و worker روی یک job**
[excel.py:144-151](../../backend/reports/excel.py): job با `status='pending'` ساخته می‌شود و اگر worker زنده نباشد یک Thread هم استارت می‌خورد. thread ردیف را قفل نمی‌کند؛ اگر worker همان لحظه بالا بیاید، `_claim()` همان job را برمی‌دارد → دو پردازش موازی، دو فایل، `progress` پرش‌دار.

**۲-۶. اجرای خودکار بازیابی وضعیت بدون بررسی آفلاین و اعتبارسنجی**
[reports.ts:214-222](../../frontend/src/app/components/reports/reports.ts) پس از ۵۰ میلی‌ثانیه گزارش را اجرا می‌کند بدون چک `isOffline()` و بدون `validateReportSpec()` — برخلاف `runReport()` که هر دو را چک می‌کند. نتیجه: باز کردن لینک گزارش در حالت قطعی سرور یا با پیش‌نویس ناقص، بنر خطای قرمز می‌دهد. هیچ retry خودکار پس از برگشت اتصال هم وجود ندارد.

**۲-۷. قفل شدن کل UI در refresh**
[report-store.ts:127-134](../../frontend/src/app/components/reports/report-store.ts) پرچم `isRefreshing` را ۶۰۰ میلی‌ثانیه بعد از اتمام دو درخواست پایین می‌آورد، و [reports.html:125](../../frontend/src/app/components/reports/reports.html) در این مدت `pointer-events-none` روی تمام سازنده می‌گذارد.

---

## ۳) امنیت و سطح دسترسی

**۳-۱. متن خطای داخلی به کلاینت برمی‌گردد**
[views.py:115](../../backend/reports/views.py) و [views.py:155](../../backend/reports/views.py): `f'خطا در اجرای گزارش: {str(e)}'` — متن انگلیسی استثنای Django (شامل نام فیلدها و مسیرهای ORM: «Choices are: id, warehouse_id, …») به کاربر نشان داده می‌شود. همین در [excel.py:207](../../backend/reports/excel.py) هم برای job (`error_message=str(e)[:1000]`) رخ می‌دهد و از طریق سریالایزر در پنل پیشرفت نمایش داده می‌شود. ضمناً خطای ۵۰۰ واقعی به‌شکل ۴۰۰ برگردانده می‌شود که برخلاف قرارداد و مانع پایش است.

**۳-۲. مستندات مجوز کهنه است**
docstring در [views.py:4-5](../../backend/reports/views.py) می‌گوید «export علاوه بر آن `view_sys_export` می‌خواهد»، در حالی که این گیت در `ExportReportView` ([views.py:125](../../backend/reports/views.py)) عمداً حذف شده (طبق `Documents/Report_Builder_Export_Robustness_Fixes/`). خودِ کد درست است؛ مستند گمراه‌کننده است.

**۳-۳. `view_sys_export` کلید عبور از فیلدهای حساس است**
[registry.py:40](../../backend/reports/registry.py): `SENSITIVE_BYPASS_PERMS = ('view_sys_export', 'view_sys_manager_review')`. یعنی هر کاربری که مجوز «صدور فایل تغذیه» را دارد، در حالت شمارش کور هم `counted_balance` و `موجودی فیزیکی` را می‌بیند. این همان مجوزی است که تیم قبلاً آن را «غیرمرتبط با گزارش‌ساز» تشخیص داده و از گیت خروجی حذف کرده — استفاده از آن به‌عنوان کلید حساسیت ناهم‌خوان است.

**۳-۴. حساسیت فیلد با یک انبار حل می‌شود، ولی کوئری چند-انباری است**
[registry.py:249](../../backend/reports/registry.py) از `get_setting('blind_counting', warehouse_id)` استفاده می‌کند. انتخاب انبار در گزارش‌ساز اختیاری است؛ با `warehouse_id=None` تابع `get_setting` ([services.py:42-67](../../backend/warehouses/services.py)) به تنظیم global برمی‌گردد. اگر global روی `open` و انبار الف روی `blind` باشد، گزارشِ بدون انتخاب انبار موجودی انبار الف را نشان می‌دهد. (پیش‌فرض `blind` است، پس این فقط با یک ردیف global صریح رخ می‌دهد.)

**۳-۵. منطق دامنه انبار در engine تکرار شده است**
[engine.py:196-214](../../backend/reports/engine.py) قاعده «کاربر به کدام انبار دسترسی دارد» را دستی پیاده کرده و از `common/warehouse_scope.py` استفاده نمی‌کند — همان ماژولی که [صریحاً برای جلوگیری از این واگرایی ساخته شده](../../backend/common/warehouse_scope.py). رفتار فعلی اتفاقاً یکسان است (کاربر بدون انبار = همه انبارها)، اما اگر روزی `STRICT_WAREHOUSE_SCOPE` روشن شود، گزارش‌ساز تنها جایی است که سخت‌گیر نمی‌شود.

**۳-۶. مقادیر فیلتر در URL**
[reports.ts:146-160](../../frontend/src/app/components/reports/reports.ts) کل درخت فیلتر را به‌صورت JSON در query params می‌گذارد؛ مقادیر (کد کالا، نام افراد، اعداد موجودی) در تاریخچه مرورگر و لاگ‌های میانی ثبت می‌شوند.

---

## ۴) درستی داده و نمایش

**۴-۱. فیلتر تاریخ روی فیلد «تاریخ و زمان»، روز آخر را حذف می‌کند**
تاریخ‌انتخابگر فقط تاریخ برمی‌گرداند ([filter-value.component.ts:83](../../frontend/src/app/components/reports/filter-value.component.ts): `$event.gregorian`) و بک‌اند در [engine.py:236](../../backend/reports/engine.py) آن را به `date` تبدیل می‌کند. برای فیلد `datetime`، شرط `lte` می‌شود `<= 00:00:00` آن روز → تمام رکوردهای روز پایانی بازه از نتیجه بیرون می‌مانند. (برای `eq` این حالت با `__date` مدیریت شده — [engine.py:378](../../backend/reports/engine.py) — ولی برای `lte`/`between` نه.)

**۴-۲. عدد در جدول قالب‌بندی نمی‌شود**
[reports.ts:881-894](../../frontend/src/app/components/reports/reports.ts) برای type=`number` فقط `String(value)` می‌دهد. چون `_jsonable` مقادیر Decimal را `str()` می‌کند ([engine.py:692](../../backend/reports/engine.py))، جدول `1234.5000` نشان می‌دهد در حالی که Excel و PDF همان مقدار را `1234.5` و با جداکننده نمایش می‌دهند. بدون جداکننده هزارگان هم خواندن ستون‌های موجودی سخت است.

**۴-۳. معنای «تعداد» با وجود JOIN عوض می‌شود**
[engine.py:531](../../backend/reports/engine.py): `Count(fd.source, distinct=bool(fr_aliases))`. یک گزارش با «تعداد وضعیت» بدون JOIN تعداد ردیف‌های غیرتهی را می‌دهد، و با اضافه شدن یک JOIN، تعداد **مقادیر متمایز** را — عددی کاملاً متفاوت، بدون هیچ هشداری به کاربر.

**۴-۴. ستون‌های داخلی در پاسخ**
در حالت غیرگروهی با JOIN چندمقداری، [engine.py:584-598](../../backend/reports/engine.py) کلیدهای `id` و `count_tasks_fr__id` را به `values()` اضافه می‌کند. این‌ها در `columns` نیستند ولی در `rows` پاسخ می‌مانند — حجم اضافه و افشای نام‌های داخلی alias.

---

## ۵) ناهم‌خوانی متن‌ها و محدودیت‌ها

| مورد | متن UI | واقعیت کد |
|---|---|---|
| سقف گروه نمودار | «نمودار ۲۰۰ گروه اول» — [reports.html:549](../../frontend/src/app/components/reports/reports.html) | `MAX_CHART_GROUPS = 50` — [report-chart.component.ts:17](../../frontend/src/app/components/reports/report-chart.component.ts). سه عدد متناقض: ۲۰۰ (واکشی)، ۵۰ (رسم)، `count()` (کل). هر دو بنر می‌توانند همزمان دیده شوند. |
| آستانه خروجی پس‌زمینه | «بالای ۵۰۰۰ ردیف» — [reports.html:838](../../frontend/src/app/components/reports/reports.html) | `SYNC_ROW_LIMIT = 10_000` |
| نام فایل اکسل sync | نام قالب | [views.py:142](../../backend/reports/views.py) همیشه `filename='report.xlsx'` می‌فرستد؛ فقط چون فرانت `a.download` را ست می‌کند مشکل دیده نمی‌شود (دانلود مستقیم از API نام غلط می‌دهد). |
| نام فایل PDF | نام قالب | [views.py:136-139](../../backend/reports/views.py) نام فارسی را بدون encode در هدر می‌گذارد → Django آن را MIME-encode می‌کند و مرورگر نام مخدوش نشان می‌دهد. |

سایر موارد نمایشی:
- عنوان گروه فیلدهای JOIN در picker، alias خام است نه برچسب فارسی: `label: alias` در [reports.ts:413](../../frontend/src/app/components/reports/reports.ts).
- `aliasLabel()` ([reports.ts:534](../../frontend/src/app/components/reports/reports.ts)) و `chartXLabel()` ([reports.ts:608](../../frontend/src/app/components/reports/reports.ts)) فقط `store.fieldByKey()` (فیلدهای پایه) را می‌بینند؛ برای فیلدهای JOIN کلید خام مثل `count_tasks.counted_balance` در فهرست HAVING و محور نمودار نمایش داده می‌شود.
- در انتخاب فیلد تجمیع، وقتی تابع `count` است فهرست به `store.fieldsMeta()` محدود می‌شود ([reports.html:352](../../frontend/src/app/components/reports/reports.html)) → «شمارش» روی فیلدهای JOIN از UI قابل انتخاب نیست، هرچند بک‌اند آن را می‌پذیرد.
- `setChart()` با انتخاب ناقص، بار بعدی که `pruneAggDependents()` اجرا شود نمودار را `null` می‌کند ([report-store.ts:244](../../frontend/src/app/components/reports/report-store.ts)) و انتخاب نیمه‌کاره کاربر پاک می‌شود.
- هر دو مودال (راهنما و ذخیره قالب) بدون `role="dialog"`، بدون focus trap و بدون بستن با `Escape` هستند.

---

## ۶) کد مرده و ریسک نگهداشت

- **`_build_join_scope_q` همیشه `Q()` خالی برمی‌گرداند.** هر چهار JOIN موجود در whitelist ([registry.py:61-100](../../backend/reports/registry.py)) `path_to_base` دارند و `warehouse_path`شان با آن شروع می‌شود، پس شرط early-return در [engine.py:180-181](../../backend/reports/engine.py) همیشه برقرار است. یعنی `FilteredRelation` در عمل یک `LEFT JOIN` ساده است و منطق «شرط انبار در سطح ON» هرگز اجرا نمی‌شود و هیچ تستی ندارد — اگر روزی `JoinDef` ای بدون `path_to_base` اضافه شود، یک مسیر آزمایش‌نشده فعال می‌شود.
- **`manyJoinAliases()` از `j.key` ساخته می‌شود نه `j.as`** ([report-store.ts:74-76](../../frontend/src/app/components/reports/report-store.ts)) در حالی که نامش و مصرف‌کننده‌اش (`checkAndSwitchManyJoin`) alias را انتظار دارند. فعلاً چون `default_alias === key` است کار می‌کند؛ با هر alias سفارشی در قالب می‌شکند.
- **`ExportJobListView`** ([views.py:158-165](../../backend/reports/views.py)) بی‌مصرف است و `[:20]` روی آن به `Meta.ordering` مدل تکیه دارد (که خوشبختانه `-created_at` است).
- **`setTimeout(50)` و `setTimeout(100)`** ([reports.ts:214](../../frontend/src/app/components/reports/reports.ts)، [reports.ts:843](../../frontend/src/app/components/reports/reports.ts)) به‌جای هماهنگی واقعی با اتمام بارگذاری فیلدهای JOIN.
- **خلأ تست:** مسیر EXISTS با فیلد محاسباتی، صفحه‌بندی گروه‌بندی‌شده، HAVING روی alias فیلد JOIN، و مسیر `export_queryset` با کوئری سنگین — هیچ‌کدام تست ندارند.

---

**اولویت پیشنهادی برای رفع:** ۱-۱ و ۱-۲ (کاربر را قطعاً به دیوار می‌زنند)، بعد ۱-۳ و ۱-۵، بعد ۲-۱ و ۳-۱. موارد بخش ۵ ارزان و کم‌ریسک‌اند و می‌شود یکجا اصلاح کرد.

---

## پیوست — فرضیه‌هایی که در بازبینی رد شدند (ایراد نیستند)

۱. «خروجی گیت `view_sys_export` را که docstring می‌گوید ندارد» → این گیت **عمداً** حذف شده (طبق `Documents/Report_Builder_Export_Robustness_Fixes/`). فقط docstring کهنه است (مورد ۳-۲).
۲. «`_build_join_scope_q` مسیر را داخل `FilteredRelation` دوبار پیشوند می‌زند» → فرم `jd.path + '__' + jd.warehouse_path` برای شرط `FilteredRelation` **درست** است. (اما برای whitelist فعلی همیشه خالی است → مورد ۶-۱.)
۳. «`count_tasks.item__inventory` موجودی فیزیکی را در حالت کور لو می‌دهد» → `count_tasks` دارای `blind_sensitive=('counted_balance', 'item__inventory')` است و `get_fields` فیلدهای related را دوباره حساس علامت می‌زند؛ محافظت‌شده است.
۴. «فیلدهای جدول پیوندی هنگام بازیابی قالب/URL بارگذاری نمی‌شوند» → بارگذاری **می‌شوند**، از طریق callback `onLoaded` در `restoreStateAndRun` و `loadTemplate`.
