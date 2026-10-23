# طرح کامل: گزارش‌ساز چند‌موجودیتی با JOIN بین جداول

## ۱) هدف
هدف این است که صفحه گزارش‌ساز علاوه‌بر حالت فعلی «تک‌موجودیتی»، بتواند گزارش‌هایی بسازد که در آن‌ها کاربر یک **موجودیت اصلی** و یک یا چند **موجودیت مرتبط** را انتخاب کند و خروجی شامل ستون‌هایی از هر دو باشد.

مثال‌ها:
- کالاها + وظایف شمارش
- کالاها + وظایف مدارک
- وظایف شمارش + تاریخچه شمارش
- کالاها + وظایف شمارش + تاریخچه شمارش

---

## ۲) وضعیت فعلی سیستم
بر اساس ساختار فعلی:

### بک‌اند
- [registry.py](backend/reports/registry.py)
  - موجودیت‌ها به‌صورت whitelist ثبت شده‌اند.
  - فقط مسیرهای **FK مستقیم** امروز مجازند.
  - امنیت و جلوگیری از ضرب دکارتی از قبل مورد توجه بوده است.
- [engine.py](backend/reports/engine.py)
  - `spec` را می‌گیرد و یک QuerySet امن می‌سازد.
  - فعلاً معماری بر پایه‌ی یک `entity` اصلی است.
  - JOIN فقط در قالب مسیرهای `related` همان entity انجام می‌شود.

### فرانت‌اند
- صفحه گزارش‌ساز در مسیر:
  - `frontend/src/app/components/reports/`
- ساختار فعلی احتمالاً حول یک entity پایه طراحی شده است:
  - انتخاب entity
  - انتخاب فیلدها
  - فیلترها
  - group/aggregation
  - chart/export/template

---

## ۳) جمع‌بندی راه‌حل پیشنهادی
به‌جای تغییر رادیکال و آزاد کردن JOIN دلخواه، پیشنهاد اصلی من این است:

### مدل پیشنهادی: **گزارش چند‌موجودیتی هدایت‌شده (Guided Multi-Entity Report)**
یعنی:
- کاربر مستقیم SQL/JOIN نمی‌سازد.
- کاربر فقط از بین **ترکیب‌های مجاز و از پیش تعریف‌شده**، موجودیت اصلی و موجودیت‌های secondary را انتخاب می‌کند.
- هر secondary از طریق یک **join path امن و تعریف‌شده** به entity اصلی وصل می‌شود.

این مدل:
- امن است
- قابل پیش‌بینی است
- با سیستم فعلی سازگار است
- ریسک ضرب دکارتی را قابل کنترل نگه می‌دارد

---

## ۴) معماری کلی پیشنهادی

## ۴.۱) موجودیت اصلی (Primary Entity)
کاربر ابتدا یک موجودیت اصلی انتخاب می‌کند:
- `items`
- `count_tasks`
- `count_task_history`
- `doc_tasks`
- `doc_task_history`
- `warehouses`
- `users`

## ۴.۲) موجودیت‌های مرتبط (Joined Entities)
برای هر موجودیت اصلی، سیستم فقط لیستی از موجودیت‌های قابل اتصال نمایش می‌دهد.

مثال:

### اگر primary = `items`
روابط قابل اتصال می‌تواند باشد:
- `count_tasks` از مسیر `Item -> CountTask`
- `doc_tasks` از مسیر `Item -> DocTask`

### اگر primary = `count_tasks`
روابط قابل اتصال:
- `items` از مسیر `CountTask -> Item`
- `item.warehouse` از مسیر `CountTask -> Item -> Warehouse`
- `count_task_history` از مسیر `CountTask -> CountTaskHistory`

### اگر primary = `doc_tasks`
روابط قابل اتصال:
- `items`
- `item.warehouse`
- `doc_task_history`

> نکته مهم:
> در مدل پیشنهادی، فیلدهای parent-to-child مثل `Item -> CountTask` فقط در **حالت عادی** می‌توانند مشکل ضرب دکارتی بسازند؛ بنابراین must be controlled.

---

