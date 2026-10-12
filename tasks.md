<!-- 
راهنمای استفاده:
- هر تسک را می‌توانید به صورت چندخطی و با توضیحات کامل بنویسید.
- بین هر تسک از جداکننده سه مساوی یا بیشتر (===) در یک خط مجزا استفاده کنید.
- با دابل‌کلیک روی run_tasks.bat، تسک‌ها به صورت کاملاً ترتیبی و در نشست‌های مستقل اجرا خواهند شد.
-->

<!--
یادداشت ناظر (Claude) — صف نشست‌های ۰ تا ۱۵ طرح ارگونومی واکنش‌گرا (گام‌های ۱۰ تا ۱۳):
- قوانین مشترک همه نشست‌ها در بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» طرح است:
  Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md
- هر نشست یک دروازه شروع دارد: فقط وقتی برچسب DONE نشست قبل در «گزارش پیشرفت» هست و درخت کاری تمیز است کار می‌کند؛
  نشستی که قبلاً DONE شده خودش رد می‌شود. پس اگر اجراکننده وسط کار متوقف شد، اجرای دوباره run_tasks.bat امن است.
- پس از پایان نشست ۱۵، این پیام را در یک نشست تازه به Claude بفرستید:
  نقش ناظر: بازبینی نهایی نشست‌های ۰ تا ۱۵ (گام‌های ۱۰ تا ۱۳) طرح ارگونومی واکنش‌گرا؛ پایه: «پایه نشست ۰» در گزارش پیشرفت.
-->

نشست 0 از 15 — طرح ارگونومی واکنش‌گرا: اصلاح جعبه‌ابزار و کلیدهای تازه فرهنگ آیکون (پیش از گام ۱۰)

۱. دروازه شروع. پیش از هر تغییر این دو شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S0-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر — گام ۹» را بخوان.

۳. کار این نشست:
الف) warehouse-front/src/app/shared/components/command-center/command-center.component.ts:
  - در ROW_CONTAINER_CLASSES، در مقدار md بعد از md:flex-row کلاس md:flex-wrap، و در مقدار lg بعد از lg:flex-row کلاس lg:flex-wrap را بیفزا.
  - در قالب، div اسلات cc-tabs (class="flex items-center overflow-x-auto") کلاس‌های min-w-0 max-w-full بگیرد، و div اسلات cc-actions کلاس ms-auto.
  - توضیح فارسی کوتاه: «اگر تب‌ها و اکشن‌ها در یک سطر جا نشوند، اکشن‌ها به سطر دوم (سمت چپ) می‌روند.»
  - در command-center.component.spec.ts یک تست برای وجود md:flex-wrap روی ظرف و ms-auto روی اسلات اکشن بیفزا.
ب) fullLabelFrom:
  - در supervisor-attendance.html، supervisor-fleet.html، supervisor-personnel.html و supervisor-new-profiles.html (پوشه components/finance/supervisor/) روی app-tab-bar مقدار fullLabelFrom="lg" را fullLabelFrom="xl" کن.
  - به نوار وضعیت این چهار فایل در components/finance/employee/ هم fullLabelFrom="xl" بیفزا:
    - employee-invoices.html ([tabs]="invoiceStatusTabs")
    - employee-petty-cash.html ([tabs]="pettyCashStatusTabs")
    - employee-new-vehicle.html ([tabs]="statusFilterTabs")
    - employee-new-personnel.html ([tabs]="statusFilterTabs")
ج) رجیستری: به warehouse-front/src/app/shared/icons/icon-registry.ts آیکون 'droplet' را با این محتوا بیفزا:
'<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'
د) کار تازه «قطع همکاری»:
  - در shared/icons/semantic-icons.ts، به ACTION_ICONS کلید 'terminate': 'slash' را بیفزا.
  - در shared/components/action-button/action-catalog.ts ورودی 'terminate' را بیفزا: icon: ACTION_ICONS['terminate']، defaultLabel: 'قطع همکاری'، tone: 'rose'، sensitive: true.
  - توضیح «برای هر ۳۷ کلید» را ۳۸ کن. اگر specی تعداد کلیدها را می‌شمارد، به‌روزش کن.
ه) کلیدهای تازه modules/accounting/entity-icons.ts، هر کدام با توضیح فارسی یک‌خطی:
  - sections: 'map-pin' — بخش‌ها و کارگاه‌ها
  - jobGrades: 'star' — گروه شغلی، احکام و قرارداد پرسنل
  - insurance: 'shield-plus' — بیمه و تامین اجتماعی
  - tax: 'globe-alt' — مالیات و سامانه مالیاتی
  - licenses: 'badge' — مجوزها و پروانه‌ها
  - identity: 'info' — مشخصات فردی و شناسنامه‌ای
  - contractsAndLeases: 'home' — قراردادها و اجاره‌نامه‌های شرکت
  - repairShop: 'tool' — طرف‌حساب تعمیرگاه
  - fuelStation: 'droplet' — طرف‌حساب جایگاه سوخت
  - contractor: 'users-2' — طرف‌حساب پیمانکار
  - otherCounterparty: 'help-circle' — سایر طرف‌حساب‌ها
  spec فرهنگ آیکون (semantic-icons.spec.ts) باید سبز بماند.
و) در طرح:
  - در جدول بند ۲، ردیف «سربرگ فرماندهی»، جمله توضیح بند الف را بیفزا.
  - در جدول ۳-۱ ردیف terminate را بیفزا.
  - در جدول ۳-۳ کلیدهای بند ه را بیفزا.
