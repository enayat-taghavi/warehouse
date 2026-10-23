# طرح جامع تحول، استانداردسازی و رفع نواقص صفحه مانیتورینگ کلاینت‌ها و حل تداخل (Local-First Fleet Telemetry, 3-Way Merge Engine & Active Sessions Hub)

این سند معماری و اجرایی، طرح تفصیلی و گام‌به‌گام رفع کلیه ۸ ایراد بنیادین شناسایی‌شده در صفحه «مانیتورینگ کلاینت‌ها و تداخل» (`OperationsSyncMonitorComponent`) را به همراه تعبیه کنسول زنده مدیریت سشن‌ها و ابطال نشست‌ها (Active Sessions & Force Logout Hub)، ادغام با موتور واقعی حل تداخل ۳-سویه (`OfflineSyncService` و `ConflictResolutionModalComponent`)، اتصال دکمه تخلیه صف به `triggerSync`، پایش دوگانه پایگاه‌های داده آفلاین، و استقرار **ایجنت سخت‌گیر نگهبان ۲۸ (Guardian 28)** تشریح می‌کند.

---

## ۱. جدول ماتریس وضعیت فعلی در برابر معماری هدف (Current State vs Target Architecture)

<div dir="rtl" align="right">

| ردیف | مولفه / قابلیت | وضعیت فعلی (دارای نقص) | معماری هدف (پس از استقرار طرح) | اولویت |
| :---: | :--- | :--- | :--- | :---: |
| **۱** | **داده‌های ناوگان تبلت‌ها** | داده‌های ماک و هاردکد شده (`tab_tablet_counter_01` و...) | تله‌متری ۱۰۰٪ زنده از طریق مدل سروری `UserDeviceSession` و سیگنال ضربان قلب (`Heartbeat`) | بحرانی (P0) |
| **۲** | **اطلاعات دستگاه و کلاینت** | صرفاً یک رشته تصادفی موقت در `sessionStorage` | استخراج مدل دقیق دستگاه (سامسونگ، ویندوز و...) با `detectClientDeviceModel`، مرورگر، سیستم‌عامل، آی‌پی و نام کاربر لاگین‌شده | بحرانی (P0) |
| **۳** | **تخلیه صف آفلاین** | دکمه دکوری با پیام توست بدون هیچ فراخوانی بک‌اند | تزریق مستقیم `OfflineSyncService` و اجرای واقعی `triggerSync()` به همراه نمایش درصد پیشرفت و انیمیشن ارسال | بحرانی (P0) |
| **۴** | **موتور حل تداخل ۴۰۹** | پنهان‌سازی صوری خطا (`dismissed: 1`) بدون بروزرسانی IndexedDB و تکرار خطای ۴۰۹ در بازارسال | اتصال به موتور واقعی `resolveConflict`، بروزرسانی خودکار دیتابیس محلی با نسخه سرور و ادغام با `base_updated_at` | بحرانی (P0) |
| **۵** | **رابط کاربری حل تداخل** | چاپ یک آبجکت JSON خام بدون امکان مقایسه جزءبه‌جزء فیلدها | یکپارچگی مستقیم با `ConflictResolutionModalComponent` برای مقایسه بصری فیلد‌به‌فیلد و کلیدهای ادغام هوشمند | بالا (P1) |
| **۶** | **پایش پایگاه‌های داده آفلاین** | کوری نسبت به دیتابیس مالی (`financeOfflineDb`) و خواندن فقط دیتابیس انبار | پایش همزمان و تجمیعی دو دیتابیس `warehouseOfflineDb` و `financeOfflineDb` | بالا (P1) |
| **۷** | **مدیریت و ابطال سشن‌ها** | نبود سازوکار مشاهده سشن‌های آنلاین کاربر و عدم امکان قطع دسترسی | کنسول ابطال سشن (`Revoke Session`) با دکمه خروج اجباری دستگاه‌های مشکوک و ثبت در لاگ ممیزی (`AuditLog`) | بالا (P1) |
| **۸** | **سد امنیتی SoD و RBAC** | عدم بررسی نقش در عملیات تداخل و تخلیه صف | اعمال سد SoD (صرفاً سرپرست، حسابدار و ادمین مجاز به داوری و حل تداخل هستند) | بالا (P1) |
| **۹** | **تست و ارزیابی نگهبان** | تست‌های اولیه مربوط به فایل‌های استاتیک | استقرار **ایجنت نگهبان ۲۸** در `phase_guardian_approval.py` با اعتبارسنجی ۱۰۰٪ خودکار بک‌اند و فرانت‌اند | بحرانی (P0) |

