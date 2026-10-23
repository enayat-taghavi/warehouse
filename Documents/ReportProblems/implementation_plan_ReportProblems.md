# برنامه پیاده‌سازی مرحله‌بندی‌شده رفع ایرادات گزارش‌ساز (ReportProblems)

<div dir="rtl" align="right">

مرجع ایرادات: [audit_findings_ReportProblems.md](audit_findings_ReportProblems.md) — شماره‌گذاری موارد (۱-۱ … ۶-۵) در همه‌جای این سند به همان سند اشاره دارد.

**قواعد حاکم بر اجرا**
- هر مرحله یک commit مستقل روی `main` است؛ مرحله بعد فقط با سبز بودن تست‌های مرحله قبل شروع می‌شود.
- تست‌ها **قبل** از اصلاح نوشته می‌شوند (اول قرمز، بعد سبز) — همه در `backend/reports/tests.py` و `*.spec.ts` موجود؛ فایل تست جدید در ریشه ساخته نمی‌شود.
- هیچ فایلی بالای ۵۰۰ خط نمی‌رود؛ اگر `engine.py` (۶۹۹ خط) بیشتر رشد کرد، توابع JOIN به `reports/joins.py` منتقل می‌شوند (در مرحله ۱ پیش‌بینی شده).
- دستورهای build/restart/test به کاربر داده می‌شود، اجرا نمی‌شود.

---

## موارد نیازمند تأیید کاربر پیش از شروع

> [!IMPORTANT]
> این سه مورد تغییر رفتار محسوب می‌شوند و بدون تأیید صریح اجرا نمی‌شوند:
>
> ۱. **(۳-۳) حذف `view_sys_export` از `SENSITIVE_BYPASS_PERMS`** — پیشنهاد: جایگزینی با یک مجوز اختصاصی `view_sys_sensitive_reports` (یا محدود کردن به `view_sys_manager_review` تنها). تأثیر: کاربران دارای مجوز «صدور فایل تغذیه» دیگر در حالت شمارش کور موجودی فیزیکی را در گزارش نمی‌بینند.
> ۲. **(۳-۶) حذف مقادیر فیلتر از URL** — تأثیر: لینک اشتراکی گزارش دیگر فیلترها را حمل نمی‌کند (فقط قالب ذخیره‌شده این کار را می‌کند). گزینه جایگزین: نگه‌داشتن فعلی + هشدار در راهنما.
> ۳. **(۴-۳) معناشناسی «تعداد»** — گزینه الف: افزودن تابع مستقل `count_distinct` و ثابت نگه‌داشتن `count` (تغییر عدد گزارش‌های موجود دارای JOIN)؛ گزینه ب: حفظ رفتار فعلی + برچسب صریح «تعداد متمایز» در ستون. پیشنهاد: **گزینه ب** (بدون تغییر عدد).

---

## نقشه ایراد → مرحله

| مرحله | موضوع | موارد پوشش‌داده‌شده |
|---|---|---|
| ۰ | خط پایه و تست‌های قرمز | — |
| ۱ | موتور کوئری (بک‌اند) | ۱-۱، ۱-۴، ۱-۵، ۴-۴، ۶-۱ |
| ۲ | نام مستعار و همگام‌سازی تجمیع (فول‌استک) | ۱-۲، ۱-۳، ۵-۶، ۵-۷، ۵-۸، ۶-۲ |
| ۳ | پایداری خروجی | ۱-۶، ۲-۱، ۲-۲، ۲-۳، ۲-۴، ۲-۵، ۵-۳، ۵-۴، ۶-۳ |
| ۴ | امنیت، خطا و دامنه انبار | ۳-۱، ۳-۲، ۳-۳، ۳-۴، ۳-۵، ۳-۶ |
| ۵ | درستی داده و نمایش | ۴-۱، ۴-۲، ۴-۳، ۵-۱، ۵-۲، ۵-۵ |
| ۶ | UX، دسترس‌پذیری و تمیزکاری | ۲-۶، ۲-۷، ۵-۹، ۶-۴، ۶-۵ |

