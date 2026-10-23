# walkthrough — فاز ۰: نصب حصار پیش از هر تغییر رفتاری

<div dir="rtl" align="right">

مرجع طرح: `implementation_plan_modular_split.md` — بخش ۶ و ۷
وضعیت فاز: **تکمیل و تایید نشده از سمت کاربر** (چند تصمیم قضاوتی نیازمند اطلاع کاربر است — به «نکات نیازمند تایید» انتهای همین سند مراجعه کنید)

---

## هدف فاز

هیچ خط منطقی عوض نشود؛ فقط ابزار سنجش مرز ساخته شود تا از این لحظه به بعد هر پس‌رفت مرزبندی ماژولی دیده شود. خروجی نهایی فاز: اجرای `lint-imports`، ثبت عدد نقض به‌عنوان مبنا، و سبز ماندن هر تست موجود.

## تحویل‌ها (تسک‌های ۱ تا ۵)

| تسک | تحویل | مسیر | وضعیت |
|---|---|---|---|
| ۱ | `pyproject.toml` اعلام سه توزیع + جدول مالکیت | `pyproject.toml` (ریشه) | ✅ |
| ۲ | `.importlinter` با قراردادهای C1–C4 گزارش‌محور | `.importlinter` (ریشه) | ✅ |
| ۳ | اجرای `lint-imports` و ثبت snapshot مبنا | `scripts/e2e/modularization_baseline.json` | ✅ |
| ۴ | ایجنت نگهبان ۲۹ با آچار یک‌طرفه | `scripts/e2e/guardian_modularization.py` | ✅ |
| ۵ | تایید عدم رگرسیون (جزئیات پایین) | — | ✅ |

---

## قراردادهای نصب‌شده (از این لحظه الزامی)

قراردادهای وابستگی در `.importlinter` تعریف شده‌اند و نگهبان ۲۹ آن‌ها را مستقیماً می‌خواند (بدون تکرار تعریف در کد). هر افزایش شمارنده = شکست نگهبان ۲۹.

- **C1 — لایه‌بندی:** `config` (ریشهٔ ترکیب) → لایهٔ ماژول‌ها (`warehouses/inventory/reports/personnel`) → لایهٔ پلتفرم (`accounts/common/communications/notifications`). پلتفرم هرگز رو به بالا ایمپورت نمی‌کند.
- **C2 — استقلال ماژول‌ها (دوطرفه):** انبار هرگز حسابداری را ایمپورت نمی‌کند و برعکس. (به‌دلیل محدودیت نوع قرارداد `independence` در import-linter — که ایمپورت بین *همهٔ* اعضای فهرست را در هر جهت ممنوع می‌کند — به‌جای یک قرارداد، دو قرارداد `forbidden` متقارن ساخته شد تا یال مشروع `inventory → warehouses` خطا نگیرد.)
- **C3 — پاکی هسته:** هستهٔ پلتفرم هیچ‌گاه نام هیچ ماژولی را نمی‌شناسد.
- **C4 — استثنای مهارشده:** بخش `[wh-c4-allowlist]` (غیر از پیشوند `importlinter:` تا کتابخانه نادیده بگیردش). تنها شکل مجاز استثنا: ایمپورت تنبل درون تابع + گارد `apps.is_installed(...)`. نگهبان ۲۹ آن را با تحلیل AST راستی‌آزمایی می‌کند. در فاز ۰ عمداً خالی است.

## snapshot مبنای ثبت‌شده (فاز ۰ — نقطهٔ مرجع)

```
unique_direct_violations        = 33
production_violations           = 13
non_production_violations       = 20
composition_root_hardcoded_lines = 9
contract:c1-layering            = 28
contract:c2-warehouse-indep-of-accounting = 0
contract:c2-accounting-indep-of-warehouse  = 5
contract:c3-core-purity         = 23
```

اجرای `lint-imports`: **در فاز ۰ حالت report-only است** — ۱ قرارداد سالم (C2 الف) و ۳ قرارداد شکسته (C1, C2 ب, C3) که عمدی و مطابق وضعیت فعلی مونولیت است. کد خروجی ۱ِ این ابزار در فاز ۰ «شکست» نیست؛ دروازهٔ واقعی نگهبان ۲۹ است.

### ۱۳ نقض تولیدی (هدف فازهای بعدی)

همگی مطابق فهرست موانع طرح §۵:

| ایمپورت‌کننده | سطر | مقصد |
|---|---|---|
| `accounts.audit_utils` | 115, 121 | `warehouses.models` |
| `accounts.excel_utils` | 16 | `warehouses.models` |
| `accounts.management.commands.setup_project` | 5 | `warehouses.models` |
| `accounts.rollback_service` | 151, 154 | `inventory.models` |
| `accounts.rollback_service` | 160 | `warehouses.models` |
| `accounts.serializers` | 5 | `warehouses.models` |
| `communications.consumers` | 79 | `warehouses.services` |
| `communications.models` | 6 | `warehouses.models` |
| `communications.permissions` | 33 | `warehouses.services` |
| `communications.views` | 528 | `warehouses.models` |
| `communications.views` | 42 | `warehouses.services` |

