# طرح جامع پیاده‌سازی تصاویر چندگانه کالا، عکاسی دوربین و گالری، با تضمین ۱۰۰٪ سرعت و شفافیت کیفیت

<div dir="rtl" align="right">

این طرح فنی و مهندسی، معماری کامل، دقیق و چندلایه‌ای برای افزودن قابلیت **چند تصویری کالاها (Item Multi-Image System)** با پشتیبانی از **عکس‌برداری مستقیم با دوربین** و **انتخاب دسته‌ای از گالری و فایل‌ها** ارائه می‌دهد. این طرح تضمین می‌کند که سرعت باز شدن صفحات و بارگذاری جداول بدون کمترین افت باقی مانده، پهنای باند شبکه بهینه‌سازی شده و شفافیت تصاویر و خوانایی متون روی کالاها بدون افت کیفیت محسوس حفظ شود.

---

## 🎯 اهداف و اصول کلیدی معماری (Core Principles)

1. **لودینگ بدون تأخیر (Zero Performance Impact):** جداول اصلی کالاها، کارتابل شمارشگر، سرپرست و مدیر هرگز داده‌های سنگین تصاویر را در کوئری اولیه لود نخواهند کرد. تنها یک عدد شمارنده تصاویر (مانند 📷 ۳) یا یک تصویر بندانگشتی فوق‌سبک (زیر ۱۵ کیلوبایت) ارسال می‌شود.
2. **ورودی دوگانه عکاسی و گالری (Dual-Input Capture):**
   - **دوربین مستقیم (Native Device Camera):** باز شدن بلادرنگ دوربین پشت گوشی یا تبلت انبارگردان با مشخصه `capture="environment"`.
   - **انتخاب از گالری و فایل (Gallery & Drag-Drop):** انتخاب چندگانه فایل‌ها از حافظه، گالری یا کشیدن و رها کردن در دسکتاپ.
3. **فشرده‌سازی بدون افت کیفیت محسوس (High-Fidelity Dual-Stage Compression):**
   - **مرحله ۱ (سمت کلاینت / فرانت‌اند):** تغییر مقیاس هوشمند عکس‌های سنگین (۱۰ تا ۱۵ مگابایتی) به حداکثر عرض `1920px` با الگوریتم نمونه‌برداری چندگانه و فشرده‌سازی با کیفیت ۸۸٪ در مرورگر (کاهش حجم به ~۳۰۰ کیلوبایت قبل از ارسال).
   - **مرحله ۲ (سمت سرور / بک‌اند با Pillow):** انکود به فرمت مدرن **WebP** و ساخت ۳ سطح تصویر: نسخه وضوح‌بالا (Full HD)، نسخه متوسط گالری (Medium 600px)، و نسخه بندانگشتی (Thumbnail 120px).
4. **بارگذاری تنبل و بر اساس تقاضا (Lazy Loading & On-Demand Modal):** تصاویر فول‌کیفیت تنها در زمان کلیک کاربر روی ردیف یا باز شدن دیالوگ گالری واکشی می‌شوند.
5. **پشتیبانی از حالت آفلاین انبار (Offline-First Resilience):** تصاویر ثبت شده توسط انبارگردان در صورت قطعی شبکه ابتدا در `IndexedDB` محلی ذخیره شده و در پس‌زمینه با سرور همگام‌سازی می‌گردند.

---

## 🏗️ معماری پایگاه داده و بک‌اند (Backend Architecture - Django)

### ۱. بازطراحی و ارتقای مدل `ItemPhoto` در `inventory/models.py`
مدل تصاویر کالا با ارث‌بری از `SyncModelMixin` برای پشتیبانی کامل از همگام‌سازی و حذف نرم تجهیز می‌شود:

```python
# inventory/models.py
import uuid
from django.db import models
from django.conf import settings
from common.sync_models import SyncModelMixin
from .models import Item

class ItemPhoto(SyncModelMixin):
    item = models.ForeignKey(
        Item, 
        on_delete=models.CASCADE, 
        related_name='photos', 
        verbose_name="کالا"
    )
    # تصاویر در ۳ سطح بهینه‌شده
    image = models.ImageField(upload_to='item_photos/originals/%Y/%m/', verbose_name="تصویر اصلی (WebP)")
    medium = models.ImageField(upload_to='item_photos/medium/%Y/%m/', null=True, blank=True, verbose_name="تصویر متوسط")
    thumbnail = models.ImageField(upload_to='item_photos/thumbnails/%Y/%m/', null=True, blank=True, verbose_name="بندانگشتی")
    
    # مشخصات و متادیتا
    caption = models.CharField(max_length=255, blank=True, null=True, verbose_name="توضیح عکس")
    is_primary = models.BooleanField(default=False, verbose_name="تصویر شاخص")
    display_order = models.PositiveIntegerField(default=0, verbose_name="ترتیب نمایش")
    file_size = models.PositiveIntegerField(default=0, verbose_name="حجم فایل (بایت)")
    width = models.PositiveIntegerField(default=0, verbose_name="عرض")
    height = models.PositiveIntegerField(default=0, verbose_name="ارتفاع")
    
    # منبع ثبت (دوربین یا گالری)
    source_type = models.CharField(
        max_length=20, 
        choices=[('camera', 'دوربین انبار'), ('gallery', 'گالری / فایل')], 
        default='gallery',
        verbose_name="منبع تصویر"
    )
    
    # ارتباط با فرآیند شمارش (در صورت ثبت حین انبارگردانی)
    count_task = models.ForeignKey(
        'CountTask', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='task_photos', 
        verbose_name="تسک شمارش مرتبط"
    )

    # ردپا و زمان‌بندی
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ ویرایش")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='created_item_photos', 
        verbose_name="ثبت‌کننده"
    )
    modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='modified_item_photos', 
        verbose_name="ویرایش‌کننده"
    )

    class Meta:
        ordering = ['display_order', '-is_primary', '-created_at']
        verbose_name = "عکس کالا"
        verbose_name_plural = "عکس‌های کالا"
        base_manager_name = 'all_objects'
```

### ۲. ماژول پردازش تصاویر و تولید WebP (`inventory/utils/image_processor.py`)
سرویسی اختصاصی برای پردازش فشرده‌سازی Lossy/Lossless، اصلاح چرخش تصویر بر اساس متادیتای EXIF دوربین گوشی‌ها، و تولید خودکار بندانگشتی‌ها:

* **تصحیح خودکار چرخش (Auto EXIF Orientation):** برای رفع مشکل برعکس شدن عکس‌های گرفته شده با دوربین موبایل.
* **فشرده‌سازی WebP با پارامتر کیفیت Q=85 و Method=6:** بهترین توازن بین شفافیت متن و حداقل بایت.
* **تولید خودکار ۳ نسخه:**
  1. `Original`: حداکثر 1920x1920 با حفظ Aspect Ratio.
  2. `Medium`: حداکثر 600x600 برای گالری سریع.
  3. `Thumbnail`: حداکثر 120x120 برای سطر جدول.

### ۳. بهینه‌سازی کوئری‌های لیست کالا (`inventory/serializers.py` & `views.py`)
* در `ItemSerializer` و `CountTaskSerializer`:
  - اضافه کردن فیلد `photos_count = serializers.IntegerField(read_only=True)`.
  - اضافه کردن فیلد `primary_thumbnail = serializers.CharField(read_only=True)`.
  - کوئری‌های جدول با `annotate(photos_count=Count('photos', filter=Q(photos__is_deleted=False)))` اجرا می‌شوند که بار پردازش دیتابیس را در حد یک عدد صحیح سبک نگه می‌دارد (Zero N+1 Query Problem).
* اندپوینت‌های اختصاصی مدیریت تصاویر:
  - `POST /api/inventory/items/{id}/photos/`: آپلود تک یا چندگانه تصویر با مشخص کردن منبع (`camera`/`gallery`).
  - `GET /api/inventory/items/{id}/photos/`: دریافت لیست کامل تصاویر با رزولوشن اصلی و متادیتا هنگام باز شدن گالری.
  - `DELETE /api/inventory/photos/{photo_id}/`: حذف تصویر (حذف نرم و امن).
  - `PATCH /api/inventory/photos/{photo_id}/set_primary/`: تعیین تصویر به عنوان عکس شاخص.
  - `PATCH /api/inventory/photos/reorder/`: تغییر ترتیب نمایش عکس‌ها.

---

## 🎨 معماری و پیاده‌سازی رابط کاربری (Frontend Architecture - Angular)

