# walkthrough — فاز ۲: بریدن یال‌های FK هسته → انبار (expand-contract، صفر مهاجرت داده)

<div dir="rtl" align="right">

مرجع طرح: `implementation_plan_modular_split.md` — بخش ۲
وضعیت فاز: **تکمیل شده، نگهبان ۳۲ سبز** (اجرای کامل تست سنگین به دست کاربر سپرده شده — به «نکات نیازمند تایید» انتهای همین سند مراجعه کنید)

---

## هدف فاز

یال‌های FK و M2M که هستهٔ پلتفرم (`accounts`) را به ماژول انبار گره می‌زنند بریده شوند تا در فازهای بعدی، نصبِ حسابداری‌تنها ممکن شود — همه با الگوی expand-contract و **صفر مهاجرت داده**: همان جدول، همان ستون، همان ایندکس.

## تحویل‌ها (تسک‌های ۱۷ تا ۲۶)

| تسک | تحویل | مسیر | وضعیت |
|---|---|---|---|
| ۱۸ | جابجایی M2M به اپ `warehouses` روی `Warehouse` | `warehouses/models.py:35-39` | ✅ |
| ۱۹ | حذف `assigned_warehouses` از `CustomUser` + ثبت دو طرف با `SeparateDatabaseAndState` | `accounts/models.py` + `accounts/migrations/0035` + `warehouses/migrations/0005` | ✅ |
| ۲۰ | راستی‌آزمایی سلامت اکسسور `user.assigned_warehouses` | همهٔ فراخوان‌های تولیدی (admin/excel/serializers/views/warehouse_scope) | ✅ |
| ۲۱ | resolve اختیاری `Warehouse` + حذف فیلد در نصب بدون انبار | `accounts/serializers.py:9`، `accounts/excel_utils.py:19`، `accounts/admin.py` | ✅ |
| ۲۲ | انتقال `setup_project.py` به اپ انبار | `warehouses/management/commands/setup_project.py` | ✅ |
| ۲۳ | گارد `apps.is_installed` روی ایمپورت‌های تنبل | `accounts/rollback_service.py` (و حذف کامل ایمپورت از `audit_utils.py`) | ✅ |
| ۲۴ | نرم‌کردن `AuditLog.warehouse` → `warehouse_id` (همان ستون/ایندکس) | `accounts/models.py:264` | ✅ |
| ۲۵ | رجیستری `MODULE_CHOICES` + ماژول‌های حسابداری | `accounts/models.py:213` + `warehouses/apps.py` + `personnel/apps.py` | ✅ |
| ۲۶ | نگهبان ۳۲ (صفر مهاجرت داده) | `scripts/e2e/guardian_32_zero_migration.py` | ✅ |

---

## جابجایی مالکیت M2M (تسک ۱۸ و ۱۹)

**پیش از فاز ۲:** `CustomUser.assigned_warehouses = ManyToManyField('warehouses.Warehouse', related_name='assigned_users')` — یعنی یال M2M از سمت هسته به ماژول انبار.

**پس از فاز ۲:** همان M2M در اپ `warehouses` روی `Warehouse` اعلام شده است:

```python
# warehouses/models.py
assigned_users = models.ManyToManyField(
    settings.AUTH_USER_MODEL,
    related_name='assigned_warehouses',   # اکسسور قدیمی `user.assigned_warehouses` حفظ می‌شود
    blank=True,
    db_table='accounts_customuser_assigned_warehouses',   # همان جدول، با نام ثابت
)
```

- اکسسور `user.assigned_warehouses` (حالا reverse) و `warehouse.assigned_users` (forward) هر دو بدون تغییر حفظ می‌شوند.
- ستون‌های جدول M2M (`customuser_id`, `warehouse_id`) عیناً با M2M جدید سازگارند؛ هیچ داده‌ای جابجا نمی‌شود.
- **مایگریشن‌ها:** `accounts/migrations/0035` (حذف M2M از `CustomUser`، فقط state) و `warehouses/migrations/0005` (افزودن M2M به `Warehouse`، فقط state) — هر دو با `SeparateDatabaseAndState` و **no-op روی دیتابیس**.