</div>

---

## ۲. طراحی فنی و مدل‌های داده بک‌اند (Backend Architecture & Schema)

### ۲.۱. ایجاد مدل پایش زنده دستگاه‌ها و نشست‌ها (`UserDeviceSession`) در `accounts/models.py`
این مدل وظیفه ثبت وضعیت زنده تبلت‌ها، لپ‌تاپ‌ها و ایستگاه‌های کاری متصل به سامانه را بر عهده دارد:

```python
class UserDeviceSession(models.Model):
    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name='device_sessions',
        verbose_name="کاربر متصل"
    )
    session_key = models.CharField(max_length=128, unique=True, db_index=True, verbose_name="کلید یکتای سشن")
    tab_id = models.CharField(max_length=120, db_index=True, verbose_name="شناسه تب کلاینت")
    device_model = models.CharField(max_length=200, default="ناشناخته", verbose_name="مدل دستگاه")
    os_name = models.CharField(max_length=100, default="Unknown", verbose_name="سیستم‌عامل")
    browser_name = models.CharField(max_length=100, default="Unknown", verbose_name="مرورگر")
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="آدرس آی‌پی")
    app_scope = models.CharField(max_length=50, default="warehouse", verbose_name="قلمرو فعال (انبار/مالی)")
    active_role = models.CharField(max_length=50, default="counter", verbose_name="نقش فعال")
    pending_queue_count = models.PositiveIntegerField(default=0, verbose_name="تعداد تراکنش‌های معلق صف")
    conflict_count = models.PositiveIntegerField(default=0, verbose_name="تعداد تداخل‌های حل‌نشده")
    is_revoked = models.BooleanField(default=False, db_index=True, verbose_name="آیا نشست ابطال شده است؟")
    last_heartbeat = models.DateTimeField(auto_now=True, db_index=True, verbose_name="آخرین پالس زنده")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان شروع نشست")

    class Meta:
        verbose_name = "نشست فعال دستگاه"
        verbose_name_plural = "نشست‌های فعال دستگاه‌ها و ناوگان"
        ordering = ['-last_heartbeat']
        indexes = [
            models.Index(fields=['user', 'is_revoked', 'last_heartbeat']),
            models.Index(fields=['session_key']),
        ]
```

### ۲.۲. اندپوینت‌های REST API بک‌اند در `accounts/views.py` و `accounts/urls.py`

<div dir="rtl" align="right">

| متد | آدرس اندپوینت (URL) | سطح دسترسی (RBAC) | شرح عملیات |
| :---: | :--- | :---: | :--- |
| `POST` | `/api/accounts/telemetry/heartbeat/` | تمام کاربران لاگین | دریافت تله‌متری زنده کلاینت (مدل دستگاه، صف آفلاین، تب)؛ بررسی ابطال بودن نشست و در صورت ابطال بازگرداندن کد ۴۰۳ با خطای `SESSION_REVOKED` |
| `GET` | `/api/accounts/telemetry/fleet/` | سرپرست / مدیر / ادمین | دریافت فهرست دستگاه‌ها و سشن‌های فعال در انبار طی ۵ دقیقه گذشته با تفکیک آنلاین/آفلاین |
| `POST` | `/api/accounts/telemetry/sessions/<id>/revoke/` | مدیر سیستم (Superuser) | ابطال فوری سشن دستگاه مشکوک، ثبت در لاگ ممیزی `AuditLog` و صدور فرمان خروج اجباری |

</div>

---

## ۳. طراحی فرانت‌اند و ارتقای صفحه عملیات (Frontend Modernization)

### ۳.۱. استخراج مشخصات واقعی دستگاه و ضربان قلب (`ClientTelemetryService`)
* فراخوانی تابع آماده `detectClientDeviceModel()` در هسته پروژه (`src/app/core/utils/device-detector.ts`).
* ارسال خودکار پالس سلامت هر ۳۰ ثانیه از طریق HTTP به اندپوینت ضربان قلب سرور.
* در صورت دریافت خطای `SESSION_REVOKED`، بلافاصله نشست کاربر پاک و به صفحه ورود هدایت شده و پیام امنیتی نمایش داده می‌شود.

