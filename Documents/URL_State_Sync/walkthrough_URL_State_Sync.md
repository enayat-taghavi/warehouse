<div dir="rtl" align="right">

# Walkthrough — ذخیره وضعیت UI در آدرس مرورگر (URL State Persistence)

## خلاصه تغییرات

وضعیت رابط کاربری (تب فعال، فیلترها) اکنون در آدرس مرورگر ذخیره می‌شود. با رفرش صفحه، کاربر به همان تب و فیلتر قبلی برمی‌گردد. لینک‌ها قابل اشتراک‌گذاری هستند.

## الگوی پیاده‌سازی

در تمام ۵ کامپوننت، الگوی یکسانی اعمال شد:

| مرحله | توضیح |
|---|---|
| **۱. گوش دادن به URL** | در `ngOnInit` به رویداد `NavigationEnd` از `Router` مشترک شدیم تا حتی در صفحات کش‌شده (`reuse: true`) تغییرات URL دریافت شود |
| **۲. خواندن پارامترها** | با `router.parseUrl(router.url).queryParams` مقادیر را خوانده و اعتبارسنجی می‌کنیم |
| **۳. به‌روزرسانی URL** | در متد `setTab` به جای تغییر مستقیم متغیر، با `router.navigate([], { queryParams })` آدرس را تغییر می‌دهیم |
| **۴. پاکسازی** | `routerSub` در `ngOnDestroy` لغو اشتراک می‌شود (برای داشبوردها) |

> [!NOTE]
> برای بخش‌های تنظیمات سیستم، تنظیمات انبار، و کاربران، از آنجا که `reuse: true` روی روتر آنها فعال نبود، نیازی به گوش دادن به `NavigationEnd` نبود. برای این ۳ بخش صرفاً از ماژول استاندارد `ActivatedRoute` و `route.queryParams.subscribe` استفاده کردیم که ساده‌تر و بهینه‌تر است.

## فایل‌های تغییر یافته

| فایل | تغییر |
|---|---|
| [supervisor-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts) | همگام‌سازی `currentTab` ← `?tab=` |
| [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | همگام‌سازی `currentTab` ← `?tab=` |
| [manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts) | همگام‌سازی `currentTab` ← `?tab=` |
| [customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts) | همگام‌سازی `currentTab` ← `?tab=` |
| [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts) | همگام‌سازی `showOnlyDiscrepancies` ← `?discrepancies=` و `currentPage` ← `?page=` |
| [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts) | همگام‌سازی `activeTab` ← `?tab=` از طریق `ActivatedRoute` |
| [settings.ts](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.ts) | همگام‌سازی `activeTab` ← `?tab=` از طریق `ActivatedRoute` |
| [wh-settings.ts](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.ts) | همگام‌سازی `activeTab` ← `?tab=` از طریق `ActivatedRoute` |
## نتایج بیلد

بیلد Angular بدون خطا انجام شد (`50.487 seconds`). فقط هشدارهای معمول اندازه باندل و ESM وجود داشت.

## نحوه تست

۱. وارد هر یک از داشبوردها شوید.
۲. تب را تغییر دهید → آدرس مرورگر باید به `?tab=pool` (یا مشابه) تغییر کند.
۳. صفحه را رفرش کنید (F5) → همان تب باید لود شود.
۴. دکمه Back مرورگر → باید به تب قبلی برگردد.
۵. لینک را کپی کرده و در تب جدید باز کنید → همان تب باید نمایش داده شود.

</div>
