<div dir="rtl" align="right">

# 🛡️ طرح پیاده‌سازی بسته ۱: سپر امنیتی، کنترل دسترسی و تست پایه (Package 1: Security Shield & TDD)

> [!NOTE]
> **نسخه:** ۱.۰ — ۲۴ اوت ۲۰۲۶ (۰۲ شهریور ۱۴۰۵)  
> **دامنه اجرایی:** فازهای ۰، ۱، ۲ و ۳ از سند جامع پایدارسازی ارتباطات  
> **هدف اصلی:** مسدودسازی ۱۰۰٪ آسیب‌پذیری‌های IDOR در خواندن و ارسال پیام، امن‌سازی دانلود فایل‌ها با Signed URL، اعتبارسنجی هدر و ساختار بایت‌های فایل‌ها (Magic Bytes)، جلوگیری از شنود وب‌سوکت و برقراری شبکه جامع آزمون‌های خودکار (TDD) با بیش از ۴۰ تست بک‌اند و فرانت.

---

## ۱. فایل‌های تحت تغییر و ایجاد در بسته ۱

| لایه | مسیر فایل | نوع تغییر | شرح و هدف تغییر |
| :--- | :--- | :---: | :--- |
| **تست بک‌اند** | `backend/communications/tests/__init__.py` | [NEW] | ایجاد پکیج تست‌های سیستم ارتباطات |
| **تست بک‌اند** | `backend/communications/tests/base.py` | [NEW] | کلاس پایه `BaseCommsTestCase` شامل ۲ انبار، ۵ کاربر با نقش‌های متفاوت، ۳ گفتگو و توابع کمکی احراز هویت |
| **تست بک‌اند** | `backend/communications/tests/test_access_rest.py` | [NEW] | آزمون‌های دسترسی REST و اثبات مسدودسازی IDOR (۱۸ تست) |
| **تست بک‌اند** | `backend/communications/tests/test_attachments.py` | [NEW] | آزمون‌های اعتبارسنجی نوع فایل، لینک امضاشده و امنیت رسانه (۱۲ تست) |
| **تست بک‌اند** | `backend/communications/tests/test_ws_access.py` | [NEW] | آزمون‌های دسترسی وب‌سوکت و تفکیک روم‌ها با `WebsocketCommunicator` (۱۰ تست) |
| **تست فرانت** | `frontend/src/app/core/services/communication.service.spec.ts` | [NEW] | تست واحد پایه کلاینت ارتباطات در Angular |
| **بک‌اند** | `backend/communications/access.py` | [NEW] | ماژول واحد و متمرکز قوانین دسترسی و اتصال به `warehouse_scope.py` |
| **بک‌اند** | `backend/communications/broadcast.py` | [NEW] | ماژول برودکست رویدادهای چت و کامنت در چنلز جهت رعایت قاعده ۵۰۰ خط |
| **بک‌اند** | `backend/communications/permissions.py` | [MODIFY] | حذف فیلدهای ناموجود (`accessible_warehouses`) و ارجاع به `access.py` |
| **بک‌اند** | `backend/communications/serializers.py` | [MODIFY] | افزودن `read_only_fields`، استفاده از `signed_media_url` و اعتبارسنجی امن `content_type_str` |
| **بک‌اند** | `backend/communications/views.py` | [MODIFY] | بازنویسی و تفکیک متدها، فیلتر اجباری عضویت در `MessageViewSet`، اصلاح کدهای خطا (۴۰۰/۴۰۳) و صفحه‌بندی مخاطبین |
| **بک‌اند** | `backend/communications/consumers.py` | [MODIFY] | اعتبارسنجی دسترسی در `join_conversation` و `typing`، تبدیل گروه‌های اشتراک کامنت به `set` |
| **بک‌اند** | `backend/common/media_urls.py` | [MODIFY] | افزودن پیشوندهای چت و کامنت به `PROTECTED_PREFIXES` |

---

## ۲. جزئیات معماری و اقدامات فازها

### فاز ۰: هارنس تست و اثبات قرمز (Phase 0)
1. **ساختار پکیج:** ایجاد دایرکتوری `backend/communications/tests/` با فایل `__init__.py`.
2. **پایه‌ریزی `BaseCommsTestCase`:**
   - ۲ انبار (`wh1`, `wh2`).
   - ۵ کاربر مجزا: `admin`، `manager_wh1`، `staff_wh1`، `staff_wh2`، `unassigned_user`.
   - ۳ اتاق گفتگوی پیش‌فرض: چت دونفره، گروه کاری انبار ۱، و کانال اطلاعیه سراسری.
   - کالا و رکورد نمونه جهت تست کامنت‌های تعاملی چندریختی.
3. **تست‌های قرمز فاز ۰:**
   - تست خواندن پیام‌های گفتگوی خصوصی توسط پرسنل انبار ۲ (اثبات IDOR).
   - تست آپلود فایل روی پیام کاربر دیگر توسط فرد متفرقه.
   - تست دریافت کل کامنت‌ها بدون ارسال پارامترهای اجباری.

---

