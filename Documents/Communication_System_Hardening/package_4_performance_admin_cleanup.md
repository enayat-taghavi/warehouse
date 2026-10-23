<div dir="rtl" align="right">

# 📦 بسته ۴: کارایی دیتابیس، پنل ادمین، تنظیمات و پاکسازی نهایی (Performance & Maintenance)

> **سند مرجع:** [implementation_plan_communication_hardening.md](implementation_plan_communication_hardening.md)
> **فازهای پوشش‌داده:** فاز ۵ + فاز ۸ + فاز ۹
> **پیش‌نیاز:** بسته‌های ۱، ۲ و ۳
> **ایرادات حل‌شده:** ۲۳، ۲۷، ۳۳، ۴۳، ۴۴، ۴۵، ۴۶، ۴۷، ۴۹، ۵۰، ۵۱، ۵۲، ۵۳، ۵۴
> **نکات داوری اعمال‌شده:** حفظ قطعی `GenericForeignKey` در مدل، حفظ ساختار استاندارد ایندکس و اجرای Hard Delete در کامند Purge روی `all_objects`.

---

## 🎯 هدف بسته ۴
بهینه‌سازی عمیق کارایی دیتابیس، حذف کوئری‌های سنگین N+1 در سریالایزرها و برودکست، مهاجرت وضعیت خوانده‌شدن به الگوی مقیاس‌پذیر `last_read_message`، ایجاد پنل ادمین جنگو، اتصال واقعی سوئیچ‌های تنظیمات، پاکسازی اسکریپت‌های موقت ریشه و اتصال به Redis Channel Layer.

---

## 🛠️ فایل‌های تحت تغییر در این بسته

| لایه | مسیر فایل | نوع تغییر |
| :--- | :--- | :---: |
| **تست بک‌اند** | `backend/communications/tests/test_performance.py` | [NEW] |
| **تست بک‌اند** | `backend/communications/tests/test_settings_and_purge.py` | [NEW] |
| **بک‌اند** | `backend/communications/admin.py` | [NEW] |
| **بک‌اند** | `backend/communications/models.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/views.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/serializers.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/broadcast.py` | [MODIFY] |
| **بک‌اند** | `backend/communications/management/commands/purge_expired_chat_media.py` | [MODIFY] |
| **بک‌اند** | `backend/warehouses/services.py` | [MODIFY] |
| **بک‌اند** | `backend/config/settings.py` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/core/services/communication.service.ts` | [MODIFY] |
| **فرانت‌اند** | `frontend/src/app/components/settings/settings.html` | [MODIFY] |
| **فایل‌های ریشه** | حذف اسکریپت‌های تستی موقت از `backend/` | [DELETE] |

---

## 📋 چک‌لیست اقدامات اجرایی بسته ۴

### فاز ۵: بازطراحی وضعیت خوانده‌شدن و کارایی
- [ ] ساخت مدل `ConversationParticipant` با فیلد `last_read_message` و ایجاد مایگریشن
- [ ] تبدیل `mark_as_read` به یک کوئری سریع `UPDATE` تک‌خطی
- [ ] محاسبه `unread_count` با `annotate` در ViewSet به جای متد سریالایزر (حذف N+1)
- [ ] بهینه‌سازی `last_message` با `Prefetch` و `select_related('sender')`
- [ ] خروج لاجیک برودکست از چرخه مسدودکننده Request با `transaction.on_commit`

### فاز ۸: تنظیمات، پاکسازی و انطباق
- [ ] انتشار `chat_enabled` و `chat_file_sharing` در `PublicConfig` و اعمال گارد ۴۰۳ در پرمیشن‌ها
- [ ] اتصال `isChatEnabled` در فرانت به تنظیمات دریافتی سرور
- [ ] اصلاح دستور `purge_expired_chat_media.py` برای پاکسازی فایل‌ها از دیسک با کوئری روی `all_objects`
- [ ] ایجاد `communications/admin.py` با ثبت مدل‌های چت و فیلتر انبار
- [ ] حذف ۵ فایل اسکریپت تستی موقت از ریشه `backend/`
- [ ] حذف ایمپورت‌های هرز (حذف `import uuid` و **حفظ حتمی `GenericForeignKey`**)
- [ ] به‌روزرسانی `task_communication_system.md` و هم‌تراز کردن وضعیت با واقعیت

### فاز ۹: زیرساخت Redis (در صورت در دسترس بودن ردیس)
- [ ] پیکربندی `channels_redis.core.RedisChannelLayer` در `settings.py`

---

## 🛡️ گیت پذیرش و فرمان‌های راستی‌آزمایی

```bash
# ۱. اجرای کل مجموعه تست‌های بک‌اند ارتباطات (تمام ۶۷ تست باید سبز باشند)
cd "E:/warehouse project/backend" && python manage.py test communications -v 2

# ۲. راستی‌آزمایی مایگریشن‌ها و چک کلی سلامت سیستم
python manage.py check

# ۳. اجرای تمام تست‌های فرانت‌اند
cd "E:/warehouse project/frontend" && npm test
```

---

## 💬 پرامپت آماده برای شروع چت ۴ (کپی و ارسال در چت جدید)

```text
سلام. من می‌خواهم «بسته ۴: کارایی دیتابیس، پنل ادمین، تنظیمات و پاکسازی نهایی» از سیستم ارتباطات را پیاده‌سازی کنم.
لطفاً فایل‌های زیر را مبنا قرار بده:
1. Documents\Communication_System_Hardening\package_4_performance_admin_cleanup.md
2. Documents\Communication_System_Hardening\task_communication_hardening.md
3. Documents\Communication_System_Hardening\implementation_plan_communication_hardening.md

بسته‌های ۱، ۲ و ۳ قبلاً اجرا شده‌اند. لطفاً فازهای ۵، ۸ و ۹ را با رعایت نکات داوری (حفظ GenericForeignKey، عدم ساخت ایندکس تکراری و پاکسازی صحیح دیسک در Purge) پیاده‌سازی کن و تست‌های نهایی را اجرا کن.
```

</div>
