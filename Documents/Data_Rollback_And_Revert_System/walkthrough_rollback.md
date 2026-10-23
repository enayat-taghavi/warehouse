<div dir="rtl" align="right">

# گزارش جامع پیاده‌سازی بسته کامل دسترسی‌های حساس ۶‌گانه، بازگردانی و پشتیبان‌گیری
## (Complete 6-Sensitive Permissions RBAC, Data Rollback & Database Backup Verification Report)

این مستند فنی تشریح‌کننده نتایج پیاده‌سازی، گیت‌های اعتبارسنجی مستقل ۵‌گانه، و تغییرات نهایی در سیستم بازگردانی، پشتیبان‌گیری و ماتریس دسترسی‌های سازمانی است.

---

### ۱. بسته کامل دسترسی‌های حساس و بحرانی ۶‌گانه (Sensitive Permissions)

| ردیف | شناسه دسترسی (`codename`) | عنوان فارسی در سیستم | مکانیزم حفاظتی |
| :---: | :--- | :--- | :--- |
| ۱ | `perm_rollback_data` | دسترسی به بازگردانی و احیای داده‌ها (بسیار حساس) | قفل برای غیر Superuser + مدال هشدار امنیتی ۲ مرحله‌ای |
| ۲ | `perm_sys_backup_restore` | دسترسی به پشتیبان‌گیری و بازیابی پایگاه داده (بسیار حساس) | قفل برای غیر Superuser + الزام تایید متنی `RESTORE_DATABASE_CONFIRM` |
| ۳ | `perm_sys_purge_logs` | دسترسی به پاکسازی و حذف لاگ‌های ممیزی (بسیار حساس) | قفل برای غیر Superuser + ثبت لاگ Critical |
| ۴ | `perm_sys_hard_delete` | دسترسی به حذف فیزیکی و قطعی داده‌ها (بسیار حساس) | قفل برای غیر Superuser + مستثنی از Soft Delete |
| ۵ | `perm_sys_emergency_freeze` | دسترسی به فریز اضطراری و قفل سراسری کلیه انبارها (بسیار حساس) | قفل برای غیر Superuser + هشدار بحرانی |
| ۶ | `perm_sys_factory_reset` | دسترسی به بازنشانی مقادیر اولیه و ریست سیستم (بسیار حساس) | قفل برای غیر Superuser + تاییدیه چندمرحله‌ای |

---

### ۲. نتایج گیت‌های اعتبارسنجی مستقل (Verification Gates Matrix)

```
[گیت ۱: بک‌اند و مایگریشن]  -->  [تایید ۱۰۰٪] ✅
[گیت ۲: ماتریس فرانت‌اند]   -->  [تایید ۱۰۰٪ (خروج کد ۰)] ✅
[گیت ۳: موتور بازگردانی]     -->  [تایید ۱۰۰٪ اتمیک] ✅
[گیت ۴: پشتیبان و چرخش]    -->  [تایید ۱۰۰٪ با هش SHA-256] ✅
[گیت ۵: اعتبارسنجی نهایی]    -->  [تایید ۱۰۰٪ End-to-End] ✅
```

| فاز | موضوع فاز | خروجی اعتبارسنجی گیت | وضعیت |
| :---: | :--- | :--- | :---: |
| **گیت ۱** | زیرساخت امنیتی دسترسی‌های ۶‌گانه در بک‌اند | مایگریشن `0022` اعمال شد؛ سریالایزر `is_sensitive=True` برای هر ۶ مورد تایید شد؛ بلاک کاربر عادی با خطای ۴۰۳ تست گردید. | ✅ **تایید قطعی** |
| **گیت ۲** | رابط کاربری ماتریس دسترسی‌ها در فرانت‌اند | تب `SENSITIVE` همیشه فعال؛ چک‌باکس‌ها برای کاربر عادی Disabled با پیام راهنما؛ مدال هشدار ۲ مرحله‌ای برای Superuser؛ کامپایل بدون خطا. | ✅ **تایید قطعی** |
| **گیت ۳** | انطباق موتور بازگردانی داده با مجوزها | بازگردانی Update/Delete به صورت اتمیک اجرا شد و لاگ ممیزی بنفش رنگ `ROLLBACK` با موفقیت در سیستم نشست. | ✅ **تایید قطعی** |
| **گیت ۴** | سیستم پشتیبان‌گیری و دستور چرخش خودکار | بکاپ باینری PostgreSQL ایجاد شد؛ هش SHA-256 تایید گردید؛ دستور `run_auto_backup --keep 5` نسخه‌های قدیمی را پاکسازی کرد. | ✅ **تایید قطعی** |
| **گیت ۵** | آزمون جامع نهایی و یکپارچگی DUAL-SAVE | بیلد نهایی پروژه با خروج کد ۰ تایید شد؛ تمامی فایل‌های مستندات و چک‌لیست‌ها با استانداردهای Claude Opus 4.6 ذخیره شدند. | ✅ **تایید قطعی** |