### فاز ۱: لایه دسترسی واحد در REST (Phase 1)
1. **ایجاد `communications/access.py`:**
   - `visible_conversations(user)`: برگرداندن گفتگوهای مجاز کاربر بر اساس عضویت، گروه انبار (با `can_access_warehouse`) و کانال اطلاعیه.
   - `can_read_conversation(user, conversation)`: بررسی صریح مجوز مشاهده تاریخچه گفتگو.
   - `can_post_to_conversation(user, conversation)`: اعتبارسنجی امکان ارسال پیام.
   - `can_modify_message(user, message)`: محدودسازی ویرایش و حذف پیام صرفاً به نویسنده یا سوپریوزر.
   - `can_access_comment_target(user, content_type, object_id)`: اعتبارسنجی دسترسی انبار به موجودیت متناظر کامنت.
   - `can_modify_comment(user, comment)`: محدودسازی ویرایش و حذف کامنت صرفاً به نویسنده.
2. **تفکیک `broadcast.py`:**
   - انتقال `broadcast_message_ws` و `broadcast_comment_ws` از `views.py` به `broadcast.py` جهت حفظ قاعده ۵۰۰ خط.
3. **اصلاح `permissions.py`:**
   - جایگزینی دسترسی‌های مرده با توابع `access.py` و متدهای `common.warehouse_scope`.
4. **اصلاح `views.py`:**
   - در `MessageViewSet.get_queryset`: فیلتر اجباری `conversation_id` و بررسی `can_read_conversation`.
   - در `MessageViewSet.perform_create`: بازگرداندن خطای ۴۰۰ اعتبارسنجی (`ValidationError`) در نبود گفتگو به‌جای ۵۰۰؛ و در صورت عدم عضویت، پرتاب `PermissionDenied` (۴۰۳).
   - در `ConversationViewSet`: محدودسازی ساخت گروه و اطلاعیه به مدیر/سوپریوزر.
   - در `GenericCommentViewSet`: الزام `model_name` و `object_id` (برگرداندن ۴۰۰ در نبود آن‌ها).
   - در `ChatContactsListView`: محدودسازی مخاطبین بر اساس انبار مشترک با کاربر لاگین‌شده و صفحه‌بندی.
5. **اصلاح `serializers.py`:**
   - قرار دادن فیلدهای حساس در `read_only_fields`.
   - اعتبارسنجی دقیق فرمت `content_type_str` با Allowlist مدل‌های مجاز و بررسی وجود شناسه موجودیت هدف.

---

### فاز ۲: امن‌سازی پیوست‌ها و سرو رسانه (Phase 2)
1. **پروتکل URL امضاشده در `common/media_urls.py`:**
   - اضافه شدن `'chat_attachments/'` و `'comment_attachments/'` به `PROTECTED_PREFIXES`.
   - تولید توکن HMAC پایدار با پارامترهای `?e=...&s=...` با پنجره اعتبار ۷ روزه.
2. **سریالایزرها:**
   - بازنویسی `get_file_url` در `MessageAttachmentSerializer` با استفاده از `signed_media_url()`.
3. **امنیت آپلود فایل در `upload_attachment`:**
   - اعتبارسنجی هدر و ساختار بایت‌های فایل‌ها (Magic Bytes) برای پسوندهای مجاز (PNG, JPEG, WebP, PDF, TXT, CSV, XLSX, ZIP).
   - مسدودسازی قطعی فایل‌های HTML، SVG، اسکریپت‌های اجرایی و فایل‌های دستکاری‌شده (XSS Protection).
   - ذخیره فایل روی دیسک با استفاده از شناسه یکتای تصادفی UUID.
   - اعتبارسنجی مالکیت پیام قبل از الحاق فایل (تنها نویسنده پیام مجاز به ضمیمه کردن فایل است).

---

### فاز ۳: امن‌سازی وب‌سوکت (Phase 3)
1. **`ChatConsumer`:**
   - احراز هویت توکن JWT در مرحله اتصال.
   - بررسی دسترسی در دستور `join_conversation` از طریق `database_sync_to_async(can_read_conversation)`.
   - بررسی دسترسی در دستور `typing` جهت جلوگیری از ارسال پیام‌های تایپینگ جعلی به گفتگوهای دیگران.
   - بررسی دسترسی انبار قبل از عضویت در روم‌های گروهی `chat_warehouse_{id}`.
2. **`CommentConsumer`:**
   - تغییر ساختار نگهداری روم‌های مشترک‌شده به `self.subscribed_groups = set()`.
   - بررسی دسترسی انبار به موجودیت هدف قبل از افزودن کاربر به روم کامنت‌ها.
   - پاکسازی صحیح روم‌ها در خروج (`unsubscribe_comments` و `disconnect`).

---

## ۳. طرح راستی‌آزمایی و تست‌های خودکار (Verification Plan)

### الف) آزمون‌های خودکار بک‌اند
```powershell
cd "backend"
python manage.py test communications -v 2
```

### ب) آزمون‌های کلاینت فرانت‌اند
```powershell
cd "frontend"
npm test
```

### ج) اعتبارسنجی استانداردهای کد و سلامت سیستم
1. بررسی خروجی بدون خطای `python manage.py check`.
2. بررسی خطوط فایل‌های سورس `communications/*.py` جهت اطمینان از قرار داشتن زیر سقف ۵۰۰ خط.

</div>
