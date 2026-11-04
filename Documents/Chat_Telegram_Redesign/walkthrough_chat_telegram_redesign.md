<div dir="rtl" align="right">

# گزارش اجرا: بازطراحی چت به سبک تلگرام (Chat Telegram Redesign)

## فاز ۰: ماکت تصویری قبل و بعد (Mobbin & redesign-screen)
- **وضعیت:** انجام شد (بدون تغییر در کد برنامه).
- **مراجع Mobbin:** صفحه‌های فهرست گفتگو، نوار سنجاق، حباب‌ها و واکنش‌ها در تلگرام و واتساپ بررسی شدند.
- **خروجی‌ها:**
  - دسکتاپ دو ستونه: [chat_desktop_before_after.png](file:///e:/comanager/Documents/Chat_Telegram_Redesign/chat_desktop_before_after.png) و [desktop_board.html](file:///e:/comanager/Documents/Chat_Telegram_Redesign/desktop_board.html)
  - موبایل ۳۶۰px: [chat_mobile_before_after.png](file:///e:/comanager/Documents/Chat_Telegram_Redesign/chat_mobile_before_after.png) و [mobile_board.html](file:///e:/comanager/Documents/Chat_Telegram_Redesign/mobile_board.html)
- **ویژگی‌های طراحی:** نمای دو ستونه دسکتاپ (۳۶۰px فهرست راست + گفتگوی چپ)، حباب‌های ایندیگوی روشن/سفید با دنباله در آخرین پیام دسته، نوار سنجاق چندتکه، قرص‌های واکنش، برچسب «بازارسال از …»، برچسب قرمز «پیش‌نویس:» و پس‌زمینهٔ SVG محلی.

## فاز ۱: صفحهٔ کامل `/app/chat`، دکمهٔ بزرگ‌کردن کشو و کاشی لانچر
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت‌ها: `883d5fd0` و `04a08819`).
- **تغییرات اصلی:**
  - افزودن ورودی `mode = input<'drawer' | 'page'>('drawer')` به [chat-drawer.component.ts](file:///e:/comanager/frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.ts) با قالب یکپارچه (بدون تکرار کد طبق بازبینی `ui-reviewer`).
  - تعریف مسیرهای `/app/chat` و `/app/chat/:id` در [app.routes.ts](file:///e:/comanager/frontend/src/app/app.routes.ts) و کامپوننت میزبان [chat-page.component.ts](file:///e:/comanager/frontend/src/app/modules/common/components/communications/chat-page/chat-page.component.ts) همراه با همگام‌سازی URL و پشتیبانی دکمهٔ بازگشت مرورگر.
  - افزودن دکمهٔ «باز کردن در صفحه کامل» (`appAction="expand"`) در هدر کشو و جلوگیری از باز شدن کشوی شناور هنگام حضور در `/app/chat`.
  - افزودن کاشی «گفتگوها و پیام‌رسان» در [app-launcher.html](file:///e:/comanager/frontend/src/app/modules/common/components/app-launcher/app-launcher.html) مشروط به `commService.isChatAvailable()`.
- **کنترل کیفیت:** بیلد تولیدی Angular بدون خطا و بدون هشدار `NG8113`، پاس شدن ۷ تست واحد DOM (`Tests 7 passed (7)`)، پاس شدن نگهبان‌های ۵۲ و ۵۶، پشتیبان دیتابیس (`backup_20261104_082007.dump`) و بررسی سلامت سرور (`200`).

## فاز ۲: پوستهٔ ظاهری تلگرامی و گروه‌بندی پیام‌ها
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت‌ها: `1069039b` و `a93d2e0e`).
- **تغییرات اصلی:**
  - چیدمان راست‌به‌چپ استاندارد تلگرام: پیام‌های ما در سمت **راست** (`items-start`) با پس‌زمینهٔ ایندیگوی روشن (`bg-indigo-50/95`)، متن تیره و دنبالهٔ پایین-راست (`rounded-br-xs`)؛ پیام‌های طرف مقابل در سمت **چپ** (`items-end`) با پس‌زمینهٔ سفید و دنبالهٔ پایین-چپ (`rounded-bl-xs`).
  - گروه‌بندی پیام‌های متوالی یک فرستنده با فاصلهٔ کمتر از ۵ دقیقه (`isFirstInGroup` و `isLastInGroup`)؛ نمایش نام فقط در اولین پیام و آواتار فقط در آخرین پیام گروه (با حفظ فاصلهٔ تراز در پیام‌های میانی).
  - انتقال ساعت و تیک وضعیت (`✓` / `✓✓`) به گوشهٔ پایین داخل حباب، چیپ تاریخ چسبان (`sticky top-2`) با کنتراست WCAG AA، پس‌زمینهٔ طرح‌دار SVG محلی بدون وابستگی CDN و بازطراحی فهرست گفتگو به سبک تلگرام.
- **کنترل کیفیت:** بیلد تولیدی بدون خطا و بدون `NG8113`، پاس شدن ۱۳ تست واحد DOM (`Tests 13 passed (13)`)، پاس شدن نگهبان‌های ۵۲، ۵۵ و ۵۶، رفع ۴ نکتهٔ دسترس‌پذیری `ui-reviewer` و پشتیبان دیتابیس (`backup_20261104_111934.dump`).

## فاز ۳: تعامل‌ها، منوی نگه‌داشتن و کلیک راست، ایموجی محلی و پیش‌نویس
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت‌ها: `0607e3c9` و `cdc7b9d8`).
- **تغییرات اصلی:**
  - منوی پیام دسکتاپ و موبایل (`app-chat-message-menu`): باز شدن با کلیک راست در دسکتاپ و نگه‌داشتن ۴۵۰ میلی‌ثانیه در لمسی، همراه ردیف ۶ ایموجی واکنش (`👍`، `❤️`، `😂`، `😮`، `😢`، `🙏`) و گزینه‌های پاسخ، کپی، ویرایش، انتخاب چندتایی، وضعیت مطالعه و حذف.
  - کشیدن پیام به راست برای پاسخ (Swipe-to-Reply): قفل جهت در ۱۰ پیکسل اول (`|dy| > |dx|` کشیدن را لغو می‌کند تا اسکرول عمومی مختل نشود)، آستانهٔ ۶۰ پیکسل با لرزش لمسی (`vibrate(15)`) و بازگشت کشسان.
  - انتخابگر ایموجی محلی بدون CDN (`app-chat-emoji-picker`): چهار دسته‌بندی پرکاربرد با جستجو و درج ایموجی در موقعیت نشانگر.
  - پیش‌نویس محلی به ازای گفتگو (`localStorage`): ذخیره و بازیابی خودکار متن در حال نوشتن هنگام تعویض گفتگو، و نمایش برچسب قرمز «پیش‌نویس:» در فهرست گفتگوها.
  - انتخاب چندتایی پیام‌ها (Multi-Select): حالت انتخاب با نشانگرهای دایره‌ای تیک، نوار اکشن با شمارنده، دکمهٔ کپی چندتایی با ترتیب زمانی و دکمهٔ لغو.
  - میانبرهای کیبورد: کلید `Escape` برای خروج سلسله‌مراتبی از منو/ایموجی/انتخاب چندتایی و کلید `ArrowUp` روی کادر خالی برای ویرایش آخرین پیام خودی.
- **کنترل کیفیت:** بیلد تولیدی بدون خطا و بدون `NG8113`، ۲۳ تست واحد پاس شده (`Tests 23 passed (23)` / `Test Files 1 passed (1)`)، پاس شدن نگهبان ۵۶ (`🎉 نگهبان ۵۶: تغییرات قالب سالم است.`) و نگهبان ۵۲ (`🎉 نگهبان ۵۲: سامانهٔ آیکن مشترک سالم است.`).

## فاز ۴: واکنش روی پیام‌ها (Message Reactions) و دکمه‌های بازگشت/کوچک‌کردن صفحهٔ کامل
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت: `bb9f763c`).
- **تغییرات اصلی:**
  - مدل `MessageReaction` در [models.py](file:///e:/comanager/backend/core/communications/models.py) با قید یکتای `(message, user)` و ۶ ایموجی مجاز (`👍`، `❤️`، `😂`، `😮`، `😢`، `🙏`) و مهاجرت افزایشی [0002_messagereaction.py](file:///e:/comanager/backend/core/communications/migrations/0002_messagereaction.py).
  - اندپوینت‌های `POST /messages/{id}/react/` (اتمیک با `select_for_update`، تغییر یا حذف واکنش) و `GET /messages/{id}/reactions/` (فهرست افراد واکنش‌دهنده با بررسی عضویت فعال گفتگو و عدم حذف پیام) در [views.py](file:///e:/comanager/backend/core/communications/views.py) و [reactions.py](file:///e:/comanager/backend/core/communications/reactions.py).
  - جلوگیری از N+1 در سریالایزر با `Prefetch('reactions')` و پخش زندهٔ رویداد WebSocket (`message_reaction`) برای به‌روزرسانی درجا.
  - قرص‌های واکنش زیر حباب پیام، پنجرهٔ مشاهدهٔ افراد واکنش‌دهنده، و افزودن دکمه‌های «بازگشت به برنامه» (`appAction="back"`) و «بازگشت به حالت کشو» (`appAction="collapse"`) همراه با `chatReturnUrl` در نمای تمام‌صفحه (`/app/chat`).
- **کنترل کیفیت:** ۲۴۰ تست بک‌اند (`Ran 240 tests in 458.879s - OK`)، ۲۹ تست واحد DOM فرانت (`Tests 29 passed (29)`)، بیلد تولیدی بدون خطا و بدون `NG8113`، پاس شدن نگهبان‌های ۵۲ و ۵۶، و تأیید کامل ۴ اسکیل بازبینی (`NO CONFIRMED FINDINGS`).

## فاز ۵: بازارسال پیام‌ها (Message Forwarding) و محافظت شمارش ارجاع پیوست‌ها
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت‌ها: `8d6267cb` و `52f7b3a4`).
- **تغییرات اصلی:**
  - افزودن فیلدهای `forwarded_from_message` (`SET_NULL`) و `forwarded_from_name` به مدل `Message` در [models.py](file:///e:/comanager/backend/core/communications/models.py) با مهاجرت افزایشی [0003_message_forwarded_fields.py](file:///e:/comanager/backend/core/communications/migrations/0003_message_forwarded_fields.py) (حفظ نام فرستندهٔ اصلی حتی در صورت حذف پیام مبدأ یا بازارسال مجدد).
  - محافظت شمارش ارجاع فایل (`data-loss-reviewer`): بررسی `MessageAttachment.all_objects.exclude(pk=...).filter(file=...)` و `thumbnail` در [models.py](file:///e:/comanager/backend/core/communications/models.py) و [previews.py](file:///e:/comanager/backend/core/communications/previews.py) پیش از هرگونه حذف فیزیکی فایل از دیسک.
  - اندپوینت `POST /api/communications/messages/forward/` در [views.py](file:///e:/comanager/backend/core/communications/views.py) برای بازارسال ۱ تا ۲۰ پیام به حداکثر ۵ گفتگو به‌صورت اتمیک، با بررسی عضویت، حق ارسال و سیاست‌های چت (`contact_scope`) و پخش زندهٔ WebSocket.
  - کامپوننت مستقل [chat-forward-modal.component.ts](file:///e:/comanager/frontend/src/app/modules/common/components/communications/chat-forward-modal/chat-forward-modal.component.ts) با جستجو و سقف ۵ مقصد، اتصال به منوی پیام و نوار انتخاب چندتایی، و نمایش برچسب «بازارسال از …» داخل حباب.
- **کنترل کیفیت:** ۱۴ تست بک‌اند در `test_forward` و `test_reactions` (`Ran 14 tests in 17.476s - OK`)، ۳۴ تست واحد DOM فرانت (`Tests 34 passed (34)`)، بیلد تولیدی بدون خطا و بدون `NG8113`، پاس شدن نگهبان ۵۶ و تأیید هر ۴ اسکیل بازبینی.

## فاز ۶: سنجاق گفتگو و پیام (Conversation & Message Pinning)
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت‌ها: `3509b330` و `84687c26`).
- **تغییرات اصلی:**
  - افزودن ستون `pinned_at` روی `ConversationParticipant` (سنجاق شخصی گفتگو تا ۵ مورد) و مدل `PinnedMessage` (سنجاق پیام تا ۵ مورد در هر گفتگو) با مهاجرت افزایشی [0004_pinning.py](file:///e:/comanager/backend/core/communications/migrations/0004_pinning.py).
  - اندپوینت‌های اتمیک با `select_for_update` در [views.py](file:///e:/comanager/backend/core/communications/views.py) و اعمال دقیق ماتریس دسترسی سنجاق پیام (گفتگوی دونفره: هر دو نفر؛ گروه: مالک یا مدیر؛ اطلاعیه: فقط فرستنده) همراه با حذف خودکار سنجاق هنگام حذف نرم پیام و پخش رویدادهای WebSocket (`message_pinned` / `message_unpinned`).
  - کامپوننت مستقل [chat-pinned-bar.component.ts](file:///e:/comanager/frontend/src/app/modules/common/components/communications/chat-pinned-bar/chat-pinned-bar.component.ts) در بالای گفتگو با نشانگر عمودی چندتکه (تا ۵ قطعه) و پرش چرخشی بین پیام‌های سنجاق‌شده با کلیک یا صفحه‌کلید (`Enter` / `Space`).
- **کنترل کیفیت:** ۲۳ تست بک‌اند (`Ran 23 tests in 40.940s - OK`)، ۴۰ تست واحد DOM فرانت (`Tests 40 passed (40)`)، بیلد تولیدی بدون خطا و بدون `NG8113`، پاس شدن نگهبان‌های ۵۲ و ۵۶، پشتیبان دیتابیس (`backup_20261104_170846.dump`) و تأیید بازبینی.

## فاز ۷: آخرین بازدید تقریبی (Approximate Last Seen) و ۵ اصلاح فوری رابط کاربری
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت: `559d5554`).
- **تغییرات اصلی:**
  - مدل `ChatPresence` در [models.py](file:///e:/comanager/backend/core/communications/models.py) با مهاجرت افزایشی [0005_chatpresence.py](file:///e:/comanager/backend/core/communications/migrations/0005_chatpresence.py) (بدون دستکاری جدول کاربر در `accounts`).
  - ثبت `last_seen_at` در [presence.py](file:///e:/comanager/backend/core/communications/presence.py) با throttle کش ۶۰ ثانیه‌ای هنگام حضور و ثبت فوری هنگام صفر شدن اتصالات، همراه با بررسی سخت‌گیرانهٔ `contact_scope` در سریالایزر و WebSocket (`consumers.py`) و جلوگیری از N+1 با `select_related('chat_presence')`.
  - نمایش ۶ حالت تقریبی شمسی (`آنلاین`، `آخرین بازدید اخیراً`، `آخرین بازدید امروز ساعت …`، `آخرین بازدید دیروز`، `آخرین بازدید این هفته`، `آخرین بازدید مدتی پیش`) در هدر گفتگوی دونفره با به‌روزرسانی هر ۶۰ ثانیه.
  - اعمال ۵ اصلاح فوری گزارش‌شده توسط کاربر: ۱) حفظ فهرست گفتگوها در سایدبار راست دسکتاپ هنگام باز بودن گفتگو (`activeTab() !== 'contacts'`)، ۲) ارتقای لایهٔ کشو به `z-[70]`، بک‌دراپ به `z-[60]` و مودال‌ها به `z-[80]` بالاتر از سایدبار دسکتاپ (`z-[55]`)، ۳) سیگنال `previewVersion` و fallback فوری برای نمایش درجا و بدون تأخیر پیش‌نمایش عکس در لحظهٔ آپلود، ۴) حفظ حالت تمام‌صفحه هنگام ورق زدن عکس‌ها در `document-preview.component.ts`، و ۵) دوبار کلیک (`dblclick`) روی حباب پیام برای پاسخ سریع.
- **کنترل کیفیت:** ۳۰ تست بک‌اند (`Ran 30 tests in 33.025s - OK`)، ۴۷ تست واحد DOM فرانت (`Tests 47 passed (47)`)، بیلد تولیدی بدون خطا و بدون `NG8113`، پاس شدن نگهبان‌های ۵۲ و ۵۶، پشتیبان دیتابیس (`backup_20261104_185504.dump`) و تأیید کامل هر ۴ اسکیل بازبینی (`NO CONFIRMED FINDINGS`).

## فاز ۸: دو تیک خاکستری تحویل پیام، حذف گروهی، کارایی و ممیزی نهایی نوتیفیکیشن و سرعت
- **وضعیت:** انجام شد و روی `app.farsalish.ir` منتشر گردید (کامیت‌ها: `53f777ec` و `41d82805`).
- **تغییرات اصلی:**
  - **دو تیک خاکستری تحویل نوتیفیکیشن (`✓✓` خاکستری — WhatsApp Delivered):** افزودن ستون `last_delivered_message` در [0006_delivery_tracking.py](file:///e:/comanager/backend/core/communications/migrations/0006_delivery_tracking.py)، ارسال خودکار `delivery_ack` به محض رسیدن نوتیفیکیشن `new_message` به مرورگر گیرنده (حتی وقتی کشوی چت بسته است) و هنگام دریافت فهرست گفتگوها، پخش زندهٔ `message_delivered` و نمایش سه وضعیت تیک (`tick-sent` تک‌تیک خاکستری، `tick-delivered` دوتیک خاکستری و `tick-read` دوتیک آبی/ایندیگو).
  - **حذف گروهی پیام‌ها (`POST /messages/bulk-delete/`):** حذف اتمیک تا ۲۰ پیام در نوار انتخاب چندتایی با بررسی دسترسی حذف، پاک‌سازی سنجاق‌های وابسته، شمارش ارجاع فایل فیزیکی و پنجرهٔ تأیید حذف گروهی.
  - **بهینه‌سازی و صیقل نهایی:** افزودن `content-visibility: auto; contain-intrinsic-size: 0 56px;` روی ردیف‌های پیام، حلقهٔ هایلایت ۱.۶ ثانیه‌ای هنگام پرش به پیام، و نمایش نوع پیوست (`📷 تصویر` / `🎤 پیام صوتی` / `📎 فایل پیوست`) در نوار پاسخ.
  - **ممیزی نهایی سیستم نوتیفیکیشن و سرعت سیستم:**
    1. **نوتیفیکیشن:** سرکوب کامل صدای اعلان روی گفتگوهای بی‌صدا (`conv.is_muted`) در `CommunicationService.handleNewMessage`، تفکیک اکوی تب‌ها، ارسال آنی `delivery_ack` در پس‌زمینه و بازیابی خودکار هنگام روشن شدن صفحه (`visibilitychange`).
    2. **سرعت و کوئری‌های SQL:** حذف کامل N+1 در پیوست پیام‌های پاسخ‌داده‌شده با افزودن `'reply_to__attachments'` به `prefetch_related` و استفاده از `Exists` subquery برای محاسبهٔ `is_delivered` (تعداد کوئری‌های فهرست گفتگوها و پیام‌ها کاملاً ثابت و $O(1)$ است).
- **کنترل کیفیت:** ۲۶۶ تست بک‌اند در مجموعهٔ `integration_tests.communications` (`Ran 266 tests in 472.275s - OK`)، ۵۲ تست واحد DOM فرانت (`Tests 52 passed (52)`)، بیلد تولیدی بدون خطا و بدون `NG8113`، و پاس شدن هر سه نگهبان ۵۲، ۵۵ و ۵۶ روی کل تغییرات پروژه (`--base dd077f15`).

</div>
