# راهنمای اجرایی بسته ۳: امنیت، کنترل دسترسی، اعتبارسنجی و اسکنر (Permissions & Scanner)

این سند راهنمای گام‌به‌گام پیاده‌سازی **بسته ۳** از طرح پایدارسازی صفحه تنظیمات سامانه است.

---

## 🎯 اهداف بسته ۳
- گیت‌کردن دکمه ذخیره در فرانت بر اساس مجوز `perm_sys_settings` و نمایش بنر فقط‌خواندنی (ایراد ۱-۱).
- استخراج و نمایش صریح پیام‌های خطای ارسالی بک‌اند در زمان شکست ذخیره (ایراد ۱-۲).
- محدودسازی دسترسی متد `GET /api/settings/global/` به فیلدهای لازم برای کاربران عادی (ایراد ۱-۳).
- اعتبارسنجی ورودی‌ها با Serializer سخت‌گیر در متد `POST /api/settings/global/` (ایراد ۱-۴).
- اعمال کنترل دسترسی فیلدهای کالا (`field_permissions_counter`) در سمت سرور در متد ویرایش کالا (ایراد ۱-۵).
- اصلاح پیش‌تنظیم‌های جداکننده بارکد اسکنر جهت ذخیره کاراکترهای اسکی واقعی و حفظ سازگاری عقب‌رو (ایراد ۴-۱).
- اتصال مقدار تنظیمات کیفیت دوربین به تمام کامپوننت‌های `<app-barcode-scanner>` (ایراد ۴).
- حذف فیلد منسوخ `manager_approval_mode` از تمپلیت فرانت‌اند (ایراد ۴).
- تمیزکاری سوئیچ‌های چت در تمپلیت و حذف شکنندگی منطقی `!== false` (ایراد ۴-۲).

---

## 🛠️ گام‌های اجرایی و فایل‌های هدف

### گام ۱: مجوزها و اعتبارسنجی تنظیمات (فاز ۴)
1. **فرانت‌اند (`settings.ts` و `settings.html`):**
   - تعریف `canEditSettings = computed(() => this.auth.isSuperUser() || this.auth.hasPermission('accounts.perm_sys_settings'))`.
   - بایند کردن `[disabled]="!canEditSettings()"` روی دکمه ذخیره و نمایش بنر خاکستری «حالت فقط‌خواندنی» برای کاربران عادی.
   - اصلاح هندلر خطا در `saveGlobalSettings`:
     ```ts
     error: (err: any) => {
       const msg = err?.error?.error || 'خطا در ذخیره تنظیمات سیستم.';
       this.toast.show('error', msg);
     }
     ```
2. **بک‌اند (`warehouses/views.py` و `warehouses/serializers.py`):**
   - در `SettingsViewSet.global_settings`:
     - برای متد `GET`: اگر کاربر `is_superuser` یا دارای `perm_sys_settings` بود، تمام تنظیمات بازگردد. در غیر این صورت، تنها کلیدهای مورد نیاز کارتابل‌ها (`field_permissions_counter`, `field_permissions_doc`, `blind_counting`, `counter_can_view_*`, `financial_can_view_*`, `scanner_*_delimiter`) بازگردانده شوند.
     - برای متد `POST`: ایجاد `GlobalSettingsSerializer` با اعتبارسنجی دقیق نوع داده‌ها، بازه‌های مجاز (مانند تایم‌اوت‌ها ۱ تا ۱۴۴۰) و رد کلیدهای ناشناخته با خطای ۴۰۰.

### گام ۲: اعمال سمت سرور مجوز فیلدهای کالا (فاز ۵)
1. **در `backend/warehouses/services.py`:**
   - ساخت متد:
     ```python
     def get_editable_item_fields(user, warehouse_id=None) -> set[str]:
     ```
     که در صورت عدم دسترسی مدیر/سرپرست، نقشه `field_permissions_counter` انبار یا سراسری را می‌خواند و مجموعه کلیدهای `editable=True` را بازمی‌گرداند.
2. **در `backend/inventory/views.py` (`ItemViewSet.partial_update`):**
   - بررسی فیلدهای ارسالی در درخواست `PATCH /api/inventory/items/{id}/`.
   - اگر کاربر نقش انبارگردان داشت و فیلدی خارج از مجموعه فیلدهای مجاز ارسال شده بود، درخواست با خطای ۴۰۰ و فهرست فیلدهای غیرمجاز رد شود.
   - ثبت تلاش ناموفق با `log_audit_event(severity='warning')`.

### گام ۳: منطق اسکنر و پاکسازی کدهای مرده (فاز ۶)
1. **اصلاح جداکننده‌های اسکنر (ایراد ۴-۱):**
   - در `settings.ts`، متد `onScannerPresetChange` کاراکترهای اسکی واقعی ذخیره کند:
     - حالت کنترل: `\x1E` برای سطر و `\x1F` برای ستون.
     - حالت اکسل: `\n` برای سطر و `\t` برای ستون.
   - ساخت تابع `decodeDelimiter(val: string): string` در `customs.ts` برای تبدیل توکن‌های قدیمی مانند `'Chr(30)'` به کاراکتر واقعی جهت حفظ سازگاری رکوردهای قبلی.
2. **اتصال کیفیت دوربین (ایراد ۴):**
   - بایند کردن `[serverPreset]="settings.scanner_camera_preset"` روی نمونه‌های `<app-barcode-scanner>` در داشبوردهای انبارگردان، سرپرست و گمرک.
3. **پاکسازی فیلد منسوخ مدیر (ایراد ۴):**
   - حذف المان `<select>` مربوط به `manager_approval_mode` از `settings.html:114` و `wh-settings.ts`.
4. **تمیزکاری سوئیچ‌های چت (ایراد ۴-۲):**
   - ساده‌سازی بایندینگ `settings.chat_enabled` و `settings.chat_file_sharing` در `settings.html` با متغیرهای بولین تمیز.

---

## 🧪 دستورهای راستی‌آزمایی و تست

```bash
# تست‌های بک‌اند
cd "E:/warehouse project/backend"
python manage.py test warehouses.tests_settings inventory.tests -v 2 --keepdb

# تست‌های فرانت‌اند
cd "E:/warehouse project/frontend"
npx ng test --watch=false --browsers=ChromeHeadless
```