---

## مرحله ۰ — خط پایه و تست‌های قرمز

**هدف:** اثبات وجود باگ‌ها با تست، قبل از هر تغییر کد تولیدی.

### کارها
1. اجرای سوئیت فعلی و ثبت خروجی (۵۲ تست باید سبز باشد).
2. افزودن به [tests.py](../../backend/reports/tests.py) در کلاس `JoinQueryTests` و کلاس جدید `EngineRegressionTests`:

| تست | مورد | انتظار قبل از اصلاح |
|---|---|---|
| `test_filter_only_join_computed_field` | ۱-۱ | خطا (`FieldError`/۴۰۰) |
| `test_grouped_pagination_is_stable` | ۱-۴ | ناپایدار / بدون `ORDER BY` |
| `test_sum_allowed_with_filter_only_many_join` | ۱-۵ | `ReportError` نامعتبر |
| `test_rows_have_no_internal_keys` | ۴-۴ | وجود `id` و `*_fr__id` |
| `test_join_scope_condition_applied_when_no_path_to_base` | ۶-۱ | مسیر اجرا نمی‌شود |
| `test_datetime_lte_includes_last_day` | ۴-۱ | ردیف روز پایانی حذف می‌شود |

3. اسکلت تست فرانت در [reports.spec.ts](../../frontend/src/app/components/reports) (اگر نبود، ساخت `reports.spec.ts` در همان پوشه کامپوننت):
   - `addJoin` باید `pruneAggDependents` را صدا بزند (۱-۳)
   - تغییر `jobId` باید poll را از نو شروع کند (۱-۶)

### تست مرحله
```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python manage.py test reports -v 2
```
**پذیرش:** ۵۲ تست قبلی سبز؛ ۶ تست جدید بک‌اند و ۲ تست فرانت به‌صورت کنترل‌شده قرمز.

---

## مرحله ۱ — موتور کوئری

**هدف:** رفع خطای قطعی EXISTS، پایدارسازی صفحه‌بندی گروهی، آزادسازی تجمیع درست، تمیز کردن پاسخ.

### تغییرات — [engine.py](../../backend/reports/engine.py)

**۱-۱ (بحرانی):** تفکیک محل نشستن انوتیشن‌های فیلد محاسباتیِ JOIN
- در `_process_joins` (خطوط ۱۰۰-۱۷۳) هنگام ساخت انوتیشن فیلد محاسباتی، آن را در دیکشنری جدید `self._joined_anns[alias][orm_source] = annotation` هم ثبت کن (علاوه بر ثبت روی `FieldDef`).
- در `build()` (خط ۵۰۶-۵۱۲) دیکشنری `annotations` را فیلتر کن: انوتیشنی که به alias عضو `_exists_aliases` تعلق دارد **روی کوئری بیرونی ننشیند**.
- در `_wrap_exists` (خط ۲۵۸-۲۷۳) بعد از `annotate(**{fr_alias: FilteredRelation(...)})` انوتیشن‌های همان alias را هم به subquery اضافه کن، تا کلید `count_tasks_fr_first_name` داخل EXISTS قابل حل شود.
- Guard نهایی: قبل از `qs.annotate(**annotations)` هر کلیدی که به alias بدون `FilteredRelation` اشاره دارد حذف و در لاگ `warning` ثبت شود (fail-safe، نه سکوت).

**۱-۵:** ترتیب اعتبارسنجی
- بلوک محاسبه `_exists_aliases` / `fr_aliases` (خط ۴۷۷-۴۸۹) را **قبل** از حلقه اعتبارسنجی تجمیع (۴۳۳-۴۵۶) منتقل کن.
- شرط خط ۴۴۹-۴۵۴ از `self._has_many_join` به `bool(fr_aliases)` تغییر کند (فقط JOIN تکثیرکننده ردیف محدودیت بسازد).
- پیام خطا صریح‌تر: «جمع/میانگین روی فیلد پایه با جدول پیوندی چندمقداریِ حاضر در ستون‌ها ممکن نیست؛ آن جدول را فقط در فیلتر استفاده کنید.»

