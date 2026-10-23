<div dir="rtl" align="right">

# ورود و خروج دسته‌جمعی اطلاعات با فایل اکسل (Bulk Excel Import/Export)

پیاده‌سازی قابلیت دانلود (Export) و آپلود دسته‌جمعی (Bulk Import) اطلاعات کاربران، انبارها و نقش‌ها به/از فایل اکسل (`.xlsx`). این قابلیت شامل اعتبارسنجی، گزارش خطای سطری، و دانلود فایل قالب نمونه (Template) است.

---

## بررسی کاربر لازم است (User Review Required)

> [!IMPORTANT]
> **کتابخانه `openpyxl`** از قبل در [requirements.txt](file:///e:/warehouse%20project/backend/requirements.txt) نصب شده (نسخه `3.1.5`). نیازی به نصب کتابخانه جدید نیست.

> [!WARNING]
> **دسترسی Import/Export:** طبق پیشنهاد قبلی، عملیات Import فقط برای کاربران دارای مجوز مدیریت (`perm_usr_add` برای کاربران، `perm_wh_create` برای انبارها، `perm_usr_role` برای نقش‌ها) مجاز خواهد بود. آیا این سیاست مورد تأیید شماست؟

---

## سوالات باز (Open Questions)

> [!NOTE]
> **۱. رفتار ردیف‌های تکراری هنگام Import:**
> اگر ردیفی در فایل اکسل وجود داشته باشد که `username` (برای کاربر) یا `code` (برای انبار) آن از قبل در دیتابیس موجود باشد، کدام رفتار مورد نظر شماست؟
> - **الف) رد شود** و در گزارش خطا نمایش داده شود (پیشنهادی ✅)
> - **ب) بروزرسانی شود** (Update) و روی رکورد قبلی بازنویسی کند

> [!NOTE]
> **۲. محدودیت حجم فایل:**
> حداکثر چند سطر در یک فایل اکسل قابل پردازش باشد؟ (پیشنهاد: ۵۰۰ سطر بدون نیاز به Celery)

---

## تغییرات پیشنهادی (Proposed Changes)

### ۱. بک‌اند — ماژول جدید اکسل (`excel_utils`)

ایجاد یک ماژول مشترک برای منطق تولید و خوانش فایل‌های اکسل.

#### [NEW] [excel_utils.py](file:///e:/warehouse%20project/backend/accounts/excel_utils.py)

فایل کمکی حاوی توابع زیر:

| تابع | عملکرد |
|---|---|
| `generate_users_excel(queryset)` | تبدیل QuerySet کاربران به فایل اکسل با ستون‌های: نام، نام خانوادگی، شناسه ورود، کد ملی، تلفن، منطقه عملیاتی، نقش‌ها، انبارهای تخصیص‌یافته، وضعیت |
| `generate_users_template()` | تولید فایل قالب خالی (Template) با هدرها و ۲ سطر داده نمونه |
| `parse_users_excel(file)` | خوانش فایل اکسل آپلودی، اعتبارسنجی هر سطر، و بازگشت لیست `{valid_rows, errors}` |

#### [NEW] [excel_utils.py](file:///e:/warehouse%20project/backend/warehouses/excel_utils.py)

| تابع | عملکرد |
|---|---|
| `generate_warehouses_excel(queryset)` | تبدیل QuerySet انبارها به فایل اکسل با ستون‌های: کد، نام، نام پروژه، نوع، مکان، تلفن، مسئول، ظرفیت، شرکت بهره‌بردار، وضعیت |
| `generate_warehouses_template()` | فایل قالب خالی + ۲ سطر نمونه |
| `parse_warehouses_excel(file)` | خوانش و اعتبارسنجی فایل اکسل انبارها |

#### [NEW] [roles_excel_utils.py](file:///e:/warehouse%20project/backend/accounts/roles_excel_utils.py)

| تابع | عملکرد |
|---|---|
| `generate_roles_excel(queryset)` | تبدیل QuerySet نقش‌ها به اکسل با ستون‌های: نام سیستمی، عنوان فارسی، رنگ، نقش والد، دسترسی‌ها |
| `generate_roles_template()` | فایل قالب خالی + ۲ سطر نمونه |
| `parse_roles_excel(file)` | خوانش و اعتبارسنجی فایل اکسل نقش‌ها |

---

### ۲. بک‌اند — اکشن‌های جدید در (ViewSet) ها

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/accounts/views.py)

اضافه کردن ۳ اکشن جدید به `UserViewSet`:

| اکشن | متد HTTP | مسیر URL | عملکرد |
|---|---|---|---|
| `export_excel` | `GET` | `/auth/users/export_excel/` | دانلود فایل اکسل شامل همه کاربران |
| `import_excel` | `POST` | `/auth/users/import_excel/` | آپلود فایل اکسل و ایجاد دسته‌جمعی کاربران |
| `download_template` | `GET` | `/auth/users/download_template/` | دانلود فایل قالب نمونه (Template) |

اضافه کردن ۳ اکشن جدید به `CustomRoleViewSet`:

| اکشن | متد HTTP | مسیر URL | عملکرد |
|---|---|---|---|
| `export_excel` | `GET` | `/auth/roles/export_excel/` | دانلود فایل اکسل شامل همه نقش‌ها |
| `import_excel` | `POST` | `/auth/roles/import_excel/` | آپلود فایل اکسل و ایجاد دسته‌جمعی نقش‌ها |
| `download_template` | `GET` | `/auth/roles/download_template/` | دانلود فایل قالب نمونه |

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/warehouses/views.py)

اضافه کردن ۳ اکشن جدید به `WarehouseViewSet`:

| اکشن | متد HTTP | مسیر URL | عملکرد |
|---|---|---|---|
| `export_excel` | `GET` | `/warehouses/export_excel/` | دانلود فایل اکسل شامل همه انبارها |
| `import_excel` | `POST` | `/warehouses/import_excel/` | آپلود فایل اکسل و ایجاد دسته‌جمعی انبارها |
| `download_template` | `GET` | `/warehouses/download_template/` | دانلود فایل قالب نمونه |

---

### ۳. ساختار خروجی اکسل و اعتبارسنجی

#### ستون‌های فایل اکسل کاربران

| ستون اکسل | فیلد مدل | الزامی | اعتبارسنجی |
|---|---|---|---|
| نام (first_name) | `first_name` | ✅ | حداقل ۱ کاراکتر |
| نام خانوادگی (last_name) | `last_name` | ✅ | حداقل ۱ کاراکتر |
| شناسه ورود (username) | `username` | ✅ | یکتا بودن، بدون فاصله |
| کد ملی (national_code) | `national_code` | ❌ | ۱۰ رقم عددی، یکتا |
| تلفن (phone_number) | `phone_number` | ❌ | فرمت تلفن |
| منطقه عملیاتی (operational_zone) | `operational_zone` | ❌ | - |
| نقش‌ها (roles) | `groups` | ❌ | نام‌های سیستمی جدا شده با کاما — بررسی وجود در دیتابیس |
| انبارها (warehouses) | `assigned_warehouses` | ❌ | کدهای انبار جدا شده با کاما — بررسی وجود در دیتابیس |
| فعال (is_active) | `is_active` | ❌ | `بله`/`خیر` یا `1`/`0` (پیش‌فرض: بله) |

#### ستون‌های فایل اکسل انبارها

| ستون اکسل | فیلد مدل | الزامی | اعتبارسنجی |
|---|---|---|---|
| کد (code) | `code` | ❌ | یکتا (اگر خالی، خودکار تولید) |
| نام (name) | `name` | ✅ | حداقل ۱ کاراکتر |
| نام پروژه (project_name) | `project_name` | ❌ | - |
| نوع (type) | `type` | ❌ | - |
| مکان (location) | `location` | ❌ | - |
| تلفن (phone_number) | `phone_number` | ❌ | - |
| ظرفیت (capacity) | `capacity` | ❌ | عدد صحیح |
| شرکت بهره‌بردار (operator_company) | `operator_company` | ❌ | - |
| رنگ (color) | `color` | ❌ | فرمت HEX مثل `#6366f1` |
| توضیحات (description) | `description` | ❌ | - |

#### ستون‌های فایل اکسل نقش‌ها

| ستون اکسل | فیلد مدل | الزامی | اعتبارسنجی |
|---|---|---|---|
| نام سیستمی (name) | `name` | ✅ | یکتا، بدون فاصله |
| عنوان فارسی (title) | `title` | ✅ | حداقل ۱ کاراکتر |
| رنگ (color) | `color` | ❌ | فرمت HEX (پیش‌فرض: `#94a3b8`) |
| نقش والد (parent) | `parent` | ❌ | نام سیستمی نقش والد — بررسی وجود |
| دسترسی‌ها (permissions) | `permissions` | ❌ | `codename` های جدا شده با کاما |

---

### ۴. ساختار پاسخ Import (گزارش خطا)

```json
{
  "success": true,
  "summary": {
    "total_rows": 50,
    "created": 45,
    "skipped": 5
  },
  "errors": [
    { "row": 3, "field": "username", "message": "این شناسه ورود قبلاً ثبت شده است." },
    { "row": 7, "field": "national_code", "message": "کد ملی باید ۱۰ رقم باشد." }
  ]
}
```

---

### ۵. فرانت‌اند — سرویس‌های HTTP جدید

#### [MODIFY] [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts)

اضافه کردن متدهای زیر:

```typescript
// Users Excel
exportUsersExcel(): Observable<Blob>
importUsersExcel(file: File): Observable<ImportResult>
downloadUsersTemplate(): Observable<Blob>

// Roles Excel
exportRolesExcel(): Observable<Blob>
importRolesExcel(file: File): Observable<ImportResult>
downloadRolesTemplate(): Observable<Blob>
```

#### [MODIFY] [warehouse-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/warehouse-http.service.ts)

