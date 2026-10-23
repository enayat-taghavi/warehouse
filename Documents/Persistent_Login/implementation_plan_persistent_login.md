<div dir="rtl" align="right">

# پیاده‌سازی لاگین دائمی (Persistent Login) - نسخه نهایی

هدف این تسک حذف گزینه «مرا به خاطر بسپار» از صفحه لاگین و تنظیم سیستم به گونه‌ای است که کاربر به طور پیش‌فرض تا زمان خروج (Logout) لاگین بماند. بر اساس درخواست کاربر، زمان انقضای نشست (Session) ۳ ماه در نظر گرفته شده است که با هر بار استفاده تمدید می‌شود. این طرح شامل رفع مشکلات همزمانی (Race Condition) و مدیریت صحیح چرخش توکن‌های رفرش است.

## تغییرات پیشنهادی

### بک‌اند (Django & Simple JWT)

| فایل / بخش | تغییرات |
|---|---|
| `backend/config/settings.py` | [MODIFY] فعال‌سازی قابلیت `ROTATE_REFRESH_TOKENS = True` در دیکشنری `SIMPLE_JWT` و افزایش زمان `REFRESH_TOKEN_LIFETIME` به ۹۰ روز (۳ ماه). |

### فرانت‌اند (Angular)

| فایل / بخش | تغییرات |
|---|---|
| `frontend/src/app/components/login/login.html` | [MODIFY/DELETE] حذف کامل چک‌باکس مربوط به «مرا به خاطر بسپار». |
| `frontend/src/app/components/login/login.ts` | [MODIFY] حذف متغیر `rememberMe` و حذف ارسال آن به متد `this.auth.login`. |
| `frontend/src/app/core/auth/auth.service.ts` | [MODIFY] تغییر پیش‌فرض به ذخیره‌سازی همیشگی در `localStorage`. اصلاح متد `refreshToken` برای دریافت و ذخیره‌سازی همزمان `access` و `refresh` توکن‌های جدید که توسط بک‌اند پس از Rotate بازگردانده می‌شوند. |
| `frontend/src/app/core/auth/auth.interceptor.ts` | [MODIFY] پیاده‌سازی مکانیزم قفل/صف (`isRefreshing` و `BehaviorSubject`) برای مدیریت خطای 401 در درخواست‌های همزمان، تا فقط یک بار درخواست Refresh ارسال شود و مابقی منتظر دریافت توکن جدید بمانند. |
| `frontend/src/app/core/services/offline-sync.service.ts` | [MODIFY] به‌روزرسانی متد `tryRefreshToken` برای استخراج و ذخیره‌سازی `data.refresh` علاوه بر `data.access`، تا توکن باطل‌شده‌ی قبلی جایگزین شود. |

> [!IMPORTANT]
> **نیاز به تایید:** 
> این طرح نهایی و دقیق، تضمین می‌کند که کاربر بیرون انداخته نشود و توکن ۳ ماهه‌اش با هر فعالیت مجدداً از نو تمدید گردد. در صورت تایید با پیام **"تایید"** یا **"شروع"**، اجرا را آغاز می‌کنم.

</div>