### ۱. سرویس بهینه‌سازی کلاینت (`image-compression.service.ts`)
* فشرده‌سازی فوق‌سریع در مرورگر کاربر قبل از ارسال به شبکه با استفاده از Canvas و Web Worker.
* عدم فریز شدن UI در هنگام انتخاب ده‌ها عکس همزمان.
* تولید پیش‌نمایش فوری (Instant Local Preview) با `URL.createObjectURL` بدون معطلی برای پاسخ سرور.

### ۲. کامپوننت ماژولار دیالوگ گالری و آپلودر (`item-photo-gallery-dialog`)
این کامپوننت مدرن دارای بخش‌های زیر خواهد بود:
* **نوار ابزار ورودی دوگانه (Dual Action Trigger):**
  - 📸 **دکمه عکاسی با دوربین (Take Photo):** متصل به `<input type="file" accept="image/*" capture="environment">`.
  - 🖼️ **دکمه انتخاب از گالری (Choose from Gallery):** متصل به `<input type="file" accept="image/*" multiple>`.
  - 📥 **محدوده Drag & Drop:** کشیدن مستقیم فایل‌ها روی کادر.
* **ناحیه پیش‌نمایش و مدیریت آلبوم:**
  - اسلایدر و گالری تعاملی (Carousel & Grid View).
  - ابزار زوم و بزرگ‌نمایی تصویر (Pan & Zoom) برای بررسی دقیق بارکد یا شماره سریال‌های ریز کالا.
  - دکمه‌های «تعیین به عنوان شاخص»، «چرخش»، «حذف» و «ثبت توضیح».
  - نشانگر درصد آپلود (Progress Bar) برای هر عکس.

### ۳. یکپارچه‌سازی در کارتابل‌ها و جداول
* **در جدول کالاها (`dispatch` / `inventory`):**
  - ستون جدید یا بج هوشمند در ستون کد کالا: اگر کالا عکس داشته باشد، نشان 📷 با تعداد عکس‌ها و یک پیش‌نمایش بندانگشتی مینیاتوری نمایش داده می‌شود.
  - هاور یا کلیک روی آن، دیالوگ لایت‌باکس گالری را به صورت On-Demand باز می‌کند.
  - استفاده از `loading="lazy"` و `IntersectionObserver` برای عدم اشغال پهنای باند تا زمان اسکرول.
* **در کارتابل شمارشگر (`counter-dashboard`):**
  - افزودن دکمه دسترسی سریع 📸 «ثبت تصویر کالا» در نوار اقدامات هر ردیف شمارش.
  - شمارشگر در حین شمارش فیزیکی، با یک لمس دوربین را باز کرده، از وضعیت کالا عکس می‌گیرد و توضیحات ثبت می‌کند.
* **در کارتابل سرپرست (`supervisor-dashboard`) و مدیر (`manager-review`):**
  - در برگه جزییات و تاریخچه شمارش، تصاویر ثبت شده توسط شمارشگر با وضوح بالا نمایش داده می‌شوند تا سرپرست قبل از تایید یا رد، تصویر واقعی شمارش شده را مشاهده نماید.

---

## 📊 جدول مقایسه تغییرات فایل‌ها (File Changes Summary)

