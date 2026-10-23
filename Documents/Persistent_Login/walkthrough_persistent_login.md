<div dir="rtl" align="right">

# خلاصه تغییرات — لاگین دائمی (Persistent Login)

## تغییرات انجام‌شده

### ۱. بک‌اند — [settings.py](file:///e:/warehouse%20project/backend/config/settings.py)

| تنظیم | مقدار قبلی | مقدار جدید |
|---|---|---|
| `REFRESH_TOKEN_LIFETIME` | ۷ روز | ۹۰ روز (۳ ماه) |
| `ROTATE_REFRESH_TOKENS` | ❌ نبود | ✅ `True` |
| `BLACKLIST_AFTER_ROTATION` | ❌ نبود | ✅ `True` |

---

### ۲. فرانت‌اند — [login.html](file:///e:/warehouse%20project/frontend/src/app/components/login/login.html)

- حذف کامل چک‌باکس «مرا به خاطر بسپار» و برچسب آن
- لینک «فراموشی رمز عبور» حفظ شده و به سمت چپ (انتها) منتقل شد

---

### ۳. فرانت‌اند — [login.ts](file:///e:/warehouse%20project/frontend/src/app/components/login/login.ts)

- حذف متغیر `rememberMe`
- حذف ارسال `rememberMe` به `auth.login()`

---

### ۴. فرانت‌اند — [auth.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.service.ts)

- حذف پارامتر `rememberMe` از متدهای `login()`, `mockLogin()`, `handleLoginSuccess()`
- ساده‌سازی `setItem()`, `getItem()`, `removeItem()` — فقط `localStorage`
- ساده‌سازی `loadUserFromStorage()` — فقط `localStorage`
- **تغییر مهم:** متد `refreshToken()` اکنون هر دو مقدار `access` و `refresh` جدید را از سرور دریافت و ذخیره می‌کند

---

### ۵. فرانت‌اند — [auth.interceptor.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.interceptor.ts)

- **تغییر مهم:** پیاده‌سازی مکانیزم صف/قفل (`isRefreshing` + `BehaviorSubject`) برای مدیریت درخواست‌های ۴۰۱ همزمان
- اولین درخواست ۴۰۱ فرآیند رفرش را شروع می‌کند
- بقیه درخواست‌ها صبر می‌کنند تا توکن جدید آماده شود

---

### ۶. فرانت‌اند — [offline-sync.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-sync.service.ts)

- حذف استفاده از `sessionStorage` در `tryRefreshToken()`
- ذخیره `refresh` token جدید (علاوه بر `access`) پس از هر بار رفرش

---

## نتیجه بیلد

> [!NOTE]
> تمام فایل‌های تغییریافته بدون خطا کامپایل شدند. تنها خطای موجود مربوط به `manager-review.html` است که از قبل وجود داشته و ارتباطی با تغییرات این تسک ندارد.

</div>
