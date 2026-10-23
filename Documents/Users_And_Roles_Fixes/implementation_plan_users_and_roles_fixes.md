<div dir="rtl" align="right">

# طرح اجرایی نهایی و هوشمند اصلاح صفحه کاربران و نقش‌ها (Users & Roles)

این طرح اجرایی با هدف برطرف کردن تمامی باگ‌های منطقی، خطاهای سینتکسی، عدم تطابق‌های فرانت‌اند و بک‌اند، و پیاده‌سازی **موتور ایمپورت فوق هوشمند** برای اکسل کاربران و نقش‌ها تنظیم شده است.

---

## ۱. مرور نیازمندی‌ها و بازبینی تغییرات (User Review Required)

> [!IMPORTANT]
> **۱. قابلیت‌های ایمپورت فوق هوشمند (Smart Excel Import):**
> - **تطبیق دوگانه نام و کد:** شناسایی نقش‌ها بر اساس هر دو عنوان فارسی (مانند «سرپرست انبار») و نام انگلیسی (`supervisor`)؛ شناسایی انبارها بر اساس کد انبار (`WH-1`) و نام انبار («انبار مرکزی»).
> - **پذیرش انواع جداکننده‌ها:** پشتیبانی از ویرگول فارسی (`،`)، انگلیسی (`,`)، نقطه-ویرگول (`;`) و اینتر.
> - **پاکسازی و نرمال‌سازی خودکار:** تبدیل ارقام فارسی/عربی به انگلیسی، اصلاح فرمت شماره موبایل (`09...`)، افزودن خودکار صفرهای سمت چپ کدملی در صورت حذف توسط اکسل.
> - **انعطاف در ستون‌ها:** تشخیص خودکار ستون‌ها حتی در صورت جابجایی ترتیب ستون‌ها.
> - **گزینه به‌روزرسانی هوشمند (Upsert Switch):** در مودال آپلود اکسل یک سوییچ قرار می‌گیرد تا کاربر بتواند انتخاب کند آیا رکوردهای تکراری موجود به‌روزرسانی (Update) شوند یا رد (Skip/Error) گردند.
>
> **۲. حفظ ساختار دو سطری هدرهای اکسل:**
> - **سطر اول:** عنوان فارسی فیلدها.
> - **سطر دوم:** کلید انگلیسی دیتابیسی (`name`, `title`, `color`, `parent`, `permissions`).
> - **سطر سوم به بعد:** داده‌ها (۵ ستون استاندارد برای نقش‌ها).
>
> **۳. تغییرات دیتابیس (Migration):**
> فیلدهای `company` و `address` به مدل `CustomUser` اضافه شده و مایگریشن اجرا خواهد شد.

---

## ۲. شرح تغییرات پیشنهادی به تفکیک فایل‌ها (Proposed Changes)

### بخش ۱: بک‌اند (Django Accounts App)

#### [MODIFY] [models.py](file:///e:/warehouse%20project/backend/accounts/models.py)
- افزودن `company = models.CharField(max_length=150, null=True, blank=True, verbose_name="شرکت متبوع")`.
- افزودن `address = models.TextField(null=True, blank=True, verbose_name="آدرس")`.

#### [MODIFY] [serializers.py](file:///e:/warehouse%20project/backend/accounts/serializers.py)
- افزودن فیلدهای `company` و `address` به فیلدهای `UserSerializer`.

#### [MODIFY] [excel_utils.py](file:///e:/warehouse%20project/backend/accounts/excel_utils.py)
- رفع باگ سینتکسی فراخوانی `freeze_header_panes`.
- پیاده‌سازی متدهای پاکسازی داده (`normalize_digits`, `normalize_phone`, `normalize_national_code`).
- ارتقای `parse_users_excel` با تطبیق نقش‌ها بر اساس عنوان فارسی/کد انگلیسی و انبارها بر اساس نام/کد، و پشتیبانی از پارامتر `update_existing`.