## نرم‌کردن `AuditLog.warehouse` (تسک ۲۴)

`AuditLog.warehouse` از یک FK به `warehouses.Warehouse` با `on_delete=SET_NULL` به `warehouse_id = IntegerField(null=True, blank=True, db_index=True, db_column='warehouse_id')` تبدیل شد — **همان ستون، همان ایندکس**، بدون هیچ ALTER روی دیتابیس. ایندکس `accounts_au_warehou_2f992b_idx` (روی `warehouse_id, created_at`) در DB حفظ و در state به همان نام اشاره می‌کند.

این تغییر با `SeparateDatabaseAndState` در `accounts/migrations/0035` ثبت شده و در دیتابیس no-op است.

## رجیستری ماژول‌های ممیزی (تسک ۲۵)

`AuditLog.MODULE_CHOICES` (فهرست ثابت) به رجیستری `AUDIT_MODULES` تبدیل شد:

- **پایهٔ پلتفرم** در هسته: `users`, `warehouses`, `settings`, `system`.
- **ماژول‌های انباری** از `warehouses/apps.py` از طریق `register_audit_modules` ثبت می‌شوند: `docs`, `dispatch`, `customs`, `feeding`, `labels`, `counter`, `supervisor`, `manager`.
- **ماژول‌های حسابداری** (که امروز کلاً غایب بودند) از `personnel/apps.py` ثبت می‌شوند: `attendance`, `fleet`, `payroll`, `treasury`, `projects`, `invoices`.

فیلد `module` اکنون `choices=get_audit_module_choices` است (تابع زنده). ستون دیتابیس تغییری نمی‌کند.

## ایمپورت‌های اختیاری و گاردها (تسک ۲۱ و ۲۳)

- `accounts/serializers.py` و `accounts/excel_utils.py`: ایمپورت ماژول‌سطح `Warehouse` به resolve اختیاری از طریق `_warehouse_model()` (که `apps.is_installed('warehouses')` را می‌سنجد) تبدیل شد. در نصب بدون انبار، فیلد `assigned_warehouses` از سریالایزر **حذف** می‌شود (نه اینکه خطا بدهد)، و ستون خروجی اکسل خالی می‌ماند. `accounts/admin.py` نیز این فیلد را فقط در نصبِ دارای انبار نشان می‌دهد (وگرنه `check` با FieldError رد می‌شود).
- `accounts/rollback_service.py`: به ایمپورت‌های تنبل `Item`/`CountTask`/`Warehouse` گارد `apps.is_installed` اضافه شد تا در نصب بدون انبار به `None` برگردند.
- `accounts/audit_utils.py`: ایمپورت `Warehouse` به‌کلی حذف شد (چون `warehouse_id` حالا عدد ساده است و نیازی به resolve به شیئ انبار نیست).

## نگهبان ۳۲ — صفر مهاجرت داده

اجرا: `python scripts/e2e/guardian_32_zero_migration.py`

```
✅ sqlmigrate settings_core.0001_initial: no-op
✅ sqlmigrate warehouses.0004_split_settings_to_settings_core: no-op
✅ sqlmigrate warehouses.0005_warehouse_assigned_users: no-op
✅ sqlmigrate accounts.0035_remove_auditlog_...: no-op
✅ جدول حساس «accounts_customuser_assigned_warehouses» در SQL ظاهر نمی‌شود
✅ جدول حساس «warehouses_systemsetting» در SQL ظاهر نمی‌شود
✅ جدول حساس «accounts_auditlog» در SQL ظاهر نمی‌شود
✨ نتیجه: نگهبان ۳۲ تایید شد (PASS)
```

همهٔ مایگریشن‌های فاز ۱ و ۲ no-op هستند؛ هیچ `ALTER`/`DROP`/`CREATE`/`COPY` روی سه جدول حساس وجود ندارد، در نتیجه شمار ردیف‌ها قبل و بعد از اعمال مایگریشن‌ها یکسان می‌ماند.

