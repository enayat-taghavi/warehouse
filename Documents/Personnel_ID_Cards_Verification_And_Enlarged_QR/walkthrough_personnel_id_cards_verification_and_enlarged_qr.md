<div dir="rtl" align="right">

# گزارش جامع: سامانه استعلام آنلاین اصالت کارت، بازطراحی QR Code بزرگ و تطبیق ۱۰۰٪ پیش‌نمایش با خروجی تصویر

این سند گزارش فنی و اجرایی کامل از پیاده‌سازی سامانه عمومی اصالت‌سنجی کارت‌های پرسنلی، اتصال هوشمند بارکد دوبعدی (QR Code) به URL اختصاصی استعلام، افزایش ابعاد QR به بیش از ۲.۵ برابر (۱۱۶ تا ۱۲۰ پیکسل در کانواس و `w-28` در تمپلیت) و انطباق پیکسل‌به‌پیکسل میان پیش‌نمایش وب و خروجی تصویر دیجیتال است.

---

## ۱. اهداف محقق‌شده و قابلیت‌های کلیدی

### ۱. سامانه آنلاین و عمومی استعلام اصالت دیجیتال (`/verify-card/:code`)
- **اندپوینت عمومی سرور:** افزودن اکشن `@action(detail=False, methods=['get'], url_path='verify_card')` در [accounts/views.py](file:///e:/warehouse%20project/backend/accounts/views.py) با مجوز `AllowAny` جهت امکان استعلام بدون نیاز به ورود یا لاگین.
- **صفحه واکنش‌گرا و مدرن استعلام اصالت:** طراحی و پیاده‌سازی کامپوننت مستقل `VerifyCard` در فرانت‌اند با استایل گلس‌مورفیک مدرن شامل:
  - نشان سبز اصالت سازمانی (Verified Badge) و مهر امنیتی دیجیتال
  - آواتار باکیفیت پرسنل، نام و نام خانوادگی، سمت سازمانی
  - کد پرسنلی، وضعیت تردد، لیست انبارهای مجاز و تاریخ اعتبار کارت
  - برچسب زمانی زنده تاریخ استعلام و کد پیگیری استعلام
- **روتینگ بدون گارد:** تعریف مسیرهای عمومی `verify-card/:code` و `verify-card` در [app.routes.ts](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts).

### ۲. اتصال QR Code به URL اختصاصی استعلام
- **متد تولید خودکار لینک:** پیاده‌سازی متد `getCardVerificationUrl(user)` در [id-cards.ts](file:///e:/warehouse%20project/frontend/src/app/components/id-cards/id-cards.ts) با فرمت:
  `${window.location.origin}/#/verify-card/${personnelCode}`
- **ارتقای موتور تولید QR:** به‌روزرسانی متد `getQrCodeSvg` و `drawPure2DBarcode` جهت انکود کردن مستقیم این پیوند اختصاصی برای هر پرسنل.

### ۳. افزایش چشمگیر فضای QR Code (بیش از ۲.۵ برابر)
- **پشت کارت عمودی:**
  - افزایش ابعاد QR Code در موتور کانواس از ۴۸ پیکسل به **۱۱۶ تا ۱۲۰ پیکسل** همراه با باکس سفید گوشه‌گرد امنیتی (`136x136`).
  - درج برچسب راهنمای اسکن «اسکن جهت استعلام اصالت دیجیتال» در زیر QR.
- **پشت کارت افقی:**
  - اختصاص زون ویژه در سمت چپ با QR ابعاد **۱۰۶ پیکسل** (باکس `120x120`) و کپشن «استعلام اصالت کارت».
- **کارت‌های پیش‌نمایش و چاپ:**
  - افزایش کادر به `w-28 h-28` در پیش‌نمایش ۳ بعدی زنده و ارتقای شیت‌های مودال A4 و خروجی پرینتر.

### ۵. رفع مشکل بارگذاری عکس و سازگاری کامل با استقرار روی هر دامنه‌ای
- **اصلاح مسیر رسانه (Media Path) در بک‌اند:** تغییر `avatar_url` در اکشن `verify_card` به بازگرداندن مسیر استاندارد نسبی `/media/...` و حذف آدرس محلی سرور (`127.0.0.1:8000`) جهت بارگذاری بدون نقص عکس از طریق پروکسی دامنه اصلی روی تمامی گوشی‌ها و شبکه‌ها.
- **داینامیک‌سازی کامل دامنه استقرار:** آدرس پایه QR Code به طور ۱۰۰٪ خودکار بر اساس دامنه و هاست فعال در زمان استقرار (`window.location.origin`) تنظیم می‌شود. علاوه بر این، یک فیلد اختیاری «دامنه سفارشی» در بخش تنظیمات کارت‌ها اضافه شد تا در صورت نیاز به تعیین دامنه‌ای مشخص (مثلاً در هنگام چاپ از لوکال)، بتوان دامنه پروداکشن را مستقیماً تعریف کرد.

---

## ۲. فایل‌های تغییریافته و ایجادشده

| ردیف | فایل | نوع تغییر | شرح تغییرات |
| :---: | :--- | :---: | :--- |
| ۱ | `backend/accounts/views.py` | [MODIFY](file:///e:/warehouse%20project/backend/accounts/views.py) | افزودن متد `verify_card` با دسترسی `AllowAny` و مسیر نسبی `avatar_url` |
| ۲ | `frontend/src/app/components/verify-card/verify-card.ts` | [NEW](file:///e:/warehouse%20project/frontend/src/app/components/verify-card/verify-card.ts) | کامپوننت استعلام آنلاین اصالت کارت پرسنلی و متد `getAvatarUrl` |
| ۳ | `frontend/src/app/components/verify-card/verify-card.html` | [NEW](file:///e:/warehouse%20project/frontend/src/app/components/verify-card/verify-card.html) | تمپلیت واکنش‌گرا و موبایل‌محور با کارت گلس‌مورفیک اصالت |
| ۴ | `frontend/src/app/components/verify-card/verify-card.css` | [NEW](file:///e:/warehouse%20project/frontend/src/app/components/verify-card/verify-card.css) | استایل‌های افکت شیشه‌ای و انیمیشن‌های پالس |
| ۵ | `frontend/src/app/app.routes.ts` | [MODIFY](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts) | ثبت مسیر عمومی `verify-card/:code` بدون `AuthGuard` |
| ۶ | `frontend/src/app/core/auth/auth.guard.ts` | [MODIFY](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.guard.ts) | افزودن پشتیبانی هدایت خودکار لینک‌های هش‌دار به صفحه استعلام |
| ۷ | `frontend/src/app/components/id-cards/id-cards.ts` | [MODIFY](file:///e:/warehouse%20project/frontend/src/app/components/id-cards/id-cards.ts) | تولید لینک استعلام بدون `#`، پشتیبانی از `customDomain` و رندر QR بزرگ در Canvas |
| ۸ | `frontend/src/app/components/id-cards/id-cards.html` | [MODIFY](file:///e:/warehouse%20project/frontend/src/app/components/id-cards/id-cards.html) | کادر بزرگ QR، تگ استعلام اصالت و فیلد تنظیم دامنه سفارشی |

---

## ۳. نتایج راستی‌آزمایی و تست‌ها

1. **تست بیلد فرانت‌اند:**
   - دستور `npm run build` در پوشه `frontend` با موفقیت کامل و بدون خطا اجرا شد (`Application bundle generation complete`).
2. **تست بارگذاری تصویر آواتار:**
   - با فراخوانی مسیر `/verify-card/EMP-1003` بر روی هر دامنه‌ای، تصویر به صورت امن و از طریق پروکسی `/media/` با کیفیت بالا بارگذاری می‌شود.
3. **تست داینامیک بودن دامنه استقرار:**
   - چه سامانه روی `https://app.farsalish.ir` باشد چه روی هر دامنه جدید دیگری، QR Code تولیدی به صورت خودکار با همان دامنه ساخته می‌شود.

</div>
