# برنامه اجرایی رفع ایرادات منطقی و وب‌سوکت در کارتابل‌های مالی و انبارگردان

<div dir="rtl" align="right">

این سند برنامه جامع فنی برای برطرف‌سازی باگ‌های منطقی، نشت انتخاب‌ها (Selection Leak)، اعتبارسنجی ارسال گروهی، و ارتقای ارتباط بلادرنگ وب‌سوکت در دو کارتابل مالی ([customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts)) و کارتابل انبارگردان ([counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)) است.

---

## 🎯 اهداف اصلی تغییرات

1. **جلوگیری از نشت انتخاب‌های پنهان:** پاک‌سازی `selectedTasks` هنگام تغییر فیلترهای وضعیت یا تاریخ در کارتابل انبارگردان.
2. **اعتبارسنجی اسناد مالی در ارسال گروهی:** ممانعت از ارجاع تسک‌های کاملاً خام و بدون مدرک به سرپرست در بک‌اند و فرانت‌اند کارتابل مالی.
3. **فیلتر هوشمند انبار در رویدادهای وب‌سوکت:** جلوگیری از واکشی‌های مازاد و سنگین شبکه هنگامی که رویداد وب‌سوکت مربوط به انبار دیگری است.
4. **حفظ داده‌های کاربر در لغو پیش‌نویس (Revert):** جلوگیری از پاک‌سازی تخریبی فیلدهای مالی در متد `revertTaskStatus`.
5. **پشتیبانی Local-First در استعلام استخر:** استفاده از مخزن آفلاین Dexie در استعلام خاموش استخر برای کارتابل انبارگردان.
6. **پاس دادن پی‌لود کامل تسک در کانال وب‌سوکت بک‌اند:** هدایت کلید `task` در مصرف‌کننده `NotificationConsumer`.

---

## 🛠️ تغییرات پیشنهادی به تفکیک فایل‌ها

### ۱. لایه فرانت‌اند (Frontend Layer)

#### [MODIFY] [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- اضافه کردن `this.selectedTasks.clear()` در توابع `setStatusFilter` (خط ۳۴۵) و `setDateFilter` (خط ۳۳۷).
- فیلتر کردن رویداد وب‌سوکت بر اساس انبار فعال: بررسی `data.warehouse_id === this.activeWarehouseId` قبل از رفرش جدول (خط ۱۶۸).
- اصلاح `fetchPoolTasksSilently` جهت پشتیبانی از حالت `localFirst` و خواندن از دیتابیس لوکال (خط ۷۶۹).

#### [MODIFY] [customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts)
- فیلتر کردن رویداد وب‌سوکت بر اساس انبار فعال در متد سابسکرایب وب‌سوکت (خط ۱۹۳).
- اصلاح متد `revertTaskStatus` جهت ممانعت از نال کردن تمام فیلدها و حفظ داده‌های قبلی سند (خط ۱۱۷۰).
- ارتقای اعتبارسنجی در `submitAll` برای جلوگیری از ارسال تسک‌های بدون داده در حالت انتخاب چندتایی (خط ۱۵۰۶).

---

### ۲. لایه بک‌اند (Backend Layer)

#### [MODIFY] [consumers.py](file:///e:/warehouse%20project/backend/notifications/consumers.py)
- اضافه کردن کلید `task` به دیکشنری خروجی `out_data` در متد `send_notification` (خط ۵۵).

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
- در اکشن `bulk_submit` از `DocTaskViewSet` (خط ۲۵۶۹)، اضافه کردن اعتبارسنجی جهت اطمینان از اینکه تسک‌های `PENDING_DOC` دارای حداقل یک فیلد مدرک یا یادداشت هستند.

---

## 🧪 برنامه اعتبارسنجی و تست (Verification Plan)

### ۱. تست‌های خودکار (Automated Tests)
- اجرای تست‌های جنگو برای بررسی اکشن‌های `DocTaskViewSet` و `CountTaskViewSet`:
  ```powershell
  python manage.py test inventory.tests_docs
  python manage.py test inventory.tests
  ```

### ۲. اعتبارسنجی دستی و تعاملی (Manual Verification)
1. **تست فیلتر انبارگردان:** انتخاب چند کالا در تب «همه»، سوییچ به تب «در انتظار» -> بررسی پاک شدن انتخاب‌های قبلی و عدم ارسال رکوردهای پنهان.
2. **تست وب‌سوکت بین انباری:** ارسال رویداد برای انبار دیگر -> اطمینان از عدم ایجاد درخواست شبکه اضافی در کارتابل انبار جاری.
3. **تست لغو پیش‌نویس مالی:** ویرایش فرم کالای رد شده توسط سرپرست و سپس کلیک روی بازگردانی -> اطمینان از حفظ اطلاعات اولیه و عدم پاک شدن کامل فیلدها.
4. **تست ارسال گروهی مالی:** تلاش برای ارسال گروهی تسک‌های خالی -> مشاهده پیام خطای متناسب و ممانعت از ارجاع تسک‌های بدون مدرک.

</div>
