<div dir="rtl" align="right">

# گزارش تکمیل — ارتقاء سیستم نقش‌ها (Role System Upgrade)

## خلاصه تغییرات

مدل `CustomRole` به عنوان توسعه‌دهنده مدل `Group` جنگو ساخته شد و تمام هاردکدهای نام نقش از بک‌اند و فرانت‌اند حذف شدند. اکنون نقش‌ها فیلدهای `title` (عنوان فارسی)، `color` (رنگ سازمانی) و `is_system` (نقش سیستمی) را مستقیماً از دیتابیس دریافت می‌کنند.

---

## فایل‌های تغییریافته

### بک‌اند (Backend)

| فایل | تغییر |
|---|---|
| [models.py](file:///e:/warehouse%20project/backend/accounts/models.py) | افزودن مدل `CustomRole` با فیلدهای `title`, `color`, `parent`, `is_system` |
| [0010_create_custom_role.py](file:///e:/warehouse%20project/backend/accounts/migrations/0010_create_custom_role.py) | مایگریشن ساخت جدول (Schema) |
| [0011_populate_custom_roles.py](file:///e:/warehouse%20project/backend/accounts/migrations/0011_populate_custom_roles.py) | مایگریشن داده (تبدیل ۱۶ Group موجود به CustomRole) |
| [serializers.py](file:///e:/warehouse%20project/backend/accounts/serializers.py) | جایگزینی `GroupSerializer` → `CustomRoleSerializer` + حذف هاردکدهای `name='admin'` + ارسال `role_objects` در پاسخ API |
| [views.py](file:///e:/warehouse%20project/backend/accounts/views.py) | جایگزینی `GroupViewSet` → `CustomRoleViewSet` + حذف هاردکدهای `name='admin'` + محافظت حذف بر اساس `is_system` |
| [urls.py](file:///e:/warehouse%20project/backend/accounts/urls.py) | آپدیت روتر (`CustomRoleViewSet`) |
| [init_roles.py](file:///e:/warehouse%20project/backend/accounts/management/commands/init_roles.py) | آپدیت کامند مدیریتی برای استفاده از `CustomRole` |

### فرانت‌اند (Frontend)

| فایل | تغییر |
|---|---|
| [accounts-http.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/http/accounts-http.service.ts) | افزودن `title`, `color`, `parent`, `is_system`, `children` به اینترفیس `Role` |
| [state.service.ts](file:///e:/warehouse%20project/frontend/src/app/services/state.service.ts) | حذف `rolesMap` هاردکد (اکنون به صورت پویا از API پر می‌شود) |
| [users.ts](file:///e:/warehouse%20project/frontend/src/app/components/users/users.ts) | حذف آرایه هاردکد `['admin', 'manager', ...]` → استفاده از `r.is_system` + استفاده از `r.title` و `r.color` مستقیم + افزودن `color` به `roleForm` + پیاده‌سازی واقعی `getRoleChildren` |
| [users.html](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html) | فعال‌سازی Color Picker (حذف `disabled`) + نمایش کد رنگ |

---

## تغییرات کلیدی در API

### پاسخ `GET /api/auth/roles/` (قبل و بعد)

**قبل:**
```json
{ "id": 3, "name": "admin", "permissions": [1, 2, 3] }
```

**بعد:**
```json
{
  "id": 3,
  "name": "admin",
  "title": "مدیریت کل سیستم",
  "color": "#4f46e5",
  "parent": null,
  "is_system": true,
  "permissions": [1, 2, 3],
  "children": []
}
```

### پاسخ `GET /api/auth/users/` — فیلد جدید `role_objects`

```json
{
  "id": 1,
  "roles": ["admin"],
  "role_objects": [
    { "id": 3, "name": "admin", "title": "مدیریت کل سیستم", "color": "#4f46e5", "is_system": true }
  ]
}
```

---

## نتایج تست

| تست | نتیجه |
|---|:---:|
| `python manage.py check` | ✅ بدون خطا |
| `python manage.py migrate` | ✅ هر دو مایگریشن اعمال شد |
| بیلد فرانت‌اند (`ng serve`) | ✅ بدون خطا |
| تأیید داده — ۱۶ نقش CustomRole | ✅ همه `is_system=True` |

---

## تست‌های دستی (نیاز به تأیید شما)

- [ ] لاگین با کاربران مختلف → بررسی نمایش عنوان فارسی نقش‌ها
- [ ] صفحه مدیریت کاربران → بررسی بج‌های رنگی نقش
- [ ] ساخت نقش جدید → بررسی ذخیره عنوان + رنگ
- [ ] تلاش برای حذف نقش سیستمی → بررسی جلوگیری
- [ ] Color Picker → بررسی عملکرد و ذخیره رنگ

---

## پیشنهاد فازهای بعدی

> [!NOTE]
> **فاز ۴ — ارث‌بری Permission از والد به فرزند (Permission Inheritance)**
> اکنون فیلد `parent` فقط برای نمایش درختی استفاده می‌شود. در فاز بعدی می‌توان ارث‌بری خودکار Permissionها از نقش والد به نقش فرزند را پیاده‌سازی کرد.

> [!NOTE]
> **فاز ۵ — بازنگری پارامتر `as_role` در APIهای Inventory**
> پارامتر `as_role` در `CountTaskViewSet` و `DocTaskViewSet` (فایل `inventory/views.py`) همچنان از نام‌های هاردکد مثل `'counter'`, `'supervisor'`, `'manager'` استفاده می‌کند. این یک مفهوم عملیاتی (Workflow) است و نه سازمانی، ولی می‌توان آن را هم به ساختار داینامیک تبدیل کرد.

> [!NOTE]
> **فاز ۶ — Admin Panel جنگو**
> ثبت مدل `CustomRole` در Django Admin برای مدیریت مستقیم از پنل ادمین.

</div>
