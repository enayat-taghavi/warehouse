<div dir="rtl" align="right">

# 📋 چک‌لیست اجرایی بسته ۲: یکپارچگی داده، صف آفلاین و پایداری پیام‌ها (Package 2 Task List)

> **سند مرجع:** [implementation_plan_package_2_data_integrity.md](implementation_plan_package_2_data_integrity.md)  
> **فاز تحت پوشش:** فاز ۴  
> **وضعیت:** ✅ تکمیل و تأیید ۱۰۰٪ با آزمون‌های خودکار  

---

## 🛠️ اقدامات مرحله‌به‌مرحله بسته ۲ (فاز ۴)

### ۱. زیرساخت تست و اثبات خودکار (TDD)
- [x] ساخت فایل `backend/communications/tests/test_integrity.py` شامل ۸ آزمون خودکار یکپارچگی داده، یکتایی و Soft Delete
- [x] تکمیل `frontend/src/app/core/services/communication.service.spec.ts` با ۱۰ تست جامع استیت سه‌حالته و Retry کلاینت

### ۲. پایداری و یکتایی داده در بک‌اند (Backend Data Integrity & Idempotency)
- [x] افزودن قید یکتایی `UniqueConstraint(conversation, sender, client_temp_id)` در `Message.Meta` و ساخت/اجرای مایگریشن
- [x] پیاده‌سازی گارد یکتایی در `MessageViewSet.create` و `GenericCommentViewSet.create` بر پایه `client_temp_id`
- [x] بازنویسی `perform_destroy` با فراخوانی `instance.soft_delete()` در `ConversationViewSet`, `MessageViewSet` و `GenericCommentViewSet`
- [x] اعمال محدودیت طول متن (`max_length=4000`) در `MessageSerializer` و `GenericCommentSerializer`
- [x] پیکربندی Scoped Throttling در `settings.py` و اعمال روی ViewSetهای چت و کامنت و متد آپلود
- [x] پیاده‌سازی متد ثبت ممیزی در `accounts.AuditLog` برای حذف/ویرایش پیام‌ها و گفتگوها
- [x] ساخت متد `broadcast_message_updated_ws` در `broadcast.py` و به‌روزرسانی `consumers.py` برای ارسال رویداد `chat.message.updated`

### ۳. پایداری کلاینت، صف آفلاین و رابط کاربری (Frontend UI & Offline Queue)
- [x] افزودن استیت سه‌حالته `delivery_status: 'pending' | 'sent' | 'failed'` به مدل `ChatMessage`
- [x] به‌روزرسانی `CommunicationService.sendMessage` جهت هندل صحیح خطای شبکه، عدم فقدان متن کاربر و حفظ وضعیت در `_offlinePending`
- [x] پیاده‌سازی متد `retryMessage` با استفاده از همان `client_temp_id` قبلی
- [x] افزودن هندلر رویداد `chat.message.updated` در سوکت کلاینت و Merge تمیز پیوست‌ها
- [x] به‌روزرسانی قالب `chat-drawer.component.html` جهت نمایش آیکون‌های وضعیت (⏳ در انتظار، ⚠️ خطا با دکمه تلاش مجدد، ✓✓ ارسال شده)
- [x] اتصال دکمه تلاش مجدد به متد `retryMessage` در `chat-drawer.component.ts`

### ۴. اجرای آزمون‌ها و گزارش نهایی (Verification & Gate Pass)
- [x] اجرای تست‌های یکپارچگی بک‌اند: `python manage.py test communications.tests.test_integrity -v 2` (۸ آزمون سبز)
- [x] اجرای کلیه تست‌های پکیج ارتباطات: `python manage.py test communications -v 2` (۴۶ آزمون سبز)
- [x] اجرای تست‌های کلاینت فرانت‌اند: `npx vitest run src/app/core/services/communication.service.spec.ts` (۱۰ آزمون سبز)
- [x] کامپایل و بیلد نهایی پروژه فرانت: `npm run build` (موفقیت‌آمیز)
- [x] ایجاد فایل گزارش موفقیت `walkthrough_package_2_data_integrity.md`

</div>
