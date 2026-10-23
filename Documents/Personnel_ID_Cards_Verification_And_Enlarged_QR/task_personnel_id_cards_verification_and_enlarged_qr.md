<div dir="rtl" align="right">

# چک‌لیست وظایف: بازطراحی QR Code بزرگ، سامانه استعلام اصالت کارت و تطبیق ۱۰۰٪ پیش‌نمایش با خروجی تصویر

- [x] **فاز ۱: ایجاد سامانه آنلاین استعلام و صفحه عمومی اصالت‌سنجی کارت (Verification Page & Route)**
  - [x] ساخت کامپوننت مستقل `VerifyCard` در مسیر `src/app/components/verify-card/` (فایل‌های `verify-card.ts`, `verify-card.html`, `verify-card.css`)
  - [x] افزودن مسیرهای عمومی `{ path: 'verify-card/:code', component: VerifyCard }` و `{ path: 'verify-card', component: VerifyCard }` در [app.routes.ts](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts) بدون نیاز به گارد احراز هویت
  - [x] پیاده‌سازی منطق استخراج کد، لود مشخصات، تایید وضعیت اصالت، نمایش عکس باکیفیت، سمت، مجوزهای فعال، تاریخ اعتبار و برچسب زمانی اسکن
  - [x] راستی‌آزمایی مستقل فاز ۱ از طریق باز کردن مسیر استعلام در مرورگر

- [x] **فاز ۲: اتصال QR Code به لینک استعلام و ارتقای موتور خروجی تصویر Canvas (QR URL & Canvas Engine)**
  - [x] اضافه کردن متد `getCardVerificationUrl(user: User): string` در [id-cards.ts](file:///e:/warehouse%20project/frontend/src/app/components/id-cards/id-cards.ts) جهت تولید خودکار URL کامل استعلام
  - [x] به‌روزرسانی متدهای `getQrCodeSvg` و `drawPure2DBarcode` جهت انکود کردن URL کامل استعلام
  - [x] بازطراحی بخش پشت و روی کارت در `drawCardFaceOnCanvas` و افزایش ابعاد QR Code به بیش از ۲.۵ برابر (۱۱۶ پیکسل) همراه با باکس امنیتی، متن راهنمای اسکن و تراز مهر حراست
  - [x] راستی‌آزمایی مستقل فاز ۲ از طریق دانلود خروجی PNG و اسکن آن با بارکدخوان/دوربین

- [x] **فاز ۳: بازطراحی کادر بزرگ QR در HTML و تطبیق ۱۰۰٪ با کانواس (HTML Live Preview & 100% Canvas Sync)**
  - [x] بازطراحی پشت و روی کارت در [id-cards.html](file:///e:/warehouse%20project/frontend/src/app/components/id-cards/id-cards.html) با باکس بزرگ QR (`w-28` تا `w-32`) و تگ راهنمای اسکن
  - [x] یکپارچه‌سازی شیت‌های پیش‌نمایش مودال A4 و شیت چاپ پرینتر
  - [x] هماهنگ‌سازی و تطبیق ۱:۱ فواصل، تایپوگرافی، مهر حراست و مشخصات میان HTML و Canvas
  - [x] راستی‌آزمایی مستقل فاز ۳ از طریق مقایسه چشمی و سنجش ساید‌بای‌ساید پیش‌نمایش و فایل تصویری دانلود شده

- [x] **فاز ۴: تست نهایی بیلد، اعتبارسنجی جامع و مستندسازی DUAL-SAVE (Build & Finalization)**
  - [x] اجرای بیلد موفق با دستور `npm run build`
  - [x] تست سناریوهای جامع (چرخش کارت، تغییر تم‌ها، پرسنل مختلف و پرینت)
  - [x] تکمیل مستندات `walkthrough.md` و بستن وظایف در مستر لاگ اسناد

</div>