## ۵) اصل کلیدی امنیتی و داده‌ای: Two Modes
برای اینکه JOIN بین موجودیت‌ها امن و درست بماند، پیشنهاد می‌کنم سیستم **دو حالت مجزا** داشته باشد:

---

### Mode A: گزارش تکی / Flat / Detail
رفتار امروز سیستم:
- فقط یک entity اصلی
- JOIN فقط به parent‌ها / FK مستقیم
- مناسب برای:
  - جدول‌های detail
  - sort
  - filter
  - export
  - pagination

**قانون:**
- در این حالت، هیچ رابطه‌ی چندمقداری parent-to-child (مثل item -> count_tasks) آزاد نمی‌شود.

---

### Mode B: گزارش ترکیبی / Multi-Entity
برای گزارش‌هایی که واقعاً بین چند موجودیت JOIN لازم دارند.

در این حالت:
- یک `primary_entity` داریم
- یک یا چند `joined_entity`
- هر joined entity باید یک `join_path` مشخص و whitelist داشته باشد
- فقط فیلدهایی قابل استفاده‌اند که در متادیتای آن join تعریف شده باشند

**مهم:**
این حالت برای کنترل ضرب دکارتی باید محدود شود به یکی از این دو الگو:

#### Mode B-1: Parent-Centric Join
یعنی فعلاً فقط وقتی مجاز باشد که join به سمت بالا/والد باشد:
- `count_tasks -> item`
- `item -> warehouse`
- `history -> task`

این حالت امن‌تر است، چون معمولاً ردیف تکثیر نمی‌شود.

#### Mode B-2: Fan-out Safe Join
برای join به existing childهای چندمقداری مثل:
- `items -> count_tasks`
- `count_tasks -> count_task_history`

در این حالت سیستم باید:
1. کاربر را مطلع کند که خروجی row-level است و تعداد ردیف‌ها بیشتر می‌شود
2. **distinct/grouping safeguards** اضافه شود
3. aggregationها فقط با قواعد خاص مجاز شوند
4. در export و pagination با دقت بیشتری کار شود

> پیشنهاد نهایی من:
> در فاز اول فقط **Parent-Centric Join** پیاده شود.
> سپس در فاز دوم Fan-out Safe Join محدود شود.

---

## ۶) طراحی داده‌ای / متادیتا / Registry

## ۶.۱) افزودن Join Registry
در `registry.py` یک ساختار جدید اضافه شود، مثلاً:

```python
@dataclass(frozen=True)
class JoinDef:
    key: str
    label: str
    from_entity: str
    to_entity: str
    path: str
    cardinality: str   # one | many
    required: bool = False
```

مثال مفهومی:

```python
JoinDef(
    key='count_tasks.item',
    label='کالای وظیفه شمارش',
    from_entity='count_tasks',
    to_entity='items',
    path='item',
    cardinality='one',
)
```

و برای چندمقداری:

```python
JoinDef(
    key='items.count_tasks',
    label='وظایف شمارش کالا',
    from_entity='items',
    to_entity='count_tasks',
    path='counttask_set',   # نامی مفهومی؛ مسیر واقعی در موتور map شود
    cardinality='many',
)
```

> نکته:
> ممکن است به‌جای نگه‌داشتن raw ORM path در متادیتا، بهتر باشد path را به resolver امن بدهیم تا کلاینت هیچ‌وقت مسیر خام ORM نبیند.

---

## ۶.۲) Entity Field Exposure در حالت join
باید برای هر join مشخص شود کدام فیلدهای موجودیت مقصد قابل استفاده‌اند.

یعنی به‌جای اینکه کل فیلدهای entity مقصد expose شوند، هر join یک `allowed_fields` داشته باشد.

مثال:
- `count_tasks -> item`
  - `fa_unic_code`
  - `description`
  - `unit`
  - `warehouse__name`

دو روش ممکن است:

### روش ۱: استفاده مجدد از موجودی registry فعلی
- اگر entity مقصد در registry فعلی تعریف شده، فیلدهای مجازش reuse شوند.

مزیت:
- کم‌کدتر
- یکپارچه

