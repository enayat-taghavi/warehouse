# طرح: آماده‌سازی سایت و ساخت اپ موبایل CoManage با Capacitor

<div dir="rtl" align="right">

تاریخ: ۲۶ مهر ۱۴۰۵ (2026-10-17) — وضعیت: **طرح؛ اجرا فقط پس از تأیید تایپی کاربر**

## ۱. هدف

- کد Angular فعلی، بدون بازنویسی، به اپ اندروید (و پروژهٔ آمادهٔ iOS) تبدیل شود.
- سایت پیش از آن طوری آماده شود که هیچ رفتاری روی وب عوض نشود، ولی همهٔ نقطه‌های وابسته به مرورگر (آدرس سرور، دانلود، چاپ، لینک، دامنه) از یک لایهٔ مشترک بگذرند.
- آپدیت اپ مثل PWA امروز تقریباً خودکار باشد (Live Update روی سرور خودمان) و هیچ داده‌ای در هیچ آپدیتی گم نشود.

## ۲. تصمیم‌ها (کاربر، ۲۶ مهر)

| موضوع | تصمیم |
|---|---|
| سرور اپ | فعلاً ثابت در هر نسخه: نسخهٔ اصلی ← `soft.farsalish.ir`، نسخهٔ آزمایشی ← `app.farsalish.ir`. **باید هر زمان به‌آسانی عوض شود** (بند ۴-ب: یک ثابت در environment + جابه‌جایی از راه دور با `canonical_domain`). |
| آپدیت اجباری | دوسطحی: پایین‌تر از «نسخهٔ توصیه‌شده» فقط هشدار؛ پایین‌تر از «حداقل نسخه» قفل کار جدید. در هر دو حالت صف آفلاین دست‌نخورده می‌ماند و تا آپدیت ارسال نمی‌شود. |
| دامنه‌های مجاز | `soft.farsalish.ir`، `app.farsalish.ir`، `soft.lalalorga.ir`، `soft.comanage.ir`، به‌علاوهٔ localhost توسعه و مبدأهای اپ. |
| محدوده | آماده‌سازی سایت + ساخت اپ. |
| انتشار اندروید | اولویت: APK مستقیم از سایت (هنوز حساب توسعه‌دهنده نیست). ساختار باید از روز اول برای کافه‌بازار و مایکت هم آماده باشد. |
| iOS | پروژهٔ iOS ساخته و در مخزن نگه داشته می‌شود؛ ساخت و انتشارش بعداً (مک ندارید). کاربران آیفون تا آن زمان PWA بهترشده را دارند. |
| نام و شناسه | نام نمایشی `CoManage`؛ شناسهٔ بسته `ir.comanage.soft` (برعکسِ `soft.comanage.ir`). **پس از اولین انتشار تغییرناپذیر است.** |
| اعلان پس‌زمینه | در همین طرح؛ FCM برای اندروید و APNs برای iOS، پشت یک لایهٔ مشترک تا بعداً سرویس ایرانی جایگزین شود. |
| ذخیرهٔ آفلاین | همان IndexedDB (Dexie) بدون تغییر + درخواست حافظهٔ ماندگار. هیچ انتقال داده‌ای انجام نمی‌شود. |
| اجراکننده | Antigravity با صف `run_tasks.py`؛ Claude ناظر (طرح، `tasks.md`، بازبینی، release). |
| استقرار روی `soft` | هر گامی که به `soft` برسد (کد، فایل APK، بستهٔ Live Update) فقط با تأیید جداگانهٔ کاربر. |

## ۳. وضع موجود (بررسی ۲۶ مهر)

