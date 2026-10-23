# طرح اصلاح‌شده جستجوی JOIN بین جداول در گزارش‌ساز

تاریخ: ۱۴۰۵/۰۵/۲۰ — نسخه ۲ (ایرادات برطرف‌شده)

---

## ۱. هدف

گسترش گزارش‌ساز از «تک‌موجودیت + FK مستقیم» به **ترکیب چند موجودیت در یک گزارش**:
کاربر یک جدول پایه و یک یا چند جدول مرتبط انتخاب می‌کند و از فیلدهای همه آن‌ها
در ستون‌ها، فیلترها، گروه‌بندی و تجمیع استفاده می‌کند.

---

## ۲. محدودیت فعلی

در [registry.py](../backend/reports/registry.py) فقط FKهای خارج‌رونده expose
می‌شوند. روابط وارونه (مثل CountTask→Item) ممنوع‌اند چون JOIN چندمقداری باعث **ضرب
دکارتی** می‌شود. این طرح همان قاعده را حفظ می‌کند و یک استثنا کنترل‌شده با
`FilteredRelation` می‌افزاید.

---

## ۳. ساختار spec

```json
{
  "entity": "items",
  "joins": [
    { "to": "count_tasks", "type": "left", "as": "ct" }
  ],
  "fields": ["fa_unic_code", "inventory", "ct.counted_balance"],
  "filters": { "op": "AND", "children": [] },
  "group_by": [], "aggregations": [], "sort": [],
  "page": 1, "page_size": 50
}
```

| کلید | نوع | توضیح |
|---|---|---|
| `joins[].to` | string | کلید whitelist مقصد — مسیر ORM سمت سرور است، کلاینت دسترسی ندارد |
| `joins[].type` | `left` یا `inner` | پیش‌فرض `left` |
| `joins[].as` | string | alias یکتا؛ باید `ALIAS_RE` را پاس دهد و با فیلدهای پایه تداخل نداشته باشد |

فیلدهای پایه بدون پیشوند (`fa_unic_code`)؛ فیلدهای مقصد با `alias.` (`ct.counted_balance`).
specهای قدیمی (بدون `joins`) بدون تغییر کار می‌کنند.

---

## ۴. سه حالت اجرا

موتور بسته به نحوهٔ استفاده از JOIN یکی از سه حالت را انتخاب می‌کند:

| حالت | شرط تشخیص | رفتار |
|---|---|---|
| **EXISTS** | JOIN فقط در `filters` — هیچ فیلد مقصد در `fields`/`group_by`/`aggregations` نیست | فیلتر `Exists` subquery بدون JOIN واقعی؛ تکثیر ردیف نمی‌شود |
| **Flat JOIN** | فیلد مقصد در `fields` هست ولی `group_by` خالی است | JOIN واقعی؛ یک ردیف به ازای هر ترکیب — صفحه‌بندی روی ترکیب‌هاست |
| **Aggregated** | `group_by` غیرخالی | JOIN + GROUP BY + aggregation؛ محدودیت‌های بخش ۷.۴ اعمال می‌شود |


---

## ۵. نقشهٔ سه‌لایه کلیدها (مهم‌ترین قسمت)

کلیدها در سه سطح متفاوت‌اند و باید از هم جدا نگه داشته شوند:

| سطح | مثال | توضیح |
|---|---|---|
| **spec/client** | `ct.counted_balance` | نقطه جداکننده؛ آنچه کلاینت می‌فرستد |
| **FilteredRelation name** | `ct` | نام annotation جنگو (`qs.annotate(ct=FilteredRelation(...))`) |
| **ORM traversal** | `ct__counted_balance` | مسیر از طریق FilteredRelation در `values()` و `filter()` |
| **annotation امن** | `ct_dyn_coating` | فقط برای فیلدهای `annotation`دار مقصد؛ با underscore واحد |

قانون تبدیل در موتور: کلید spec `ct.X` → source برای ORM یعنی `ct__X`.
اگر فیلد مقصد دارای `annotation` بود، annotate با نام `ct_X` انجام می‌شود
و `source` همان نام annotation است. کلیدهای با نقطه یا double-underscore
هرگز مستقیم به `.annotate()` پاس داده نمی‌شوند.

---

## ۶. JoinDef و whitelist

```python
@dataclass(frozen=True)
class JoinDef:
    target: str          # کلید موجودیت مقصد در رجیستری
    label: str           # برچسب فارسی برای UI
    path: str            # related accessor از پایه به مقصد — باید از related_name مدل تأیید شود
    cardinality: str     # 'many': یک‌به‌چند (گارد لازم) | 'one': یک‌به‌یک (بدون گارد)
    allowed_types: tuple = ('left', 'inner')
    warehouse_path: str = ''  # مسیر ORM از مقصد به warehouse_id (برای شرط ON)
    path_to_base: str = ''    # مسیر FK از مقصد به پایه — برای EXISTS subquery
```

