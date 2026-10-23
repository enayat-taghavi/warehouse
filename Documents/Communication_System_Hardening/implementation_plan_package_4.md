<div dir="rtl" align="right">

# 📋 برنامه اجرایی بسته ۴: کارایی دیتابیس، پنل ادمین، تنظیمات و پاکسازی نهایی (Performance, Admin & Maintenance)

> **پروژه:** پایدارسازی جامع سیستم ارتباطات (Communication System Hardening)  
> **بسته هدف:** بسته ۴ (فاز ۵ + فاز ۸ + فاز ۹)  
> **اسناد مرجع:**
> - [package_4_performance_admin_cleanup.md](package_4_performance_admin_cleanup.md)
> - [task_communication_hardening.md](task_communication_hardening.md)
> - [implementation_plan_communication_hardening.md](implementation_plan_communication_hardening.md)
>
> **ایرادات تحت پوشش:** ۲۳، ۲۷، ۳۳، ۴۳، ۴۴، ۴۵، ۴۶، ۴۷، ۴۹، ۵۰، ۵۱، ۵۲، ۵۳، ۵۴  
> **نکات داوری اعمال‌شده:** حفظ قطعی `GenericForeignKey` در مدل، اجتناب از ایندکس تکراری روی فیلدهای مقید، و اجرای Hard Delete فایل و رکورد در کامند Purge روی `all_objects`.

---

## 🎯 اهداف بسته ۴

۱. **بهینه‌سازی کارایی دیتابیس و الگوی وضعیت خوانده‌شدن (فاز ۵):**
   - ایجاد مدل `ConversationParticipant` با فیلد `last_read_message` و `last_read_at` جهت تبدیل علامت‌گذاری خوانده‌شدن از حلقه سنگین رکوردی به یک عملیات تک‌کوئری سریع.
   - حفظ سازگاری عقبروی و الگوی Dual-Write بدون حذف فیلد `read_by` تا هیچ داده‌ای از دست نرود.
   - حذف کامل کوئری‌های N+1 در `ConversationViewSet` با `Prefetch` و `annotate` برای استخراج `last_message` و `unread_count`.
   - حل مشکل پرش پیام‌های هم‌میکروثانیه در `since_id` با افزودن Tie-breaker روی `id`.
   - خروج عملیات برودکست از چرخه مسدودکننده Request با `transaction.on_commit` و بهینه‌سازی ارسال نوتیفیکیشن اعضا.

۲. **تنظیمات، پنل ادمین و پاکسازی نهایی (فاز ۸):**
   - تعریف `chat_enabled` و `chat_file_sharing` در `DEFAULT_SETTINGS` و انتشار در `PublicConfigViewSet`.
   - اعمال گارد امنیتی `IsChatEnabled` در لایه پرمیشن‌های REST و قطع اتصال وب‌سوکت در حالت غیرفعال بودن چت.
   - اتصال سیگنال `isChatEnabled` در فرانت‌اند به تنظیمات دریافتی سرور.
   - بازنویسی کامل دستور `purge_expired_chat_media` بر روی `MessageAttachment.all_objects` جهت پاکسازی قطعی فایل‌های فیزیکی از دیسک و Hard Delete رکوردها.
   - ایجاد ماژول مدیریت ادمین جنگو `communications/admin.py` برای مانیتورینگ امن داده‌های چت و نظرات.
   - پاکسازی اسکریپت‌های تستی موقت ۵گانه ریشه پروژه و حذف ایمپورت‌های بدون استفاده (`uuid` در `models.py`) با **حفظ حتمی `GenericForeignKey`**.

۳. **پیکربندی لایه ردیس و سوکت‌ها (فاز ۹):**
   - پشتیبانی از `RedisChannelLayer` در `settings.py` در صورت تنظیم متغیر محیطی Redis با بازگشت امن به `InMemoryChannelLayer` برای محیط‌های توسعه و تست.

---

## 🛠️ فهرست تغییرات به تفکیک لایه‌ها و فایل‌ها

### ۱. لایه مدل‌ها و دیتابیس (Database & Models)

#### [MODIFY] [models.py](../../backend/communications/models.py)
- تعریف مدل جدید `ConversationParticipant` ارث‌بری کرده از `SyncModelMixin` شامل فیلدهای:
  - `conversation`: کلید خارجی به `Conversation` با `related_name='participant_memberships'`
  - `user`: کلید خارجی به مدل کاربر با `related_name='conversation_participations'`
  - `last_read_message`: کلید خارجی به `Message` (با `on_delete=SET_NULL`, `null=True`, `blank=True`)
  - `last_read_at`: فیلد زمانی آخرین خواندن
  - قیود: `UniqueConstraint(fields=['conversation', 'user'], name='unique_conversation_participant')`
- حذف `import uuid` بدون استفاده در ابتدای فایل و **حفظ صریح و قطعی `from django.contrib.contenttypes.fields import GenericForeignKey`**.

