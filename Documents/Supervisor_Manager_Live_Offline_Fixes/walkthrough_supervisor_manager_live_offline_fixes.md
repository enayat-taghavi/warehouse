<div dir="rtl" align="right">

# گزارش جامع پایان عملیات فاز ۳۱: ارتقای هوشمند وب‌سوکت (Granular Real-time Updates) و اصلاحات کارتابل‌های سرپرست و مدیر

این گزارش مستند نهایی پیاده‌سازی و راستی‌آزمایی فاز ۳۱ مطابق با برنامه اجرایی مصوب و معماری به‌روزرسانی نقطه‌ای است.

---

## ۱. خلاصه اقدامات انجام‌شده

### ۱.۱. بک‌اند جنگو (Backend WebSocket Signal Serialization):
* **ارتقای کامل سیگنال‌های وب‌سوکت در [inventory/signals.py](file:///e:/warehouse%20project/backend/inventory/signals.py):**
  * سیگنال‌های `post_save` و `post_delete` مدل‌های `CountTask` و `DocTask` ارتقا یافتند تا علاوه بر `task_id` و `warehouse_id`، آبجکت کامل سریالایز شده تسک (`CountTaskSerializer` و `DocTaskSerializer`) را در قالب کلید `task` داخل payload پیام وب‌سوکت برادکست کنند.
  * در صورت حذف رکورد (`post_delete`)، کلید `_deleted: True` به داده‌ها ضمیمه می‌شود تا فرانت‌اند بلافاصله رکورد را از جداول حذف کند.

### ۱.۲. کارتابل سرپرست ([supervisor-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts)):
* **دریافت زنده و اعمال نقطه‌ای (In-Place Updates):**
  * متدهای `updateCountTaskInPlace` و `updateDocTaskInPlace` پیاده‌سازی شدند تا با دریافت تسک تغییریافته از وب‌سوکت، بدون زدن درخواست مجدد شبکه (Zero-Fetch)، ردیف مربوطه را در جدول همان تب به‌روز کرده یا جابجا نمایند.
  * فال‌بک استعلام تکی (`fetchSingleCountTask` و `fetchSingleDocTask`) پیاده‌سازی شد تا در صورت فقدان داده در پیام وب‌سوکت، فقط همان یک تسک استعلام شود.
  * فلش نوری سبز انیمیشنی (`triggerFlash`) به مدت ۴ ثانیه روی ردیف تغییریافته اعمال می‌شود.
* **به‌روزرسانی خوش‌بینانه و پشتیبانی آفلاین:**
  * در متدهای تایید و رد سرپرست (`confirmApprove`, `confirmSingleReject`, `confirmDocApprove`, `confirmDocReject`) تسک‌ها بلافاصله از جدول حذف می‌شوند و در صورت آفلاین بودن، پیام قرارگیری در صف آفلاین نمایش داده می‌شود.
  * در استعلام مجدد پس‌زمینه (`loadTasks`, `loadPoolTasks`, `loadDocTasks`, `loadDocPoolTasks`) چک‌باکس‌ها، شماره صفحه و وضعیت انتخاب کاربر با پرچم `preserveState` حفظ می‌گردد.
  * سابسکرایبر SWR فقط به درخواست‌های مربوط به نقش سرپرست (`as_role=supervisor`) واکنش نشان می‌دهد.

### ۱.۳. کارتابل بررسی مدیر ([manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts)):
* **دریافت زنده و اعمال نقطه‌ای (In-Place Updates):**
  * متدهای `updateCountTaskInPlace` و `updateDocTaskInPlace` و استعلام تکی پیاده‌سازی شدند.
  * در صورتی که تسک تایید نهایی شده یا به بازشماری ارجاع داده شود (`status !== 'MANAGER_REVIEW'`)، بلافاصله و با صفر ثانیه تاخیر از جدول مدیر خارج می‌شود.
* **به‌روزرسانی خوش‌بینانه و پشتیبانی آفلاین:**
  * در متدهای تایید نهایی تک و گروهی (`approveDetailTask`, `approveSingle`, `confirmApprove`, `approveTask`) و ارجاع به بازشماری تک و گروهی (`rejectDetailTask`, `confirmSingleReject`, `rejectTask`, `confirmBulkReject`) و بخش اسناد مالی (`confirmDocApprove`, `confirmDocReject`)، تسک‌ها بلادرنگ از جدول فیلتر شده و در حالت آفلاین، پیام اعلان ثبت در صف آفلاین به کاربر نمایش داده می‌شود.
  * حفظ کامل انتخاب‌ها و فیلترها هنگام رفرش‌های پس‌زمینه (`preserveState`).
  * سابسکرایبر SWR فقط به درخواست‌های مربوط به نقش مدیر (`as_role=manager`) واکنش نشان می‌دهد.

### ۱.۴. هماهنگی با صفحه پیگیری شمارش و انبارگردان:
* در [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts) و [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) سابسکرایبرهای SWR و استعلام‌های تکی وب‌سوکت تطبیق داده شدند تا هیچ تداخلی میان نقش‌های انبارگردان، سرپرست و مدیر به وجود نیاید.

---

## ۲. نتایج تست‌ها و راستی‌آزمایی

| ردیف | شرح اعتبارسنجی | نتیجه | وضعیت |
| :---: | :--- | :--- | :---: |
| ۱ | بررسی و تست سینتکس سیگنال‌های بک‌اند | `manage.py check` بدون خطا اجرا شد | ✅ تایید شد |
| ۲ | اجرای تست‌های یکپارچگی بک‌اند جنگو | تمام ۳۵ تست با نتیجه `OK` در ۷۸ ثانیه پاس شدند | ✅ تایید شد |
| ۳ | بیلد کامل فرانت‌اند انگیولار | `npm run build` بدون خطای کامپایل با موفقیت ساخته شد | ✅ تایید شد |

---

## ۳. جمع‌بندی

تمامی ۴ بخش کارتابل (پیگیری شمارش، شمارشگر، سرپرست، و مدیر) به معماری یکپارچه **Zero-Fetch Granular Live Updates** و **Optimistic Offline Queue Support** مجهز شدند. اکنون تغییرات هر بخش به‌صورت نقطه‌ای و در کسر ثانیه به سایر بخش‌ها منعکس شده و هیچ درخواست رگباری یا اتلاف پهنای باند و منابع در سیستم رخ نمی‌دهد.

</div>
