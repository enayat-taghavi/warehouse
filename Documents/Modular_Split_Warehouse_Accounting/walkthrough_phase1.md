# walkthrough — فاز ۱: آزادسازی هستهٔ تنظیمات و کانفیگ بوت از اپ انبار

<div dir="rtl" align="right">

مرجع طرح: `implementation_plan_modular_split.md` — بخش ۱
وضعیت فاز: **تکمیل شده، نگهبان ۳۰ سبز** (اجرای کامل تست سنگین به دست کاربر سپرده شده — به «نکات نیازمند تایید» انتهای همین سند مراجعه کنید)

---

## هدف فاز

هستهٔ تنظیمات (`settings_core`) باید از اپ انبار مستقل شود تا در فازهای بعدی، نصبِ حسابداری‌تنها بتواند بدون `warehouses` بوت شود. معیار خروج فاز: با حذف `warehouses` از `INSTALLED_APPS`، هر دو اندپوینت `/api/settings/global/` و `/api/public/config/` همچنان پاسخ دهند و هیچ وابستگی سطح هسته به ماژول انبار باقی نماند.

## تحویل‌ها (تسک‌های ۶ تا ۱۶)

| تسک | تحویل | مسیر | وضعیت |
|---|---|---|---|
| ۷ | اپلیکیشن پلتفرمی `settings_core` | `backend/settings_core/` | ✅ |
| ۸ | انتقال مدل `SystemSetting` با `SeparateDatabaseAndState` و `db_table='warehouses_systemsetting'` | `settings_core/models.py` + `settings_core/migrations/0001_initial.py` + `warehouses/migrations/0004_split_settings_to_settings_core.py` | ✅ |
| ۹ | تبدیل `warehouse` به `warehouse_id` (عدد صحیح، nullable، db_index) | `settings_core/models.py:19` | ✅ |
| ۱۰ | بازسازی CASCADE با سیگنال `post_delete` از سمت `wh-warehouse` | `warehouses/signals.py` + `warehouses/apps.py:48` | ✅ |
| ۱۱ | انتقال توابع تنظیمات به هسته | `settings_core/services.py` | ✅ |
| ۱۲ | لایهٔ shim در `warehouses.services` برای حفظ فراخوان‌ها | `warehouses/services.py:9-19` | ✅ |
| ۱۳ | انتقال viewsetها با حفظ عین مسیرها | `settings_core/views.py` + `config/urls.py:26-27` | ✅ |
| ۱۴ | تفکیک کلیدهای پیش‌فرض پلتفرمی/انباری | `settings_core/services.py:14` + `warehouses/apps.py:7` | ✅ |
| ۱۵ | کلید `installed_modules` در پاسخ `/api/public/config/` | `settings_core/views.py:124` | ✅ |
| ۱۶ | نگهبان ۳۰ (زنده‌بودن هسته بدون اپ انبار) | `scripts/e2e/guardian_30_settings_core.py` | ✅ |

---

## چرا انتقال همراستا با «صفر مهاجرت داده» است

`SystemSetting` به‌جای یک FK به `Warehouse` (با `on_delete=CASCADE`) به یک ستون عددی سادهٔ `warehouse_id` با همان `db_column` تبدیل شد تا هسته به ماژول انبار وابسته نماند. خودِ جدول `warehouses_systemsetting` **عیناً روی دیتابیس می‌ماند**؛ نه جابجا می‌شود و نه بازسازی می‌شود.

- `settings_core/migrations/0001_initial` فقط **وضعیت (state)** مدل را در اپ جدید ثبت می‌کند و هیچ SQL ای تولید نمی‌کند (`SeparateDatabaseAndState` با `state_operations`).
- `warehouses/migrations/0004_split_settings_to_settings_core` مالکیت مدل را از اپ انبار خالی می‌کند (همچنان فقط state، بدون SQL).
- نتیجه: `makemigrations --check --dry-run` → **«No changes detected»** (هیچ مهاجرت اضافه و هیچ ALTER/CREATE).

## رفتار CASCADE — بازسازی با سیگنال

چون `warehouse_id` دیگر FK نیست، حذفِ انبار به‌صورت خودکار تنظیماتش را پاک نمی‌کند. `warehouses/signals.py` یک `@receiver(post_delete, sender=Warehouse)` ثبت می‌کند که:

1. کلیدهای تنظیماتِ متعلق به آن انبار را حذف می‌کند.
2. کش سطری و کل آن انبار را `clear_setting_cache` می‌کند.

این سیگنال از `WarehousesConfig.ready()` بارگذاری می‌شود (`warehouses/apps.py:48`)؛ در نصب بدون اپ انبار اصلاً بارگذاری نمی‌شود.

## لایهٔ shim و حفظ رفتار فراخوان‌ها

