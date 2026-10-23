<div dir="rtl" align="right">

# ارتقاء سیستم نقش‌ها — مدل `CustomRole` و حذف هاردکدها

## خلاصه مسئله
سیستم فعلی نقش‌ها مستقیماً از مدل ساده `django.contrib.auth.models.Group` استفاده می‌کند که فقط دو فیلد `id` و `name` دارد. این در حالی است که فرانت‌اند برای فیلدهای `title` (فارسی)، `color` (رنگ سازمانی) و `parent_id` (سلسله‌مراتب) طراحی شده و این فیلدها به صورت هاردکد در سمت کلاینت (`state.service.ts`) نگهداری می‌شوند. همچنین در چندین نقطه از بک‌اند و فرانت‌اند، نام انگلیسی نقش‌ها (مثل `'admin'`, `'manager'`) به صورت مستقیم چک می‌شوند که شکننده و غیراستاندارد است.

---

## بررسی‌های کاربر (User Review Required)

> [!IMPORTANT]
> **تصمیم طراحی: فیلد `is_system`**
> آیا تمایل دارید نقش‌های کلیدی (admin, manager, supervisor, counter) با یک فیلد بولین `is_system = True` در دیتابیس علامت‌گذاری شوند تا لیست هاردکد شده `['admin', 'manager', 'supervisor', 'counter']` از فرانت‌اند و بک‌اند حذف شود؟

> [!IMPORTANT]
> **تصمیم طراحی: نام‌گذاری فیلدها**
> آیا فیلد `name` (نام انگلیسی، مثل `admin`) را نگه داریم و یک فیلد `title` (عنوان فارسی، مثل `مدیر سیستم`) اضافه کنیم، یا ترجیح می‌دهید فیلد `name` حذف شده و فقط `title` باقی بماند؟ پیشنهاد: **هر دو نگه داشته شوند** — `name` به عنوان شناسه فنی (slug) و `title` برای نمایش به کاربر.

> [!WARNING]
> **تأثیر بر داده‌های فعلی (Migration)**
> این تغییر نیازمند یک Data Migration است که نقش‌های فعلی (Groupهای جنگو) را به مدل جدید `CustomRole` منتقل کرده و ارتباط کاربران فعلی با نقش‌هایشان را حفظ کند. هیچ کاربری دسترسی خود را از دست نخواهد داد.

---

## سؤالات باز (Open Questions)

> [!NOTE]
> **۱. سلسله‌مراتب نقش‌ها (Role Hierarchy)**
> آیا در فاز اول فقط قابلیت تعریف والد (`parent`) برای نمایش درختی کافی است، یا ارث‌بری خودکار Permissionها از والد به فرزند هم لازم است؟ پیشنهاد: **فاز اول فقط نمایش درختی. ارث‌بری در فاز بعدی.**

> [!NOTE]
> **۲. نقش‌های `as_role` در APIهای Inventory**
> در حال حاضر `CountTaskViewSet` و `DocTaskViewSet` از پارامتر `as_role` (مثل `counter`, `supervisor`, `manager`) استفاده می‌کنند. آیا این منطق (فیلتر بر اساس نقش عملیاتی) باید تغییر کند؟ پیشنهاد: **خیر. `as_role` یک پارامتر عملیاتی (Workflow) است و ربطی به نقش سازمانی ندارد. در فاز اول دست نمی‌زنیم.**

---

## تغییرات پیشنهادی (Proposed Changes)

### فاز ۱ — ساخت مدل `CustomRole` (بک‌اند)

---

#### [NEW] `accounts/models.py` — مدل `CustomRole`

یک مدل جدید `CustomRole` اضافه می‌شود که `Group` جنگو را ارث‌بری (Extend) می‌کند:

```python
class CustomRole(Group):
    """نقش سازمانی سفارشی با متادیتای اضافی"""
    title = models.CharField(max_length=150, verbose_name="عنوان فارسی")
    color = models.CharField(max_length=7, default="#94a3b8", verbose_name="رنگ سازمانی")
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    is_system = models.BooleanField(default=False, verbose_name="نقش سیستمی (غیرقابل حذف)")
    
    class Meta:
        verbose_name = "نقش سازمانی"
        verbose_name_plural = "نقش‌های سازمانی"
```

**مزیت:** چون `Group` را ارث‌بری می‌کند، تمام سیستم Permissionهای پایه جنگو بدون تغییر کار می‌کند. رابطه `Many-to-Many` کاربران با گروه‌ها نیز حفظ می‌شود.

