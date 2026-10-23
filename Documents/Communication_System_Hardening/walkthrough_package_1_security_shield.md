<div dir="rtl" align="right">

# 🛡️ گزارش جامع اجرای بسته ۱: سپر امنیتی، کنترل دسترسی و تست پایه (Walkthrough - Package 1)

> **دامنه اجرایی:** فازهای ۰، ۱، ۲ و ۳ از بسته ۱ (سپر امنیتی سیستم ارتباطات و نظرات کالا/سند)  
> **روش توسعه:** توسعه مبتنی بر آزمون (TDD Baseline) با اثبات اولیه رخنه‌های امنیتی (Red Flags)  
> **وضعیت نهایی:** ✅ **۱۰۰٪ سبز در ۳۸ آزمون خودکار بک‌اند و ۵ آزمون خودکار فرانت‌اند**

---

## 📊 ۱. خلاصه نتایج آزمون‌های خودکار

| ماژول تست | فایل آزمون | تعداد تست‌ها | وضعیت نهایی | زمان اجرا |
| :--- | :--- | :---: | :---: | :---: |
| **کنترل دسترسی REST و IDOR** | `communications/tests/test_access_rest.py` | ۱۷ تست | ✅ پاس شد (OK) | ~۱۸ ثانیه |
| **امنیت پیوست‌ها و لینک امضاشده** | `communications/tests/test_attachments.py` | ۱۱ تست | ✅ پاس شد (OK) | ~۱۲ ثانیه |
| **امنیت وب‌سوکت و ایزولاسیون روم‌ها** | `communications/tests/test_ws_access.py` | ۱۰ تست | ✅ پاس شد (OK) | ~۴۶ ثانیه |
| **مجموع تست‌های بک‌اند جنگو** | `python manage.py test communications` | **۳۸ تست** | ✅ **OK (۳۸/۳۸)** | **۷۶.۳ ثانیه** |
| **تست‌های واحد کلاینت Angular** | `communication.service.spec.ts` | **۵ تست** | ✅ **OK (۵/۵)** | **۰.۹ ثانیه** |

---

## 🔐 ۲. تغییرات و لایه‌های پیاده‌سازی‌شده

