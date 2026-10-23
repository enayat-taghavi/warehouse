<div dir="rtl" align="right">

# طرح اجرایی رفع نواقص امنیتی و رابط کاربری رمز عبور

با توجه به نتایج مصاحبه و انتخاب‌های شما، این طرح برای رفع کامل مشکلات مطرح شده تدوین شده است. در این طرح ما مشکل خارج نشدن کاربر پس از ریست رمز و همچنین مستقل شدن و واکنش‌گرایی دکمه‌های چشم در صفحه تغییر رمز را برطرف می‌کنیم.

## Proposed Changes

<table dir="rtl" align="right" border="1" style="width: 100%; text-align: right;">
  <thead>
    <tr>
      <th>بخش سیستم</th>
      <th>فایل مورد نظر</th>
      <th>توضیحات و اقدام</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="4"><b>بک‌اند (امنیت و احراز هویت)</b></td>
      <td><code>accounts/models.py</code></td>
      <td>افزودن فیلد جدید <code>password_changed_at</code> به مدل کاربر (CustomUser) برای ذخیره زمان آخرین تغییر رمز و اجرای Migration.</td>
    </tr>
    <tr>
      <td><code>accounts/views.py</code></td>
      <td>به‌روزرسانی متدهای <code>change_password</code> و <code>admin_reset_password</code> تا در صورت تغییر رمز، فیلد <code>password_changed_at</code> کاربر نیز با زمانِ همان لحظه آپدیت شود.</td>
    </tr>
    <tr>
      <td><code>accounts/authentication.py</code><br/>(فایل جدید)</td>
      <td>ایجاد کلاس <code>CustomJWTAuthentication</code>. این کلاس زمان صدور توکن (<code>iat</code>) را با <code>password_changed_at</code> کاربر مقایسه می‌کند. اگر توکن قبل از تغییر رمز ساخته شده باشد، خطای ۴۰۱ (نامعتبر) برمی‌گرداند.</td>
    </tr>
    <tr>
      <td><code>config/settings.py</code></td>
      <td>تنظیم این کلاس احراز هویتِ اختصاصی به عنوان اعتبارسنج اصلی در <code>REST_FRAMEWORK</code> جایگزین کلاس پیش‌فرض SimpleJWT.</td>
    </tr>
    <tr>
      <td rowspan="2"><b>فرانت‌اند (رابط کاربری)</b></td>
      <td><code>change-password.ts</code></td>
      <td>تغییر متغیر مشترک وضعیتِ دکمه چشم، به سه متغیر مستقل (برای رمز قبلی، جدید و تکرار). همچنین افزودن <code>ChangeDetectorRef</code> برای حل مشکل عدم واکنش (مانند صفحه لاگین).</td>
    </tr>
    <tr>
      <td><code>change-password.html</code></td>
      <td>متصل کردن هر دکمه چشم به تابع مستقل خودش تا وضعیت نمایان/مخفی شدن فقط روی همان یک ورودی اعمال شود.</td>
    </tr>
  </tbody>
</table>

### تغییرات دقیق فایل‌ها

#### [MODIFY] [accounts/models.py](file:///e:/warehouse%20project/backend/accounts/models.py)
افزودن فیلد `password_changed_at = models.DateTimeField(auto_now_add=True)`.

#### [NEW] [accounts/authentication.py](file:///e:/warehouse%20project/backend/accounts/authentication.py)
ایجاد این فایل برای میزبانی لاجیک سفارشی چک کردنِ اعتبار زمانی توکن‌ها.

#### [MODIFY] [settings.py](file:///e:/warehouse%20project/backend/config/settings.py)
به‌روزرسانی کلید `DEFAULT_AUTHENTICATION_CLASSES`.

#### [MODIFY] [change-password.ts](file:///e:/warehouse%20project/frontend/src/app/components/change-password/change-password.ts)
حذف `passwordFieldType` مشترک و جایگزین کردن آن با متغیرهای اختصاصی برای هر فیلد و انجام به‌روزرسانی دستی ویو (`this.cdr.detectChanges()`).

## Verification Plan

### تست‌های دستی
1. با یک کاربر وارد می‌شویم تا توکن دسترسی دریافت شود.
2. با اکانت ادمین رمز او را ریست می‌کنیم (یا کاربر رمز خودش را عوض می‌کند).
3. وقتی کاربر دوباره درخواستی بزند (بدون لاگین مجدد)، با توجه به اینکه زمان توکنش قدیمی‌تر از زمان تغییر رمز است، بلافاصله خطای دسترسی صادر شده و بیرون انداخته می‌شود.
4. در صفحه تغییر رمز، تست می‌کنیم که هر ۳ فیلد دارای دکمه چشم اختصاصی هستند و کلیک روی یکی، وضعیت نمایشِ فیلدهای دیگر را تغییر نمی‌دهد و بلافاصله واکنش نشان می‌دهد.

</div>
