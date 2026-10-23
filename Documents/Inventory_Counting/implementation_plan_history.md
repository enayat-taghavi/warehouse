<div dir="rtl" align="right">

# افزودن تاریخچه کامل برای شمارش کالا (Timeline History)

این طرح برای حل مشکل از دست رفتن توضیحات و مقادیر ثبت شده قبلی در طول رفت و برگشت کالا بین شمارشگر، سرپرست و مدیر است.

## Open Questions

۱. آیا می‌خواهید دسترسی به تاریخچه (Timeline) برای شمارشگر هم فعال باشد تا او هم ببیند قبلا سرپرست چه پیام‌هایی برای او گذاشته است؟ یا اینکه این تاریخچه فقط برای سرپرست و مدیر قابل رویت باشد؟ (پیش‌فرض ما این است که شمارشگر هم باید اشتباهات قبلی‌اش را ببیند).

۲. وقتی تاریخچه ثبت می‌شود، مقدار شمرده شده و کامنت ذخیره می‌شوند. آیا نیاز است اطلاعاتی مثل «مکان کالا» نیز اگر در آینده تغییر می‌کند، در تاریخچه ثبت شود یا فقط مقدار عددی کافیست؟ (پیش‌فرض: فقط مقدار شمرده شده و کامنت).

## Proposed Changes

### [Backend Model & Serializer]
مدل دیتابیس جدیدی برای ذخیره هر لاگ ساخته خواهد شد.

#### [NEW] [models.py](file:///e:/warehouse%20project/backend/inventory/models.py)
افزودن جدول `CountTaskHistory` با فیلدهای زیر:
- `task`: ارتباط با تسک اصلی
- `action_by`: کاربری که اقدام کرده
- `action_type`: نوع اکشن (ثبت اولیه، تایید، رد و ...)
- `counted_balance`: مقدار شمرده شده در آن لحظه
- `note`: یادداشت فرد در آن لحظه
- `created_at`: زمان ثبت دقیق

#### [MODIFY] [serializers.py](file:///e:/warehouse%20project/backend/inventory/serializers.py)
افزودن `CountTaskHistorySerializer` و قرار دادن آن درون `CountTaskSerializer` تا وقتی کالا لود می‌شود، لیست کامل تاریخچه نیز در کنار آن بیاید.

---

### [Backend Views / Logic]
هر زمان که وضعیت تسک تغییر کند، یک رکورد در تاریخچه ثبت می‌شود.

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
در متدهای `bulk_submit`، `bulk_approve`، `reject` و `update` منطقی اضافه خواهد شد تا کارهایی که کاربران انجام می‌دهند علاوه بر ذخیره در تسک، در تاریخچه نیز ثبت شود.

---

### [Frontend Models]

#### [MODIFY] [count-task.model.ts](file:///e:/warehouse%20project/frontend/src/app/core/models/count-task.model.ts)
اضافه کردن آرایه `history` به اینترفیس `CountTask`.

---

### [Frontend User Interfaces]
افزودن بخش نمایش Timeline.

#### [MODIFY] [counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)
در حالت نمایش جزئیات کالا، لیستی از نظرات قبلی سرپرست یا مدیر به ترتیب زمانی به شمارشگر نمایش داده می‌شود.

#### [MODIFY] [supervisor-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html)
در هنگام کلیک برای بررسی کالا، تاریخچه کامل مقادیر قبلی برای سرپرست نمایش داده می‌شود.

#### [MODIFY] [manager-review.html](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.html)
مدیر می‌تواند چت و گفتگوهای سرپرست و شمارشگر را به صورت تایم‌لاین مطالعه کند.

## Verification Plan

### Automated Tests
- اعمال مایگریشن‌ها در دیتابیس بدون خطا.

### Manual Verification
- رد کردن کالا و ثبت مجدد عدد برای اطمینان از صحت نمایش تاریخچه برای تمامی کاربران.

</div>