```typescript
exportExcel(): Observable<Blob>
importExcel(file: File): Observable<ImportResult>
downloadTemplate(): Observable<Blob>
```

---

### ۶. فرانت‌اند — رابط کاربری (UI)

#### [MODIFY] [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts) و [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html)

- اضافه کردن **دکمه‌های اکشن** در بالای لیست کاربران و لیست نقش‌ها:
  - 📥 **دانلود اکسل** — خروجی اکسل از لیست فعلی
  - 📤 **آپلود اکسل** — باز کردن مودال آپلود فایل
  - 📋 **دانلود فایل نمونه** — دانلود Template

- اضافه کردن **مودال آپلود اکسل** (`ExcelImportModal`):
  - ناحیه Drag & Drop با آیکون فایل
  - دکمه انتخاب فایل (فقط `.xlsx`)
  - نمایش پیش‌نمایش نام فایل و حجم آن
  - دکمه‌های «شروع آپلود» و «انصراف»
  - نمایش Progress Bar هنگام آپلود
  - نمایش گزارش نتیجه (تعداد موفق، تعداد ناموفق، جدول خطاها)

#### [MODIFY] [projects.ts](file:///e:/warehouse%20project/frontend/src/app/components/projects/projects.ts) و [projects.html](file:///e:/warehouse%20project/frontend/src/app/components/projects/projects.html)

- اضافه کردن همان ۳ دکمه اکشن (دانلود، آپلود، فایل نمونه) در بالای لیست انبارها
- استفاده از همان مودال آپلود اکسل مشترک

---

### ۷. فرانت‌اند — کامپوننت مشترک مودال آپلود

#### [NEW] [excel-import-modal](file:///e:/warehouse%20project/frontend/src/app/shared/components/excel-import-modal/)

یک کامپوننت مشترک (Shared Component) برای مودال آپلود اکسل که در هر ۳ بخش قابل استفاده مجدد باشد:

| فایل | توضیح |
|---|---|
| `excel-import-modal.ts` | منطق کامپوننت: Drag & Drop، انتخاب فایل، ارسال به سرور، نمایش نتیجه |
| `excel-import-modal.html` | قالب HTML مودال |
| `excel-import-modal.css` | استایل‌های مودال |

**ورودی‌های کامپوننت (Inputs):**
- `title: string` — عنوان مودال (مثلاً «آپلود کاربران»)
- `templateDownloadFn: () => void` — تابع دانلود فایل نمونه
- `importFn: (file: File) => Observable<ImportResult>` — تابع ارسال فایل

**خروجی‌های کامپوننت (Outputs):**
- `closed: EventEmitter<void>` — هنگام بسته شدن مودال
- `imported: EventEmitter<ImportResult>` — هنگام اتمام موفق آپلود

---

## طرح تأیید (Verification Plan)

### تست‌های خودکار (Automated Tests)
- تست endpoint های اکسل با `pytest` یا `manage.py test`:
  - صحت خروجی اکسل (ستون‌ها و داده‌ها)
  - اعتبارسنجی ورودی‌های نامعتبر (فایل خراب، ستون ناقص، داده تکراری)
  - بررسی سطح دسترسی (رد درخواست از کاربران بدون مجوز)

### تست‌های دستی (Manual Verification)
1. دانلود اکسل کاربران، انبارها و نقش‌ها و بررسی صحت ستون‌ها و داده‌ها
2. دانلود فایل Template و بررسی محتوای نمونه
3. آپلود یک فایل اکسل معتبر با ۵ سطر → بررسی ایجاد رکوردها
4. آپلود یک فایل با ردیف‌های خطادار → بررسی گزارش خطای سطری
5. آپلود فایل با فرمت نامعتبر (مثلاً `.csv`) → بررسی پیام خطا
6. تست سطح دسترسی: لاگین با کاربر بدون مجوز → بررسی رد درخواست

---

## خلاصه فایل‌ها

| عملیات | فایل | توضیح |
|---|---|---|
| 🆕 NEW | `accounts/excel_utils.py` | منطق تولید/خوانش اکسل کاربران |
| 🆕 NEW | `accounts/roles_excel_utils.py` | منطق تولید/خوانش اکسل نقش‌ها |
| 🆕 NEW | `warehouses/excel_utils.py` | منطق تولید/خوانش اکسل انبارها |
| 🆕 NEW | `shared/components/excel-import-modal/` | کامپوننت مشترک مودال آپلود |
| ✏️ MODIFY | `accounts/views.py` | اضافه کردن ۶ اکشن (Export/Import/Template × ۲) |
| ✏️ MODIFY | `warehouses/views.py` | اضافه کردن ۳ اکشن |
| ✏️ MODIFY | `accounts-http.service.ts` | ۶ متد جدید HTTP |
| ✏️ MODIFY | `warehouse-http.service.ts` | ۳ متد جدید HTTP |
| ✏️ MODIFY | `users.ts` + `users.html` | دکمه‌ها و مودال آپلود |
| ✏️ MODIFY | `projects.ts` + `projects.html` | دکمه‌ها و مودال آپلود |

</div>