**۱-۴:** tiebreak گروهی
- در بلوک مرتب‌سازی (۵۷۰-۶۰۴) بعد از افزودن sortهای کاربر: `if grouped: order += [g for g in group_sources if g not in order and f'-{g}' not in order]`.

**۴-۴:** پاک‌سازی پاسخ
- در `run()` (۶۳۶-۶۷۵) پیش از `_jsonable`، کلیدهای بیرون از `{c['source'] or c['key'] for c in columns}` از هر ردیف حذف شوند.

**۶-۱:** پوشش مسیر مرده
- `_build_join_scope_q` بدون تغییر منطقی می‌ماند، اما یک docstring صریح می‌گیرد («برای whitelist فعلی همیشه `Q()` خالی است؛ فعال‌سازی مشروط به `JoinDef` بدون `path_to_base`») + تست مرحله ۰ آن را پوشش می‌دهد.

**بازآرایی (در صورت عبور از ۵۰۰ خط):** انتقال `_process_joins`، `_build_join_scope_q`، `_wrap_exists` به `reports/joins.py` با import در `engine.py`.

### تست مرحله
```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python manage.py test reports.tests -v 2
```
- ۶ تست قرمز مرحله ۰ (به‌جز ۴-۱ که در مرحله ۵ است) → سبز.
- تست اضافه: `test_exists_join_does_not_duplicate_rows` (تعداد ردیف با/بدون JOIN فیلتر-only یکسان).
- تست اضافه: `test_grouped_sort_by_user_column_then_tiebreak` (ترتیب پایدار در دو صفحه متوالی، بدون تکرار/جهش).

**دستی:** موجودیت «کالاها» + JOIN «وظایف شمارش» + فیلتر روی «نام شمارشگر» + بدون ستون از وظایف شمارش → گزارش باید اجرا شود؛ جمع موجودی به تفکیک دیسیپلین با همان فیلتر → باید مجاز باشد.

---

## مرحله ۲ — نام مستعار و همگام‌سازی تجمیع

**هدف:** حذف بن‌بست alias فارسی و جلوگیری از خراب شدن HAVING/نمودار.

### بک‌اند — [engine.py](../../backend/reports/engine.py)
**۱-۲:** افزودن فیلد اختیاری `label` به هر آیتم `aggregations`:
- `alias` همان شناسه SQL می‌ماند و `ALIAS_RE` روی آن باقی است؛ اگر کاربر ندهد، خودکار ساخته می‌شود (رفتار فعلی خط ۴۴۲).
- `label` فقط برای نمایش: طول حداکثر ۶۰ کاراکتر، هر کاراکتری مجاز، در `columns[*].label` نشسته و بی‌واسطه به Excel/PDF می‌رود.
- پیام خطای `ALIAS_RE` فارسی و راهنما شود: «شناسه فنی فقط حروف کوچک انگلیسی، رقم و `_`؛ برای عنوان فارسی از فیلد «عنوان ستون» استفاده کنید.»

