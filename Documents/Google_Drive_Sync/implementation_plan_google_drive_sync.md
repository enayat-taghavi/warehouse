<div dir="rtl" align="right">

# طرح جامع و فازبندی شده پیاده‌سازی همگام‌سازی ابری گوگل‌درایو شرکت‌ها (Google Drive Sync)

این سند معماری، مدل‌های داده، فرآیند اتصال، جریان پردازش پس‌زمینه و جزئیات کدهای فرانت‌اند و بک‌اند را برای ارسال خودکار و پس‌زمینه فایل‌های هر شرکت به گوگل‌درایو اختصاصی خود با ساختار درختی و نام‌گذاری معنادار تبیین می‌کند.

---

### ۱. معماری کلی و اصول کلیدی طراحی

> [!IMPORTANT]
> **اصول تخطی‌ناپذیر سیستم:**
> ۱. **استقلال کامل ذخیره‌سازی محلی:** مسیرها و نحوه ذخیره فایل‌ها در دیسک محلی سرور (`MEDIA_ROOT`) دقیقاً مثل گذشته حفظ می‌شود. کاربر بدون هیچ تاخیری فایل‌ها را آپلود کرده و پاسخ دریافت می‌کند.
> ۲. **پردازش کاملاً ناهمگام (Async Background Sync):** عملیات اتصال و آپلود به گوگل‌درایو در پس‌زمینه از طریق یک صف دیتابیسی امن (`GoogleDriveSyncQueue`) و ورکر اختصاصی انجام می‌گیرد و هرگز جلوی پاسخ‌گویی به درخواست‌های کاربر را نمی‌گیرد.
> ۳. **تفکیک کامل چندمستأجری (Multi-Tenancy):** هر شرکت حساب گوگل‌درایو، توکن‌ها و پوشه ریشه مستقل خود را دارد و هیچ شرکتی امکان مشاهده یا ارسال فایل به درایو دیگری را نخواهد داشت.
> ۴. **پشتیبانی از پروکسی و تاب‌آوری شبکه در ایران:** برای حل مشکل تحریم‌ها یا فیلترینگ دامنه‌های گوگل (`googleapis.com`)، درخواست‌های API از طریق تنظیمات پروکسی خروجی (`HTTP_PROXY` / `SOCKS5`) عبور خواهند کرد.
> ۵. **سیاست عدم حذف فیزیکی (Archive On Delete):** در صورت حذف فایلی در سامانه، فایل متناظر در گوگل‌درایو حذف نمی‌شود، بلکه به پوشه بایگانی (`بایگانی و اسناد حذف‌شده`) منتقل می‌گردد.

```mermaid
graph TD
    A[کاربر در فرانت‌اند Angular] -->|آپلود سریع فایل| B[سرور Django / Daphne]
    B -->|ذخیره سریع روی دیسک محلی| C[(MEDIA_ROOT دیسک محلی)]
    B -->|تراکنش موفقیت‌آمیز| D[سیگنال post_save]
    D -->|ثبت رکورد در صف| E[(جدول GoogleDriveSyncQueue)]
    
    subgraph پردازش ناهمگام در پس‌زمینه
        F[GDrive Background Worker] -->|برداشتن تسک‌های در صف| E
        F -->|تنظیم پراکسی خروجی اختیاری| G[پروکسی / اتصال اینترنت]
        G -->|Google Drive API v3| H[گوگل‌درایو اختصاصی شرکت]
        H -->|ساخت پوشه درختی| I[پوشه سراسری / سامانه / پروژه / بخش / سال]
        H -->|آپلود با نام معنادار| J[فایل نهایی با تاریخ شمسی و کد یکتا]
        F -->|به‌روزرسانی وضعیت و شناسه فایل| E
    end
```

---

### ۲. ساختار پوشه‌بندی و فرمول نام‌گذاری فایل‌ها در گوگل‌درایو

طبق نیاز تایید شده، سلسله‌مراتب پوشه‌ها در گوگل‌درایو هر شرکت به صورت زیر سازمان‌دهی می‌شود:

