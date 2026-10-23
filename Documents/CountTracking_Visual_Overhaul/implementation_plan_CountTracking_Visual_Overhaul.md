<div dir="rtl" align="right">

# طرح جامع بازطراحی و رفع تمامی ایرادات ظاهری تب «پیگیری وضعیت شمارش» (Count Tracking Visual Overhaul)

این طرح بر اساس کاوش عمیق رابط کاربری، کد منبع فرانت‌اند (`count-tracking.html`, `count-tracking.ts`, `count-tracking.css`) و کامپوننت پایه جدول (`data-table`) تدوین شده است تا کلیه ناهماهنگی‌های بصری، دکمه‌های تکراری، کنتراست‌های ضعیف، عدم توازن ارتفاع سطرها، آیکون‌های ناهمگون و ایرادات ریسپانسیو را در ۶ فاز تفکیک‌شده به همراه مکانیزم ارزیابی مستقل ایجنت نگهبان (Guardian Verification) برطرف نماید.

---

## بررسی و مرور معماری و تصمیمات (Architecture & Design Decisions)

> [!IMPORTANT]
> **۱. حذف دکمه تکراری بروزرسانی:** دکمه دوم در انتهای ردیف که از فونت‌آیکون منسوخ و استایل دایره‌ای استفاده می‌کرد حذف شده و دکمه اصلی در کنار عنوان با انیمیشن اسپینر استاندارد و استایل مدرن باقی می‌ماند.
> 
> **۲. تعاملی‌سازی کامل هر ۶ کارت شاخص:** کارت‌های «شمرده شده» و «تأیید نهایی» نیز به فیلترهای سریع کلیک‌پذیر تبدیل می‌شوند تا رفتار تمام کارت‌ها یکدست شود.
> 
> **۳. هم‌ارتفاع‌سازی و پاکسازی ستون وضعیت:** متن تکراری نام مدیر از ستون وضعیت حذف می‌شود و تمام وضعیت‌ها به شکل برچسب‌های یک‌خطی با ارتفاع یکسان رندر می‌شوند تا پرش ارتفاع سطرها از بین برود.
> 
> **۴. استانداردسازی تمام آیکون‌ها به وکتور SVG:** تمام فونت‌آیکون‌های متفرقه (Feather) با SVG‌های تمیز، خط‌کشی استاندارد و یکپارچه جایگزین می‌شوند.
> 
> **۵. ارزیابی ایجنت نگهبان (Guardian Agent) در پایان هر فاز:** پس از اجرای هر فاز، اسکریپت بازرسی مستقل کامپایل، تست و یکپارچگی کد را بررسی می‌کند و در صورت کوچک‌ترین عدم تطابق، فاز بازنگری خواهد شد.

---

## فازبندی اجرایی پروژه (Implementation Phases)

| فاز | عنوان فاز | فایل‌های هدف | خروجی کلیدی |
|---|---|---|---|
| **فاز ۱** | اصلاح هدر و پاکسازی نوار کنترل بالا | `count-tracking.html`, `count-tracking.ts` | حذف دکمه تکراری، استانداردسازی دکمه‌ها، اصلاح فاصله‌ها |
| **فاز ۲** | تعاملی‌سازی و بهینه‌سازی کارت‌های شاخص | `count-tracking.html`, `count-tracking.ts` | تبدیل ۶ کارت به فیلترهای فعال، اصلاح رنگ فعال، بهبود فونت |
| **فاز ۳** | اصلاح نوار اکشن جدول و یکدست‌سازی SVG | `count-tracking.html`, `count-tracking.ts` | رفع پرش چیدمان، هوشمندسازی دکمه تأیید گروهی، وکتورهای SVG |
| **فاز ۴** | اصلاح ستون‌ها، کنتراست رنگی و تراز سطرها | `count-tracking.html`, `count-tracking.ts`, `count-tracking.css` | رفع کوتاهی شرح کالا، بهبود کنتراست زرد، تراز ارتفاع، نشانگر یادداشت |
| **فاز ۵** | بهینه‌سازی مدال خروجی اکسل و ریسپانسیو | `count-tracking.html`, `count-tracking.css` | اصلاح چیدمان مدال اکسل، بهبود نمایش تبلت و موبایل |
| **فاز ۶** | ارزیابی نهایی ایجنت نگهبان و تست مرورگر | تمام فایل‌ها + `scripts/e2e/guardian_count_tracking.py` | گزارش عملکرد نگهبان و بررسی زنده مرورگر |