### فرانت‌اند
**۱-۲** — [reports.html](../../frontend/src/app/components/reports/reports.html) (حدود ۳۵۲-۳۶۱):
- input فعلی به `label` بایند می‌شود با placeholder «عنوان ستون (مثال: جمع موجودی)».
- یک input ثانویه و جمع‌شده («تنظیمات پیشرفته») برای `alias` با `pattern="[a-z_][a-z0-9_]{0,40}"` و راهنمای فارسی.
**۵-۷** — حذف شرط `agg.fn === 'count' ? store.fieldsMeta() : aggregatableFields()`؛ برای `count` هم فهرست کامل شامل فیلدهای JOIN.
**۱-۳** — [reports.ts](../../frontend/src/app/components/reports/reports.ts):
- در `addJoin` (۳۰۹-۳۲۱) و `updateAggregation` (~۴۸۷) بعد از هر تغییر `fn`/`field`/`alias`، فراخوانی `store.pruneAggDependents()`.
- به‌جای تغییر خاموش `fn`، نمایش toast: «تابع «جمع» با جدول پیوندی چندمقداری به «تعداد» تغییر یافت؛ شرط HAVING/نمودار وابسته بازنشانی شد.»
**۵-۸** — [report-store.ts](../../frontend/src/app/components/reports/report-store.ts) `pruneAggDependents` (۲۴۰-۲۴۷): فقط بخش نامعتبر نمودار پاک شود (`y` تنها)، `x`/`kind` حفظ شود.
**۵-۶** — `aliasLabel()` و `chartXLabel()`: جست‌وجو در ادغام `fieldsMeta()` + فیلدهای JOIN + `label` تجمیع‌ها؛ در نبود برچسب، fallback به کلید.
**۶-۲** — `manyJoinAliases()` (۷۴-۷۶): `j.as || j.key`.

### تست مرحله
بک‌اند:
- `test_agg_label_persian_accepted` — `label='جمع موجودی'` بدون خطا، `columns[i].label` برابر همان.
- `test_agg_alias_invalid_message` — پیام فارسی راهنما.
- `test_agg_label_max_length` — بیش از ۶۰ کاراکتر → `ReportError`.
فرانت (`reports.spec.ts` / `report-store.spec.ts`):
- `addJoin` روی JOIN چندمقداری با تجمیع `sum` → `aggregations[0].fn === 'count'` **و** `having` خالی **و** `chart.y === null` **و** `chart.x` دست‌نخورده.
- `manyJoinAliases()` با `as: 'ct'` و `key: 'count_tasks'` → `['ct']`.
- `aliasLabel()` روی تجمیع فیلد JOIN → برچسب فارسی، نه `count_tasks.counted_balance`.

```bash
cd "E:/warehouse project/frontend" && npx ng test --watch=false --browsers=ChromeHeadless
```
**دستی:** تایپ «جمع موجودی» در عنوان ستون → گزارش اجرا شود و همان عنوان در جدول/Excel دیده شود.

---

## مرحله ۳ — پایداری خروجی

**هدف:** بی‌اثر کردن تایم‌اوت تونل، حذف رقابت thread/worker، بازیابی خروجی پس از رفرش.

### بک‌اند
**۲-۱** — [engine.py](../../backend/reports/engine.py) `export_queryset` (۶۷۸-۶۸۵):
- استخراج helper مشترک `_timed_execute(fn)` که `transaction.atomic()` + `SET LOCAL statement_timeout` را می‌گذارد و `OperationalError`/`DataError` را به `ReportError` فارسی تبدیل می‌کند؛ استفاده در `run()` و `export_queryset()`.
- برای export، تایم‌اوت جدا و بلندتر (`EXPORT_STATEMENT_TIMEOUT_MS = 120_000`) چون خارج از چرخه HTTP اجرا می‌شود.

**۲-۵** — [excel.py](../../backend/reports/excel.py):
- در ابتدای `_run_export_job` یک claim اتمی مثل worker: `select_for_update(skip_locked=True).filter(pk=job_pk, status='pending')` → اگر ردیفی برنگشت، بی‌صدا return (یعنی worker آن را برداشته).
- `start_export_job` بدون تغییر ساختاری؛ فقط comment توضیح claim.

**۲-۳** — `cleanup_old_jobs`: آستانه `stale_cutoff` برای `running` از ۱ ساعت به `ORPHAN_MINUTES*3` (۶ دقیقه) کاهش یابد و منطق بازیابی یتیم (سه تلاش) از [run_export_worker.py](../../backend/reports/management/commands/run_export_worker.py) به تابع مشترک `recover_orphan_jobs()` در `excel.py` منتقل شود تا هم worker و هم مسیر HTTP آن را صدا بزنند.

