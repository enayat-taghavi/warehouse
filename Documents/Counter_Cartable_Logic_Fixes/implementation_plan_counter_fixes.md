<div dir="rtl" align="right">

# طرح جامع، بازبینی‌شده و ضدگلوله رفع ایرادات منطقی کارتابل انبارگردان (`CounterDashboard`) — ویرایش نهایی (V2)

این سند فنی، برنامه دقیق اجرایی جهت رفع تمامی باگ‌ها و نقایص منطقی کارتابل انبارگردان را بر اساس نتایج بازبینی‌های چندمرحله‌ای و بازبینی موشکافانه تکمیلی (مدیریت همزمانی دیتابیس با قفل ردیف‌ها، تراکنش‌های اتمیک، جلوگیری از ارسال ناخواسته بازشماری‌های دست‌نخورده در ارسال همه، سازگاری کامل با آفلاین/لوکال‌فرست، اصلاح سورتینگ، و یکپارچه‌سازی فیلترهای خروجی اکسل) همراه با **شماره دقیق خطوط کد** و پیش‌نمایش تغییرات مشخص می‌کند.

---

## 🏗️ جزئیات تغییرات و شماره خطوط کد

### ۱. لایه بک‌اند (`backend`)

#### 🟡 [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)

1. **امن‌سازی، اتمیک کردن و قفل همزمانی در متد ارسال گروهی (`bulk_submit`):**
   - **محل تغییر:** متد `bulk_submit` در خطوط **۱۷۴۸ تا ۱۸۱۸**
   - **ایراد و ریسک قبلی:** در صورت انتخاب دستی یا ارسال همگانی، اقلام ردشده توسط سرپرست/مدیر بدون اینکه شمارش مجدد شده باشند، با مقدار قبلی دوباره ارسال می‌شدند. همچنین عملیات آپدیت تسک‌ها و ایجاد رکوردهای تاریخچه خارج از بلاک اتمیک بود و ریسک درخواست‌های همزمان وجود داشت.
   - **اصلاح:**
     - قرار دادن کل عملیات در `with transaction.atomic():`.
     - استفاده از `select_for_update()` روی ردیف‌های انتخابی.
     - محدود کردن کوئری تسک‌های واجد شرایط به تسک‌های آماده ارسال (`status='INITIAL_COUNT'` یا رکوردهای معتبر با مقدار شمارش جدید):
     ```python
     with transaction.atomic():
         base_qs = CountTask.objects.select_for_update().filter(counter=user)
         if task_ids:
             tasks = base_qs.filter(
                 id__in=task_ids,
                 status='INITIAL_COUNT',
                 counted_balance__isnull=False
             )
         else:
             tasks = base_qs.filter(
                 status='INITIAL_COUNT',
                 counted_balance__isnull=False
             )
         if warehouse_id and str(warehouse_id) not in ['ALL', '-1']:
             tasks = tasks.filter(item__warehouse_id=warehouse_id)
     ```

2. **رفع شرایط رقابتی (Race Condition) و اتمیک‌سازی در تخصیص استخر کالاها (`claim_tasks`):**
   - **محل تغییر:** متد `claim_tasks` در خطوط **۱۶۶۶ تا ۱۷۰۴**
   - **ایراد و ریسک قبلی:** اگر دو انبارگردان همزمان یک کالا را بر عهده می‌گرفتند، احتمال بازنویسی نام کاربر روی فیلد `Item.field_assignee` بدون تعلق گرفتن تسک وجود داشت.
   - **اصلاح:**
     - قرار دادن کل فرایند تخصیص در `with transaction.atomic():`.
     - استفاده از `select_for_update()` روی ردیف‌های تسک واجد شرایط (`counter__isnull=True, status='PENDING_COUNT'`).
     - به‌روزرسانی `Item.field_assignee` منحصراً برای رکوردهایی که با موفقیت به کاربر جاری تعلق گرفتند.
     - پوشش تراکنش اتمیک برای تمامی نقش‌ها (`counter`, `supervisor`, `manager`).