| بخش | مسیر فایل | نوع تغییر | شرح وظیفه |
| :--- | :--- | :---: | :--- |
| **Backend Model** | `backend/inventory/models.py` | `MODIFY` | ارتقای مدل `ItemPhoto` با فیلدهای ۳ گانه کیفیت، منبع دوربین، ترتیب و شاخص |
| **Backend Processor** | `backend/inventory/utils/image_processor.py` | `NEW` | سرویس فشرده‌سازی Pillow، اصلاح EXIF Orientation و خروجی WebP |
| **Backend Serializers**| `backend/inventory/serializers.py` | `MODIFY` | افزودن `ItemPhotoSerializer` و فیلدهای محاسباتی `photos_count` و `primary_thumbnail` |
| **Backend Views** | `backend/inventory/views.py` | `MODIFY` | پیاده‌سازی ویوست `ItemPhotoViewSet` و اکشن‌های آپلود دسته‌ای، شاخص‌سازی و حذف |
| **Backend URLs** | `backend/inventory/urls.py` | `MODIFY` | رجیستر روت‌های API تصاویر کالا |
| **Frontend Service** | `frontend/src/app/core/services/image-compressor.service.ts` | `NEW` | فشرده‌سازی کلاینت، تغییر سایز هوشمند بومی و ساخت آدرس پیش‌نمایش |
| **Frontend Service** | `frontend/src/app/core/services/item-photo.service.ts` | `NEW` | سرویس ارتباط با API، آپلود چندگانه و همگام‌سازی محلی |
| **Frontend Component**| `frontend/src/app/shared/components/item-photo-gallery/` | `NEW` | کامپوننت دیالوگ گالری، عکاسی دوربین، گالری، زوم و مدیریت آلبوم |
| **Frontend Integration**| `frontend/src/app/components/counter/counter-dashboard/` | `MODIFY` | افزودن دکمه شاتر دوربین و انتخاب گالری در کارت‌های شمارشگر |
| **Frontend Integration**| `frontend/src/app/components/supervisor/supervisor-dashboard/` | `MODIFY` | نمایش آلبوم عکس در مودال بررسی سرپرست |
| **Frontend Integration**| `frontend/src/app/components/manager-review/` | `MODIFY` | نمایش تصاویر ثبت شده در مودال بازبینی مدیر |
| **Frontend Integration**| `frontend/src/app/components/dispatch/dispatch.html` | `MODIFY` | افزودن ستون عکس / نشانگر گالری با بارگذاری تنبل در جدول اصلی کالا |

---

## 🔒 پروتکل امنیت، RBAC و جلوگیری از نشت داده‌ها
* کنترل مجوزها: کاربران تنها در صورتی مجاز به آپلود، ویرایش یا حذف عکس هستند که به انبار مورد نظر دسترسی داشته باشند (`warehouse_id` چک می‌شود).
* اعتبارسنجی امنیتی فایل: پسوند و MIME-Type فایل‌ها در بک‌اند با بررسی هدرهای باینری اعتبارسنجی می‌شود تا از آپلود فایل‌های غیرمجاز جلوگیری گردد.
* سقف مجاز اندازه: جلوگیری از مصرف بی‌رویه فضای دیسک با محدود کردن حداکثر سایز اولیه به ۳۰ مگابایت (که پس از فشرده‌سازی به زیر ۴۰۰ کیلوبایت تبدیل می‌شود).

---

## 🧪 برنامه تست و اعتبارسنجی (Verification Plan)

### ۱. تست عملکرد و سرعت (Performance Benchmark)
* اندازه‌گیری زمان پاسخ `GET /api/inventory/items/` قبل و بعد از اعمال تغییرات برای اطمینان از **ثابت ماندن زمان پاسخ (زیر ۵۰ میلی‌ثانیه)**.
* بررسی تب Network در مرورگر برای اطمینان از **عدم دانلود تصاویر فول‌سایز در هنگام لود جدول**.
* ارزیابی بارگذاری تنبل (`loading="lazy"`) هنگام اسکرول سریع در جدول ۱۰۰۰ ردیفی.

### ۲. تست کیفیت تصویر و نسبت فشرده‌سازی
* آپلود یک عکس حجیم (مثلاً ۱۲ مگابایت ۴۰۰۰×۳۰۰۰) گرفته شده با گوشی:
  - بررسی کاهش حجم فایل کلاینت به کمتر از ۵۰۰ کیلوبایت.
  - بررسی تبدیل بک‌اند به WebP با حجم حدود ۳۰۰ کیلوبایت.
  - بررسی وضوح و خوانایی کامل شماره‌سریال‌ها و بارکدهای روی کالا پس از زوم.

### ۳. تست دوربین و گالری در موبایل و دسکتاپ
* تست عملکرد دکمه دوربین در مرورگر Chrome/Safari اندروید و iOS و فعال‌سازی مستقیم دوربین پشت.
* تست انتخاب همزمان چند عکس از گالری و درگ-اند-دراپ در دسکتاپ.
* تست تغییر عکس شاخص، حذف عکس و تغییر ترتیب نمایش.

### ۴. تست آفلاین و تاب‌آوری
* قطع اینترنت در صفحه شمارشگر و ثبت تصویر با دوربین -> ذخیره موقت در IndexedDB -> اتصال مجدد اینترنت -> ارسال موفق در پس‌زمینه.

</div>
