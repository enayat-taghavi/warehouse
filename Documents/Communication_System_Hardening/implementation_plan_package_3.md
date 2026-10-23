<div dir="rtl" align="right">

# 📦 طرح اجرایی بسته ۳: بهبود تجربه کاربری، زنده کردن کامنت‌ها و رفع باگ‌های فرانت (UX & Live Comments)

> **سند مرجع:** `Documents\Communication_System_Hardening\package_3_frontend_ux_and_comments.md`  
> **فازهای پوشش‌داده:** فاز ۶ (اصلاح باگ‌های کلاینت) + فاز ۷ (فعال‌سازی واقعی کامنت‌های تعاملی)  
> **پیش‌نیازها:** بسته ۱ (سپر امنیتی) و بسته ۲ (یکپارچگی داده و پایداری آفلاین) که با ۴۶ تست بک‌اند و ۱۰ تست فرانت‌اند سبز شده‌اند.  
> **ایرادات هدف:** ۲۵، ۲۶، ۲۸، ۲۹، ۳۰، ۳۱، ۳۲، ۳۴، ۳۵، ۳۶، ۳۷، ۳۸، ۳۹، ۴۲

---

## 🎯 ۱. اهداف و چشم‌انداز بسته ۳

این بسته تمرکز خود را بر ارتقای چشم‌گیر تجربه کاربری (UX) در کشوی پیام‌رسان و فعال‌سازی بلادرنگ بخش کامنت‌های زمینه‌ای (Contextual Comments) در اسناد و کاردکس کالا قرار می‌دهد:
1. **تک‌نقطه‌ای و پایدارسازی اتصالات وب‌سوکت (`ensureConnected`):** جلوگیری از نشت سوکت‌ها و اتصال‌های موازی در `layout.ts` و کشوی چت، همراه با Reconnect هوشمند نمایی (Exponential Backoff + Jitter) و تشخیص سوکت مرده با Heartbeat Pong.
2. **اصلاح رفتارهای صوتی و شمارش‌ها:** مشروط‌سازی پخش صدای اعلان به پیام‌های دیگران (`!msg.is_me`) با Deduplication و اتکای دقیق به استیت سرور برای شمارنده پیام‌های خوانده‌نشده (`unread_count`).
3. **بهینه‌سازی رابط کشوی چت:** استخراج صحیح نام مخاطب در چت دونفره با فیلتر کاربر جاری، اسکرول بی‌نهایت (Infinite Scroll) برای مرور پیام‌های قدیمی‌تر با `limit/offset`، اعمال Debounce روی `mark-as-read`، انقضای ۵ ثانیه‌ای وضعیت «در حال نوشتن...»، و آزادسازی حافظه `URL.revokeObjectURL()`.
4. **فعال‌سازی بلادرنگ کامنت‌های تعاملی:** سیم‌کشی ارسال پیام‌های `subscribe_comments` و `unsubscribe_comments` در چرخه حیات کامپوننت، دریافت داینامیک `appLabel`، استخراج توکن منشن با فرمت استاندارد `@[id:username]` برای پشتیبانی از اسامی دوقسمتی فارسی، ثبت نوتیفیکیشن پایدار برای منشن‌ها، و تعبیه در کشوی تاریخچه پیگیری شمارش (`count-tracking`) و مودال‌های بررسی مدیر (`manager-review`) و سرپرست (`supervisor`).

---

## 🛠️ ۲. ماتریس تغییرات و فایل‌های تحت ویرایش

