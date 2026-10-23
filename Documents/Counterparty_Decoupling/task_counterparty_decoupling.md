# چک‌لیست تسک‌های اجرایی مستقل‌سازی طرف‌حساب‌های مالی (Tasks Checklist)

<div dir="rtl" align="right">

## فاز ۱: مدل‌های دیتابیس و مایگریشن پیش‌رونده
- [ ] <!-- id: 101 --> **تسک ۱.۱:** حذف فیلد `section` از مدل `Counterparty` در `backend/personnel/models.py`.
- [ ] <!-- id: 102 --> **تسک ۱.۲:** ایجاد و اعمال مایگریشن پیش‌رونده جنگو با `makemigrations` و `migrate`.
- [ ] <!-- id: 103 --> **تسک ۱.۳:** به‌روزرسانی `CounterpartySerializer` در `personnel/serializers.py` (حذف فیلدهای بخش).

---

## فاز ۲: ویوست، موتور اکسل و وب‌سوکت بک‌اند
- [ ] <!-- id: 201 --> **تسک ۲.۱:** پاکسازی فیلتر `section_id` و جوین‌های بخش در `CounterpartyViewSet` در `personnel/views.py`.
- [ ] <!-- id: 202 --> **تسک ۲.۲:** به‌روزرسانی توابع اکسل طرف‌حساب‌ها در `personnel/org_excel_engine.py` (حذف ستون‌های بخش و پروژه).
- [ ] <!-- id: 203 --> **تسک ۲.۳:** اعتبارسنجی سلامت بک‌اند با `python manage.py check` و تست‌های نگهبان.

---

## فاز ۳: کامپوننت فرانت جدید، روتینگ و منو
- [ ] <!-- id: 301 --> **تسک ۳.۱:** ایجاد کامپوننت مستقل `frontend/src/app/components/finance/counterparties/counterparties.ts`.
- [ ] <!-- id: 302 --> **تسک ۳.۲:** طراحی قالب `counterparties.html` و استایل‌های مربوطه با بهترین استانداردهای ارگونومی و زیبایی‌شناسی.
- [ ] <!-- id: 303 --> **تسک ۳.۳:** ثبت روت `counterparties` در `accounting.routes.ts`.
- [ ] <!-- id: 304 --> **تسک ۳.۴:** افزودن آیتم «🤝 مدیریت طرف‌حساب‌های مالی» به منوی ناوبری مالی در `nav-items.ts`.
- [ ] <!-- id: 305 --> **تسک ۳.۵:** ثبت روت در جدول `ROUTE_PERMISSIONS` در `auth.guard.ts`.

---

## فاز ۴: پالایش صفحه پروژه‌ها و بخش‌ها
- [ ] <!-- id: 401 --> **تسک ۴.۱:** حذف ساب‌تب چهارم (`counterparties`) از هدر ناوبری `projects-and-sections.html`.
- [ ] <!-- id: 402 --> **تسک ۴.۲:** حذف کامل سکشن فرم و جدول طرف‌حساب‌ها از تمپلیت `projects-and-sections.html`.
- [ ] <!-- id: 403 --> **تسک ۴.۳:** پاکسازی متغیرها و متدهای مرتبط با طرف‌حساب‌ها از `projects-and-sections.ts`.

---

## فاز ۵: آزمون‌های یکپارچگی و بیلد نهایی
- [ ] <!-- id: 501 --> **تسک ۵.۱:** کامپایل فرانت‌اند با `npx ng build --configuration=development`.
- [ ] <!-- id: 502 --> **تسک ۵.۲:** آزمون‌های ایجنت نگهبان دیتابیس با `python manage.py test personnel.test_section_guardian`.
- [ ] <!-- id: 503 --> **تسک ۵.۳:** ثبت مستندات نهایی در `walkthrough_counterparty_decoupling.md`.

</div>