---

#### [NEW] `accounts/migrations/00XX_create_custom_role.py` — مایگریشن

یک Migration در دو مرحله:
1. **Schema Migration:** ساخت جدول `CustomRole`.
2. **Data Migration:** تبدیل `Group`های فعلی به `CustomRole` با مپ کردن عناوین فارسی و رنگ‌ها از روی `rolesMap` فعلی فرانت‌اند.

| نام فعلی (Group.name) | عنوان فارسی (title) | رنگ (color) | is_system |
|---|---|---|:---:|
| `admin` | مدیریت کل سیستم | `#4f46e5` | ✅ |
| `manager` | مدیریت پروژه | `#0891b2` | ✅ |
| `supervisor` | سرپرست اجرا / شمارش | `#059669` | ✅ |
| `counter` | انباردار میدانی / انبارگردان | `#d97706` | ✅ |
| `doc_worker` | کارشناس اسناد | `#64748b` | ❌ |
| `doc_supervisor` | سرپرست اسناد | `#7c3aed` | ❌ |
| `document_expert` | کارشناس مدارک | `#7c3aed` | ❌ |
| `feeding_operator` | اپراتور تغذیه MT | `#be123c` | ❌ |

---

#### [MODIFY] [serializers.py](file:///e:/warehouse%20project/backend/accounts/serializers.py) — سریالایزر `CustomRole`

`GroupSerializer` با `CustomRoleSerializer` جایگزین می‌شود:

```python
class CustomRoleSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(many=True, queryset=Permission.objects.all(), required=False)
    children = serializers.SerializerMethodField()

    class Meta:
        model = CustomRole
        fields = ['id', 'name', 'title', 'color', 'parent', 'is_system', 'permissions', 'children']
        read_only_fields = ['is_system']

    def get_children(self, obj):
        children = obj.children.all()
        return CustomRoleSerializer(children, many=True).data
```

همچنین `UserSerializer.to_representation` اصلاح می‌شود تا `roles` به جای لیست نام‌ها، لیست آبجکت‌های کامل `{id, name, title, color}` را برگرداند.

---

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/accounts/views.py) — ویو `GroupViewSet`

| تغییر | جزئیات |
|---|---|
| کلاس `GroupViewSet` | تغییر نام به `CustomRoleViewSet` و استفاده از `CustomRole.objects.all()` |
| لیست هاردکد شده نقش‌های سیستمی | `['admin', 'manager', 'supervisor', 'counter']` → `group.is_system` |
| چک‌های `name='admin'` | → `user.has_perm('accounts.perm_usr_admin')` یا `user.is_superuser` |

---

#### [MODIFY] [urls.py](file:///e:/warehouse%20project/backend/accounts/urls.py) — ثبت روتر جدید

تغییر `GroupViewSet` به `CustomRoleViewSet` در `router.register`.

---

### فاز ۲ — حذف هاردکدهای نام نقش از بک‌اند

---

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/accounts/views.py) — حذف هاردکدها

| خط | کد فعلی (هاردکد) | کد جدید (استاندارد) |
|:---:|---|---|
| ۲۲ | `user.groups.filter(name='admin').exists()` | `user.is_superuser` (ادمین واقعی) |
| ۴۷ | `user.groups.filter(name='admin').exists()` | `user.is_superuser` (حفاظت از حذف) |
| ۶۵ | `user.groups.filter(name='admin').exists()` | `user.is_superuser` |
| ۱۳۲ | `group.name in ['admin', 'manager', 'supervisor', 'counter']` | `group.customrole.is_system` |

---

#### [MODIFY] [serializers.py](file:///e:/warehouse%20project/backend/accounts/serializers.py) — حذف هاردکدها

| خط | کد فعلی | کد جدید |
|:---:|---|---|
| ۴۷ | `instance.groups.filter(name='admin').exists()` | `instance.is_superuser` |
| ۵۴, ۸۵ | `request.user.groups.filter(name='admin').exists()` | `request.user.is_superuser` |
| ۹۲ | `instance.groups.filter(name='admin').exists()` | `instance.is_superuser` |
| ۹۹ | `'admin' in roles` | `'admin' in roles` (حفظ — چون در اینجا مقایسه با ورودی کاربر است) |

---

### فاز ۳ — هماهنگ‌سازی فرانت‌اند

---

#### [MODIFY] [state.service.ts](file:///e:/warehouse%20project/frontend/src/app/services/state.service.ts) — حذف `rolesMap` هاردکد

