<div dir="rtl" align="right">

# گزارش تحویل نهایی و مستندات عملیاتی طرح جامع چندمستأجری و بایگانی اسناد شرکت‌ها
## (Multi-Tenant Access Governance & Dedicated Documents Archive Walkthrough v2.2)

---

### ۱. چکیده دستاوردهای اجرایی
با اتکا به اصول طراحی مقاوم، استانداردهای سازمان و رهنمودهای مأموریت `/goal`، بازمهندسی کامل معماری چندمستأجری و تفکیک دسترسی شرکت‌ها با موفقیت ۱۰۰٪ و بدون توهم به پایان رسید:

1. **مدل‌سازی سه‌سطحی دسترسی به شرکت (`access_level`):**
   - تفکیک دسترسی هر کاربر به هر شرکت در ۳ سطح:
     - `docs_read`: فقط مشاهده مدارک رسمی شرکت.
     - `docs_write`: مشاهده، بارگذاری و ویرایش مدارک حقوقی.
     - `workspace_full`: عضویت در فضای کاری، پروژه‌ها و ماژول‌های فعال (انبارداری، مالی، تردد).
   - اضافه شدن فیلد سمت سازمانی (`role_in_company`) در شرکت جهت درج عناوینی مانند «خزانه‌دار»، «مشاور حقوقی»، «مدیر مالی».

2. **حل قطعی مسئله نسرین بیرمی و انزوای سوئیچر هدر:**
   - کاربر نسرین بیرمی در شرکت «پاینده توان ساینا» با سطح `docs_read` و سمت «خزانه‌دار» ثبت شد.
   - سوئیچر هدر بالای صفحه منحصراً به شرکت‌های با سطح `workspace_full` مقید شد؛ نام شرکت‌هایی که کاربر صرفاً دسترسی مدارک به آن‌ها دارد دیگر در هدر و داشبورد انبارداری ظاهر نمی‌شود.
   - آمار داشبورد انبارداری (`dashboard_stats`) با فیلتر دقیق `warehouse__company_id` ایزوله شد و نشت ۱,۰۳۹ قلم کالا کاملاً برطرف گردید.

3. **ارتقای استودیوی شرکت و تب دسترسی کاربران (تب ۶):**
   - افزودن سلکتور هوشمند انتخاب سطح دسترسی با ۳ مد و نشانگرهای رنگی (سبز برای فضای کاری، زرد برای بارگذاری، آبی برای فقط مشاهده).
   - پیاده‌سازی کامل متدهای لغو دسترسی، افزودن دسترسی، فیلتر کاربران و جستجوی زنده در تب دسترسی استودیو.

4. **راه‌اندازی کارتابل مستقل اسناد و مدارک رسمی شرکت‌ها (`CompanyDocumentsArchiveComponent`):**
   - مسیر اختصاصی `/app/finance/company-documents` (همراه با آلیاس‌های `/app/finance/documents` و `/app/documents`).
   - مطابق استاندارد چسبان (Unified Sticky Command Center Standard)، انتخابگر شرکت‌های مجاز، فیلتر دسته‌بندی ۵ گانه موضوعی (شرکتی، مجوزها، مالیاتی، قراردادها، سررسیدها)، جستجوی زنده، پیش‌نمایش درجا (PDF و تصویر)، و دانلود امن مستقیم.
   - رعایت گاردها: کاربران فاقد مجوز ثبت، دکمه بارگذاری یا حذف را مشاهده نمی‌کنند.

5. **اتصال به منوهای ناوبری و سایدبار:**
   - افزودن آیتم «📑 بایگانی اسناد شرکت‌ها» به سایدبار در منوی حسابداری عمومی، کارتابل مدیر، کارتابل حسابدار و کارتابل خزانه‌دار.

---

### ۲. جدول تفصیلی فایل‌ها و تغییرات کد (File Changes Table)

