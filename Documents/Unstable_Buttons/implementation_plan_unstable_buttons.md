<div dir="rtl" align="right">

# اصلاح مشکل تاخیر واکنش دکمه‌ها (Event Coalescing Bug) در سراسر سیستم

در بررسی‌های انجام شده در فایل‌های کامپوننت مختلف سامانه مشخص شد که در برخی کلاس‌ها که دارای متدهای `toggle` و تغییرات وضعیت ظاهری هستند (نظیر منوها، مدال‌ها، دراپ‌داون‌ها و نمایش رمز عبور)، تغییر وضعیت به دلیل روشن بودن حالت `eventCoalescing` انگولار ۱۸ با تاخیر مواجه می‌شود و تا زمانی که کاربر اکشن دیگری در صفحه انجام ندهد ظاهر به‌روز نمی‌شود.

با جستجو در کل کدبیس سیستم، متوجه شدیم که در کامپوننت‌هایی مثل `users.ts`، `supervisor-dashboard.ts`، `manager-review.ts` و `projects.ts` از قبل دستور `this.cdr.detectChanges()` به درستی اضافه شده است. اما این فراخوانی در برخی کامپوننت‌های کلیدی جا افتاده است.

## User Review Required
> [!IMPORTANT]
> با تایید این طرح، یک آپدیت جزئی اما سراسری روی تمام دکمه‌های ناپایدار ذکر شده در جدول زیر اعمال می‌شود. این به‌روزرسانی برای تایید نهایی شما نیازمند بررسی دستی (Manual Testing) خواهد بود.

## Proposed Changes

<table dir="rtl" align="right" border="1" style="width: 100%; text-align: right;">
  <thead>
    <tr>
      <th>نام کامپوننت / بخش</th>
      <th>فایل مورد نظر</th>
      <th>شرح دقیق اصلاحات</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>صفحه لاگین (Login)</b><br/><em>دکمه چشم رمز عبور</em></td>
      <td><code>login.ts</code></td>
      <td>اضافه کردن <code>this.cdr.detectChanges()</code> به انتهای متد <code>togglePassword()</code>.</td>
    </tr>
    <tr>
      <td><b>منوی اصلی (Layout)</b><br/><em>دکمه منوی کاربر در داشبورد</em></td>
      <td><code>layout.ts</code></td>
      <td>1. تزریق `ChangeDetectorRef` در سازنده (Constructor)<br/>2. اضافه کردن <code>this.cdr.detectChanges()</code> به متد <code>toggleUserMenu()</code>.</td>
    </tr>
    <tr>
      <td><b>جدول داده (Data Table)</b><br/><em>فیلترها و دراپ‌داون‌های جدول</em></td>
      <td><code>data-table.component.ts</code></td>
      <td>1. تزریق `ChangeDetectorRef` در کلاس<br/>2. اضافه‌کردن به‌روزرسانی فوری در متدهای: <br/><code>toggleFilterDropdown</code><br/><code>applyCustomRange</code><br/><code>clearCustomRange</code><br/><code>clearCustomDateRange</code></td>
    </tr>
  </tbody>
</table>

### کامپوننت‌های نیازمند تغییر

#### [MODIFY] [login.ts](file:///e:/warehouse%20project/frontend/src/app/components/login/login.ts)
اضافه کردن `detectChanges` پس از تغییر `passwordFieldType`.

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
تزریق وابستگی `ChangeDetectorRef` و اضافه‌کردن آن در متد `toggleUserMenu()`.

#### [MODIFY] [data-table.component.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/data-table/data-table.component.ts)
این کامپوننت پیچیده و پرتکرار سیستم است. برای فیلترها و مودال‌های پاپ‌آپ داخل تیبل، نیاز است `ChangeDetectorRef` تزریق شده و به‌روزرسانی در متدهای کلیدی تغییر وضعیت فیلترها فراخوانی شود.

## Verification Plan

### Manual Verification
- ورود به صفحه لاگین و تست دکمه چشم با یک کلیک (بدون کلیک اضافه).
- ورود به سیستم و تست دکمه منوی کاربری در گوشه سمت راست بالا در `layout`.
- تست جدول داده‌ها (مثلا در صفحه انبارها یا کاربران) و کلیک روی آیکن فیلتر هر ستون برای اطمینان از باز شدن فوری پنجره کشویی بدون نیاز به کلیک مضاعف.

</div>