مپ هاردکد شده `rolesMap` حذف شده و به جای آن، داده‌ها مستقیماً از API پر می‌شوند (چون اکنون `title` و `color` از سرور می‌آیند).

---

#### [MODIFY] [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts) — آپدیت اینترفیس `Role`

```typescript
export interface Role {
  id: number;
  name: string;
  title: string;          // عنوان فارسی (از سرور)
  color: string;          // رنگ سازمانی (از سرور)
  parent: number | null;  // والد (برای سلسله‌مراتب)
  is_system: boolean;     // نقش سیستمی (غیرقابل حذف)
  permissions: number[];
  children?: Role[];
}
```

---

#### [MODIFY] [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts) — حذف هاردکدهای نقش

| تغییر | جزئیات |
|---|---|
| `systemRoles` getter | `['admin', 'manager', 'supervisor', 'counter']` → `r.is_system === true` |
| `customRoles` getter | `!sys.includes(r.name)` → `r.is_system === false` |
| `deleteRole` | `keyRoles.includes(role.name)` → `role.is_system` |
| `getPrimaryRole` / `getUserRoles` | `rolesMap[r.name]` → `r.title` و `r.color` مستقیم |
| `getRoleChildren` | پیاده‌سازی واقعی بر اساس `parent` |
| `getRoleTitleForForm` | `rolesMap[r.name]?.title` → `r.title` |

---

#### [MODIFY] [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html) — فعال‌سازی Color Picker

فیلد رنگ نقش که اکنون `disabled` و با متن «در این نسخه پشتیبانی نمی‌شود» مشخص شده، فعال می‌شود و به `roleForm.color` متصل می‌شود.

---

#### [MODIFY] [dispatch.ts](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts) — حذف فیلتر نقش هاردکد

فیلتر کردن `fieldWorkers`, `supervisors`, `managers` بر اساس نام نقش → بر اساس `is_system` یا بر اساس `group.id`.

---

## خلاصه فایل‌های تغییر

| فایل | عملیات | فاز | اولویت |
|---|:---:|:---:|:---:|
| [models.py](file:///e:/warehouse%20project/backend/accounts/models.py) | MODIFY (افزودن مدل) | ۱ | 🔴 |
| Migration جدید | NEW | ۱ | 🔴 |
| [serializers.py](file:///e:/warehouse%20project/backend/accounts/serializers.py) | MODIFY | ۱+۲ | 🔴 |
| [views.py](file:///e:/warehouse%20project/backend/accounts/views.py) | MODIFY | ۱+۲ | 🔴 |
| [urls.py](file:///e:/warehouse%20project/backend/accounts/urls.py) | MODIFY | ۱ | 🔴 |
| [init_roles.py](file:///e:/warehouse%20project/backend/accounts/management/commands/init_roles.py) | MODIFY | ۱ | 🟠 |
| [state.service.ts](file:///e:/warehouse%20project/frontend/src/app/services/state.service.ts) | MODIFY | ۳ | 🟠 |
| [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts) | MODIFY | ۳ | 🟠 |
| [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts) | MODIFY | ۳ | 🟠 |
| [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html) | MODIFY | ۳ | 🟡 |
| [dispatch.ts](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts) | MODIFY | ۳ | 🟡 |

---

## پلن تأیید و تست (Verification Plan)

### تست‌های خودکار
```bash
# 1. اجرای Migration و بررسی صحت
python manage.py makemigrations accounts
python manage.py migrate

# 2. بررسی عملکرد سرور
python manage.py runserver 8000

# 3. بیلد فرانت‌اند
npm run start
```

### تست‌های دستی
- [ ] ساخت نقش جدید با عنوان فارسی و رنگ سفارشی → بررسی ذخیره و نمایش
- [ ] ویرایش نقش موجود → بررسی بروزرسانی عنوان و رنگ
- [ ] حذف نقش سفارشی → تأیید موفقیت
- [ ] تلاش برای حذف نقش سیستمی → تأیید جلوگیری
- [ ] لاگین با کاربران مختلف → بررسی عدم تغییر دسترسی‌ها
- [ ] بررسی نمایش درختی نقش‌ها (اگر parent تنظیم شود)
- [ ] بررسی نمایش رنگ نقش‌ها در کارت‌های پرسنلی
- [ ] بررسی عملکرد صفحه dispatch (تخصیص شمارشگر/سرپرست/مدیر)

</div>