عیب:
- ممکن است در برخی joinها فیلد بیشتری از حد نیاز expose شود

### روش ۲: whitelist جدا برای هر join
- دقیق‌تر و امن‌تر

مزیت:
- کنترل کامل

عیب:
- نگهداری بیشتر

### پیشنهاد من:
در فاز اول **reuse از registry فعلی** انجام شود، اما با namespace جدید:
- `item.fa_unic_code`
- `item.description`
- `task.status`

یعنی در spec، aliasهای entity-scoped استفاده شود نه `__` خام.

---

## ۷) طراحی Spec جدید

فرمت فعلی احتمالاً شبیه این است:
```json
{
  "entity": "count_tasks",
  "fields": ["status", "item__fa_unic_code"],
  "filters": {...}
}
```

برای multi-entity پیشنهاد:

```json
{
  "primary_entity": "count_tasks",
  "joins": [
    {
      "key": "item",
      "entity": "items",
      "type": "left"
    },
    {
      "key": "warehouse",
      "entity": "warehouses",
      "via": "item.warehouse",
      "type": "left"
    }
  ],
  "fields": [
    {"entity": "count_tasks", "key": "status", "alias": "task_status"},
    {"entity": "items", "key": "fa_unic_code", "alias": "item_code"},
    {"entity": "warehouses", "key": "name", "alias": "warehouse_name"}
  ],
  "filters": {...},
  "group_by": [],
  "aggregations": [],
  "sort": []
}
```

یا نسخه ساده‌تر برای فاز اول:

```json
{
  "entity": "count_tasks",
  "joins": ["item", "item.warehouse"],
  "fields": [
    "count_tasks.status",
    "item.fa_unic_code",
    "item.warehouse.name"
  ]
}
```

## پیشنهاد فاز اول
برای کاهش پیچیدگی:
- همان `entity` فعلی نگه داشته شود
- `joins` اضافه شود
- کلیدهای فیلد با namespace جدید ساخته شوند:
  - `item.fa_unic_code`
  - `item.warehouse.name`

---

## ۸) تغییر در Engine

## ۸.۱) مرحله resolve spec
موتور باید ابتدا spec را resolve کند:
1. primary entity را validate کند
2. joinها را validate کند
3. برای هر join:
   - آیا این join برای این primary مجاز است؟
   - از چه path امنی استفاده می‌کند؟
   - چه فیلدهایی قابل expose هستند؟
4. namespace فیلدها را بسازد

## ۸.۲) نگاشت namespace به ORM
مثلاً:
- `count_tasks.status` -> `status`
- `item.fa_unic_code` -> `item__fa_unic_code`
- `item.warehouse.name` -> `item__warehouse__name`

به‌این‌ترتیب:
- UI با namespace تمیز کار می‌کند
- موتور به ORM path صحیح translate می‌کند
- whitelist همچنان حفظ می‌شود

## ۸.۳) قانون cardinality
هر join باید یکی از این دو باشد:

### one
- بدون تکثیر ردیف
- کاملاً مناسب detail report

### many
- تکثیر ردیف محتمل
- فقط در حالت خاص مجاز

قاعده پیشنهادی:
- اگر هر join از نوع `many` باشد:
  - یا کاربر explicitly حالت “expand rows” را انتخاب کرده باشد
  - یا فقط در grouped/aggregated mode اجرا شود

---

## ۹) کنترل ضرب دکارتی
این مهم‌ترین بخش طرح است.

## قاعده ۱
هیچ join آزادی پذیرفته نمی‌شود؛ فقط joinهای تعریف‌شده در registry.

## قاعده ۲
فقط در فاز اول joinهای `many -> one` یا `one -> one` مجازند.
یعنی:
- child -> parent
- fk مستقیم به بالا
- والد به والدِ بالاتر

ممنوع در فاز اول:
- `items -> count_tasks`
- `items -> doc_tasks` هم‌زمان
- combination‌هایی که چند مسیر many را هم‌زمان باز می‌کنند

