<div dir="rtl" align="right">

# 🚀 گزارش جامع پیاده‌سازی و راستی‌آزمایی سیستم حضور واقعی و رفع نام چت در موبایل (نسخه ۴)

> [!NOTE]
> هر دو مورد گزارش‌شده (مشکل نام چت‌ها در موبایل و وضعیت حضور واقعی کاربران) با موفقیت کامل پیاده‌سازی، متصل و توسط آزمون‌های خودکار فرانت‌اند و بک‌اند ۱۰۰٪ تایید شدند.

---

### 📋 خلاصه تغییرات و نتایج رفع خطاها

| ردیف | شرح موضوع | علت ریشه‌ای | راهکار مهندسی اعمال‌شده | وضعیت تست |
| :---: | :--- | :--- | :--- | :---: |
| **۱** | **نمایش نام «مدیر شرکت» در موبایل** | اولویت داشتن `conv.title` سرور و عدم تبدیل قطعی شناسه کاربر جاری از رشته به عدد در `localStorage` موبایل | اصلاح متد `getCurrentUserId` برای پشتیبانی قطعی از شناسه‌های رشته‌ای و عددی + نادیده گرفتن `conv.title` در چت‌های مستقیم و استخراج مستقیم نام طرف مقابل | ✅ رفع کامل (تست‌های واحد Vitest و بیلد OK) |
| **۲** | **آنلاین نشان دادن همه افراد** | استاتیک و هاردکد بودن برچسب `<p>آنلاین</p>` در هدر کشوی چت | پیاده‌سازی سیستم حضور زنده (Real-Time Presence) با گروه وب‌سوکت `chat_presence` در بک‌اند، مدیریت سیگنال `onlineUsers` در فرانت‌اند و نمایش نقطه سبز پالس‌دار فقط برای کاربران متصل | ✅ عملکرد زنده و تایید در تست‌ها |

---

### 📁 فایل‌های ویرایش‌شده و جزئیات کد

#### ۱. بک‌اند: `backend/communications/consumers.py`
- عضویت در کانال عمومی `chat_presence` هنگام اتصال به وب‌سوکت چت
- برودکست رویداد `chat.presence` با وضعیت `online` هنگام اتصال کاربر و `offline` هنگام قطع اتصال
- پیاده‌سازی متد `chat_presence_event` برای مخابره تغییر وضعیت به تمام کلاینت‌های متصل

#### ۲. فرانت‌اند: `frontend/src/app/core/services/communication.service.ts`
- افزودن سیگنال `onlineUsers = signal<Set<number>>(new Set())`
- افزودن متد `isUserOnline(userId)` جهت بررسی آنلاین بودن هر کاربر
- شنود رویداد `chat.presence` و به‌روزرسانی آنی لیست کاربران آنلاین
- اصلاح متد `getCurrentUserId()` جهت تجزیه بدون نقص شناسه‌ها (اعم از عدد یا رشته) از `localStorage`، `sessionStorage` و توکن‌های JWT
- افزودن متد `disconnect()` جهت بستن امن سوکت‌ها و ریست لیست حضور

#### ۳. فرانت‌اند: `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts`
- بازنویسی تابع `getConversationTitle` برای اولویت دادن به نام طرف مقابل در تمام چت‌های دو‌نفره
- افزودن متدهای `getOtherParticipant` و `isOtherUserOnline` برای بررسی وضعیت آنلاین بودن طرف مقابل در گفتگوی جاری و لیست گفتگوها

#### ۴. فرانت‌اند: `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html`
- حذف برچسب استاتیک «آنلاین» و جایگزینی با وضعیت پویا:
  - حالت تایپ کردن: «در حال نوشتن...»
  - حالت آنلاین: نقطه سبز پالس‌دار + متن «آنلاین»
  - حالت آفلاین: متن «آفلاین»
  - حالت گروه‌ها/کانال‌ها: نمایش تعداد اعضا
- افزودن نشانگر سبز رنگ آنلاین روی آواتار همکاران در تب «همکاران انبار» و لیست گفتگوها

---

### 🧪 نتایج تست‌ها و راستی‌آزمایی (Verification Evidence)

#### ۱. آزمون‌های خودکار بک‌اند جنگو:
```powershell
.\venv\Scripts\python.exe manage.py test communications
----------------------------------------------------------------------
Ran 64 tests in 103.376s

OK
Destroying test database for alias 'default'...
```

#### ۲. آزمون‌های واحد فرانت‌اند (Vitest):
```bash
npx vitest run src/app/core/services/communication.service.spec.ts src/app/components/communications/contextual-comments/contextual-comments.component.spec.ts

 ✓ src/app/components/communications/contextual-comments/contextual-comments.component.spec.ts (5 tests) 8ms
 ✓ src/app/core/services/communication.service.spec.ts (17 tests) 49ms

 Test Files  2 passed (2)
      Tests  22 passed (22)
```

#### ۳. بیلد کامل برنامه (Angular Build):
```bash
npx ng build --configuration=development --no-progress
Application bundle generation complete. [30.437 seconds]
Output location: frontend\dist\warehouse-app
```

</div>
