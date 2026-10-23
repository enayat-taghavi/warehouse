<div dir="rtl" align="right">

# طرح جامع و جزئیات دقیق کدها: به‌روزرسانی نقطه‌ای هوشمند وب‌سوکت در کارتابل انبارگردان (فاز ۳۲)

این مستند حاوی جزئیات خط‌به‌خط کدهای مورد نظر برای اعمال انحصاری در فایل [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) است.

---

## ۱. فایل هدف

* **فایل:** [frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
* **دامنه تغییرات:** صرفاً ارتقای شنونده وب‌سوکت و اضافه شدن متدهای به‌روزرسانی درجا بدون هیچ‌گونه دستکاری در ساختار UI یا سایر متدها.

---

## ۲. جزئیات دقیق کدهای جدید و جایگزین

### ۲.۱. تعریف متغیرهای واکنشی و بافر رویدادها (خطوط ۸۸ تا ۹۵):
```typescript
  updatedTaskIds = new Set<number>();
  flashTimeout: any;

  private pushSub?: Subscription;
  private pullSub?: Subscription;
  private wsSub?: Subscription;
  private wsUpdateSubject = new Subject<any>();
  private wsDebounceSub?: Subscription;
  private routerSub?: Subscription;
  private swrSub?: Subscription;
```

---

### ۲.۲. اصلاح شنونده وب‌سوکت در `ngOnInit` (خطوط ۱۶۶ تا ۱۷۵):
```typescript
<<<< کدهای قبلی که باعث رفرش کل جدول می‌شدند:
    this.wsService.connect();
    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      if (data.type === 'count_task_update' || data.event === 'count_task_update') {
        this.refreshCurrentTab();
        if (this.currentTab !== 'pool') {
          this.fetchPoolTasksSilently();
        }
      }
    });

>>>> کدهای جدید (به‌روزرسانی نقطه‌ای هوشمند):
    this.wsService.connect();

    this.wsDebounceSub = this.wsUpdateSubject.pipe(debounceTime(600)).subscribe(() => {
      this.refreshCurrentTab();
    });

    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      if (data.type === 'count_task_update' || data.event === 'count_task_update') {
        if (data.task && data.task.id) {
          // به‌روزرسانی نقطه‌ای مستقیم بدون دانلود مجدد
          this.updateCountTaskInPlace(data.task);
        } else if (data.task_id) {
          // استعلام تکی فقط برای همین یک تسک
          this.fetchSingleCountTask(data.task_id);
        } else {
          this.wsUpdateSubject.next(data);
        }
      }
    });
```

---

### ۲.۳. متدهای جدید به‌روزرسانی درجا (`updateCountTaskInPlace`, `fetchSingleCountTask`, `triggerFlash`):
```typescript
  private triggerFlash(id: number) {
    this.updatedTaskIds.add(id);
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
    this.flashTimeout = setTimeout(() => {
      this.updatedTaskIds.clear();
      this.cdr.detectChanges();
    }, 4000);
  }

  updateCountTaskInPlace(taskData: any) {
    if (!taskData || !taskData.id) return;
    const id = taskData.id;

    // ۱. در صورت حذف تسک از سیستم
    if (taskData._deleted) {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
      this.applyFilters();
      if (this.localFirst && taskData.sync_id) {
        offlineDb.countTasks.delete(taskData.sync_id).catch(() => {});
      }
      this.cdr.detectChanges();
      return;
    }

    const currentUserId = this.currentUserId;
    const assignedId = taskData.assigned_counter && typeof taskData.assigned_counter === 'object'
      ? taskData.assigned_counter.id
      : taskData.assigned_counter;

    const isMyTask = assignedId === currentUserId;
    const isPool = !assignedId;

    // ۲. در صورتی که تسک متعلق به این انبارگردان باشد
    if (isMyTask) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        // به‌روزرسانی فیلدهای همان تسک درجا
        this.tasks[idx] = { ...this.tasks[idx], ...taskData };
      } else {
        // افزودن تسک جدید به ابتدای لیست بدون دستکاری بقیه اقلام
        this.tasks = [taskData, ...this.tasks];
      }
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.triggerFlash(id); // فقط و فقط همین تسک فلش نوری می‌زند

      if (this.localFirst && taskData.sync_id) {
        offlineDb.countTasks.put({ ...taskData, warehouse_id: this.activeWarehouseId }).catch(() => {});
      }
    } else if (isPool) {
      // ۳. در صورتی که تسک در استخر عمومی باشد
      const idx = this.poolTasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.poolTasks[idx] = { ...this.poolTasks[idx], ...taskData };
      } else {
        this.poolTasks = [taskData, ...this.poolTasks];
      }
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else {
      // ۴. در صورتی که تسک به انبارگردان دیگری واگذار شده باشد
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
    }

    this.applyFilters();
    this.cdr.detectChanges();
  }

  fetchSingleCountTask(taskId: number) {
    this.countTaskApi.getById(String(taskId)).subscribe({
      next: (task) => {
        if (task) this.updateCountTaskInPlace(task);
      },
      error: () => {
        this.wsUpdateSubject.next(taskId);
      }
    });
  }
```

---

### ۲.۴. پاک‌سازی منابع در `ngOnDestroy` (خطوط ۱۹۹ تا ۲۰۵):
```typescript
  ngOnDestroy() {
    this.pushSub?.unsubscribe();
    this.pullSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.wsDebounceSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.swrSub?.unsubscribe();
    this.wsUpdateSubject.complete();
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
  }
```

---

## ۳. تضمین ایزولاسیون و عدم تغییر ناخواسته

* هیچ تغییری در فایل‌های HTML یا CSS داده نمی‌شود.
* متدهای محاسباتی، فیلترها، فرم‌های داینامیک، بارکد اسکنر، و سیستم ثبت شمارش دست‌نخورده باقی می‌مانند.
* پس از اعمال، پروژه با `npm run build` کامپایل و تست خواهد شد.

---

> [!IMPORTANT]
> لطفاً در صورت تایید این جزئیات دقیق کد، دستور **«تایید»** یا **«شروع»** را ارسال فرمایید تا پیاده‌سازی آغاز شود.

</div>