**فرانت**
- `environment.ts` و `environment.development.ts` فقط `apiUrl: '/api'` نسبی دارند. حدود ۳۵ فایل از `apiUrl` استفاده می‌کنند و ۱۸ فایل مسیر `/api/` یا `/media/` را مستقیم نوشته‌اند (از جمله `communication.service.ts`، `client-telemetry.service.ts`، `layout.ts`، `verify-card.ts`، `count-tracking.ts`، `dispatch.ts`، `customs.ts`، `projects.ts` و سرویس‌های API مالی).
- آدرس WebSocket از `window.location.host` ساخته می‌شود: `core/http/websocket.service.ts:93` و `core/services/communication.service.ts:275`.
- اینترسپتورها: `core/auth/auth.interceptor.ts`، `core/error/error.interceptor.ts`، `core/interceptors/offline.interceptor.ts` (ثبت در `app.config.ts`).
- احراز هویت JWT در `localStorage`/`sessionStorage` (`wh_access_token`)؛ عمر access یک روز و refresh نود روز. داخل WebView بدون تغییر کار می‌کند.
- حدود ۴۰ فایل با `createObjectURL`/`download` فایل می‌سازند؛ ۵ فایل `window.print` دارند (`accountant-payroll`، `employee-attendance`، `employee-fleet`، `manager-reports`، `id-cards`).
- `window.open` در ۶ فایل و `target="_blank"` در ۱۰ قالب.
- `id-cards.ts:499` و `:1583` برای QR از `window.location.origin` استفاده می‌کنند.
- `domain-migration.service.ts` با `canonical_domain` از `/api/public/config/` کاربر را با `window.location.replace` به دامنهٔ اصلی می‌برد، **ولی فقط وقتی صف همگام‌سازی، صف عکس و پیش‌نویس‌ها خالی باشند.**
- `pwa-update.service.ts` مستقیم به `SwUpdate` وصل است (مصرف‌کننده‌ها: `app.ts`، `user-menu.component.ts`).
- `safe-area-inset` فقط در اسکنر بارکد رعایت شده است.
- اسکنر بارکد با `@zxing/browser` و دوربین مرورگر.
- `ng test` (کش runner، HEAD `f51e714`): ۹ فایل spec خطای TypeScript دارند و کنار گذاشته می‌شوند؛ از بقیه ۹۸۲ پاس و ۱۸ شکست قدیمی (`app.spec.ts`، `layout`، `login`، `company-gdrive-tab`، `employee-new-vehicle.dom`، `dashboard`، `dispatch`، `feeding`، `placeholders`، `projects`).

**بک‌اند**
- `config/settings.py`: `CORS_ALLOW_ALL_ORIGINS = True`؛ `ALLOWED_HOSTS` با پیش‌فرض `*` از `DJANGO_ALLOWED_HOSTS`؛ `CSRF_TRUSTED_ORIGINS` از env.
- `PublicConfigViewSet` در `core/settings_core/views.py:104` (کلیدهای `system_version`، `canonical_domain` از `WH_CANONICAL_DOMAIN`، `installed_modules` و …).
- اعلان‌ها: مدل `Notification` در `core/notifications/models.py`؛ ارسال زنده با `group_send` در `core/communications/broadcast.py` و `core/accounts/signals.py`.

## ۴. معماری هدف

### ۴-الف. لایهٔ پلتفرم (فرانت، `src/app/core/platform/`)
| سرویس | وب (رفتار فعلی) | اپ بومی |
|---|---|---|
| `PlatformService` | `isNative = false` | `Capacitor.isNativePlatform()` و نام پلتفرم |
| `ServerOriginService` | origin خالی؛ همه‌چیز نسبی می‌ماند | origin از environment، قابل جایگزینی با `canonical_domain`؛ ذخیره در `localStorage` |
| `FileOutputService` (`saveBlob`، `print`) | همان دانلود و چاپ فعلی | Filesystem + Share؛ چاپ با افزونهٔ چاپ یا PDF + Share |
| `ExternalLinkService` + دایرکتیو `appExternalLink` | `window.open` / `target=_blank` | مرورگر سیستم با افزونهٔ Browser |
| `AppUpdateService` | پوشش `PwaUpdateService` فعلی | Capgo (Live Update) + هشدار/قفل نسخهٔ بومی |
| `PushService` | هیچ (WebSocket فعلی) | FCM / APNs |

### ۴-ب. آدرس سرور و تعویض آسان آن
- یک اینترسپتور تازه (`api-origin.interceptor.ts`) هر URL نسبی که با `/api/` یا `/media/` شروع شود را با `ServerOriginService.origin` کامل می‌کند. روی وب origin خالی است، پس هیچ درخواستی عوض نمی‌شود.
- **این اینترسپتور باید آخرین (درونی‌ترین) اینترسپتور باشد** تا کلید کش `offline.interceptor` و URLهای صف همگام‌سازی نسبی بمانند؛ در غیر این صورت با عوض شدن سرور، کش و صف قدیمی دیگر پیدا نمی‌شوند.
- برای چیزهایی که از HttpClient رد نمی‌شوند: تابع `resolveServerUrl()` و پایپ `serverUrl` (برای `[src]` تصویرها)، `wsUrl(path)` برای WebSocket، و `publicOrigin` برای QR و لینک‌های عمومی.
- **تعویض سرور:**
  1. در هر زمان: یک خط در `environment.mobile.ts` + یک بستهٔ Live Update.
  2. بی‌نیاز به نسخهٔ جدید: مقدار `WH_CANONICAL_DOMAIN` روی سرور فعلی عوض شود. `domain-migration.service` در اپ به‌جای `window.location.replace`، origin ذخیره‌شده را عوض می‌کند؛ **با همان شرط امروز: فقط وقتی هر سه صف خالی باشند.**