```text
📁 [پوشه سراسری: سامانه ابری شرکت {Company Name}]
 ├── 📁 سامانه حسابداری و اداری
 │    ├── 📁 [نام یا کد پروژه مالی]
 │    │    └── 📁 [نام یا کد بخش]
 │    │         ├── 📁 فاکتورها و تنخواه
 │    │         │    └── 📄 1405-07-12_فاکتور_خرید_1042_تجهیزات_سایت.pdf
 │    │         ├── 📁 مدارک پرسنلی
 │    │         │    └── 📄 1405-01-20_قرارداد_کار_کد105_محمد_کریمی.pdf
 │    │         └── 📁 ناوگان و خودروها
 │    │              └── 📄 1405-04-15_بیمه‌نامه_شخص_ثالث_پلاک_12ب345_ایران68.pdf
 │    └── 📁 اسناد مرکزی شرکت
 │         ├── 📁 اساسنامه و روزنامه رسمی
 │         └── 📁 احکام هیئت‌مدیره
 ├── 📁 سامانه انبارداری
 │    └── 📁 [نام انبار / پروژه]
 │         └── 📁 تصاویر کالاها
 │              └── 📄 1405-06-10_عکس_کالا_کد55102_پیچ_شش_گوش.webp
 ├── 📁 پشتیبان‌های پایگاه داده
 │    └── 📁 ۱۴۰۵
 │         └── 📄 1405-07-12_پشتیبان_کامل_دیتابیس_143000.dump
 └── 📁 بایگانی و اسناد حذف‌شده
      └── 📁 ۱۴۰۵
           └── 📄 [فایل‌های آرشیو شده پس از حذف در سامانه]
```

---

### ۳. فازبندی تفصیلی پیاده‌سازی و تغییرات کد

#### فاز ۱: معماری پایه، مدل‌های داده و احراز هویت OAuth 2.0 شرکت‌ها
* **هدف:** نصب پیش‌نیازهای ارتباط با گوگل، افزودن مدل‌های تنظیمات و صف، پیاده‌سازی لاگین گوگل جهت دریافت `refresh_token` برای هر شرکت.
* **فایل‌های تحت تغییر و ایجاد:**
  1. `backend/requirements.txt`:
     * افزودن: `google-api-python-client>=2.100.0`, `google-auth>=2.23.0`, `google-auth-oauthlib>=1.1.0`, `httplib2>=0.22.0`, `pysocks>=1.7.1`.
  2. `backend/config/settings.py` و `.env`:
     * تعریف تنظیمات سراسری:
       ```python
       GOOGLE_OAUTH_CLIENT_ID = os.getenv('GOOGLE_OAUTH_CLIENT_ID', '')
       GOOGLE_OAUTH_CLIENT_SECRET = os.getenv('GOOGLE_OAUTH_CLIENT_SECRET', '')
       GOOGLE_OAUTH_REDIRECT_URI = os.getenv('GOOGLE_OAUTH_REDIRECT_URI', 'https://app.farsalish.ir/api/accounts/gdrive/callback/')
       OUTBOUND_HTTP_PROXY = os.getenv('OUTBOUND_HTTP_PROXY', '')  # e.g., 'http://127.0.0.1:10809'
       ```
  3. `backend/personnel/models.py`:
     * ایجاد مدل `CompanyGoogleDriveConfig`:
       ```python
       class CompanyGoogleDriveConfig(models.Model):
           company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='gdrive_config')
           is_enabled = models.BooleanField(default=False, verbose_name="فعال‌بودن همگام‌سازی")
           account_email = models.EmailField(blank=True, null=True, verbose_name="ایمیل اکانت گوگل")
           refresh_token = models.TextField(blank=True, null=True, verbose_name="توکن دائمی Refresh")
           root_folder_id = models.CharField(max_length=100, blank=True, null=True, verbose_name="شناسه پوشه ریشه")
           sync_accounting_docs = models.BooleanField(default=True, verbose_name="همگام‌سازی اسناد مالی و فاکتورها")
           sync_personnel_docs = models.BooleanField(default=True, verbose_name="همگام‌سازی مدارک پرسنلی")
           sync_fleet_docs = models.BooleanField(default=True, verbose_name="همگام‌سازی مدارک ناوگان")
           sync_inventory_photos = models.BooleanField(default=True, verbose_name="همگام‌سازی عکس‌های کالاها")
           sync_backups = models.BooleanField(default=True, verbose_name="همگام‌سازی فایل‌های پشتیبان")
           last_sync_at = models.DateTimeField(null=True, blank=True, verbose_name="آخرین زمان همگام‌سازی")
           last_error = models.TextField(blank=True, null=True, verbose_name="آخرین خطا")
           created_at = models.DateTimeField(auto_now_add=True)
           updated_at = models.DateTimeField(auto_now=True)
       ```
     * ایجاد مدل `GoogleDriveSyncQueue`:
       ```python
       class GoogleDriveSyncQueue(models.Model):
           STATUS_CHOICES = (
               ('pending', 'در انتظار ارسال'),
               ('processing', 'در حال آپلود'),
               ('completed', 'همگام‌سازی موفق'),
               ('failed', 'خطا در همگام‌سازی'),
           )
           ACTION_CHOICES = (
               ('upload', 'آپلود / ویرایش'),
               ('archive_delete', 'انتقال به بایگانی'),
           )
           company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='gdrive_sync_tasks')
           model_name = models.CharField(max_length=100, verbose_name="نام مدل مبدا")
           object_id = models.PositiveBigIntegerField(null=True, blank=True, verbose_name="شناسه شیء")
           source_file_path = models.CharField(max_length=500, verbose_name="مسیر فایل محلی")
           target_folder_path = models.CharField(max_length=500, verbose_name="مسیر پوشه در گوگل‌درایو")
           target_filename = models.CharField(max_length=255, verbose_name="نام معنادار فایل در درایو")
           action = models.CharField(max_length=30, choices=ACTION_CHOICES, default='upload')
           status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
           retry_count = models.IntegerField(default=0, verbose_name="تعداد تلاش")
           gdrive_file_id = models.CharField(max_length=100, blank=True, null=True, verbose_name="شناسه فایل در گوگل‌درایو")
           file_sha256 = models.CharField(max_length=64, blank=True, null=True, verbose_name="هش امنیتی فایل")
           error_message = models.TextField(blank=True, null=True, verbose_name="پیام خطای رخ‌داده")
           created_at = models.DateTimeField(auto_now_add=True, db_index=True)
           updated_at = models.DateTimeField(auto_now=True)
           completed_at = models.DateTimeField(null=True, blank=True)
       ```
  4. ایجاد مهاجرت رو به جلو Django طبق پروتکل `safe-migration`.
  5. `backend/personnel/google_drive_views.py`:
     * پیاده‌سازی اندپوینت‌های:
       - `GET /api/personnel/companies/{id}/gdrive/auth-url/`: ایجاد لینک استاندارد OAuth2 با پارامتر State امن شامل شناسه شرکت.
       - `GET /api/accounts/gdrive/callback/`: دریافت کد احراز هویت از گوگل، تبادل آن با Refresh Token و ذخیره در کانفیگ شرکت.
       - `POST /api/personnel/companies/{id}/gdrive/disconnect/`: قطع ارتباط و ابطال توکن.
       - `GET /api/personnel/companies/{id}/gdrive/status/`: استعلام وضعیت، سهمیه مصرفی و آمار صف همگام‌سازی.

