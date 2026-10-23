# walkthrough — فاز ۳: رجیستری قابلیت‌ها در بک‌اند

<div dir="rtl" align="right">

مرجع طرح: `implementation_plan_modular_split.md` — بخش ۳
وضعیت فاز: **تکمیل شده، رجیستری نصب و مونولیت سالم** (بوتِ کامل حسابداری‌تنها به کوپلینگ فاز ۴ برمی‌خورد — به «نکات نیازمند تایید» مراجعه کنید)

---

## هدف فاز

قلب طرح: از این نقطه به بعد هیچ فایل هسته‌ای (platform) نام هیچ ماژولی را سخت‌کد نمی‌کند؛ همه‌چیز از رجیستری پرسیده می‌شود. معیار خروج: `installed_modules` صحیح باشد و درخواست به پیشوند ماژول نصب‌نشده ۴۰۴ برگرداند (نه ۴۰۳).

## تحویل‌ها (تسک‌های ۲۷ تا ۳۵)

| تسک | تحویل | مسیر | وضعیت |
|---|---|---|---|
| ۲۸ | رجیستری `ModuleSpec` + `register_module`/`installed_modules`/`module_for_path` + توابع کمکی | `platform_core/registry.py` | ✅ |
| ۲۹ | کاتالوگ ماژول‌ها + ثبت خودکار در `ready()` | `platform_core/module_catalog.py` + `warehouses/apps.py` + `personnel/apps.py` | ✅ |
| ۳۰ | بازنویسی `enforce_token_app_scope` با `module_for_path` | `accounts/authentication.py` | ✅ |
| ۳۱ | **۴۰۴ (نه ۴۰۳)** برای ماژول نصب‌نشده | `accounts/authentication.py` + `known_module_for_path` | ✅ |
| ۳۲ | بازنویسی `get_user_allowed_apps` و `get_user_valid_roles_for_app` | `accounts/middleware.py` | ✅ |
| ۳۳ | رفع دوحالتگی `active_app` | `accounts/middleware.py:221` + `_resolve_active_app` | ✅ |
| ۳۴ | پویاسازی `APP_MODULE_CHOICES` (حفظ `'personnel'` + alias `'accounting'`) | `accounts/models.py` + `accounts/migrations/0036` | ✅ |
| ۳۵ | `INSTALLED_APPS`/`urls.py` از رجیستری + `WH_MODULES` | `config/settings.py`, `config/urls.py` | ✅ |

---

## رجیستری (`platform_core/registry.py`)

`ModuleSpec` یک dataclass با فیلدهای `code`, `title_fa`, `django_apps`, `api_prefixes`, `permission_markers`, `roles`, `nav`, `ws_routes`, `url_includes`, `audit_modules`, `sod_app_module`, `pull_entities`, `requires_platform` است. توابع کلیدی:

- `register_module(spec)` — ثبت ماژول؛ ماژول‌های ممیزیِ `spec.audit_modules` را هم در رجیستری هسته ثبت می‌کند.
- `installed_modules()` — فهرست کدهای ماژول‌های نصب‌شده.
- `module_for_path(path)` — یافتن ماژولِ نصب‌شدهٔ مالکِ مسیر.
- `known_module_for_path(path)` — یافتن ماژولِ شناخته‌شدهٔ کاتالوگ (حتی نصب‌نشده)؛ زیربنای ۴۰۴.
- پلِ سازگاری: `app_code_to_module`, `module_allowed_app_code`, `module_scope_codes`, `app_code_for_sod`, `default_module`.

پلِ سازگاری برای حفظ قرارداد قدیمی توکن/هدر است: کدهای `'warehouse'`/`'finance'`/`'personnel'` (که فرانت‌اند می‌خواند) به کدهای ماژولِ رجیستری (`'warehouse'`/`'accounting'`) نگاشت می‌شوند. برای SoD، کد `'accounting'` به `'personnel'` نرمال می‌شود (`sod_app_module`).

## کاتالوگ ماژول‌ها و ثبت (تسک ۲۹)

