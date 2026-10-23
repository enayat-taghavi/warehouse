<div dir="rtl" align="right">

# فهرست وظایف اجرایی: طرح جامع ارتقای شرکت‌ها، هیئت‌مدیره پویا و معماری اسناد

- [x] **فاز ۱: اصلاح ساختاری و قطعی تقویم شمسی جلالی در فرانت‌اند**
  - [x] کپسوله‌سازی تگ `<input>` درون `<ng-persian-datepicker>` و بایندینگ دوطرفه `[(uiIsVisible)]` در [companies.html](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/companies.html)
  - [x] اعمال اصلاح مشابه در فرم آپلود آرشیو اسناد [company-documents-archive.html](file:///e:/warehouse%20project/frontend/src/app/components/finance/company-documents-archive/company-documents-archive.html)
  - [x] تصحیح Z-index و استایل‌های پاپ‌اور در فایل‌های CSS جهت جلوگیری از برش خوردن
  - [x] اعتبارسنجی عملکرد تقویم در تست‌های DOM

- [x] **فاز ۲: معماری بک‌اند و پایگاه داده (Data Models & Migrations)**
  - [x] تعریف مدل `CompanyBoardMember` با فیلدهای کامل هویتی، سمتی، حق امضا و مدارک پیوست در [personnel/models.py](file:///e:/warehouse%20project/backend/personnel/models.py)
  - [x] افزودن فیلدهای نسخه `version` و `is_superseded` به مدل `CompanyDocument`
  - [x] ایجاد و اعمال مایگریشن پیش‌رونده جدید جنگو (`makemigrations` و `migrate`)
  - [x] هماهنگی ساختار داده‌ای جدید بدون تغییر در مایگریشن‌های پیشین

- [x] **فاز ۳: وب‌سرویس‌ها، سریالایزرها و بهینه‌سازی کوئری‌ها**
  - [x] ایجاد `CompanyBoardMemberSerializer` و `CompanyBoardMemberViewSet` در [personnel/views.py](file:///e:/warehouse%20project/backend/personnel/views.py)
  - [x] ثبت روت‌های جدید در [personnel/urls.py](file:///e:/warehouse%20project/backend/personnel/urls.py)
  - [x] افزودن `prefetch_related('documents', 'bank_accounts', 'board_members')` به `CompanyViewSet.get_queryset` جهت حذف مشکل N+1
  - [x] پیاده‌سازی متد اعتبارسنجی چکسام ۱۱ رقمی شناسه ملی اشخاص حقوقی
  - [x] نوشتن تست‌های جامع جنگو برای پوشش ۱۰۰٪ وب‌سرویس هیئت‌مدیره و بهینه‌سازی کوئری‌ها (۱۴ تست کاملاً سبز)

- [x] **فاز ۴: توسعه رابط کاربری فرانت‌اند و استودیو (Frontend UI)**
  - [x] افزودن مدل TypeScript برای `CompanyBoardMember` در `company.model.ts` و متدهای API در `company-api.service.ts`
  - [x] بازطراحی تب ۳ استودیو شرکت‌ها جهت نمایش جدول پویا، دکمه افزودن، فرم ثبت/ویرایش عضو و الصاق مدارک
  - [x] پاک‌سازی فیلدهای پروژه‌ای (ردیف پیمان و شعبه بیمه) از تب ۴ استودیو و تنظیم توضیحات راهنما
  - [x] اعتبارسنجی شناسه ملی در فرم شرکت با الگوریتم چکسام

- [x] **فاز ۵: تست‌های یکپارچه و راستی‌آزمایی جامع (Testing & Verification)**
  - [x] اجرای تست‌های واحد و سریع DOM فرانت‌اند (Type 1 Vitest) برای تب پویای هیئت‌مدیره، تقویم و اعتبارسنجی‌ها (۵۶ تست سبز ۱۰۰٪)
  - [x] اجرای تمامی تست‌های بک‌اند جنگو (`manage.py test`) و تایید عدم وجود خطا (۱۴ تست سبز ۱۰۰٪)
  - [x] بررسی لاگ‌های سرور و ترمینال و ارائه گزارش نهایی به کاربر

- [x] **فاز ۶: ریشه‌یابی و حل بنیادین تقویم شمسی جلالی و تدوین پروتکل یادگیری (`/learn`)**
  - [x] ریشه‌یابی علت ناپدید شدن روزهای ماه و عنوان ماه/سال (نیاز ذاتی `ng-persian-datepicker` به `FormControl` به جای `[(ngModel)]`)
  - [x] اتصال فرم‌های واکنشی (`ReactiveFormsModule`) به همراه ۵ کنترل مجزا در `companies.ts` و `companies.html`
  - [x] اصلاح فرم آرشیو اسناد `company-documents-archive` و فیلتر گزارشات `filter-value`
  - [x] اصلاح کلاس‌های کانتینر و اعمال استایل قطعی پنهان‌سازی در `styles.css`
  - [x] اعتبارسنجی موفق با اجرای ۵۶ تست DOM
  - [x] تدوین آرتیفکت `learning_proposal.md` جهت ثبت قانون در `AGENTS.md`

- [x] **فاز ۷: حل مشکل بیرون‌زدگی چپ تقویم در مودال‌ها و ثبت دائمی در قوانین مخزن (`AGENTS.md`)**
  - [x] ریشه‌یابی برش ستون جمعه (`ج`) و فلش ناوبری ناشی از `right: 0` و سرریز در `overflow-y: auto` مودال
  - [x] پیاده‌سازی کلاس‌های `.to-datepicker` و `.datepicker-left` با `left: 0 !important; right: auto !important;` در `styles.css`، `companies.css` و `company-documents-archive.css`
  - [x] اتصال کلاس به اینپوت‌های سمت چپ مودال در `companies.html` و `company-documents-archive.html`
  - [x] راستی‌آزمایی با پاس شدن ۱۰۰٪ ۵۶ تست DOM و بیلد بدون خطای TypeScript
  - [x] ثبت رسمی و دائمی قاعده دوقلوی تقویم (فرم‌های واکنشی + تراز چپ در مودال‌ها) در [AGENTS.md](file:///E:/warehouse%20project/.agents/AGENTS.md)

</div>