---

## جزئیات تغییرات پیشنهادی به تفکیک فایل‌ها (Proposed Changes)

### فاز ۱: اصلاح هدر و پاکسازی نوار کنترل بالا (Header Refactor)

#### [MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- حذف دکمه تکراری بروزرسانی در خطوط ۵۴ تا ۵۸ (`<button (click)="loadTasks()" class="btn-icon">...`).
- هماهنگ‌سازی دکمه بروزرسانی اصلی، سلکتور انبار، دکمه مخفی‌سازی پایان‌یافته و دکمه خروجی اکسل در یک گروه افقی مرتب با `flex-wrap` و کلاس‌های Tailwind یکدست (`rounded-xl`, `border-slate-200`, `shadow-sm`).
- تنظیم ظاهر دکمه «مخفی/نمایش پایان‌یافته» با آیکون چشم باز و بسته یکدست.

#### [MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- پاکسازی متدهای بلااستفاده و هماهنگی استیت دکمه‌های هدر.

---

### فاز ۲: تعاملی‌سازی و بهینه‌سازی کارت‌های شاخص (Mini-Dashboard & KPI Cards)

#### [MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- تبدیل کارت‌های «شمرده شده» و «تأیید نهایی» از تگ `<div>` به `<button type="button">` با رویداد کلیک.
- اعمال افکت‌های hover، cursor-pointer، و رینگ نورانی وضعیت فعال برای همه ۶ کارت.
- تغییر رنگ پس‌زمینه کارت «کل اقلام» در حالت فعال از مشکی به رنگ نیلی ملایم و هماهنگ (`bg-slate-700` یا `bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/30`).
- افزایش سایز فونت برچسب‌ها به `text-[11px]` و مقادیر به `text-sm font-black`.

#### [MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- اضافه کردن متدها و استیت‌های فیلتر سریع برای «شمرده شده» (`counted`) و «تأیید نهایی» (`approved`) به متد `applyFilters()`.

---

### فاز ۳: اصلاح نوار اکشن جدول و یکدست‌سازی SVG (Table Action Bar & SVG Normalization)

#### [MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- جایگزینی تمامی فونت‌آیکون‌های فدر (`feather-trash-2`, `feather-x-circle`) با SVGهای تمیز و بهینه‌شده.
- هوشمندسازی دکمه «تأیید گروهی بدون مغایرت»:
  - نمایش شمارنده تعداد رکوردهای واجد شرایط سبز به صورت بچ (`تأیید گروهی بدون مغایرت ({{ eligibleGreenTasksCount }})`).
  - غیرفعال شدن بصری و عملکردی دکمه (`disabled` و `opacity-50 cursor-not-allowed`) در صورت صفر بودن تعداد رکوردهای واجد شرایط.
- جلوگیری از پرش و تغییر ناگهانی چیدمان هنگام ظاهر شدن دکمه «لغو تخصیص».

#### [MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- اضافه کردن `get eligibleGreenTasksCount(): number` برای محاسبه لحظه‌ای رکوردهای سبز در انتظار تأیید مدیر.

---

### فاز ۴: اصلاح ستون‌ها، کنتراست رنگی و تراز سطرها (Table Columns & Rows)