`platform_core/module_catalog.py` — منبع واحد مشخصات هر ماژول:

- **`WAREHOUSE_SPEC`**: `code='warehouse'`, `django_apps=(warehouses, inventory, reports)`, `api_prefixes=('api/warehouses/','api/inventory/','api/reports/')`, `roles=(counter, warehouse_supervisor, docs_specialist, manager_review, superuser)`, `url_includes=(...)`, `audit_modules=(docs, dispatch, customs, feeding, labels, counter, supervisor, manager)`.
- **`ACCOUNTING_SPEC`**: `code='accounting'`, `django_apps=(personnel,)`, `api_prefixes=('api/personnel/',)`, `roles=(operator, supervisor, accountant, manager, treasury, superuser)`, `url_includes=(...)`, `audit_modules=(attendance, fleet, payroll, treasury, projects, invoices)`, `sod_app_module='personnel'`.

ثبت در `WarehousesConfig.ready()` و `PersonnelConfig.ready()` با `register_module(SPEC)` انجام می‌شود. (کشف از entry point گروه `wh.module` برای توزیع‌های بسته‌بندی‌شده — فاز ۷ — است؛ در مونولیت، ثبت در `ready()` سازوکار زمان اجرا است.)

## احراز هویت — ۴۰۳ در برابر ۴۰۴ (تسک ۳۰ و ۳۱)

`accounts/authentication.py`: زنجیرهٔ `if path.startswith(...)` با `module_for_path(path)` جایگزین شد:

1. اگر مسیر به ماژولِ **نصب‌شده** تعلق دارد ولی قلمرو کاربر کافی نیست → **۴۰۳** (`PermissionDenied`، با ثبت `AuditLog` و `details.event='CROSS_APP_DENIED'` — حفظ شد).
2. اگر مسیر به ماژولِ **شناخته‌شدهٔ نصب‌نشده** تعلق دارد → **۴۰۴** (`NotFound`، قانون ۵ — افشا نکردن ماژول نصب‌نشده).
3. استثنای GET/HEAD/OPTIONS روی `api/warehouses/` عیناً حفظ شد.
4. مسیرِ غیرماژول (مثل `settings`) بدون محدودیت.

## میدل‌ور و SoD (تسک ۳۲، ۳۳، ۳۴)

- `get_user_allowed_apps` — از `spec.permission_markers` هر ماژول نصب‌شده؛ خروجی همان کدهای قدیمی `'warehouse'`/`'finance'`.
- `get_user_valid_roles_for_app` — کد (ماژول یا قدیمی) را به ماژول رجیستری نرمال می‌کند؛ نقش‌های سوپریوزر از `spec.roles`؛ اشتقاق نقش‌ها حفظ شد.
- `_resolve_active_app` — دوحالتگی `'warehouse' if raw_app=='warehouse' else 'personnel'` را با نگاشت به ماژول نصب‌شده و `default_module()` رفع می‌کند.
- `accounts/permissions.py` — کد `app` را برای جستجوی SoD به `app_code_for_sod` نرمال می‌کند (`'accounting'`→`'personnel'`).
- `SoDPolicyRule.get_app_module_choices()` — پویا از رجیستری؛ کد `'personnel'` عیناً حفظ و `'accounting'` به‌عنوان alias اضافه می‌شود (مایگریشن `0036` — no-op).

## ساخت کانفیگ از رجیستری (تسک ۳۵)

- **`INSTALLED_APPS`** (`config/settings.py`): اپ‌های پایهٔ پلتفرم + اپ‌های ماژول‌های نصب‌شده از `MODULE_CATALOG[code].django_apps`. متغیر محیطی `WH_MODULES` برای پروفایل‌های تک‌ماژولی (پیش‌فرض همه).
- **`config/urls.py`**: مسیرهای ماژول‌ها از `spec.url_includes` هر ماژول نصب‌شده ساخته می‌شوند؛ در نصب بدون ماژول، پیشوند URL آن روت نمی‌شود.
- **`config/asgi.py`**: بدون تغییر — هر دو روت وب‌سوکت (`notifications`,`communications`) پلتفرمی‌اند و `ws_routes` ماژول‌ها فعلاً خالی است.