## پیشرفت مرزبندی (نگهبان ۲۹)

اجرا: `python scripts/e2e/guardian_modularization.py` → **PASS**

- `unique_direct_violations`: ۳۳ → ۲۸
- `production_violations`: ۱۳ → ۱۰
- `contract:c3-core-purity`: ۲۳ → ۱۸
- `composition_root_hardcoded_lines`: ۹ → ۸

کاهش تولیدیِ این فاز عمدتاً از جابجایی `setup_project.py` به اپ انبار (حذف یال `accounts → warehouses.models`) نشأت گرفته است. ۱۰ یال تولیدی باقی‌مانده، ایمپورت‌های گارددارِ تنبل و یال‌های چت/گزارش‌ساز هستند که در فازهای ۳، ۴ و ۵ به صفر می‌رسند.

---

## نکات قضاوتی (نیازمند تایید کاربر)

1. **`accounts/admin.py` شرطی شد.** فیلد `assigned_warehouses` در ادمین کاربر فقط در نصبِ دارای اپ انبار نمایش داده می‌شود (با `apps.is_installed('warehouses')`) تا `manage.py check` در حسابداری‌تنها با `FieldError` رد نشود. این با رفتار فعلیِ نصبِ کامل تفاوتی ندارد.
2. **مایگریشن‌ها دست‌نویس و با `SeparateDatabaseAndState` بازنویسی شدند.** Django به‌صورت پیش‌فرض برای «حذف M2M + افزودن M2M» و «حذف FK + افزودن IntField» عملیات مخرب (DROP/CREATE/ALTER) تولید می‌کرد؛ این‌ها خنثی و فقط state نگه داشته شدند تا قانون «صفر مهاجرت داده» برقرار بماند.
3. **فاز ۲ هنوز بوتِ کاملِ `INSTALLED_APPS` بدون انبار را ممکن نمی‌کند** (چت در فاز ۴ و گزارش‌ساز در فاز ۵ آزاد می‌شوند؛ رجیستری در فاز ۳ ساخته می‌شود). معیارِ واقعیِ این فاز همان نگهبان ۳۲ است.
4. **بازلاین نگهبان ۲۹ به‌روز نشده است** (فقط پیشرفت ثبت‌نشده)؛ تا پایان فازهای بعدی با همان مبنا سنجیده می‌شود. اگر خواسته شود پیشرفت فعلی قفل شود، `--update-baseline` اجرا می‌شود.

---

## تأیید عدم رگرسیون

- ✅ `python manage.py check` → «System check identified no issues (0 silenced)».
- ✅ `python manage.py makemigrations --check --dry-run` → «No changes detected».
- ✅ نگهبان ۳۲ → PASS.
- ✅ نگهبان ۲۹ → PASS (پیشرفت مرز، بدون پس‌رفت).
- ✅ `sqlmigrate` برای مایگریشن‌های فاز ۱/۲ → no-op.
- ✅ اکسسور `user.assigned_warehouses` (reverse) و `warehouse.assigned_users` (forward) با متادیتای مدل راستی‌آزمایی شد؛ جدول `accounts_customuser_assigned_warehouses` حفظ شد.

> **اجرای سنگین کامل تست به دست کاربر سپرده می‌شود** (رویهٔ خانه). برای بستن کامل فاز لازم است:

```bash
cd "E:/warehouse project/backend" && ./venv/Scripts/python.exe manage.py test accounts personnel warehouses inventory reports communications
```

---

## استقبالِ فاز بعدی

فاز ۳ «رجیستری قابلیت‌ها در بک‌اند» — تسک‌های ۲۷ تا ۳۵. این فاز قلب طرح است (هیچ فایل هسته‌ای دیگر نام هیچ ماژولی را نمی‌شناسد) و تنها پس از درخواست صریح کاربر آغاز می‌شود.

</div>
