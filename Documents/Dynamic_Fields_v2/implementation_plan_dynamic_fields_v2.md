<div dir="rtl" align="right">

# برنامه‌ریزی: بهبود فیلدهای پویا و اصلاح کانتکست انبار

هدف این تغییرات پاسخ به دو نیاز اصلی شماست: 
۱- جلوگیری از درخواست مجدد برای انتخاب انبار وقتی قبلاً در محیط یک انبار خاص قرار داریم (در داشبوردهای مختلف).
۲- ارتقای ساختار «فیلدهای پویا» (Dynamic Fields) تا بتوانید مقدار پیش‌فرض را مشخص کرده و نام سیستمی فیلدهای از پیش‌تعریف‌شده را همراه با دیتای آن‌ها در دیتابیس ویرایش کنید.

> [!TIP]
> برای حل مشکل عدم نیاز به انتخاب مجدد انبار، کافیست نمایش کامپوننت `<app-warehouse-selector>` را در داشبوردها به شکلی تنظیم کنیم که اگر در داخل یک انبار خاص هستیم (`isWarehouseContext` برقرار باشد)، این دراپ‌داون مخفی شود و به صورت خودکار از آیدی همان انبار استفاده کند.

## تغییرات پیشنهادی

### 1. اصلاح کانتکست انبار در داشبوردها (Frontend)
کامپوننت انتخاب انبار را در سه داشبورد زیر به صورت هوشمند مخفی می‌کنیم:
- داشبورد سرپرست (`supervisor-dashboard.html`)
- داشبورد انبارگردان (`counter-dashboard.html`)
- تاییدات مدیریت (`manager-review.html`)

#### [MODIFY] `counter-dashboard.html` / `supervisor-dashboard.html` / `manager-review.html`
- افزودن شرط `*ngIf="!store.isWarehouseContext()"` به والد `<app-warehouse-selector>`

### 2. ارتقای مدل فیلدهای پویا (Backend)

#### [MODIFY] `backend/inventory/models.py`
- افزودن فیلد `default_value = models.CharField(max_length=255, null=True, blank=True)` به `ItemFieldDefinition`.

#### [MODIFY] `backend/inventory/serializers.py`
- افزودن `default_value` به فیلدهای `DynamicFieldDefinitionSerializer`.

#### [MODIFY] `backend/inventory/views.py`
- بازنویسی متد `perform_update` در `DynamicFieldDefinitionViewSet`:
  اگر کاربر `name` (نام سیستمی) یک فیلد را تغییر داد، تمام کالاهای همان انبار که در فیلد JSON خود (`dynamic_data`) کلید قدیمی را دارند جستجو شده و نام آن کلید به کلید جدید آپدیت می‌شود تا هیچ داده‌ای از دست نرود.

### 3. ارتقای فرم طراحی فیلدهای پویا (Frontend)

#### [MODIFY] `frontend/src/app/core/models/dynamic-field.model.ts`
- افزودن پراپرتی `default_value?: string` به اینترفیس `DynamicFieldDefinition`.

#### [MODIFY] `frontend/src/app/components/dynamic-fields/dynamic-fields.html`
- اضافه کردن یک ورودی جدید برای «مقدار پیش‌فرض» (Default Value) در فرم افزودن.
- افزودن دکمه «ویرایش» به جدول فیلدها.
- باز کردن یک مودال ویرایش (Edit Modal) برای تغییر نام، عنوان، نوع، مقدار پیش‌فرض و الزامی بودن فیلد.

#### [MODIFY] `frontend/src/app/components/dynamic-fields/dynamic-fields.ts`
- افزودن منطق و متدهای باز کردن فرم ویرایش `openEditModal(field)` و `saveEditedField()`.
- ارتباط با متد `update` سمت سرور.

> [!WARNING]
> تغییر نام سیستمی (System Name) یک فیلد می‌تواند باعث عملیات آپدیت دسته‌جمعی روی تمامی کالاهای آن انبار در دیتابیس شود (`bulk_update`). این کار تضمین می‌کند اطلاعات وارد شده قبلی حذف نمی‌شوند.

## سوالات و نیازمندی‌ها
آیا با منطق مهاجرت داده هنگام تغییر نام سیستمی (تبدیل خودکار نام کلید JSON در رکورد کالاها) موافق هستید؟ 

## برنامه تست
- ورود با اکانت `admin/123`.
- بررسی داشبوردهای سرپرست و تاییدات مدیر (عدم نمایش سلکتور انبار وقتی در یک انبار هستیم).
- باز کردن تنظیمات انبار -> فیلدهای پویا.
- افزودن یک فیلد جدید با مقدار پیش‌فرض.
- ویرایش یک فیلد قبلی (تغییر نام) و بررسی عدم حذف دیتا.

</div>