**۵-۳ و ۵-۴** — [views.py](../../backend/reports/views.py):
- helper `_content_disposition(name, ext)` که هم `filename="report.<ext>"` (ASCII fallback) و هم `filename*=UTF-8''<quote(name)>` را می‌سازد؛ استفاده در مسیر PDF (۱۳۶-۱۳۹) و پاس دادن نام واقعی به `sync_excel_response` (۱۴۲).
- `sync_excel_response` هدر را از همان helper بگیرد.

**۶-۳** — `ExportJobListView` با افزودن `?active=1` فقط jobهای `pending`/`running`/`done` اخیر (۶ ساعت) را برگرداند و `cleanup_old_jobs()` + `recover_orphan_jobs()` را صدا بزند.

### فرانت‌اند
**۲-۴ و ۶-۳** — [report-api.service.ts](../../frontend/src/app/core/api/report-api.service.ts): افزودن `getExportJobs(activeOnly = true)`.
**۲-۴** — [reports.ts](../../frontend/src/app/components/reports/reports.ts): در `ngOnInit` (اگر آنلاین) فراخوانی `getExportJobs()` و در صورت وجود job فعال یا `done` اخیر، ست کردن `exportJobId` و باز کردن پنل پیشرفت. `exportJobId` در پیش‌نویس `localStorage` هم ذخیره شود.
**۱-۶** — قبل از هر export: `exportJobId = null` و یک tick صبر (`setTimeout(0)`) یا استفاده از `@if` با کلید `[key]`؛ در [export-progress.component.ts](../../frontend/src/app/components/reports/export-progress.component.ts) پیاده‌سازی `OnChanges` که با تغییر `jobId` مقدارهای `job`/`consecutiveErrors` را ریست و poll را از نو شروع کند.
**۲-۲** — در همان کامپوننت: شمارنده مدت poll؛ پس از ۱۰ دقیقه بدون تغییر `progress` نمایش وضعیت «متوقف شده؟» با دکمه «تلاش مجدد» و توقف interval. نمایش `heartbeat_at` نیازمند افزودن این فیلد به سریالایزر job است.
**۵-۳** — `fileName` ورودی کامپوننت از `job.report_name` ساخته شود، نه پیش‌فرض `report.xlsx`.

### تست مرحله
بک‌اند:
- `test_export_queryset_timeout_returns_persian_error` (mock روی `cursor.execute` که `OperationalError` بیندازد).
- `test_double_claim_runs_once` — دو بار `_run_export_job(job_pk)` پشت‌سرهم → دقیقاً یک فایل و یک ردیف `done`.
- `test_recover_orphan_jobs_from_http_path` — job `running` با `heartbeat_at` کهنه + فراخوانی endpoint فهرست → `pending` (تلاش ۱) و در تلاش سوم `failed`.
- `test_content_disposition_utf8_filename` — هدر شامل `filename*=UTF-8''`.
- `test_export_jobs_list_active_only`.
فرانت:
- `ExportProgressComponent` با تغییر `jobId` → `getExportJob` با شناسه جدید صدا زده شود.
- توقف poll پس از سقف زمانی؛ نمایش دکمه تلاش مجدد.
- `ngOnInit` صفحه با یک job فعال در پاسخ → پنل پیشرفت باز.

**دستی:** خروجی بزرگ (بیش از ۱۰٬۰۰۰ ردیف) بگیر، وسط کار صفحه را رفرش کن → پنل پیشرفت باید خودش برگردد و دانلود کامل شود. سپس بلافاصله خروجی دوم بگیر → پیشرفت job دوم دیده شود.

---

## مرحله ۴ — امنیت، خطا و دامنه انبار

**هدف:** جلوگیری از افشای متن استثنا، درست کردن کد وضعیت، هم‌راستایی مجوز و دامنه انبار.

