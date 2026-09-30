---
name: safe-migration
description: بررسی ایمنی مهاجرت‌های Django پیش از اجرای migrate روی دیتابیس عملیاتی همین ماشین. هر وقت می‌خواهی makemigrations یا migrate اجرا کنی، یا فایل تازه‌ای در */migrations/ ساخته یا بازبینی می‌شود، اول این اسکیل را اجرا کن.
---

# مهاجرت امن (Safe Migration)

دیتابیس محلی (`warehouse_db` روی 127.0.0.1:5432) همان دیتابیس عملیاتی است. قانون سخت پروژه: **هیچ داده‌ای نباید از بین برود.**

همهٔ دستورها در پوشهٔ `warehouse-backend` اجرا می‌شوند.

## ۱. هم‌خوانی مدل‌ها و مهاجرت‌ها
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py makemigrations --check --dry-run
```
«No changes detected» یعنی مهاجرتی جا نمانده است.

## ۲. مهاجرت‌های اعمال‌نشده
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py showmigrations --plan | grep -F "[ ]"
```
خروجی خالی یعنی چیزی برای migrate نیست و کار همین‌جا تمام است.

## ۳. بررسی عملیات مخرب
هر مهاجرت اعمال‌نشده را بخوان و این عملیات را بجو:
- `RemoveField` و `DeleteModel`
- `AlterField`: تغییر نوع، کوتاه شدن `max_length`، یا `null=False` بدون `default`
- `RenameField` و `RenameModel`
- `RunSQL` و `RunPython`: نبود `reverse_code`، یا حذف و بازنویسی داده
- `AlterUniqueTogether` و `AddConstraint`: ممکن است روی دادهٔ فعلی شکست بخورند
- `SeparateDatabaseAndState`: بخش `database_operations` را جدا بررسی کن

SQL واقعی را هم ببین:
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py sqlmigrate <app> <migration_name>
```
به `DROP COLUMN`، `DROP TABLE`، `ALTER COLUMN ... TYPE`، `DELETE` و `TRUNCATE` دقت کن. برای بازبینی عمیق‌تر، اسکیل `data-loss-reviewer` را به کار بگیر.

## ۴. تصمیم
- **بدون عملیات مخرب:** پشتیبان بگیر (بند ۵). بعد با یک سؤال کوتاه بله/خیر از کاربر اجازهٔ migrate روی دیتابیس عملیاتی بگیر.
- **با عملیات مخرب:** اجرا نکن. به کاربر بگو دقیقاً کدام ستون، جدول یا داده از بین می‌رود. راه بی‌خطر (expand-contract) را پیشنهاد بده: اول ستون تازه و کپی داده، و حذف در یک مهاجرت بعدی.

## ۵. پشتیبان پیش از migrate
`run_auto_backup` را اجرا نکن، چون همهٔ پشتیبان‌ها جز ۷ نسخهٔ آخر را پاک می‌کند. به‌جایش فقط یک پشتیبان بساز:
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-migrate'); print(m['filename'], m['size'])"
```
فایل در `warehouse-backend/backups/db/` ساخته می‌شود.

## ۶. پس از migrate
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py check
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py showmigrations --plan | grep -F "[ ]"
```
نتیجه را کوتاه گزارش کن.
