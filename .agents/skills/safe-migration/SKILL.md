---
name: safe-migration
description: بررسی ایمنی مهاجرت‌های Django پیش از اجرای migrate روی دیتابیس همین ماشین (تست و staging `app`؛ همین مهاجرت‌ها بعداً روی دادهٔ واقعی `soft` اجرا می‌شوند). هر وقت می‌خواهی makemigrations یا migrate اجرا کنی، یا فایل تازه‌ای در */migrations/ ساخته یا بازبینی می‌شود، اول این اسکیل را اجرا کن.
---

# مهاجرت امن (Safe Migration)

دیتابیس محلی (`warehouse_db` روی 127.0.0.1:5432) دیتابیس تست و staging محیط `app.farsalish.ir` است و کاربر واقعی ندارد. داده‌اش همچنان هرگز پاک نمی‌شود و هر مهاجرت بعداً روی دادهٔ واقعی `soft.farsalish.ir` اجرا می‌شود. قانون سخت پروژه: **هیچ داده‌ای نباید از بین برود.**

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

**هشدار:** خروجی خالی گاهی دروغ می‌گوید. جدول `django_migrations` رکوردهای قدیمی پیش از squash دارد (مثلاً `accounts` از `0006` تا `0034`). مهاجرت تازه‌ای که نامش با یکی از آن‌ها یکی باشد «اعمال‌شده» فرض می‌شود و هرگز اجرا نمی‌شود.

## ۲-ب. هم‌نامی مهاجرت تازه با `django_migrations`
پیش از migrate، هر مهاجرت روی دیسک را با رکوردهای جدول بسنج. نشانهٔ قطعی هم‌نامی این است که رکورد هم‌نام **پیش از وابستگی‌های هم‌اپِ آن مهاجرت** ثبت شده باشد؛ مهاجرت واقعی هیچ‌وقت زودتر از وابستگی‌اش اعمال نمی‌شود (وابستگی بین‌اپی به‌خاطر رکوردهای fake قدیمی بررسی نمی‌شود):
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py shell -c "
from django.db import connection
from django.db.migrations.loader import MigrationLoader
loader = MigrationLoader(connection)
with connection.cursor() as c:
    c.execute('select app, name, applied from django_migrations')
    applied = {(a, n): t for a, n, t in c.fetchall()}
for key, mig in sorted(loader.disk_migrations.items()):
    deps = [d for d in mig.dependencies if d in applied and d[0] == key[0]]
    if key in applied and deps and applied[key] < max(applied[d] for d in deps):
        print('COLLISION', key, 'applied', applied[key].date(), 'before its dependency', max(deps, key=applied.get))
"
```
هر خط `COLLISION` یعنی آن مهاجرت هرگز اجرا نشده است. نامش را یکتا کن (مثلاً `0006_<توضیح>`) و بند ۲ را دوباره اجرا کن.

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
- **بدون عملیات مخرب:** پشتیبان بگیر (بند ۵)، بعد دیتابیس محلی `app` را migrate کن؛ این‌جا سؤال بله/خیر لازم نیست. migrate روی `soft.farsalish.ir` (عملیاتی) از راه `deploy.ps1` انجام می‌شود و یک سؤال کوتاه بله/خیر از کاربر لازم دارد.
- **با عملیات مخرب:** اجرا نکن. به کاربر بگو دقیقاً کدام ستون، جدول یا داده از بین می‌رود. راه بی‌خطر (expand-contract) را پیشنهاد بده: اول ستون تازه و کپی داده، و حذف در یک مهاجرت بعدی.

## ۵. پشتیبان پیش از migrate (اجباری با هوک محافظ)
هوک محافظ `.claude/hooks/guard.py` هرگونه اجرای `manage.py migrate` را تا زمانی که یک فایل `.dump` غیرخالی با فایل `.meta.json` متناظر با عمر **کمتر از ۱۵ دقیقه** در `warehouse-backend/backups/db/` وجود نداشته باشد، مسدود می‌کند.

`run_auto_backup` را اجرا نکن، چون همهٔ پشتیبان‌ها جز ۷ نسخهٔ آخر را پاک می‌کند. به‌جایش فقط یک پشتیبان مستقل بساز:
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-migrate'); print(m['filename'], m['size'])"
```
فایل در `warehouse-backend/backups/db/` ساخته می‌شود و مجوز اجرای مهاجرت برای ۱۵ دقیقه باز خواهد شد.

## ۶. پس از migrate
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py check
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py showmigrations --plan | grep -F "[ ]"
```
نتیجه را کوتاه گزارش کن.
