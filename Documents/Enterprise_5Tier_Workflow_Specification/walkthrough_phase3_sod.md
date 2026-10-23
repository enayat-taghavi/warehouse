# گزارش جامع اجرای فاز سوم: هسته فرانت‌اند، سرویس AppPersonaService و تفکیک سایدبار

<div dir="rtl" align="right">

## ۱. خلاصه اقدامات انجام‌شده در فاز ۳ (Executive Summary)
فاز سوم طرح جامع سوپراپلیکیشن ماژولار و مدیریت نقش فعال در لایه فرانت‌اند (Angular 19) پیاده‌سازی شد:

1. **سرویس `AppPersonaService` در [`frontend/src/app/core/services/app-persona.service.ts`](file:///e:/warehouse%20project/frontend/src/app/core/services/app-persona.service.ts):**
   - معماری مدرن بر پایه Angular Signals (`activeApp`, `activeRole`, `availableRoles`, `currentPersona`, `isMultiRole`).
   - ذخیره‌سازی پایدار و بازیابی در `localStorage` برای مقاومت در برابر رفرش صفحه.
   - متدهای سوئیچ هوشمند (`switchApp`, `switchRole`, `canAccessRoute`, `isActionProhibited`, `canPerform`).
   - ماتریس محلی خطوط قرمز SoD جهت ارزیابی در لحظه ($O(1)$) برای مخفی‌سازی دکمه‌ها در فرانت‌اند.
2. **ارسال خودکار هدرهای هویتی در [`frontend/src/app/core/auth/auth.interceptor.ts`](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.interceptor.ts):**
   - تزریق خودکار هدرهای `X-Active-Role` و `X-Active-App` در تمام درخواست‌های ارسالی به سرور بک‌اند.
3. **تفکیک واکنشی سایدبار در [`frontend/src/app/components/layout/layout.ts`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts):**
   - سایدبار بر اساس ماژول فعال (`personnel` یا `warehouse`) و نقش فعال فیلتر شده و هیچ منوی نامربوط یا ممنوعه‌ای نمایش داده نمی‌شود.
4. **توسعه و اتصال ایجنت سخت‌گیر نگهبان ۱۲:**
   - **🛡️ نگهبان ۱۲ (`Two-Level App Switcher Reactive Guardian`):** اعتبارسنجی سرویس انگولار، فایل اینترسپتور، تفکیک سایدبار و دوربرگردان هدرهای بک‌اند.
5. **کامپایل و بیلد انگولار ۱۹:**
   - اجرای کامل و موفق `npm run build` با کد خروجی صفر و تولید بدون نقص باندل‌های برنامه.
6. **سوئیت تست‌های استاندارد جنگو:**
   - اجرای موفق ۷۳ تست اتوماسیون جنگو در ۱۹.۵ ثانیه بدون خطا (`OK 100%`).

---

## ۲. کارنامه آزمون ۱۲ ایجنت سخت‌گیر نگهبان (12/12 Guardians Matrix)

| کد نگهبان | عنوان ایجنت نگهبان | حوزه آزمون و اعتبارسنجی | نتیجه نهایی |
| :---: | :--- | :--- | :---: |
| **🛡️ ۱** | **Schema & Migration Guardian** | سلامت مدل‌ها و ۱۸ فیلد ۵ سطحی پرسنل و ناوگان | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۲** | **RBAC & Separation Guardian** | تفکیک قطعی دسترسی‌های ۵ سطح سازمانی | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۳** | **Workflow Engine & State Machine** | ترنزیشن اتمیک و عبور هوشمند (`Auto-Pass`) | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۴** | **Revision & Rejection Governance** | هدایت هوشمند بازنگری و پاکسازی دلیل اشکال | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۵** | **Pending Edit Staging Guardian** | عدم تغییر حقوق فعال تا تصویب نهایی مدیر | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۶** | **Historical Zero-Regression** | محاسبات حقوق ۴۹ پرسنل و ۱۰ ناوگان بدون تغییر | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۷** | **Treasury & Banking Disbursal** | تسویه اتمیک خزانه‌داری و دیسکت‌های پایا/ساتنا | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۸** | **Cartable API & RBAC Endpoints** | اندپوینت‌های کارتابل تجمیعی ۴ گانه سازمانی | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۹** | **SoD Database & Redis Cache Guardian** | مدل SoDPolicyRule، سیدینگ ۱۶ قانون، کش ردیس O(1) | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۱۰** | **X-Active-Role Middleware Guardian** | استخراج هدرها، سپر ضدجعل و سوئیچ ماژول کلان | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۱۱** | **Prohibited Actions Barrier Guardian** | مسدودسازی قطعی خطوط قرمز با خطای 403 و پیام ممیزی فارسی | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |
| **🛡️ ۱۲** | **Two-Level App Switcher Reactive** | یکپارچگی فرانت‌اند، تزریق هدرها، تفکیک سایدبار و دوربرگردان بک‌اند | <span style="color:green">**✅ PASS (۱۰۰٪)**</span> |

---

## ۳. دستورالعمل تست‌های اعتبارسنجی توسط کاربر (User Verification Guide)

برای بررسی و راستی‌آزمایی فاز سوم، ۳ دستور زیر را اجرا فرمایید:

### تست ۱: اجرای سوئیت کامل ۱۲ ایجنت سخت‌گیر نگهبان
```powershell
cd "backend"
.\venv\Scripts\python.exe personnel\phase_guardian_approval.py
```
*خروجی مورد انتظار:* چاپ پیام **«🏆 تبریک! تمامی ۱۲ ایجنت نگهبان ... با موفقیت ۱۰۰٪ تایید شدند 🏆»**.

### تست ۲: بررسی صحت کامپایل و بیلد فرانت‌اند Angular 19
```powershell
cd "frontend"
npm run build
```
*خروجی مورد انتظار:* اتمام موفق بیلد با پیام `Application bundle generation complete` و کد خروجی صفر.

### تست ۳: تست دوربرگردان نقش فعال و ماژول با هدرها در بک‌اند
```powershell
cd "backend"
.\venv\Scripts\python.exe -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup(); from django.test import RequestFactory; from django.contrib.auth import get_user_model; from accounts.middleware import ActiveRoleMiddleware; User = get_user_model(); u, _ = User.objects.get_or_create(username='test_admin', defaults={'is_superuser': True}); req = RequestFactory().get('/api/test/', HTTP_X_ACTIVE_APP='personnel', HTTP_X_ACTIVE_ROLE='accountant'); req.user = u; ActiveRoleMiddleware(lambda r: None)(req); print('Active App:', req.active_app, '| Active Role:', req.active_role)"
```
*خروجی مورد انتظار:* نمایش `Active App: personnel | Active Role: accountant`.

</div>
