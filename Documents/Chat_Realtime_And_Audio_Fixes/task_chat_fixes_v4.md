<div dir="rtl" align="right">

# 📋 لیست تسک‌های سیستم مکالمات سازمانی (نسخه ۴ - سیستم حضور و رفع نام موبایل)

> [!IMPORTANT]
> این برنامه شامل فازهای پیاده‌سازی سیستم حضور زنده آنلاین/آفلاین و رفع قطعی تطبیق نام در موبایل است.

---

### 📊 جدول وضعیت پیشرفت تسک‌ها (Task Matrix)

| فاز | شرح تسک | اولویت | وضعیت | فایل‌های هدف |
| :--- | :--- | :---: | :---: | :--- |
| **فاز ۱** | پیاده‌سازی برودکست رویدادهای حضور (Presence) در سوکت بک‌اند | بالا | ⏳ در انتظار تایید | `communications/consumers.py` |
| **فاز ۲** | اصلاح جامع `getCurrentUserId` با پشتیبانی از رشته و عدد در موبایل | بحرانی | ⏳ در انتظار تایید | `communication.service.ts` |
| **فاز ۳** | اصلاح `getConversationTitle` در چت‌های مستقیم (حذف وابستگی به `conv.title`) | بحرانی | ⏳ در انتظار تایید | `chat-drawer.component.ts` |
| **فاز ۴** | مدیریت استیت آنلاین/آفلاین کاربران و نشانگر سبز در فرانت‌اند | بالا | ⏳ در انتظار تایید | `communication.service.ts`, `chat-drawer.component.html` |
| **فاز ۵** | تست‌های جامع خودکار و بیلد نهایی پروژه | بالا | ⏳ در انتظار تایید | تست‌های Django و بیلد Angular |

---

### 📝 جزئیات تسک‌ها

- [x] **فاز ۱: سیستم حضور زنده آنلاین/آفلاین در بک‌اند** <!-- id: 0 -->
  - [x] عضویت در گروه عمومی `chat_presence` هنگام اتصال و خروج در `backend/communications/consumers.py` <!-- id: 1 -->
  - [x] برودکست رویداد `chat.presence` به کلاینت‌ها با وضعیت `online` و `offline` <!-- id: 2 -->

- [x] **فاز ۲: اصلاح قطعی استخراج شناسه کاربر جاری در موبایل** <!-- id: 3 -->
  - [x] تبدیل قطعی رشته‌ها به عدد در `getCurrentUserId` در `frontend/src/app/core/services/communication.service.ts` <!-- id: 4 -->

- [x] **فاز ۳: اصلاح عنوان چت‌های دونفره در کلاینت موبایل** <!-- id: 5 -->
  - [x] اولویت‌بخشی به استخراج نام طرف مقابل در `getConversationTitle` برای گفتگوهای `direct` در `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts` <!-- id: 6 -->

- [x] **فاز ۴: نشانگرهای آنلاین/آفلاین واقعی در رابط کاربری** <!-- id: 7 -->
  - [x] حذف عبارت هاردکد «آنلاین» و نمایش وضعیت واقعی در هدر چت در `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html` <!-- id: 8 -->
  - [x] نمایش دایره سبز حضور آنلاین روی آواتار همکاران در تب مخاطبین <!-- id: 9 -->

- [x] **فاز ۵: تست‌های جامع و راستی‌آزمایی** <!-- id: 10 -->
  - [x] اجرای آزمون‌های بک‌اند: `python manage.py test communications` <!-- id: 11 -->
  - [x] اجرای آزمون‌های فرانت‌اند: `npx vitest run` <!-- id: 12 -->
  - [x] راستی‌آزمایی بیلد نهایی: `npx ng build --configuration=development` <!-- id: 13 -->

</div>
