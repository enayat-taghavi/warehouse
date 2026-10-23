<div dir="rtl" align="right">

# گزارش پیاده‌سازی و ارتقای کلیدهای میانبر سامانه (Keyboard Shortcuts Implementation Walkthrough)

> [!NOTE]
> **شناسه پیاده‌سازی:** `KS-AUDIT-20260815`  
> **محدوده تغییرات:** لایه‌های ماژولار فرانت‌اند، کامپوننت‌های داده، کارتابل‌های عملیاتی انبارگردانی و بوم‌های گرافیکی  
> **وضعیت بیلد نهایی:** `PASS (Exit Code: 0, Application bundle generation complete)`

---

## ۱. خلاصه‌ دستاوردها و قابلیت‌های افزوده شده

در این پروژه، کلیدهای میانبر کیبورد در سرتاسر بخش‌های کلیدی سامانه بر اساس استانداردهای بین‌المللی ارگونومی کاربری و سرعت‌بخشی به فرآیندهای انبارداری پیاده‌سازی و فعال‌سازی شدند:

| بخش سامانه | کلیدهای میانبر (Shortcuts) | عملکرد عملیاتی |
| :--- | :--- | :--- |
| **ناوبری عمومی (Global Layout)** | `Alt + راست` / `Alt + چپ` | رفتن به صفحه قبل (Back) / صفحه بعد (Forward) |
| | `Ctrl + B` | جمع و باز کردن سایدبار اصلی دسکتاپ |
| | `Shift + ?` یا `F1` | نمایش پنجره جامع راهنمای کلیدهای میانبر |
| | `Escape` | بستن منوها، نوتیفیکیشن خطاها و پنجره راهنما |
| **دیالوگ‌ها و مودال‌ها (Modals)** | `Enter` | تایید در دیالوگ‌های تایید، حذف هوشمند و فرم‌ها |
| | `Ctrl + Enter` | ارسال درخواست آپلود اکسل و ذخیره تصویر پروفایل |
| | `Escape` | لغو عملیات و بستن پنجره‌های باز |
| | `+` و `-` و `R` | زوم تصویر و چرخش ۹۰ درجه در ویرایشگر تصویر |
| **جدول داده (Data Table)** | `Ctrl + S` | ذخیره سریع تمامی تغییرات ویرایش در انتظار |
| | `Ctrl + Z` / `Ctrl + Y` | لغو (Undo) و تکرار (Redo) آخرین ویرایش سلول‌ها |
| | `Ctrl + A` | انتخاب یا لغو انتخاب تمامی سطرهای جدول |
| | `Escape` | بستن منوی ستون‌ها، فیلترها و لغو حالت ویرایش |
| **انبارگردان و اسکنر (Counter)** | `Enter` / `Ctrl + Enter` | ثبت فوری شمارش جاری در کادر و ذخیره پیش‌نویس |
| | `F2` / `Alt + B` | انتقال فوکوس کیبورد به کادر بارکدخوان |
| | `Alt + 1` / `Alt + 2` | سوئیچ سریع بین تب‌های «تسک‌های من» و «استخر کالاها» |
| | `Escape` | بستن اسکنر دوربین یا بازگشت به لیست کالاها |
| **سرپرست و مدیر (Supervisor & Review)** | `A` (یا `ش`) | تایید سریع کالاهای انتخاب‌شده (Approve) |
| | `Ctrl + Enter` | تایید نهایی ارسال در فرم‌های ثبت دلیل رد/ارجاع به بازشماری |
| | `Alt + 1` تا `Alt + 4` | سوئیچ سریع بین کارتابل شمارش و کارتابل مالی اسناد |
| **طراحی لیبل و کارت (Designers)** | `کلیدهای جهت‌نما` | جابجایی دقیق المان به اندازه ۱ میلی‌متر (Nudge) |
| | `Shift + جهت‌نما` | جابجایی سریع المان به اندازه ۵ تا ۱۰ میلی‌متر |
| | `Ctrl + C` / `Ctrl + V` | کپی و درج المان انتخابی روی بوم |
| | `Delete` / `Backspace` | حذف المان انتخاب‌شده |
| | `Ctrl + P` | چاپ مستقیم شیت یا کارت پرسنلی |
| | `Space` / `F` | چرخش سه‌بعدی کارت پرسنلی بین نمای رو و پشت |

---

## ۲. فایل‌های تغییریافته (Modified Components)

1. `frontend/src/app/components/layout/layout.ts` & `layout.html`:
   - پیاده‌سازی شنونده سراسری کلیدهای میانبر، تاگل سایدبار با `Ctrl+B`، و طراحی پنجره راهنمای کامل کلیدها.
2. `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts`:
   - پشتیبانی از `Enter` و `Escape`.
3. `frontend/src/app/shared/components/smart-delete-modal/smart-delete-modal.ts`:
   - پشتیبانی از `Enter` و `Escape`.
4. `frontend/src/app/shared/components/excel-import-modal/excel-import-modal.ts`:
   - پشتیبانی از `Escape` و `Ctrl+Enter`.
5. `frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.ts`:
   - کلیدهای زوم `+`/`-`، چرخش `R`، ذخیره `Ctrl+Enter` و بستن `Escape`.
6. `frontend/src/app/shared/components/data-table/data-table.component.ts`:
   - میانبرهای `Ctrl+S`, `Ctrl+A`, `Escape`.
7. `frontend/src/app/shared/components/barcode-scanner/barcode-scanner.component.ts`:
   - میانبرهای `F2`/`Alt+B` و `Escape`.
8. `frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts` & `counter-dashboard.html`:
   - میانبرهای `Enter`, `Ctrl+Enter`, `Alt+1`, `Alt+2`, `Escape`.
9. `frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts`:
   - کلیدهای `A`, `Ctrl+Enter`, `Alt+1..4`, `Escape`.
10. `frontend/src/app/components/manager-review/manager-review.ts`:
    - کلیدهای `A`, `Ctrl+Enter`, `Alt+1..4`, `Escape`.
11. `frontend/src/app/components/label-designer/label-designer.ts`:
    - جابجایی پیکسلی با Arrow keys، کپی/پیست المان با `Ctrl+C`/`Ctrl+V`، ذخیره با `Ctrl+S`.
12. `frontend/src/app/components/id-cards/id-cards.ts`:
    - چرخش کارت با `Space`/`F`، چاپ سریع با `Ctrl+P`، ذخیره با `Ctrl+S` و بستن با `Escape`.

---

## ۳. نتیجه اعتبارسنجی بیلد (Build Verification)

```bash
> warehouse-app@0.0.0 build
> ng build && node tools/patch-ngsw-530.js

Application bundle generation complete. [49.882 seconds]
✔ ngsw-worker.js وصله شد: جلوگیری از غیرفعال شدن کش در هنگام قطعی کلودفلر
Exit Code: 0 (Success)
```

</div>