3. **پشتیبانی کامل و تفکیک‌شده از فیلترهای وضعیت، تاریخ و جستجو در خروجی اکسل (`get_queryset` و `export_excel`):**
   - **محل تغییر:** متد `get_queryset` در خطوط **۱۶۰۹ تا ۱۶۴۳** و متد `export_excel` در خطوط **۲۱۵۳ تا ۲۱۷۲**
   - **ایراد و ریسک قبلی:** متد `get_queryset` هیچ‌گونه فیلتری روی `status`، `date` یا `q` اعمال نمی‌کرد و فیلترهای ارسالی از فرانت‌اند کاملاً نادیده گرفته می‌شدند.
   - **اصلاح:**
     - افزودن فیلتر جستجوی متنی `q` روی فیلدهای `item__fa_unic_code`, `item__description`, `item__item_no`, `item__new_location`, `item__po`.
     - افزودن فیلتر تاریخ `date` بر اساس بازه‌های زمانی (`today`, `yesterday`, `week`) با محاسبه ساعت جاری سرور.
     - افزودن نگاشت وضعیت اختصاصی برای نقش `counter` با حفظ سازگاری با سایر نقش‌ها:
       - در نقش `counter`:
         - `'pending'` $\rightarrow$ `status='PENDING_COUNT', counted_balance__isnull=True`
         - `'initial'` $\rightarrow$ `Q(status='INITIAL_COUNT') | Q(status='PENDING_COUNT', counted_balance__isnull=False)`
         - `'recount'` $\rightarrow$ `status__in=['SUPERVISOR_REJECTED', 'MANAGER_REJECTED']`
         - `'completed'` $\rightarrow$ `status__in=['COUNTED', 'SUPERVISOR_APPROVED', 'MANAGER_REVIEW', 'FINAL_APPROVED']`
       - در سایر نقش‌ها (`supervisor`, `manager`): استفاده مستقیم از وضعیت ارسالی دیتابیس در صورت معتبر بودن.

---

### ۲. لایه فرانت‌اند (`frontend`)

#### 🟡 [MODIFY] [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)

1. **اصلاح پایدار بازیابی آخرین وضعیت رد شده در `saveDraft` و `revertTaskStatus`:**
   - **محل تغییر در `saveDraft`:** خطوط **۱۱۸۰ تا ۱۱۹۸**
   - **محل تغییر در `revertTaskStatus`:** خطوط **۱۲۶۵ تا ۱۲۹۱**
   - **ایراد و ریسک قبلی:** استفاده از `.reverse()` یا `.find()` بدون سورت زمانی صریح، به دلیل صعودی بودن تاریخچه در پاسخ سرور جنگو و نزولی بودن در لوکال، باعث یافتن قدیمی‌ترین وضعیت به جای آخرین وضعیت رد شده می‌شد.
   - **اصلاح:** مرتب‌سازی صریح نزولی بر اساس زمان `created_at` / `id` پیش از استخراج آخرین وضعیت رد شده:
     ```typescript
     const sortedHistory = (task.history || []).slice().sort((a, b) => {
       const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
       const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
       return timeB - timeA;
     });
     const prevReject = sortedHistory.find(h => h.action_type === 'SUPERVISOR_REJECTED' || h.action_type === 'MANAGER_REJECTED');
     ```

2. **اصلاح منطق سورت «اولویت با بازشماری‌ها» (`recount_first`):**
   - **محل تغییر:** متد `applyFilters` در خطوط **۳۱۶ تا ۳۲۵** و خط **۳۳۶**
   - **اصلاح:** تفکیک قطعی اولویت بازشماری از ضریب `sortDirection` به طوری که اقلام بازشماری همواره در بالای لیست تثبیت شوند و جهت صعودی/نزولی صرفاً روی فیلد ثانویه لوکیشن (`new_location || old_location`) اعمال گردد.

3. **ارسال فیلترهای فعال صفحه به خروجی اکسل (`executeExport`):**
   - **محل تغییر:** متد `executeExport` در خطوط **۱۶۷۲ تا ۱۶۹۵**
   - **اصلاح:** افزودن `status: this.statusFilter`، `date: this.dateFilter` و `q: this.searchQuery` به آبجکت `params` در درخواست ارسال شده به بک‌اند.

4. **مدیریت ایمن کلیک در حالت انتخاب چندگانه (`onTaskClick`):**
   - **محل تغییر:** متد `onTaskClick` در خطوط **۱۰۰۹ تا ۱۰۲۲**
   - **اصلاح:** در صورتی که کاربر در حالت چندانتخابی روی کالای شمارش‌نشده کلیک کند، به جای عدم واکنش مبهم، پیام راهنمای مناسب به کاربر نمایش داده شود تا انتخاب‌های قبلی مخدوش نشوند.

5. **ادغام امن داده‌های کش SWR با داده‌های محلی در `swrSub`:**
   - **محل تغییر:** متد `ngOnInit` در خطوط **۱۸۷ تا ۱۹۸**
   - **اصلاح:** هنگام دریافت `freshList` از سرور، رکوردهایی از `this.tasks` که دارای پرچم `_offlinePending` هستند حفظ و روی داده‌های سرور ادغام شوند تا پیش‌نویس‌های محلی پاک نشوند.