#### [NEW] `communications/migrations/0003_conversationparticipant_...py`
- مایگریشن ساختار برای ایجاد جدول `ConversationParticipant`.
- مایگریشن داده‌ای خودکار برای پر کردن اعضای گفتگوهای فعلی بر اساس `Conversation.participants` و محاسبه اولیه `last_read_message` بر اساس `read_by`.

---

### ۲. لایه منطق، سریالایزر و دیدها (Backend Views, Serializers & Access)

#### [MODIFY] [serializers.py](../../backend/communications/serializers.py)
- در `ConversationSerializer`:
  - بهینه‌سازی متد `get_last_message`: استفاده از پیام‌های از پیش بارگذاری‌شده (`obj.prefetched_messages`) در صورت وجود جهت صفر کردن کوئری N+1.
  - بهینه‌سازی متد `get_unread_count`: استفاده از مقدار محاسبه‌شده `getattr(obj, 'annotated_unread_count', None)` در صورت موجود بودن.
- در `MessageSerializer`:
  - بهینه‌سازی `get_read_by_count` با استفاده از فیلد محاسبه‌شده `annotated_read_by_count` در صورت وجود.

#### [MODIFY] [views.py](../../backend/communications/views.py)
- در `ConversationViewSet`:
  - اعمال `IsChatEnabled` در `permission_classes`.
  - در `get_queryset`: افزودن `Prefetch` پیام‌ها با `select_related('sender')` و `prefetch_related('attachments')` و محاسبه `unread_count` با استفاده از کوئری بهینه.
  - در `mark_as_read`: به‌روزرسانی سریع رکورد `ConversationParticipant` در یک تک‌کوئری `update_or_create` به همراه ثبت سازگار در `read_by` (Dual-write).
- در `MessageViewSet`:
  - اعمال `IsChatEnabled` در `permission_classes`.
  - در `get_queryset`: اضافه کردن Tie-breaker بر روی `id` در فیلتر `since_id` (`Q(created_at__gt=ref_msg.created_at) | Q(created_at=ref_msg.created_at, id__gt=ref_msg.id)`).
  - در `perform_create`: فراخوانی برودکست در `transaction.on_commit(lambda: broadcast_message_ws(msg, self.request))`.
  - در `upload_attachment`: بررسی سوئیچ `chat_file_sharing` از طریق `get_setting('chat_file_sharing', ...)` و بازگرداندن ۴۰۳ در صورت غیرفعال بودن.
- در `GenericCommentViewSet` و `ChatContactsListView`:
  - اعمال `IsChatEnabled` در دسترسی‌ها.

#### [MODIFY] [permissions.py](../../backend/communications/permissions.py)
- افزودن کلاس پرمیشن `IsChatEnabled`:
  - استخراج انبار مرتبط یا سراسری و بررسی `get_setting('chat_enabled', warehouse_id)`.
  - در صورت `False` بودن، پرتاب `PermissionDenied('سیستم پیام‌رسان در این انبار غیرفعال است')`.

#### [MODIFY] [broadcast.py](../../backend/communications/broadcast.py)
- بهینه‌سازی `broadcast_message_ws`:
  - جلوگیری از اجرای کوئری سنگین `count()` در حلقه به‌ازای هر عضو.
  - ارسال امن رویدادهای WebSocket به روم‌های کاربری بدون افت عملکرد سرور در گفتگوهای پرتعداد.

#### [MODIFY] [consumers.py](../../backend/communications/consumers.py)
- در `ChatConsumer.connect()`:
  - بررسی سوئیچ `chat_enabled` از طریق `get_setting`.
  - بستن اتصال با کد `4003` در صورتی که چت غیرفعال باشد.

---

### ۳. لایه تنظیمات، سرویس‌ها و پاکسازی دیسک (Settings, Admin & Purge)

#### [MODIFY] [services.py](../../backend/warehouses/services.py)
- افزودن کلیدهای زیر به `DEFAULT_SETTINGS`:
  ```python
  'chat_enabled': True,
  'chat_file_sharing': True,
  ```

#### [MODIFY] [warehouses/views.py](../../backend/warehouses/views.py)
- در `PublicConfigViewSet.list()`:
  - اضافه کردن `chat_enabled` و `chat_file_sharing` به خروجی پیکربندی عمومی.

#### [MODIFY] [purge_expired_chat_media.py](../../backend/communications/management/commands/purge_expired_chat_media.py)
- اصلاح کوئری برای استفاده از `MessageAttachment.all_objects.filter(created_at__lt=cutoff_date)`.
- حذف فیزیکی فایل‌ها و بندانگشتی‌ها از دیسک با `att.file.delete(save=False)`.
- اجرای حذف قطعی دیتابیس با `att.delete()`.

#### [NEW] [admin.py](../../backend/communications/admin.py)
- ثبت مدل‌های `Conversation`, `ConversationParticipant`, `Message`, `MessageAttachment`, `GenericComment` در پنل ادمین جنگو با:
  - فیلتر بر اساس انبار، نوع گفتگو و تاریخ ثبت.
  - فیلدهای جستجو بر روی متن، نام کاربری و شناسه کلاینت.
  - تعریف فیلدهای فقط‌خواندنی (`readonly_fields`) برای داده‌های حساس همگام‌سازی و ممیزی.