## قاعده ۳
اگر روزی Fan-out مجاز شد:
- باید در UI label هشدار بخورد
- باید برای export محدودیت خاص داشته باشد
- باید برای aggregation قواعد distinct جداگانه داشته باشد

## قاعده ۴
در وجود چند join، سیستم باید **path overlap** را تشخیص دهد.
مثال:
- `item`
- `item.warehouse`

در این حالت نباید aliasها و annotationها duplicate شوند.

---

## ۱۰) API Design

## ۱۰.۱) Endpoint متادیتا
یک endpoint جدید یا توسعه endpoint فعلی:

### گزینه A: توسعه `/fields`
به‌جای برگرداندن فقط فیلدهای entity:
```json
{
  "entity": {...},
  "joinable_entities": [
    {
      "key": "item",
      "label": "کالا",
      "cardinality": "one",
      "fields": [...]
    }
  ]
}
```

### گزینه B: endpoint مجزا
`/api/reports/join-options/<entity_key>/`

خروجی:
```json
[
  {
    "key": "item",
    "label": "کالا",
    "entity": "items",
    "cardinality": "one"
  }
]
```

### پیشنهاد من:
- در فاز اول با همان endpoint فعلی `EntityFieldsView` ترکیب شود تا UI کمتر تغییر کند.
- اگر payload بزرگ شد، در فاز بعد endpoint جدا شود.

---

## ۱۰.۲) Run / Export
`RunReportView` و `ExportReportView` باید spec جدید را بپذیرند، اما backward compatible بمانند.

یعنی:
- اگر `joins` نبود، رفتار فعلی بماند
- اگر بود، موتور در multi-entity mode برود

---

## ۱۱) طراحی UI صفحه گزارش‌ساز

## ۱۱.۱) ساختار پیشنهادی UI
بعد از انتخاب entity اصلی، یک بخش جدید:

### بخش: «اتصال جدول‌های مرتبط»
نمایش به شکل:
- checkbox
- یا chips
- یا multi-select

مثال برای `count_tasks`:
- کالا
- انبار
- تاریخچه شمارش

بعد از فعال شدن هر join:
- در پنل انتخاب فیلدها، فیلدها به‌صورت گروه‌بندی‌شده نمایش داده شوند:
  - فیلدهای وظیفه شمارش
  - فیلدهای کالا
  - فیلدهای انبار

## ۱۱.۲) نام‌گذاری ستون‌ها
اگر چند join فعال باشد، ستون‌ها بهتر است label کامل داشته باشند:
- `وضعیت وظیفه شمارش`
- `کد یکتای کالا`
- `نام انبار`

## ۱۱.۳) هشدار برای join چندمقداری
اگر در آینده fan-out مجاز شود:
- UI باید پیام بدهد:
  «این اتصال ممکن است تعداد ردیف‌ها را افزایش دهد»

## ۱۱.۴) disable کردن برخی ویژگی‌ها
در حالت multi-entity:
- برخی chartها شاید فقط با grouped mode معنا داشته باشند
- template save/load باید نسخه‌ی spec را شامل joins هم ذخیره کند

---

## ۱۲) سازگاری با قابلیت‌های فعلی
باید بررسی شود که multi-entity join با این قابلیت‌ها چطور کار کند:

- فیلترهای AND/OR/NOT
- group_by
- aggregations
- HAVING
- chart
- Excel export
- PDF export
- report templates
- saved reports

## پیشنهاد فاز اول:
پشتیبانی کامل زیرها در multi-entity mode:
- fields
- filters
- sort
- pagination
- export excel/pdf
- templates

## محدودتر در فاز اول:
- aggregation/group_by فقط در حالت کاملاً safe
- chart فقط وقتی grouped report safe باشد

---

## ۱۳) Backward Compatibility
خیلی مهم است که سیستم فعلی نشکند.

پس:
- spec قدیمی باید همان‌طور کار کند
- موتور باید تشخیص دهد `joins` وجود دارد یا نه
- registry باید حالت تک‌موجودیتی امروز را همان‌طور پشتیبانی کند
- هیچ breaking change در URLها نباید ایجاد شود

---