#### [MODIFY] [roles_excel_utils.py](file:///e:/warehouse%20project/backend/accounts/roles_excel_utils.py)
- هماهنگ‌سازی ۵ ستون کامل نقش‌ها (`name`, `title`, `color`, `parent`, `permissions`) در `ROLES_COLUMNS` با حفظ ساختار ۲ سطری هدر.
- خروجی و تمپلیت استاندارد ۵ ستونه.
- ارتقای `parse_roles_excel` با قابلیت نرمال‌سازی، تشخیص ستون‌های داینامیک، تطبیق دسترسی‌ها و پشتیبانی از `update_existing`.

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/accounts/views.py)
- به‌روزرسانی اکشن‌های `import_excel` در `UserViewSet` و `CustomRoleViewSet` برای خواندن پارامتر `update_existing` و اعمال آپدیت/ایجاد رکوردهای معتبر.

---

### بخش ۲: فرانت‌اند (Angular Users Component & Shared Modal)

#### [MODIFY] [excel-import-modal.html](file:///e:/warehouse%20project/frontend/src/app/shared/components/excel-import-modal/excel-import-modal.html) & [excel-import-modal.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/excel-import-modal/excel-import-modal.ts)
- افزودن سوییچ انتخابی برای کاربر: «در صورت وجود رکورد تکراری، اطلاعات آن به‌روزرسانی شود».
- ارسال وضعیت این سوییچ به عنوان آرگومان به تابع `importFn(file, updateExisting)`.

#### [MODIFY] [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts)
- پشتیبانی از پارامتر `updateExisting` در `importUsersExcel` و `importRolesExcel`.

#### [MODIFY] [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts)
- اتصال پارامتر `updateExisting` به فراخوانی‌های سرویس اکسل.
- کاهش Debounce جستجو به ۳۵۰ میلی‌ثانیه.
- ارتقای فیلتر `filteredUsers` (نام، کدملی، نام‌کاربری، شماره تلفن، نقش‌ها).
- تکمیل داده‌های `userForm` (`company`, `operational_zone`, `supervisor`, `address`, `email`).
- اصلاح مدیریت انقضا با متغیر بولی انگولار.
- ذخیره ایمن نقش والد (`this.roleForm.parent ?? null`).
- فیلتر زنده دسترسی‌ها در مودال نقش (`permSearchQuery`).
- اضافه کردن مدیریت کامل خطاها (Toast) برای تمام عملیات.
- تولید خودکار حرف اول آواتار فارسی با رنگ سازمانی نقش.

#### [MODIFY] [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html)
- نمایش عنوان فارسی نقش‌ها در درخت سازمانی (`{{role.title || role.name}}`).
- افزودن فیلدهای فرم کاربری: سرپرست مستقیم (`supervisor`)، زون عملیاتی (`operational_zone`)، آدرس (`address`)، شرکت متبوع (`company`)، ایمیل (`email`).
- اصلاح چک‌باکس انقضا و شرط سوپریوزر.
- افزودن اینپوت جستجوی دسترسی‌ها در مودال نقش.
- نمایش آواتار حرف اول نام در کارت‌های کاربری.

---

## ۳. طرح راستی‌آزمایی و تست (Verification Plan)

### تست‌های خودکار و بک‌اند:
1. اجرای دستورات مایگریشن:
   ```bash
   python manage.py makemigrations accounts
   python manage.py migrate
   ```
2. تست خروجی و تمپلیت ۵ ستونه اکسل نقش‌ها و ۲ سطری هدر.

### تست‌های دستی و سناریوهای کاربر:
1. **تست ایمپورت هوشمند:** آپلود فایلی با ارقام فارسی، پیش‌شماره‌های مختلف موبایل، کدهای ملی کم‌رقم، عناوین فارسی نقش‌ها و تست سوییچ «به‌روزرسانی رکوردهای تکراری».
2. **تست فرم پرسنل و سرپرست:** ساخت و ویرایش کاربر با انتخاب سرپرست، شرکت و زون.
3. **تست درخت نقش‌ها:** ساخت نقش با والد و مشاهده عنوان فارسی در درخت.
4. **تست پایداری و خطاها:** بررسی نمایش پیام‌های هشدار در صورت تلاش برای تعلیق خود یا سوپریوزر.

</div>