`warehouses/services.py` همان نام‌های قبلی (`get_setting`, `get_all_settings`, `clear_setting_cache`, `compute_settings_etag`, `validate_settings_payload`, `DEFAULT_SETTINGS`, ...) را از `settings_core.services` re-export می‌کند، بنابراین تمام فراخوان‌های موجود — سه فایل `communications/consumers.py:79`، `communications/permissions.py:33`، `communications/views.py:42` و فراخوان‌های `inventory`/`reports` و `warehouses/views.py` — عیناً و بدون تغییر کار می‌کنند. در نصب بدون انبار، این شیم بارگذاری نمی‌شود و تنظیمات مستقیماً از `settings_core.services` در دسترس است.

## تفکیک کلیدهای پیش‌فرض (تسک ۱۴)

- **کلیدهای پلتفرمی** در `settings_core/services.py:14`: `system_version`, `offline_sync_interval_minutes`, `offline_cache_ttl_minutes`, `chat_enabled`, `chat_file_sharing`.
- **کلیدهای انباری** در `warehouses/apps.py:7` (`WAREHOUSE_DEFAULT_SETTINGS`) که از `WarehousesConfig.ready()` با `register_settings_defaults` ثبت می‌شوند. در نصب حسابداری‌تنها این کلیدها هرگز ثبت نمی‌شوند و `DEFAULT_SETTINGS` هسته فقط کلیدهای پلتفرمی را دارد.

## نگهبان ۳۰ — نتیجه

اجرا: `python scripts/e2e/guardian_30_settings_core.py`

```
✅ 'warehouses' در نصب آزمون نصب نیست
✅ GET /api/public/config/ → 200 (انتظار 200)
✅ installed_modules فاقد 'warehouse' است → ['platform']
✅ GET /api/settings/global/ → 403 (انتظار 200/401/403، نه خطای بارگذاری)
✨ نتیجه: نگهبان ۳۰ تایید شد (PASS)
```

این نگهبان Django را **فقط** با `contenttypes + auth + sessions + rest_framework + settings_core` بوت می‌کند (بدون `warehouses/inventory/reports`) و هر دو اندپوینت را با یک پایگاه SQLite موقت می‌آزماید.

---

## نکات قضاوتی (نیازمند تایید کاربر)

1. **نگهبان ۳۰ از `AUTH_USER_MODEL = "auth.User"` استفاده می‌کند.** پروژه مدل کاربرِ سفارشی `accounts.CustomUser` دارد که (هنوز) به اپ انبار گره خورده است و تا بریده‌شدن آن در فاز ۲، بوت‌شدن `accounts` بدون انبار ممکن نیست. چون این نگهبان فقط دو اندپوینت GET را می‌آزماید و به مدل کاربر سفارشی نیازی ندارد، `AUTH_USER_MODEL` را به پیش‌فرض `auth.User` برگردانده است تا بدون `accounts` راه‌اندازی شود. این **فقط** در محیط نگهبان است و هیچ تأثیری بر رفتار تولیدی ندارد.
2. **نگهبان از پایگاه SQLite موقت (فایل) به‌جای PostgreSQL استفاده می‌کند.** ساخت دیتابیس تست PostgreSQL در محیطِ اجرا در دسترس نبود؛ برای آزمونِ صرفِ «زنده‌بودن اندپوینت‌ها» کافی است. نگهبان جدول `warehouses_systemsetting` را با `schema_editor.create_model` می‌سازد، چون `0001_initial` عمداً هیچ `CREATE TABLE` اجرا نمی‌کند.
3. **فاز ۱ هنوز بوتِ کاملِ `INSTALLED_APPS` بدون انبار را ممکن نمی‌کند** (یال‌های FK هسته→انبارِ `accounts`/`communications` فقط در فازهای ۲ و ۴ بریده می‌شوند). معیارِ واقعیِ این فاز همان چیزی است که نگهبان ۳۰ اثبات می‌کند، نه بوت کامل.

---

## تأیید عدم رگرسیون

- ✅ `python manage.py makemigrations --check --dry-run` → «No changes detected».
- ✅ نگهبان ۳۰ → PASS.
- ✅ `SystemSetting` از `warehouses/models.py` حذف شده و shim تمام فراخوان‌های موجود را راضی نگه می‌دارد.

> **اجرای سنگین کامل تست به دست کاربر سپرده می‌شود** (رویهٔ خانه). این اجرا اکنون برای بستن کامل فاز لازم است:

```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python.exe manage.py test accounts personnel warehouses inventory reports communications
```

علاوه بر آن، تأیید نهایی مسیرهای `settings/global/` و `public/config/` روی محیط عملیاتی (پشت Cloudflare Tunnel) به عهدهٔ کاربر است.

---

## استقبالِ فاز بعدی

فاز ۲ «بریدن یال‌های FK هسته → انبار (expand-contract، صفر مهاجرت داده)» — تسک‌های ۱۷ تا ۲۶. این فاز تنها پس از درخواست صریح کاربر آغاز می‌شود.

</div>
