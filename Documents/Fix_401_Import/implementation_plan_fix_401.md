<div dir="rtl" align="right">

# طرح اجرا: رفع مشکل خطای ۴۰۱ در مدیریت کالا

این طرح در راستای رفع باگی است که به دلیل ذخیره شدن توکن در `sessionStorage` (عدم فعال بودن مرا به خاطر بسپار) رخ داده است.

## User Review Required
> [!NOTE]
> با اینکه شما قبلاً تایید دادید، طبق قوانین سیستم برای هرگونه تغییر در سورس‌کد باید فایل طرح ایجاد و توسط شما (یا به صورت خودکار) تایید شود. 

## Proposed Changes

<table dir="rtl" align="right" border="1" style="width: 100%; text-align: right;">
  <thead>
    <tr>
      <th>بخش</th>
      <th>فایل مورد نظر</th>
      <th>شرح وظایف و اصلاحات</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>سرویس API مدیریت کالا</b></td>
      <td><code>item-api.service.ts</code></td>
      <td>تزریق (Inject) کردن <code>AuthService</code> و جایگزین کردن <code>localStorage.getItem</code> با <code>auth.getAccessToken()</code> در متد <code>bulkImportStream</code>.</td>
    </tr>
    <tr>
      <td><b>کامپوننت اسناد (دانلود لاگ)</b></td>
      <td><code>docs.ts</code></td>
      <td>تزریق کردن <code>AuthService</code> و جایگزین کردن متد قدیمی برای فراخوانی توکن.</td>
    </tr>
  </tbody>
</table>

### کامپوننت‌های نیازمند تغییر

#### [MODIFY] [item-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/item-api.service.ts)
اضافه کردن `AuthService` به constructor و تغییر نحوه گرفتن توکن.

#### [MODIFY] [docs.ts](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.ts)
اضافه کردن `AuthService` به constructor و استفاده از آن در بخش `downloadLog()`.

## Verification Plan

### Manual Verification
1. به صفحه لاگین بروید و با تیک **غیرفعال** لاگین کنید.
2. به صفحه مدیریت کالا بروید.
3. یک فایل اکسل آپلود کنید. اکنون باید فرآیند پردازش و تزریق بدون ارور `401` انجام شود.
4. روی دکمه دریافت لاگ کلیک کنید. دانلود لاگ باید با موفقیت شروع شود.

</div>