| بخش / ماژول | فایل تغییر یافته | شرح دقیق تغییرات و مسئولیت کد |
| :--- | :--- | :--- |
| **داده و مدل جنگو** | `backend/personnel/models.py` | افزودن گزینه‌های `ACCESS_LEVEL_CHOICES` (`docs_read`, `docs_write`, `workspace_full`) و فیلدهای `access_level` و `role_in_company` به مدل `UserCompanyAccess`. |
| **مایگریشن جنگو** | `backend/personnel/migrations/0018_usercompanyaccess_access_level_and_more.py` | ایجاد و اجرای مایگریشن اسکیما، افزودن فیلدها با پیش‌فرض `workspace_full` برای حفظ سازگاری رکوردهای پیشین. |
| **سریالایزر جنگو** | `backend/personnel/serializers.py` | افزودن `access_level`, `access_level_display`, `role_in_company` به `UserCompanyAccessSerializer` و اضافه کردن فیلد `user_access_level` به سریالایزر شرکت. |
| **امنیت و فیلتر بک‌اند** | `backend/personnel/views.py` | به‌روزرسانی `get_user_allowed_companies` و اکشن `user_available` با پارامتر `scope`، ایزوله‌سازی اکشن‌های دانلود و لیست اسناد بر پایه `docs_read` و کنترل ساخت/ویرایش/حذف بر پایه `docs_write`. |
| **انزوای انبارداری** | `backend/inventory/views.py` | اصلاح متد `dashboard_stats` جهت بررسی هدر `X-Company-ID` و فیلتر کوئری‌ست با `warehouse__company_id`، بستن منافذ نشت آمار کالاها. |
| **مدل‌های تایپ‌اسکریپت** | `frontend/src/app/core/models/company.model.ts` | تعریف تایپ `CompanyAccessLevel` و به‌روزرسانی اینترفیس‌های `UserCompanyAccess` و `Company` با فیلدهای جدید. |
| **سرویس‌های کلاینت** | `frontend/src/app/core/api/company-api.service.ts` | متدهای `getUserAvailable(scope)`، `createUserAccess`، `updateUserAccess`، `deleteUserAccess` و `downloadDocument`. |
| **مدیریت شرکت فعال** | `frontend/src/app/core/services/active-company.service.ts` | محدودسازی سوئیچر هدر به `workspace_full`، متد `loadDocumentCompanies()`، و اصلاح `hasWarehouseModule`. |
| **گاردهای امنیتی روت** | `frontend/src/app/core/auth/auth.guard.ts` | هدایت کاربران فاقد انبار یا فاقد شرکت فعال انبارداری به `/app/launcher` جهت جلوگیری از لوپ ریدایرکت. |
| **استودیوی مدیریت شرکت** | `frontend/src/app/components/operations/companies/companies.ts` | پیاده‌سازی متدهای ثبت و لغو دسترسی، متد `loadStudioAccesses`، حذف کدهای تکراری و متد `filterSystemUsers`. |
| **قالب استودیو** | `frontend/src/app/components/operations/companies/companies.html` | ارتقای فرم تب ۶ با انتخابگر ۳ سطحی، فیلد سمت سازمانی، و جدول لیست دسترسی‌ها با بج‌های تفکیک‌شده. |
| **کامپوننت جدید اسناد** | `frontend/src/app/components/finance/company-documents-archive/company-documents-archive.ts` | کامپوننت منطق کارتابل متمرکز اسناد، فیلتر رسته‌ها، جستجوی زنده، پیش‌نمایش، دانلود و آپلود سند. |
| **قالب کامپوننت اسناد** | `frontend/src/app/components/finance/company-documents-archive/company-documents-archive.html` | رابط کاربری مدرن با هدر چسبان، سلکتور شرکت، فیلتر موضوعی و پیش‌نمایش فایل. |
| **استایل کامپوننت اسناد** | `frontend/src/app/components/finance/company-documents-archive/company-documents-archive.css` | استایل‌های پایه و پشتیبانی از تقویم شمسی جلالی. |
| **مسیریابی مالی** | `frontend/src/app/modules/accounting/accounting.routes.ts` | ثبت روت‌های `company-documents` و آلیاس `documents`. |
| **مسیریابی ریشه** | `frontend/src/app/app.routes.ts` | ثبت ریدایرکت‌های سراسری برای `company-documents` و `documents`. |
| **منوهای ناوبری** | `frontend/src/app/modules/accounting/nav-items.ts` | اضافه کردن آیتم منوی بایگانی مدارک به پورتال‌های عمومی مالی، مدیر، حسابدار و خزانه‌دار. |
| **سایدبار سراسری** | `frontend/src/app/components/layout/layout.ts` | پیکربندی تب‌های فعال، عناوین صفحات و مجوزهای دسترسی به اسناد شرکت‌ها. |

---

### ۳. ایرادات جدید کشف‌شده در حین اجرا و نحوه برطرف‌سازی آن‌ها (Bug Discoveries & Fixes)