### ۳.۲. ارتقای جدول ناوگان تبلت‌ها در `OperationsSyncMonitorComponent`
* حذف کدهای هاردکد شده (`tab_tablet_counter_01` و...).
* ترکیب دو لایه پایش:
  1. **لایه محلی (Local Multi-Tab Bus):** گوش دادن به پیام‌های `wh_enterprise_multi_tab_bus` جهت تشخیص تب‌های باز دیگر روی همان رایانه/تبلت.
  2. **لایه سراسری (Server Fleet):** نمایش ناوگان واقعی کلیه پرسنل آنلاین در انبارهای مختلف با نام و نام خانوادگی، عکس، مدل تبلت، آی‌پی، تعداد صف معلق و وضعیت اتصال.
* افزودن دکمه **«خروج اجباری / ابطال نشست (Revoke)»** در ستون عملیات با مودال تایید دو مرحله‌ای.

### ۳.۳. اتصال تخلیه صف به موتور واقعی همگام‌سازی (`triggerSync`)
* تزریق `OfflineSyncService` به جای پیام توست الکی.
* هنگام کلیک کاربر روی «تخلیه صف آفلاین»:
  1. تغییر وضعیت دکمه به حالت پردازش (`isSyncing = true`).
  2. اجرای `await this.offlineSync.triggerSync()`.
  3. نمایش نتیجه واقعی (تعداد ارسال موفق، تعداد خطای ۴۰۹ یا ناموفق).
  4. تازه‌سازی آنی لیست صف و تداخل‌ها.

### ۳.۴. ارتقای موتور حل تداخل و ادغام با `ConflictResolutionModalComponent`
* جایگزینی مودال ساده با کامپوننت کامل و پیشرفته `app-conflict-resolution-modal`:
  * مقایسه فیلد‌به‌فیلد داده سرور در برابر داده محلی تبلت با برچسب‌های فارسی استاندارد انبارداری.
  * انتخاب نسخه مطلوب برای هر فیلد به تفکیک یا انتخاب یکجای سرور/کلاینت.
  * ادغام خودکار فیلدهای غیرمتنازع.
* اجرای متد استاندارد `offlineSync.resolveConflict(err.id, finalMergedBody)` که در آن:
  * رکورد با برچسب زمانی سرور (`base_updated_at`) به‌روزرسانی شده و ارسال می‌شود.
  * رکورد محلی در `IndexedDB` هماهنگ می‌شود.
  * کش نامعتبر شده و خطای ۴۰۹ از دیتابیس محلی پاک می‌شود.

### ۳.۵. پایش همزمان دو دیتابیس محلی (Dual-DB Aggregation)
* خواندن تجمیعی `warehouseOfflineDb.syncQueue` و `financeOfflineDb.syncQueue`.
* خواندن تجمیعی `warehouseOfflineDb.syncErrors` و `financeOfflineDb.syncErrors`.
* نمایش تفکیکی و تجمیعی در کارت‌های بالای صفحه.

---

## ۴. طراحی ایجنت نگهبان ۲۸ (Phase Guardian 28 Specification)

در فایل `backend/personnel/phase_guardian_approval.py`، ایجنت نگهبان زیر افزوده خواهد شد:

```python
def audit_guardian_28_real_client_telemetry_and_conflict_engine(self) -> bool:
    """
    ایجنت نگهبان ۲۸: مرکز تله‌متری زنده کلاینت‌ها، ابطال سشن‌های فعال، موتور حل تداخل ۳-سویه و تخلیه صف آفلاین
    معیارها:
    ۱. وجود مدل UserDeviceSession، فیلدهای IP، DeviceModel، TabID و مایگریشن مربوطه
    ۲. اندپوینت ضربان قلب (/api/accounts/telemetry/heartbeat/) و تشخیص خطای SESSION_REVOKED
    ۳. اندپوینت لیست ناوگان (/api/accounts/telemetry/fleet/) و ابطال سشن توسط Superuser
    ۴. ثبت ممیزی AuditLog برای ابطال سشن با شدت warning
    ۵. اتصال واقعی OperationsSyncMonitorComponent به OfflineSyncService.triggerSync()
    ۶. اتصال مودال حل تداخل به ConflictResolutionModalComponent و متد resolveConflict()
    ۷. عدم وجود داده‌های هاردکد شده ساختگی در جدول ناوگان تبلت‌ها
    ۸. اعمال سد امنیتی SoD بر روی دکمه‌های حل تداخل و ابطال نشست
    """
```