---

#### فاز ۲: موتور ناهمگام همگام‌سازی، پروکسی شبکه و ساختار سلسله‌مراتبی پوشه‌ها
* **هدف:** ساخت کلاینت هوشمند گوگل‌درایو، مسیریابی و ایجاد خودکار پوشه‌ها با کش، حل مشکل پروکسی سرور، و فرمول‌بندی نام فایل‌ها.
* **فایل‌های تحت ایجاد:**
  1. `backend/personnel/google_drive_service.py`:
     * ساخت کلاینت اختصاصی گوگل درایو بر اساس `refresh_token` شرکت.
     * اتصال خودکار از طریق `OUTBOUND_HTTP_PROXY` در صورت تعریف شدن (با استفاده از `httplib2.ProxyInfo` یا تنظیم ترنسپورت مجاز).
     * متد `get_or_create_folder_hierarchy(drive_service, parent_id, path_segments)`: ساخت یا دریافت پوشه‌ها و کش کردن شناسه‌ها جهت حداقل‌سازی فراخوانی‌های API.
     * متد `upload_file(file_path, parent_folder_id, filename)` با قابلیت Resumable Upload برای فایل‌های با حجم بالا و محاسبه MD5.
     * متد `archive_file(file_id, archive_folder_id)` جهت انتقال فایل‌های حذفی به پوشه بایگانی.
  2. `backend/personnel/google_drive_path_resolver.py`:
     * نگاشت مدل به مسیر و نام فایل:
       - ورودی: شیء مدل (مثلاً `Invoice`, `PersonnelProfile`, `VehicleDocument`, `ItemPhoto`, `BackupFile`)
       - خروجی: `(company, folder_segments, meaningful_filename)`
       - فرمت نام: `YYYY-MM-DD_[دسته]_[کد رهگیری یا نام]_[نام اصلی فایل]` به صورت پاکسازی‌شده و استاندارد فارسی.