### وابستگی ریشهٔ ترکیب به نام ماژول‌ها (باید در فاز ۳ به صفر برسد)

- `config/settings.py`: ۴ سطر `[56, 57, 59, 60]`
- `config/urls.py`: ۵ سطر `[3, 20, 21, 22, 23]`
- `config/asgi.py`: ۰ سطر

---

## یافتهٔ جدید (در فهرست موانع طرح نیست)

نگهبان ۲۹ علاوه بر فهرست موانع طرح، دو ایمپورت رو به بالا را آشکار کرد که در §۵ طرح ثبت نشده بودند:

- `personnel.phase_guardian_approval → config.views_backup` (سطرهای ۲۷۱۰ و ۳۰۲۲) — ایمپورت از ماژول حسابداری به ریشهٔ ترکیب.
- `communications.tests.test_presence / test_ws_access / test_ws_comments → config.asgi` — ایمپورت تستی به ریشهٔ ترکیب (غیرتولیدی).

این دو در دستهٔ غیرمستقیم/تستی طبقه‌بندی شده‌اند و در شمارندهٔ تولیدی نیفتاده‌اند، ولی برای حفظ استقلال ماژول‌ها باید در فازهای بعدی دیده شوند.

---

## تصمیم‌های قضاوتی (نیازمند تایید کاربر)

1. **نام چتر `wh-suite`**: PEP 621 اجازهٔ اعلام سه توزیع در یک جدول `[project]` را نمی‌دهد، پس برای رعایت تسک id 1 («در توسعه همه کنار هم نصب») یک بستهٔ چتر **فقط توسعه** به نام `wh-suite` با کلاسیفایر `Private :: Do Not Upload` ساخته شد تا `pip install -e ".[dev]"` هر سه ماژول را کنار هم نگه دارد. فاز ۷ این چتر را با سه `pyproject.toml` واقعی جایگزین می‌کند.
2. **نصب `import-linter==2.3` در venv پروژه**: برای اجرای `lint-imports` لازم بود (کشید `grimp 3.17` و `click 8.5.0`). به تولیدی `requirements.txt` اضافه نشد؛ فقط در `[project.optional-dependencies] dev` ثبت شد.
3. **الزام `PYTHONUTF8=1`**: فایل‌های `.importlinter` و `pyproject.toml` حاوی کامنت فارسی‌اند؛ روی ویندوز اگر با کدک locale (cp1252) خوانده شوند خطای charmap می‌دهند. نگهبان ۲۹ خودش این متغیر را ست می‌کند و بی‌وقفه کار می‌کند؛ فقط اجرای دستی `lint-imports` نیازمند `PYTHONUTF8=1` است (در ابتدای `.importlinter` مستند شده).
4. **شمارش یال‌های مستقیم**: نگهبان برای پایداری و نسبت‌دادن به فایل/سطر، یال‌های مستقیم را در سطح `(ایمپورت‌کننده، ایمپورت‌شده، سطر)` می‌شمارد نه زنجیره‌های غیرمستقیم (جلوگیری از دوباره‌شماری و غیرقابل‌ردیابی بودن). این «نقض مستقیم» است و با خروجی «تحلیل ۲۵۳ فایل، ۳۲۰ وابستگی»ِ `lint-imports` همتاست ولی نه عدداً یکسان.

---

## تأیید عدم رگرسیون (تسک ۵)

- ⚪ نگهبان ۲۹ برای دومین بار اجرا شد و **هر شمارنده بدون تغییر (⚪)** در برابر snapshot مبنا بود → آچار یک‌طرفه پایدار است.
- ✅ `python manage.py check` → «System check identified no issues (0 silenced)».
- ✅ `python manage.py makemigrations --check --dry-run` → «No changes detected».
- ✅ فاز ۰ هیچ کدی به پروژهٔ Django اضافه نکرد (فقط فایل‌های پیکربندی ریشه + یک اسکریپت زیر `scripts/e2e/`)؛ بنابرین مهاجرت‌ها و سطح دیتابیس دست‌نخورده‌اند.

> **اجرای سنگین کامل تست فعلاً به دست کاربر سپرده می‌شود** (رویهٔ خانه: بیلد/تست/ری‌استارت روتین را کاربر اجرا می‌کند). برای تکمیل سند فوق، این دو اجرا لازم است:

```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python.exe manage.py test accounts personnel warehouses inventory reports communications
```

```bash
cd "E:/warehouse project" && "E:/warehouse project/backend/venv/Scripts/python.exe" scripts/e2e/guardian_all.py
```

پس از سبز شدن این دو، فاز ۰ به‌صورت کامل «تایید» می‌شود و این سند به‌روزرسانی می‌گردد.

---

## استقبالِ فاز بعدی

فاز ۱ «آزادسازی هستهٔ تنظیمات و کانفیگ بوت از اپ انبار» (تسک‌های ۶ تا ۱۶) — گام اول جداسازی واقعی است و فقط پس از درخواست صریح کاربر آغاز می‌شود. معیار خروج فاز ۰ به‌خوبی محقق شده است: حصار نصب است، عدد نقض ثبت شده است، و هیچ تغییری در وضعیت Django ایجاد نشده است.

</div>