| لایه | مسیر فایل | نوع تغییر | شرح تغییرات |
| :--- | :--- | :---: | :--- |
| **سرویس فرانت** | `frontend/src/app/core/services/communication.service.ts` | [MODIFY] | افزودن `ensureConnected`، Reconnect نمایی، Pong Timeout، `loadOlderMessages`، Debounced `markAsRead`، `subscribeComments` و `unsubscribeComments` |
| **تست سرویس فرانت** | `frontend/src/app/core/services/communication.service.spec.ts` | [MODIFY] | افزودن تست‌های واحد فاز ۶ و ۷ (Reconnect، عدم پخش صدا برای پیام خود، Debounce، اشتراک کامنت) |
| **کامپوننت کشوی چت** | `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts` | [MODIFY] | حذف سوکت موازی، فیلتر کاربر جاری در عنوان چت، تایمر ۵ ثانیه‌ای تایپینگ، آزادسازی `revokeObjectURL`، فراخوانی `loadOlderMessages` |
| **قالب کشوی چت** | `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html` | [MODIFY] | افزودن `trackBy` در حلقه پیام‌ها، دکمه/تریگر پیام‌های قدیمی‌تر، تصحیح وضعیت آنلاین/خوانده‌شده |
| **کامپوننت نظرات** | `frontend/src/app/components/communications/contextual-comments/contextual-comments.component.ts` | [MODIFY] | ارسال `subscribe_comments` در `ngOnInit` و `unsubscribe_comments` در `ngOnDestroy`، ورودی `appLabel`، توکن منشن `@[id:username]` |
| **قالب نظرات** | `frontend/src/app/components/communications/contextual-comments/contextual-comments.component.html` | [MODIFY] | بهبود استایل پاسخ‌های تو در تو (Threaded replies) و رندر سلسله‌مراتبی |
| **تست کامپوننت نظرات** | `frontend/src/app/components/communications/contextual-comments/contextual-comments.component.spec.ts` | [NEW] | تست‌های واحد چرخه حیات اشتراک کامنت، اعتبارسنجی منشن، و تعاملات UI |
| **لی‌اوت اصلی** | `frontend/src/app/components/layout/layout.ts` | [MODIFY] | تک‌نقطه‌ای کردن اتصال سوکت با `ensureConnected` و درخواست مجوز نوتیفیکیشن مرورگر |
| **پیگیری شمارش** | `frontend/src/app/components/count-tracking/count-tracking.html` & `.ts` | [MODIFY] | تعبیه کامپوننت `<app-contextual-comments>` در کشوی تاریخچه و گردش کالا |
| **بررسی مدیر** | `frontend/src/app/components/manager-review/manager-review.html` & `.ts` | [MODIFY] | تعبیه کامپوننت نظرات در مودال‌های جزئیات شمارش و سند مالی |
| **کارتابل سرپرست** | `frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html` & `.ts` | [MODIFY] | تعبیه کامپوننت نظرات در مودال‌های جزئیات شمارش |
| **سریالایزر بک‌اند** | `backend/communications/serializers.py` | [MODIFY] | استخراج خودکار منشن‌ها از متن کامنت با الگوی `@[id:username]` و `@username` |
| **ویوهای بک‌اند** | `backend/communications/views.py` | [MODIFY] | ثبت اعلان پایدار در AuditLog / Notifications هنگام منشن کاربر |
| **تست بک‌اند** | `backend/communications/tests/test_ws_comments.py` | [NEW] | تست‌های وب‌سوکت کامنت‌ها: اشتراک، پخش زنده، لغو اشتراک و تفکیک اتاق‌ها |

---

## 🔍 ۳. جزئیات گام‌های اجرایی

### فاز ۶: پایدارسازی کلاینت و رفع باگ‌های کشوی پیام‌رسان
1. **متد `ensureConnected(warehouseId?: number)` در `CommunicationService`:**
   - چک کردن وضعیت سوکت‌های موجود (`chatWs`, `commentWs`). اگر در حالت `CONNECTING` یا `OPEN` باشند و `warehouseId` تغییر نکرده باشد، اتصال جدید باز نمی‌شود.
   - ذخیره `currentWarehouseId` جهت بازاتصال دقیق به روم انبار جاری.
   - پیاده‌سازی مکانیزم Reconnect با Exponential Backoff (1s, 2s, 4s, 8s, ... max 30s) به همراه Jitter تصادفی برای جلوگیری از Thundering Herd.
   - پایش Heartbeat: ارسال `ping` هر ۳۰ ثانیه و بررسی پاسخ `pong`. در صورت عدم دریافت پاسخ در بازه مشخص، سوکت مرده بسته شده و بازاتصال خودکار آغاز می‌شود.
2. **اصلاح پخش صوت اعلان:**
   - گارد بررسی فرستنده: صوت تنها در صورتی پخش می‌شود که `!msg.is_me` باشد و شناسه پیام در کش deduplication وجود نداشته باشد.