## ۱۴) پیشنهاد معماری پیاده‌سازی در چند فاز

### فاز ۱ — Multi-Entity امن، فقط joinهای safe
هدف:
- پشتیبانی از join به existing parentها
- namespace فیلدها
- UI انتخاب joined entities
- run/export compatible

مثال‌های فاز ۱:
- `count_tasks + item`
- `count_tasks + item + item.warehouse`
- `doc_tasks + item`
- `history + task`
- `history + task + item`

---

### فاز ۲ — Fan-out کنترل‌شده
هدف:
- join parent -> child با هشدار و محدودیت
- aggregation distinct-safe
- export guard

مثال:
- `items + count_tasks`

---

### فاز ۳ — Query Composer پیشرفته
هدف:
- ساخت join tree بصری
- nested relations
- alias management
- پیش‌نمایش lineage

---

## ۱۵) تغییرات فایل‌ها

### بک‌اند
احتمالاً این فایل‌ها تغییر می‌کنند:
- [backend/reports/registry.py](backend/reports/registry.py)
- [backend/reports/engine.py](backend/reports/engine.py)
- [backend/reports/views.py](backend/reports/views.py)
- [backend/reports/serializers.py](backend/reports/serializers.py)
- [backend/reports/pdf.py](backend/reports/pdf.py) (اگر header/label ستون‌ها نیاز به اصلاح داشته باشد)
- [backend/reports/excel.py](backend/reports/excel.py) (اگر ستون‌های joined لازم به handling ویژه داشته باشند)

### فرانت‌اند
- `frontend/src/app/components/reports/reports.ts`
- `frontend/src/app/components/reports/reports.html`
- `frontend/src/app/components/reports/report-store.ts`
- `frontend/src/app/core/api/report-api.service.ts`
- احتمالاً:
  - `filter-group.component.ts`
  - `filter-value.component.ts`
  - `saved-reports.component.ts`

---

## ۱۶) مدل داده‌ای پیشنهادی در فرانت
در store باید state جدید اضافه شود:

```ts
primaryEntity: string
activeJoins: string[]
fieldSelections: Array<{ entity: string; key: string }>
```

و تمام عملیات:
- field toggle
- filter add
- group by
- export
- chart

باید entity-aware شوند.

---

## ۱۷) ریسک‌ها و نکات فنی

### ۱. ضرب دکارتی
مهم‌ترین ریسک.

### ۲. تکرار alias ستون‌ها
باید namespace و alias auto-resolve داشته باشیم.

### ۳. افزایش پیچیدگی فیلتر
ینکه فیلتر روی کدام join اعمال می‌شود باید کاملاً شفاف باشد.

### ۴. export بزرگ
با join بزرگ باید timeout و page handling دقیق‌تر شود.

### ۵. template versioning
قالب‌های ذخیره‌شده قدیمی باید باز شوند بدون error.

---

## ۱۸) پیشنهاد نهایی پیاده‌سازی
پیشنهاد عملی و امن:

### گام ۱
در `registry.py` یک لایه‌ی جدید `JoinDef` اضافه شود.

### گام ۲
در `engine.py`:
- resolver برای joins
- namespace -> ORM path
- validation بر اساس join whitelist

### گام ۳
در API:
- metadata فیلدهای joinable entities را برگرداند
- run/export هر دو spec جدید را بپذیرند

### گام ۴
در UI:
- بخش «جدول‌های مرتبط»
- نمایش grouped fields
- store state جدید

### گام ۵
تست:
- run ساده
- filter روی join field
- sort روی join field
- excel/pdf export
- ذخیره و بازیابی template

---

## ۱۹) جمع‌بندی
این طرح باعث می‌شود سیستم گزارش‌ساز از حالت «یک موجودیت + related FK» به حالت «یک موجودیت اصلی + چند موجودیت مرتبط» ارتقا پیدا کند، بدون اینکه امنیت و ساختار whitelist فعلی از بین برود.

مزیت اصلی این روش:
- سازگار با معماری فعلی
- قابل کنترل از نظر JOIN
- مناسب برای توسعه مرحله‌ای
- قابل فهم برای UI
