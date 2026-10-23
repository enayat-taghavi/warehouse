<div dir="rtl" align="right">

# 📋 چک‌لیست پایش و پایدارسازی جامع سیستم ارتباطات (Master Task Checklist)

> **سند مرجع:** [implementation_plan_communication_hardening.md](implementation_plan_communication_hardening.md)
> **وضعیت کلی:** بسته‌های ۱ و ۲ با موفقیت کامل پیاده‌سازی و تست شدند

---

## 📦 بسته ۱: سپر امنیتی، کنترل دسترسی و تست پایه (Security Shield & TDD)
> **فازهای سند:** فاز ۰ + فاز ۱ + فاز ۲ + فاز ۳ | **ایرادات پوشش‌داده:** ۱، ۲، ۳، ۴، ۵، ۶، ۷، ۸، ۹، ۱۰، ۱۱، ۱۲، ۱۵، ۱۷، ۴۰، ۴۱، ۴۸ | **وضعیت:** ✅ با موفقیت اجرا و تست شد (۳۸ تست سبز)

- [x] **فاز ۰ (هارنس تست و تست‌های قرمز اثبات‌کننده):**
  - [x] ساخت پکیج `backend/communications/tests/` و فایل پایه `base.py`
  - [x] نوشتن تست‌های قرمز اثبات IDOR و نشت اطلاعات در `test_access_rest.py` (شکست کنترل‌شده)
  - [x] ایجاد فایل `communication.service.spec.ts` برای تست‌های کلاینت
- [x] **فاز ۱ (لایه دسترسی متمرکز در REST):**
  - [x] ایجاد ماژول واحد `communications/access.py` متصل به `warehouse_scope.py`
  - [x] اصلاح `permissions.py` و حذف ارجاع مرده به `accessible_warehouses`
  - [x] بستن IDOR در `MessageViewSet.get_queryset` بر اساس عضویت در گفتگو
  - [x] بررسی عضویت در `MessageViewSet.perform_create` و ممانعت از ارسال به گفتگوی غیرعضو
  - [x] قرار دادن `is_system`، `conv_type`، `participants` در `read_only_fields` سریالایزرها
  - [x] محدودسازی ویرایش و حذف پیام/کامنت صرفاً به نویسنده (`IsMessageAuthor`)
  - [x] اعتبارسنجی `content_type_str` با Allowlist و بررسی وجود خارجی `object_id`
  - [x] فیلتر مخاطبین `ChatContactsListView` بر اساس انبارهای مشترک
  - [x] تفکیک فایل `views.py` طبق قاعده ۵۰۰ خط به `access.py`، `views.py` و `broadcast.py`
- [x] **فاز ۲ (امن‌سازی پیوست‌ها و سرو رسانه):**
  - [x] افزودن `chat_attachments/` و `comment_attachments/` به `PROTECTED_PREFIXES` در `common/media_urls.py`
  - [x] استفاده از `signed_media_url` در سریالایزر پیوست‌ها و تعیین اعتبار ۷ روزه
  - [x] اعتبارسنجی نوع واقعی فایل (Magic Bytes) و جلوگیری از آپلود پسوندهای خطرناک (XSS)
  - [x] بررسی مالکیت پیام قبل از اتصال فایل در `upload_attachment`
- [x] **فاز ۳ (امن‌سازی WebSocket):**
  - [x] بررسی دسترسی و عضویت در پیام‌های `join_conversation` و `typing` در `consumers.py`
  - [x] تبدیل `current_target_group` در `CommentConsumer` به `set` جهت جلوگیری از نشت روم‌ها
  - [x] انتقال ارسال توکن JWT از Query String به هندشیک اولیه درون‌پروتکلی

---

## 📦 بسته ۲: یکپارچگی داده و پایداری پیام‌ها (Data Integrity & Offline)
> **فازهای سند:** فاز ۴ | **ایرادات پوشش‌داده:** ۱۳، ۱۴، ۱۶، ۱۸، ۱۹، ۲۰، ۲۱، ۲۲، ۲۴ | **وضعیت:** ✅ با موفقیت اجرا و تست شد (۸ تست بک‌اند + ۱۰ تست فرانت‌اند سبز)