---

## ۵. برنامه تغییرات فایل‌ها (Proposed File Changes)

### لایه بک‌اند (Django):
1. **[MODIFY]** `backend/accounts/models.py`: افزودن مدل `UserDeviceSession`.
2. **[NEW]** مایگریشن دیتابیس برای مدل جدید `UserDeviceSession`.
3. **[MODIFY]** `backend/accounts/views.py`: افزودن ویوهای `DeviceHeartbeatView`, `FleetSessionsListView`, `RevokeDeviceSessionView`.
4. **[MODIFY]** `backend/accounts/urls.py`: ثبت روت‌های تله‌متری و سشن‌ها.
5. **[MODIFY]** `backend/personnel/phase_guardian_approval.py`: افزودن متد `audit_guardian_28` و اجرای آن در `__main__`.

### لایه فرانت‌اند (Angular 19 Standalone):
1. **[MODIFY]** `frontend/src/app/core/services/session-tab.service.ts`: ادغام با `detectClientDeviceModel` و پالس خودکار ضربان قلب به سرور.
2. **[MODIFY]** `frontend/src/app/components/operations/operations-sync-monitor/operations-sync-monitor.ts`:
   * حذف داده‌های ماک.
   * تزریق `OfflineSyncService` و `HttpClient`.
   * اتصال به API ناوگان و سشن‌ها.
   * فراخوانی واقعی `triggerSync()` و `resolveConflict()`.
   * پایش تجمیعی دو دیتابیس.
3. **[MODIFY]** `frontend/src/app/components/operations/operations-sync-monitor/operations-sync-monitor.html`:
   * افزودن ستون‌های نام کاربر، مدل دستگاه، سیستم‌عامل، آی‌پی و دکمه ابطال سشن.
   * اتصال دکمه تخلیه صف به لودینگ واقعی.
   * تعبیه `app-conflict-resolution-modal` به جای مودال قدیمی.
   * نمایش پیام‌های SoD و نشانگرهای سلامت.

---

## ۶. نقشه اعتبارسنجی و تست‌ها (Verification Plan)

<div dir="rtl" align="right">

### آزمون‌های خودکار (Automated Tests)
1. اجرای مایگریشن‌های جنگو: `python manage.py migrate accounts`
2. اجرای تست واحد اندپوینت‌های بک‌اند: تست دریافت پالس، دریافت لیست ناوگان و ابطال سشن
3. اجرای تست بیلد کامل فرانت‌اند: `npm run build`
4. اجرای کامل سوئیت ۲۸ ایجنت سخت‌گیر نگهبان:
   ```bash
   python backend/personnel/phase_guardian_approval.py
   ```
   باید خروجی با تایید ۱۰۰٪ هر ۲۸ ایجنت (PASS) به پایان برسد.

### آزمون‌های تجربی و تعاملی (Manual & Interactive Checks)
1. باز کردن صفحه `/app/operations/sync-monitor` در مرورگر.
2. مشاهده مدل دستگاه فعلی در ردیف اول جدول (مثلاً `Windows PC (Chrome)` یا `Galaxy Tab`).
3. باز کردن همزمان یک تب دیگر و مشاهده شناسایی آنی تب دوم بدون ایجاد داده‌های جعلی.
4. تست دکمه شبیه‌سازی تداخل ۴۰۹ و بررسی اینکه آیا مودال حرفه‌ای مقایسه فیلد‌به‌فیلد باز می‌شود یا خیر.
5. حل تداخل و اطمینان از پاک شدن خطا و به‌روزرسانی IndexedDB.
6. تست دکمه تخلیه صف و مشاهده اجرای واقعی `triggerSync`.
7. تست ابطال یک سشن و مشاهده ثبت رویداد در لاگ ممیزی و خروج آن دستگاه.

</div>