---

#### فاز ۳: اتصال رویدادها، سیگنال‌ها و صف پس‌زمینه (Background Worker)
* **هدف:** اتصال ذخیره و حذف فایل‌های سامانه به صف بدون هیچ‌گونه کندی در فرآیند اصلی و اجرای مداوم ورکر.
* **فایل‌های تحت تغییر:**
  1. `backend/personnel/signals_gdrive.py`:
     * تعریف گیرنده‌های سیگنال `post_save` و `post_delete` برای فیلدهای فایل در مدل‌های مرتبط.
     * استفاده از `transaction.on_commit(...)` برای اطمینان از اینکه ثبت تسک فقط پس از Commit موفق تراکنش اصلی در دیتابیس صورت می‌گیرد.
  2. `backend/accounts/backup_service.py`:
     * افزودن هوک پس از ایجاد موفق پشتیبان دیتابیس (`create_database_backup`) جهت افزودن فایل `.dump` به صف همگام‌سازی گوگل‌درایو کلیه شرکت‌های فعال یا شرکت مرتبط.
  3. `backend/personnel/management/commands/run_gdrive_sync_worker.py`:
     * ورکر سبک و خودکار برای پایش جدول `GoogleDriveSyncQueue` با فواصل مشخص یا سیگنال بیدارباش.
     * مدیریت صف با مکانیزم `select_for_update(skip_locked=True)` جهت جلوگیری از مسدودسازی و رقابت چند پردازه.
     * تلاش مجدد هوشمند (Exponential Backoff) برای مواقعی که اینترنت قطع شده یا سهمیه گوگل موقتاً پر شده است.

---

#### فاز ۴: رابط کاربری فرانت‌اند و مرکز کنترل وضعیت گوگل‌درایو شرکت‌ها
* **هدف:** ارائه تجربه کاربری ارگونومیک، زیبا و شفاف در تنظیمات شرکت مطابق با استانداردهای طراحی پروژه.
* **فایل‌های تحت تغییر:**
  1. `frontend/src/app/components/organization/projects-and-sections/` (یا تب جدید در تنظیمات شرکت):
     * افزودن کامپوننت یا زیرتب **«سرویس ابری گوگل‌درایو (Google Drive Sync)»**.
     * کارت وضعیت اتصال شامل:
       - وضعیت فعلی: متصل (سبز) / قطع (خاکستری) / خطا در اتصال (قرمز).
       - ایمیل اکانت فعال گوگل درایو و لینک کلیک‌پذیر به پوشه اصلی درایو.
       - سوییچ‌های تفکیکی انتخاب دسته‌بندی فایل‌ها (مالی، پرسنلی، ناوگان، کالاها، پشتیبان دیتابیس).
       - دکمه مدرن «اتصال به حساب گوگل» (OAuth Redirect).
       - دکمه «قطع اتصال».
       - دکمه «همگام‌سازی کلیه فایل‌ها (Sync All)» با نمایش پیشرفت.
  2. جدول زنده صف همگام‌سازی (Queue Monitoring):
     * نمایش وضعیت لحظه‌ای فایل‌های اخیر ارسال شده به درایو.
     * نشانگرهای رنگی وضعیت (موفق، در حال ارسال، نیازمند تلاش مجدد).
     * دکمه اقدام سریع جهت Retry کردن فایل‌هایی که با خطای قطعی اینترنت متوقف شده‌اند.
  3. رعایت کامل استاندارد آیکون‌ها: استفاده انحصاری از `<svg appIcon="...">` و ثبت آیکون‌های گوگل و درایو در `icon-registry.ts`.

---

