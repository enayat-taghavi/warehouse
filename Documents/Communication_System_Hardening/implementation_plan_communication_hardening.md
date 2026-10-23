<div dir="rtl" align="right">

# طرح پیاده‌سازی مرحله‌بندی‌شده پایدارسازی سیستم ارتباطات و کامنت‌های تعاملی

> [!NOTE]
> **نسخه:** ۱.۰ — ۱۴۰۵/۰۶/۰۲ (۲۴ اوت ۲۰۲۶)
> **مبنا:** بازبینی کامل کد اپ `communications` (بک‌اند + فرانت) و شناسایی ۵۴ ایراد.
> **وضعیت:** پیش‌نویس در انتظار تأیید. **هیچ خطی از کد تا این لحظه تغییر نکرده است.**

---

## ۱. دامنه

**در دامنه:**

| لایه | مسیرها |
| :--- | :--- |
| بک‌اند | `backend/communications/**`، `common/media_urls.py`، `config/settings.py` (فقط `CHANNEL_LAYERS` و `REST_FRAMEWORK`) |
| فرانت‌اند | `core/services/communication.service.ts`، `components/communications/**`، `components/layout/layout.ts`، `ngsw-config.json` |
| تست | `backend/communications/tests/**` (جدید)، `*.spec.ts` کنار سورس |

**خارج از دامنه این طرح** (نیازمند تصمیم و طرح جداگانه): سیستم Presence واقعی، رمزنگاری سرتاسری، Virtual Scrolling، جستجوی full-text در پیام‌ها، Web Push کامل با VAPID، بازنویسی `notifications/consumers.py` (که مستقل از چت، بدون احراز هویت است).

---

## ۲. قواعد اجرای این طرح

1. **هر فاز یک واحد قابل استقرار مستقل است.** فاز بعدی بدون سبز شدن دروازه فاز قبل شروع نمی‌شود.
2. **هیچ فازی داده کاربر را پاک نمی‌کند.** مهاجرت‌ها فقط `additive` یا `dual-write` هستند؛ حذف ستون قدیمی حداقل یک فاز بعد از سبز شدن ستون جدید.
3. **حذف = `soft_delete()`** (tombstone)، هرگز `delete()` سخت.
4. **قاعده ۵۰۰ خط:** `communications/views.py` الان ۲۸۶ خط است و با افزودن لایه دسترسی از ۵۰۰ عبور می‌کند. در فاز ۱ به `communications/access.py` (قواعد دسترسی) + `communications/views.py` (فقط ViewSetها) + `communications/broadcast.py` (توابع WS) تفکیک می‌شود.
5. **دستورهای بیلد/تست/مایگریشن/ری‌استارت را من پیشنهاد می‌دهم، اجرا با شماست.**
6. هر فاز = یک کامیت مستقل روی `main`، بدون تریلر `Co-Authored-By`.
7. تست‌های بک‌اند هرگز در ریشه پروژه ساخته نمی‌شوند؛ فقط زیر `communications/tests/`.

---

## ۳. نقشه کلی فازها

| فاز | عنوان | لایه | ایرادات پوشش‌داده | ریسک | وابسته به |
| :---: | :--- | :---: | :--- | :---: | :---: |
| **۰** | زیرساخت تست و اثبات ایرادات | تست | — | پایین | — |
| **۱** | لایه دسترسی واحد در REST | بک‌اند | ۱، ۲، ۳، ۷، ۸، ۹، ۱۰، ۱۵، ۱۷، ۴۰، ۴۱، ۴۸ | 🔴 بالا | ۰ |
| **۲** | امن‌سازی پیوست‌ها و سرو رسانه | بک‌اند + SW | ۴، ۵، ۶ | 🟠 متوسط | ۱ |
| **۳** | امن‌سازی WebSocket | بک‌اند | ۱۱، ۱۲ | 🟠 متوسط | ۱ |
| **۴** | یکپارچگی داده و تحویل مطمئن پیام | Full-Stack | ۱۳، ۱۴، ۱۶، ۱۸، ۱۹، ۲۰، ۲۱، ۲۲، ۲۴ | 🔴 بالا | ۱ |
| **۵** | بازطراحی وضعیت خوانده‌شدن و کارایی | بک‌اند | ۳۳، ۴۴، ۴۵، ۴۶، ۴۷، ۴۹ | 🔴 بالا | ۴ |
| **۶** | اصلاح باگ‌های کلاینت | فرانت | ۲۸، ۲۹، ۳۰، ۳۱، ۳۲، ۳۴، ۳۵، ۳۶، ۳۷، ۴۲ | 🟠 متوسط | ۳، ۵ |
| **۷** | فعال‌سازی واقعی کامنت‌های تعاملی | Full-Stack | ۲۵، ۲۶، ۳۸، ۳۹ | 🟠 متوسط | ۳ |
| **۸** | تنظیمات، پاکسازی و انطباق | Full-Stack | ۲۳، ۲۷، ۵۰، ۵۱، ۵۲، ۵۳، ۵۴ | 🟢 پایین | همه |
| **۹** | زیرساخت Redis برای Channels | زیرساخت | ۴۳ | 🔴 بالا | تصمیم شما |

> **چرا فاز ۹ آخر است ولی ایرادش بحرانی است؟** چون تنها فازی است که به تصمیم زیرساختی خارج از کد (نصب Redis) وابسته است. اگر Redis همین حالا در دسترس باشد، فاز ۹ را به بعد از فاز ۳ منتقل می‌کنیم.

---

## ۴. فاز ۰ — زیرساخت تست و اثبات ایرادات

