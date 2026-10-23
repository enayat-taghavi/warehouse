<div dir="rtl" align="right">

# 🚀 گزارش جامع پیاده‌سازی و راستی‌آزمایی بسته ۲: یکپارچگی داده، صف آفلاین و پایداری پیام‌ها
## (Package 2 Implementation & Verification Walkthrough)

> **تاریخ:** ۲۵ اوت ۲۰۲۶ (۴ شهریور ۱۴۰۵)  
> **بسته اجرایی:** بسته ۲ (فاز ۴)  
> **پوشش ایرادات:** ۱۳، ۱۴، ۱۶، ۱۸، ۱۹، ۲۰، ۲۱، ۲۲، ۲۴  
> **وضعیت نهایی:** ✅ پیاده‌سازی کامل و قبولی ۱۰۰٪ آزمون‌های خودکار بک‌اند و فرانت‌اند  

---

## 📑 فهرست خلاصه تغییرات و نتایج

| بخش | ماژول‌های اصلاح‌شده | تست‌های اجرا شده | نتیجه آزمون |
| :--- | :--- | :--- | :---: |
| **یکتایی و بازپخش آفلاین (Idempotency)** | `models.py`, `views.py` | `test_duplicate_client_temp_id_returns_same_message`, `test_replay_after_offline_queue_does_not_duplicate` | ✅ پاس شد (HTTP 200/201) |
| **حذف نرم (Soft Delete)** | `views.py` | `test_delete_message_is_soft`, `test_soft_deleted_message_hidden_from_list` | ✅ پاس شد (کد 204 و پنهان از objects) |
| **ثبت ممیزی (AuditLog)** | `views.py` | `test_delete_writes_audit_log` | ✅ پاس شد (ثبت در accounts.AuditLog) |
| **سقف طول متن (4000 Chars)** | `serializers.py` | `test_text_over_limit_rejected` | ✅ پاس شد (۴۰۰ برای >۴۰۰۰ کاراکتر) |
| **محدودیت نرخ (Scoped Throttling)** | `settings.py`, `views.py` | `test_message_burst_is_throttled` | ✅ پاس شد (کد ۴۲۹) |
| **رویداد آپدیت پیوست** | `broadcast.py`, `consumers.py`, `views.py` | `test_attachment_emits_updated_event` | ✅ پاس شد (chat.message.updated) |
| **استیت سه‌حالته و Retry فرانت** | `communication.service.ts`, `chat-drawer.component.*` | ۱۰ تست در `communication.service.spec.ts` | ✅ پاس شد (۱۰/۱۰ تست سبز) |
| **رگرسیون کل بک‌اند** | پکیج `communications` | کل ۴۶ تست خودکار سیستم ارتباطات | ✅ ۴۶ تست سبز در ۹۲.۶ ثانیه |

---

## 🛠️ اقدامات انجام‌شده به تفکیک لایه‌ها

### ۱. لایه پایگاه داده و مدل‌ها (`communications/models.py`)
- اضافه شدن قید یکتایی `UniqueConstraint(fields=['conversation', 'sender', 'client_temp_id'])` به مدل `Message`.
- اضافه شدن قید یکتایی `UniqueConstraint(fields=['content_type', 'object_id', 'author', 'client_temp_id'])` به مدل `GenericComment`.
- ساخت و اجرای مهاجرت استاندارد `0002_genericcomment_unique_generic_comment_client_temp_id_and_more.py`.

### ۲. لایه сериаلایزرها (`communications/serializers.py`)
- تعریف فیلد `client_temp_id` به عنوان اختیاری (`required=False, allow_blank=True, allow_null=True`).
- اعمال محدودیت طول ۴۰۰۰ کاراکتر روی فیلد `text` برای جلوگیری از بارگذاری متون حجیم و حملات DoS.