فیلد `key` مجزا حذف شد؛ کلید dict همان شناسهٔ JOIN است و باید یکتا باشد.
`cardinality='one'` برای روابط OneToOne یا unique_together مؤثر است؛ موتور
در آن حالت گارد ضدتکثیر را اعمال نمی‌کند.


```python
JOINS: dict[str, dict[str, JoinDef]] = {
  'items': {
    'count_tasks': JoinDef(
        target='count_tasks', label='وظایف شمارش',
        path='count_tasks',      # ← باید با related_name در CountTask.item تأیید شود
        cardinality='many',
        warehouse_path='item__warehouse_id',
        path_to_base='item',
    ),
    'doc_tasks': JoinDef(
        target='doc_tasks', label='وظایف مدارک',
        path='doc_tasks',        # ← باید با related_name در DocTask.item تأیید شود
        cardinality='many',
        warehouse_path='item__warehouse_id',
        path_to_base='item',
    ),
  },
  'count_tasks': {
    'ct_history': JoinDef(
        target='count_task_history', label='تاریخچه شمارش',
        path='history',          # ← باید با related_name در CountTaskHistory.task تأیید شود
        cardinality='many',
        warehouse_path='task__item__warehouse_id',
        path_to_base='task',
    ),
  },
  'doc_tasks': {
    'dt_history': JoinDef(
        target='doc_task_history', label='تاریخچه مدارک',
        path='history',          # ← باید با related_name در DocTaskHistory.task تأیید شود
        cardinality='many',
        warehouse_path='task__item__warehouse_id',
        path_to_base='task',
    ),
  },
}
```

کلیدهای `ct_history` و `dt_history` به‌جای `history` تکراری انتخاب شدند تا alias
پیش‌فرض در UI یکتا باشد. مقادیر `path` باید پیش از پیاده‌سازی از `inventory/models.py`
تأیید شوند.

قواعد سخت‌گیرانه whitelist: حداکثر `MAX_JOINS = 2` در هر گزارش؛ چرخه و
خودپیوست در startup با `assert` بررسی می‌شود؛ جهت JOIN فقط از پایه به مقصد است.


---

## ۷. تغییرات موتور (`engine.py`)

### ۷.۱ FilteredRelation به‌جای filter ساده (رفع ایراد LEFT JOIN + scope)

```python
from django.db.models import FilteredRelation, Exists, OuterRef, Q

for jspec in spec.get('joins', []):
    alias = jspec['as']                        # alias تأییدشده با ALIAS_RE
    jd = JOINS[entity_key][jspec['to']]        # فقط از whitelist

    # شرط انبار در سطح ON — نه WHERE — تا LEFT JOIN صحیح بماند
    scope_q = Q(**{
        f'{jd.path}__{jd.warehouse_path}__in': self._assigned_ids
    }) if not self.user.is_superuser and self._assigned_ids else Q()
    if self.warehouse_id:
        scope_q &= Q(**{f'{jd.path}__{jd.warehouse_path}': self.warehouse_id})

    qs = qs.annotate(**{alias: FilteredRelation(jd.path, condition=scope_q)})
    if jspec.get('type') == 'inner':
        qs = qs.filter(**{f'{alias}__isnull': False})
```

چون `scope_q` داخل `FilteredRelation.condition` است، به عنوان شرط ON-level
عمل می‌کند — نه WHERE — و کالاهای بدون وظیفهٔ مطابق در LEFT JOIN حذف نمی‌شوند.

### ۷.۲ تشخیص و ساخت حالت EXISTS

```python
join_only_in_filters = (
    jd.cardinality == 'many'
    and alias not in used_in_fields      # هیچ ct.X در fields/group_by/aggregations
)
if join_only_in_filters:
    target_qs = registry[jd.target].model.objects.filter(
        **{jd.path_to_base: OuterRef('pk')},
        **scope_filters,                 # فیلترهای این JOIN از درخت filters
    )
    qs = qs.filter(Exists(target_qs))
    # FilteredRelation ساخته نمی‌شود — JOIN واقعی وجود ندارد
```


### ۷.۳ حالت Flat JOIN

فیلدهای مقصد در `values()` با مسیر ORM `alias__field` خوانده می‌شوند.
response یک فیلد `join_mode: "flat"` می‌گیرد تا UI بتواند توضیح نشان دهد.
در این حالت `.distinct()` لازم نیست — یک ردیف به ازای هر ترکیب منطقی است.

### ۷.۴ حالت Aggregated — محدودیت تجمیع (رفع ایراد Sum/Avg غلط)

وقتی حداقل یک JOIN با `cardinality='many'` فعال است و `group_by` غیرخالی است:

**مجاز:**
- هر تجمیع (`count`/`sum`/`avg`/`min`/`max`) روی فیلدهای مقصد (`ct.counted_balance`)
- `Count('id')` روی پایه با `distinct=True` (شمارش کالاهای منحصربه‌فرد)