3. **همگام‌سازی استیت شمارنده پیام‌های خوانده‌نشده:**
   - حذف افزایش دستی و محلی Unread badge در صورت فعال بودن رویدادهای زنده سرور؛ شمارش کل بر اساس `totalUnreadCount$` و رویدادهای `chat.unread_badge` مدیریت می‌شود.
4. **اصلاح عنوان مکالمه مستقیم:**
   - در `getConversationTitle(conv)`، کاربر جاری با مقایسه شناسه با کاربر لاگین‌شده فیلتر شده و نام طرف مقابل نمایش داده می‌شود.
5. **اسکرول بی‌نهایت و دریافت پیام‌های قدیمی‌تر:**
   - افزودن متد `loadOlderMessages(conversationId: string, offset: number, limit = 30)` در سرویس.
   - در کشوی چت، افزودن رویداد اسکرول به بالا یا دکمه «بارگذاری پیام‌های قدیمی‌تر» بدون پرش اسکرول و با حفظ پیام‌های فعلی.
6. **کنترل و Debounce درخواست‌های `mark-read`:**
   - ایجاد یک `Subject` یا مکانیزم debounce زمانی (۳۰۰ میلی‌ثانیه) روی درخواست‌های خوانده‌شدن جهت جلوگیری از ارسال سیل‌آسای درخواست‌ها در گفتگوهای شلوغ.
7. **انقضای خودکار تایپینگ و رفع نشت حافظه:**
   - تنظیم تایمر ۵ ثانیه‌ای برای پاک‌سازی عبارت «در حال نوشتن...» و لغو تایمر در `ngOnDestroy`.
   - فراخوانی `URL.revokeObjectURL(this.filePreviewUrl)` هنگام لغو فایل انتخابی، پس از ارسال و در `ngOnDestroy`.
   - استفاده از `trackBy: trackByMessageId` در رندر `*ngFor` پیام‌ها.

### فاز ۷: فعال‌سازی واقعی کامنت‌های تعاملی و تعبیه در سامانه
1. **سیم‌کشی وب‌سوکت در `ContextualCommentsComponent`:**
   - در `ngOnInit`: فراخوانی `commService.subscribeComments(this.modelName, this.objectId.toString())`.
   - در `ngOnDestroy`: فراخوانی `commService.unsubscribeComments(this.modelName, this.objectId.toString())`.
   - در `CommunicationService`: نگهداری اشتراک‌های فعال کامنت‌ها و ارسال مجدد پیام‌های `subscribe_comments` به سرور در صورت Reconnect.
2. **پشتیبانی از `appLabel` داینامیک:**
   - افزودن `@Input() appLabel: string = 'inventory'` در کامپوننت و ارسال `${appLabel}.${modelName}` به جای رشته هاردکدشده.
3. **رفع باگ نام‌های فارسی منشن:**
   - پشتیبانی از توکن استاندارد `@[id:username]` در اینپوت و استخراج دقیق شناسه کاربر حتی برای اسامی چندبخشی فارسی (مانند «سید محمد علی حسینی»).
4. **ثبت نوتیفیکیشن پایدار برای منشن‌ها:**
   - ثبت رویداد در `AuditLog` و سیستم اعلان‌ها هنگام منشن افراد در کامنت‌ها.
5. **تعبیه واقعی در صفحات هدف:**
   - **پیگیری وضعیت شمارش (`count-tracking`):** در کشوی تاریخچه و گردش کالا (`isDrawerOpen`).
   - **بررسی نهایی رکوردها (`manager-review`):** در مودال بررسی تسک شمارش (`selectedCountingDetailTask`) و مودال سند مالی (`selectedDocDetailTask`).
   - **کارتابل سرپرست شمارش (`supervisor`):** در مودال جزئیات تسک شمارش.

---

## 🧪 ۴. برنامه تست و راستی‌آزمایی (Verification Plan)

### تست‌های خودکار بک‌اند:
```bash
cd "backend"
.\venv\Scripts\python.exe manage.py test communications -v 2
```

### تست‌های خودکار فرانت‌اند:
```bash
cd "frontend"
npx vitest run src/app/core/services/communication.service.spec.ts
npx vitest run src/app/components/communications/contextual-comments/contextual-comments.component.spec.ts
```

</div>