#### فاز ۵: تست‌های جامع، تفکیک چندمستأجری و نگهبان‌های پروژه (Guardians)
* **هدف:** اعتبارسنجی فنی عمیق، بررسی عدم نشت داده میان شرکت‌ها و اطمینان از سلامت کامل کلیه ۵۲ نگهبان سیستم.
* **اقدامات اعتبارسنجی:**
  1. تست جداسازی داده‌ها (Multi-Tenant Isolation):
     * اطمینان از اینکه رکوردهای صف هر شرکت کاملاً ایزوله هستند و هیچ کاربری نمی‌تواند به درایو شرکت دیگری دسترسی داشته باشد.
  2. تست رفتار آفلاین و قطع شبکه:
     * قطع شبیه‌سازی‌شده ارتباط با گوگل و بررسی ثبت مرتب تسک‌ها در صف و از سرگیری خودکار پس از برقراری اینترنت.
  3. تست نگهبان‌ها:
     * اجرای تست‌های محافظتی و نگهبان‌های پروژه (`python guardian_all.py`).
     * بیلد موفق بدون خطای فرانت‌اند و تست کامپوننت‌های فرانت (Type 1 Vitest/JSDOM).

---

#### فاز ۶: مدیریت سیاست‌های زمان‌بندی همگام‌سازی، کنترل ترافیک و جلوگیری از اختلال در شبکه (Bandwidth & Schedule Policies)
* **هدف:** اعطای کنترل کامل به مدیران شرکت‌ها جهت تعیین شیوه و زمان ارسال فایل‌ها به گوگل‌درایو، ممانعت از افت سرعت اینترنت و اختلال شبکه در ساعات اداری و کاری پرسنل، کاهش ترافیک همزمان و مدیریت بهینه بار پردازشی سرور.
* **سیاست‌های سه‌گانه همگام‌سازی (Sync Modes):**
  1. **همگام‌سازی آنی (Immediate / Real-time):** به محض ذخیره یا ویرایش فایل در سامانه، بلافاصله نخ پس‌زمینه فراخوانی شده و فایل به درایو آپلود می‌شود (مناسب شرکت‌هایی با سرعت اینترنت بالا و اسناد روزمره سبک).
  2. **همگام‌سازی زمان‌بندی‌شده در ساعات خلوتی (Scheduled Off-Peak Hours):** در طول ساعات کاری، کلیه فایل‌ها بدون کوچک‌ترین وقفه در دیسک محلی سرور ذخیره شده و فقط تسک متناظر در جدول صف با وضعیت `pending` ثبت می‌شود. هیچ داده‌ای به شبکه ارسال نخواهد شد تا پهنای باند شرکت در ساعات اداری مصرف نشود. ورکر پس‌زمینه منحصراً در بازه زمانی تعیین‌شده خلوتی شبکه (به‌صورت پیش‌فرض از ساعت ۲۳:۰۰ شب تا ۰۶:۰۰ بامداد) بیدار شده و صف فایل‌ها را ارسال و خالی می‌کند.
  3. **همگام‌سازی دستی با دستور مدیر (Manual / On-Demand):** فایل‌ها در صف دیتابیسی ذخیره می‌شوند اما هیچ ترافیک شبکه‌ای خودکاری با گوگل‌درایو انجام نمی‌شود تا زمانی که کاربر مسئول در پنل تنظیمات با کلیک بر روی دکمه «شروع ارسال صف»، فرآیند همگام‌سازی را فعال کند.