### تغییرات
**۳-۱** — [views.py](../../backend/reports/views.py) (۱۱۲-۱۱۵ و ۱۵۲-۱۵۵) و [excel.py:205-208](../../backend/reports/excel.py):
- `except ReportError` → ۴۰۰ با `e.message` (بدون تغییر).
- `except Exception` → `logger.exception('report run failed', extra={'user': request.user.pk})` و پاسخ **۵۰۰** با متن ثابت فارسی «خطای داخلی در اجرای گزارش؛ لطفاً با پشتیبانی تماس بگیرید (کد پیگیری: <uuid کوتاه>)». همان uuid در لاگ ثبت شود.
- `error_message` روی job هم پیام ثابت فارسی + کد پیگیری بگیرد، نه `str(e)`.
- بررسی: فرانت باید ۵۰۰ را هم مثل ۴۰۰ نمایش دهد → کنترل `msg(e)` در [report-store.ts:413-445](../../frontend/src/app/components/reports/report-store.ts) تا ۵۰۰ با آفلاین اشتباه نشود.

**۳-۲** — اصلاح docstring [views.py:4-6](../../backend/reports/views.py) به وضع واقعی مجوزها.

**۳-۳ (پس از تأیید)** — [registry.py:40](../../backend/reports/registry.py): `SENSITIVE_BYPASS_PERMS` بدون `view_sys_export`؛ در صورت انتخاب مجوز جدید، افزودن آن به فهرست مجوزهای سیستم در `accounts` و منوی تنظیمات دسترسی.

**۳-۴** — [registry.py:240-273](../../backend/reports/registry.py): تابع کمکی `_is_blind(user, warehouse_id)`؛ اگر `warehouse_id is None`، روی همه انبارهای در دامنه کاربر پیمایش شود و **سخت‌گیرانه‌ترین** حالت انتخاب شود (اگر حتی یک انبار `blind` است → کور).

**۳-۵** — [engine.py:196-214](../../backend/reports/engine.py): جایگزینی منطق دستی با helper مشترک [warehouse_scope.py](../../backend/common/warehouse_scope.py)؛ رفتار فعلی حفظ می‌شود ولی از یک منبع.

**۳-۶ (پس از تأیید)** — [reports.ts:146-160](../../frontend/src/app/components/reports/reports.ts): فیلترها از query params حذف و فقط در `localStorage` بمانند؛ URL فقط `entity`/`fields`/`sort`/`page` را نگه دارد.

### تست مرحله
- `test_unexpected_error_returns_500_without_internal_text` — mock که `FieldError('Choices are: id, warehouse_id')` بیندازد → status ۵۰۰ و نبود رشته `Choices are` در بدنه.
- `test_export_job_error_message_is_generic`.
- `test_blind_strict_when_no_warehouse_selected` — global=`open`، انبار الف=`blind`، گزارش بدون انبار → فیلد حساس در `allowed_fields` نباشد.
- `test_sensitive_bypass_excludes_view_sys_export` (مشروط به تأیید).
- `test_engine_uses_shared_warehouse_scope` — کاربر با `assigned_warehouses` خالی و پرشده، مقایسه نتیجه با helper.
- فرانت: `msg(e)` با `status=500` → پیام سرور، نه پیام آفلاین.

**دستی:** با کاربر دارای «صدور فایل تغذیه» و بدون مجوز حساس، گزارش شمارش کور بگیر → ستون موجودی فیزیکی نباید در فهرست فیلدها باشد.

---

## مرحله ۵ — درستی داده و نمایش

**هدف:** رفع خطای بازه تاریخ، قالب‌بندی عدد، و هم‌خوان کردن متن‌ها با کد.

### تغییرات
**۴-۱** — [engine.py](../../backend/reports/engine.py) `_process_filter_node` (۲۷۵-۳۹۴):
- برای فیلد `datetime` که مقدار ورودی فقط تاریخ است (بدون جزء ساعت): `lte` → `__date__lte`، `gt` → `__date__gt`، و در `between` مرز پایانی → `__date__lte`. (`eq` قبلاً درست است.)
- تشخیص «فقط تاریخ» در `_coerce_value` (~۲۳۶) با یک پرچم بازگشتی انجام شود، نه heuristic روی رشته.

