<div dir="rtl" align="right">

# طرح جامع فازبندی‌شده هماهنگ‌سازی رابط‌کاربری کارتابل‌های مالی و انبارگردان

این سند، برنامه اجرایی فازبندی‌شده، گام‌به‌گام و دقیق برای پیاده‌سازی همسان‌سازی ظاهری و رفتاری بین [کارتابل انبارگردان](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html) و [کارتابل مالی](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html) را تشریح می‌کند.

> [!IMPORTANT]
> **قانون عبور از فازها:** هیچ فازی بدون تکمیل، تست و اعتبارسنجی کامل فاز قبلی آغاز نخواهد شد.

---

## 🗺️ ماتریس فازبندی و تفکیک وظایف

| فاز | عنوان فاز | ماژول هدف | خروجی کلیدی | گیت اعتبارسنجی (Check Point) |
| :--- | :--- | :--- | :--- | :--- |
| **فاز ۱** | **ابعاد و فیلترهای انبارگردان** | `Counter Dashboard` | عرض `max-w-7xl`، عنوان «ارسال شده»، فیلتر پیش‌فرض `pending` | کامپایل صحیح و تست بصری ریسپانسیو کانتینر |
| **فاز ۲** | **تعاملات استخر و اکسل انبارگردان** | `Counter Dashboard` | نوار «انتخاب همه استخر» و دانلود قالب نمونه اکسل | تست انتخاب گروهی استخر و دانلود قالب اکسل |
| **فاز ۳** | **اکشن‌ها و فرم جزئیات مالی** | `Customs Cartable` | دکمه سبز اکشن‌بار، دکمه بازگشت در فرم، لوکیشن قدیم/جدید، تایم‌لاین | تست دکمه بازگشت در فرم مالی و رنگ دکمه اکشن‌بار |
| **فاز ۴** | **تست نهایی بیلد و مستندسازی** | کل پروژه فرانت‌اند | بیلد بدون خطای انگولار و ثبت Walkthrough | اجرای موفق دستور بیلد و راستی‌آزمایی جامع |

---

## 🛠️ جزئیات گام‌به‌گام هر فاز

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     جریان اجرای فازها                                           │
│  [فاز ۱: ابعاد و فیلترها] ──► [بررسی و تایید ۱] ──► [فاز ۲: استخر و اکسل] ──► [بررسی و تایید ۲]  │
│  ──► [فاز ۳: اکشن‌ها و فرم مالی] ──► [بررسی و تایید ۳] ──► [فاز ۴: بیلد نهایی و مستندسازی]      │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 🔹 فاز ۱: اصلاح ابعاد، عناوین و فیلترهای کارتابل انبارگردان (`Counter Core UI & Filters`)
1. **ارتقای عرض کانتینر اصلی و فوتر:**
   - تغییر کلاس کانتینر در [counter-dashboard.html: L1](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L1) از `max-w-2xl` به `max-w-7xl mx-auto`.
   - اعمال کانتینر هماهنگ `max-w-7xl mx-auto w-full` در فوتر ثابت فرم جزئیات در [counter-dashboard.html: L783-835](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L783-L835).
2. **تغییر برچسب‌ها از «شمرده شده» به «ارسال شده»:**
   - تغییر عنوان کارت دوم در [counter-dashboard.html: L67](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L67).
   - تغییر متن چیپ وضعیت در [counter-dashboard.html: L202](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L202).
3. **تنظیم فیلتر پیش‌فرض:**
   - تغییر مقدار اولیه `statusFilter` در [counter-dashboard.ts: L68](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts#L68) به `'pending'`.
4. **گیت اعتبارسنجی فاز ۱:**
   - بررسی عدم شکستگی المان‌ها در عرض عریض دسکتاپ و نمایش پیش‌فرض تب در انتظار.

---

### 🔹 فاز ۲: قابلیت‌های تعاملی جدید در کارتابل انبارگردان (`Counter Pool & Export Interactions`)
1. **نوار انتخاب همگانی استخر کالاها:**
   - افزودن نوار هوشمند با چک‌باکس و شمارنده اقلام در [counter-dashboard.html: L503-550](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L503-L550).
   - افزودن توابع `isAllPoolSelected()`, `isPoolIndeterminate()`, `toggleSelectAllPool()` در [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts).
2. **بخش دانلود قالب اکسل نمونه:**
   - افزودن کارت دانلود قالب نمونه اکسل در مودال خروجی در [counter-dashboard.html: L839-908](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L839-L908).
   - پیاده‌سازی متد `downloadSampleTemplate()` با ستون‌های استاندارد در [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts).
3. **گیت اعتبارسنجی فاز ۲:**
   - تست عملکرد انتخاب تمام اقلام استخر با یک کلیک و تست دانلود قالب نمونه اکسل.

---

### 🔹 فاز ۳: اصلاحات اکشن‌ها، فرم جزئیات و تایم‌لاین کارتابل مالی (`Customs Cartable Actions & Details`)
1. **یکدست‌سازی دکمه اکشن‌بار:**
   - تغییر رنگ دکمه ارسال به سرپرست در [customs.html: L112-119](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html#L112-L119) به `bg-emerald-600 hover:bg-emerald-500` و یکسان‌سازی آیکون با انبارگردان.
2. **دکمه بازگشت به وضعیت قبل در فرم جزئیات مالی:**
   - افزودن دکمه رز روشن `بازگشت به وضعیت قبل` در فوتر فرم جزئیات در [customs.html: L835-867](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html#L835-L867) متصل به متد موجود `revertTaskStatus`.
3. **اصلاح نمایش لوکیشن قدیم/جدید:**
   - اصلاح بررسی لوکیشن در [customs.html: L480](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html#L480) به `task.item_details?.new_location || task.item_details?.old_location`.
4. **بهبود بصری تایم‌لاین سوابق مالی:**
   - افزودن نشانگرهای آیکون و رنگ‌بندی تفکیک‌شده تایید/رد در [customs.html: L813-830](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html#L813-L830).
5. **گیت اعتبارسنجی فاز ۳:**
   - تست کلیک روی دکمه بازگشت درون فرم مالی و بررسی رنگ سبز دکمه بالای صفحه.

---

### 🔹 فاز ۴: راستی‌آزمایی جامع بیلد و مستندسازی نهایی (`Final Build & Dual-Save Documentation`)
1. اجرای دستور بیلد پروژه یا اعتبارسنجی کامل تایپ‌ها با تایپ‌اسکریپت و انگولار.
2. تکمیل و ثبت گزارش نهایی تغییرات در فایل `walkthrough.md` طبق استاندارد DUAL-SAVE.

---

## 🧪 چک‌لیست تأیید هر فاز قبل از ورود به فاز بعدی

- [ ] فاز ۱ کامپایل شد، خطا نداشت و عرض صفحه تست شد؟ ⬅️ **مجوز شروع فاز ۲**
- [ ] فاز ۲ قابلیت انتخاب استخر و اکسل کار کرد؟ ⬅️ **مجوز شروع فاز ۳**
- [ ] فاز ۳ دکمه بازگشت و اکشن‌بار مالی تست شد؟ ⬅️ **مجوز شروع فاز ۴**
- [ ] فاز ۴ بیلد نهایی پروژه کاملاً سبز است؟ ⬅️ **پایان موفق وظیفه**

</div>
