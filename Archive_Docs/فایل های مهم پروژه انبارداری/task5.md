# فاز ۵: راه‌اندازی Backend و اتصال همزمان به Frontend

## ۱. راه‌اندازی ساختار بک‌اند (Django + Docker)
- `[ ]` ایجاد پوشه `e:\backend` به عنوان ریپوی مجزا
- `[ ]` ایجاد `docker-compose.yml` برای **PostgreSQL** و **Redis**
- `[ ]` راه‌اندازی محیط مجازی پایتون (venv) و نصب پکیج‌ها (Django, DRF, SimpleJWT, Channels, psycopg2, CORS)
- `[ ]` ایجاد پروژه جنگو (`warehouse_backend`) و پیکربندی `settings.py`

## ۲. ایجاد مدل‌ها و دیتابیس
- `[ ]` ساخت اپلیکیشن `accounts` (مدل سفارشی User و سیستم Role)
- `[ ]` ساخت اپلیکیشن `warehouses` (مدل‌های انبار و لوکیشن)
- `[ ]` ساخت اپلیکیشن `inventory` (مدل‌های رکورد کالا، تخصیص و تگ‌ها)
- `[ ]` ساخت اپلیکیشن `notifications` (پیکربندی Django Channels)
- `[ ]` ایجاد و اجرای مایگریشن‌ها (makemigrations & migrate)

## ۳. ایجاد REST API و WebSocket
- `[ ]` پیاده‌سازی APIهای احراز هویت (Login/Refresh JWT)
- `[ ]` پیاده‌سازی APIهای CRUD انبارها (`/api/warehouses/`)
- `[ ]` پیاده‌سازی APIهای رکوردهای کالا (`/api/records/`) و عملیات‌های گروهی
- `[ ]` پیکربندی WebSocket Consumer برای ارسال نوتیفیکیشن‌های لحظه‌ای

## ۴. ادغام همزمان با Angular (Frontend)
- `[ ]` ایجاد HTTP Interceptor برای الصاق توکن JWT به درخواست‌ها
- `[ ]` ساخت `AuthHttpService` و اتصال به صفحه لاگین
- `[ ]` ساخت `WarehouseHttpService` و جایگزینی دیتای Mock در `WarehouseListComponent`
- `[ ]` ساخت `RecordHttpService` و اتصال به صفحه `DispatchComponent` و `ImportRecordsComponent`
- `[ ]` ایجاد `WebSocketService` در فرانت‌اند برای دریافت اعلان‌های لحظه‌ای

## ۵. تست و اعتبارسنجی
- `[ ]` اجرای داکرها و اجرای سرور جنگو
- `[ ]` لاگین موفق از فرانت‌اند و دریافت توکن
- `[ ]` تست بارگذاری کامل دیتای انبارها و رکوردها از بک‌اند
- `[ ]` تست نوتیفیکیشن WebSocket (مثلاً اطلاع‌رسانی پس از آپلود موفق اکسل)