**۴-۲** — [reports.ts:881-894](../../frontend/src/app/components/reports/reports.ts) `formatCell`:
- شاخه `number`: `new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 4 }).format(Number(value))`، با حذف صفرهای انتهایی و بازگشت به `String(value)` در صورت `NaN`.
- سازگاری: مقدار Decimal که به `str` آمده (`'1234.5000'`) باید `۱٬۲۳۴٫۵` شود.

**۴-۳ (گزینه ب)** — [engine.py:531](../../backend/reports/engine.py): وقتی `distinct=True` اعمال می‌شود، برچسب ستون پسوند «(متمایز)» بگیرد و در پاسخ فیلد `columns[i].distinct = true` برگردد؛ فرانت آیکون/tooltip توضیحی نشان دهد.

**۵-۱** — یک ثابت مشترک: `CHART_GROUP_LIMIT` در [report-chart.component.ts](../../frontend/src/app/components/reports/report-chart.component.ts) export شود؛ `fetchChartRows()` در [report-store.ts:305-332](../../frontend/src/app/components/reports/report-store.ts) همان مقدار را به‌عنوان `page_size` بفرستد؛ بنر [reports.html:549](../../frontend/src/app/components/reports/reports.html) از همان ثابت بخواند. حذف بنر تکراری.

**۵-۲** — متن [reports.html:838](../../frontend/src/app/components/reports/reports.html) به «۱۰٬۰۰۰ ردیف» اصلاح شود (هم‌راستا با `SYNC_ROW_LIMIT`). بهتر: مقدار از پاسخ `meta` سرور بیاید تا دیگر واگرا نشود.

**۵-۵** — [reports.ts:407-416](../../frontend/src/app/components/reports/reports.ts) `visibleJoinFields`: `label` از عنوان فارسی JoinDef (`joinsMeta().find(j => j.key === …)?.label`) ساخته شود، نه alias خام.

### تست مرحله
- `test_datetime_lte_includes_last_day` (از مرحله ۰) → سبز؛ به‌علاوه `test_datetime_between_inclusive_end`.
- `test_count_distinct_column_flag` — وجود `distinct: true` و پسوند برچسب.
- فرانت: `formatCell` روی `'1234.5000'`, `0`, `null`, `'abc'`.
- فرانت: `fetchChartRows` باید `page_size === CHART_GROUP_LIMIT` بفرستد.

**دستی:** بازه تاریخ «از ۱ مرداد تا ۳۰ مرداد» روی فیلد «زمان ایجاد» → رکوردهای ۳۰ مرداد باید دیده شوند. ستون موجودی باید `۱٬۲۳۴٫۵` نشان دهد.

---

## مرحله ۶ — UX، دسترس‌پذیری و تمیزکاری

**هدف:** رفتار درست در آفلاین، قفل نشدن UI، مودال‌های استاندارد، حذف hackهای زمانی، تکمیل پوشش تست.

