<div dir="rtl" align="right">

# رفع باگ‌های نهایی سیستم ارتباطات (Communications)

بر اساس گزارش ممیزی نهایی سیستم ارتباطات، ۱۱ باگ و نقص باقیمانده باید برطرف شود. این تغییرات پایداری، امنیت و کارایی سیستم را تضمین می‌کنند.

## Open Questions

> [!NOTE]
> نیازی به سوال باز نیست. تمامی موارد به روشنی توسط کاربر مشخص شده‌اند و طبق آن‌ها پیاده‌سازی انجام می‌شود.

## Proposed Changes

---

### تنظیمات و محدودیت درخواست (Throttling)

#### [MODIFY] `backend/config/settings.py`
- کلاس‌های `AnonRateThrottle` و `UserRateThrottle` از تنظیمات `DEFAULT_THROTTLE_CLASSES` حذف می‌شوند تا کل سیستم پشت Cloudflare مسدود نشود و تنها `ScopedRateThrottle` باقی می‌ماند.

#### [MODIFY] `backend/communications/views.py`
- در ویوی مربوط به `MessageViewSet` (برای `upload_attachment`) به صورت صریح `throttle_scope = 'chat_upload'` قرار داده می‌شود.

---

### امنیت و سطح دسترسی (Security & Access Control)

#### [MODIFY] `backend/communications/serializers.py`
- فیلد `'conversation'` در کلاس `MessageSerializer` به لیست `read_only_fields` اضافه می‌شود تا از تغییر و انتقال پیام به گفتگوی دیگر جلوگیری شود.

#### [MODIFY] `backend/communications/access.py`
- تابع `can_post_to_conversation` بهبود می‌یابد؛ برای چت‌های `ANNOUNCEMENT` در صورتی که `conversation.warehouse_id` وجود داشته باشد، تابع `can_access_warehouse` فراخوانی می‌شود.

#### [MODIFY] `backend/communications/admin.py`
- پنل ادمین ارتباطات به صورت Read-Only تنظیم می‌شود.
- متدهای `has_add_permission`، `has_change_permission` و `has_delete_permission` برای تمامی مدل‌ها برابر `False` بازگشت داده می‌شوند.
- متد `get_queryset` در تمامی مدل‌های ادمین Override می‌شود تا مدیران غیر Superuser فقط دیتاهای مربوط به انبارهای خود (`user.assigned_warehouses`) را ببینند.

---

### بهینه‌سازی دیتابیس و پاکسازی (Optimization & Cleanup)

#### [MODIFY] `backend/communications/views.py`
- در متد `mark_as_read` حلقه افزونشی به کد Bulk تغییر می‌یابد: `user.read_chat_messages.add(*unread_messages)`.
- ایمپورت‌های بلااستفاده (`CanAccessWarehouseObject` و `can_modify_comment`) پاک می‌شوند.

#### [MODIFY] `backend/communications/consumers.py`
- تولید و اتصال به گروه `chat_warehouse_{self.wh_id}` که بلااستفاده است، از کد سوکت‌ها حذف می‌شود.

#### [NEW] `backend/communications/file_utils.py`
- توابع `validate_uploaded_file` و `DISALLOWED_EXTENSIONS` از `views.py` استخراج شده و به این فایل مستقل منتقل می‌شوند تا قانون ۵۰۰ خط رعایت شود.

---

### فرانت‌اند و رابط کاربری (Frontend & UI)

#### [MODIFY] `frontend/src/app/core/services/communication.service.ts`
- خطای پرش بج خوانده نشده برطرف می‌شود. دریافت `unread_total` با محاسبه صحیح: `const count = Math.max(0, this.totalUnreadCount() + (payload.data.delta || 0));` اصلاح می‌شود.
- اینترفیس‌ها (Interfaces) از بالای این فایل استخراج شده و به فایل مستقل منتقل می‌شوند.

#### [NEW] `frontend/src/app/core/services/communication.types.ts`
- حاوی Typeها و Interfaceهای استخراج شده از سرویس ارتباطات.

#### [MODIFY] `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.html`
- کلمه هاردکد `<p>آنلاین</p>` حذف می‌شود.
- وضعیت تیک خوانده شدن پیام اصلاح می‌گردد (نمایش `✓✓` در صورت `msg.read_by_count > 0` و در غیر این‌صورت نمایش `✓`).

#### [MODIFY] `frontend/src/app/core/services/communication.service.spec.ts`
- برای رفع خطای `open requests` در تست‌های انگولار، داده مربوط به درخواست `GET /api/public/config/` ماک و Flush می‌شود.

## Verification Plan

### Automated Tests
- اجرای تست‌های بک‌اند برای ماژول ارتباطات: `python manage.py test communications -v 2`
- اجرای تست‌های فرانت‌اند: `npx ng test --watch=false`
- اطمینان از پاس شدن تمامی تست‌ها بدون اخطار و خطای سرور.

</div>
