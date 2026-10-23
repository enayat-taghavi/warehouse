<div dir="rtl" align="right">

# طرح جامع رفع باگ‌های سیستم تصویر پرسنلی و وب‌کم (Avatar Camera, Pan & Display Fixes)

این طرح فنی، راه‌حل‌های دقیق و ریشه‌ای برای رفع ۳ ایراد گزارش‌شده توسط کاربر در سیستم تصاویر پرسنلی را مشخص می‌کند:
1. **رفع سیاهی تصویر هنگام ثبت با دوربین (Webcam Frame Capture)**
2. **فعال‌سازی جابه‌جایی کامل و روان عکس به چپ، راست، بالا و پایین (Pointer Events & Pan Controls)**
3. **تصحیح پروکسی فایل‌های رسانه (`/media/`) و کش مرورگر جهت نمایش آنی عکس در هدر و کارت‌های پرسنلی**

---

## ۱. تحلیل علل ریشه‌ای مشکلات (Root Cause Analysis)

| ردیف | شرح ایراد | علت ریشه‌ای فنی | راه‌حل اجرایی |
| :---: | :--- | :--- | :--- |
| **۱** | **سیاه شدن عکس دوربین بعد از ثبت** | عدم تخصیص `muted` به تگ `<video>` در مرورگرها، خواندن فریم قبل از تکمیل `readyState >= 2` و عدم فراخوانی `ChangeDetectorRef` در زمان سوییچ مودال که باعث می‌شد Canvas در لحظه رسم در DOM آماده نباشد و بوم مشکی نمایش دهد. | افزودن `muted` و `playsinline`، اطمینان از `video.readyState >= 2` و ابعاد معتبر، فراخوانی `cdr.detectChanges()` و رسم Canvas در چرخه `requestAnimationFrame`. |
| **۲** | **عدم جابه‌جایی عکس به چپ و راست** | رویدادهای ماوس روی بوم محدود به `mouseleave` بودند و رفتار پیش‌فرض Drag مرورگر را متوقف نمی‌کردند؛ همچنین رویدادهای لمسی (Touch) پشتیبانی نمی‌شدند. | بازنویسی تعامل Canvas با **HTML5 Pointer Events** و `setPointerCapture` و `touch-action: none` + افزودن دکمه‌های ناوبری جهت‌دار (⬅️ ➡️ ⬆️ ⬇️) در نوار ابزار. |
| **۳** | **عدم نمایش عکس در پنل و هدر کاربر** | در `proxy.conf.json` و `server.js` فقط مسیرهای `/api` و `/ws` پروکسی شده بودند و مسیر `/media` تعریف نشده بود؛ بنابراین مرورگر به جای عکس WebP، فایل `index.html` را دریافت می‌کرد و تصویر لود نمی‌شد. | افزودن مسیر `/media` به `proxy.conf.json` و `server.js` + اعمال Cache-Busting هوشمند (`?t=timestamp`) در به‌روزرسانی زنده. |

---

## ۲. تغییرات پیشنهادی به تفکیک فایل‌ها (Proposed Changes)

### الف) کانفیگ پروکسی و سرور فرانت‌اند (Proxy & Media Routing)
#### [MODIFY] [proxy.conf.json](file:///e:/warehouse%20project/frontend/proxy.conf.json)
- افزودن روت `"/media"` با هدف `http://127.0.0.1:8000` و `changeOrigin: true`.

#### [MODIFY] [server.js](file:///e:/warehouse%20project/frontend/server.js)
- به‌روزرسانی `pathFilter` برای عبور دادن تمامی درخواست‌های با پیشوند `/media` به بک‌اند جنگو.

---

### ب) کامپوننت مودال برش و دوربین (Avatar Cropper Modal)
#### [MODIFY] [avatar-cropper-modal.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.ts)
- تزریق `ChangeDetectorRef` جهت همگام‌سازی فوری DOM.
- اصلاح `startCamera`: اجرای `video.play()` با `onloadedmetadata` و رفع ارورهای احتمالی.
- اصلاح `captureFromCamera`: بررسی `video.readyState` و ابعاد معتبر، رسم فریم روی Canvas موقت، تغییر `activeMode = 'crop'` و اجرای `cdr.detectChanges()` قبل از `drawCanvas`.
- بازنویسی کامل سیستم Pan با Pointer Events (`onPointerDown`, `onPointerMove`, `onPointerUp`) با `setPointerCapture` و `releasePointerCapture`.
- افزودن متدهای `nudge(dx, dy)` جهت جابه‌جایی دقیق با دکمه‌های جهت‌دار.

#### [MODIFY] [avatar-cropper-modal.html](file:///e:/warehouse%20project/frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.html)
- افزودن ویژگی‌های `autoplay playsinline muted` به تگ `<video>`.
- اتصال رویدادهای `pointerdown`, `pointermove`, `pointerup`, `pointercancel` به Canvas.
- افزودن دکمه‌های جابه‌جایی چهارگانه (⬅️، ➡️، ⬆️، ⬇️) در کنترل‌بار پایین جهت کاربری آسان.

#### [MODIFY] [avatar-cropper-modal.css](file:///e:/warehouse%20project/frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.css)
- افزودن `touch-action: none; user-select: none;` به بوم نقاشی و محفظه آن.
- استایل‌دهی دکمه‌های جهت‌دار جابه‌جایی عکس.

---

### ج) به‌روزرسانی زنده در هدر و لیست کاربران (Live State & Cache Invalidation)
#### [MODIFY] [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts) & [auth.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.service.ts)
- اطمینان از افزودن پارامتر زمان (`?t=...`) به URL آواتار تا مرورگر کش قدیمی را نخواند و تصویر بلافاصله به‌روزرسانی شود.

---

## ۳. طرح آزمون و راستی‌آزمایی (Verification Plan)

### ۱. تست وب‌کم و ثبت عکس (Webcam Capture Test)
- باز کردن مودال در حالت دوربین -> ثبت عکس -> تایید عدم وجود فریم سیاه و لود کامل عکس واقعی روی Canvas.

### ۲. تست جابه‌جایی و کراپ (Pan & Crop Interaction Test)
- تست کشیدن عکس به چپ، راست، بالا و پایین با ماوس و تاچ.
- تست کلیک روی دکمه‌های جهت‌دار ⬅️ ➡️ ⬆️ ⬇️ و اطمینان از جابه‌جایی دقیق عکس در کادر.

### ۳. تست نمایش بلادرنگ در پنل و هدر (Avatar Display & Proxy Test)
- ذخیره تصویر جدید برای کاربر لاگین‌شده -> تایید نمایش فوری تصویر WebP در دایره هدر ناوبری بدون رفرش.
- ورود به بخش مدیریت کاربران -> تایید نمایش تصویر بر روی کارت پرسنلی.
- اجرای `npx ng build --configuration=development` جهت تایید عدم وجود خطای کامپایل.

</div>