#### [MODIFY] [config/settings.py](../../backend/config/settings.py)
- پیکربندی لایه کانال‌ها (`CHANNEL_LAYERS`):
  - اتصال به `channels_redis.core.RedisChannelLayer` در صورت وجود متغیر محیطی `REDIS_URL` یا `REDIS_HOST`.
  - بازگشت هوشمند به `InMemoryChannelLayer` در غیاب ردیس.

#### [DELETE] اسکریپت‌های تستی موقت ریشه بک‌اند
- حذف فایل‌های:
  - `backend/check_conversation.py`
  - `backend/send_manager_message.py`
  - `backend/send_manager_reply_with_file.py`
  - `backend/send_manager_live_reply.py`
  - `backend/send_test_live_msg.py`

---

### ۴. لایه فرانت‌اند (Frontend UX & Settings Integration)

#### [MODIFY] [config-api.service.ts](../../frontend/src/app/core/api/config-api.service.ts)
- افزودن `chat_enabled?: boolean;` و `chat_file_sharing?: boolean;` به اینترفیس `PublicConfig`.

#### [MODIFY] [communication.service.ts](../../frontend/src/app/core/services/communication.service.ts)
- تزریق `ConfigApiService` یا گوش دادن به پیکربندی سراسری و به‌روزرسانی سیگنال `isChatEnabled`.
- در متد `ensureConnected`: اگر `!this.isChatEnabled()` بود، از برقراری اتصال خودداری کرده و اتصالات باز قبلی بسته شوند.

---

## 🧪 طرح آزمون و اعتبارسنجی (Verification Plan)

### ۱. آزمون‌های خودکار بک‌اند (Automated Backend Tests)

#### [NEW] `backend/communications/tests/test_performance.py`
- `test_mark_read_is_single_query`: اثبات تعداد کوئری ثابت و بهینه در خوانده شدن پیام‌ها (`assertNumQueries`).
- `test_mark_read_idempotent`: اثبات بی‌اثر بودن فراخوانی‌های مکرر `mark_as_read`.
- `test_conversation_list_query_count_is_constant`: اثبات عدم وجود N+1 در دریافت لیست گفتگوها برای تعداد ۵ و ۲۰ گفتگو.
- `test_message_list_query_count_is_constant`: اثبات عدم وجود N+1 در لیست پیام‌ها.
- `test_broadcast_query_count_independent_of_participants`: اثبات ثبات کارایی برودکست برای اتاق‌های با تعداد اعضای زیاد.
- `test_since_id_returns_same_timestamp_messages`: اثبات عدم گم شدن پیام‌های هم‌میکروثانیه با مکانیزم Tie-break.

#### [NEW] `backend/communications/tests/test_settings_and_purge.py`
- `test_chat_disabled_blocks_rest`: بازگرداندن کد ۴۰۳ در صورت غیرفعال بودن چت.
- `test_chat_disabled_rejects_websocket`: رد اتصال وب‌سوکت با کد ۴۰۰۳ هنگام غیرفعال بودن چت.
- `test_file_sharing_disabled_blocks_upload`: بازگرداندن کد ۴۰۳ هنگام آپلود در صورت خاموش بودن ارسال فایل.
- `test_warehouse_override_beats_global`: اثبات اولویت تنظیمات اختصاصی انبار بر تنظیمات سراسری.
- `test_purge_includes_soft_deleted_attachments`: پاکسازی کامل پیوست‌های حذف‌نرم‌شده (`all_objects`).
- `test_purge_dry_run_changes_nothing`: عدم حذف فایل یا رکورد در حالت `--dry-run`.
- `test_purge_deletes_physical_file_and_record`: اثبات آزادسازی حجم دیسک و حذف فیزیکی فایل و رکورد.
- `test_purge_respects_days_argument`: عدم حذف پیوست‌های تازه‌تر از سقف روز مشخص‌شده.

### ۲. دستورات اجرای آزمون

```bash
# اجرای آزمون‌های جدید و تمام آزمون‌های سیستم ارتباطات
& "backend\venv\Scripts\python.exe" manage.py test communications -v 2

# اجرای چک کلی سلامت سیستم و مایگریشن‌ها
& "backend\venv\Scripts\python.exe" manage.py check
```

---

> [!IMPORTANT]
> **تضمین رعایت اصول کلیدی:**
> ۱. ایندکس‌های مدل‌ها بدون تعریف افزونگی ایجاد می‌شوند (اعتماد به ایندکس ضمنی قیود یکتایی).
> ۲. ایمپورت `GenericForeignKey` در `models.py` کاملاً حفظ شده و بدون تغییر باقی می‌ماند.
> ۳. کامند Purge با تکیه بر `all_objects`، تمامی فایل‌های یتیم و حذف‌شده را از دیسک و دیتابیس پاکسازی می‌کند.

</div>
