<div dir="rtl" align="right">

# برنامه اجرایی اصلاح و بازطراحی جامع داشبورد مانیتورینگ انبار (Dashboard Comprehensive Fixes)

داشبورد مانیتورینگ اصلی سامانه با هدف ارائه دید کلان به مدیران و کاربران طراحی شده است. این مستند به بررسی و رفع ریشه‌ای کلیه باگ‌های شناسایی‌شده در سطح بک‌اند (کرش احراز دسترسی، اشتباهات تجمیع داده‌ها) و فرانت‌اند (پنهان شدن خطا، خطای محاسباتی درصد پیشرفت، انیمیشن‌ها، ناهماهنگی خط تارگت، پیوندهای عملیاتی و واکنش‌پذیری به تغییر انبار) می‌پردازد.

---

## ۱. مرور نیازمندی‌ها و بازبینی تغییرات (User Review Required)

> [!IMPORTANT]
> **رفع خطای بحرانی بک‌اند (Crash در `get_permissions`):**
> روت `/api/inventory/items/dashboard_stats/` در متد `get_permissions` کلاس `ItemViewSet` در بک‌اند به‌طور صریح تعریف نشده بود و به شاخه پیش‌فرض می‌افتاد که باعث بروز خطای ۵۰۰ (`TypeError: 'HasMenuAccess' object is not callable`) می‌شد. این مورد با تعریف صریح مجوزهای دسترسی امن (`IsAuthenticated`) اصلاح می‌شود.

> [!NOTE]
> **اصلاح شاخص‌های قیف عملیات (Operational Funnel):**
> شاخص مرحله ۱ قیف از «تعداد تگ چاپ‌شده» به **«تعداد شمارش‌شده واقعی» (`counted`)** و شاخص مرحله ۲ به **«تعداد مدارک تایید شده» (`docs_approved`)** تغییر یافته و از بک‌اند ارسال می‌شود.

---

## ۲. خلاصه تغییرات پیشنهادی بر اساس کامپوننت‌ها (Proposed Changes)

| ردیف | لایه | فایل هدف | خلاصه تغییرات |
| :---: | :---: | :--- | :--- |
| ۱ | بک‌اند | [inventory/views.py](file:///e:/warehouse%20project/backend/inventory/views.py) | • اصلاح `get_permissions` برای `dashboard_stats`<br>• افزودن `counted` و `docs_approved` به آمار تجمیعی<br>• اصلاح نام روزها بر اساس تقویم شمسی/فارسی و منطقه‌زمانی صحیح |
| ۲ | فرانت‌اند | [dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.ts) | • خواندن آمار شمارش مستقیم از پاسخ API<br>• سابسکرایب به تغییر انبار فعال هدر<br>• افزودن مدیریت خطا و Toast اطلاع‌رسانی<br>• اصلاح ترند روزانه و پاکسازی کدهای مرده |
| ۳ | فرانت‌اند | [dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.html) | • بازسازی ساختار تگ‌های HTML<br>• تصحیح موقعیت خط تارگت روزانه<br>• اکشن سنتر تعاملی با لینک به صفحات مرتبط<br>• وضعیت لودینگ و بنر تلاش مجدد در صورت بروز خطا |
| ۴ | فرانت‌اند | [dashboard.css](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.css) | • افزودن انیمیشن شاین (`animate-shine`) و استایل‌های بهینه‌ساز |

---

## ۳. جزئیات تغییرات فایل‌ها (File-by-File Details)

### لایه بک‌اند (Backend)

#### [MODIFY] [inventory/views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
* **اصلاح `get_permissions`:**
  مجاز کردن اکشن `dashboard_stats` برای کاربران احرازشده (`IsAuthenticated`).
* **اصلاح `dashboard_stats`:**
  * محاسبه دقیق اقلام شمرده‌شده:
    ```python
    total_counted = items.exclude(field_status__in=['waiting', 'counting', 'در انتظار شمارش']).count()
    docs_approved = items.filter(doc_status='done').count()
    ```
  * تنظیم خروجی شامل:
    ```python
    'overall': {
        'total': total_quantity,
        'counted': total_counted,
        'printed': printed_tags,
        'docs_approved': docs_approved,
        'conflicts': conflicts,
        'done': done
    }
    ```
  * اصلاح نام روزهای هفته متناسب با روزهای فارسی/شمسی بر اساس تاریخ و تایم‌زون ایران.

---

### لایه فرانت‌اند (Frontend)

#### [MODIFY] [dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.ts)
* دریافت مستقیم `overallStats.counted` به عنوان منبع حقیقت درصد پیشرفت کل بدون وابستگی به لود ناقص آرایه `projects`.
* گوش دادن به تغییرات `AuthStore.activeWarehouseId` برای رفرش خودکار داشبورد هنگام تغییر انبار در هدر.
* مدیریت بلوک `error` و فعال‌سازی پرچم `hasError` جهت نمایش بنر خطا و امکان «تلاش مجدد» (Retry).
* اصلاح گتر `todayTrend` برای حالت‌هایی که آمار دیروز صفر است یا تغییرات صفر درصد می‌باشد.
* حذف توابع بدون استفاده مانند `refreshSingleCard`.

#### [MODIFY] [dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.html)
* اصلاح تگ‌های والد و تو در تویی و تفکیک منظم ردیف‌های ۱، ۲ و ۳.
* تراز دقیق خط تارگت روزانه با قرار دادن آن در داخل کانتینر مقیاس ستون‌های نمودار (`h-48`).
* به‌روزرسانی قیف عملیات (شمارش فیزیکی، تایید مدارک، تغذیه نهایی).
* افزودن دکمه‌های ناوبری سریع در بخش Action Center (انتقال به مدیریت مغایرت‌ها و بخش تغذیه MT).
* افزودن پیام خطای زیبا در صورت در دسترس نبودن سرور با دکمه تلاش مجدد.

#### [MODIFY] [dashboard.css](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.css)
* پیاده‌سازی کی‌فریم و کلاس انیمیشن `animate-shine` برای افکت نوری ستون‌های قیف عملیات.

---

## ۴. برنامه راستی‌آزمایی و تست (Verification Plan)

### ۱. تست خودکار و بررسی ترمینال (Terminal & Build Checks)
* بررسی کامپایل موفق فرانت‌اند در پورت ۴۳۰۰ بدون هیچ‌گونه هشدار یا خطای تایپ‌اسکریپت.
* بررسی سرویس دافنه بک‌اند روی پورت ۸۰۰۰ برای اجرای صحیح متد `dashboard_stats`.

### ۲. تست دستی (Manual Verification)
* **تست روت ای‌پی‌آی:** فراخوانی اندپوینت `/api/inventory/items/dashboard_stats/` و بررسی کد وضعیت ۲۰۰ (بدون خطای ۵۰۰).
* **تست نمایش دونات چارت:** ورود مستقیم به `/dashboard` و تایید نمایش صحیح درصد پیشرفت کل و تعداد شمرده‌شده بر حسب انبار.
* **تست سوییچر انبار:** تغییر انبار از منوی بالای صفحه و مشاهده به‌روزرسانی آنی داده‌های داشبورد.
* **تست تعاملی اکشن سنتر:** کلیک روی کارت‌های مغایرت و تغذیه و بررسی انتقال صحیح به صفحات مربوطه.

</div>