#### [MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- ستون **شرح کالا**: حذف `max-w-[200px]` هاردکد شده و استفاده از کلاس‌های منعطف با فضای متناسب.
- ستون **وضعیت فعلی**: حذف تکرار نام مدیر و مدت زمان برای `FINAL_APPROVED`؛ نمایش یک برچسب تمیز و یکدست هم‌ارتفاع با سایر وضعیت‌ها.
- ستون **تعداد شمارش**: جایگزینی رنگ زرد کم‌کنتراست با `text-amber-600` یا بچ دارای پس‌زمینه برای خوانایی بی‌نقص در صفحه سفید.
- ستون **مغایرت**: هماهنگ‌سازی پالت رنگی با ستون تعداد شمارش.
- ستون‌های **انبارگردان / سرپرست / مدیریت**: یکدست‌سازی وضعیت مقادیر خالی با برچسب طوسی مشخص (`ندارد` / `-`) و افزودن آیکون کوچک یادداشت در کنار نام افراد دارای نوت.
- ستون **عملیات**: تنظیم عنوان ستون به `عملیات` و قرار دادن خط تیره `-` برای سطرهای فاقد دکمه لغو.

#### [MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- بهینه‌سازی توابع `getBalanceColorClass` و `getStatusClass`.

#### [MODIFY] [count-tracking.css](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.css)
- افزودن استایل‌های انیمیشن، ترنزیشن‌های نرم و افکت‌های بصری جدول.

---

### فاز ۵: بهینه‌سازی مدال خروجی اکسل و ریسپانسیو (Export Modal & Responsive)

#### [MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- هماهنگ‌سازی استایل چیپ‌های انتخاب ستون و رادیو‌باکس‌ها با کلاس‌های مدرن و شکیل.
- بهبود پدینگ و فاصله گزینه‌های انتخاب دستی ستون‌ها.
- بهینه‌سازی چیدمان کارت‌های بالای صفحه و کنترل‌های فیلتر در عرض‌های تبلت و موبایل.

---

### فاز ۶: ارزیابی مستقل ایجنت نگهبان و تست مرورگر (Guardian Verification & Browser E2E)

#### [NEW] [guardian_count_tracking.py](file:///e:/warehouse%20project/scripts/e2e/guardian_count_tracking.py)
- اسکریپت ارزیابی خودکار و مستقل نگهبان برای بررسی صحت بیلد فرانت‌اند، یکپارچگی فایل‌های HTML/TS، عدم وجود آیکون‌های شکسته فدر، عدم وجود دکمه تکراری بروزرسانی و اعتبارسنجی منطق فیلترها.
- اجرای تست‌های زنده مرورگر در رزولوشن‌های دسکتاپ، تبلت و موبایل و تهیه گزارش وضعیت تمام موارد.

---

## طرح اعتبارسنجی و تأیید (Verification Plan)

### ۱. تست خودکار بیلد و ایجنت نگهبان (Automated Guardian Tests)
- اجرای `npm run build` در پوشه `frontend` برای تضمین عدم وجود خطای کامپایل و تایپ‌اسکریپت.
- اجرای اسکریپت ارزیابی نگهبان `python scripts/e2e/guardian_count_tracking.py`.

### ۲. بررسی زنده در مرورگر (Browser Visual Inspection)
- باز کردن تب پیگیری وضعیت شمارش در مرورگر (`http://localhost:4200/count-tracking`).
- بررسی عدم وجود دکمه تکراری و عملکرد صحیح دکمه بروزرسانی با اسپینر.
- تست کلیک روی تک‌تک ۶ کارت شاخص و بررسی اعمال صحیح فیلترها و رنگ فعال آن‌ها.
- بررسی دکمه تأیید گروهی بدون مغایرت (نمایش تعداد و وضعیت disabled).
- بررسی تراز ارتفاع سطرها، فونت‌ها و رنگ‌های کنتراست بالای مغایرت‌ها.
- باز کردن مدال خروجی اکسل و اطمینان از زیبایی و صحت دانلود.
- تست ریسپانسیو در عرض‌های ۱۹۲۰، ۱۳۶۶، ۷۶۸ و ۳۷۵ پیکسل.

</div>
