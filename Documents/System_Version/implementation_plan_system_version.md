<div dir="rtl" align="right">

# طرح اتصال نسخه سیستم به دیتابیس

این طرح به منظور داینامیک کردن شماره نسخه برنامه (که در صفحه لاگین به صورت استاتیک ۱.۰ نوشته شده بود) و اتصال آن به دیتابیس تدوین شده است.

## موارد نیازمند بررسی کاربر

> [!NOTE]
> <div dir="rtl" align="right">
> برای دریافت نسخه از دیتابیس در صفحه لاگین که کاربری هنوز احراز هویت نشده است، نیاز به یک مسیر عمومی (Public Endpoint) داریم.
> من قصد دارم یک API ساده در آدرس `/api/public/config/` ایجاد کنم که فقط تنظیمات عمومی مانند نام سیستم و نسخه سیستم را برمی‌گرداند.
> </div>

## تغییرات پیشنهادی

### Backend (Django)

#### [MODIFY] [services.py](file:///e:/warehouse%20project/backend/warehouses/services.py)
افزودن کلید `system_version` با مقدار پیش‌فرض `'1.0'` در `DEFAULT_SETTINGS` تا در صورت عدم وجود در دیتابیس، دچار خطا نشویم.

#### [NEW] [views.py](file:///e:/warehouse%20project/backend/warehouses/views.py)
افزودن یک `PublicConfigViewSet` با دسترسی `AllowAny` که تنظیمات `system_version` را بخواند و برگرداند.

#### [MODIFY] [urls.py (config)](file:///e:/warehouse%20project/backend/config/urls.py)
افزودن مسیر `/api/public/config/` به `urlpatterns`.

---

### Frontend (Angular)

#### [NEW] [config.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/config.service.ts) (یا مشابه)
ایجاد یا استفاده از سرویس موجود برای دریافت تنظیمات پابلیک از بک‌اند.

#### [MODIFY] [login.ts](file:///e:/warehouse%20project/frontend/src/app/components/login/login.ts)
اتصال سرویس کانفیگ و دریافت نسخه سیستم در `ngOnInit` و تخصیص آن به یک متغیر مانند `systemVersion`.

#### [MODIFY] [login.html](file:///e:/warehouse%20project/frontend/src/app/components/login/login.html)
تغییر مقدار `۱.۰` به فرمت داینامیک `{{ systemVersion }}`.

## طرح اعتبارسنجی (Verification Plan)

### بررسی دستی
- بارگذاری مجدد صفحه لاگین و اطمینان از اینکه شماره نسخه به درستی از بک‌اند خوانده می‌شود.
- تغییر مقدار در دیتابیس (`SystemSetting` با کلید `system_version`) و اطمینان از اعمال آن.

</div>
