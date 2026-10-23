<div dir="rtl" align="right">

# چک‌لیست اجرایی طرح سوپراپلیکیشن ماژولار و ماتریس خطوط قرمز (SoD Policy Matrix)

## فاز ۱: پایگاه داده ماتریس SoD، سرویس کشینگ ردیس و ایجنت‌های نگهبان (تکمیل ۱۰۰٪)
- [x] ایجاد مدل `SoDPolicyRule` در [`accounts/models.py`](file:///e:/warehouse%20project/backend/accounts/models.py) با فیلدهای `app_module`, `role_code`, `page_route`, `action_code`, `is_prohibited`, `prohibition_reason_fa` <!-- id: 1001 -->
- [x] ایجاد و اعمال مهاجرت پایگاه داده جنگو (`accounts.0033_sodpolicyrule`) <!-- id: 1002 -->
- [x] پیاده‌سازی سرویس کشینگ متمرکز ردیس [`accounts/sod_cache_service.py`](file:///e:/warehouse%20project/backend/accounts/sod_cache_service.py) با قابلیت Seed خودکار، ذخیره در کلید `sod:policy_matrix` و ارزیابی $O(1)$ <!-- id: 1003 -->
- [x] ایجاد و افزودن ایجنت نگهبان ۹ (`SoD Database & Redis Cache Guardian`) به سوئیت آزمون‌های سخت‌گیرانه [`personnel/phase_guardian_approval.py`](file:///e:/warehouse%20project/backend/personnel/phase_guardian_approval.py) <!-- id: 1004 -->

## فاز ۲: میدلور نقش فعال، سپر ضدجعل و کلاس گارد DRF (تکمیل ۱۰۰٪)
- [x] پیاده‌سازی میدلور [`accounts/middleware.py`](file:///e:/warehouse%20project/backend/accounts/middleware.py) با استخراج خودکار هدرهای `X-Active-Role` و `X-Active-App` <!-- id: 2001 -->
- [x] پیاده‌سازی مکانیزم ضدجعل نقش (`resolve_effective_role` و `get_user_valid_roles_for_app`) جهت جلوگیری از Role-Spoofing <!-- id: 2002 -->
- [x] ثبت `ActiveRoleMiddleware` در `MIDDLEWARE` در [`config/settings.py`](file:///e:/warehouse%20project/backend/config/settings.py) <!-- id: 2003 -->
- [x] ایجاد کلاس گارد امنیتی `SoDPolicyPermission` و تابع کمکی `check_sod_prohibition` در [`accounts/permissions.py`](file:///e:/warehouse%20project/backend/accounts/permissions.py) <!-- id: 2004 -->
- [x] ایجاد ایجنت نگهبان ۱۰ (`X-Active-Role Middleware & Anti-Spoofing Guardian`) و نگهبان ۱۱ (`Prohibited Actions Backend Barrier Guardian`) در [`personnel/phase_guardian_approval.py`](file:///e:/warehouse%20project/backend/personnel/phase_guardian_approval.py) <!-- id: 2005 -->

## فاز ۳: هسته فرانت‌اند، سرویس AppPersonaService و تفکیک سایدبار (تکمیل ۱۰۰٪)
- [x] ایجاد سرویس متمرکز [`frontend/src/app/core/services/app-persona.service.ts`](file:///e:/warehouse%20project/frontend/src/app/core/services/app-persona.service.ts) مبتنی بر Angular 19 Signals و مدیریت `localStorage` <!-- id: 3001 -->
- [x] به‌روزرسانی [`frontend/src/app/core/auth/auth.interceptor.ts`](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.interceptor.ts) جهت تزریق خودکار هدرهای `X-Active-Role` و `X-Active-App` <!-- id: 3002 -->
- [x] اتصال سایدبار در [`frontend/src/app/components/layout/layout.ts`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts) به `AppPersonaService` و تفکیک دو ماژول انبارداری و مالی <!-- id: 3003 -->
- [x] توسعه و اتصال ایجنت نگهبان ۱۲ (`Two-Level App Switcher Reactive Guardian`) در [`personnel/phase_guardian_approval.py`](file:///e:/warehouse%20project/backend/personnel/phase_guardian_approval.py) <!-- id: 3004 -->

## فاز ۴: کامپوننت هدر دولایه سوئیچ اپلیکیشن و سوئیچ نقش فعال (تکمیل ۱۰۰٪)
- [x] ایجاد کامپوننت [`app-role-switcher`](file:///e:/warehouse%20project/frontend/src/app/shared/components/app-role-switcher/app-role-switcher.component.ts) با ساختار دولایه (تگل کپسولی ماژول + دراپ‌داون پرسونای نقش) <!-- id: 4001 -->
- [x] استقرار در هدر اصلی [`layout.html`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html) با چینش ریسپانسیو RTL <!-- id: 4002 -->
- [x] توسعه و اتصال ایجنت سخت‌گیر نگهبان ۱۳ (`Header App & Persona Switcher UI Guardian`) در [`personnel/phase_guardian_approval.py`](file:///e:/warehouse%20project/backend/personnel/phase_guardian_approval.py) <!-- id: 4003 -->

## فاز ۵: پنهان‌سازی هوشمند خطوط قرمز در صفحات مشترک (تکمیل ۱۰۰٪)
- [x] ایمن‌سازی صفحه ثبت کارکرد [`warehouse-attendance`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/warehouse-attendance/warehouse-attendance.ts) با متدهای `canUnlockPeriod` و `canDirectEditAttendance` <!-- id: 5001 -->
- [x] ایمن‌سازی صفحه پرونده‌های پرسنل [`personnel-profiles`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/personnel-profiles/personnel-profiles.ts) و غیرفعال‌سازی فیلدهای دستمزد در DOM برای سرپرست انبار <!-- id: 5002 -->
- [x] توسعه و اتصال ایجنت سخت‌گیر نگهبان ۱۴ (`Smart DOM Red-Lines Masking Guardian`) در [`personnel/phase_guardian_approval.py`](file:///e:/warehouse%20project/backend/personnel/phase_guardian_approval.py) <!-- id: 5003 -->

## فاز ۶: یکپارچه‌سازی سرتاسری، روت‌گاردهای هوشمند و ممیزی نهایی (تکمیل ۱۰۰٪)
- [x] به‌روزرسانی روت‌گارد [`auth.guard.ts`](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.guard.ts) و پوشش ۱۰۰٪ تمام روت‌های ماژولار مالی، کارکرد و انبارداری <!-- id: 6001 -->
- [x] توسعه و اتصال ایجنت سخت‌گیر نگهبان ۱۵ (`End-to-End Super-App Integrity & Cross-Module Guard Guardian`) در [`personnel/phase_guardian_approval.py`](file:///e:/warehouse%20project/backend/personnel/phase_guardian_approval.py) <!-- id: 6002 -->
- [x] کامپایل موفق و کامل بیلد انگولار ۱۹ (`ng build - OK 100%`) <!-- id: 6003 -->
- [x] اجرای موفق سوئیت ۱۵ ایجنت سخت‌گیر نگهبان و ۷۳ تست جنگو <!-- id: 6004 -->

</div>