### فاز ۰: هارنس تست پایه و اثبات قرمز (Phase 0: TDD Harness)
* ساخت کلاس پایه [`BaseCommsTestCase`](file:///e:/warehouse%20project/backend/communications/tests/base.py) با شبیه‌سازی ۲ انبار مستقل (`wh1` و `wh2`)، ۵ کاربر با نقش‌های متفاوت (سوپریوزر، مدیر انبار ۱، کارمند انبار ۱، کارمند انبار ۲ و کاربر بدون انبار).
* نگارش ۱۷ تست اولیه که پیش از اصلاحات، ۱۲ شکست قرمز (IDOR در چت و کامنت، تغییر نوع گفتگو، تزریق پیام جعلی سیستم و دسترسی به فایل) را اثبات کردند.

### فاز ۱: لایه دسترسی واحد در REST و رفع IDOR (Phase 1: Centralized Access Layer)
* ایجاد ماژول منبع واحد حقیقت [`communications/access.py`](file:///e:/warehouse%20project/backend/communications/access.py):
  * توابع `can_read_conversation` و `can_write_to_conversation` متصل به `warehouse_scope.py`.
  * تابع `can_access_comment_target` جهت اعتبارسنجی مجاز بودن دسترسی کاربر به انبار سند یا کالای موضوع کامنت.
* تفکیک کدهای برودکست وب‌سوکت در [`communications/broadcast.py`](file:///e:/warehouse%20project/backend/communications/broadcast.py) جهت ممانعت از بزرگ شدن فایل‌ها و رعایت سخت‌گیرانه سقف ۵۰۰ خط.
* اصلاح کلاس‌های پرمیشن در [`communications/permissions.py`](file:///e:/warehouse%20project/backend/communications/permissions.py) و حذف باگ ارجاع به فیلد ناموجود `conversation.warehouse_id`.
* امن‌سازی [`communications/serializers.py`](file:///e:/warehouse%20project/backend/communications/serializers.py):
  * قرار گرفتن `is_system`, `conv_type`, `participants` در `read_only_fields`.
  * اعتبارسنجی امن `content_type_str` و `object_id` در `GenericCommentSerializer`.
* بازنویسی و ایمن‌سازی کامل [`communications/views.py`](file:///e:/warehouse%20project/backend/communications/views.py):
  * اعمال فیلتر عضویت در `get_queryset` برای `MessageViewSet`.
  * پاسخ ۴۰۰ دقیق به‌جای ۵۰۰ در نبود `conversation_id`.
  * اعمال پرمیشن ۴۰۳ در اکشن‌های Detail.
  * فیلتر مخاطبین در `ChatContactsListView` فقط بر اساس انبارهای مشترک سازمانی.

### فاز ۲: امن‌سازی پیوست‌ها و سرو رسانه با URL امضاشده (Phase 2: Attachments & Signed URLs)
* افزودن پیشوندهای `chat_attachments/` و `comment_attachments/` به `PROTECTED_PREFIXES` در [`common/media_urls.py`](file:///e:/warehouse%20project/backend/common/media_urls.py).
* صدور لینک‌های امضاشده HMAC (`?e=...&s=...`) برای تمامی فایل‌های ارسالی چت و نظرات.
* اعتبارسنجی هدر و بایت‌های واقعی فایل‌ها (Magic Bytes) و مسدودسازی فایل‌های HTML، اسکریپت و SVG به منظور دفع کامل حملات Stored XSS.
* ذخیره فایل‌ها با نام یکتای تصادفی UUID روی دیسک جهت رفع خطر Path Traversal.
* اعمال هدر `Content-Disposition: attachment` برای فایل‌های غیرتصویر دانلودی.

### فاز ۳: امن‌سازی وب‌سوکت و پیشگیری از شنود زنده (Phase 3: WebSocket Security)
* بازنویسی [`communications/consumers.py`](file:///e:/warehouse%20project/backend/communications/consumers.py):
  * احراز هویت الزامی با توکن معتبر JWT در اتصال به `/ws/chat/` و `/ws/comments/`.
  * کنترل عضویت کاربر پیش از پیوستن به روم‌های گفتگوی خصوصی در رویدادهای `join_conversation` و `typing`.
  * اعتبارسنجی انبار کاربر پیش از اتصال به روم‌های `chat_warehouse_{id}`.
  * تفکیک روم‌های کامنت در `CommentConsumer` بر پایه `set` و اعتبارسنجی دسترسی انبار کالا/سند قبل از پیوستن به روم `comments_{model}_{id}`.
  * ایزولاسیون کامل برودکست‌ها و عدم نشت پیام‌های خصوصی به کاربران غیرعضو.

---

## 🧪 ۳. مستندات خروجی ترمینال

```bash
# خروجی تست‌های بک‌اند:
Creating test database for alias 'default' ('test_warehouse_db')...
Operations to perform:
  Apply all migrations: accounts, admin, auth, axes, communications, contenttypes, inventory, personnel, reports, sessions, token_blacklist, warehouses
...
Ran 38 tests in 76.369s

OK
Destroying test database for alias 'default' ('test_warehouse_db')...

# خروجی تست‌های فرانت‌اند:
 ✓  warehouse-app  src/app/core/services/communication.service.spec.ts (5 tests) 20ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  923ms
```

---

## 📋 ۴. رعایت قواعد معماری و استانداردها

1. **قاعده سقف ۵۰۰ خط:** تمامی فایل‌های ماژول `communications` با تفکیک به فایل‌های `access.py`, `broadcast.py`, `serializers.py`, `views.py`, `consumers.py` دارای حداکثر ۳۱۰ خط هستند.
2. **عدم حذف یا تداخل در کدهای قبلی:** ساختار سیستم با حفظ سازگاری کامل با سایر ماژول‌های انبارداری (`inventory`, `warehouses`, `personnel`) پیاده‌سازی شد.
3. **DUAL-SAVE:** تمامی اسناد و پلن‌ها در هر دو مسیر آرتیفکت‌های مغز ایجنت و پوشه اسناد پروژه ذخیره شدند.

</div>
