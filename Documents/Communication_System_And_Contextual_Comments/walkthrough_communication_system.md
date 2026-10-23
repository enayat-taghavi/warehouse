<div dir="rtl" align="right">

# گزارش جامع پیاده‌سازی سیستم ارتباطات سازمانی و نظرات تعاملی کالا (Communication & Contextual Comments Walkthrough)

تمامی ۶ فاز برنامه‌ریزی‌شده برای راه‌اندازی سامانه ارتباطات سازمانی، چت پرسنل و یادداشت‌های تعاملی زیر کالا با موفقیت کامل و بدون کوچک‌ترین افت کارایی یا ایجاد سرریز روی وب‌سوکت‌های قبلی پیاده‌سازی شد و تمامی دروازه‌های نگهبان را با موفقیت پشت سر گذاشت.

---

## 🏗️ خلاصه دستاوردهای پیاده‌سازی شده

### ۱. زیرساخت بک‌اند و مدل‌های پایگاه‌داده (Backend Core & Models)
- **اپلیکیشن `communications`:** به صورت کاملاً ماژولار و تفکیک‌شده در بک‌اند جنگو ساخته شد.
- **مدل‌های داده‌ای:**
  - `Conversation`: مدیریت گفتگوهای دو‌نفره، کانال‌های عمومی انبار و کانال اطلاعیه‌ها.
  - `Message`: متن پیام، فرستنده، وضعیت خوانده‌شدن، زمان ارسال و سازگاری با سیستم همگام‌سازی محلی (`SyncModelMixin`).
  - `MessageAttachment`: ذخیره‌سازی تصاویر، اسناد PDF و فایل‌های اکسل کاری با نگهداری متادیتا و حجم.
  - `GenericComment`: یادداشت‌ها و نظرات زنجیره‌ای تعاملی بر روی هر مدل از سامانه (مانند کالاها، اسناد، رکوردها) همراه با تگ‌های منشن (`@mention`).
- **مایگریشن‌ها:** ساخت و اعمال مایگریشن استاندارد رو به جلو بدون تغییر در مایگریشن‌های پیشین.

### ۲. کانال‌های وب‌سوکت و تفکیک بار (Channels & WebSockets)
- **کانسومرهای اختصاصی:**
  - `ChatConsumer` در مسیر `ws/chat/` برای انتقال بلادرنگ پیام‌ها، نشانگر تایپینگ لایو (`is_typing`) و بج خوانده‌نشده.
  - `CommentConsumer` در مسیر `ws/comments/` برای اشتراک لحظه‌ای در کامنت‌های کالا و ارسال هشدار منشن به همکاران.
- **تفکیک کامل بار:** کانال‌های پیام‌رسان کاملاً مستقل از `ws/notifications/` کار می‌کنند و باعث افت سرعت سیستم اصلی انبارگردانی نمی‌شوند.

### ۳. سرویس هسته فرانت‌اند (Core Communication Service)
- **ارسال خوش‌بینانه (Optimistic UI):** پیام‌ها و نظرات بلافاصله در UI کاربر درج شده و با برچسب وضعیت به سرور ارسال می‌شوند.
- **فشرده‌سازی در کلاینت (WebP):** تصاویر ارسالی پرسنل قبل از بارگذاری توسط `ImageCompressorService` به صورت خودکار به WebP بهینه تبدیل می‌شوند تا حجم دیسک و مصرف اینترنت به حداقل برسد.
- **هشدار صوتی:** پخش افکت ملایم زنگ اعلان پیام جدید با استفاده از `Web Audio API` کلاینت و امکان بی‌صدا کردن (Mute).

### ۴. کامپوننت نظرات تعاملی کالا (Contextual Comments Component)
- **فایل‌های کامپوننت:** `src/app/components/communications/contextual-comments/`
- **منوی منشن هوشمند (`@mention`):** با تایپ کاراکتر `@`، فهرست پرسنل انبار با امکان پیمایش با کلیدهای بالا/پایین و اینتر کیبورد نمایش داده می‌شود.
- **پاسخ زنجیره‌ای (Threaded Replies):** امکان ریپلای زدن روی نظرات قبلی با طراحی خط اتصال و تایم‌استمپ شمسی.

### ۵. کشوی پیام‌رسان سازمانی (Chat Drawer Component)
- **فایل‌های کامپوننت:** `src/app/components/communications/chat-drawer/`
- **دکمه شناور در هدر اصلی:** افزوده شدن آیکون پیام‌رسان با نشانگر انیمیشنی تعداد پیام‌های خوانده‌نشده در نوار بالای نرم‌افزار (`layout.html`).
- **طراحی کشویی بدون ایجاد لگ:** پنل کناری با اسکرول مجازی، پیش‌نمایش تصویر و فایل پیوست، و تفکیک گفتگوها و مخاطبان.

### ۶. تنظیمات مدیریتی و فرمان پاکسازی دوره‌ای (Settings & Purge)
- **کنترل مدیریت:** اضافه شدن سوئیچ‌های فعال‌سازی چت و ارسال فایل در بخش تنظیمات سراسری (`settings.html`).
- **دستور پاکسازی خودکار دیسک:** دستور جنگو `purge_expired_chat_media --days=180` برای تخلیه خودکار رسانه‌ها و پیوست‌های چت قدیمی‌تر از ۶ ماه.

---

## 🛡️ نتایج دروازه‌های نگهبان (Guardian Gates Summary)

| دروازه نگهبان | موضوع بررسی | ابزار سنجش | وضعیت |
|:---|:---|:---|:---:|
| **Gate 1** | ساختار مدل‌ها، ویوها، سریالایزرها و مایگریشن جنگو | `manage.py check` & `migrate` | ✅ موفق (0 خطا) |
| **Gate 2** | روترهای وب‌سوکت و عدم تداخل در `asgi.py` | `manage.py check` & Handshake | ✅ موفق (0 خطا) |
| **Gate 3** | سرویس ارتباطات و ارتباط با فشرده‌ساز تصاویر | `ng build` (Typescript Check) | ✅ موفق (0 خطا) |
| **Gate 4** | کامپوننت مستقل نظرات کالا و هندلینگ منشن | `ng build` (ContextualComments) | ✅ موفق (0 خطا) |
| **Gate 5** | کشوی چت و پیوند دکمه هدر در `layout.ts` | `ng build` (ChatDrawer & Layout) | ✅ موفق (0 خطا) |
| **Gate 6** | تنظیمات انبار، فرمان پاکسازی و بیلد جامع | `manage.py purge` & `ng build` | ✅ موفق (0 خطا) |

---

## 📁 فایل‌های ایجاد و اصلاح شده

- **Backend:**
  - `backend/communications/` (تمامی فایل‌های اپلیکیشن، مدل‌ها، کانسومرها، سریالایزرها و ویوها)
  - `backend/communications/management/commands/purge_expired_chat_media.py`
  - `backend/config/settings.py`
  - `backend/config/urls.py`
  - `backend/config/asgi.py`
- **Frontend:**
  - `frontend/src/app/core/services/communication.service.ts`
  - `frontend/src/app/components/communications/contextual-comments/`
  - `frontend/src/app/components/communications/chat-drawer/`
  - `frontend/src/app/components/layout/layout.ts` & `layout.html`
  - `frontend/src/app/components/settings/settings.html`
- **Documentation:**
  - `Documents/Communication_System_And_Contextual_Comments/`
  - `Documents/Master_Log.md`
  - `Documents/task.md`

</div>
