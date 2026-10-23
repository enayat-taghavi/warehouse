<div dir="rtl" align="right">

# بررسی و اعمال قوانین ریست رمز عبور

طرح زیر برای پیاده‌سازی نتایج گفتگوی ما تدوین شده است تا امنیت نشست‌های کاربران و فرآیند تغییر رمز را بهبود بخشد.

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
      <td><b>تنظیمات بک‌اند</b></td>
      <td><code>settings.py</code></td>
      <td>افزودن ماژول <code>token_blacklist</code> از کتابخانه SimpleJWT برای اینکه بتوانیم نشست‌ها را به صورت اصولی باطل (Logout) کنیم و انجام دیتابیس مایگریشن.</td>
    </tr>
    <tr>
      <td><b>تغییرات View بک‌اند</b></td>
      <td><code>accounts/views.py</code></td>
      <td>
        <ul>
          <li>ایجاد یک متد جدید با نام <code>admin_reset_password</code> برای ریست کردن رمز توسط ادمین (بازگشت به 123456، اجبار به تغییر مجدد و ابطال تمام توکن‌های کاربر).</li>
          <li>اصلاح متد <code>change_password</code> فعلی برای باطل کردن نشست‌ها پس از تغییر رمز و همچنین <b>عدم اجازه ثبت رمز 123456</b> (یا برابر با مقدار پیش‌فرض).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td><b>مدل و روتر انگولار</b></td>
      <td><code>accounts-http.service.ts</code> و <code>users.ts</code> و <code>users.html</code></td>
      <td>
        اضافه کردن متد فراخوانی API به سرویس و <b>افزودن دکمه "بازنشانی رمز عبور"</b> در منوی سه‌نقطه کاربران برای ادمین تا بتواند مستقیماً رمز کاربر را ریست کند.
      </td>
    </tr>
  </tbody>
</table>

### کامپوننت‌های نیازمند تغییر

#### [MODIFY] [settings.py](file:///e:/warehouse%20project/backend/config/settings.py)
افزودن ابزار لیست سیاه توکن‌ها به `INSTALLED_APPS`.

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/accounts/views.py)
افزودن منطق باطل کردن نشست‌ها در زمان تغییر رمز، اضافه کردن متد اختصاصی برای ادمین، و جلوگیری از استفاده از رمز `123456`.

#### [MODIFY] [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts)
ایجاد تابع `adminResetPassword(userId: number)`.

#### [MODIFY] [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html) و [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts)
گنجاندن دکمه ریست رمز و اتصال آن به متد بک‌اند.

## Verification Plan

### Manual Verification
1. با یک ادمین لاگین کرده و یک کاربر دیگر بسازیم یا در یک مرورگر دیگر با کاربر دوم لاگین کنیم.
2. با ادمین رمز کاربر دوم را ریست می‌کنیم. باید کاربر دوم به محض کلیک در صفحه، از سیستم خارج شود یا با خطای اعتبار توکن مواجه گردد و به صفحه لاگین برگردد.
3. کاربر دوم پس از لاگین با `123456` باید اجباراً به صفحه تغییر رمز هدایت شود و نتواند رمز را روی `123456` تنظیم کند.

</div>
