<div dir="rtl" align="right">

# افزودن دکمه بروزرسانی به تمامی صفحات

هدف از این تسک اضافه کردن دکمه "بروزرسانی" (Refresh) با استایل یکسان با صفحه انبارگردانی به تمامی صفحات اصلی نرم‌افزار است تا کاربر بتواند در هر زمان آخرین اطلاعات را از سرور دریافت کند.

## User Review Required
> [!NOTE]
> با تایید این طرح، دکمه بروزرسانی با آیکون استاندارد در کنار سایر دکمه‌های عملیاتی (مانند افزودن، اکسپورت و...) در هدر صفحات زیر اضافه خواهد شد.

## Proposed Changes

---

### بخش Projects (انبارها/پروژه‌ها)
در هدر صفحه انبارها دکمه بروزرسانی اضافه می‌شود که متد `loadWarehouses()` را فراخوانی می‌کند.

#### [MODIFY] [projects.html](file:///e:/warehouse%20project/frontend/src/app/components/projects/projects.html)

---

### بخش Users (کاربران و نقش‌ها)
در هدر تب‌های کاربران و نقش‌ها دکمه بروزرسانی اضافه می‌شود که متد `loadData()` را فراخوانی می‌کند.

#### [MODIFY] [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html)

---

### بخش Dynamic Fields (فیلدهای پویا)
در هدر لیست فیلدها دکمه بروزرسانی با فراخوانی متد `loadFields()` اضافه می‌شود.

#### [MODIFY] [dynamic-fields.html](file:///e:/warehouse%20project/frontend/src/app/components/dynamic-fields/dynamic-fields.html)

---

### بخش Settings (تنظیمات کلان سیستم)
در هدر تنظیمات، دکمه بروزرسانی با فراخوانی `loadSettings()` اضافه می‌شود.

#### [MODIFY] [settings.html](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html)

---

### بخش Warehouse Settings (تنظیمات انبار)
در هدر تنظیمات محیط کارگاهی، دکمه بروزرسانی با فراخوانی `loadSettings()` اضافه می‌شود.

#### [MODIFY] [wh-settings.html](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html)

## Verification Plan

### Manual Verification
- ورود به هر یک از صفحات فوق.
- مشاهده و بررسی چیدمان صحیح دکمه بروزرسانی در کنار سایر دکمه‌ها.
- کلیک روی دکمه و بررسی درخواست شبکه (Network) برای اطمینان از بارگیری مجدد داده‌ها.

</div>
