<div dir="rtl" align="right">

# 📊 گزارش جامع راستی‌آزمایی و اتمام پیاده‌سازی (Full Walkthrough)

## 📌 عنوان پروژه: اسکنر هوشمند چندردیفه، تولید اکسل نمونه داینامیک و به‌روزرسانی دسته‌ای کارتابل مالی

---

## 🎯 خلاصه‌ی دستاوردهای فنی پیاده‌سازی‌شده در فازهای ۱ تا ۵:

1. **اکشن بک‌اند `DocTaskViewSet.download_template` ([`views.py`](file:///e:/warehouse%20project/backend/inventory/views.py)):**
   - تولید فایل اکسل نمونه با فیلدهای دارای مجوز `editable` بر اساس تنظیمات انبار/سراسری + فیلدهای پویای فعال انبار.
   - ستون اول شناساگر «کد یکتا» (`fa_unic_code`).
   - درج ۲ سطر داده‌ی آزمایشی واقعی (تاریخ‌های شمسی، مبالغ، شماره‌های RTI).
   - پیاده‌سازی **سلول‌های کشویی (Data Validation)** با `openpyxl`:
     * کشوی بله/خیر (`stamp`, `signature`)
     * کشوی نوع فاکتور (`رسمی/مالیاتی`, `خریدهای داخلی`, `خریدهای خارجی`, `امانی`)
     * کشوی ارز (`ریال`, `دلار`, `یورو`, `سایر`)

2. **ماژول پارسر هوشمند چندحالته ([`customs-scanner-parser.ts`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs-scanner-parser.ts)):**
   - **پوشش ۴گانه جداکننده‌ها:**
     1. کنترلی صنعتی (ASCII): سطر `Chr(30)` | ستون `Chr(31)`
     2. مرئی استاندارد: سطر `;` | ستون `|`
     3. حالت ترکیبی ۱ و ۲ (Hybrid): سطر `Chr(30) & ";"` | ستون `Chr(31) & "|"`
     4. کپی مستقیم از اکسل (TSV): سطر `\n` | ستون `\t`
   - فیلتر خودکار پاک‌سازی کاراکترهای نامرئی (`ZWNJ`, `ZWSP`, `BOM`, `LRM/RLM`) و گیومه‌ها.
   - نگاشت هوشمند ستون‌ها به عناوین فارسی و انگلیسی دیتابیس.

3. **دکمه دانلود نمونه در مودال اکسل و مودال پیش‌نمایش ([`customs.html`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html)):**
   - دکمه شیک دانلود قالب نمونه درون مودال خروجی اکسل.
   - مودال پیش‌نمایش اسکن دسته‌ای با ۴ کارت آماری رنگی (آماده، از استخر اسناد ⚡، قفل/ارسال‌شده، یافت‌نشده).
   - چیپ‌های پیش‌نمایش مقادیر جدید و تفکیک فیلدهای مجاز از فقط‌خواندنی.

4. **اتصال جریان اسکنر و ذخیره دسته‌ای ([`customs.ts`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts)):**
   - انشعاب خودکار بین اسکن تک‌کالا و اسکن دسته‌ای.
   - ادعای مالکیت خودکار اقلام استخر (`claimTasks`) در زمان تایید کاربر.
   - ذخیره Local-First و آنلاین با رعایت کامل محدودیت‌های فیلدهای `editable`.

5. **فرم‌های تنظیمات جداکننده‌های اسکنر ([`settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html) و [`wh-settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html)):**
   - منوی کشویی انتخاب الگوهای پیش‌فرض (Presets) شامل ۴ حالت آماده + حالت سفارشی (Custom).

---

## 🧪 نتایج راستی‌آزمایی و آزمون‌های نهایی

```bash
# ۱. آزمون‌های خودکار بک‌اند
.\venv\Scripts\python.exe manage.py test inventory.tests_docs warehouses.tests --noinput
# نتیجه: ۲۰ تست با موفقیت پاس شد (Ran 20 tests in 42.7s - OK)

# ۲. کامپایل و بیلد پروداکشن فرانت‌اند
npm run build
# نتیجه: Application bundle generation complete. [48.4s] - Exit Code: 0
```

| حوزه تست | نوع آزمون | نتیجه |
| :--- | :--- | :---: |
| **بک‌اند (Django)** | ۲۰ سناریوی چرخه‌های مالی، استخر، لغو و تمپلیت | ✅ ۱۰۰٪ پاس شد |
| **تایپ‌چک (TypeScript)** | بررسی انواع داده و امضای متدها (`tsc --noEmit`) | ✅ ۰ خطا |
| **بیلد پروداکشن (Angular)** | بهینه‌سازی باندل و پچ سرویس‌ورکر (`ng build`) | ✅ موفق (Exit 0) |

</div>