- هر درخواست اپ هدر `X-App-Version` و `X-App-Platform` می‌فرستد (برای لاگ و تصمیم سازگاری).

### ۴-ج. نسخه و آپدیت
- نسخهٔ اپ از یک منبع (`version` در `package.json`) در زمان بیلد تزریق می‌شود.
- `/api/public/config/` سه کلید تازه از `SystemSetting` می‌گیرد: `app_min_version`، `app_recommended_version`، `app_download_urls` (برای هر کانال: `direct`، `bazaar`، `myket`).
- **قفل حداقل نسخه:** کار جدید ثبت نمی‌شود و ارسال صف متوقف می‌شود؛ صف و کش دست نمی‌خورند. پس از آپدیت، صف همان‌جا ادامه می‌دهد.
- Live Update با `@capgo/capacitor-updater` در حالت دستی و self-hosted: فایل manifest (`version`، `min_native_version`، `url`، `sha256`) و zip بسته روی سرور خودمان. بستهٔ جدید فقط در شروع سرد بعدی و فقط وقتی ارسال صف در جریان نیست جایگزین می‌شود؛ اگر `notifyAppReady()` صدا زده نشود، Capgo به بستهٔ قبلی برمی‌گردد.
- کانال انتشار (`direct`/`bazaar`/`myket`) با productFlavorهای Gradle در زمان بیلد ثابت می‌شود؛ آپدیت بومی در کانال `direct` لینک APK را باز می‌کند و در کانال‌های استور صفحهٔ همان استور را.

### ۴-د. ثابت‌های تغییرناپذیر (حفظ داده)
- `appId` (`ir.comanage.soft`)، `server.androidScheme` (`https`) و `server.hostname` پس از اولین نصب هرگز عوض نمی‌شوند؛ تغییرشان یعنی IndexedDB و localStorage کاربر دیگر در دسترس نیست. یک نگهبان تازه این سه مقدار را با فایل قفل مقایسه می‌کند.
- schema در `offline-db.ts` فقط با `version(n+1)` افزایشی تغییر می‌کند؛ هیچ `delete`/`clear` در upgrade.
- کلید امضای اندروید (keystore) بیرون از مخزن نگه داشته می‌شود و کاربر از آن پشتیبان جداگانه دارد؛ گم شدنش یعنی امکان آپدیت در استورها از بین می‌رود.

## ۵. گام‌ها

### فاز الف — آماده‌سازی سایت (رفتار وب بدون تغییر)

#### گام الف-۰ — سالم کردن تست‌های فرانت (یک نشست، حدود ۳ ساعت)
- رفع خطای TypeScript در ۹ spec (فیلدهای کهنهٔ مدل، نوع‌های Node) تا هیچ spec کنار گذاشته نشود.
- ۱۸ شکست قدیمی: هر کدام یا با اصلاح خود spec رفع، یا با دلیل در گزارش ثبت می‌شود (کد برنامه برای سبز شدن تست عوض نمی‌شود).
- **چرا اول:** تور ایمنی همهٔ گام‌های بعدی است.
- **راستی‌آزمایی:** `ng-test-compare` بدون خطای نوع و بدون شکست تازه؛ شمار شکست‌ها کمتر از ۱۸.

#### گام الف-۱ — لایهٔ پلتفرم و آدرس سرور (دو نشست، حدود ۶ ساعت)
- `PlatformService`، `ServerOriginService`، `api-origin.interceptor.ts` (آخرین در زنجیره)، `resolveServerUrl()`، پایپ `serverUrl`، `wsUrl()`، `publicOrigin`.
- `serverOrigin: ''` در environmentهای وب.
- جایگزینی `window.location.host` در `websocket.service.ts` و `communication.service.ts`؛ `fetch`/`sendBeacon` در `client-telemetry.service.ts`؛ `[src]`های `/media/` در قالب‌ها.
- بررسی و ثبت اینکه صف `offline-sync` و صف عکس URL نسبی ذخیره می‌کنند.
- **ریسک: متوسط** (مسیر شبکه و کش آفلاین).
- **راستی‌آزمایی:** تست واحد اینترسپتور (origin خالی ← URL بی‌تغییر؛ origin پر ← کامل؛ URL مطلق ← بی‌تغییر)؛ تست ترتیب اینترسپتورها؛ بازبین `data-loss-reviewer`؛ بررسی 4300 که WebSocket و تصویرها مثل قبل کار کنند.

