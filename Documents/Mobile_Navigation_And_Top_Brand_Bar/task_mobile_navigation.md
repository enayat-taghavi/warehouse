<div dir="rtl" align="right">

# چک‌لیست اجرایی: بازطراحی ناوبری موبایل و نوار تب‌های پایین (`task_mobile_navigation.md`)

## فاز ۱: قرارداد ماژول‌ها و برچسب‌های مختصر (`shortLabel`)
- [ ] افزودن فیلد اختیاری `shortLabel?: string` به `ModuleNavItem` در `frontend/src/app/core/modules/module-contract.ts`
- [ ] افزودن `shortLabel` به `NavItem` و تمام ۲۵ آیتم در `frontend/src/app/modules/warehouse/nav-items.ts`
- [ ] افزودن `shortLabel` به `NavItem` و تمام ۳۶ آیتم در `frontend/src/app/modules/accounting/nav-items.ts`
- [ ] افزودن `shortLabel` به آیتم‌های `frontend/src/app/modules/showcase/nav-items.ts` و `operations-layout.ts`

## فاز ۲: زیرساخت پیام‌رسان سازمانی (چت) و مرکز اعلان‌ها در موبایل
- [ ] افزودن سیگنال `hasActiveConversation = signal<boolean>(false)` در `CommunicationService` و همگام‌سازی آن با `activeConv` در `ChatDrawerComponent`
- [ ] اصلاح استایل و موقعیت `.chat-drawer-panel` و بک‌دراپ آن در `chat-drawer.component.html` تا در موبایل (`max-md:`) زیر نوار برند و هدر بالا باز شود و روی آن‌ها را نپوشاند
- [ ] تنظیم مرز پایینی پنل چت در موبایل: بالای نوار تب‌های پایین در حالت فهرست گفت‌وگوها، و تمام‌قد تا پایین صفحه (`bottom-0`) هنگام ورود به یک گفت‌وگو (`hasActiveConversation()`)
- [ ] افزودن ورودی `hideTriggerOnMobile = input<boolean>(false)` به `NotificationCenterComponent` و تنظیم موقعیت پاپ‌اور اعلان‌ها در موبایل

## فاز ۳: پیاده‌سازی نوار برند بالا، خلوت‌سازی هدر و نوار تب‌های پایین در پوسته‌ها
- [ ] تعریف متغیرهای CSS (`--mobile-top-chrome-height` و `--mobile-bottom-nav-height`) در `styles.css` و تنظیم ارتفاع `.layout-header` در `layout.css`
- [ ] افزودن نوار برند ثابت بالای هدر با عنوان `اتوماسیون شرکت` در `layout.html` و `operations-layout.html` (فقط موبایل `md:hidden`)
- [ ] حذف دکمهٔ همبرگر `☰`، مخفی‌سازی دکمهٔ چت و زنگولهٔ اعلان در هدر موبایل (`layout.html` و `operations-layout.html`)
- [ ] پیاده‌سازی نوار تب‌های پایین به سبک واتساپ (۱. چت، ۲. اعلان، ۳. گزینهٔ اول منو با نام مختصر، ۴. گزینهٔ دوم منو با نام مختصر، ۵. بیشتر) در `layout.ts` / `layout.html` و `operations-layout.ts` / `operations-layout.html`
- [ ] پنهان شدن خودکار نوار تب‌های پایین هنگام ورود کاربر به داخل یک گفت‌وگوی چت در موبایل

## فاز ۴: رفع تداخل نوارهای شناور پایین، تست‌های DOM و نگهبان‌ها
- [ ] تنظیم فاصلهٔ نوارهای شناور پایین صفحه در `employee-attendance.html` و `users.html` نسبت به نوار تب‌های پایین در موبایل
- [ ] نوشتن و به‌روزرسانی تست‌های واحد DOM (Vitest) در `layout-modular.dom.spec.ts` و `operations-layout.dom.spec.ts`
- [ ] اجرای نگهبان‌های تغییر و ارگونومی (`guardian_56_change_integrity.py`، `guardian_52_icon_registry.py`، `guardian_55_clickable_ergonomics.py`)
- [ ] اجرای بیلد بدون خطای فرانت‌اند (`npx ng build --delete-output-path=false && node tools/patch-ngsw-530.js`)

</div>
