<div dir="rtl" align="right">

# طرح اجرا: رفع مشکل نمایش فایل آپلود شده پس از بازگشت به تب مدیریت کالا

این طرح برای رفع این مشکل است که وقتی کاربری فایلی را برای تزریق انتخاب می‌کند و تب را عوض کرده و بازمی‌گردد، فایل از نظر ظاهری در باکس ناپدید می‌شود اما در پس‌زمینه وجود دارد. 

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
      <td><b>کامپوننت آپلود فایل</b></td>
      <td><code>file-upload.component.ts</code></td>
      <td>افزودن متغیر <code>@Input() selectedFile: File | null = null;</code> تا بتوانیم از بیرون به آن فایل را پاس بدهیم.</td>
    </tr>
    <tr>
      <td><b>قالب صفحه اسناد (مدیریت کالا)</b></td>
      <td><code>docs.html</code></td>
      <td>درست کردن بایندینگ فایل با قرار دادن <code>[selectedFile]="importService.currentState.fileToUpload"</code> در المان <code>app-file-upload</code>.</td>
    </tr>
  </tbody>
</table>

### کامپوننت‌های نیازمند تغییر

#### [MODIFY] [file-upload.component.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/file-upload/file-upload.component.ts)
تغییر وضعیت <code>selectedFile</code> از حالت لوکال به یک پراپرتی ورودی (Input).

#### [MODIFY] [docs.html](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.html)
ارسال فایلی که در حافظه ذخیره شده است به کامپوننت دیداری فایل آپلود.

## Verification Plan

### Manual Verification
1. به صفحه مدیریت کالا بروید.
2. یک فایل برای تزریق انتخاب کنید. اسم فایل در باکس ظاهر می‌شود.
3. به صفحه داشبورد بروید.
4. دوباره به صفحه مدیریت کالا برگردید. اسم فایل همچنان باید در باکس دیده شود.

</div>
