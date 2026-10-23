# برنامه پیاده‌سازی اصلاح خطاهای Label PDF Generator

این برنامه جهت برطرف کردن خطای تایپ خروجی QR کد و اصلاح ماژول تاریخ جلالی در فایل `label_pdf_generator.py` تهیه شده است.

## User Review Required

> [!IMPORTANT]
> - اصلاح خط ۲۱۱: حذف پارامتر `format='PNG'` از `qr_img.save()` جهت سازگاری با تابع `save` در کلاس `PyPNGImage` کتابخانه `qrcode`.
> - اصلاح خط ۲۲۵: تغییر `from jalali_ts import jdatetime` به `import jdatetime` زیرا `jalali_ts` مربوط به اکوسیستم JavaScript/TypeScript است نه Python.

## Proposed Changes

### Warehouse Backend (`warehouses`)

#### [MODIFY] [label_pdf_generator.py](file:///e:/warehouse%20project/backend/warehouses/label_pdf_generator.py)

| مکان خطا | تغییر پیشنهادی | علت تغییر |
| :--- | :--- | :--- |
| **Line 211** | حذف `format='PNG'` از فراخوانی `qr_img.save(img_buffer)` | هماهنگی با امضای متد `save` در `PyPNGImage` |
| **Line 225** | جایگزینی `import jdatetime` به جای `from jalali_ts import jdatetime` | رفع خطای عدم وجود ماژول `jalali_ts` در پایتون |

---

## Verification Plan

### Automated / Syntax Check
- چک کردن لایو لاگ‌های سرور جنگو در ترمینال (`.\venv\Scripts\python manage.py runserver 8000`).

### Manual Verification
- درخواست تست تولید PDF برچسب جهت اطمینان از عملکرد درست QR کد و تاریخ چاپ.
