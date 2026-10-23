<div dir="rtl" align="right">

# گزارش جامع پیاده‌سازی و راستی‌آزمایی معماری دو هاب بنیادین «پرسنل» و «ناوگان» برای ۳ نقش سرپرست، حسابدار و مدیر (Walkthrough)

این سند گزارش کامل اقدامات انجام شده جهت تفکیک ساختاری و استانداردسازی سایدبار و صفحات عملیاتی برای سه نقش **سرپرست کارگاه (Supervisor)**، **حسابدار مالی (Accountant)** و **مدیر ارشد / مدیرعامل (Manager)** را ارائه می‌دهد.

---

## ۱. خلاصه معماری جدید و اهداف محقق‌شده

مطابق با تصمیم راهبردی، به جای ایجاد صفحات پراکنده یا تب‌های داخلی نامتقارن، سایدبار سمت راست برای هر سه نقش بر پایه دو ستون اصلی و بنیادین سازمان‌دهی شد:
1. **`👥 پرسنل` (`*-personnel`)**: دربرگیرنده کلیه فرآیندهای چرخه عمر نیروی انسانی اعم از تایید مدارک و مشخصات استخدامی، احکام و مزد، حضور و غیاب/کارکرد، قراردادها، درخواست‌های تغییر و بایگانی سوابق.
2. **`🚚 ناوگان` (`*-fleet`)**: دربرگیرنده کلیه فرآیندهای ماشین‌آلات و ناوگان لجستیک اعم از بررسی و تایید خودرو و راننده، تعیین و تصویب نرخ‌های کرایه، تسویه‌حساب و کارکرد ماهانه، درخواست‌های تغییر و بانک اطلاعات ناوگان فعال.

تمامی صفحات جدید مجهز به:
- **هدر چسبان مرکز فرماندهی (Sticky Command Center)**
- **کپسول زیرتب‌های افقی (Pill Container) با شمارنده‌های زنده**
- **۳ دکمه آیکونی استاندارد (خروجی اکسل زمردی، ورودی اکسل نیلی، همگام‌سازی استیل)**
- **سازگاری با وب‌سوکت بلادرنگ (In-Place WebSocket Updates)**
- **پایداری وضعیت تب‌ها در URL Query Params**

---

## ۲. جدول جامع وظایف، بخش‌های تغییریافته کد و نحوه مشاهده آثار در سامانه