6. **اصلاح شرط انتخاب همه (`toggleAll`) و ارسال همه (`submitAll`) برای ممانعت از ارسال بازشماری‌های دست‌نخورده:**
   - **محل تغییر:** متد `toggleAll` در خط **۱۵۵۲** و متد `submitAll` در خط **۱۵۹۳**
   - **ایراد قبلی:** استفاده از صرف شرط `counted_balance !== null` باعث می‌شد اقلام ردشده سرپرست که از دور قبل دارای عدد بودند، به اشتباه آماده ارسال تلقی شوند.
   - **اصلاح:** اصلاح شرط انتخاب و ارسال واجد شرایط به صورت کاملاً منطبق بر `readyToSubmitCount`:
     ```typescript
     // در toggleAll:
     const readyTasks = this.filteredTasks.filter(t => (t.status === 'INITIAL_COUNT' || (t.status === 'PENDING_COUNT' && t.counted_balance !== null)) && !this.isReadOnly(t));
     
     // در submitAll:
     const eligible = this.pendingTasks.filter(t => t.status === 'INITIAL_COUNT' || (t.status === 'PENDING_COUNT' && t.counted_balance !== null));
     ```

7. **پشتیبانی کامل از فیلتر جستجو در تب استخر کالاها:**
   - **محل تغییر:** تعریف `filteredPoolTasks`، فیلتر کردن استخر در `applyFilters` (خطوط **۲۸۲ تا ۳۰۰**) و فراخوانی حتمی `this.applyFilters()` بلافاصله در متد `loadPoolTasks` (خطوط **۴۹۵ تا ۵۰۱**).

8. **اصلاح انتخاب همگانی استخر کالاها (`toggleSelectAllPool` و `isAllPoolSelected`):**
   - **محل تغییر:** خطوط **۶۴۰ تا ۶۵۵** و متدهای کنترل انتخاب استخر در `.ts`
   - **اصلاح:** اتصال منطق انتخاب همه به `filteredPoolTasks` به جای کل `poolTasks` تا فقط اقلام فیلترشده جاری انتخاب شوند.

---

#### 🟡 [MODIFY] [counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)

1. **بررسی مجوز دسترسی فیلد موجودی سیستمی (`bal4miv` / `inventory`):**
   - **محل تغییر:** خطوط **۶۵۴ تا ۶۵۹**
   - **اصلاح:** بررسی شرط `(isFieldVisible('bal4miv') || isFieldVisible('inventory'))` به همراه شرط `!selectedTask.is_blind` برای نمایش کادر زرد موجودی.

2. **رندر لیست فیلترشده در تب استخر کالاها:**
   - **محل تغییر:** خط **۵۶۴**
   - **اصلاح:** تغییر منبع تکرار حلقه به `*ngFor="let task of filteredPoolTasks; trackBy: trackByTaskId"`.

3. **نمایش شمارنده صحیح در هدر انتخاب استخر:**
   - **محل تغییر:** خط **۵۵۷**
   - **اصلاح:** تغییر متن شمارنده به `filteredPoolTasks.length`.

4. **نمایش وضعیت خالی جستجو در تب استخر کالاها:**
   - **محل تغییر:** خطوط **۵۳۹ تا ۵۴۹**
   - **اصلاح:** تفکیک پیام «استخر خالی است» از پیام «موردی با مشخصات جستجویافته در استخر وجود ندارد» هنگامی که `poolTasks.length > 0` است اما `filteredPoolTasks.length === 0`.

---

## 📋 جدول جامع خلاصه تغییرات و خطوط کد (ویرایش نهایی)