- [x] فعال‌سازی Idempotency بر پایه `client_temp_id` جهت جلوگیری از ثبت پیام‌های تکراری
- [x] بازنویسی `perform_destroy` با `soft_delete()` در هر سه ViewSet
- [x] اعمال سقف ۴۰۰۰ کاراکتری `max_length` در سریالایزرهای چت و کامنت
- [x] فعال‌سازی Scoped Throttling در تنظیمات برای ارسال پیام و آپلود
- [x] ثبت رویدادهای حساس چت در `accounts.AuditLog`
- [x] ارسال رویداد وب‌سوکت `chat.message.updated` هنگام بارگذاری پیوست و Merge در فرانت
- [x] پیاده‌سازی استیت سه‌حالته `pending / sent / failed` در `communication.service.ts`
- [x] اصلاح رفتار `_offlinePending` و حفظ پیام بدون تیک دوم کاذب در آفلاین
- [x] پیاده‌سازی متد `retryMessage` و دکمه تلاش مجدد در رابط کاربری

---

## 📦 بسته ۳: بهبود تجربه کاربری و کامنت‌های زنده (UX & Live Comments)
> **فازهای سند:** فاز ۶ + فاز ۷ | **ایرادات پوشش‌داده:** ۲۵، ۲۶، ۲۸، ۲۹، ۳۰، ۳۱، ۳۲، ۳۴، ۳۵، ۳۶، ۳۷، ۳۸، ۳۹، ۴۲

- [x] تک‌نقطه‌ای کردن اتصال وب‌سوکت در `CommunicationService` و حذف اتصالات موازی از `layout.ts`
- [x] پیاده‌سازی Reconnect هوشمند با Exponential Backoff و Jitter
- [x] مشروط کردن صدای اعلان به پیام دیگران (`!msg.is_me`)
- [x] رفع پرش شمارنده پیام‌های خوانده‌نشده (`unread_count`) و اتکا به استیت مرکزی
- [x] اصلاح استخراج نام مخاطب در چت دونفره (`participants.find(p => p.id !== currentUserId)`)
- [x] افزودن قابلیت اسکرول رو به بالا (Infinite Scroll) برای دیدن پیام‌های قدیمی‌تر
- [x] اعمال Debounce روی درخواست‌های `mark-read`
- [x] تایمر انقضای ۵ ثانیه‌ای برای وضعیت «در حال نوشتن...»
- [x] فراخوانی `URL.revokeObjectURL()` جهت جلوگیری از نشت حافظه
- [x] سیم‌کشی ارسال `subscribe_comments` و `unsubscribe_comments` در کامپوننت نظرات
- [x] استخراج منشن با توکن استاندارد سرورسمتی `@[id:username]` برای حل مشکل اسامی فارسی
- [x] ثبت نوتیفیکیشن پایدار در سیستم ممیزی برای کاربران منشن‌شده
- [x] تعبیه عملی تگ `<app-contextual-comments>` در کاردکس کالا و اسناد انبار (`count-tracking`, `manager-review`, `supervisor-dashboard`)

---

## 📦 بسته ۴: کارایی دیتابیس، تنظیمات و پاکسازی نهایی (Performance & Maintenance)
> **فازهای سند:** فاز ۵ + فاز ۸ + فاز ۹ | **ایرادات پوشش‌داده:** ۲۳، ۲۷، ۳۳، ۴۳، ۴۴، ۴۵، ۴۶، ۴۷، ۴۹، ۵۰، ۵۱، ۵۲، ۵۳، ۵۴

- [ ] بازطراحی ساختار خوانده‌شدن به مدل `last_read_message` در `ConversationParticipant`
- [ ] مایگریشن داده‌ای بدون حذف فیلد قدیمی (Dual-write)
- [ ] بهینه‌سازی کوئری‌های N+1 در سریالایزرها با `annotate` و `Prefetch`
- [ ] حذف کوئری N+1 در برودکست پیام و خروج از مسیر اصلی Request (`transaction.on_commit`)
- [ ] اتصال واقعی سوئیچ‌های تنظیمات `chat_enabled` و `chat_file_sharing` در فرانت و بک‌اند
- [ ] اصلاح دستور `purge_expired_chat_media` برای خواندن از `all_objects` و حذف قطعی فایل و رکورد
- [ ] ساخت فایل `communications/admin.py` برای مدیریت پنل ادمین
- [ ] پاکسازی اسکریپت‌های تستی موقت از ریشه بک‌اند
- [ ] حذف ایمپورت‌های هرز (حذف `uuid` و **حفظ حتمی `GenericForeignKey`**)
- [ ] اتصال به `channels_redis.core.RedisChannelLayer` در `settings.py` (در صورت در دسترس بودن ردیس)

</div>
