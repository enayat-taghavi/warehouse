<div dir="rtl" align="right">

# 🚀 گزارش جامع پیاده‌سازی و آزمون‌های خودکار بک‌اند کارتابل مالی (Financial Cartable Backend Cycle)

این گزارش نتایج پیاده‌سازی، معماری و اجرای موفقیت‌آمیز **چرخه کامل بک‌اند کارتابل مالی (`DocTask`)** با انطباق ۱۰۰٪ با چرخه انبارگردانی فیزیکی را تشریح می‌کند. کلیه ۳۰ آزمون خودکار سیستم (شامل ۱۵ تست کارتابل مالی و ۱۵ تست انبارگردانی) با موفقیت ۱۰۰٪ پاس شدند.

---

## 🏗️ خلاصه معماری و تغییرات کلیدی اعمال‌شده

1. **تاریخچه‌نگاری مبتنی بر اسنپ‌شات داده‌ها (Audit Trail Snapshots):**
   - افزودن فیلد `data_snapshot = models.JSONField(null=True, blank=True)` به مدل `DocTaskHistory` در [`models.py`](file:///e:/warehouse%20project/backend/inventory/models.py).
   - ایجاد و اعمال میگریشن فوروارد [`0025_doctaskhistory_data_snapshot.py`](file:///e:/warehouse%20project/backend/inventory/migrations/0025_doctaskhistory_data_snapshot.py).
   - ثبت خودکار اسنپ‌شات کامل فیلدهای مالی و فیلدهای پویای کالا در تمام متدهای تغییر وضعیت (`perform_update`, `bulk_submit`, `bulk_approve`, `reject`, `manager_reject`, `bulk_manager_approve`).

2. **همگام‌سازی قطعی با جدول کالا (`Item` Master Record):**
   - در متد `bulk_manager_approve` در [`views.py`](file:///e:/warehouse%20project/backend/inventory/views.py)، کلیه فیلدهای مالی تاییدشده (مبالغ، تاریخ، نوع فاکتور، تامین‌کننده، نوع ارز، شماره‌های RTI، مهر و امضا) به صورت دسته‌ای روی رکورد اصلی کالا رونویسی و وضعیت کالا به `doc_status = 'approved'` تبدیل می‌شود.

3. **اصلاح بررسی ارجاع مجدد اسناد:**
   - شرط هشدار ارجاع مجدد در `bulk_assign` برای پوشش وضعیت `doc_status == 'processing'` اصلاح گردید.

---

## 🧪 ماتریس کامل ۱۵ سناریوی آزمون بک‌اند کارتابل مالی (`inventory.tests_docs`)

| # | عنوان سناریو | هدف و جریان آزمون | نتیجه |
| :-: | :--- | :--- | :-: |
| **۱** | `test_01_full_happy_path_with_supervisor` | چرخه استاندارد کامل: ارجاع $\rightarrow$ تکمیل فیلدها توسط کارشناس $\rightarrow$ تایید سرپرست $\rightarrow$ تایید نهایی مدیر $\rightarrow$ همگام‌سازی قطعی با کالا | ✅ **PASSED** |
| **۲** | `test_02_unlimited_manager_rejects_and_corrections` | رد مکرر مدیر برای ۴ دور متوالی، ارجاع سرپرست، اصلاحات کارشناس و تایید نهایی با ثبت تاریخچه اسنپ‌شات‌ها | ✅ **PASSED** |
| **۳** | `test_03_direct_to_manager_skip_supervisor` | ارجاع با پرش از سرپرست (`skip_supervisor=True`) و ارسال مستقیم کارشناس به مدیر بدون دخالت سرپرست | ✅ **PASSED** |
| **۴** | `test_04_pool_tasks_and_claim` | تخصیص به استخر عمومی اسناد، استعلام استخر و Claim تسک توسط کارشناس مالی و به‌روزرسانی `doc_assignee` کالا | ✅ **PASSED** |
| **۵** | `test_05_manager_rejection_with_notes_and_snapshot` | رد مدیر همراه با یادداشت و ثبت دقیق اسنپ‌شات داده‌ها در تاریخچه | ✅ **PASSED** |
| **۶** | `test_06_bulk_cancel_doc_tasks` | لغو دسته‌ای تسک‌های مالی در انتظار، حذف تسک‌ها و بازنشانی وضعیت کالا | ✅ **PASSED** |
| **۷** | `test_07_doc_field_permissions_sync` | پایش اعمال و کش تنظیمات فیلدهای مالی در سطح سیستم و انبار | ✅ **PASSED** |
| **۸** | `test_08_dynamic_extra_fields_saving` | ثبت و پایداری فیلدهای پویا در `Item.dynamic_data` و تاریخچه تسک مالی | ✅ **PASSED** |
| **۹** | `test_09_concurrency_and_claim_conflict` | ممانعت از Claim همزمان یک تسک مالی توسط دو کارشناس مختلف | ✅ **PASSED** |
| **۱۰** | `test_10_redispatch_with_force_flag` | ارجاع مجدد تسک مالی با اخطار در حالت عادی و عبور با `force=True` | ✅ **PASSED** |
| **۱۱** | `test_11_financial_precision_and_zero_values` | تست مبالغ بزرگ با دقت اعشاری (تا ۲۰ رقم و ۲ رقم اعشار) و تفکیک صفر واقعی از خالی | ✅ **PASSED** |
| **۱۲** | `test_12_supervisor_pool_and_claim` | ورود به استخر سرپرستان در صورت عدم تعیین سرپرست اولیه و Claim توسط سرپرست | ✅ **PASSED** |
| **۱۳** | `test_13_resolution_after_rejection` | تایید نهایی تسک رد شده پس از اصلاح فاکتور توسط کارشناس و بستن چرخه | ✅ **PASSED** |
| **۱۴** | `test_14_soft_delete_handling` | عدم نمایش و تفکیک تسک‌های کالاهای حذف‌نرم‌شده (`is_deleted=True`) | ✅ **PASSED** |
| **۱۵** | `test_15_persistence_and_sync_to_item` | راستی‌آزمایی پایداری کامل تمامی ۱۴ فیلد مالی روی مدل اصلی کالا (`Item`) | ✅ **PASSED** |

---

## 📊 لاگ رسمی اجرای آزمون‌های رگرسیون کامل (۳۰ تست)

```bash
.\venv\Scripts\python.exe manage.py test inventory.tests inventory.tests_docs --noinput
```

```text
Creating test database for alias 'default'...
Found 30 test(s).
System check identified no issues (0 silenced).
..............................
----------------------------------------------------------------------
Ran 30 tests in 37.172s

OK
Destroying test database for alias 'default'...
```

---

> [!TIP]
> تمامی ۳۰ آزمون خودکار در فایل‌های [`inventory/tests.py`](file:///e:/warehouse%20project/backend/inventory/tests.py) و [`inventory/tests_docs.py`](file:///e:/warehouse%20project/backend/inventory/tests_docs.py) به عنوان تست‌های استاندارد و دائمی سامانه ثبت و نگهداری می‌شوند.

</div>
