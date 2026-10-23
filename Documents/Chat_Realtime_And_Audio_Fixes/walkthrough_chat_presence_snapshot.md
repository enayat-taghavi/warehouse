<div dir="rtl" align="right">

# 🏁 گزارش راستی‌آزمایی و پیاده‌سازی اسنپ‌شات حضور آنلاین کاربران (Presence Snapshot)

---

## 🎯 دستاوردهای این نشست کاری

1. **ارسال اسنپ‌شات بلادرنگ کاربران آنلاین (`chat.online_users`):** به محض اتصال هر کلاینت (از طریق وب‌سوکت چت)، سرور بلافاصله لیست تمامی شناسه‌هایی که هم‌اکنون به سیستم متصل هستند را برای آن کلاینت ارسال می‌کند تا کاربرانی که از قبل آنلاین بوده‌اند (مانند اتصال با کامپیوتر) بلافاصله آنلاین (سبز) دیده شوند.
2. **ماژول کش اختصاصی حضور (`presence.py`):** نگهداری و تمدید امن لیست کاربران فعال آنلاین با استفاده از کش سیستم در رویدادهای `connect`، `disconnect` و `ping`.
3. **همگام‌سازی دوطرفه در فرانت‌اند:** شنود رویدادهای اسنپ‌شات و استعلام مجدد وضعیت حضور با متد `refreshPresence()` هنگام باز شدن کشوی چت و بازگشت فوکوس به تب مرورگر.

---

## 📁 فایل‌های ایجاد/ویرایش‌شده

- `backend/communications/presence.py`: ماژول کش اختصاصی حضور کاربران آنلاین
- `backend/communications/consumers.py`: ارسال اسنپ‌شات اولیه و پاسخ به `get_online_users`
- `backend/communications/tests/test_presence.py`: آزمون‌های واحد کش و وب‌سوکت اسنپ‌شات حضور
- `frontend/src/app/core/services/communication.service.ts`: شنود `chat.online_users` و متد `refreshPresence`
- `frontend/src/app/components/communications/chat-drawer/chat-drawer.component.ts`: استعلام حضور در `ngOnInit`
- `frontend/src/app/core/services/communication.service.spec.ts`: آزمون‌های واحد فرانت‌اند

---

## 🧪 شواهد و نتایج آزمون‌های خودکار

* **آزمون‌های بک‌اند جنگو (Django Test Suite):**
  ```powershell
  Ran 66 tests in 103.884s — OK (All 66 passed)
  ```
* **آزمون‌های واحد فرانت‌اند (Vitest Tests):**
  ```bash
  Test Files: 2 passed (2)
  Tests: 22 passed (22)
  ```
* **بیلد نهایی فرانت‌اند (Angular Build):**
  ```bash
  Application bundle generation complete. Output location: dist\warehouse-app (Exit code: 0)
  ```

</div>
