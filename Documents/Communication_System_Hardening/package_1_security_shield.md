<div dir="rtl" align="right">

# 📦 بسته ۱: سپر امنیتی، کنترل دسترسی و تست پایه (Security Shield & TDD)

> **سند مرجع:** [implementation_plan_communication_hardening.md](implementation_plan_communication_hardening.md)
> **فازهای پوشش‌داده:** فاز ۰ + فاز ۱ + فاز ۲ + فاز ۳
> **ایرادات امنیتی حل‌شده:** ۱، ۲، ۳، ۴، ۵، ۶، ۷، ۸، ۹، ۱۰، ۱۱، ۱۲، ۱۵، ۱۷، ۴۰، ۴۱، ۴۸

---

## 🎯 هدف بسته ۱
مسدودسازی ۱۰۰٪ تمام رخنه‌های نشت داده (IDOR در خواندن و ارسال پیام)، بستن دانلود بی‌احراز هویت فایل‌ها با Signed URL، اعتبارسنجی نوع فایل‌ها برای ممانعت از XSS، و امن‌سازی وب‌سوکت در برابر شنود پیام‌ها؛ بدون تغییر در دیتابیس یا ظاهر UI.

---

## 🛠️ فایل‌های تحت تغییر در این بسته

| لایه | مسیر فایل | نوع تغییر |
| :--- | :--- | :---: |
| **تست بک‌اند** | `backend/communications/tests/__init__.py` | [NEW] |
| **تست بک‌اند** | `backend/communications/tests/base.py` | [NEW] |
| **تست بک‌اند** | `backend/communications/tests/test_access_rest.py` | [NEW] |
| **تست بک‌اند** | `backend/communications/tests/test_attachments.py` | [NEW] |
| **تست بک‌اند** | `backend/communications/tests/test_ws_access.py` | [NEW] |
| **تست فرانت** | `frontend/src/app/core/services/communication.service.spec.ts` | [NEW] |
| **بک‌اند** | `backend/communications/access.py` | [NEW] |
| **بک‌اند** | `backend/communications/broadcast.py` | [NEW] |
| **بک‌اند** | `backend/communications/views.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/permissions.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/serializers.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/consumers.py` | [MODIFY] |
| **بک‌اند** | `backend/common/media_urls.py` | [MODIFY] |

---

## 📋 چک‌لیست اقدامات اجرایی بسته ۱

### فاز ۰: هارنس تست و اثبات قرمز
- [ ] ساخت ساختار پوشه `communications/tests/`
- [ ] پیاده‌سازی `BaseCommsTestCase` در `base.py` با ۲ انبار و ۵ کاربر با نقش‌های متفاوت
- [ ] نوشتن تست‌های قرمز اثبات IDOR در `test_access_rest.py` (شکست کنترل‌شده)

### فاز ۱: لایه دسترسی واحد در REST
- [ ] ساخت `communications/access.py` متصل به `warehouse_scope.py`
- [ ] بازنویسی `permissions.py` و حذف فیلد مرده `accessible_warehouses`
- [ ] فیلتر اجباری `conversation__participants=user` در `MessageViewSet.get_queryset`
- [ ] اعتبارسنجی عضویت در `MessageViewSet.perform_create`
- [ ] افزودن `is_system`، `conv_type` و `participants` به `read_only_fields`
- [ ] محدودسازی ویرایش و حذف به نویسنده پیام/کامنت
- [ ] اعتبارسنجی `content_type_str` و بررسی وجود `object_id`
- [ ] فیلتر مخاطبین در `ChatContactsListView` بر اساس هم‌انباری بودن
- [ ] تفکیک فایل `views.py` و انتقال متدهای برودکست به `broadcast.py`

### فاز ۲: امن‌سازی پیوست‌ها و رسانه
- [ ] افزودن `'chat_attachments/'` و `'comment_attachments/'` به `PROTECTED_PREFIXES`
- [ ] استفاده از `signed_media_url` در سریالایزر با پنجره اعتبار ۷ روزه
- [ ] اعتبارسنجی پسوند و هدر فایل‌ها با Magic Bytes و رد فایل‌های اجرایی/SVG/HTML
- [ ] ذخیره فایل‌ها روی دیسک با نام یکتای UUID

### فاز ۳: امن‌سازی وب‌سوکت
- [ ] بررسی عضویت در رویداد `join_conversation` و `typing`
- [ ] تبدیل `current_target_group` در `CommentConsumer` به `set`
- [ ] اعتبارسنجی اتصال سوکت با توکن معتبر

---

## 🛡️ گیت پذیرش و فرمان‌های راستی‌آزمایی

```bash
# ۱. اجرای تست‌های بک‌اند ماژول ارتباطات (باید ۳۰ تست سبز شود)
cd "E:/warehouse project/backend" && python manage.py test communications -v 2

# ۲. اجرای تست‌های پایه فرانت‌اند
cd "E:/warehouse project/frontend" && npm test
```

---

## 💬 پرامپت آماده برای شروع چت ۱ (کپی و ارسال در چت جدید)

```text
سلام. من می‌خواهم «بسته ۱: سپر امنیتی، کنترل دسترسی و تست پایه» از سیستم ارتباطات را پیاده‌سازی کنم.
لطفاً فایل‌های زیر را مبنا قرار بده:
1. Documents\Communication_System_Hardening\package_1_security_shield.md
2. Documents\Communication_System_Hardening\task_communication_hardening.md
3. Documents\Communication_System_Hardening\implementation_plan_communication_hardening.md

لطفاً فازهای ۰، ۱، ۲ و ۳ را مطابق چک‌لیست بسته ۱ اجرا کن، تست‌های خودکار را بساز و پس از سبز شدن همه تست‌ها در ترمینال، گزارش بده.
```

</div>
