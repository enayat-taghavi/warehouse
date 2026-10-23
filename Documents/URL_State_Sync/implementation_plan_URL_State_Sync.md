# URL State Persistence Implementation Plan

<div dir="rtl" align="right">

## هدف
ذخیره وضعیت رابط کاربری (مانند تب‌های فعال، فیلترها و مقادیر جستجو) در URL مرورگر. این کار باعث می‌شود:
۱. با رفرش صفحه، کاربر به همان تب و فیلتر قبلی برگردد.
۲. لینک‌ها قابل اشتراک‌گذاری با همکاران باشند (Deep Linking).
۳. دکمه‌های Back/Forward مرورگر برای جابجایی بین فیلترها و تب‌ها درست کار کنند.

> [!IMPORTANT]
> با توجه به معماری فعلی (که از `Router` و `ActivatedRoute` پشتیبانی می‌کند)، تغییرات در کامپوننت‌های داشبورد اعمال می‌شود تا مقادیر را از آدرس خوانده و با تغییر مقادیر، آدرس را به‌روزرسانی کنند.

## چالش‌های معماری و راه‌حل‌ها (نسخه URL)

۱. **مشکل Route Reuse (باز ماندن صفحات):** از آنجا که صفحات کش می‌شوند، تغییرات URL به `ngOnInit` نمی‌رسد. 
   **راه‌حل:** در کامپوننت‌ها به `this.router.events` گوش می‌دهیم (فیلتر `NavigationEnd`). با هر تغییر آدرس، مقادیر جدید را با استفاده از `this.router.parseUrl(this.router.url).queryParams` می‌خوانیم تا حتی در صورت کش بودن صفحه، مقادیر جدید دریافت شوند.

۲. **استفاده از `replaceUrl: true`:** برای تغییرات سریع (مثل فیلتر وضعیت یا تایپ در جستجو) از `replaceUrl: true` استفاده می‌کنیم تا دکمه Back مرورگر با صدها تغییر جزئی پر نشود. اما برای تغییر تب‌های اصلی از حالت پیش‌فرض (تغییر تاریخچه مرورگر) استفاده می‌کنیم.

۳. **منوی کناری (Sidebar):** لینک‌های منوی کناری همچنان به مسیر اصلی (بدون پارامتر) هدایت می‌کنند. این یعنی کلیک روی منوی کناری، صفحه را به حالت پیش‌فرض برمی‌گرداند. اما رفرش کردن صفحه (F5) یا کپی کردن لینک دقیقاً همان حالت فعلی را لود می‌کند.

## تغییرات پیشنهادی در کامپوننت‌ها

---

### Supervisor Dashboard (`supervisor-dashboard.ts`)
#### [MODIFY] [supervisor-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts)
- گوش دادن به رویداد `NavigationEnd` در `Router` برای بررسی پارامتر `tab` از URL.
- در `setTab`، انجام ناوبری با `queryParams: { tab }` (بدون `replaceUrl` تا دکمه Back برای تب‌ها کار کند).

### Counter Dashboard (`counter-dashboard.ts`)
#### [MODIFY] [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- استخراج `tab`, `status`, `date`, `q` و `sort` در `NavigationEnd`.
- اعمال `replaceUrl: true` هنگام تایپ کلمات کلیدی در باکس جستجو یا تغییر فیلترها.

### Manager Review (`manager-review.ts`)
#### [MODIFY] [manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts)
- اعمال رویکرد مشابه برای خواندن امن `tab` از URL در کامپوننت کش شده.

### Customs (کارتابل مالی) (`customs.ts`)
#### [MODIFY] [customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts)
- همگام‌سازی `tab`, `status` و جستجو با آدرس مرورگر با رعایت `replaceUrl: true` برای جستجو.

### Count Tracking (`count-tracking.ts`)
#### [MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- ذخیره و خواندن پارامترهای صفحه‌بندی (`page`) و وضعیت مغایرت در URL.

### Customs (کارتابل مالی) (`customs.ts`)
#### [MODIFY] [customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts)
- اضافه کردن `ActivatedRoute` و `Router`.
- همگام‌سازی `currentTab`، `statusFilter` و احتمالاً `searchQuery` با پارامترهای `tab`, `status` و `q`.
- خواندن مقادیر اولیه در `ngOnInit` و به‌روزرسانی URL در متدهای `setTab` و `onSearch`.

### Count Tracking (`count-tracking.ts`)
#### [MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- همگام‌سازی `showOnlyDiscrepancies` و احتمالاً شماره صفحه (`currentPage`) در URL (مثال: `?discrepancies=true&page=2`).

## نحوه بررسی
- وارد یکی از داشبوردها (مثلاً سرپرست) شوید.
- تب را تغییر دهید؛ بررسی کنید که آدرس مرورگر به `?tab=doc` تغییر کند.
- صفحه را رفرش کنید؛ بررسی کنید که دقیقاً همان تب `doc` لود شود و جداول مربوطه اطلاعات را دریافت کنند.

</div>