## راستی‌آزمایی (همه سبز)

- 🛡️ **نگهبان ۲۹ → PASS** — `composition_root_hardcoded_lines`: **۹ → ۰** (دقیقاً هدف فاز ۳؛ settings/urls/asgi دیگر نام هیچ ماژولی ندارند). `production_violations` = ۱۰.
- 🛡️ **نگهبان ۳۰ → PASS** و **نگهبان ۳۲ → PASS** (عدم پس‌رفت فازهای ۱، ۲).
- ✅ `manage.py check` → بدون خطا؛ `makemigrations --check --dry-run` → «No changes detected».
- ✅ منطق `enforce_token_app_scope` (۴۰۳/۴۰۴/استثنای GET) با mock راستی‌آزمایی شد.
- ✅ سناریوی حسابداری‌تنها (adhoc بدون communication): `installed_modules = ('accounting',)`، `manifest = ['platform','accounting']`، `module_for_path('/api/inventory/') = None`، `known_module_for_path = warehouse` (→ ۴۰۴).

---

## نکات قضاوتی (نیازمند تایید کاربر)

1. **آرایش اپ‌ها پلتفرم-اول شد.** `INSTALLED_APPS` حالا به‌صورت اپ‌های پایهٔ پلتفرم + اپ‌های ماژول است (به‌جای ترتیب درهم‌مخلوط قبلی). چون Django در فاز ۱ `populate` همهٔ AppConfigها را قبل از import مدل‌ها بارگذاری می‌کند، وابستگی `communications → warehouses.models` (که تا فاز ۴ هست) با این آرایش نشکست (با `manage.py check` تأیید شد).

2. **بوتِ کامل حسابداری‌تنها تا فاز ۴ ممکن نیست.** `communications` (که پلتفرمی است) هنوز در `models.py` از `warehouses.models` ایمپورت ماژول‌سطح دارد؛ در نصب بدون انبار این ایمپورت می‌شکند. این دقیقاً همان کوپلینگی است که **فاز ۴** آن را برمی‌چیند. لذا معیار خروج فاز ۳ در سطح رجیستری تأیید شد (manifest و `module_for_path`)، ولی بوتِ کاملِ پروفایل به فاز ۴/۷ موکول است.

3. **کشف entry point گروه `wh.module` به فاز ۷ موکول شد.** در مونولیت، ثبت در `ready()` سازوکار زمان اجراست؛ کشف entry point برای توزیع‌های بسته‌بندی‌شده (فاز ۷) است و فعلاً entry point‌ای تعریف نشده.

4. **`platform_core` به `.importlinter` اضافه شد** (`root_packages`, لایهٔ پلتفرم C1, source_modules در C3) تا به‌عنوان پلتفرم شناخته شود.

---

## تأیید عدم رگرسیون

- ✅ `manage.py check` → «System check identified no issues (0 silenced)».
- ✅ `makemigrations --check --dry-run` → «No changes detected».
- ✅ نگهبان ۲۹ → PASS (با پیشرفت قابل توجه).
- ✅ نگهبان ۳۰ → PASS. ✅ نگهبان ۳۲ → PASS.
- ✅ مایگریشن `0036` (SoD choices) → no-op.

> **اجرای سنگین کامل تست به دست کاربر سپرده می‌شود** (رویهٔ خانه):

```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python.exe manage.py test accounts personnel warehouses inventory reports communications
```

---

## استقبالِ فاز بعدی

فاز ۴ «جدا کردن چت از دامنهٔ انبار (پرریسک‌ترین تغییر دیتابیسی)» — تسک‌های ۳۶ تا ۴۱. این فاز دو FK واقعی در `communications/models.py` را نرم می‌کند و بوتِ کامل حسابداری‌تنها را ممکن می‌سازد. تنها پس از درخواست صریح کاربر آغاز می‌شود.

</div>
