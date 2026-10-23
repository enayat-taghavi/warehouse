<div dir="rtl" align="right">

# 🛠️ طرح اجرایی پیاده‌سازی اسنپ‌شات حضور کاربران آنلاین (Presence Snapshot)

این طرح برای حل مشکل عدم نمایش وضعیت کاربرانی که از قبل آنلاین هستند (مانند ورود با کامپیوتر و سپس باز کردن چت در موبایل) ارائه شده است.

---

## 🔍 علت مشکل و راهکار فنی

### ریشه مشکل
هنگام اتصال وب‌سوکت، سرور فقط رویدادهای آینده (`chat.presence`) را مخابره می‌کرد و لیست کاربرانی که پیش از این متصل شده بودند (Initial Online Users Snapshot) را به کلاینت تازه‌متصل ارسال نمی‌کرد.

### راهکار مهندسی
1. **مدیریت کش حضور در بک‌اند (`cache`):** ذخیره و مدیریت مجموعه‌ای از شناسه‌های کاربران فعال متصل به وب‌سوکت در کش سرور (`communications/presence.py`).
2. **ارسال اسنپ‌شات اولیه در لحظه `connect`:** ارسال رویداد `chat.online_users` شامل کلیه شناسه‌های آنلاین به کلاینت متصل‌شده به محض برقراری اتصال.
3. **همگام‌سازی دوره‌ای در `ping` و `get_online_users`:** تمدید حضور کاربر در کش با هر پینگ و پاسخ به درخواست استعلام حضور.
4. **به‌روزرسانی سیگنال `onlineUsers` در فرانت‌اند:** مقداردهی اولیه `onlineUsers` با دریافت `chat.online_users` و به‌روزرسانی پویا با رویدادهای `chat.presence`.

---

## 📂 تغییرات فایل‌ها

### [بک‌اند] Backend (`backend`)

#### [NEW] `backend/communications/presence.py`
- توابع امن و همگام/ناهمگام کش جهت ثبت آنلاین بودن، آفلاین شدن و استعلام لیست کاربران آنلاین:
  - `add_online_user(user_id)`
  - `remove_online_user(user_id)`
  - `get_online_user_ids()`

#### [MODIFY] `backend/communications/consumers.py`
- در `ChatConsumer.connect`: ثبت شناسه کاربر در کش، ارسال مستقیم `chat.online_users` به کلاینت و برودکست `chat.presence` به سایر کاربران.
- در `ChatConsumer.disconnect`: حذف شناسه کاربر از کش و برودکست `offline`.
- در `ChatConsumer.receive`: پشتیبانی از پیام `get_online_users` و تمدید وضعیت در `ping`.

---

### [فرانت‌اند] Frontend (`frontend`)

#### [MODIFY] `frontend/src/app/core/services/communication.service.ts`
- شنود رویداد `chat.online_users` و مقداردهی اولیه سیگنال `onlineUsers`.
- ارسال درخواست استعلام `get_online_users` هنگام باز شدن کشوی چت یا بازگشت فوکوس به صفحه.

---

## 🧪 برنامه اعتبارسنجی (Verification Plan)

### ۱. تست‌های خودکار
- اجرای تست‌های بک‌اند: `python manage.py test communications`
- اجرای تست‌های فرانت‌اند: `npx vitest run src/app/core/services/communication.service.spec.ts`
- راستی‌آزمایی بیلد: `npx ng build --configuration=development --no-progress`

### ۲. تست‌های رفتاری
- اتصال کاربر ۱ (کامپیوتر)، سپس ورود کاربر ۲ (موبایل) و مشاهده بلادرنگ آنلاین بودن کاربر ۱ در لیست همکاران و هدر چت.

</div>
