<div dir="rtl" align="right">

# 📋 چک‌لیست فازبندی‌شده چرخه بک‌اند کارتابل مالی

- [x] **فاز ۱: توسعه مدل، سریالایزر و دیتابیس (Model & Database Updates)** <!-- id: 1 -->
    - [x] افزودن فیلد `data_snapshot` به مدل `DocTaskHistory` در [`models.py`](file:///e:/warehouse%20project/backend/inventory/models.py) <!-- id: 1.1 -->
    - [x] اطمینان از قرارگیری `data_snapshot` در `DocTaskHistorySerializer` در [`serializers.py`](file:///e:/warehouse%20project/backend/inventory/serializers.py) <!-- id: 1.2 -->
    - [x] ایجاد میگریشن فوروارد با `python manage.py makemigrations inventory` (`0025_doctaskhistory_data_snapshot.py`) <!-- id: 1.3 -->
    - [x] اعمال میگریشن به دیتابیس با `python manage.py migrate` <!-- id: 1.4 -->
    - [x] **راستی‌آزمایی فاز ۱ و ارائه گزارش جهت اخذ تایید کاربر** <!-- id: 1.5 -->

- [x] **فاز ۲: ارتقای ویوها و ثبت اسنپ‌شات تاریخچه (Views & Snapshot Logging)** <!-- id: 2 -->
    - [x] پیاده‌سازی متد هلپر `_create_doc_task_snapshot` در [`views.py`](file:///e:/warehouse%20project/backend/inventory/views.py) <!-- id: 2.1 -->
    - [x] ثبت اسنپ‌شات در اکشن‌های `perform_update` و `bulk_submit` <!-- id: 2.2 -->
    - [x] ثبت اسنپ‌شات در اکشن‌های `bulk_approve` و `reject` سرپرست <!-- id: 2.3 -->
    - [x] ثبت اسنپ‌شات در اکشن‌های `manager_reject` و `bulk_manager_approve` مدیر <!-- id: 2.4 -->
    - [x] **راستی‌آزمایی فاز ۲ و ارائه گزارش جهت اخذ تایید کاربر** <!-- id: 2.5 -->

- [x] **فاز ۳: همگام‌سازی با جدول کالا و اصلاح بررسی ارجاع مجدد (Data Sync & Dispatch Fix)** <!-- id: 3 -->
    - [x] رونویسی ۱۴ فیلد مالی از `DocTask` به `Item` در `bulk_manager_approve` <!-- id: 3.1 -->
    - [x] به‌روزرسانی `doc_status = 'approved'` روی مدل `Item` <!-- id: 3.2 -->
    - [x] اصلاح شرط بررسی هشدار ارجاع مجدد (`processing`) در متد `bulk_assign` <!-- id: 3.3 -->
    - [x] **راستی‌آزمایی فاز ۳ و ارائه گزارش جهت اخذ تایید کاربر** <!-- id: 3.4 -->

- [x] **فاز ۴: پیاده‌سازی و اجرای آزمون‌های ۱۵گانه (`tests_docs.py`)** <!-- id: 4 -->
    - [x] ایجاد فایل [`inventory/tests_docs.py`](file:///e:/warehouse%20project/backend/inventory/tests_docs.py) و ستاپ اولیه کاربران و اقلام <!-- id: 4.1 -->
    - [x] پیاده‌سازی سناریوهای ۱ تا ۵ (Happy path، رد مکرر، پرش سرپرست، استخر و Claim، رد مدیر) <!-- id: 4.2 -->
    - [x] پیاده‌سازی سناریوهای ۶ تا ۱۰ (لغو گروهی، تنظیمات فیلدها، فیلدهای پویا، همزمانی، Force) <!-- id: 4.3 -->
    - [x] پیاده‌سازی سناریوهای ۱۱ تا ۱۵ (دقت اعشار و صفر، استخر سرپرست، رفع رد، حذف نرم، پایداری کالا) <!-- id: 4.4 -->
    - [x] اجرای `python manage.py test inventory.tests_docs` و تایید قبولی ۱۰۰٪ هر ۱۵ سناریو <!-- id: 4.5 -->
    - [x] **راستی‌آزمایی فاز ۴ و ارائه گزارش جهت اخذ تایید کاربر** <!-- id: 4.6 -->

- [x] **فاز ۵: تست رگرسیون انبارگردانی و مستندسازی نهایی (Regression & Walkthrough)** <!-- id: 5 -->
    - [x] اجرای تست‌های قبلی انبارگردانی `python manage.py test inventory.tests inventory.tests_docs` (۳۰ تست پاس شد) <!-- id: 5.1 -->
    - [x] ایجاد مستند گزارش نهایی [`walkthrough.md`](file:///C:/Users/Payandeh/.gemini/antigravity-ide/brain/d0e1eafb-cb3d-4983-9681-05b8a129eefa/walkthrough.md) <!-- id: 5.2 -->
    - [x] به‌روزرسانی مستندات DUAL-SAVE و `Master_Log.md` <!-- id: 5.3 -->
    - [x] **ارائه گزارش نهایی اتمام کار به کاربر** <!-- id: 5.4 -->

</div>