#### گام الف-۲ — سرویس خروجی و چاپ (دو تا سه نشست، حدود ۸ ساعت)
- `FileOutputService.saveBlob(blob, filename)` و `print(...)`؛ پیاده‌سازی وب دقیقاً همان رفتار فعلی.
- مهاجرت مکانیکی حدود ۴۰ فایل دانلود و ۵ فایل چاپ، در دسته‌های ماژولی (مالی، انبار، مشترک). استاندارد خروجی AGENTS §۳ دست نمی‌خورد.
- **راستی‌آزمایی:** نگهبان ۵۶؛ grep اینکه بیرون از سرویس هیچ `createObjectURL`/`.download =`/`window.print` نماند (جز فهرست استثنای مستند)؛ بازبین `ui-reviewer`.

#### گام الف-۳ — لینک‌های بیرونی، QR و انتقال دامنه (یک نشست، حدود ۳ ساعت)
- `ExternalLinkService` و دایرکتیو `appExternalLink`؛ مهاجرت ۶ `window.open` و ۱۰ `target="_blank"`.
- `id-cards.ts:499` و `:1583` ← `publicOrigin`.
- `domain-migration.service`: شاخهٔ بومی که به‌جای ناوبری، origin سرور را (با همان شرط صف خالی) عوض می‌کند. روی وب رفتار عوض نمی‌شود.
- **راستی‌آزمایی:** تست واحد شاخهٔ بومی (صف پر ← تعویض نمی‌شود)؛ بازبین `data-loss-reviewer`.

#### گام الف-۴ — نسخه، آپدیت اجباری و لایهٔ آپدیت (یک تا دو نشست، حدود ۵ ساعت)
- بک‌اند: سه کلید `SystemSetting` و افزودنشان به `PublicConfigViewSet`؛ هدرهای `X-App-Version` و `X-App-Platform` در `CORS_ALLOW_HEADERS`.
- فرانت: تزریق نسخه از `package.json`؛ `AppVersionService` با هشدار و قفل؛ توقف ارسال صف در حالت قفل بدون حذف چیزی؛ رابط `AppUpdateService` با پیاده‌سازی وب که `PwaUpdateService` فعلی را می‌پوشاند.
- روی وب سطح هشدار/قفل فعال نیست (PWA همیشه آخرین نسخه است).
- **راستی‌آزمایی:** تست بک‌اند endpoint؛ تست واحد مقایسهٔ نسخه و «قفل ← صف حذف نمی‌شود»؛ `manage.py check`؛ بازبین `data-loss-reviewer` و `tenant-scope-reviewer`.

#### گام الف-۵ — امنیت CORS و ALLOWED_HOSTS (یک نشست، حدود ۲ ساعت)
- `CORS_ALLOW_ALL_ORIGINS` حذف؛ `CORS_ALLOWED_ORIGINS` از env `DJANGO_CORS_ALLOWED_ORIGINS` با پیش‌فرض: چهار دامنهٔ بند ۲، `http://localhost:4200`، `http://localhost:4300`، `capacitor://localhost`، `https://localhost`.
- پیش‌فرض `ALLOWED_HOSTS` از `*` به چهار دامنه + `localhost` + `127.0.0.1`. **پیش از release روی `soft`، Claude متغیرهای env آن سرور را (با تأیید کاربر) بررسی می‌کند تا سرور از دسترس خارج نشود.**
- **راستی‌آزمایی:** تست بک‌اند: مبدأ مجاز ← هدر CORS دارد، مبدأ غیرمجاز ← ندارد؛ بررسی 200 روی `app.farsalish.ir` پس از release.

#### گام الف-۶ — حاشیهٔ امن و بهبود PWA آیفون (یک نشست، حدود ۳ ساعت)
- `viewport-fit=cover` در `index.html`؛ `env(safe-area-inset-*)` برای سرصفحه، نوار پایین، مودال‌ها و فرمان‌گاه چسبان.
- متاتگ‌ها و آیکون‌های `apple-touch-icon` و `apple-mobile-web-app-*`؛ راهنمای کوتاه فارسی نصب روی آیفون.
- **راستی‌آزمایی:** بازبین `ui-reviewer`؛ بررسی 4300 در اندازهٔ موبایل.

