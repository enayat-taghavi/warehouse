<div dir="rtl" align="right">

# 🚀 گزارش جامع آزمون‌های خودکار بک‌اند انبارگردانی (۱۵ سناریوی کامل)

یک سوئیت تست کامل شامل **۱۵ سناریوی مختلف** در فایل [`backend/inventory/tests.py`](file:///E:/warehouse%20project/backend/inventory/tests.py) پیاده‌سازی و اجرا گردید. تمام ۱۵ آزمون با موفقیت ۱۰۰٪ پاس شدند.

---

## 🧪 ماتریس کامل ۱۵ سناریوی آزمون بک‌اند

| # | عنوان سناریو | هدف و جریان آزمون | نتیجه |
| :-: | :--- | :--- | :-: |
| **۱** | `test_01_full_happy_path_with_supervisor` | چرخه استاندارد کامل: ارجاع $\rightarrow$ شمارش انبارگردان $\rightarrow$ تایید سرپرست $\rightarrow$ تایید نهایی مدیر $\rightarrow$ بروزرسانی موجودی کالا و تغییر وضعیت به `done` | ✅ **OK** |
| **۲** | `test_02_recount_and_unlimited_rejects` | تست رد مکرر توسط مدیر برای **۴ دور متوالی** بدون خطای سقف بازشماری $\rightarrow$ ارجاع سرپرست به انبارگردان $\rightarrow$ شمارش مجدد و تایید | ✅ **OK** |
| **۳** | `test_03_direct_to_manager_skip_supervisor` | ارجاع با پرش از سرپرست (`skip`) $\rightarrow$ جهش مستقیم از کارتابل شمارشگر به مدیر بدون دخالت سرپرست | ✅ **OK** |
| **۴** | `test_04_pool_tasks_and_claim` | تخصیص به استخر عمومی انبارگردانان $\rightarrow$ استعلام لیست استخر و بر عهده گرفتن تسک (`claim`) | ✅ **OK** |
| **۵** | `test_05_conflict_detection_when_mismatched` | شمارش مقدار مغایر با موجودی مجاز MIV $\rightarrow$ علامت‌گذاری خودکار `has_conflict=True` در کالا پس از تایید نهایی | ✅ **OK** |
| **۶** | `test_06_bulk_cancel_tasks` | لغو تخصیص دسته‌ای تسک‌های در انتظار شمارش | ✅ **OK** |
| **۷** | `test_07_sync_pull_and_blind_redaction` | پایش اندپوینت همگام‌سازی آفلاین PWA در حالت شمارش کور و عدم نشت موجودی دفتری به انبارگردان | ✅ **OK** |
| **۸** | `test_08_dynamic_extra_fields_saving` | ثبت و ذخیره‌سازی مقادیر فیلدهای پویا (شماره سریال، بچ، شرایط بسته‌بندی) در `dynamic_data` | ✅ **OK** |
| **۹** | `test_09_optimistic_concurrency_409_conflict` | تشخیص تداخل همزمانی خوش‌بینانه و بازگرداندن خطای `409 Conflict` همراه با `server_record` | ✅ **OK** |
| **۱۰** | `test_10_redispatch_with_force_flag` | ارجاع مجدد یک کالای دارای تسک فعال با گزینه اجبار (`force=True`) | ✅ **OK** |
| **۱۱** | `test_11_zero_count_and_decimal_precision` | تفکیک شمارش صفر واقعی (`0.000`) از تسک خالی و راستی‌آزمایی دقت اعشاری ۳ رقمی (`12.345`) | ✅ **OK** |
| **۱۲** | `test_12_supervisor_pool_and_claim` | ورود تسک به استخر عمومی سرپرستان در صورت عدم تعیین سرپرست در زمان ارجاع، Claim توسط سرپرست و تایید | ✅ **OK** |
| **۱۳** | `test_13_conflict_resolution_on_recount` | رفع پرچم مغایرت هنگام انطباق شمارش مجدد با موجودی دفتری در تایید نهایی مدیر | ✅ **OK** |
| **۱۴** | `test_14_soft_delete_and_sync_tombstone` | حذف نرم تسک و راستی‌آزمایی دریافت رکورد با `is_deleted: True` در پول سینک آفلاین | ✅ **OK** |
| **۱۵** | `test_15_new_location_persistence` | ثبت و حفظ موقعیت جدید قفسه/انبار (`new_location`) کالا در چرخه شمارش | ✅ **OK** |

---

## 📊 لاگ رسمی اجرای ۱۵ تست در سرور

```bash
.\venv\Scripts\python.exe manage.py test inventory.tests
```

```text
Creating test database for alias 'default'...
Found 15 test(s).
System check identified no issues (0 silenced).
...............
----------------------------------------------------------------------
Ran 15 tests in 14.004s

OK
Destroying test database for alias 'default'...
```

---

> [!TIP]
> فایل تست در [`inventory/tests.py`](file:///E:/warehouse%20project/backend/inventory/tests.py) به عنوان تست استاندارد و دائمی چرخه انبارگردانی در گیت ذخیره گردید.

</div>