**هدف:** پیش از هر اصلاحی، یک هارنس تست بسازیم که ایرادات فعلی را **واقعاً شکار کند**. بدون این گام، هیچ‌کدام از فازهای بعد قابل اثبات نیست (ایراد ۵۰: اپ `communications` امروز صفر تست دارد).

**اقدامات:**

| # | اقدام | فایل |
| :---: | :--- | :--- |
| ۰.۱ | ساخت پکیج تست | `communications/tests/__init__.py` |
| ۰.۲ | کلاس پایه `BaseCommsTestCase`: دو انبار، پنج کاربر (سوپریوزر، مدیر انبار۱، پرسنل انبار۱، پرسنل انبار۲، کاربر بدون تخصیص)، یک گفتگوی دونفره، یک گروه انبار، یک کانال اطلاعیه | `communications/tests/base.py` |
| ۰.۳ | سه تست «قرمز» که ایرادات ۱، ۴ و ۱۰ را اثبات می‌کنند | `communications/tests/test_access_rest.py` |
| ۰.۴ | فایل spec پایه سرویس فرانت با mock کردن `HttpClient` و `WebSocket` | `core/services/communication.service.spec.ts` |

**تست‌های این فاز:**

```
communications/tests/test_access_rest.py
  RedFlagTests.test_outsider_can_currently_read_private_messages   → باید الان FAIL شود
  RedFlagTests.test_outsider_can_currently_attach_to_any_message   → باید الان FAIL شود
  RedFlagTests.test_comments_endpoint_currently_leaks_everything   → باید الان FAIL شود
```

هر سه با `assert` روی رفتار **درست** نوشته می‌شوند، پس امروز شکست می‌خورند. این شکست، سند اثبات ایراد است و در فاز ۱ سبز می‌شود.

**دستور اجرا:**

```bash
cd "E:/warehouse project/backend" && python manage.py test communications -v 2
```

```bash
cd "E:/warehouse project/frontend" && npm test
```

> ابزار تست فرانت این پروژه `@angular/build:unit-test` با **vitest + jsdom** است (۱۶ فایل spec موجود). اگر اجرای پایه `npm test` خطا داد، رفع آن بخشی از فاز ۰ است.

**🛡️ دروازه فاز ۰:** هارنس اجرا می‌شود؛ سه تست قرمز **دقیقاً به دلیل مستندشده** شکست می‌خورند (نه به دلیل خطای setup). خروجی شکست‌ها ضمیمه کامیت می‌شود.

---

## ۵. فاز ۱ — لایه دسترسی واحد در REST

**هدف:** بستن IDORها. امروز هر کاربر لاگین‌شده می‌تواند تمام پیام‌های خصوصی سازمان را بخواند ([views.py:175](../../backend/communications/views.py:175)) و هر کامنتی را ویرایش کند ([views.py:237](../../backend/communications/views.py:237)).

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۱.۱ | ساخت `communications/access.py` به‌عنوان **تنها منبع حقیقت** دسترسی: `visible_conversations(user)`، `can_read_conversation`، `can_post_to_conversation`، `can_access_comment_target`. پیاده‌سازی روی `common/warehouse_scope.py` که منبع رسمی پروژه است | `access.py` (جدید) | ۱۵ |
| ۱.۲ | بازنویسی `permissions.py`: حذف شاخه مرده `accessible_warehouses` (که در مدل کاربر **وجود ندارد**) و جایگزینی `managed_warehouses` با `user_warehouse_ids()` | [permissions.py:20](../../backend/communications/permissions.py:20) | ۱۵ |
| ۱.۳ | `MessageViewSet.get_queryset`: فیلتر اجباری `conversation__participants=user` (یا دسترسی انبار برای گروه/اطلاعیه) | [views.py:175](../../backend/communications/views.py:175) | ۱ |
| ۱.۴ | `MessageViewSet.perform_create`: بررسی عضویت → `PermissionDenied`؛ `DoesNotExist` → `ValidationError` (۴۰۰ به‌جای ۵۰۰) | [views.py:192](../../backend/communications/views.py:192) | ۲ |
| ۱.۵ | ویرایش/حذف پیام فقط توسط نویسنده (`IsMessageAuthor`) | [permissions.py:26](../../backend/communications/permissions.py:26) | ۱۷ |
| ۱.۶ | افزودن `is_system`، `conv_type`، `participants`، `warehouse`، `author`، `mentioned_users` به `read_only_fields` | [serializers.py:50](../../backend/communications/serializers.py:50)، [:63](../../backend/communications/serializers.py:63)، [:137](../../backend/communications/serializers.py:137) | ۳، ۸، ۹ |
| ۱.۷ | `ConversationViewSet`: افزودن `IsConversationParticipantOrAdmin` به `permission_classes`، محدود کردن ساخت `announcement`/`warehouse_group` به نقش مدیر، فعال کردن صفحه‌بندی | [views.py:31](../../backend/communications/views.py:31) | ۸، ۹، ۴۸ |
| ۱.۸ | `GenericCommentViewSet`: بدون `model_name` + `object_id` → ۴۰۰؛ فیلتر انبار؛ ویرایش/حذف فقط نویسنده؛ صفحه‌بندی | [views.py:237](../../backend/communications/views.py:237) | ۱۰، ۴۸ |
| ۱.۹ | اعتبارسنجی `content_type_str` با allowlist مدل‌های مجاز + بررسی وجود `object_id` (پایان خطاهای ۵۰۰) | [serializers.py:142](../../backend/communications/serializers.py:142) | ۴۰، ۴۱ |
| ۱.۱۰ | `ChatContactsListView`: محدود به هم‌انباری‌های کاربر، مصرف واقعی `warehouse_id` (که امروز خوانده و نادیده گرفته می‌شود)، صفحه‌بندی | [views.py:272](../../backend/communications/views.py:272) | ۷ |
| ۱.۱۱ | تفکیک فایل‌ها طبق قاعده ۵۰۰ خط: انتقال `broadcast_message_ws`/`broadcast_comment_ws` به `broadcast.py` | [views.py:80](../../backend/communications/views.py:80) | قاعده |

