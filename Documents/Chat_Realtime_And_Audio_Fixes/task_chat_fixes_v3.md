<div dir="rtl" align="right">

# 📋 لیست تسک‌های سیستم مکالمات سازمانی (نسخه ۳ - کامل)

> [!IMPORTANT]
> این برنامه شامل ۶ فاز اجرایی جهت رفع کامل مشکلات UI، وب‌سوکت، وضعیت تیک‌ها، بج هدر، و جلوگیری از رکوردهای خالی است.

---

### 📊 جدول وضعیت پیشرفت تسک‌ها (Task Matrix)

| فاز | شرح تسک | اولویت | وضعیت | فایل‌های هدف |
| :--- | :--- | :---: | :---: | :--- |
| **فاز ۱** | نمایش تمام کاربران فعال در تب همکاران (رفع خالی بودن در موبایل) | بالا | ⏳ در انتظار تایید | `communications/views.py` |
| **فاز ۲** | اصلاح قطعی عنوان گفتگوها با مقایسه رشته‌ای و مستقل از نوع داده | بالا | ⏳ در انتظار تایید | `chat-drawer.component.ts` |
| **فاز ۳** | انتقال رفرنس اسکرول و پیاده‌سازی اسکرول روان به آخرین پیام | بالا | ⏳ در انتظار تایید | `chat-drawer.component.html`, `.ts` |
| **فاز ۴** | پیاده‌سازی حالت چت موقت (Draft Mode) و فیلتر گفتگوهای خالی | بحرانی | ⏳ در انتظار تایید | `chat-drawer.component.ts`, `views.py` |
| **فاز ۵** | رفع باگ بج هدر بالای صفحه (نمایش عدد خوانده‌نشده + پالس چشمک‌زن) | بالا | ⏳ در انتظار تایید | `communication.service.ts`, `layout.html` |
| **فاز ۶** | پیاده‌سازی سیستم تک‌تیک (`✓`) و دو‌تیک (`✓✓`) بلادرنگ با وب‌سوکت | بالا | ⏳ در انتظار تایید | `broadcast.py`, `views.py`, `chat-drawer.component.html` |
| **فاز ۷** | تست‌های جامع خودکار و بیلد نهایی پروژه | بالا | ⏳ در انتظار تایید | تست‌های Django و بیلد Angular |

---

### 📝 جزئیات تسک‌ها

- [x] **فاز ۱: نمایش تمام کاربران فعال در تب همکاران** <!-- id: 0 -->
  - [x] بازگرداندن تمام کاربران فعال به جز کاربر جاری در `ChatContactsListView` در `backend/communications/views.py` <!-- id: 1 -->
  - [x] بررسی دریافت لیست مخاطبان در کلاینت موبایل <!-- id: 2 -->

- [x] **فاز ۲: اصلاح قطعی نام مخاطب در گفتگوهای دو‌نفره** <!-- id: 3 -->
  - [x] اعمال مقایسه رشته‌ای `String(p.id) !== String(currentUserId)` در `getConversationTitle` در `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts` <!-- id: 4 -->
  - [x] اعتبارسنجی نمایش نام صحیح طرف مقابل در تمام سناریوها <!-- id: 5 -->

- [x] **فاز ۳: اسکرول خودکار و روان به انتهای چت** <!-- id: 6 -->
  - [x] انتقال رفرنس `#messagesScroll` به کانتینر والد دارای `overflow-y-auto` در `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html` <!-- id: 7 -->
  - [x] پیاده‌سازی `scrollTo({ top: scrollHeight, behavior: 'smooth' })` در `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts` <!-- id: 8 -->

- [x] **فاز ۴: حالت چت موقت (Draft Mode) و عدم ایجاد گفتگوی خالی** <!-- id: 9 -->
  - [x] بازنویسی `startDirectChat` جهت باز کردن پنجره چت موقت بدون فراخوانی API ایجاد چت <!-- id: 10 -->
  - [x] ارتقای چت موقت به چت ذخیره‌شده واقعی به محض ارسال اولین پیام متنی یا فایل <!-- id: 11 -->
  - [x] فیلتر کردن گفتگوهای مستقیم فاقد پیام در `ConversationViewSet` در بک‌اند <!-- id: 12 -->

- [x] **فاز ۵: بج هدر بالای صفحه و پالس پیام جدید** <!-- id: 13 -->
  - [x] اصلاح باگ صفر شدن شمارنده در رویداد سوکت `chat.unread_badge` در `frontend/src/app/core/services/communication.service.ts` <!-- id: 14 -->
  - [x] عدم علامت‌گذاری خودکار پیام‌ها به عنوان خوانده‌شده هنگام بسته بودن کشوی چت (`!isChatDrawerOpen()`) <!-- id: 15 -->
  - [x] ایجاد بج نمایش عدد با پالس چشمک‌زن هنگام رسیدن پیام جدید در `frontend/src/app/components/layout/layout.html` <!-- id: 16 -->

- [x] **فاز ۶: سیستم تک‌تیک و دو‌تیک بلادرنگ** <!-- id: 17 -->
  - [x] پیاده‌سازی تابع `broadcast_read_receipt_ws` در `backend/communications/broadcast.py` <!-- id: 18 -->
  - [x] فراخوانی برودکست در متد `mark_as_read` در `backend/communications/views.py` <!-- id: 19 -->
  - [x] شنود رویداد `chat.read_receipt` در `frontend/src/app/core/services/communication.service.ts` و به‌روزرسانی وضعیت پیام‌های فرستنده <!-- id: 20 -->
  - [x] رندر تفکیکی `✓` (ارسال‌شده) و `✓✓` (خوانده‌شده) در `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html` <!-- id: 21 -->

- [x] **فاز ۷: تست‌های جامع و راستی‌آزمایی** <!-- id: 22 -->
  - [x] اجرای آزمون‌های بک‌اند: `python manage.py test communications` <!-- id: 23 -->
  - [x] اجرای آزمون‌های فرانت‌اند: `npx vitest run` <!-- id: 24 -->
  - [x] راستی‌آزمایی بیلد نهایی: `npx ng build --configuration=development` <!-- id: 25 -->

</div>
