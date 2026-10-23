# طرح جامع پیاده‌سازی قابلیت ورود مستقیم کالای دارای اسناد تاییدشده (Pre-Approved Docs Import)

این طرح بر اساس مصاحبه فنی دقیق (`/grill-me`) با کاربر برای اضافه کردن امکان تعیین مستقیم وضعیت اسناد و مدارک مالی در زمان بارگذاری فایل اکسل به ماژول مدیریت کالا ([Docs](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.html)) تدوین شده است.

---

## ۱. خلاصه هدف و تصمیمات معماری (Executive Summary)

### هدف
امکان ورود فایل‌های اکسل برای انبارهایی که علاوه بر یا مستقل از شمارش فیزیکی، امور مالی، فاکتورها و اسناد گمرکی آن‌ها نیز نهایی و تسویه‌شده است؛ به طوری که اقلام با وضعیت تاییدشده ثبت شده و تسک شناسنامه اسناد ([DocTask](file:///e:/warehouse%20project/backend/inventory/models.py#L273)) مستقیماً در وضعیت تایید نهایی (`DOC_FINAL_APPROVED`) تشکیل شود.

### تصمیمات اتخاذ شده در مصاحبه فنی
1. **کنترل رابط کاربری:** یک سوئیچ تاگل اختصاصی مستقل (مشابه تاگل شمارش) در صفحه ورود کالا.
2. **استقلال کامل دو فرآیند:** کاربر می‌تواند هر ترکیبی را انتخاب کند:
   - فقط شمارش شمرده‌شده (`is_pre_counted`)
   - فقط اسناد تاییدشده (`is_doc_pre_approved`)
   - هر دو با هم (هم شمارش و هم اسناد تایید نهایی)
   - ورود عادی (هر دو خاموش و در انتظار)
3. **تزریق مقادیر مالی اکسل:** در صورت وجود ستون‌های مالی (قیمت واحد، ارزش کل، نوع فاکتور، شماره RTI، تامین‌کننده، مهر، امضا و...) در فایل اکسل، این مقادیر علاوه بر مدل [Item](file:///e:/warehouse%20project/backend/inventory/models.py#L44)، مستقیماً در مدل [DocTask](file:///e:/warehouse%20project/backend/inventory/models.py#L273) نیز به عنوان سند تاییدشده ذخیره می‌شوند.
4. **امنیت و کنترل دسترسی:** محافظت دقیق با مجوز تایید اسناد (`accounts.perm_doc_approve_action` یا `accounts.view_sys_manager_review` یا `is_superuser`).

---

## ۲. مشخصات و تغییرات پیشنهادی (Proposed Changes)

### لایه بک‌اند (Django / DRF)

#### [MODIFY] [backend/inventory/views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
* دریافت و اعتبارسنجی پارامتر `is_doc_pre_approved` در اکشن `import_excel`.
* بررسی مجوز امنیتی:
  ```python
  if is_doc_pre_approved:
      can_pre_approve_docs = (
          request.user.is_superuser or 
          request.user.has_perm('accounts.perm_doc_approve_action') or 
          request.user.has_perm('accounts.view_sys_manager_review')
      )
      if not can_pre_approve_docs:
          return Response({'error': 'شما مجوز ثبت مستقیم اقلام در وضعیت اسناد تاییدشده را ندارید.'}, status=403)
  ```
* تعریف متد کمکی اختصاصی `_mark_item_docs_as_approved(item, financial_data, note_reason, user_id)`:
  - جستجو یا ایجاد رکورد [DocTask](file:///e:/warehouse%20project/backend/inventory/models.py#L273) با وضعیت `'DOC_FINAL_APPROVED'`.
  - مپ کردن دقیق فیلدهای مالی از داده‌های ردیف کالا به فیلدهای `DocTask`.
  - ثبت یک رکورد در [DocTaskHistory](file:///e:/warehouse%20project/backend/inventory/models.py#L340) با `action_type = 'DOC_FINAL_APPROVED'`.
* تنظیم `defaults['doc_status'] = 'done'` در صورت فعال بودن فلگ در تمامی ۴ مسیر (کالای جدید، احیاشده، جایگزین، تکمیل نواقص).
* فراخوانی `broadcast_doc_task_update()` بعد از اتمام تراکنش.
* ثبت وضعیت `is_doc_pre_approved` در رویداد ممیزی سیستم (`log_audit_event`).

---

### لایه فرانت‌اند (Angular)

#### [MODIFY] [frontend/src/app/core/api/item-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/item-api.service.ts)
* افزودن آرگومان `isDocPreApproved: boolean = false` به متد `bulkImportStream` و ضمیمه کردن آن به `FormData`.

#### [MODIFY] [frontend/src/app/core/services/import.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/import.service.ts)
* افزودن `isDocPreApproved: boolean` به اینترفیس `WarehouseImportState`.
* مقداردهی اولیه `isDocPreApproved: false` در متد `createEmptyState()`.
* ارسال `state.isDocPreApproved` در بدنه فراخوانی `bulkImportStream`.

#### [MODIFY] [frontend/src/app/components/docs/docs.html](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.html)
* افزودن کارت تاگل شیک نیلی/آبی بلافاصله زیر کارت شمارش شمرده‌شده:
  - عنوان: «ورود به عنوان کالای دارای مدارک و اسناد تاییدشده (پایان فرآیند مالی)»
  - بج وضعیت پویا (`badge`)
  - توضیحات شفاف درباره نحوه ثبت در کارتابل مالی
  - اتصال به `importService.currentState.isDocPreApproved`
  - محافظت با `*appHasPermission="'perm_doc_approve_action'"`

---

## ۳. طرح آزمون و اعتبارسنجی (Verification Plan)

### الف) تست‌های خودکار بک‌اند ([tests_security_import.py](file:///e:/warehouse%20project/backend/inventory/tests_security_import.py))
1. **تست ثبت موفق با فیلدهای مالی کامل:**
   - ارسال فایل اکسل حاوی ستون‌های مالی (`price_amount`, `invoice_type`, `doc_supplier` و...) با `is_doc_pre_approved='true'`.
   - بررسی `item.doc_status == 'done'`.
   - بررسی تشکیل `DocTask` با وضعیت `'DOC_FINAL_APPROVED'` و مقداردهی صحیح قیمت و مشخصات فاکتور.
   - بررسی ثبت سابقه در `DocTaskHistory`.
2. **تست مسدودسازی کاربر غیرمجاز:**
   - کاربری با دسترسی عادی که فاقد `perm_doc_approve_action` است با خطای ۴۰۳ صریح رد شود.
3. **تست عملکرد هم‌زمان هر دو تاگل:**
   - ارسال هم‌زمان `is_pre_counted='true'` و `is_doc_pre_approved='true'` و بررسی اینکه هر دو تسک شمارش و اسناد به صورت ۱۰۰٪ تایید نهایی ایجاد شوند.

### ب) بررسی بیلد و سلامت سیستمی
- اجرای `manage.py check` در بک‌اند.
- اجرای `npm run build` در فرانت‌اند برای تایید بدون خطای تایپ‌اسکریپت و قالب.