### تغییرات
**۲-۶** — [reports.ts:191-224](../../frontend/src/app/components/reports/reports.ts) `restoreStateAndRun`:
- افزودن `if (this.store.isOffline()) { toast.info('اتصال برقرار نیست؛ گزارش بازیابی شد ولی اجرا نشد.'); return; }`
- افزودن `if (!this.validateReportSpec()) return;`
- ثبت یک `effect` روی `NetworkStatusService` که با برگشت اتصال، اجرای معلق را یک‌بار انجام دهد (پرچم `pendingAutoRun`).
**۶-۴** — حذف `setTimeout(50)` و `setTimeout(100)`: `_loadJoinTargetFields` یک `Observable` برگرداند و اجرای گزارش با `forkJoin([...]).subscribe()` زنجیره شود (هم در `restoreStateAndRun` و هم `loadTemplate`).
**۲-۷** — [report-store.ts:127-134](../../frontend/src/app/components/reports/report-store.ts): حذف `setTimeout(600)`؛ `isRefreshing` مستقیم با اتمام درخواست‌ها پایین بیاید. در [reports.html:125](../../frontend/src/app/components/reports/reports.html) کلاس `pointer-events-none` فقط به بخش نتایج/نمودار محدود شود، نه کل سازنده.
**۵-۹** — هر دو مودال در [reports.html](../../frontend/src/app/components/reports/reports.html): `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + بستن با `Escape` (`(keydown.escape)`) + focus روی اولین کنترل هنگام باز شدن و بازگشت focus به دکمه فراخوان هنگام بستن. اگر دایرکتیو مشترکی در `shared/` هست از آن استفاده شود، وگرنه ساده و محلی پیاده شود.
**۶-۳** — حذف کد بی‌مصرف باقی‌مانده (اگر پس از مرحله ۳ چیزی بی‌مصرف ماند).
**۶-۵** — تکمیل تست‌های نبود پوشش: HAVING روی alias فیلد JOIN، `export_queryset` با کوئری سنگین، مسیر EXISTS، صفحه‌بندی گروهی (بخشی در مراحل قبل انجام شده؛ اینجا فقط بازبینی پوشش).

### تست مرحله
- فرانت: `restoreStateAndRun` در حالت آفلاین → `runReport` صدا زده نشود، toast اطلاع داده شود.
- فرانت: با برگشت اتصال → اجرای یک‌باره (نه تکراری).
- فرانت: `isRefreshing` بلافاصله پس از اتمام دو درخواست `false` شود.
- فرانت: `Escape` روی مودال ذخیره قالب → بسته شود و focus برگردد.
- بک‌اند: `test_having_on_join_field_alias`، `test_export_queryset_heavy_query_has_timeout`.

**دستی:** سرور را قطع کن (یا حالت آفلاین مرورگر) و لینک گزارش را باز کن → پیام آرام، بدون بنر خطای قرمز؛ با وصل شدن، گزارش خودش اجرا شود.

---

## دستورهای اجرای تست (برای کاربر)

بک‌اند — کل سوئیت گزارش‌ساز:
```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python manage.py test reports -v 2
```

فرانت‌اند — تست واحد:
```bash
cd "E:/warehouse project/frontend" && npx ng test --watch=false --browsers=ChromeHeadless
```

فرانت‌اند — بیلد کنترلی:
```bash
cd "E:/warehouse project/frontend" && npx ng build --configuration production
```

worker خروجی (برای تست مرحله ۳ در محیط واقعی):
```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python manage.py run_export_worker
```

---

## ترتیب و ریسک

| مرحله | ریسک | برگشت‌پذیری |
|---|---|---|
| ۱ | متوسط — قلب موتور کوئری | commit مستقل؛ `git revert` کافی است |
| ۲ | کم — افزودنی (`label` اختیاری) | قالب‌های ذخیره‌شده قدیمی دست‌نخورده کار می‌کنند |
| ۳ | متوسط — تغییر چرخه job | تست با worker خاموش و روشن الزامی |
| ۴ | بالا در مورد ۳-۳ | مشروط به تأیید کاربر؛ قابل جدا کردن به commit مستقل |
| ۵ | کم | فقط نمایش و مرز تاریخ |
| ۶ | کم | UX |

**سازگاری قالب‌های ذخیره‌شده:** هیچ مرحله‌ای ساختار `spec` را به‌شکل ناسازگار تغییر نمی‌دهد؛ `label` افزودنی اختیاری است و حذف فیلترها از URL روی `ReportTemplate` اثری ندارد. مهاجرت DB لازم نیست مگر برای مورد ۲-۲ (افزودن `heartbeat_at` به سریالایزر — فیلد از قبل در مدل هست، پس migration ندارد).

</div>
