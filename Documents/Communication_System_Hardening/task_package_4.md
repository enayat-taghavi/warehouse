<div dir="rtl" align="right">

# 📋 چک‌لیست عملیاتی بسته ۴: کارایی دیتابیس، پنل ادمین، تنظیمات و پاکسازی نهایی (Task Checklist)

> **بسته هدف:** بسته ۴ (فاز ۵ + فاز ۸ + فاز ۹)  
> **سند مرجع:** [implementation_plan_package_4.md](implementation_plan_package_4.md)  
> **وضعیت:** تکمیل‌شده و با موفقیت کامل راستی‌آزمایی شد (۶۵ تست سبز)

---

## 📦 گام‌های اجرایی بسته ۴

- [x] **گام ۱: بازطراحی وضعیت خوانده‌شدن و مدل اعضا (فاز ۵)**
  - [x] تعریف مدل `ConversationParticipant` در `models.py` با قیود یکتایی و بدون ایندکس تکراری
  - [x] حذف ایمپورت هرز `uuid` و **حفظ حتمی `GenericForeignKey`**
  - [x] ایجاد مایگریشن‌های ساختار و داده‌ای برای انتقال داده‌های فعلی `read_by`
  - [x] بازنویسی `mark_as_read` در `views.py` به صورت تک‌کوئری اتمیک با حفظ Dual-write
  - [x] اصلاح `since_id` در `MessageViewSet` با Tie-breaker روی `id`

- [x] **گام ۲: حذف کوئری‌های N+1 و بهینه‌سازی سریالایزرها و برودکست (فاز ۵)**
  - [x] بهینه‌سازی `get_last_message` با `Prefetch` در `ConversationViewSet`
  - [x] محاسبه `unread_count` با `annotate` در ViewSet و حذف کوئری‌های حلقه‌ای سریالایزر
  - [x] بهینه‌سازی `read_by_count` در پیام‌ها با `annotate`
  - [x] خارج کردن ارسال وب‌سوکت از مسیر اصلی Request با `transaction.on_commit`
  - [x] حذف کوئری N+1 به‌ازای هر عضو در `broadcast.py`

- [x] **گام ۳: اتصال واقعی تنظیمات و لایه دسترسی (فاز ۸)**
  - [x] افزودن `chat_enabled` و `chat_file_sharing` به `DEFAULT_SETTINGS` در `warehouses/services.py`
  - [x] انتشار سوئیچ‌های چت در `PublicConfigViewSet`
  - [x] ایجاد پرمیشن `IsChatEnabled` و گارد ۴۰۳ در تمام ViewSetهای چت و نظرات
  - [x] بررسی `chat_file_sharing` در `upload_attachment` و رد آپلود در صورت خاموش بودن
  - [x] رد اتصال وب‌سوکت با کد ۴۰۰۳ در `ChatConsumer` هنگام خاموش بودن چت
  - [x] اتصال سیگنال `isChatEnabled` در فرانت به `PublicConfig` دریافتی سرور

- [x] **گام ۴: دستور پاکسازی دیسک و پنل ادمین و پاکسازی نهایی (فاز ۸)**
  - [x] اصلاح دستور `purge_expired_chat_media.py` برای خواندن از `all_objects` و حذف فیزیکی فایل‌ها و Hard Delete رکوردها
  - [x] ایجاد ماژول مدیریت ادمین جنگو `communications/admin.py`
  - [x] حذف ۵ اسکریپت تستی موقت از ریشه `backend/`

- [x] **گام ۵: پیکربندی لایه کانال‌های Redis (فاز ۹)**
  - [x] تنظیم `CHANNEL_LAYERS` در `settings.py` بر پایه متغیر محیطی Redis با Fallback امن

- [x] **گام ۶: تست‌های خودکار و راستی‌آزمایی جامع**
  - [x] ایجاد فایل تست کارایی `test_performance.py` (۶ تست)
  - [x] ایجاد فایل تست تنظیمات و Purge با نام `test_settings_and_purge.py` (۸ تست)
  - [x] اجرای کل مجموعه تست‌های بک‌اند (تمام ۶۵ تست سبز)
  - [x] اجرای `python manage.py check` (بدون هیچ خطا یا هشدار)

</div>