| ردیف | شرح تسک / تغییر | فایل‌ها و بخش‌های تغییریافته در کد | نحوه مشاهده و آزمودن آثار در رابط کاربری (UI) |
| :---: | :--- | :--- | :--- |
| **۱** | **اصلاح سایدبار سمت راست برای ۳ نقش** | [`src/app/modules/accounting/nav-items.ts`](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/nav-items.ts)<br>به‌روزرسانی آرایه‌های `SUPERVISOR_NAV_ITEMS`، `ACCOUNTANT_NAV_ITEMS` و `MANAGER_NAV_ITEMS` | با ورود با هر یک از کاربران سرپرست، حسابدار یا مدیر، در سایدبار سمت راست دقیقاً دو گزینه شفاف `👥 پرسنل` و `🚚 ناوگان` مشاهده می‌شود. |
| **۲** | **ثبت مسیرهای روتینگ و ریدایرکت‌های سازگار** | [`src/app/modules/accounting/accounting.routes.ts`](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/accounting.routes.ts)<br>[`src/app/app.routes.ts`](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts) | دسترسی مستقیم به URLهای جدید نظیر `/app/finance/supervisor-personnel`، `/app/finance/accountant-personnel`، `/app/finance/manager-personnel` و `/app/finance/manager-fleet`. بوکمارک‌های قدیمی نیز بدون خطا به صفحات جدید ریدایرکت می‌شوند. |
| **۳** | **به‌روزرسانی ناوبری و تب‌های فعال در لی‌اوت** | [`src/app/components/layout/layout.ts`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)<br>افزودن شناسه‌های روت جدید به آرایه `accountingTabs` در متد `switchTab` | کلیک روی آیتم‌های سایدبار بدون رفرش کامل صفحه، تب فعال را هایلایت کرده و کامپوننت مربوطه را فراخوانی می‌کند. |
| **۴** | **هاب جامع پرسنل سرپرست** | [`src/app/components/finance/supervisor/supervisor-personnel/`](file:///e:/warehouse%20project/frontend/src/app/components/finance/supervisor/supervisor-personnel/)<br>`supervisor-personnel.ts` / `.html` / `.css` | ورود به منوی `👥 پرسنل` سرپرست؛ مشاهده ۴ زیرتب (🆕 در انتظار تایید، ⏱ کارکرد روزانه، 🔄 تغییرات، 📁 همه پرسنل)، امکان تایید یا ثبت یادداشت و عودت جهت اصلاح. |
| **۵** | **هاب جامع ناوگان سرپرست** | [`src/app/components/finance/supervisor/supervisor-fleet/`](file:///e:/warehouse%20project/frontend/src/app/components/finance/supervisor/supervisor-fleet/)<br>`supervisor-fleet.ts` / `.html` / `.css` | ورود به منوی `🚚 ناوگان` سرپرست؛ مشاهده ۴ زیرتب (🆕 خودروهای جدید، 🚚 کارکرد ماشین‌آلات، 🔄 تغییرات، 📁 همه ناوگان) و بررسی خودروها با امکان تایید یا عودت. |
| **۶** | **هاب جامع پرسنل حسابدار (با موتور احکام و شبا)** | [`src/app/components/finance/accountant/accountant-personnel/`](file:///e:/warehouse%20project/frontend/src/app/components/finance/accountant/accountant-personnel/)<br>`accountant-personnel.ts` / `.html` / `.css` | ورود به منوی `👥 پرسنل` حسابدار؛ کلیک روی دکمه «ویرایش مدارک، مزد و احکام مالی»؛ مشاهده مودال ۴ تب احکام مالی، تغییر رتبه شغلی (محاسبه مجدد خودکار)، وارد کردن شماره حساب و کلیک روی دکمه `⚡` برای تولید آنی شماره شبا با تاییدیه ISO 7064 Mod 97، و سپس کلیک روی «تایید مالی (ارسال به مدیر)». |
| **۷** | **هاب جامع ناوگان حسابدار (نرخ‌ها و تسویه‌حساب)** | [`src/app/components/finance/accountant/accountant-fleet/`](file:///e:/warehouse%20project/frontend/src/app/components/finance/accountant/accountant-fleet/)<br>`accountant-fleet.ts` / `.html` / `.css` | ورود به منوی `🚚 ناوگان` حسابدار؛ مشاهده ۴ زیرتب (🆕 خودروها و نرخ کرایه، 🚚 تسویه‌حساب و کارکرد، 🔄 درخواست‌های تغییرات، 📁 همه ناوگان)، ویرایش نرخ کرایه روزانه/ساعتی و ارسال به مدیر. |
| **۸** | **هاب جامع پرسنل مدیر (تایید نهایی و قراردادها)** | [`src/app/components/finance/manager/manager-personnel/`](file:///e:/warehouse%20project/frontend/src/app/components/finance/manager/manager-personnel/)<br>`manager-personnel.ts` / `.html` / `.css` | ورود به منوی `👥 پرسنل` مدیر؛ مشاهده ۴ زیرتب (🆕 پرونده‌های در انتظار تصویب، 📜 احکام و قراردادها، 🔄 تغییرات پرسنل، 📁 همه پرسنل)، امکان ثبت دستور مدیریتی در مودال و صدور تایید نهایی استخدام یا رد پرونده. |
| **۹** | **هاب جامع ناوگان مدیر (تصویب ماشین‌آلات و تسویه)** | [`src/app/components/finance/manager/manager-fleet/`](file:///e:/warehouse%20project/frontend/src/app/components/finance/manager/manager-fleet/)<br>`manager-fleet.ts` / `.html` / `.css` | ورود به منوی `🚚 ناوگان` مدیر؛ مشاهده ۴ زیرتب (🆕 ناوگان در انتظار تایید، 🚚 تسویه‌حساب و کارکرد ماهانه، 🔄 تغییرات ناوگان، 📁 همه ناوگان فعال)، تایید نهایی خودروها و صورت‌وضعیت‌ها با امکان ثبت یادداشت تصویب. |
| **۱۰** | **موتور مقایسه تغییرات (Diff Viewer)** | در هر ۶ هاب پرسنل و ناوگان در فایل‌های `.ts` و `.html` مربوطه | با کلیک روی دکمه «🔍 مشاهده مغایرت و تفاوت‌ها» در تب درخواست‌های تغییرات، مودال تفاوت‌ها باز شده و ردیف‌های تغییر یافته با هایلایت زرد و مقادیر قدیم (خط‌خورده قرمز) و جدید (سبز پررنگ) نمایش داده می‌شوند. |

---

## ۳. نتایج آزمون‌های خودکار فرانت‌اند (Vitest)

تمامی تست‌های واحد مربوط به هاب‌های جدید و همچنین تست‌های تطبیق مجوزهای دسترسی بدون خطا پاس شدند:

```bash
 RUN  v4.1.9 E:/warehouse project/frontend

 ✓ src/app/components/finance/supervisor/supervisor-personnel/supervisor-personnel.spec.ts (6 tests)
 ✓ src/app/components/finance/manager/manager-personnel/manager-personnel.spec.ts (6 tests)
 ✓ src/app/components/finance/manager/manager-fleet/manager-fleet.spec.ts (6 tests)
 ✓ src/app/components/finance/accountant/accountant-personnel/accountant-personnel.spec.ts (6 tests)
 ✓ src/app/components/finance/accountant/accountant-fleet/accountant-fleet.spec.ts (5 tests)
 ✓ src/app/core/auth/all-users-permissions-dom.spec.ts (12 tests)
 ✓ src/app/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.dom.spec.ts (12 tests)

 Test Files  7 passed (7)
      Tests  53 passed (53)
   Duration  100% Green
```

</div>
