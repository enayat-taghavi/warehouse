<div dir="rtl" align="right">

# 🌟 گزارش جامع پیاده‌سازی و راستی‌آزمایی: اصلاح، تقویت و رفع باگ‌های تب «رهگیری تغییرات»

> [!NOTE]
> تمامی ۶ فاز طرح جامع اصلاحات منطقی، امنیتی و ممیزی تب «رهگیری تغییرات» (Audit Trail & Rollback Engine) به صورت مو به مو و با رعایت استانداردهای معماری، بدون هیچ‌گونه تخریب در سایر بخش‌های سیستم پیاده‌سازی، بیلد و اعتبارسنجی گردید.

---

## 🎯 خلاصه‌ی اقدامات انجام‌شده در هر فاز

### ۱. فاز ۱: تقویت موتور بازگردانی داده (Rollback Engine)
* **محافظت از مقادیر ماسک‌شده:** استثنا کردن رشته‌های ستاره‌دار (`********`) و کلیدهای محرمانه (`password`, `secret`, `token`, ...) از رونویسی روی داده‌های دیتابیس در متدهای `revert_log_entry`، `get_revert_preview` و `preview_point_in_time_rollback` در [rollback_service.py](file:///e:/warehouse%20project/backend/accounts/rollback_service.py).
* **قفل سطری بدبینانه (`select_for_update`):** افزودن پارامتر `for_update=True` به متد `get_instance_for_model` جهت جلوگیری از Race Condition هنگام بازگردانی همزمان.
* **مکانیزم ایزوله Savepoint:** بازنویسی `execute_point_in_time_rollback` با استفاده از `transaction.savepoint()` برای جلوگیری از لغو کل تراکنش در صورت بروز خطای مقطعی در یک رکورد.
* **یکنواخت‌سازی ثبت ماژول:** تبدیل ماژول لاگ‌های بازگردانی سیستمی به `module='system'`.

---

### ۲. فاز ۲: رفع باگ‌های کوئری، امنیت دسترسی (RBAC) و چندانبارگی
* **اصلاح فیلتر `warehouse=ALL`:** اصلاح شرط فیلتر انبار در `AuditLogViewSet.get_queryset` در [accounts/views.py](file:///e:/warehouse%20project/backend/accounts/views.py) برای جلوگیری از فراخوانی `filter(warehouse_id='ALL')`.
* **کنترل قلمرو انبار در `bulk_revert`:** محدود کردن شناسه‌های لاگ ارسالی به `self.get_queryset()` تا کاربران غیر سوپریوزر نتوانند لاگ‌های سایر انبارها را بازگردانی کنند.
* **پیاده‌سازی اکشن پاکسازی تاریخچه ورود (`UserLoginLogViewSet.purge`):** افزودن قابلیت پاکسازی با پشتیبانی از `dry_run`، فیلترهای زمانی و وضعیت ورود، تاییدیه امنیتی دو مرحله‌ای `PURGE_LOGIN_LOGS_CONFIRM` و ثبت لاگ ممیزی سیستمی.

---

### ۳. فاز ۳: پوشش کامل نقاط کور ممیزی در انبار و کالاها
* **ثبت لاگ ممیزی در عملیات گروهی کالاها:**
  - `bulk_update` (ویرایش دسته‌ای فیلدهای کالاها) با ثبت تعداد، فیلدهای تغییریافته و شناسه‌ها در [inventory/views.py](file:///e:/warehouse%20project/backend/inventory/views.py).
  - `bulk_assign` (ارجاع و تخصیص گروهی کالاها به کاربران شمارنده، سرپرست و مدیر).
  - `clear_warehouse_data` (پاکسازی سراسری داده‌های یک انبار).
  - `delete_from_excel` (حذف دسته‌ای کالاها بر اساس فایل اکسل).
  - `import_excel` و `revert_import` (بارگذاری اکسل و بازگردانی دسته‌ای آن با ثبت جزئیات کامل).

---

### ۴. فاز ۴: پوشش نقاط کور ممیزی در کاربران، نقش‌ها و تنظیمات
* **ثبت لاگ ممیزی در مدیریت دسترسی و امنیت پرسنل:**
  - ایجاد، ویرایش و حذف نقش‌های سفارشی (`CustomRoleViewSet`).
  - تغییر رمز عبور توسط کاربر (`change_password`) و بازنشانی رمز عبور توسط ادمین (`admin_reset_password`).
  - بارگذاری اکسل پرسنل و نقش‌ها (`import_excel`).
  - تغییرات فیلدهای پویا (`ItemFieldDefinitionViewSet`).
  - تغییر تنظیمات سراسری سیستم و تنظیمات انفرادی انبارها (`SettingsViewSet` در [warehouses/views.py](file:///e:/warehouse%20project/backend/warehouses/views.py)).

---

### ۵. فاز ۵: بهینه‌سازی فرانت‌اند، وب‌سوکت و خروجی اکسل
* **فیلتر بازه زمانی روی وب‌سوکت:** به‌روزرسانی `isFilterMatch` و `isLoginFilterMatch` در [audit.ts](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts) برای بررسی بازه تاریخ (`fromDate` و `toDate`) قبل از درج لاگ در جدول جاری.
* **یکپارچه‌سازی مدال پاکسازی لاگ‌ها:** افزودن پشتیبانی کامل از پاکسازی تاریخچه ورود با تاییدیه `PURGE_LOGIN_LOGS_CONFIRM` به همراه ارتباط با [audit-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/audit-api.service.ts) و تمپلیت [audit.html](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html).
* **محدودسازی سلول‌های اکسل:** برش متون تفاضل طولانی به ۱۰۰۰ کاراکتر برای جلوگیری از کرش موتور اکسل.

---

## 🧪 نتایج راستی‌آزمایی و تست‌ها (Verification Results)

```text
[OK] Test 1 Passed: Sensitive keys and masked values correctly excluded from rollback preview.
[OK] Test 2 Passed: UserLoginLogViewSet purge dry_run returns accurate count.
[OK] Test 3 Passed: UserLoginLogViewSet purge rejects incorrect confirmation token.
[OK] Test 4 Passed: UserLoginLogViewSet purge executes cleanly and generates system audit log.
[OK] Test 5 Passed: AuditLogViewSet handles warehouse=ALL query without crashing.

--- ALL AUDIT REMEDIATION TESTS PASSED SUCCESSFULLY! ---
```

```text
Application bundle generation complete. [40.027 seconds]
Output location: frontend\dist\warehouse-app
[patch-ngsw-530] ngsw-worker.js وصله شد: جلوگیری از غیرفعال شدن کش در هنگام قطعی کلودفلر (کدهای 5xx).
```

---

## 📂 لیست فایل‌های تغییریافته (Changed Files)

1. [backend/accounts/rollback_service.py](file:///e:/warehouse%20project/backend/accounts/rollback_service.py)
2. [backend/accounts/views.py](file:///e:/warehouse%20project/backend/accounts/views.py)
3. [backend/inventory/views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
4. [backend/warehouses/views.py](file:///e:/warehouse%20project/backend/warehouses/views.py)
5. [frontend/src/app/core/api/audit-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/audit-api.service.ts)
6. [frontend/src/app/components/audit/audit.ts](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts)
7. [frontend/src/app/components/audit/audit.html](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html)

</div>