### ۳. لایه کنترلرها و ممیزی (`communications/views.py`)
- **گارد Idempotency:** در صورت ارسال `client_temp_id` تکراری توسط کاربر در همان گفتگو، شیء پیام موجود بدون ایجاد رکورد مضاعف با وضعیت `200 OK` بازگردانده می‌شود.
- **حذف نرم:** متدهای `perform_destroy` در `ConversationViewSet`, `MessageViewSet` و `GenericCommentViewSet` به متد `instance.soft_delete()` مجهز شدند.
- **ثبت لاگ ممیزی:** تمامی عملیات حذف و ویرایش پیام‌ها و کامنت‌ها در مدل `accounts.AuditLog` با مشخصات کامل کاربر، انبار، وضعیت قبل و بعد ذخیره می‌شوند.
- **محدودسازی نرخ (Throttling):** اعمال `ScopedRateThrottle` با اسکوپ‌های تفکیک‌شده:
  - چت: ۶۰ درخواست در دقیقه (`chat_message`)
  - کامنت: ۶۰ درخواست در دقیقه (`chat_comments`)
  - آپلود رسانه: ۲۰ درخواست در دقیقه (`chat_upload`)

### ۴. لایه وب‌سوکت و برودکست (`broadcast.py` & `consumers.py`)
- متد `broadcast_message_updated_ws` برای ارسال رویداد `chat.message.updated` ساخته شد و در متد آپلود پیوست فراخوانی می‌شود تا کلاینت‌ها بدون تکثیر پیام، اطلاعات پیوست را با پیام فعلی ادغام کنند.

### ۵. لایه کلاینت و فرانت‌اند (`frontend`)
- **استیت سه‌حالته پیام:** فیلد `delivery_status: 'pending' | 'sent' | 'failed'` به اینترفیس `ChatMessage` اضافه شد.
- **اصلاح رفتار آفلاین:** در صورت قطعی اینترنت، پیام در حالت `pending` حفظ شده و تیک دوم کاذب نمایش داده نمی‌شود.
- **متد `retryMessage`:** قابلیت تلاش مجدد با حفظ همان `client_temp_id` جهت جلوگیری از تکرار پیام پس از اتصال مجدد.
- **رابط کاربری (`chat-drawer.component.html`):** نمایش نشانگر ساعت شنی (`⏳`) برای پیام‌های در صف، تیک دوتایی (`✓✓`) برای پیام‌های ارسال شده، و بج قرمز با دکمه **«تلاش مجدد 🔄»** برای پیام‌های ناموفق.

---

## 🧪 نتایج راستی‌آزمایی و آزمون‌های خودکار

### الف) آزمون‌های اختصاصی بسته ۲ (بک‌اند)
```powershell
venv\Scripts\python.exe manage.py test communications.tests.test_integrity -v 2
```
**نتیجه:**
```text
test_attachment_emits_updated_event ... ok
test_delete_message_is_soft ... ok
test_delete_writes_audit_log ... ok
test_duplicate_client_temp_id_returns_same_message ... ok
test_message_burst_is_throttled ... ok
test_replay_after_offline_queue_does_not_duplicate ... ok
test_soft_deleted_message_hidden_from_list ... ok
test_text_over_limit_rejected ... ok
----------------------------------------------------------------------
Ran 8 tests in 15.051s
OK
```

### ب) اجرای کامل تست‌های سیستم ارتباطات (بک‌اند)
```powershell
venv\Scripts\python.exe manage.py test communications -v 2
```
**نتیجه:**
```text
Ran 46 tests in 92.636s
OK
```

### ج) آزمون‌های واحد کلاینت فرانت‌اند
```powershell
npx vitest run src/app/core/services/communication.service.spec.ts
```
**نتیجه:**
```text
 ✓ src/app/core/services/communication.service.spec.ts (10 tests)
Test Files  1 passed (1)
Tests       10 passed (10)
```

### د) بیلد و کامپایل فرانت‌اند
```powershell
npm run build
```
**نتیجه:**
```text
Application bundle generation complete. [59.905 seconds]
[patch-ngsw-530] ✔ ngsw-worker.js وصله شد: جلوگیری از غیرفعال شدن کش در هنگام قطعی کلودفلر (کدهای 5xx).
```

---

## 🏁 نتیجه‌گیری
بسته ۲ با رعایت کامل اصول معماری، بدون هیچ‌گونه خطا یا رگرسیون در تست‌های قبلی، به طور کامل اجرا شد. سیستم اکنون برای اجرای بسته‌های بعدی (بسته ۳: UX و کامنت‌های زنده) کاملاً آماده و پایدار است.

</div>