---

### ۳. فایل‌های ویرایش‌شده و تغییرات کلیدی (File Modifications)

#### 🔹 لایه بک‌اند (Django):
- [models.py](file:///e:/warehouse%20project/backend/accounts/models.py): افزودن ۳ دسترسی تکمیلی به `CustomUser.Meta.permissions` و تعریف ۶ دسترسی در `SENSITIVE_PERMISSION_CODENAMES`.
- [0022_alter_customuser_options.py](file:///e:/warehouse%20project/backend/accounts/migrations/0022_alter_customuser_options.py): مایگریشن اعمال دسترسی‌های جدید.
- [serializers.py](file:///e:/warehouse%20project/backend/accounts/serializers.py): سریالایز داینامیک `is_sensitive=True` برای کلیه پرمیشن‌های مجموعه حساس.
- [views.py](file:///e:/warehouse%20project/backend/accounts/views.py): گارد مسدودسازی انتساب دسترسی‌های حساس در `CustomRoleViewSet` و `UserViewSet` برای کاربران غیر Superuser.
- [rollback_service.py](file:///e:/warehouse%20project/backend/accounts/rollback_service.py): پشتیبانی کامل از ID و Instance برای پیش‌نمایش و اجرای اتمیک بازگردانی.
- [backup_service.py](file:///e:/warehouse%20project/backend/accounts/backup_service.py): سرویس تولید Dump، هش SHA-256 و ساخت اسنپ‌شات اضطراری پیش از بازیابی.
- [run_auto_backup.py](file:///e:/warehouse%20project/backend/accounts/management/commands/run_auto_backup.py): کامند مدیریتی پشتیبان‌گیری و چرخش دوره‌ای فایل‌ها.

#### 🔹 لایه فرانت‌اند (Angular):
- [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts): اصلاح `loadData()` برای نمایش همیشگی تب دسترسی‌های حساس و گارد `isSuperuser()` در `toggleRolePermission`.
- [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html): طراحی شکیل تب دسترسی‌های حساس، بنر راهنمای امنیتی برای کاربران عادی، حالت غیرفعال (Disabled) برای غیر Superuser و مدال هشدار قرمز ۲ مرحله‌ای برای مدیر ارشد.
- [wh-settings.ts](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.ts) & [wh-settings.html](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html): تب اختصاصی پشتیبان‌گیری دیتابیس با اعتبارسنجی هش و تاییدیه تایپی `RESTORE_DATABASE_CONFIRM`.
- [audit.ts](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts) & [audit.html](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html): دکمه‌های بازگردانی رکوردها و مدال مقایسه زنده وضعیت کنونی با قبل.

---

### ۴. راهنمای مشاهده و آزمون عملی (User Verification Guide)

1. **مشاهده تب دسترسی‌های حساس در مدیریت کاربران:**
   - منوی «مدیریت کاربران و نقش‌ها» -> کلیک روی «ایجاد نقش جدید» یا «ویرایش نقش».
   - در بخش ماتریس دسترسی‌ها، تب قرمز رنگ **«دسترسی‌های حساس و بحرانی 🛡️ (۶ مورد)»** را انتخاب کنید.
   - هر ۶ دسترسی با برچسب‌های اختصاصی و آیکون سپر نمایش داده می‌شوند.
   - در صورت لاگین به عنوان غیر Superuser، چک‌باکس‌ها قفل بوده و بنر امنیتی نمایش داده می‌شود.
   - با لاگین به عنوان مدیر ارشد (Superuser)، با کلیک روی هر چک‌باکس، مدال هشدار قرمز باز شده و با تایید، اضافه می‌شود.
   - دکمه «انتخاب همه» به هیچ وجه این دسترسی‌ها را تیک نخواهد زد.

2. **بازگردانی رکوردها (Rollback):**
   - منوی «ممیزی و رهگیری سیستم» -> کلیک روی دکمه «بازگردانی» هر لاگ.
   - مشاهده تفاوت مقادیر زنده با قبل و کلیک روی «تایید و بازگردانی قطعی داده».

3. **پشتیبان‌گیری و بازیابی دیتابیس:**
   - منوی «تنظیمات سیستم» -> تب «پشتیبان پایگاه‌داده 🛡️».
   - امکان ایجاد پشتیبان، بررسی سلامت هش SHA-256، دانلود فایل، و بازیابی دیتابیس با تایپ عبارت `RESTORE_DATABASE_CONFIRM`.

</div>
