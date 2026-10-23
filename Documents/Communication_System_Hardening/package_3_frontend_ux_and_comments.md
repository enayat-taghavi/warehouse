<div dir="rtl" align="right">

# 📦 بسته ۳: بهبود تجربه کاربری، زنده کردن کامنت‌ها و رفع باگ‌های فرانت (UX & Live Comments)

> **سند مرجع:** [implementation_plan_communication_hardening.md](implementation_plan_communication_hardening.md)
> **فازهای پوشش‌داده:** فاز ۶ + فاز ۷
> **پیش‌نیاز:** بسته ۱ و ۲
> **ایرادات حل‌شده:** ۲۵، ۲۶، ۲۸، ۲۹، ۳۰، ۳۱، ۳۲، ۳۴، ۳۵، ۳۶، ۳۷، ۳۸، ۳۹، ۴۲

---

## 🎯 هدف بسته ۳
رفع تمام باگ‌های محسوس در کشوی چت فرانت‌اند (نشت اتصالات سوکت، صدای اعلان پیام خودی، پرش شمارنده Unread، تیک دوم کاذب، نشت حافظه تصویر)، سیم‌کشی ارسال وب‌سوکت کامنت‌های تعاملی، اصلاح توکن منشن با نام فارسی و تعبیه کامپوننت در صفحات هدف کالا و انبار.

---

## 🛠️ فایل‌های تحت تغییر در این بسته

| لایه | مسیر فایل | نوع تغییر |
| :--- | :--- | :---: |
| **تست فرانت** | `frontend/src/app/components/communications/contextual-comments/contextual-comments.component.spec.ts` | [NEW] |
| **تست فرانت** | `frontend/src/app/core/services/communication.service.spec.ts` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/core/services/communication.service.ts` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/components/communications/contextual-comments/contextual-comments.component.ts` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/components/communications/contextual-comments/contextual-comments.component.html` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/components/layout/layout.ts` | [MODIFY] |
| **فرانت‌اند** | کامپوننت‌های هدف (کاردکس کالا / اسناد انبار) | [MODIFY] |
| **بک‌اند** | `backend/communications/serializers.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/views.py` | [MODIFY] |

---

## 📋 چک‌لیست اقدامات اجرایی بسته ۳

### فاز ۶: اصلاح باگ‌های کلاینت
- [ ] تک‌نقطه‌ای کردن اتصال سوکت با متد `ensureConnected()` و حذف فراخوانی‌های موازی در `layout.ts` و کشوی چت
- [ ] اعمال Reconnect هوشمند با Exponential Backoff و هندل کردن `pong`
- [ ] مشروط کردن پخش صدا به `!msg.is_me`
- [ ] مدیریت Unread Badge صرفاً از طریق استیت مرکزی سرور
- [ ] اصلاح عنوان چت دونفره با فیلتر شناسه کاربر جاری
- [ ] پیاده‌سازی اسکرول رو به بالا (Infinite Scroll) برای مشاهده پیام‌های قدیمی‌تر
- [ ] اعمال Debounce روی درخواست‌های `mark-read`
- [ ] انقضای خودکار وضعیت «در حال نوشتن...» بعد از ۵ ثانیه
- [ ] آزادسازی حافظه با `URL.revokeObjectURL()` هنگام بستن پیش‌نمایش تصویر

### فاز ۷: فعال‌سازی واقعی کامنت‌های تعاملی
- [ ] ارسال `subscribe_comments` در `ngOnInit` و `unsubscribe_comments` در `ngOnDestroy`
- [ ] حذف نام برنامه هاردکدشده (`inventory.`) و دریافت `appLabel` داینامیک
- [ ] استخراج منشن با توکن استاندارد `@[id:username]` برای رفع باگ اسامی دوقسمتی فارسی
- [ ] ثبت رکورد نوتیفیکیشن پایدار در دیتابیس برای کاربران آفلاین منشن‌شده
- [ ] تعبیه تگ `<app-contextual-comments>` در تب یادداشت‌های کارت کالا و اسناد انبار

---

## 🛡️ گیت پذیرش و فرمان‌های راستی‌آزمایی

```bash
# اجرای تست‌های واحد کامپوننت‌ها و سرویس فرانت‌اند
cd "E:/warehouse project/frontend" && npm test

# اجرای تست‌های وب‌سوکت کامنت‌ها در بک‌اند
cd "E:/warehouse project/backend" && python manage.py test communications -v 2
```

---

## 💬 پرامپت آماده برای شروع چت ۳ (کپی و ارسال در چت جدید)

```text
سلام. من می‌خواهم «بسته ۳: بهبود تجربه کاربری، زنده کردن کامنت‌ها و رفع باگ‌های فرانت» از سیستم ارتباطات را پیاده‌سازی کنم.
لطفاً فایل‌های زیر را مبنا قرار بده:
1. Documents\Communication_System_Hardening\package_3_frontend_ux_and_comments.md
2. Documents\Communication_System_Hardening\task_communication_hardening.md
3. Documents\Communication_System_Hardening\implementation_plan_communication_hardening.md

بسته‌های ۱ و ۲ قبلاً اجرا شده‌اند. لطفاً فازهای ۶ و ۷ را مطابق چک‌لیست بسته ۳ پیاده‌سازی کن و تست‌های فرانت و بک‌اند را اجرا کن.
```

</div>
