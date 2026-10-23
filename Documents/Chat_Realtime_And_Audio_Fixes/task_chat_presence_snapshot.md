<div dir="rtl" align="right">

# 📋 لیست تسک‌های سیستم حضور آنلاین چت (Presence Snapshot)

---

### 📊 جدول وضعیت پیشرفت تسک‌ها

| فاز | شرح تسک | اولویت | وضعیت | فایل‌های هدف |
| :--- | :--- | :---: | :---: | :--- |
| **فاز ۱** | ایجاد ماژول کش حضور کاربران در بک‌اند | بالا | ⏳ در انتظار تایید | `communications/presence.py` |
| **فاز ۲** | ارسال اسنپ‌شات اولیه کاربران آنلاین در `ChatConsumer.connect` | بحرانی | ⏳ در انتظار تایید | `communications/consumers.py` |
| **فاز ۳** | دریافت و همگام‌سازی اسنپ‌شات در `CommunicationService` فرانت‌اند | بالا | ⏳ در انتظار تایید | `communication.service.ts` |
| **فاز ۴** | آزمون‌های خودکار و بیلد پروژه | بالا | ⏳ در انتظار تایید | تست‌های Django و Vitest |

---

### 📝 جزئیات تسک‌ها

- [x] **فاز ۱: ماژول کش حضور کاربران در بک‌اند** <!-- id: 0 -->
  - [x] پیاده‌سازی `add_online_user`, `remove_online_user` و `get_online_user_ids` در `backend/communications/presence.py` <!-- id: 1 -->

- [x] **فاز ۲: ادغام اسنپ‌شات در وب‌سوکت بک‌اند** <!-- id: 2 -->
  - [x] ارسال رویداد `chat.online_users` به کلاینت متصل در `backend/communications/consumers.py` <!-- id: 3 -->
  - [x] پشتیبانی از پیام `get_online_users` در `receive` <!-- id: 4 -->

- [x] **فاز ۳: دریافت و مدیریت اسنپ‌شات در فرانت‌اند** <!-- id: 5 -->
  - [x] شنود `chat.online_users` در `frontend/src/app/core/services/communication.service.ts` <!-- id: 6 -->
  - [x] ارسال درخواست استعلام حضور هنگام باز شدن کشوی چت <!-- id: 7 -->

- [x] **فاز ۴: تست‌ها و راستی‌آزمایی** <!-- id: 8 -->
  - [x] اجرای آزمون‌های بک‌اند: `python manage.py test communications` <!-- id: 9 -->
  - [x] اجرای آزمون‌های فرانت‌اند: `npx vitest run` <!-- id: 10 -->
  - [x] راستی‌آزمایی بیلد: `npx ng build --configuration=development` <!-- id: 11 -->

</div>
