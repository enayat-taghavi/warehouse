<div dir="rtl" align="right">

# طرح اجرا: فعال‌سازی واقعی قابلیت «مرا به خاطر بسپار»

در حال حاضر سیستم به صورت پیش‌فرض تمام نشست‌های کاربران را دائمی فرض کرده و توکن‌ها را در `localStorage` ذخیره می‌کند. با این طرح، چک‌باکس "مرا به خاطر بسپار" به شکل واقعی عملیاتی می‌شود.

## User Review Required
> [!IMPORTANT]
> با تایید این طرح، رفتار سیستم تغییر می‌کند. کاربرانی که تیک "مرا به خاطر بسپار" را برمی‌دارند، با بسته شدن تب مرورگر (یا خود مرورگر) بلافاصله از سیستم خارج می‌شوند. این رفتار برای محیط‌های اشتراکی امن‌تر است.

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
      <td><b>HTML لاگین</b></td>
      <td><code>login.html</code></td>
      <td>اتصال دوطرفه چک‌باکس با استفاده از <code>[(ngModel)]="rememberMe"</code></td>
    </tr>
    <tr>
      <td><b>کامپوننت لاگین</b></td>
      <td><code>login.ts</code></td>
      <td>افزودن متغیر <code>rememberMe = true</code> و ارسال آن به متد <code>auth.login()</code></td>
    </tr>
    <tr>
      <td><b>سرویس احراز هویت</b></td>
      <td><code>auth.service.ts</code></td>
      <td>
        ۱. تغییر ساختار به نحوی که اگر <code>rememberMe</code> فعال بود در <code>localStorage</code> و اگر غیرفعال بود در <code>sessionStorage</code> ذخیره کند.<br/>
        ۲. متدهای بازیابی توکن (مثل <code>getAccessToken</code>) تغییر کنند تا ابتدا سشن و سپس لوکال استوریج را بررسی کنند.<br/>
        ۳. متد <code>clearAuth</code> هر دو استوریج را پاک کند.
      </td>
    </tr>
  </tbody>
</table>

### کامپوننت‌های نیازمند تغییر

#### [MODIFY] [login.html](file:///e:/warehouse%20project/frontend/src/app/components/login/login.html)
تغییر کد `<input type="checkbox" checked="">` به اتصال انگولار.

#### [MODIFY] [login.ts](file:///e:/warehouse%20project/frontend/src/app/components/login/login.ts)
ارسال مقدار `this.rememberMe` به سرویس لاگین.

#### [MODIFY] [auth.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.service.ts)
توسعه مکانیزم ذخیره‌سازی داده‌های کاربر (توکن‌ها و پروفایل) متناسب با درخواست او در لحظه ورود.

## Verification Plan

### Manual Verification
1. ابتدا با تیک **فعال** وارد شوید، تب مرورگر را ببندید و دوباره باز کنید. باید بدون درخواست رمز عبور وارد داشبورد شوید.
2. از سیستم خارج شوید. این‌بار با تیک **غیرفعال** وارد شوید. سپس تب را ببندید و یک تب جدید باز کنید. سیستم باید به دلیل پاک شدن `sessionStorage` شما را مستقیماً به صفحه لاگین بازگرداند.

</div>
