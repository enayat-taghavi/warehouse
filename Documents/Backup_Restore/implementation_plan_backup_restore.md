<div dir="rtl" align="right">

# طرح اصلاحی: رفع ایرادات مهندسی سیستم پشتیبان‌گیری و بازیابی

## خلاصه مسئله
در بازبینی دقیق [`views_backup.py`](file:///e:/warehouse%20project/backend/config/views_backup.py)، پنج ایراد مهندسی شناسایی شد که در شرایط Production (دیتابیس بزرگ، اتصالات همزمان، وب‌سرور Nginx) می‌توانند باعث خرابی یا رفتار غیرمنتظره شوند.

---

## ماتریس تغییرات

| # | ایراد | شدت | فایل‌های تغییر | نوع تغییر |
|---|-------|------|----------------|-----------|
| ۱ | مصرف بیش‌ازحد حافظه (OOM) | 🔴 بحرانی | `views_backup.py` | Refactor: `BackupCreateView.post()` |
| ۲ | قفل شدن دیتابیس توسط اتصالات فعال | 🔴 بحرانی | `views_backup.py` | افزودن: تابع `_terminate_other_connections()` |
| ۳ | حساسیت بیش‌ازحد `pg_restore` | 🟡 متوسط | `views_backup.py` | Refactor: منطق بررسی خطای `pg_restore` |
| ۴ | باقی ماندن فایل‌های Temp رمزگشایی‌شده | 🟡 متوسط | `views_backup.py` | Refactor: `finally` block در `BackupRestoreView` |
| ۵ | تایم‌اوت مرورگر/وب‌سرور | 🟢 کم‌ریسک | `views_backup.py` | افزایش `timeout` در `pg_dump` |

> [!IMPORTANT]
> **تنها یک فایل** تغییر می‌کند: `views_backup.py`
> هیچ فایل جدیدی ایجاد نمی‌شود و فرانت‌اند تغییری نمی‌کند.

---

## تغییرات پیشنهادی به تفصیل

### اصلاح ۱ — مشکل حافظه (OOM Risk)
- خروجی `pg_dump` به جای `capture_output=True` مستقیماً با `-f` در فایل موقت نوشته شود.
- یک کپی کامل از رم حذف شده و مصرف حافظه ۳۰-۴۰٪ کاهش می‌یابد.

### اصلاح ۲ — قفل شدن دیتابیس
- تابع `_terminate_other_connections()` اتصالات فعال دیگر را قبل از `pg_restore` قطع می‌کند.

### اصلاح ۳ — حساسیت `pg_restore`
- فقط خطاهای واقعاً بحرانی (`FATAL`, `COULD NOT CONNECT`) باعث Rollback شوند.
- Warning‌های بی‌خطر فقط لاگ شوند.

### اصلاح ۴ — پاک‌سازی فایل‌های Temp
- بلاک `finally` گسترش یافته تا هر دو فایل (restore + rollback) را پاک کند.
- استثنا: اگر هم restore و هم rollback شکست بخورند، فایل rollback باقی بماند.

### اصلاح ۵ — تایم‌اوت
- `pg_dump` timeout: ۱۲۰ → ۳۰۰ ثانیه
- `pg_restore` timeout: ۳۰۰ → ۶۰۰ ثانیه

</div>