**ممنوع — ReportError فارسی:**
- `Sum`/`Avg`/`Min`/`Max` روی فیلدهای اسکالر جدول پایه: «در ترکیب با جدول
  چندمقداری، مجموع/میانگین فیلدهای جدول پایه نادرست است. فیلد مقصد را جمع
  بزنید یا فقط از Count استفاده کنید.»

این بررسی در `build()` پیش از ساخت QuerySet انجام می‌شود.

---

## ۸. تغییرات رجیستری (`registry.py`)

`EntityConfig` یک فیلد `joins: dict[str, JoinDef] = {}` می‌گیرد.
`_build_registry` در startup چرخه و خودپیوست را با `assert` بررسی می‌کند.
`JOINS` به‌عنوان dict مستقل در همان فایل registry تعریف می‌شود و در `__init__`
موتور بارگذاری می‌شود.

---

## ۹. تغییرات API

- `EntityFieldsView`: پاسخ یک بخش `"joins"` می‌گیرد — فیلدهای مقصد **بدون پیشوند**
  برگشت داده می‌شوند. مپینگ `alias.field` سمت فرانت انجام می‌شود نه API.
- `RunReportView` / `ExportReportView`: امضا بدون تغییر.
- `ReportTemplate`: `joins` فیلد اختیاری — specهای قدیمی بدون تغییر باز می‌شوند.

---

## ۱۰. تغییرات فرانت‌اند

1. پنل «ترکیب با جدول دیگر» — انتخاب از `joins` متادیتا؛ alias پیش‌فرض = کلید
   JOIN که از پیش یکتاست (`count_tasks`، `doc_tasks`، ...).
2. فیلدهای مقصد در picker با نام `alias.field` سمت فرانت ساخته می‌شوند — بدون
   API call اضافه. تغییر alias → rename تمام کلیدهای انتخاب‌شده در spec لوکال.
3. حالت Flat JOIN: نوار «نتایج یک ردیف به ازای هر ترکیب هستند».
4. حالت EXISTS: نوار «فیلتر وجودی اعمال شد — ستون مقصد نمایش داده نمی‌شود».
5. خطای موتور (مثل ممنوعیت Sum روی پایه) به‌صورت toast فارسی نمایش داده می‌شود.

---

## ۱۱. امنیت و پایداری

- **هیچ مسیر ORM از کلاینت نمی‌آید** — فقط whitelist key (`to`) و alias.
- **scope انبار در سطح ON** با `FilteredRelation.condition` — LEFT JOIN صحیح می‌ماند.
- **مجوز مستقل** برای هر موجودیت مقصد بررسی می‌شود.
- **فیلدهای حساس** مقصد از `allowed_fields` حذف می‌شوند.
- **سقف‌ها**: `MAX_JOINS = 2`، `MAX_JOIN_FIELDS = 20`، statement_timeout فعلی.
- هیچ مهاجرت دیتابیس لازم نیست.

---

## ۱۲. برنامه مرحله‌ای

1. **تأیید related_name مدل‌ها** — قبل از هر چیز، `path` و `path_to_base` هر
   JoinDef از `inventory/models.py` خوانده و ثابت می‌شود.
2. **موتور و رجیستری** — JoinDef، JOINS whitelist، FilteredRelation، سه حالت
   اجرا، محدودیت تجمیع، تست‌های امنیت/scope/تکثیر.
3. **API** — اضافه کردن `joins` به پاسخ متادیتا.
4. **UI** — پنل انتخاب JOIN، مپینگ alias سمت فرانت، نوارهای اطلاعاتی.
5. **خروجی‌ها و قالب‌ها** — تست Export و ذخیره/بازیابی joins در ReportTemplate.

---

## ۱۳. ریسک‌ها و تصمیم‌ها

| ریسک | راه‌حل |
|---|---|
| LEFT JOIN + scope → INNER JOIN پنهان | `FilteredRelation(condition=...)` با شرط ON؛ نه plain `filter()` |
| نقطه در کلید annotation جنگو | مپینگ `ct.X` → traversal `ct__X` یا annotation name `ct_X` |
| ضرب دکارتی در تجمیع grouped | بلوک Sum/Avg روی فیلدهای اسکالر پایه در many-JOIN؛ ReportError فارسی |
| `path` اشتباه در JoinDef | مرحله ۱: تأیید related_name از مدل پیش از پیاده‌سازی |
| alias پیش‌فرض تکراری | کلیدهای JOINS از پیش یکتا (`ct_history`/`dt_history`)؛ موتور یکتایی را validate می‌کند |
| تغییر alias در UI | مپینگ سمت فرانت؛ rename کلیدهای spec به‌جای refetch |
| ممکن نبودن `cardinality='one'` در مدل‌های فعلی | پیاده‌سازی موتور از گارد صرف‌نظر می‌کند؛ آماده برای آینده |