* **فایل‌های تحت تغییر و وظایف فنی:**
  1. `backend/personnel/models.py`:
     * افزودن فیلدهای کنترلی و سیاست‌گذاری به مدل `CompanyGoogleDriveConfig`:
       ```python
       SYNC_MODE_CHOICES = (
           ('immediate', 'همگام‌سازی آنی (بلافاصله پس از بارگذاری)'),
           ('scheduled', 'زمان‌بندی‌شده در ساعات خلوتی شبکه'),
           ('manual', 'فقط دستی (با دستور مستقیم کاربر)'),
       )
       sync_mode = models.CharField(max_length=20, choices=SYNC_MODE_CHOICES, default='immediate', verbose_name="حالت همگام‌سازی")
       scheduled_start_time = models.TimeField(default='23:00:00', verbose_name="ساعت شروع ارسال در ساعات خلوتی")
       scheduled_end_time = models.TimeField(default='06:00:00', verbose_name="ساعت پایان ارسال در ساعات خلوتی")
       chunk_delay_seconds = models.PositiveSmallIntegerField(default=1, verbose_name="تاخیر بین فایل‌ها جهت کنترل پهنای باند (ثانیه)")
       ```
  2. ایجاد و اعمال مهاجرت رو به جلو Django طبق پروتکل `safe-migration`.
  3. `backend/personnel/signals_gdrive.py`:
     * مشروط‌سازی فعال‌سازی نخ ناهمگام (`_trigger_async_sync`) به شرط `config.sync_mode == 'immediate'`. در حالت‌های زمان‌بندی‌شده و دستی، تسک در دیتابیس ثبت شده اما هیچ نخ آپلودی فراخوانی نخواهد شد.
  4. `backend/personnel/management/commands/run_gdrive_sync_worker.py`:
     * تطبیق زمان فعلی سرور (`timezone.localtime().time()`) با بازه ساعات مجاز شرکت برای تسک‌های حالت `scheduled` (با پشتیبانی از بازه‌های عبورکننده از نیمه‌شب مانند ۲۳:۰۰ تا ۰۶:۰۰).
     * اعمال تاخیر نرم (`time.sleep(config.chunk_delay_seconds)`) بین ارسال تسک‌ها جهت ممانعت از اشغال ۱۰۰ درصدی پهنای باند آپلود شبکه.
  5. `backend/personnel/google_drive_views.py`:
     * توسعه اندپوینت ذخیره و واکشی تنظیمات جهت پشتیبانی از فیلدهای زمان‌بندی و حالت همگام‌سازی.
     * افزودن اندپوینت اقدام دستی (`POST .../gdrive/trigger-sync/`) برای اجرای درجا و با اولویت صف به دستور کاربر در حالت‌های دستی یا خارج از ساعات زمان‌بندی.
  6. `frontend/src/app/components/settings/tabs/settings-gdrive-tab/`:
     * افزودن کارت کنترل سیاست و زمان‌بندی با سلکتور مدرن ۳ حالته (آنی، زمان‌بندی در ساعات خلوتی، دستی).
     * اینپوت‌های انتخاب ساعت شروع و پایان خلوتی شبکه با استایل ارگونومیک طراحی سیستم.
     * دکمه اقدام سریع «ارسال دستی صف فایل‌های معلق» با بازخورد نوار پیشرفت و Toast.
  7. اجرای تست‌های مربوطه و نگهبان‌های پروژه جهت اطمینان از عدم شکست.

> [!NOTE]
> **وضعیت فاز ۶:** این فاز با موفقیت کامل در هر دو لایه بک‌اند و فرانت‌اند پیاده‌سازی و تست‌های واحد و بیلد پروداکشن آن با موفقیت ۱۰۰ درصدی سپری شد.

---

### ۴. جدول مقایسه‌ای ماتریس تغییرات فایل‌ها

| نام فایل | لایه معماری | ماهیت تغییر | توضیحات کلیدی |
| :--- | :--- | :--- | :--- |
| `backend/requirements.txt` | وابستگی‌ها | ویرایش | افزودن کتابخانه‌های رسمی Google API، httplib2 و pysocks |
| `personnel/models.py` | دیتابیس | ویرایش | افزودن مدل‌های کانفیگ، صف و فیلدهای زمان‌بندی و سیاست ترافیک |
| `personnel/google_drive_service.py` | سرویس بک‌اند | جدید | مدیریت کلاینت گوگل، پشتیبانی از پروکسی، آپلود چانکی Resumable و آرشیو |
| `personnel/google_drive_path_resolver.py` | هسته منطق | جدید | تولید ساختار درختی و نام معنادار فارسی با اولویت تاریخ فاکتور و شناسه یکتا |
| `personnel/signals_gdrive.py` | رویدادها | جدید | شنود ذخیره/حذف، ثبت در صف و ترایگر مشروط نخ بر اساس حالت همگام‌سازی |
| `personnel/google_drive_views.py` | API بک‌اند | جدید | جریان OAuth2، قطع اتصال، آمار صف، تنظیمات زمان‌بندی و اجرای دستی |
| `accounts/backup_service.py` | بک‌آپ | ویرایش | هوک اتصال پشتیبان دیتابیس به صف همگام‌سازی درایو |
| `management/commands/run_gdrive_sync_worker.py` | پردازش پس‌زمینه | جدید | ورکر دائمی پایش صف با رعایت ساعات خلوتی، کنترل پهنای باند و Auto-Retry |
| `frontend/.../settings-gdrive-tab.ts` | فرانت‌اند | جدید/ویرایش | کامپوننت کارت اتصال، انتخابگر حالت همگام‌سازی، زمان‌بندی و مانیتورینگ صف |
| `frontend/.../icon-registry.ts` | فرانت‌اند | ویرایش | رجیستر آیکون‌های استاندارد درایو، زمان‌بندی و وضعیت ابری |

</div>