| ردیف | لایه | نام فایل | شماره خطوط | شرح نقص منطقی و ریسک | راهکار قطعی و اصلاح‌شده |
| :---: | :---: | :--- | :---: | :--- | :--- |
| **۱** | بک‌اند | [`views.py`](file:///e:/warehouse%20project/backend/inventory/views.py) | **۱۷۴۸ - ۱۸۱۸** | ارسال بازشماری‌های دست‌نخورده و عدم وجود تراکنش اتمیک و قفل | اعمال `status='INITIAL_COUNT'`، `select_for_update` و `transaction.atomic()` |
| **۲** | بک‌اند | [`views.py`](file:///e:/warehouse%20project/backend/inventory/views.py) | **۱۶۶۶ - ۱۷۰۴** | خطای همزمانی دو انبارگردان در استخر کالاها | استفاده از `select_for_update()` و تراکنش اتمیک سراسری در `claim_tasks` |
| **۳** | بک‌اند | [`views.py`](file:///e:/warehouse%20project/backend/inventory/views.py) | **۱۶۰۹ - ۱۶۴۳ & ۲۱۵۴** | بی‌اثر بودن فیلترهای ارسالی اکسل در کوئری سرور | افزودن فیلترهای `status` (تفکیک‌شده بر اساس نقش)، `date` و `q` در کوئری سرور |
| **۴** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۱۱۸۱ & ۱۲۶۶** | ناهمگونی ترتیب تاریخچه و خطای بازگشت وضعیت | مرتب‌سازی صریح نزولی تاریخچه بر اساس `created_at` / `id` پیش از جستجو |
| **۵** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۳۱۶ - ۳۳۷** | وارونه شدن اولویت بازشماری در سورت نزولی | تثبیت دائمی اقلام بازشماری در صدر لیست و سورت ثانویه مسیر |
| **۶** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۱۶۷۲ - ۱۶۹۵** | نادیده گرفتن فیلترهای فعال در خروجی اکسل | ارسال پارامترهای `status`، `date` و `q` به بک‌اند در درخواست اکسل |
| **۷** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۱۰۰۹ - ۱۰۲۲** | باز شدن ناگهانی فرم جزئیات حین انتخاب چندگانه | ممانعت از باز شدن مودال و نمایش پیام راهنما |
| **۸** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۱۸۷ - ۱۹۸** | پاک شدن پیش‌نویس‌های آفلاین رم با SWR | ادغام ایمن داده‌های سرور با حفظ رکوردهای `_offlinePending` |
| **۹** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۱۵۵۲ & ۱۵۹۳** | انتخاب و ارسال ناخواسته اقلام بازشماری دست‌نخورده در فرانت | اصلاح شرط به `status === 'INITIAL_COUNT' \|\| (PENDING_COUNT && count!=null)` |
| **۱۰** | فرانت‌اند | [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) | **۲۸۲-۳۰۰ & ۴۹۸** | خالی ماندن تب استخر و نبود فیلتر جستجو | تولید `filteredPoolTasks` و فراخوانی `applyFilters` در `loadPoolTasks` |
| **۱۱** | فرانت‌اند | [`counter-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html) | **۵۳۹ - ۵۶۴** | انتخاب ناخواسته اقلام مخفی و عدم نمایش پیام جستجو | اتصال انتخاب همه و حلقه `*ngFor` به `filteredPoolTasks` و افزودن پیام نتیجه خالی |
| **۱۲** | فرانت‌اند | [`counter-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html) | **۶۵۴ - ۶۵۹** | نمایش موجودی سیستمی با وجود مخفی بودن در تنظیمات | اتصال کادر زرد به بررسی مجوز فیلد در `isFieldVisible` |

---

## 🧪 برنامه تست و اعتبارسنجی جامع (Verification Plan)

1. **تست بازگردانی وضعیت با پیش‌نویس محلی:** یک تسک ردشده را باز کرده، مقداری وارد کنید؛ سپس پاک کرده یا دکمه بازگردانی را بزنید $\rightarrow$ بررسی کنید وضعیت دقیقاً به رد سرپرست/مدیر بازگردد نه «در انتظار شمارش».
2. **تست ارسال گروهی و انتخاب همه امن:** داشتن یک کالای شمرده‌شده جدید و یک کالای ردشده دست‌نخورده $\rightarrow$ زدن انتخاب همه و ارسال همه $\rightarrow$ اطمینان از اینکه فقط کالای شمرده‌شده جدید انتخاب و ارسال می‌شود و کالای ردشده بدون شمارش مجدد ارسال نمی‌گردد.
3. **تست همزمانی استخر کالاها:** ارسال همزمان دو درخواست بر عهده گرفتن یک کالا $\rightarrow$ فقط یک کاربر موفق شود و پیام تداخل شفاف به دومی داده شود؛ وضعیت `field_assignee` فقط برای برنده ثبت شود.
4. **تست فیلترهای خروجی اکسل:** اعمال فیلتر «مغایرت و بازشماری» و دانلود اکسل $\rightarrow$ بررسی محتوای فایل که فقط شامل اقلام ردشده سرپرست/مدیر باشد.
5. **تست جستجو و انتخاب همه در استخر:** جستجوی یک واژه در استخر $\rightarrow$ فیلتر شدن آنی کارت‌ها $\rightarrow$ زدن انتخاب همه $\rightarrow$ اطمینان از انتخاب شدن دقیقاً همان تعداد نمایش‌داده‌شده و تست پیام جستجوی بدون نتیجه.
6. **تست سورت اولویت بازشماری:** فعال‌سازی سورت بازشماری در حالت صعودی و نزولی $\rightarrow$ اقلام بازشماری در هر دو حالت باید در بالای جدول بمانند.
7. **تست مجوز نمایش موجودی سیستمی:** غیرفعال‌سازی نمایش موجودی در تنظیمات انبار $\rightarrow$ اطمینان از عدم نمایش کادر زرد موجودی در جزئیات کالا.

</div>
