# چک‌لیست اجرایی رفع ایرادات کارتابل‌ها

<div dir="rtl" align="right">

- [x] **فاز ۱: اصلاحات وب‌سوکت بک‌اند و فیلتر انبارها در فرانت‌اند**
  - [x] اصلاح ارسال شیء `task` در `NotificationConsumer` بک‌اند ([consumers.py](file:///e:/warehouse%20project/backend/notifications/consumers.py))
  - [x] افزودن فیلتر تطابق انبار در سابسکرایبر وب‌سوکت کارتابل مالی ([customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts))
  - [x] افزودن فیلتر تطابق انبار در سابسکرایبر وب‌سوکت کارتابل انبارگردان ([counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts))

- [x] **فاز ۲: اصلاحات منطقی و امنیت کارتابل انبارگردان**
  - [x] پاک‌سازی رکوردهای انتخاب‌شده (`selectedTasks.clear()`) در تغییر فیلترهای وضعیت و زمان ([counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts))
  - [x] پشتیبانی از Dexie Local-First در متد `fetchPoolTasksSilently` ([counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts))

- [x] **فاز ۳: اصلاحات منطقی و امنیت کارتابل مالی**
  - [x] اعتبارسنجی اسناد در متد `bulk_submit` بک‌اند ([views.py](file:///e:/warehouse%20project/backend/inventory/views.py))
  - [x] اصلاح متد `revertTaskStatus` جهت جلوگیری از تخریب فیلدهای ثبت‌شده قبلی ([customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts))
  - [x] اعتبارسنجی انتخاب‌های چندتایی در متد `submitAll` فرانت‌اند ([customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts))

- [x] **فاز ۴: تست و تایید نهایی**
  - [x] اجرای تست‌های واحد بک‌اند جنگو
  - [x] تست دستی جریان‌های کاری و تایید عملکرد

</div>