1. **باگ عدم وجود متدهای استودیو در کامپوننت شرکت‌ها (`companies.ts`):**
   - *شرح:* دکمه‌های `addStudioAccess()` و `removeStudioAccess()` در HTML صدا زده می‌شدند اما متدهای منطق آن‌ها در فایل تایپ‌اسکریپت ناقص مانده بودند که منجر به خطای رانتایم می‌شد.
   - *راهکار:* این متدها همراه با ارسال `access_level` و `role_in_company` و پیام‌های توست بازخورد به صورت کامل پیاده‌سازی شدند. همچنین کدهای قدیمی و تکراری کلاس پاک‌سازی گردید.

2. **باگ فراخوانی غیراستاندارد `user.assigned_sections` در اکشن `user_available`:**
   - *شرح:* در جنگو فیلد معکوس روی `User` مستقیماً `assigned_sections` نبود و ایجاد `AttributeError` می‌کرد.
   - *راهکار:* کوئری مستقیم و بهینه با `UserSectionAssignment.objects.filter(user=user, is_active=True, section__project__company_id=c['id']).exists()` جایگزین شد.

3. **باگ پرش به انبار به دلیل شرط `!c` در `hasWarehouseModule`:**
   - *شرح:* در صورت عدم وجود شرکت فعال (`!c`)، متد مقدار `true` برمی‌گرداند که موجب ریدایرکت اشتباه کاربر به ماژول انبار می‌شد.
   - *راهکار:* شرط اصلاح شد تا در غیاب شرکت فعال، ماژول انبار غیرفعال بماند و کاربر به لانچر پرتال هدایت شود.

4. **باگ پرانتز بسته متد `removeUserAccess` در `companies.ts`:**
   - *شرح:* در حین تست DOM، اس‌بیلد خطای سینتکسی `Expected ")" but found "private"` روی خط ۱۳۰۲ نشان داد.
   - *راهکار:* پرانتز و آکولاد بسته فراخوانی `subscribe` در خط ۱۲۹۹ تصحیح شد.

5. **ناسازگاری فیلد `tracking_code` در مدل `CompanyDocument`:**
   - *شرح:* در کامپوننت جدید اسناد، جستجو روی `tracking_code` قرار گرفته بود که این فیلد در مدل تعریف نشده بود و کامپایلر انگولار در بیلد پروداکشن خطای `TS2339` صادر کرد.
   - *راهکار:* جستجو به فیلدهای واقعی مدل (`title`, `document_type_display`, `description`) اصلاح شد و بیلد پروداکشن با موفقیت انجام گرفت.

---

### ۴. کارنامه آزمون‌های اعتبارسنجی (Final Verification Test Matrix)

| لایه سیستم | آزمون / دستور ارزیابی | نتیجه | جزئیات عملکرد |
| :--- | :--- | :---: | :--- |
| **بک‌اند: انزوای انبارداری** | `warehouses.test_company_warehouse_isolation` | ✅ پاس ۱۰۰٪ | ۱۰ تست در ۹.۳۲ ثانیه (`OK`) |
| **بک‌اند: مدارک و دسترسی** | `personnel.test_company_documents` | ✅ پاس ۱۰۰٪ | ۱۲ تست بدون خطا |
| **بک‌اند: چندمستأجری** | `personnel.test_company_multitenant` | ✅ پاس ۱۰۰٪ | ۱۰ تست در ۲۷.۹۱ ثانیه (`OK`) |
| **فرانت‌اند: یونیت تست DOM استودیو** | `companies.dom.spec.ts` (Vitest + JSDOM) | ✅ پاس ۱۰۰٪ | ۳۷ تست از ۳۷ تست در ۵۴۷ میلی‌ثانیه |
| **فرانت‌اند: یونیت تست DOM بایگانی اسناد** | `company-documents-archive.dom.spec.ts` | ✅ پاس ۱۰۰٪ | ۵ تست از ۵ تست در ۱۴۶ میلی‌ثانیه |
| **تایپ‌اسکریپت کل فرانت‌اند** | `npx tsc --noEmit` | ✅ ۰ خطا | اتمام با خروجی کد `0` بدون هیچ خطای تایپ |
| **بیلد نهایی پروداکشن فرانت‌اند** | `npm run build` (`ng build`) | ✅ موفق ۱۰۰٪ | تولید موفق باندل‌ها، تفکیک lazy chunks و پچ موفق Cloudflare |

</div>