### فاز ب — ساخت اپ

#### گام ب-۱ — راه‌اندازی Capacitor و پروژهٔ اندروید (یک نشست، حدود ۴ ساعت + نصب ابزار)
- نصب JDK و Android SDK (command-line tools) روی این ماشین؛ کاری روی مخزن نیست.
- `@capacitor/core`، `cli`، `android`، `ios`؛ `capacitor.config.ts` با `appId: 'ir.comanage.soft'`، `appName: 'CoManage'`، `server.androidScheme: 'https'`، `server.hostname` ثابت.
- پیکربندی‌های بیلد `mobile` و `mobile-test` (serverOrigin به ترتیب `https://soft.farsalish.ir` و `https://app.farsalish.ir`، Service Worker خاموش)؛ اسکریپت‌های `npm run build:mobile`.
- پوشه‌های `android/` و `ios/` در مخزن؛ keystore بیرون از مخزن (`.gitignore`).
- نگهبان تازه برای ثابت‌های بند ۴-د.
- `navigator.storage.persist()` هنگام شروع.
- **راستی‌آزمایی:** ساخت APK دیباگ؛ نصب روی شبیه‌ساز و باز شدن صفحهٔ ورود و پاسخ `/api/public/config/` از `app.farsalish.ir`. **ورود و صفحه‌های پشت آن را کاربر روی گوشی آزمایش می‌کند.**

#### گام ب-۲ — افزونه‌های بومی (دو نشست، حدود ۶ ساعت)
- پیاده‌سازی بومی `FileOutputService` (Filesystem + Share، و چاپ)، `ExternalLinkService` (Browser).
- بارکد: `@capacitor-mlkit/barcode-scanning` با مدل همراه (بدون نیاز به Google Play Services)؛ `@zxing` به‌عنوان جایگزین می‌ماند.
- دکمهٔ «بازگشت» اندروید ← بازگشت مسیریاب یا بستن مودال؛ StatusBar و SplashScreen؛ مجوزهای دوربین و فایل با متن فارسی.
- **راستی‌آزمایی:** بازبین `ui-reviewer`؛ APK آزمایشی؛ فهرست آزمون دستی برای کاربر (اسکن، خروجی اکسل، چاپ، عکس).

#### گام ب-۳ — Live Update و آپدیت بومی (دو نشست، حدود ۶ ساعت)
- `@capgo/capacitor-updater` در حالت دستی؛ اسکریپت ساخت بسته (zip + `sha256` + manifest)؛ محل میزبانی روی سرور خودمان (مثلاً `/mobile/updates/`).
- منطق: بررسی در شروع، دانلود در پس‌زمینه، جایگزینی در شروع سرد بعدی، عدم جایگزینی وسط ارسال صف، `min_native_version`، `notifyAppReady()` و برگشت خودکار.
- آپدیت بومی بر اساس کانال (`direct` ← لینک APK؛ `bazaar`/`myket` ← صفحهٔ استور) با productFlavorهای Gradle.
- **راستی‌آزمایی:** آزمون روی شبیه‌ساز: بستهٔ سالم جایگزین می‌شود؛ بستهٔ خراب به قبلی برمی‌گردد؛ صف آفلاین پیش و پس از آپدیت یکسان است؛ بازبین `data-loss-reviewer`.

#### گام ب-۴ — اعلان پس‌زمینه (دو نشست، حدود ۶ ساعت)
- بک‌اند: مدل `DeviceToken` (کاربر، توکن، پلتفرم، زمان ثبت و آخرین دیدن) با مایگریشن تازه (مهارت `safe-migration`)؛ endpoint ثبت و حذف توکن؛ رابط `PushProvider` با پیاده‌سازی FCM (`firebase-admin`)؛ ارسال هم‌زمان با ساخت `Notification`. کلید سرویس Firebase فقط در env، نه git.
- فرانت: `@capacitor/push-notifications`؛ ثبت توکن پس از ورود و حذف آن هنگام خروج؛ باز شدن صفحهٔ مربوط با لمس اعلان.
- WebSocket فعلی وقتی اپ باز است همچنان منبع اصلی است (FCM در ایران گاهی ناپایدار است).
- **راستی‌آزمایی:** تست بک‌اند (هر کاربر فقط توکن خودش را ثبت/حذف می‌کند؛ اعلان فقط به دستگاه‌های گیرنده)؛ بازبین `tenant-scope-reviewer` و `data-loss-reviewer` (مایگریشن)؛ آزمون اعلان روی گوشی واقعی توسط کاربر.

