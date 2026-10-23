<div dir="rtl" align="right">

# گزارش جامع پایان عملیات و راستی‌آزمایی (Walkthrough) — بازنگری و اصلاحات گزارش‌ساز پویا

عملیات اجرای مو به مو و فازبندی‌شده طرح اصلاحات جامع گزارش‌ساز پویا بر اساس ۵ فاز تدوین‌شده با موفقیت ۱۰۰٪ و با تأیید ایجنت‌های نگهبان در تمام فازها به پایان رسید.

---

## ۱. خلاصه اقدامات انجام‌شده در هر ۵ فاز

### 🔹 فاز ۱: اصلاح موتور کوئری و نگاشت داده‌های JOIN در بکند
- **نگاشت کلیدهای خروجی (`source_to_key`)**: در [`engine.py`](file:///e:/warehouse%20project/backend/reports/engine.py)، تبدیل کلیدهای دیتابیسی (مانند `count_tasks_fr__status`) به کلیدهای کلاینت (`count_tasks.status`) در متد `_jsonable` و `run()` پیاده‌سازی شد.
- **انوتیشن‌های داینامیک در JOIN**: در [`registry.py`](file:///e:/warehouse%20project/backend/reports/registry.py)، توابع محاسباتی `_person_name_annotation`، `_dynamic_item_fields` و `assigned_warehouses_count` به پارامتر `base_prefix` مجهز شدند تا فیلدهای محاسباتی جداول پیوندی (مانند نام شمارشگر و سرپرست) بدون خطای `FieldError` در کوئری ساخته شوند.
- **تطابق `ORDER BY` و `DISTINCT` با PostgreSQL**: در [`engine.py`](file:///e:/warehouse%20project/backend/reports/engine.py)، تمام فیلدهای موجود در `order_by` به صورت خودکار به لیست `SELECT / values` الحاق شدند تا خطای استاندارد PostgreSQL رخ ندهد.
- **ایمن‌سازی شرط انبار در `FilteredRelation`**: مسیرهای انباری که از طریق مدل پایه هستند از شرط `ON` در `FilteredRelation` مستثنی شدند تا از خطای `missing FROM-clause entry` جلوگیری شود.
- **🛡️ نتیجه ایجنت نگهبان فاز ۱**: تایید کامل با پاس شدن تست‌های مربوط به `JoinQueryTests`.

---

### 🔹 فاز ۲: پایداری خروجی‌های PDF، Excel و Worker پس‌زمینه
- **استخراج صحیح داده‌های ستون‌های پیوندی در PDF و Excel**: در [`pdf.py`](file:///e:/warehouse%20project/backend/reports/pdf.py) و [`excel.py`](file:///e:/warehouse%20project/backend/reports/excel.py)، سلول‌ها بر اساس `c.get('source') or c['key']` از ردیف‌های بازگشتی خوانده می‌شوند.
- **رفع خطای ReportLab در گزارش‌های با ۰ ردیف**: در [`pdf.py`](file:///e:/warehouse%20project/backend/reports/pdf.py)، در صورت خالی بودن داده‌ها، استایل `ROWBACKGROUNDS` به صورت مشروط اعمال شده و یک سطر ادغام‌شده با پس‌زمینه ملایم و پیام خوانای «هیچ داده‌ای برای این گزارش یافت نشد.» تولید می‌شود.
- **کنترل تسک‌های مسموم (Poison Pill)**: فیلد `attempts` به مدل `ReportExportJob` در [`models.py`](file:///e:/warehouse%20project/backend/reports/models.py) افزوده شد و مایگریشن `0003_reportexportjob_attempts.py` اعمال گردید. در [`run_export_worker.py`](file:///e:/warehouse%20project/backend/reports/management/commands/run_export_worker.py)، در صورت `attempts >= 3` وضعیت تسک به `failed` با پیام خطای مشخص تغییر می‌کند.
- **پاکسازی فایل‌های یتیم روی دیسک**: در [`excel.py`](file:///e:/warehouse%20project/backend/reports/excel.py)، متد `cleanup_old_jobs` فایل‌های اکسل بدون رکورد و قدیمی‌تر از ۲۴ ساعت روی دیسک را اسکن و حذف می‌کند.
- **🛡️ نتیجه ایجنت نگهبان فاز ۲**: تایید کامل با قبولی تست‌های خروجی با ۰ ردیف، فایل‌های پیوندی و تسک‌های مسموم.

---

### 🔹 فاز ۳: حل مسابقه‌های زمانی و مدیریت وضعیت در Store فرانت‌اند
- **نرمال‌سازی نقطه در Aliasها**: در [`report-store.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts)، در محاسبه `aggAliases` تمام کاراکترهای نقطه (`.`) به خط تیره (`_`) تبدیل شدند.
- **حل مسابقه زمانی لود قالب‌های دارای JOIN**: در [`reports.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.ts) و [`report-store.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts)، لود فیلدهای مقصد JOIN از طریق ارسال Callback به `applyTemplate` پس از اتمام درخواست دریافت فیلدها (`getFields`) انجام شد.
- **🛡️ نتیجه ایجنت نگهبان فاز ۳**: تایید کامل با تضمین لود بدون خطای قالب‌ها.

---

### 🔹 فاز ۴: اصلاح کنترل‌های ورودی فیلترها و تجربه کاربری
- **تایپ کلمات با ویرگول در اپراتور `in`**: در [`filter-value.component.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/filter-value.component.ts)، مدیریت رشته ورودی به یک متغیر محلی (`rawListText`) منتقل شد تا تایپ مداوم ویرگول و فاصله بدون پرش انجام شود.
- **نمایش تاریخ شمسی در اینپوت تقویم**: متد `formatDateLabel` اضافه شد تا در عین ذخیره و ارسال تاریخ میلادی ایزو (`YYYY-MM-DD`) به بکند، متن داخل اینپوت به صورت فرمت استاندارد فارسی (`۱۴۰۳/۰۵/۱۵`) به کاربر نشان داده شود.
- **مهار خطاهای مداوم Polling**: در [`export-progress.component.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/export-progress.component.ts)، در صورت وقوع ۳ خطای متوالی یا خطای ۴۰۴، اشتراک اینتروال متوقف و پیام خطای مناسب نمایش داده می‌شود.
- **🛡️ نتیجه ایجنت نگهبان فاز ۴**: تایید کامل با رفع ارورهای تایپ اسکریپت و موفقیت در بیلد فرانت‌اند.

---

### 🔹 فاز ۵: تست‌های جامع خودکار و اعتبارسنجی نهایی
- **آزمون‌های خودکار بکند**: اجرای ۵۱ تست واحد و یکپارچگی در ماژول گزارش‌ساز با موفقیت ۱۰۰٪ (`OK - 51 tests in 13.006s`).
- **کامپایل کامل فرانت‌اند**: اجرای `npm run build` در `frontend` و موفقیت بیلد با صفر ارور.
- **🛡️ نتیجه ایجنت نگهبان فاز ۵**: سلامت کامل تمام بخش‌ها تایید شد.

---

## ۲. گزارش نتایج آزمون‌های خودکار (Verification Results)

```text
Creating test database for alias 'default'...
Found 51 test(s).
System check identified no issues (0 silenced).
...................................................
----------------------------------------------------------------------
Ran 51 tests in 13.006s

OK
Destroying test database for alias 'default'...
```

```text
> warehouse-app@0.0.0 build
> ng build && node tools/patch-ngsw-530.js

Application bundle generation complete. [45.122 seconds]
[patch-ngsw-530] ✔ ngsw-worker.js وصله شد: جلوگیری از غیرفعال شدن کش در هنگام قطعی کلودفلر (کدهای 5xx).
```

---

## ۳. فایل‌های ایجاد و ویرایش‌شده

| ردیف | فایل | نوع تغییر | توضیحات |
| :--- | :--- | :--- | :--- |
| ۱ | [`reports/engine.py`](file:///e:/warehouse%20project/backend/reports/engine.py) | ویرایش | نگاشت کلیدها، انوتیشن داینامیک JOIN، اصلاح DISTINCT و FilteredRelation |
| ۲ | [`reports/registry.py`](file:///e:/warehouse%20project/backend/reports/registry.py) | ویرایش | پشتیبانی از `base_prefix` در فیلدهای محاسباتی و انوتیشن‌های پویا |
| ۳ | [`reports/pdf.py`](file:///e:/warehouse%20project/backend/reports/pdf.py) | ویرایش | استخراج سلول‌ها با `source_key` و مدیریت گزارش‌های با ۰ ردیف |
| ۴ | [`reports/excel.py`](file:///e:/warehouse%20project/backend/reports/excel.py) | ویرایش | استخراج سلول‌ها با `source_key` و پاکسازی فایل‌های یتیم دیسک |
| ۵ | [`reports/models.py`](file:///e:/warehouse%20project/backend/reports/models.py) | ویرایش | افزودن فیلد `attempts` به `ReportExportJob` |
| ۶ | [`reports/migrations/0003_reportexportjob_attempts.py`](file:///e:/warehouse%20project/backend/reports/migrations/0003_reportexportjob_attempts.py) | جدید | مایگریشن جدید جنگو برای فیلد `attempts` |
| ۷ | [`reports/management/commands/run_export_worker.py`](file:///e:/warehouse%20project/backend/reports/management/commands/run_export_worker.py) | ویرایش | مدیریت تسک‌های یتیم و توقف تسک‌های مسموم بعد از ۳ بار تلاش |
| ۸ | [`reports/tests.py`](file:///e:/warehouse%20project/backend/reports/tests.py) | ویرایش | افزودن ۷ تست جدید شامل JOIN، فیلدهای محاسباتی، PDF خالی و تسک مسموم |
| ۹ | [`frontend/src/app/components/reports/report-store.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts) | ویرایش | نرمال‌سازی Aliasها و افزودن Callback به `loadFields` |
| ۱۰ | [`frontend/src/app/components/reports/reports.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.ts) | ویرایش | حل مسابقه زمانی لود قالب‌های دارای JOIN |
| ۱۱ | [`frontend/src/app/components/reports/filter-value.component.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/filter-value.component.ts) | ویرایش | رفع باگ تایپ ویرگول در اپراتور in و نمایش خوانای تاریخ شمسی |
| ۱۲ | [`frontend/src/app/components/reports/export-progress.component.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/export-progress.component.ts) | ویرایش | توقف polling در شرایط اضطراری و خطاهای متوالی |

</div>
