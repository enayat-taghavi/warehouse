<div dir="rtl" align="right">

# چک‌لیست وظایف پیاده‌سازی ممیزی چرخه گردش‌کار کارکرد و واقعی‌سازی قفل دوره (v2.0)

- [ ] **فاز ۱: ارتقای مدل‌ها، مایگریشن و لایه سریالایزرها (Backend Model & Migration)** <!-- id: 0 -->
    - [ ] افزودن فیلد `approval_status` (`DRAFT`, `PENDING_SUPERVISOR`, `APPROVED`, `REVISION_REQUIRED`) به مدل `DailyAttendance` <!-- id: 1 -->
    - [ ] افزودن فیلدهای ره‌گیری سرپرست (`supervisor_approved_by`, `supervisor_approved_at`, `revision_reason`, `revision_requested_by`, `revision_requested_at`) به `DailyAttendance` <!-- id: 2 -->
    - [ ] افزودن فیلدهای اختیاری `project` و `section` به مدل `MonthlyWorkPeriod` <!-- id: 3 -->
    - [ ] ایجاد مایگریشن‌های جنگو و اعمال آن‌ها در دیتابیس با مقداردهی ایمن داده‌های گذشته <!-- id: 4 -->
    - [ ] به‌روزرسانی `DailyAttendanceSerializer` با فیلدهای جدید وضعیت تایید و عناوین فارسی <!-- id: 5 -->
    - [ ] به‌روزرسانی سریالایزرهای ماتریسی کارکرد (`BulkAttendanceMatrixSerializer` و `MonthlyGridItemInputSerializer`) <!-- id: 6 -->

- [ ] **فاز ۲: ارتقای کارتابل، موتور حقوق و محاسبات خلاصه ماهانه (Backend Business Logic)** <!-- id: 7 -->
    - [ ] اعمال فیلتر `approval_status='APPROVED'` در [payroll_engine.py](file:///e:/warehouse%20project/warehouse-backend/personnel/payroll_engine.py) جهت ممانعت از محاسبه حقوق کارکردهای تاییدنشده <!-- id: 8 -->
    - [ ] پشتیبانی از `section_id` و `project_id` در اندپوینت `monthly-summary` و محاسبه دقیق `pending_approvals_count` <!-- id: 9 -->
    - [ ] مسدودسازی ویرایش کارکرد در دوره‌های بسته/قفل‌شده (`SUBMITTED_SUPERVISOR`, `LOCKED` و...) در `bulk_save_matrix` و `bulk_save_monthly_grid` <!-- id: 10 -->
    - [ ] ابطال خودکار وضعیت تاییدیه (`PENDING_SUPERVISOR`) در صورت ویرایش کارکرد قبلاً تاییدشده به همراه لاگ ممیزی <!-- id: 11 -->
    - [ ] پشتیبانی از تایید و عودت رکورد کارکرد در اکشن‌های کارتابل (`SupervisorCartableAPIView.post`) همراه با اعتبارسنجی دسترسی بخش (BOLA) <!-- id: 12 -->
    - [ ] ثبت تغییرات وضعیت تایید در `AttendanceAuditLog` بدون دستکاری و تخریب فیلد `notes` <!-- id: 13 -->
    - [ ] پیاده‌سازی سد امنیتی سروری در قفل دوره: ممانعت از قفل دوره در صورت وجود کارکرد تاییدنشده با خطای ۴۰۰ <!-- id: 14 -->
    - [ ] اصلاح بازیابی دوره کارکرد ماهانه بر مبنای `section_id` و `project_id` به جای انتساب اشتباه پروژه به `warehouse_id` <!-- id: 15 -->

- [ ] **فاز ۳: ارتقای کامپوننت کارتابل کارکرد سرپرست در فرانت‌اند (`supervisor-attendance`)** <!-- id: 16 -->
    - [ ] تفکیک نمایش وضعیت حضور (حاضر، غایب و...) از وضعیت تایید سرپرست در جدول کارکرد <!-- id: 17 -->
    - [ ] اصلاح فیلتر تب‌های «⏳ نیازمند بررسی»، «✅ تایید شده»، «⚠️ نیازمند بازنگری» و شمارنده‌ها بر مبنای `approval_status` <!-- id: 18 -->
    - [ ] اتصال دکمه‌های تایید تکی و تایید دسته‌ای به اکشن رسمی کارتابل پرسنلی <!-- id: 19 -->
    - [ ] پیاده‌سازی مودال مدرن و ارگونومیک ثبت علت عودت (جایگزینی کامل با `window.prompt`) و حفظ کامل یادداشت‌های پیشین <!-- id: 20 -->

- [ ] **فاز ۴: ارتقای کامپوننت قفل دوره کارکرد ماهانه در فرانت‌اند (`supervisor-period-lock`)** <!-- id: 21 -->
    - [ ] ارتقای متد `getAttendanceMonthlySummary` در `personnel-api.service.ts` با پشتیبانی از `sectionId` و `projectId` <!-- id: 22 -->
    - [ ] اتصال مقدار `pending_approvals` به فیلد واقعی `summaryRes?.pending_approvals_count` <!-- id: 23 -->
    - [ ] غیرفعال‌سازی دکمه قفل دوره در صورت وجود کارکرد معلق همراه با بنر هشدار راهنما <!-- id: 24 -->
    - [ ] اصلاح پارامتر ارسالی قفل دوره: ارسال صریح `section_id` و `project_id` به جای ارسال مقدار در قالب `warehouse_id` <!-- id: 25 -->

- [ ] **فاز ۵: تست‌های جامع، رگرسیون و بیلد نهایی (Quality Assurance)** <!-- id: 26 -->
    - [ ] نگارش و اجرای آزمون‌های بک‌اند در `test_attendance_approval_workflow.py` (تایید، عودت، ممیزی، سد قفل، حقوق و BOLA) <!-- id: 27 -->
    - [ ] نگارش و اجرای تست‌های DOM فرانت‌اند با Vitest <!-- id: 28 -->
    - [ ] اجرای تست‌های رگرسیون ماژول پرسنل و کارتابل‌ها (`test_company_multitenant`, `test_role_based_cartables`) <!-- id: 29 -->
    - [ ] اجرای موفقیت‌آمیز `npm run build` فرانت‌اند با Exit code 0 <!-- id: 30 -->

</div>