#### گام ب-۵ — انتشار و صفحهٔ دانلود (یک نشست، حدود ۳ ساعت)
- بیلد APK امضاشدهٔ کانال `direct`؛ سیاست `versionCode`/`versionName` از همان نسخهٔ `package.json`.
- صفحهٔ «دانلود اپ» در سایت (فقط اندروید؛ برای آیفون راهنمای PWA).
- چک‌لیست انتشار: نسخهٔ بومی جدید، بستهٔ Live Update، به‌روزرسانی سه کلید نسخه.
- میزبانی APK و بسته‌ها روی `soft` **فقط با تأیید کاربر**.
- **راستی‌آزمایی:** نصب APK امضاشده روی گوشی و آپدیت روی نسخهٔ قبلی بدون از دست رفتن صف (کاربر).

#### گام ب-۶ — پروژهٔ iOS آماده (یک نشست، حدود ۲ ساعت)
- همگام بودن `ios/` با افزونه‌ها؛ مجوزهای `Info.plist` با متن فارسی؛ جای APNs در `PushProvider`.
- راهنمای ساخت بعدی با Codemagic یا مک (در همین طرح، بخش ۸).
- **راستی‌آزمایی:** `npx cap sync ios` بدون خطا (ساخت واقعی بعداً).

## ۶. جمع زمان و ترتیب

| فاز | گام‌ها | زمان تقریبی |
|---|---|---|
| الف | ۰ ← ۱ ← (۲، ۳ و ۵ مستقل) ← ۴ ← ۶ | حدود ۳۰ ساعت، ۹ تا ۱۱ نشست |
| ب | ۱ ← ۲ ← ۳ ← ۴ ← ۵ ← ۶ | حدود ۲۷ ساعت، ۹ نشست |

فاز الف به‌تنهایی روی وب قابل release است و هیچ رفتاری را برای کاربر وب عوض نمی‌کند.

## ۷. قواعد هر گام

- **Antigravity (هر نشست صف):** فقط کار همان نشست؛ پایبند به `.agents/AGENTS.md` §۳، §۵ و §۱۰؛ فقط فایل‌های خودش را stage و با پیام داده‌شده کامیت می‌کند؛ push نمی‌کند؛ یادداشت کوتاه در «گزارش پیشرفت».
- **runner:** `require` تمیزی درخت کاری؛ `verify` بررسی‌های هر گام؛ فقط با سبز بودن همه `[DONE]`.
- **Claude (ناظر):** بازبین‌های مرتبط روی diff هر گام؛ بررسی 4300؛ release روی `app` (بی‌پرسش) و بررسی 200 برای `/` و `/api/public/config/`؛ هر کار روی `soft` فقط با تأیید صریح کاربر.
- **قانون سازگاری API (دائمی، از گام الف-۴):** هیچ فیلد یا endpointی بدون الگوی expand-contract حذف یا تغییر نام نمی‌دهد، چون نسخه‌های قدیمی اپ مدتی در دست کاربران می‌مانند. تغییر ناسازگار فقط همراه با بالا بردن `app_min_version`.

## ۸. کارهایی که فقط کاربر می‌تواند انجام دهد

- نگهداری پشتیبان keystore امضای اندروید (پس از گام ب-۱، فایل و رمزش به کاربر تحویل می‌شود).
- ساخت پروژهٔ Firebase با حساب گوگل و دادن فایل کلید سرویس (پیش از گام ب-۴). دسترسی به کنسول Firebase از ایران ممکن است نیاز به ابزار عبور از تحریم داشته باشد.
- ورود و آزمون صفحه‌های پشت ورود روی گوشی واقعی.
- بعداً: حساب کافه‌بازار/مایکت، حساب Apple Developer یا Codemagic، و DNS و TLS برای `soft.comanage.ir` اگر قرار است سرور اپ شود.

## ۹. پرسش‌های باز

- هیچ (همهٔ تصمیم‌های لازم در بند ۲ ثبت شد). پرسش‌های تازهٔ هر گام پیش از نوشتن `tasks.md` همان گام از کاربر پرسیده می‌شود.

## گزارش پیشرفت

- ۲۶ مهر ۱۴۰۵: طرح نوشته شد؛ در انتظار تأیید تایپی کاربر. اقدام بعدی پس از تأیید: چت بازبینی طرح با Antigravity، سپس `tasks.md` گام الف-۰.

</div>
