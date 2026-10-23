<div dir="rtl" align="right">

# 📋 لیست تسک‌های مرتب‌سازی بلادرنگ گفتگوها (Chat Realtime Reordering)

---

### 📊 جدول وضعیت پیشرفت تسک‌ها

| فاز | شرح تسک | اولویت | وضعیت | فایل‌های هدف |
| :--- | :--- | :---: | :---: | :--- |
| **فاز ۱** | اصلاح `handleNewMessage` جهت انتقال گفتگوی جدید به صدر لیست | بحرانی | ⏳ در انتظار تایید | `communication.service.ts` |
| **فاز ۲** | انتقال فوری گفتگو به صدر هنگام ارسال پیام در `sendMessage` | بالا | ⏳ در انتظار تایید | `communication.service.ts` |
| **فاز ۳** | آزمون‌های واحد فرانت‌اند و بیلد نهایی | بالا | ⏳ در انتظار تایید | `communication.service.spec.ts` |

---

### 📝 جزئیات تسک‌ها

- [x] **فاز ۱: انتقال گفتگوی پیام جدید به صدر لیست** <!-- id: 0 -->
  - [x] تغییر ساختار به‌روزرسانی `conversations$` به قرار دادن گفتگوی آپدیت‌شده در اندیس صفر در `frontend/src/app/core/services/communication.service.ts` <!-- id: 1 -->
  - [x] فراخوانی خودکار `loadConversations` در صورت دریافت پیام در گفتگوی جدید <!-- id: 2 -->

- [x] **فاز ۲: انتقال گفتگو به صدر لیست هنگام ارسال پیام** <!-- id: 3 -->
  - [x] به‌روزرسانی `last_message` و انتقال گفتگوی فعال به صدر لیست در متد `sendMessage` <!-- id: 4 -->

- [x] **فاز ۳: تست‌ها و راستی‌آزمایی** <!-- id: 5 -->
  - [x] افزودن تست‌های واحد به `frontend/src/app/core/services/communication.service.spec.ts` <!-- id: 6 -->
  - [x] اجرای تست‌های فرانت‌اند: `npx vitest run` <!-- id: 7 -->
  - [x] راستی‌آزمایی بیلد نهایی: `npx ng build --configuration=development` <!-- id: 8 -->

</div>
