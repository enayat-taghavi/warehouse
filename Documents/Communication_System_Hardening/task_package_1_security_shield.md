<div dir="rtl" align="right">

# 📋 چک‌لیست وظایف بسته ۱: سپر امنیتی، کنترل دسترسی و تست پایه (Task Checklist - Package 1)

> **سند مرجع:** [implementation_plan_package_1_security_shield.md](implementation_plan_package_1_security_shield.md)  
> **دامنه:** فاز ۰ + فاز ۱ + فاز ۲ + فاز ۳  
> **وضعیت:** ✅ ۱۰۰٪ تکمیل‌شده و کلیه آزمون‌ها در ترمینال سبز شدند

---

## 📌 وضعیت فازهای اجرایی بسته ۱

| فاز | عنوان فاز | لایه | وضعیت | تعداد تست‌ها |
| :---: | :--- | :---: | :---: | :---: |
| **فاز ۰** | هارنس تست و اثبات شکست‌های قرمز (TDD Baseline) | تست بک‌اند + فرانت | ✅ تکمیل شد | ۴ تست قرمز |
| **فاز ۱** | لایه دسترسی واحد در REST و مسدودسازی IDOR | بک‌اند (REST API) | ✅ تکمیل شد | ۱۷ تست |
| **فاز ۲** | امن‌سازی پیوست‌ها و سرو رسانه با URL امضاشده | بک‌اند (Media / Uploads) | ✅ تکمیل شد | ۱۱ تست |
| **فاز ۳** | امن‌سازی وب‌سوکت و پیشگیری از شنود زنده | بک‌اند (Django Channels) | ✅ تکمیل شد | ۱۰ تست |

---

## 🛠️ تفکیک گام‌به‌گام اقدامات

### فاز ۰: هارنس تست و اثبات قرمز (Phase 0: Test Harness & Red Flags)
- [x] <!-- id: 0.1 --> ساخت پکیج تست بک‌اند `backend/communications/tests/__init__.py`
- [x] <!-- id: 0.2 --> پیاده‌سازی کلاس پایه `BaseCommsTestCase` در `communications/tests/base.py` با ۲ انبار و ۵ کاربر با نقش‌های متفاوت
- [x] <!-- id: 0.3 --> نوشتن تست‌های قرمز اثبات‌کننده رخنه‌های امنیتی در `communications/tests/test_access_rest.py` (اثبات شکست اولیه در ۱۲ تست)
- [x] <!-- id: 0.4 --> ساخت فایل تست سرویس کلاینت در `frontend/src/app/core/services/communication.service.spec.ts`

### فاز ۱: لایه دسترسی واحد در REST (Phase 1: Centralized Access Layer & IDOR Shield)
- [x] <!-- id: 1.1 --> ساخت ماژول متمرکز `communications/access.py` متصل به `common/warehouse_scope.py`
- [x] <!-- id: 1.2 --> ساخت ماژول برودکست `communications/broadcast.py` جهت تفکیک فایل و رعایت قاعده ۵۰۰ خط
- [x] <!-- id: 1.3 --> بازنویسی و اصلاح `communications/permissions.py` و حذف ارجاعات مرده به فیلدهای ناموجود
- [x] <!-- id: 1.4 --> امن‌سازی `MessageViewSet` در `views.py` (فیلتر اجباری عضویت در `get_queryset`، خطای ۴۰۰ به‌جای ۵۰۰ در نبود گفتگو، بررسی عضویت در ارسال)
- [x] <!-- id: 1.5 --> اصلاح `serializers.py` (قرار دادن `is_system`، `conv_type`، `participants` در `read_only_fields` و اعتبارسنجی امن `content_type_str`)
- [x] <!-- id: 1.6 --> امن‌سازی `ConversationViewSet` با پرمیشن `IsConversationParticipantOrAdmin` و محدودیت ساخت کانال برای مدیر
- [x] <!-- id: 1.7 --> امن‌سازی `GenericCommentViewSet` (الزام `model_name` و `object_id`، محدودسازی ویرایش و حذف به نویسنده)
- [x] <!-- id: 1.8 --> فیلتر مخاطبین `ChatContactsListView` بر اساس انبارهای مشترک و صفحه‌بندی
- [x] <!-- id: 1.9 --> سبز کردن تمام تست‌های `communications/tests/test_access_rest.py`

### فاز ۲: امن‌سازی پیوست‌ها و سرو رسانه (Phase 2: Signed URLs & Attachment Security)
- [x] <!-- id: 2.1 --> افزودن پیشوندهای `chat_attachments/` و `comment_attachments/` به `PROTECTED_PREFIXES` در `common/media_urls.py`
- [x] <!-- id: 2.2 --> اعمال متد `signed_media_url()` در `MessageAttachmentSerializer` و `GenericCommentSerializer`
- [x] <!-- id: 2.3 --> اعتبارسنجی هدر و بایت‌های واقعی فایل‌ها (Magic Bytes) و ممانعت از آپلود اسکریپت و کدهای مخرب در `upload_attachment`
- [x] <!-- id: 2.4 --> ذخیره فایل‌ها روی دیسک با نام یکتای UUID جهت جلوگیری از Path Traversal
- [x] <!-- id: 2.5 --> پیاده‌سازی و سبز کردن ۱۱ تست اختصاصی در `communications/tests/test_attachments.py`

### فاز ۳: امن‌سازی وب‌سوکت (Phase 3: WebSocket Security & Room Isolation)
- [x] <!-- id: 3.1 --> اعتبارسنجی مجوز عضویت در `join_conversation` و `typing` در `ChatConsumer` با فراخوانی توابع `access.py`
- [x] <!-- id: 3.2 --> اعتبارسنجی دسترسی انبار در اتصال به روم‌های `chat_warehouse_{id}`
- [x] <!-- id: 3.3 --> اصلاح `CommentConsumer` و استفاده از `set` برای `subscribed_groups` به همراه اعتبارسنجی دسترسی به موجودیت هدف
- [x] <!-- id: 3.4 --> پیاده‌سازی و سبز کردن ۱۰ تست وب‌سوکت با `WebsocketCommunicator` در `communications/tests/test_ws_access.py`

---

## 🎯 گیت تأیید نهایی بسته ۱ (Package 1 Acceptance Gate)
- [x] اجرای فرمان تست جامع بک‌اند: `python manage.py test communications -v 2` (۳۸ تست کاملاً سبز)
- [x] اجرای تست‌های پایه فرانت‌اند: `npx ng test --include="src/app/core/services/communication.service.spec.ts" --watch=false` (۵ تست کاملاً سبز)
- [x] بررسی سورس‌کد جهت تضمین عدم وجود فایل‌های بالای ۵۰۰ خط در `communications/` (بزرگ‌ترین فایل ۳۱۰ خط)

</div>