ز) بیلد را برای هر سه پروفایل اجرا کن: پیش‌فرض، --configuration accounting-only و --configuration warehouse-only.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S0-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S0-FAILED] و علت. «پایه» را حتماً در عنوان گزارش بنویس؛ نشست ۱۵ از آن استفاده می‌کند.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 1 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۰، ردیف‌های ۴.۱ و ۴.۴

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S0-DONE] باید باشد.
- رشته [S1-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست (مسیرها در warehouse-front/src/app/components/finance/accountant/):

۴.۱ accountant-payroll:
- تب‌ها: پنج switchSubTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl"، شمارنده‌ها مثل پایه:
  - ready_to_calculate: «آماده محاسبه» / «آماده» / status-pending
  - calculated: «محاسبه‌شده» / «محاسبه» / status-draft
  - approved: «تایید نهایی» / «تایید» / status-approved
  - all: «کل پرونده‌ها» / «همه» / status-all
  - work_summary: «خلاصه کارکرد ماهانه» / «خلاصه» / PLATFORM_ENTITY_ICONS.reports
- دکمه‌های سربرگ:
  - toggleLockPeriod: [appAction]="isPeriodLocked ? 'unlock' : 'lock'" با عنوان متن فعلی و [busy]="isTogglingLock".
  - calculateBatch: کار بی‌کلید است (۹-۲ مورد ۱۰). [disabled] و [title] پویایش بماند.
  - openTaxModal: import-excel با label="درون‌ریزی مالیات".
  - exportExcel: export-excel.
  - refreshCurrentTab: refresh.
- سطرها:
  - openPayslipModal: view با label="فیش".
  - releasePaymentHold: unlock با label="آزادسازی".
  - approveSingle: approve با label="تایید نهایی".
- مودال‌ها:
  - دو setTaxModalMode یک app-tab-bar دوتبی شوند.
  - submitTaxImport: upload با busy.
  - printCurrentPayslip: print.
  - X سربرگ مودال‌ها display="icon"؛ دکمه‌های فوتر display="label".
- هیچ محاسبه §6 تغییر نکند.

۴.۴ accountant-invoices:
- تب‌ها: سه switchSubTab با mobile="short" و fullLabelFrom="lg":
  - pending_audit: «در انتظار صدور سند» / «در انتظار» / status-pending
  - booked: «اسناد ثبت‌شده» / «ثبت‌شده» / status-approved
  - all: «کل فاکتورها» / «همه» / status-all
- exportExcel، importExcel و fetchInvoices ← export-excel، import-excel و refresh.
- bookDocument: approve با label="صدور سند" و display="label".
- rejectDocument: اول API را بخوان. عودت برای اصلاح ← return، رد قطعی ← reject؛ label="عودت".

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S1-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S1-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 2 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۰، ردیف ۴.۳ (accountant-personnel)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S1-DONE] باید باشد.
- رشته [S2-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/finance/accountant/accountant-personnel/

- تب‌ها: چهار switchSubTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl". شمارنده و tone مثل پایه. indicator با pulse فقط روی تبی که در پایه animate-pulse داشت.
  - new: «احکام و مدارک مالی» / «احکام» / ACCOUNTING_ENTITY_ICONS.newPersonnel
  - payroll: «حقوق و دستمزد ماهانه» / «حقوق» / ACCOUNTING_ENTITY_ICONS.payroll
  - changes: «درخواست‌های تغییرات» / «تغییرات» / action-edit
  - all: «همه پرسنل» / «همه» / status-all
- تب‌های مودال: چهار setPersonnelTab به app-tab-bar با mobile="icon":
  - contract: «مزد و قرارداد» / «مزد» / ACCOUNTING_ENTITY_ICONS.payroll
  - insurance: «بیمه و شغل» / «بیمه» / ACCOUNTING_ENTITY_ICONS.insurance
  - identity: «مشخصات فردی» / «فردی» / ACCOUNTING_ENTITY_ICONS.identity
  - contact: «حساب بانکی و شبا» / «بانکی» / ACCOUNTING_ENTITY_ICONS.bankAccounts
- دکمه‌ها:
  - fetchData: refresh
  - downloadMissingPrimaryShebaReport: download عنوان‌دار با متن فعلی
  - openBatchApprovalModal: approve با label="تایید گروهی"
  - selectedPersonnelIds.clear: close با label="لغو انتخاب"
  - openEditPersonnelModal: edit
  - openApprovalModal: approve با متن کوتاه‌شده فعلی، مثلاً «ارسال به مدیر» یا «تایید مالی»
  - openRejectModal: آرگومان آخر را بخوان؛ 'revision' ← return با «عودت»، 'reject' ← reject با «رد»
  - openDiffModal: view با label="مقایسه"
  - recalculatePersonnelRates: کار بی‌کلید
  - savePersonnelFinancialChanges: save با busy
  - confirmApproval و confirmBatchApproval: approve
  - submitRejectModal: [appAction] پویای return/reject، مثل supervisor-personnel.html
- copyField (📋 و ✓)، convertAccountToShebaNow (⚡) و ساختار شبا دست نخورند. در گزارش خروجی این فرمان را بیاور:
  git diff <پایه> -U0 | Select-String '^[+-].*(sheba|Sheba|IRANIAN_BANKS)'

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S2-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S2-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 3 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۰، ردیف ۴.۲ (accountant-fleet)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S2-DONE] باید باشد.
- رشته [S3-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/finance/accountant/accountant-fleet/

- ستون «وضعیت فعلی» ردیف ۴.۲ از «محاسبه کرایه» و «تسویه صورتحساب» نام می‌برد، ولی این دو در کد نیستند؛ نساز.
- تب‌ها: چهار switchSubTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl". شمارنده و tone مثل پایه. indicator با pulse فقط روی تبی که در پایه animate-pulse داشت.
  - new: «خودروها و نرخ کرایه» / «خودروها» / ACCOUNTING_ENTITY_ICONS.fleet
  - settlement: «تسویه‌حساب و کارکرد» / «تسویه» / ACCOUNTING_ENTITY_ICONS.payroll
  - changes: «درخواست‌های تغییرات» / «تغییرات» / action-edit
  - all: «همه ناوگان» / «همه» / status-all
- دکمه‌ها:
  - exportExcel: export-excel
  - fetchFleetData: refresh
  - openBatchApprovalModal: approve با label="تایید گروهی"
  - selectedVehicleIds.clear: close با label="لغو انتخاب"
  - openEditVehicleModal: edit
  - openApprovalModal: approve با label="تایید مالی"
  - openRejectModal: 'revision' ← return با «عودت»، 'reject' ← reject با «رد»
  - exportFleetBankExcel: download با label="اکسل بانکی"
  - loadSettlement («تلاش دوباره»): refresh با display="label" و label="تلاش دوباره"
  - openDiffModal: view با label="مقایسه"
  - saveVehicleFinancialChanges: save با busy
  - confirmApproval و confirmBatchApproval: approve
  - submitRejectModal: [appAction] پویای return/reject
- copyToClipboard، onBankSelect، setPrimaryBankAccount، convertAccountToShebaNow و ساختار شبا و بانک دست نخورند. در گزارش خروجی این فرمان را بیاور:
  git diff <پایه> -U0 | Select-String '^[+-].*(sheba|Sheba|IRANIAN_BANKS)'

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S3-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S3-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 4 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۰، ردیف‌های ۴.۵ و ۴.۶

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S3-DONE] باید باشد.
- رشته [S4-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست (مسیرها در components/finance/accountant/):

۴.۵ accountant-petty-cash:
- تب‌ها: سه switchSubTab با mobile="short" و fullLabelFrom="lg":
  - pending_review: «نیازمند ممیزی» / «ممیزی» / status-pending
  - settled: «شارژ و تسویه شده» / «تسویه» / status-approved
  - all: «کل دفاتر تنخواه» / «همه» / status-all
- exportExcel، importExcel و fetchPettyCash ← export-excel، import-excel و refresh.
- approveReplenishment: approve با label="تایید".
- rejectReplenishment: اول API را بخوان. return یا reject؛ label="عودت".

۴.۶ accountant-diskettes:
- تب‌ها: سه switchSubTab با mobile="short" و fullLabelFrom="lg":
  - social_security: «بیمه تامین اجتماعی» / «بیمه» / ACCOUNTING_ENTITY_ICONS.insurance
  - tax_portal: «مالیات حقوق» / «مالیات» / ACCOUNTING_ENTITY_ICONS.tax
  - bank_payroll: «واریز بانکی» / «بانک» / ACCOUNTING_ENTITY_ICONS.bankAccounts
- exportExcel: export-excel.
- importExcel: عنوانش «راهنمای ساختار دیسکت» است. متد را بخوان؛ اگر فقط راهنما یا قالب نشان می‌دهد ← view با label="راهنما"، وگرنه import-excel.
- loadPeriod: متد را بخوان؛ اگر داده را دوباره می‌خواند ← refresh.
- generateSocialSecurityDiskette، generateTaxDiskette، generateBankDiskette، generateReleasedBankDiskette و generateFleetBankExcel: download با display="label" و متن کوتاه‌شده فعلی.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S4-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S4-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 5 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۰، ردیف ۴.۷ (counterparties)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S4-DONE] باید باشد.
- رشته [S5-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/finance/counterparties/

- فیلتر نوع: شش onTypeFilterChange به app-tab-bar با mobile="icon" و fullLabelFrom="xl". شمارنده‌ها (totalCount و …) مثل پایه:
  - all: «همه» / status-all
  - driver: «راننده» / ACCOUNTING_ENTITY_ICONS.fleet
  - repair_shop: «تعمیرگاه» / ACCOUNTING_ENTITY_ICONS.repairShop
  - fuel_station: «جایگاه سوخت» / «سوخت» / ACCOUNTING_ENTITY_ICONS.fuelStation
  - contractor: «پیمانکار» / ACCOUNTING_ENTITY_ICONS.contractor
  - other: «سایر» / ACCOUNTING_ENTITY_ICONS.otherCounterparty
- حالت نمایش: دو onViewModeChange به app-tab-bar دوتبی بدون آیکون («جدول» و «کارت»، mobile="short").
- دکمه‌ها:
  - exportExcel: export-excel
  - openImportModal: import-excel
  - refreshCounterparties: refresh
  - saveCounterparty: save با type="submit"، class="w-full sm:w-auto" و busy اگر هست. عنوان پویای فعلی را با [label] نگه دار.
  - cancelEdit: close با label="انصراف"
  - editCounterparty: edit
  - deleteCounterparty: delete
  - executeConfirmDialog: کار همان دیالوگ را از کد بخوان؛ اگر حذف است ← delete
  - closeConfirmDialog: close
- toggleCounterpartyStatus (چیپ فعال و غیرفعال) کار بی‌کلید است.
- copyShebaToClipboard و copyAccountNumberToClipboard (📋 و ✓)، toggleBankDropdown و selectBank و ساختار شبا طبق AGENTS §7 دست نخورند. در گزارش خروجی این فرمان را بیاور:
  git diff <پایه> -U0 | Select-String '^[+-].*(sheba|Sheba|IRANIAN_BANKS)'

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S5-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S5-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 6 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۰، ردیف ۴.۲۲ (accountant-new-profiles) و پایان گام ۱۰

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S5-DONE] باید باشد.
- رشته [S6-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/finance/accountant/accountant-new-profiles/
الگو: components/finance/supervisor/supervisor-new-profiles/ (html و ts)، پس از بازبینی گام ۹.

- تب‌ها: چهار switchSubTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl". شمارنده و tone مثل پایه. indicator فقط جایی که پایه animate-pulse داشت.
  - personnel: «پرونده‌های پرسنل» / «پرسنل» / ACCOUNTING_ENTITY_ICONS.newPersonnel
  - vehicles: «پرونده‌های ناوگان» / «ناوگان» / ACCOUNTING_ENTITY_ICONS.fleet
  - change_requests: «درخواست‌های تغییرات» / «تغییرات» / action-edit
  - all: «همه موارد» / «همه» / status-all
- دو changeRequestSubTab: app-tab-bar دوتبی (ACCOUNTING_ENTITY_ICONS.personnel و ACCOUNTING_ENTITY_ICONS.fleet).
- تب‌های مودال: چهار setPersonnelTab به app-tab-bar با mobile="icon":
  - contract: «مزد و مزایای قانونی» / «مزد» / ACCOUNTING_ENTITY_ICONS.payroll
  - insurance: «بیمه و مالیات» / «بیمه» / ACCOUNTING_ENTITY_ICONS.insurance
  - contact: «شماره حساب و شبا» / «بانکی» / ACCOUNTING_ENTITY_ICONS.bankAccounts
  - identity: «مشخصات فردی» / «فردی» / ACCOUNTING_ENTITY_ICONS.identity
- دکمه‌ها:
  - fetchData: refresh
  - approvePersonnelFinance، approveVehicleFinance و approveChangeRequestFinance: approve با label="تایید مالی"
  - openRejectModal: آرگومان آخر را بخوان؛ 'revision' ← return با «عودت»، 'reject' ← reject با «رد»
  - openEditPersonnelModal: edit
  - openDiffModal: view با label="مقایسه"
  - savePersonnel: save با busy و label="ذخیره تغییرات"
  - submitRejectModal: [appAction] پویای return/reject
  - X سربرگ مودال‌ها display="icon"؛ دکمه‌های فوتر display="label"
- دکمه ⚡ تولید شبا (convertAccountToShebaNow) و ساختار شبا دست نخورند. در گزارش خروجی این فرمان را بیاور:
  git diff <پایه> -U0 | Select-String '^[+-].*(sheba|Sheba|IRANIAN_BANKS)'
- در Documents/Responsive_Clickable_Ergonomics/task_responsive_clickable_ergonomics.md کل گام ۱۰ را تیک بزن.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S6-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S6-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 7 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۱، ردیف‌های ۴.۸ تا ۴.۱۲ (خزانه)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S6-DONE] باید باشد.
- رشته [S7-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست (مسیرها در components/finance/treasurer/). «تسویه نقدی و چکی» و «الصاق رسید» ردیف ۴.۹ در کد نیستند؛ نساز.

۴.۸ treasurer-disbursements:
- تب‌ها (mobile="short"، fullLabelFrom="lg"):
  - pending_queue: «صف پرداخت‌های مصوب» / «صف» / status-pending
  - disbursed_archive: «آرشیو واریزی‌ها» / «آرشیو» / status-archived
- generateBatchPayaFile: download با label="فایل پایا".
- downloadPeriodDiskette: download با label="دیسکت دوره".
- exportExcel و refreshData ← export-excel و refresh.
- openPeriodBatchModal: confirm با label="پرداخت دوره".
- openFleetBatchModal: confirm با label="تسویه ناوگان". اگر شمار سفر در جمع عرض ردیف جا نشد، آن را کنار دکمه به‌صورت متن بیاور.
- openPayModal: confirm با label="ثبت واریز".
- confirmDisbursement و submitBatchDisbursement: confirm با busy.
- closePayModal و closeBatchModal: close.
- clearSearch (✕ جستجو، AGENTS §7) دست نخورد.

۴.۹ treasurer-invoices:
- تب‌ها (mobile="short"، fullLabelFrom="lg"):
  - payable_invoices: «فاکتورهای آماده پرداخت» / «فاکتورها» / ACCOUNTING_ENTITY_ICONS.invoices
  - petty_cash_refills: «شارژ دفاتر تنخواه» / «تنخواه» / ACCOUNTING_ENTITY_ICONS.pettyCash
- exportExcel و refreshData ← export-excel و refresh.
- payInvoice: confirm با label="پرداخت و ثبت فیش".
- refillPettyCash: confirm با label="واریز شارژ".

۴.۱۰ treasurer-bank-accounts:
- تب‌ها:
  - bank_accounts: «حساب‌های بانکی سازمان» / «بانک» / ACCOUNTING_ENTITY_ICONS.bankAccounts
  - project_cashboxes: «صندوق‌های نقدی پروژه‌ها» / «صندوق» / ACCOUNTING_ENTITY_ICONS.pettyCash
- exportExcel و refreshData ← export-excel و refresh.
- openTransferModal: send با label="انتقال وجه".
- executeTransfer: send با label="ثبت انتقال" و busy.
- closeTransferModal: close.

۴.۱۱ treasurer-cheques:
- تب‌ها:
  - issued_cheques: «چک‌های صادره و سررسیدها» / «صادره» / ACCOUNTING_ENTITY_ICONS.cheques
  - cleared_archive: «آرشیو پاس‌شده و وصولی» / «آرشیو» / status-archived
- exportExcel و refreshData ← export-excel و refresh.
- markCleared: approve با label="اعلام پاس‌شدن".
- markBounced: reject با label="برگشت".

۴.۱۲ treasurer-reconciliation:
- تب‌ها:
  - bank_reconciliation: «مغایرت‌گیری صورت‌حساب» / «مغایرت» / ACCOUNTING_ENTITY_ICONS.reconciliation
  - cash_flow_forecast: «تقویم جریان نقدینگی» / «نقدینگی» / PLATFORM_ENTITY_ICONS.reports
- autoMatch («تطبیق هوشمند اقلام باز»): کار بی‌کلید؛ ⚡ آن برداشته شود.
- exportExcel و refreshData ← export-excel و refresh.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S7-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S7-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 8 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۱، ردیف ۴.۱۸ (projects-and-sections)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S7-DONE] باید باشد.
- رشته [S8-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/organization/projects-and-sections/

- تب‌ها: سه switchSubTab با شمارنده (mobile="short"، fullLabelFrom="lg"):
  - projects: «پروژه‌های مالی» / «پروژه‌ها» / ACCOUNTING_ENTITY_ICONS.projectsAndSections
  - sections: «بخش‌ها و دپارتمان‌ها» / «بخش‌ها» / ACCOUNTING_ENTITY_ICONS.sections
  - assignments: «انتساب کاربران و نقش‌ها» / «انتساب‌ها» / PLATFORM_ENTITY_ICONS.users
- حالت نمایش انتساب‌ها: دو onAssignmentViewModeChange به app-tab-bar دوتبی بدون آیکون («ماتریس» و «جدول»، mobile="short").
- دکمه‌ها:
  - exportExcel: export-excel
  - openImportModal: import-excel
  - loadAllData: refresh
  - editProject، editSection و openEditAssignmentModal: edit
  - deleteProject، deleteSection و deleteAssignment: delete
  - cancelEditProject و cancelEditSection: close با «انصراف»
  - saveProject، saveSection، submitQuickAssign و submitEditAssignment: save، با busy اگر هست
  - expandAllSections و collapseAllSections: expand و collapse، عنوان‌دار
  - toggleSectionCollapse: [appAction] پویای expand/collapse با display="icon"
  - openCloneModal: copy با label="کپی چارت"
  - executeCloneAssignments: copy با label="کپی ساختار" و busy
  - openQuickAssignModal: create با متن کوتاه‌شده فعلی
  - closeQuickAssignModal، closeCloneModal، closeEditAssignmentModal و closeConfirmDialog: close
  - executeConfirmDialog: کار دیالوگ را از کد بخوان؛ حذف ← delete
- کارهای بی‌کلید: toggleAssignmentStatus (چیپ فعال و غیرفعال)، selectAllAvailableUsers و deselectAllUsers.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S8-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S8-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 9 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۱، ردیف‌های ۴.۱۹ و ۴.۲۱

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S8-DONE] باید باشد.
- رشته [S9-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست:

۴.۱۹ components/finance/company-documents-archive/
- دسته‌ها: شش setCategory به app-tab-bar با mobile="icon" و fullLabelFrom="xl"، شمارنده‌ها مثل پایه:
  - ALL: «همه اسناد» / «همه» / status-all
  - CORPORATE: «اساسنامه و روزنامه» / «اساسنامه» / PLATFORM_ENTITY_ICONS.company
  - LICENSES: «مجوزها و پروانه‌ها» / «مجوزها» / ACCOUNTING_ENTITY_ICONS.licenses
  - FISCAL: «مالیات و بیمه» / «مالیات» / ACCOUNTING_ENTITY_ICONS.tax
  - CONTRACTS: «قراردادها و اجاره‌نامه» / «قراردادها» / ACCOUNTING_ENTITY_ICONS.contractsAndLeases
  - EXPIRING: «نیازمند تمدید» / «تمدید» / status-warning، با tone="rose"
- دکمه‌ها:
  - openUploadModal: upload با label="بارگذاری مدرک"
  - openPreview: view با label="پیش‌نمایش"
  - downloadDocument: download
  - deleteDocument: delete
  - submitUpload: upload با busy
  - closeUploadModal و closePreview: close
- selectCompany، clearSearch (✕ جستجو) و کنترل‌های تاریخ (ng-persian-datepicker، AGENTS §3) دست نخورند؛ فقط tap-target اگر لازم است.

۴.۲۱ components/personnel/base-settings/
- تب‌ها: شش setTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl"، بی شماره‌گذاری «۱.»:
  - grades: «جدول گروه‌های شغلی» / «گروه‌ها» / ACCOUNTING_ENTITY_ICONS.jobGrades
  - labor: «مزایای قانون کار» / «مزایا» / ACCOUNTING_ENTITY_ICONS.payroll
  - attendance_window: «بازه ویرایش تقویم» / «تقویم» / ACCOUNTING_ENTITY_ICONS.attendance
  - dsk: «اطلاعات کارگاه بیمه» / «بیمه» / ACCOUNTING_ENTITY_ICONS.insurance
  - tax: «سازمان مالیاتی» / «مالیات» / ACCOUNTING_ENTITY_ICONS.tax
  - bank: «تنظیمات بانک ملی» / «بانک» / ACCOUNTING_ENTITY_ICONS.bankAccounts
- دکمه‌ها:
  - openCreateYearModal: create با label="سال جدید"
  - openCreateVersionModal: create با label="اصلاحیه"
  - cloneForSelectedProject: copy با label="نسخه اختصاصی"
  - revertToGlobal: restore با label="بازگشت به سراسری". حساس است و منطق تاییدش دست نخورد.
  - saveYearlySettings: save با busy
  - exportJobGradesCsv: export-excel
  - importJobGradesCsv: import-excel
  - submitCreateVersion و submitCreateYear: save با busy
  - closeCreateVersionModal و closeCreateYearModal: close
- چهار setAttendanceWindowPreset کار بی‌کلید است (⚡ برداشته شود).
- هیچ عدد، ضریب یا فرمول §6 تغییر نکند.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S9-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S9-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 10 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۱، ردیف ۴.۲۰ (personnel-profiles) و پایان گام ۱۱

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S9-DONE] باید باشد.
- رشته [S10-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/personnel/personnel-profiles/

- تب‌ها: سه setTab با mobile="short" و fullLabelFrom="lg". شمار درون متن «({…})» به فیلد count برود:
  - personnel: «پرونده‌های پرسنل» / «پرسنل» / ACCOUNTING_ENTITY_ICONS.personnel
  - vehicles: «پرونده‌های ناوگان و ماشین‌آلات» / «ناوگان» / ACCOUNTING_ENTITY_ICONS.fleet
  - change_requests: «تاریخچه درخواست‌های تغییر» / «تغییرات» / action-edit
- دو setChangeRequestSubTab: app-tab-bar دوتبی (ACCOUNTING_ENTITY_ICONS.personnel و ACCOUNTING_ENTITY_ICONS.fleet).
- تب‌های مودال: پنج setPersonnelTab به app-tab-bar با mobile="icon"، بی شماره‌گذاری:
  - identity: «اطلاعات شناسنامه‌ای» / «هویتی» / ACCOUNTING_ENTITY_ICONS.identity
  - contract: «قرارداد و گروه شغلی» / «قرارداد» / ACCOUNTING_ENTITY_ICONS.jobGrades
  - insurance: «بیمه و مالیات» / «بیمه» / ACCOUNTING_ENTITY_ICONS.insurance
  - allowances: «مزایا و فوق‌العاده‌ها» / «مزایا» / ACCOUNTING_ENTITY_ICONS.payroll
  - contact: «بانکی و تماس» / «بانکی» / ACCOUNTING_ENTITY_ICONS.bankAccounts
- دکمه‌ها:
  - importExcel: import-excel. input مخفی excelFileInput بماند.
  - openAddPersonnelModal: create با label="کارمند جدید"
  - openAddVehicleModal: create با label="خودرو جدید"
  - loadProfiles: refresh
  - approvePersonnelFinance: approve با label="تایید مالی"
  - approvePersonnelManager: approve با label="تصویب نهایی"
  - openProfileRejectModal: آرگومان آخر را بخوان؛ revision ← return، reject ← reject
  - togglePersonnelActive و toggleVehicleActive («قطع همکاری»): terminate
  - submitEndCollaboration: terminate با busy اگر هست
  - deletePersonnel و deleteVehicle: delete
  - openEditPersonnelModal و openEditVehicleModal: edit
  - openDiffModal: view با label="مقایسه"
  - savePersonnel: save با busy
  - submitProfileRejectModal: [appAction] پویای return/reject
  - closePersonnelModal، closeDiffModal، closeProfileRejectModal و closeEndCollaborationModal: close
- onFilterChange (فیلترها) و ساختار شبا دست نخورند. در گزارش خروجی این فرمان را بیاور:
  git diff <پایه> -U0 | Select-String '^[+-].*(sheba|Sheba|IRANIAN_BANKS)'
- در Documents/Responsive_Clickable_Ergonomics/task_responsive_clickable_ergonomics.md کل گام ۱۱ را تیک بزن.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S10-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S10-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 11 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۲، ردیف‌های ۴.۱۳ تا ۴.۱۶

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S10-DONE] باید باشد.
- رشته [S11-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست (مسیرها در components/finance/manager/):

۴.۱۳ manager-dashboard:
- تب‌ها (mobile="short"، fullLabelFrom="lg"):
  - kpi_overview: «شاخص‌های کلان» / «شاخص‌ها» / PLATFORM_ENTITY_ICONS.reports
  - section_variance: «انحراف بودجه بخش‌ها» / «انحراف» / ACCOUNTING_ENTITY_ICONS.budget
  - urgent_alerts: «هشدارهای نیازمند اقدام» / «هشدارها» / status-alert، با شمارنده
- دکمه‌ها:
  - navigateToApprovals: forward با display="label" و [label] «کارتابل تاییدات» همراه شمار فعلی
  - navigateToBudget و پیوندهای alert.linkTab: forward با متن کوتاه‌شده فعلی
  - exportExecutiveSummary: export-excel
  - refreshData: refresh

۴.۱۴ manager-budget:
- تب‌ها:
  - budget_matrix: «ماتریس تخصیص بودجه» / «ماتریس» / ACCOUNTING_ENTITY_ICONS.budget
  - over_budget_alerts: «انحراف و مازاد هزینه» / «انحراف» / status-warning
- دکمه‌ها:
  - exportExcel و refreshData: export-excel و refresh
  - openEditBudgetModal: edit
  - saveNewBudget: save با label="ذخیره سقف"
  - closeEditModal: close

۴.۱۵ manager-contracts:
- تب‌ها:
  - personnel_decrees: «احکام حقوقی پرسنل» / «احکام» / ACCOUNTING_ENTITY_ICONS.personnel
  - fleet_contracts: «قراردادهای ناوگان و ماشین‌آلات» / «ناوگان» / ACCOUNTING_ENTITY_ICONS.fleet
- دکمه‌ها:
  - exportExcel و refreshData: export-excel و refresh
  - approvePersonnelDecree: approve با label="تایید و ابلاغ"
  - approveFleetContract: approve با label="تصویب قرارداد"
  - rejectPersonnelDecree و rejectFleetContract: اول API را بخوان؛ reject یا return

۴.۱۶ manager-reports:
- تب‌ها:
  - labor_costs: «بهای تمام‌شده نیروی انسانی» / «پرسنل» / ACCOUNTING_ENTITY_ICONS.personnel
  - fleet_efficiency: «بهره‌وری و مصارف ناوگان» / «ناوگان» / ACCOUNTING_ENTITY_ICONS.fleet
- دکمه‌ها:
  - printReport: print
  - exportExcel و refreshData: export-excel و refresh

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S11-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S11-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 12 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۲، ردیف ۴.۱۷ (manager-approvals)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S11-DONE] باید باشد.
- رشته [S12-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/personnel/manager-approvals/

- تب اصلی: شش setTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl". شماره‌گذاری «۱.» برداشته شود؛ شمارنده‌ها مثل پایه:
  - new_personnel: «پرسنل جدید» / «پرسنل» / ACCOUNTING_ENTITY_ICONS.newPersonnel
  - new_fleet: «ناوگان جدید» / «ناوگان» / ACCOUNTING_ENTITY_ICONS.fleet
  - change_requests: «کارتابل ویرایش‌ها» / «ویرایش‌ها» / action-edit
  - work_periods: «دوره‌های کارکرد ماهانه» / «دوره‌ها» / ACCOUNTING_ENTITY_ICONS.attendance
  - invoices: «فاکتورهای هزینه» / «فاکتور» / ACCOUNTING_ENTITY_ICONS.invoices
  - petty_cash: «اسناد تنخواه‌گردان» / «تنخواه» / ACCOUNTING_ENTITY_ICONS.pettyCash
- فیلتر وضعیت: هر یک از دو گروه چهارتایی setStatusFilter به app-tab-bar با mobile="icon" و fullLabelFrom="xl":
  - pending_manager: «در انتظار تصویب مدیر» / «در انتظار» / status-pending
  - revision_required: «نیازمند بازنگری» / «بازنگری» / status-revision
  - approved: «مصوب نهایی و فعال» / «مصوب» / status-approved
  - ALL: «همه» / status-all
- دو setCRSubTab: پرسنل و ناوگان با آیکون موجودیت.
- چهار setCRStatusFilter: pending_manager / approved / rejected / ALL با status-pending / status-approved / status-rejected / status-all.
- دکمه‌ها:
  - refreshCurrentTabData، loadInvoices و loadPettyCash: refresh
  - openApprovalModal و approveChangeRequestManager: approve با label="تصویب نهایی"؛ در کارت موبایل size="lg" و display="label"
  - openProfileRejectModal: آرگومان آخر را بخوان؛ revision ← return با «بازنگری»، reject ← reject با «رد». دکمه‌های فقط ❌ هم عنوان «رد» بگیرند.
  - openEditPersonnelModal: edit
  - openDiffModal: view با label="مقایسه"
  - submitPeriodForFinance: send با label="ارسال به مالی"
  - reopenPeriod: unlock با label="بازگشایی دوره"
  - approveInvoiceManager: approve با label="مجوز پرداخت"
  - approvePettyCashManager: approve با label="تایید پرداخت"
  - rejectInvoiceManager و rejectPettyCashManager: اول API را بخوان؛ return یا reject
  - confirmProfileRejectOrRevision: [appAction] پویای return/reject
  - confirmApprovalWithNote: approve با busy و label="تصویب نهایی"
  - closeApprovalModal و هر جا isDiffModalOpen = false یا isRejectModalOpen = false: close
- onWarehouseChange (select) دست نخورد.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S12-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S12-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 13 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۲، ردیف ۴.۲۳ (manager-fleet)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S12-DONE] باید باشد.
- رشته [S13-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/finance/manager/manager-fleet/

- تب‌ها: چهار switchSubTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl". شمارنده و tone مثل پایه؛ indicator فقط جایی که پایه animate-pulse داشت.
  - new: «ناوگان در انتظار تایید» / «جدید» / ACCOUNTING_ENTITY_ICONS.fleet
  - settlement: «تسویه‌حساب و کارکرد» / «تسویه» / ACCOUNTING_ENTITY_ICONS.payroll
  - changes: «درخواست‌های تغییرات» / «تغییرات» / action-edit
  - all: «همه ناوگان فعال» / «همه» / status-all
- دکمه‌ها:
  - fetchFleetData: refresh (در حالت خطا با display="label")
  - openApproveModal: approve، با متن کوتاه‌شده فعلی («تصویب نهایی» و «تصویب تغییرات»)
  - openRejectModal: 'revision' ← return با «اصلاح»، 'reject' ← reject با «رد»
  - openDiffModal: view با label="مقایسه"
  - openEndCollaborationModal و submitEndCollaboration: terminate، با busy اگر هست
  - openDeleteModal و confirmDeleteVehicle: delete
  - submitApproval: approve با busy
  - submitReject: [appAction]="rejectActionType === 'reject_final' ? 'reject' : 'return'". مقدارهای واقعی rejectActionType را از ts بخوان.
  - closeApproveModal، closeRejectModal، closeDiffModal، closeEndCollaborationModal و closeDeleteModal: close
- منطق تایید حذف و قطع همکاری (استعلام اثر حذف و deleteImpactHistory) دست نخورد.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S13-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S13-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 14 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۲، ردیف ۴.۲۴ (manager-personnel) و پایان گام ۱۲

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S13-DONE] باید باشد.
- رشته [S14-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بندهای ۱ تا ۳ طرح و ردیف‌های همین نشست در بند ۴ را بخوان. از «گزارش پیشرفت» فقط آخرین «بازبینی ناظر» و گزارش نشست قبل را بخوان.

۳. کار این نشست: components/finance/manager/manager-personnel/

- تب‌ها: چهار switchSubTab به app-tab-bar با mobile="icon" و fullLabelFrom="xl". ایموجی‌ها برداشته شود؛ شمارنده و tone مثل پایه؛ indicator فقط جایی که پایه animate-pulse داشت.
  - new: «تصویب پرونده‌های جدید» / «جدید» / ACCOUNTING_ENTITY_ICONS.newPersonnel
  - contracts: «احکام و قراردادها» / «احکام» / ACCOUNTING_ENTITY_ICONS.jobGrades
  - changes: «تصویب تغییرات» / «تغییرات» / action-edit
  - all: «پرسنل فعال» / «همه» / status-all
- دکمه‌ها:
  - fetchData (🔄): refresh
  - openApproveModal: approve، با متن کوتاه‌شده فعلی («تصویب استخدام» و «تصویب تغییرات»)
  - openRejectModal: آرگومان‌ها و API را بخوان؛ return یا reject
  - openDiffModal: view با label="مقایسه"
  - openEndCollaborationModal و submitEndCollaboration: terminate
  - openDeleteModal و confirmDeletePersonnel: delete
  - submitApproval: approve با busy
  - submitReject: [appAction] پویای return/reject
  - closeApproveModal، closeRejectModal، closeDiffModal، closeEndCollaborationModal و closeDeleteModal: close
- copyToClipboard (📋 و ✓) دست نخورد.
- اگر «📊 تحلیل بار مالی» کلیک‌پذیر است، ایموجی‌اش با PLATFORM_ENTITY_ICONS.reports جایگزین شود؛ اگر فقط عنوان است، دست نزن.
- در Documents/Responsive_Clickable_Ergonomics/task_responsive_clickable_ergonomics.md کل گام ۱۲ را تیک بزن.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S14-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S14-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.

===

نشست 15 از 15 — طرح ارگونومی واکنش‌گرا: گام ۱۳ (پایانی)

۱. دروازه شروع. پیش از هر تغییر این سه شرط را بسنج. اگر یکی برقرار نبود، هیچ فایلی را تغییر نده، فقط علت را در یک جمله بنویس و پایان بده:
- در فایل Documents/Responsive_Clickable_Ergonomics/implementation_plan_responsive_clickable_ergonomics.md رشته [S14-DONE] باید باشد.
- رشته [S15-DONE] نباید باشد؛ اگر هست، این نشست قبلاً انجام شده است.
- در خروجی git status --porcelain هیچ خطی نباید باشد که با ?? شروع نشود، جز tasks.md، run_tasks.bat، run_tasks.py و tasks_history.md.

۲. در همان فایل طرح، بخش «۹. دستورالعمل اجرای نشست‌های باقی‌مانده (Antigravity)» را کامل بخوان و مو‌به‌مو اجرا کن. سپس بند ۳-۵ و بند ۵ (گام ۱۳) را بخوان.

۳. کار این نشست:
الف) پاک‌سازی رجیستری (بند ۳-۵):
  - نامزدها فقط نام‌های مجموعه RETIRED_VARIANTS در scripts/e2e/guardian_55_clickable_ergonomics.py هستند.
  - یک اسکریپت پایتون موقت در scratch/ بنویس که برای هر نامزد این‌ها را بشمارد:
    - رخدادهای 'نام' و "نام" در warehouse-front/src، جز shared/icons/icon-registry.ts؛
    - رخدادهای 'نام' و "نام" در warehouse-backend، جز venv، __pycache__ و logs؛
    - الگوهای ساخت پویا با پیشوند نام، مثل 'پیشوند-' + و `پیشوند-${.
  - اسکریپت را با python -X utf8 اجرا کن.
  - فقط نامزدی که همه شمارش‌هایش صفر است از icon-registry.ts حذف شود. RETIRED_VARIANTS نگهبان ۵۵ دست نخورد.
  - فهرست حذف‌شده‌ها و مانده‌ها را با علت در گزارش بیاور.
ب) .agents/AGENTS.md (§7 و §9) و .claude/skills/design-system/SKILL.md:
  - به هر کدام یک زیربخش کوتاه بیفزا که این‌ها را راه پیش‌فرض بنامد: button[appAction] (با کلید terminate)، app-tab-bar، app-overflow-menu، app-command-center (با flex-wrap)، و فرهنگ‌های STATUS، ACTION، ROLE، PLATFORM و ACCOUNTING.
  - خلاصه بندهای ۹-۲ و ۹-۳ طرح را هم بیاور.
  - متن موجود را حذف نکن.
ج) بیلد هر سه پروفایل: پیش‌فرض، accounting-only و warehouse-only.
د) نگهبان‌ها:
  - guardian_modularization.py، 52، 55 (و در پایان --update-baseline) و 56 با --base <پایه این نشست>.
  - guardian_all.py را اجرا نکن؛ نگهبان‌های ۱۵، ۱۹ و menu_redesign به پایگاه داده می‌نویسند.
ه) ng test کامل:
  - tsconfig موقت tsconfig.fulltest.spec.json بساز که ./tsconfig.spec.json را extend کند.
  - یک بار اجرا کن؛ specهایی را که خطای نوع (TS) دارند در exclude و با --exclude کنار بگذار و دوباره اجرا کن.
  - همین را روی «پایه نشست ۰» تکرار کن (hash آن در عنوان گزارش نشست ۰ است)، با روش git archive و junction بند ۹-۴.
  - فهرست تست‌هایی را که اینجا شکست می‌خورند ولی روی پایه نشست ۰ نه، در گزارش بیاور.
  - tsconfig موقت را پاک کن.
و) گزارش نهایی طرح در «گزارش پیشرفت»:
  - جدول عددهای نگهبان ۵۵ از گام ۰ تا امروز؛
  - فهرست همه «کارهای بی‌کلید» نشست‌های ۱ تا ۱۴؛
  - فهرست کلیدهای تازه فرهنگ آیکون؛
  - چک‌لیست ۳۶۰px همه صفحه‌های پشت ورود برای کاربر.
ز) در Documents/Responsive_Clickable_Ergonomics/task_responsive_clickable_ergonomics.md گام ۱۳ را تیک بزن.

۴. پایان:
- معیار ۹-۴ را کامل اجرا کن.
- گزارش را با برچسب [S15-DONE] بنویس، فقط اگر همه معیارها سبز بود؛ وگرنه با [S15-FAILED] و علت.
- commit کن، push نکن و توقف کن.
- اگر خطای بیلد، نگهبان یا پسرفت تست را با دو تلاش رفع نکردی، برچسب FAILED بزن و توقف کن.