**تست‌های این فاز** — `communications/tests/test_access_rest.py`:

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_outsider_cannot_list_messages` | ۴۰۳/خالی به‌جای نشت کامل (ایراد ۱) |
| `test_participant_can_list_messages` | رگرسیون نداشتن مسیر سالم |
| `test_outsider_cannot_post_message` | ۴۰۳ (ایراد ۲) |
| `test_missing_conversation_returns_400_not_500` | ۴۰۰ (ایراد ۲) |
| `test_is_system_flag_is_ignored_from_client` | پیام ذخیره‌شده `is_system=False` (ایراد ۳) |
| `test_cannot_convert_direct_to_announcement` | `conv_type` تغییر نمی‌کند (ایراد ۸) |
| `test_outsider_cannot_rename_or_delete_announcement` | ۴۰۳ (ایراد ۹) |
| `test_participants_field_is_read_only` | تزریق عضو دلخواه بی‌اثر است (ایراد ۹) |
| `test_non_author_cannot_edit_message` / `..._delete_message` | ۴۰۳ (ایراد ۱۷) |
| `test_comments_require_target_params` | ۴۰۰ به‌جای بازگرداندن کل کامنت‌ها (ایراد ۱۰) |
| `test_comment_scoped_to_user_warehouses` | کامنت انبار دیگر دیده نمی‌شود (ایراد ۱۰) |
| `test_non_author_cannot_edit_comment` | ۴۰۳ (ایراد ۱۰) |
| `test_malformed_content_type_returns_400` | ورودی `"garbage"` → ۴۰۰ نه ۵۰۰ (ایراد ۴۰) |
| `test_disallowed_content_type_rejected` | `auth.user` → ۴۰۰ (ایراد ۴۰) |
| `test_nonexistent_object_id_rejected` | ۴۰۰ (ایراد ۴۱) |
| `test_contacts_limited_to_shared_warehouses` | کاربر انبار۲ در فهرست کاربر انبار۱ نیست (ایراد ۷) |
| `test_contacts_paginated` | پاسخ دارای `results`/`count` (ایراد ۷) |
| `test_conversation_list_paginated` | ایراد ۴۸ |

**🛡️ دروازه فاز ۱:** هر ۱۸ تست سبز + سه تست قرمز فاز ۰ سبز + `python manage.py check` بدون خطا + هیچ فایل `communications/*.py` بالای ۵۰۰ خط.

---

## ۶. فاز ۲ — امن‌سازی پیوست‌ها و سرو رسانه

**هدف:** بستن مسیر XSS ذخیره‌شده و دانلود بی‌احراز هویت. امروز `PROTECTED_PREFIXES` در `common/media_urls.py` فقط `item_photos/` را می‌پوشاند، پس هر فایل چت با URL ساده و **بدون لاگین** قابل دانلود است.

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۲.۱ | افزودن `chat_attachments/` و `comment_attachments/` به `PROTECTED_PREFIXES` | `common/media_urls.py` | ۵ |
| ۲.۲ | استفاده از `signed_media_url()` در `get_file_url` به‌جای `obj.file.url` خام | [serializers.py:28](../../backend/communications/serializers.py:28) | ۵ |
| ۲.۳ | allowlist سرورسمتی: پسوند + **magic bytes** واقعی فایل؛ `content_type` کلاینت دیگر معتبر نیست | [views.py:203](../../backend/communications/views.py:203) | ۶ |
| ۲.۴ | نام‌گذاری فایل روی دیسک با UUID؛ نام اصلی فقط متادیتا | `views.py` / `models.py` | ۶ |
| ۲.۵ | `Content-Disposition: attachment` برای هر نوع غیر از تصویرِ تأییدشده؛ رد کامل SVG | `common/media_urls.py` | ۶ |
| ۲.۶ | بررسی مالکیت و عضویت پیش از ساخت پیوست | [views.py:218](../../backend/communications/views.py:218) | ۴ |
| ۲.۷ | تولید `thumbnail` (فیلد موجود است ولی هرگز پر نمی‌شود) | `views.py` | — |
| ۲.۸ | افزودن `dataGroup` برای پیوست‌های چت در سرویس‌ورکر | `ngsw-config.json` | ۳۷ |

**تست‌های این فاز** — `communications/tests/test_attachments.py`:

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_rejects_html_payload` | آپلود `.html` → ۴۰۰ (ایراد ۶) |
| `test_rejects_svg_payload` | ۴۰۰ (ایراد ۶) |
| `test_rejects_extension_content_mismatch` | فایل HTML با نام `a.png` → ۴۰۰ (ایراد ۶) |
| `test_accepts_valid_png_and_pdf` | رگرسیون مسیر سالم |
| `test_rejects_oversize_file` | >۱۰MB → ۴۰۰ |
| `test_cannot_attach_to_other_users_message` | ۴۰۳ (ایراد ۴) |
| `test_cannot_attach_to_foreign_conversation` | ۴۰۳ (ایراد ۴) |
| `test_file_url_is_signed` | پاسخ حاوی امضا و `exp` است (ایراد ۵) |
| `test_unsigned_chat_media_is_denied` | درخواست بدون امضا → ۴۰۳ (ایراد ۵) |
| `test_tampered_signature_denied` | امضای دست‌کاری‌شده → ۴۰۳ |
| `test_non_image_served_as_attachment` | هدر `Content-Disposition` (ایراد ۶) |
| `test_stored_name_is_uuid` | نام دیسک ≠ نام کاربر |

**🛡️ دروازه فاز ۲:** ۱۲ تست سبز + راستی‌آزمایی دستی: باز کردن URL یک پیوست در مرورگر ناشناس (Incognito و بدون لاگین) → باید ۴۰۳ بدهد.

---

## ۷. فاز ۳ — امن‌سازی WebSocket

**هدف:** بستن شنود زندهٔ گفتگوهای دیگران. امروز `join_conversation` هیچ بررسی عضویتی ندارد ([consumers.py:72](../../backend/communications/consumers.py:72)) و `typing` هم به هر اتاقی ارسال می‌شود ([consumers.py:84](../../backend/communications/consumers.py:84)).

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۳.۱ | مجوزسنجی `join_conversation` با `database_sync_to_async` روی `access.py` فاز ۱؛ در صورت رد، رویداد خطا | [consumers.py:72](../../backend/communications/consumers.py:72) | ۱۱ |
| ۳.۲ | مجوزسنجی `typing` (فقط اعضای همان گفتگو) | [consumers.py:84](../../backend/communications/consumers.py:84) | ۱۱ |
| ۳.۳ | بررسی دسترسی انبار پیش از `group_add` روی `chat_warehouse_{id}` | [consumers.py:46](../../backend/communications/consumers.py:46) | ۱۱ |
| ۳.۴ | مجوزسنجی `subscribe_comments` + تبدیل `current_target_group` تک‌مقداری به `set` (امروز اشتراک دوم، گروه اول را نشت می‌دهد) | [consumers.py:161](../../backend/communications/consumers.py:161) | ۱۱، ۲۵ |
| ۳.۵ | انتقال توکن از query string به پیام `auth` پس از `accept` (خروج توکن از access log و لاگ Cloudflare) | `consumers.py` + `communication.service.ts` | ۱۲ |
| ۳.۶ | خواندن `exp` توکن و بستن اتصال در انقضا (کد ۴۴۰۱) | `consumers.py` | ۱۲ |
| ۳.۷ | محدودیت نرخ پیام‌های ورودی سوکت | `consumers.py` | ۱۳ |

**تست‌های این فاز** — `communications/tests/test_ws_access.py` (با `channels.testing.WebsocketCommunicator`):

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_connect_without_token_rejected` | کد ۴۰۰۳ |
| `test_connect_with_expired_token_rejected` | کد ۴۰۰۳ (ایراد ۱۲) |
| `test_participant_can_join_conversation` | مسیر سالم |
| `test_outsider_join_denied` | رویداد خطا و **عدم** دریافت پیام بعدی (ایراد ۱۱) |
| `test_outsider_does_not_receive_broadcast` | پخش پیام به مهاجم نمی‌رسد (ایراد ۱۱) |
| `test_typing_denied_for_outsider` | رویداد جعلی منتشر نمی‌شود (ایراد ۱۱) |
| `test_warehouse_group_requires_access` | کاربر انبار۲ به `chat_warehouse_1` نمی‌پیوندد (ایراد ۱۱) |
| `test_comment_subscribe_requires_target_access` | ایراد ۱۱ |
| `test_two_subscriptions_keep_both_groups` | نشت گروه اول رفع شده (ایراد ۲۵) |
| `test_expired_token_closes_open_socket` | ایراد ۱۲ |

**🛡️ دروازه فاز ۳:** ۱۰ تست سبز + تست دستی: با دو مرورگر و دو کاربر، تلاش برای `join_conversation` روی شناسه گفتگوی دیگران از کنسول → عدم دریافت پیام.

---

## ۸. فاز ۴ — یکپارچگی داده و تحویل مطمئن پیام

**هدف:** رفع مستقیم تضاد با قاعده ثبت‌شده «داده کاربر هرگز نباید از بین برود». امروز در خطای ارسال، فقط `console.error` اجرا می‌شود و متن کاربر برای همیشه از بین می‌رود ([communication.service.ts:344](../../frontend/src/app/core/services/communication.service.ts:344)).

**اقدامات — بک‌اند:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۴.۱ | `client_temp_id` به‌عنوان کلید idempotency واقعی: `unique_together(conversation, sender, client_temp_id)` + `get_or_create` در ساخت پیام | `models.py`، `views.py` + مایگریشن | ۱۸ |
| ۴.۲ | `perform_destroy` با `soft_delete()` در هر سه ViewSet + حذف رکوردهای حذف‌شده از `get_queryset` | `views.py` | ۱۶ |
| ۴.۳ | سقف طول متن (۴۰۰۰ کاراکتر) در سریالایزرهای پیام و کامنت | `serializers.py` | ۱۴ |
| ۴.۴ | `DEFAULT_THROTTLE_CLASSES` + scope مجزا برای ارسال پیام و آپلود | [settings.py:177](../../backend/config/settings.py:177) | ۱۳ |
| ۴.۵ | ثبت رویدادهای حساس در `accounts.AuditLog`: حذف/ویرایش پیام، حذف کانال، تغییر اعضا | `views.py` | ۲۴ |
| ۴.۶ | رویداد جدید `chat.message.updated` برای پیوست (امروز پیوست به گیرنده نمی‌رسد چون dedupe روی `id` آن را دور می‌ریزد) | `broadcast.py` | ۲۲ |

**اقدامات — فرانت:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۴.۷ | وضعیت سه‌حالته `pending / sent / failed` + ذخیره پیام‌های در انتظار در Dexie (نه فقط حافظه) | `communication.service.ts`، `core/services/offline-db.ts` | ۱۹ |
| ۴.۸ | در خطا: علامت `failed` + دکمه «تلاش مجدد» و «کپی متن»؛ متن کاربر هرگز دور ریخته نمی‌شود | `communication.service.ts:344`، `chat-drawer.component.html` | ۱۹ |
| ۴.۹ | تشخیص `_offlinePending` و نگه داشتن پیام در حالت `pending` (امروز ✓✓ دروغین نشان می‌دهد) | [communication.service.ts:342](../../frontend/src/app/core/services/communication.service.ts:342) | ۲۰ |
| ۴.۱۰ | صف اختصاصی آپلود پیوست با الگوی موجود و آزموده `photo-upload-queue.service.ts` | فایل جدید در `core/services/` | ۲۱ |
| ۴.۱۱ | تلاش مجدد با **همان** `client_temp_id` (تضمین عدم تکثیر) | `communication.service.ts` | ۱۸ |

**تست‌های این فاز:**

`communications/tests/test_integrity.py`

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_duplicate_client_temp_id_returns_same_message` | ارسال دوباره → همان `id`، تعداد کل ۱ (ایراد ۱۸) |
| `test_replay_after_offline_queue_does_not_duplicate` | سناریوی واقعی صف آفلاین (ایراد ۱۸) |
| `test_delete_message_is_soft` | `is_deleted=True`، در `all_objects` باقی است (ایراد ۱۶) |
| `test_soft_deleted_message_hidden_from_list` | ایراد ۱۶ |
| `test_delete_writes_audit_log` | یک رکورد `AuditLog` (ایراد ۲۴) |
| `test_text_over_limit_rejected` | ۴۰۰ (ایراد ۱۴) |
| `test_message_burst_is_throttled` | با `override_settings` نرخ پایین → ۴۲۹ (ایراد ۱۳) |
| `test_attachment_emits_updated_event` | رویداد `chat.message.updated` (ایراد ۲۲) |

`core/services/communication.service.spec.ts`

| تست | اثبات می‌کند |
| :--- | :--- |
| `keeps text and marks failed on send error` | متن در دسترس می‌ماند (ایراد ۱۹) |
| `persists pending message to Dexie` | ایراد ۱۹ |
| `retry reuses same client_temp_id` | ایراد ۱۸ |
| `offline pending response stays pending (no ✓✓)` | ایراد ۲۰ |
| `does not call uploadAttachment with undefined id` | ایراد ۲۰ |
| `merges attachment from updated event` | ایراد ۲۲ |

**🛡️ دروازه فاز ۴:** ۱۴ تست سبز + سناریوی دستی: قطع شبکه، ارسال سه پیام با متن مشخص، وصل شدن، اطمینان از ثبت **دقیقاً سه** پیام بدون تکرار و بدون گم شدن متن.

---

## ۹. فاز ۵ — بازطراحی وضعیت خوانده‌شدن و کارایی

**هدف:** حذف N+1ها. امروز `broadcast_message_ws` برای **هر عضو** یک COUNT سنگین روی کل پیام‌های او اجرا می‌کند ([views.py:101](../../backend/communications/views.py:101)) و `mark_as_read` به‌ازای هر پیام یک INSERT جدا می‌زند ([views.py:69](../../backend/communications/views.py:69)).

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۵.۱ | مدل جدید `ConversationParticipant(conversation, user, last_read_at, last_read_message, is_muted, role, joined_at, left_at)` | `models.py` + مایگریشن | ۴۷ |
| ۵.۲ | مایگریشن داده: تبدیل `read_by` موجود به `last_read_at` — **بدون حذف `read_by`** در این فاز (dual-write یک نسخه) | `migrations/000X_*.py` | ۲، قاعده |
| ۵.۳ | `mark_as_read` → یک `UPDATE` تک‌کوئری | `views.py` | ۴۶ |
| ۵.۴ | `unread_count` با `annotate` در ViewSet به‌جای متد سریالایزر | `serializers.py`، `views.py` | ۴۵ |
| ۵.۵ | `last_message` با `Prefetch` به‌جای کوئری به‌ازای هر گفتگو | `serializers.py:104` | ۴۵ |
| ۵.۶ | `select_related('sender')` + `prefetch_related('attachments')` در `MessageViewSet` | `views.py:175` | ۴۵ |
| ۵.۷ | خارج کردن broadcast از مسیر request (`transaction.on_commit`) و ارسال delta به‌جای COUNT به‌ازای هر عضو | `broadcast.py` | ۴۴ |
| ۵.۸ | اصلاح `since_id`: tie-break با `id` (امروز پیام‌های هم‌زمان گم می‌شوند) | `views.py:182` | ۳۳ |
| ۵.۹ | ایندکس نزولی `['conversation', '-created_at']` هم‌سو با کوئری واقعی | `models.py` | ۴۹ |

**تست‌های این فاز** — `communications/tests/test_read_state.py` و `test_performance.py`:

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_migration_preserves_existing_read_state` | هیچ داده خوانده‌شدنی گم نشده (قاعده عدم فقدان داده) |
| `test_unread_count_matches_legacy_result` | عدد جدید = عدد قدیمی روی داده نمونه (ایراد ۴۷) |
| `test_mark_read_is_single_query` | `assertNumQueries` (ایراد ۴۶) |
| `test_mark_read_idempotent` | فراخوانی دوباره اثری ندارد |
| `test_conversation_list_query_count_is_constant` | ۲۰ گفتگو و ۵ گفتگو → همان تعداد کوئری (ایراد ۴۵) |
| `test_message_list_query_count_is_constant` | ایراد ۴۵ |
| `test_broadcast_query_count_independent_of_participants` | ۳ عضو و ۳۰ عضو → همان تعداد کوئری (ایراد ۴۴) |
| `test_since_id_returns_same_timestamp_messages` | پیام هم‌میکروثانیه گم نمی‌شود (ایراد ۳۳) |

**🛡️ دروازه فاز ۵:** ۸ تست سبز + **تمام تست‌های فازهای ۱ تا ۴ هنوز سبز** + مایگریشن روی یک کپی از دیتابیس واقعی اجرا و شمارش خوانده‌نشده‌ها قبل/بعد مقایسه شود.

---

## ۱۰. فاز ۶ — اصلاح باگ‌های کلاینت

**هدف:** رفع نشتی سوکت و رفتارهای غلط UI. امروز `layout.ts:556` و `chat-drawer.component.ts:41` هر دو `connectSockets` را صدا می‌زنند و هر `onclose` هم **هر دو** سوکت را بازمی‌سازد، پس هر قطعی تعداد سوکت‌ها را چند برابر می‌کند.

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۶.۱ | تک‌نقطه‌ای کردن مدیریت اتصال با `ensureConnected()` idempotent؛ بستن سوکت قبلی پیش از ساخت جدید؛ حذف فراخوانی از کامپوننت | `communication.service.ts:121`، `chat-drawer.component.ts:41`، `layout.ts:556` | ۲۸ |
| ۶.۲ | reconnect مشترک با backoff نمایی + jitter و حفظ `warehouseId` | `communication.service.ts:174` و `:203` | ۲۸ |
| ۶.۳ | تشخیص سوکت مرده: انتظار `pong` و بستن در نبود آن | `communication.service.ts:225` | ۲۸ |
| ۶.۴ | انتقال `playNotificationSound()` به داخل گارد dedupe + شرط `!msg.is_me` | `communication.service.ts:438` | ۲۹ |
| ۶.۵ | حذف شمارش محلی `+1`؛ تنها منبع، رویداد سرور | `communication.service.ts:413` | ۳۰ |
| ۶.۶ | `getConversationTitle` کاربر جاری را حذف کند | `chat-drawer.component.ts:230` | ۳۱ |
| ۶.۷ | اسکرول بی‌نهایت / دکمه «پیام‌های قدیمی‌تر» با `offset` | `communication.service.ts:285`، `chat-drawer.component.*` | ۳۲ |
| ۶.۸ | debounce کردن `mark-read` | `communication.service.ts:410` | ۳۴ |
| ۶.۹ | ✓✓ فقط بر پایه `read_by_count` واقعی؛ حذف «آنلاین» ثابت | `chat-drawer.component.html:203` و `:32` | ۳۵ |
| ۶.۱۰ | تایم‌اوت ۵ ثانیه‌ای تایپینگ سمت گیرنده + پاکسازی `typingTimeout` در `ngOnDestroy` | `chat-drawer.component.ts:72` | ۳۶ |
| ۶.۱۱ | کش خواندن تاریخچه چت (برداشتن `SKIP_OFFLINE` یا کش اختصاصی Dexie) | `communication.service.ts` | ۳۷ |
| ۶.۱۲ | `revokeObjectURL` در `removeSelectedFile` و `ngOnDestroy` | `chat-drawer.component.ts:183` | ۴۲ |
| ۶.۱۳ | `trackBy` روی حلقه پیام‌ها | `chat-drawer.component.html:157` | کارایی |

**تست‌های این فاز** — spec فرانت:

| تست | اثبات می‌کند |
| :--- | :--- |
| `ensureConnected is idempotent` | دو فراخوانی → یک سوکت (ایراد ۲۸) |
| `close spawns exactly one reconnect` | ایراد ۲۸ |
| `reconnect delay grows exponentially` | ایراد ۲۸ |
| `reconnect preserves warehouseId` | ایراد ۲۸ |
| `missing pong closes socket` | ایراد ۲۸ |
| `no sound for own message` | ایراد ۲۹ |
| `no sound for duplicate message` | ایراد ۲۹ |
| `unread count only from server event` | ایراد ۳۰ |
| `title excludes current user` | ایراد ۳۱ |
| `older page prepends without losing current` | ایراد ۳۲ |
| `mark-read debounced to one call` | ایراد ۳۴ |
| `revokeObjectURL called on remove` | ایراد ۴۲ |

**تست دستی:** تایپ کردن، بستن مرورگر فرستنده → «در حال نوشتن...» حداکثر پس از ۵ ثانیه پاک شود (ایراد ۳۶).

**🛡️ دروازه فاز ۶:** ۱۲ تست سبز + بازرسی دستی با DevTools → پس از سه بار قطع/وصل شبکه، دقیقاً **۲** سوکت باز باشد (چت + کامنت)، نه بیشتر.

---

## ۱۱. فاز ۷ — فعال‌سازی واقعی کامنت‌های تعاملی

**هدف:** بیرون آوردن فاز ۴ اصلی از حالت کد مرده. امروز فرانت هیچ‌وقت `subscribe_comments` نمی‌فرستد، پس سرور روی گروهی پخش می‌کند که هیچ عضوی ندارد؛ و `ContextualCommentsComponent` در هیچ صفحه‌ای استفاده نشده است.

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۷.۱ | ارسال `subscribe_comments` در `ngOnInit` و `unsubscribe_comments` در `ngOnDestroy` | `contextual-comments.component.ts`، `communication.service.ts` | ۲۵ |
| ۷.۲ | جایگزینی `content_type_str: \`inventory.${modelName}\`` سخت‌کدشده با پارامتر `appLabel` ورودی کامپوننت | `communication.service.ts:468` | ۴۰ |
| ۷.۳ | قرار دادن واقعی کامپوننت در صفحات هدف (کارت کالا، تسک شمارش، حواله) | کامپوننت‌های مقصد | ۲۶ |
| ۷.۴ | انتقال استخراج منشن به سرور با توکن `@[id:username]`؛ پایان تطبیق `split(/\s+/)` که با نام فارسی هرگز کار نمی‌کند | `contextual-comments.component.ts:90`، `serializers.py` | ۳۸ |
| ۷.۵ | اعتبارسنجی سرورسمتی `mentioned_user_ids` بر پایه دسترسی کاربر | `views.py:263` | ۱۰، ۳۸ |
| ۷.۶ | ثبت منشن به‌عنوان نوتیفیکیشن پایدار (امروز اگر کاربر آنلاین نباشد، هشدار در هوا گم می‌شود) | اپ `notifications` | ۳۹ |
| ۷.۷ | رندر واقعی ساختار زنجیره‌ای `parent` (امروز ذخیره می‌شود ولی مسطح نمایش داده می‌شود) | `contextual-comments.component.html` | — |
| ۷.۸ | فراخوانی `requestNotificationPermission()` که امروز تعریف شده ولی هیچ‌جا صدا زده نمی‌شود | `layout.ts` | ۳۹ |

**تست‌های این فاز:**

| تست | فایل | اثبات می‌کند |
| :--- | :--- | :--- |
| `test_subscriber_receives_new_comment` | `test_ws_comments.py` | زنجیره پخش کامل شد (ایراد ۲۵) |
| `test_unsubscribe_stops_delivery` | `test_ws_comments.py` | ایراد ۲۵ |
| `test_mention_creates_persistent_notification` | `test_comments.py` | ایراد ۳۹ |
| `test_mention_of_inaccessible_user_rejected` | `test_comments.py` | ایراد ۳۸ |
| `test_persian_full_name_mention_parsed` | `test_comments.py` | «علی محمدی» درست استخراج شد (ایراد ۳۸) |
| `sends subscribe on init and unsubscribe on destroy` | `contextual-comments.component.spec.ts` | ایراد ۲۵ |
| `appLabel is honored (not hardcoded inventory)` | `communication.service.spec.ts` | ایراد ۴۰ |

**🛡️ دروازه فاز ۷:** ۷ تست سبز + تست دستی دو مرورگر: کاربر A کامنت می‌گذارد، کاربر B **بدون رفرش** آن را می‌بیند.

---

## ۱۲. فاز ۸ — تنظیمات، پاکسازی و انطباق

**هدف:** واقعی کردن سوئیچ‌های تنظیمات و بستن بدهی‌های کیفی. امروز `chat_enabled` فقط در `settings.html` وجود دارد و **هیچ‌کجای بک‌اند یا فرانت خوانده نمی‌شود**؛ `isChatEnabled` یک `signal(true)` ثابت است.

**اقدامات:**

| # | اقدام | فایل | ایراد |
| :---: | :--- | :--- | :---: |
| ۸.۱ | افزودن `chat_enabled: True` و `chat_file_sharing: True` به `DEFAULT_SETTINGS` | `warehouses/services.py` | ۲۷ |
| ۸.۲ | permission class که در حالت خاموش، REST را ۴۰۳ کند و سوکت را رد کند (**اعمال سرورسمتی، نه فقط پنهان‌کردن UI**) | `permissions.py`، `consumers.py` | ۲۷ |
| ۸.۳ | خواندن مقدار در `isChatEnabled` فرانت به‌جای `true` ثابت | `communication.service.ts:95` | ۲۷ |
| ۸.۴ | `chat_file_sharing=False` → رد آپلود در سرور | `views.py:203` | ۲۷ |
| ۸.۵ | `purge_expired_chat_media` روی `all_objects` (امروز پیوست‌های حذف‌نرم‌شده هرگز پاک نمی‌شوند و فایلشان یتیم می‌ماند) + tombstone به‌جای `delete()` سخت | `management/commands/purge_expired_chat_media.py` | ۲۳ |
| ۸.۶ | ساخت `communications/admin.py` (read-only با فیلتر انبار) | فایل جدید | ۵۱ |
| ۸.۷ | انتقال یا حذف اسکریپت‌های موقت ریشه بک‌اند: `check_conversation.py`، `send_manager_message.py`، `send_manager_reply_with_file.py`، `send_manager_live_reply.py`، `send_test_live_msg.py` | `backend/` | ۵۲ |
| ۸.۸ | حذف ایمپورت‌های بی‌استفاده (`uuid`، `filters`، `GenericForeignKey`) و مرتب‌سازی `logging` | `models.py`، `views.py:8` | ۵۳ |
| ۸.۹ | هم‌تراز کردن `task_communication_system.md` با واقعیت (تیک‌های ✅ نادرست بندهای ۳.۲، ۴، ۵.۳، ۶.۱ و Gateها) | `Documents/Communication_System_And_Contextual_Comments/task_communication_system.md` | ۵۴ |

**تست‌های این فاز** — `communications/tests/test_settings_and_purge.py`:

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_chat_disabled_blocks_rest` | ۴۰۳ (ایراد ۲۷) |
| `test_chat_disabled_rejects_websocket` | اتصال بسته می‌شود (ایراد ۲۷) |
| `test_file_sharing_disabled_blocks_upload` | ۴۰۳ (ایراد ۲۷) |
| `test_warehouse_override_beats_global` | سلسله‌مراتب تنظیمات درست کار می‌کند |
| `test_purge_includes_soft_deleted_attachments` | فایل یتیم باقی نمی‌ماند (ایراد ۲۳) |
| `test_purge_dry_run_changes_nothing` | ایراد ۲۳ + قاعده عدم فقدان داده |
| `test_purge_creates_tombstone_not_hard_delete` | ایراد ۲۳ |
| `test_purge_respects_days_argument` | پیوست تازه دست‌نخورده می‌ماند |

**🛡️ دروازه فاز ۸:** ۸ تست سبز + خاموش کردن چت از تنظیمات و راستی‌آزمایی اینکه هیچ اتصال سوکتی برقرار نمی‌شود و API هم ۴۰۳ می‌دهد.

---

## ۱۳. فاز ۹ — زیرساخت Redis برای Channels

**هدف:** رفع تنها ایرادی که «بلادرنگ بودن» را در پروداکشن باطل می‌کند. `InMemoryChannelLayer` ([settings.py:99](../../backend/config/settings.py:99)) فقط داخل یک پروسه کار می‌کند؛ با بیش از یک worker، پیام کاربرِ متصل به پروسه A **هرگز** به کاربرِ متصل به پروسه B نمی‌رسد و **هیچ خطایی هم دیده نمی‌شود**.

**اقدامات:** نصب `channels_redis`، تغییر `CHANNEL_LAYERS`، افزودن Redis به راه‌اندازی سرور، و تست دو-پروسه‌ای.

**تست‌ها:**

| تست | اثبات می‌کند |
| :--- | :--- |
| `test_cross_process_broadcast` | دو پروسه daphne، پیام از یکی به دیگری می‌رسد (ایراد ۴۳) |
| `test_group_membership_survives_restart` | ایراد ۴۳ |
| `test_layer_failure_does_not_break_rest` | نبود Redis، ارسال پیام REST را ۵۰۰ نکند |

**🛡️ دروازه فاز ۹:** اجرای دو پروسه و دریافت موفق پیام بین آن‌ها.

> **تا زمان اجرای این فاز:** باید صریحاً مستند و اعمال شود که سیستم **فقط با یک پروسه daphne** اجرا می‌شود. خرابی این مورد خاموش است و به‌راحتی به‌عنوان «باگ گم شدن پیام» تفسیر می‌شود.

---

## ۱۴. ماتریس پوشش ایرادات

| فاز | ایرادات | تعداد |
| :---: | :--- | :---: |
| ۱ | ۱، ۲، ۳، ۷، ۸، ۹، ۱۰، ۱۵، ۱۷، ۴۰، ۴۱، ۴۸ | ۱۲ |
| ۲ | ۴، ۵، ۶ | ۳ |
| ۳ | ۱۱، ۱۲ | ۲ |
| ۴ | ۱۳، ۱۴، ۱۶، ۱۸، ۱۹، ۲۰، ۲۱، ۲۲، ۲۴ | ۹ |
| ۵ | ۳۳، ۴۴، ۴۵، ۴۶، ۴۷، ۴۹ | ۶ |
| ۶ | ۲۸، ۲۹، ۳۰، ۳۱، ۳۲، ۳۴، ۳۵، ۳۶، ۳۷، ۴۲ | ۱۰ |
| ۷ | ۲۵، ۲۶، ۳۸، ۳۹ | ۴ |
| ۸ | ۲۳، ۲۷، ۵۰، ۵۱، ۵۲، ۵۳، ۵۴ | ۷ |
| ۹ | ۴۳ | ۱ |
| **جمع** | | **۵۴** |

مجموع تست‌های برنامه‌ریزی‌شده: **۹۹ تست خودکار** (۶۷ بک‌اند، ۲۳ فرانت، ۹ فاز ۹/دستی) + ۶ سناریوی دستی در دروازه‌ها.

---

## ۱۵. تصمیم‌هایی که به تأیید شما نیاز دارند

| # | موضوع | پیشنهاد من |
| :---: | :--- | :--- |
| ۱ | آیا Redis روی سرور در دسترس است؟ | اگر بله، فاز ۹ را بلافاصله بعد از فاز ۳ اجرا کنیم |
| ۲ | `STRICT_WAREHOUSE_SCOPE` امروز `False` است؛ یعنی کاربر بدون انبار تخصیصی همه را می‌بیند. برای فهرست مخاطبین چت هم همین بماند؟ | برای مخاطبین **سخت‌گیرانه** باشد (کاربر بدون تخصیص، فهرست خالی ببیند) — اما این یک تغییر رفتار عمدی است و تأیید شما را می‌خواهد |
| ۳ | حذف `read_by` قدیمی پس از مهاجرت فاز ۵ | یک نسخه dual-write نگه داریم، حذف در فاز جداگانه |
| ۴ | پنجره اعتبار لینک امضاشده پیوست چت | ۷ روز (پنجره ۳۰ روزه فعلی عکس کالا برای چت طولانی است)؛ روی کش سرویس‌ورکر اثر دارد |
| ۵ | چه نقشی مجاز به ساخت کانال «اطلاعیه عمومی» است؟ | `can_act_as_manager` یا یک permission اختصاصی جدید |
| ۶ | سیاست ویرایش/حذف پیام | فقط نویسنده، با پنجره زمانی ۱۵ دقیقه؛ حذف برای مدیر با ثبت در AuditLog |
| ۷ | اسکریپت‌های موقت ریشه بک‌اند | حذف شوند (منطق تستی با نام کاربر سخت‌کدشده دارند) |

---

## ۱۶. ترتیب پیشنهادی اجرا

```
فاز ۰ ──► فاز ۱ ──► فاز ۲ ──► فاز ۳ ──┬─► فاز ۴ ──► فاز ۵ ──► فاز ۶
                                       └─► فاز ۷
                                              └─► فاز ۸
(فاز ۹ به محض آماده بودن Redis، مستقل و موازی)
```

فازهای ۱ تا ۳ زنجیره امنیتی‌اند و بهتر است پشت سر هم و بدون وقفه اجرا شوند. فاز ۷ به فاز ۴/۵ وابسته نیست و می‌تواند موازی پیش برود.

</div>
