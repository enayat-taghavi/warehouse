<div dir="rtl" align="right">

# طرح جامع ارتقای ارگونومی فرم پرسنل، هوشمندسازی کد ملی و پشتیبانی از جابجایی و حضور در چند بخش و پروژه

این سند فنی نقشه مهندسی، تغییرات فایل‌ها و ساختار کدهای لازم برای ارتقای فرم ثبت پرسنل، استعلام و فراخوانی خودکار مشخصات با کد ملی، و پشتیبانی از حضور و کارکرد یک پرسنل در چند بخش/پروژه متفاوت را تشریح می‌کند.

---

## ۱. اهداف و نیازمندی‌ها (Requirements & Objectives)

| ردیف | موضوع | وضعیت فعلی | وضعیت هدف |
| :--- | :--- | :--- | :--- |
| ۱ | **ارگونومی ردیف اول فرم** | ردیف اول شامل «نام»، «نام خانوادگی» و «کد ملی» در سمت چپ است | کد ملی به عنوان اولین فیلد از راست قرار می‌گیرد: **کد ملی** \| **نام** \| **نام خانوادگی** |
| ۲ | **کپی شماره موبایل** | شماره موبایل دکمه کپی اختصاصی ندارد | افزودن دکمه کپی ۱-کلیک (`📋`) با فیدبک ۲ ثانیه‌ای (`✓`) درون فیلد موبایل پرسنل |
| ۳ | **حذف کنترل نوع قرارداد** | سلکتور «نوع قرارداد کاری» در فرم وجود دارد | حذف کامل دراپ‌داون از ظاهر فرم؛ ذخیره پیش‌فرض `daily` (روزمزد مبنا ۱۰ ساعت) در پشت صحنه |
| ۴ | **تعداد فرزندان** | فیلد وابسته به وضعیت تاهل است و برای مجرد/مطلقه غیرفعال می‌شود | فیلد تعداد فرزندان برای همه وضعیت‌ها باز و فعال باشد (پوشش افراد مطلقه/سرپرست خانوار) |
| ۵ | **چیدمان ۳ ستونه متقارن** | برخی ردیف‌های فرم فضای خالی دارند | چیدمان متقارن و بدون اسکرول فیلدهای شناسنامه‌ای |
| ۶ | **استعلام و لود خودکار کد ملی** | با ورود کد ملی هیچ فراخوانی خودکاری صورت نمی‌گیرد و در صورت ثبت در شرکت دیگر خطا می‌دهد | به محض ورود ۱۰ رقم، سیستم پرونده قبلی فرد را شناسایی کرده و دکمه لود خودکار مشخصات هویتی و شبا را نمایش می‌دهد |
| ۷ | **حضور همزمان در چند بخش/پروژه** | پرسنل به یک بخش متصل است؛ در صورت انتقال از لیست بخش قبلی حذف می‌شود | ایجاد انتساب چندگانه (`PersonnelSectionAssignment`) به گونه‌ای که نام پرسنل در صفحات هر دو بخش (`section_id=3` و `section_id=5`) در دسترس سرپرستان باشد |
| ۸ | **استقلال دستمزد و سمت در بخش‌ها** | مشخصات مالی و شغلی در سطح کل فرد تک‌مقداری است | امکان تعیین دستمزد روزانه و عنوان شغلی اختصاصی برای همان بخش جدید |
| ۹ | **کنترل عدم تداخل کارکرد** | کنترل سیستمی برای کارکرد متناقض یک فرد در چند پروژه در یک روز وجود ندارد | جلوگیری از ثبت «حاضر کامل» همزمان برای یک فرد در دو پروژه در یک تاریخ معین (`date_shamsi`) |

---

## ۲. معماری فنی و تغییرات مدل‌ها (Database & Architecture Design)

### الف) مدل انتساب پرسنل به چند بخش (`PersonnelSectionAssignment`)
در فایل `backend/personnel/models.py` مدل جدیدی برای نگهداری رابطه چندبه‌چند انتساب پرسنل به بخش‌ها با ویژگی‌های اختصاصی هر بخش ایجاد می‌شود:

```python
class PersonnelSectionAssignment(models.Model):
    """
    انتساب سازمانی پرسنل به بخش‌ها و پروژه‌های مختلف با حفظ استقلال سمت و دستمزد
    """
    personnel = models.ForeignKey(
        'PersonnelProfile',
        on_delete=models.CASCADE,
        related_name='section_assignments',
        verbose_name="پرسنل"
    )
    section = models.ForeignKey(
        'ProjectSection',
        on_delete=models.CASCADE,
        related_name='personnel_assignments',
        verbose_name="بخش/دپارتمان پروژه"
    )
    project = models.ForeignKey(
        'FinancialProject',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='personnel_assignments',
        verbose_name="پروژه مالی/عملیاتی"
    )
    job_title = models.CharField(
        max_length=150,
        blank=True,
        null=True,
        verbose_name="سمت / شغل در این بخش"
    )
    daily_base_wage = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        verbose_name="دستمزد روزانه مصوب این بخش (ریال)"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="فعال در این بخش"
    )
    assigned_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="تاریخ انتساب به بخش"
    )

    class Meta:
        verbose_name = "انتساب پرسنل به بخش"
        verbose_name_plural = "انتساب‌های پرسنل به بخش‌ها"
        unique_together = ('personnel', 'section')

    def save(self, *args, **kwargs):
        if not self.project_id and self.section and self.section.project_id:
            self.project_id = self.section.project_id
        if not self.job_title and self.personnel:
            self.job_title = self.personnel.job_title
        if (not self.daily_base_wage or self.daily_base_wage == 0) and self.personnel:
            self.daily_base_wage = self.personnel.daily_base_wage
        super().save(*args, **kwargs)
```

---

## ۳. تغییرات در لایه بک‌اند (Backend Changes)

### ۱. اندپوینت استعلام کد ملی (`lookup-by-national-code`)
در فایل `backend/personnel/views.py` روی `PersonnelProfileViewSet`:

```python
    @action(detail=False, methods=['get'], url_path='lookup-by-national-code')
    def lookup_by_national_code(self, request):
        national_code = request.query_params.get('national_code', '').strip()
        if not national_code or len(national_code) != 10:
            return Response({'error': 'کد ملی معتبر ۱۰ رقمی ارسال نشده است.'}, status=status.HTTP_400_BAD_REQUEST)

        cid = validate_user_company_access(request.user, get_request_company_id(request))
        qs = PersonnelProfile.objects.all()
        if cid:
            qs = qs.filter(Q(company_id=cid) | Q(section__project__company_id=cid))
        
        personnel = qs.filter(national_code=national_code).first()
        if not personnel:
            return Response({'found': False}, status=status.HTTP_200_OK)

        return Response({
            'found': True,
            'personnel': {
                'id': personnel.id,
                'first_name': personnel.first_name,
                'last_name': personnel.last_name,
                'national_code': personnel.national_code,
                'father_name': personnel.father_name,
                'gender': personnel.gender,
                'id_number': personnel.id_number,
                'id_series': personnel.id_series,
                'id_serial': personnel.id_serial,
                'birth_date': personnel.birth_date,
                'birth_place': personnel.birth_place,
                'issue_place': personnel.issue_place,
                'marital_status': personnel.marital_status,
                'children_count': personnel.children_count,
                'phone_number': personnel.phone_number,
                'job_title': personnel.job_title,
                'daily_base_wage': float(personnel.daily_base_wage or 0),
                'bank_name': personnel.bank_name,
                'account_number': personnel.account_number,
                'sheba_number': personnel.sheba_number,
                'current_section_id': personnel.section_id,
                'current_section_name': personnel.section.name if personnel.section else None,
                'attachment_url': personnel.attachment.url if personnel.attachment else None,
            }
        }, status=status.HTTP_200_OK)
```

### ۲. اتصال کوئری لیست پرسنل به جدول انتساب‌ها (`get_queryset`)
در `PersonnelProfileViewSet`:
```python
        section_id = self.request.query_params.get('section_id')
        if section_id:
            qs = qs.filter(
                Q(section_id=section_id) | 
                Q(section_assignments__section_id=section_id, section_assignments__is_active=True)
            ).distinct()
```

### ۳. کنترل عدم تداخل کارکرد روزانه (`DailyAttendance`)
در سریالایزر `DailyAttendance`:
```python
    def validate(self, attrs):
        attrs = super().validate(attrs)
        personnel = attrs.get('personnel') or getattr(self.instance, 'personnel', None)
        date_shamsi = attrs.get('date_shamsi') or getattr(self.instance, 'date_shamsi', None)
        status = attrs.get('status') or getattr(self.instance, 'status', None)
        section = attrs.get('section') or getattr(self.instance, 'section', None)

        if personnel and date_shamsi and status == 'PRESENT_10H':
            existing = DailyAttendance.objects.filter(
                personnel=personnel,
                date_shamsi=date_shamsi,
                status='PRESENT_10H',
                is_deleted=False
            )
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if section:
                conflicting = existing.exclude(section=section).first()
                if conflicting:
                    sec_name = conflicting.section.name if conflicting.section else 'بخش دیگر'
                    raise serializers.ValidationError(
                        f"برای این پرسنل در تاریخ {date_shamsi} قبلاً در «{sec_name}» حاضر کامل ثبت شده است."
                    )
        return attrs
```

---

## ۴. تغییرات در لایه فرانت‌اند (Frontend Changes)

### ۱. اصلاح فرم مودال (`employee-new-personnel.html`)
* **ردیف ۱:**
  1. `کد ملی (۱۰ رقم) *` (با اعتبارسنجی الگوریتم Mod 11)
  2. `نام *`
  3. `نام خانوادگی *`
* **بنر هوشمند شناسایی پرونده قبلی:**
  نمایش پیام در صورت یافتن فرد و دکمه: `[📋 بازخوانی و انتساب به این بخش]`
* **ردیف اطلاعات تماس:**
  افزودن دکمه کپی ۱-کلیک درون کادر شماره همراه پرسنل.
* **حذف دراپ‌داون نوع قرارداد کاری:**
  حذف کامل از تمپلیت HTML.
* **فیلد تعداد فرزندان:**
  حذف شرط وابستگی به وضعیت تاهل و فعال ماندن دائمی.

### ۲. لاجیک کامپوننت فرانت‌اند (`employee-new-personnel.ts`)
* متد `copyPhoneToClipboard()` برای کپی شماره موبایل با توست فیدبک.
* متد `checkNationalCodeLookup()` به صورت دبانس‌شده در `onNationalCodeChange()`.
* متد `applyExistingPersonnelData()` برای پر کردن خودکار فرم.

### ۳. سرویس API فرانت‌اند (`personnel-api.service.ts`)
* متد `lookupPersonnelByNationalCode(nationalCode: string): Observable<any>`
* متد `assignPersonnelToSection(personnelId: number, sectionId: number, data?: any): Observable<any>`

---

## ۵. نقشه فازبندی اجرا (Phased Execution Plan)

| فاز | عنوان | اقدامات اصلی | تست و اعتبارسنجی |
| :--- | :--- | :--- | :--- |
| **فاز ۱** | **ارگونومی فرم و چیدمان نهایی** | • اول بودن کد ملی در ردیف ۱<br>• دکمه کپی شماره موبایل<br>• حذف سلکتور نوع قرارداد<br>• باز ماندن فیلد فرزندان برای همه وضعیت‌ها | تست تایپ ۱ و بیلد فرانت‌اند |
| **فاز ۲** | **هوشمندسازی استعلام کد ملی** | • ایجاد اکشن `lookup-by-national-code` در بک‌اند<br>• بنر فراخوانی خودکار در فرم فرانت‌اند<br>• لود ۱-کلیک تمام فیلدهای شناسنامه‌ای و شبا | تست استعلام کد ملی موجود و ناموجود |
| **فاز ۳** | **پشتیبانی از چند بخش و پروژه** | • مدل `PersonnelSectionAssignment`<br>• کوئری فیلتر چندگانه در `get_queryset`<br>• استقلال سمت و دستمزد برای هر بخش | مشاهده فرد در هر دو بخش `section_id=3` و `section_id=5` |
| **فاز ۴** | **کنترل عدم تداخل کارکرد** | • اعتبارسنجی عدم ثبت حاضر کامل همزمان در دو پروژه در یک تاریخ | تست ثبت کارکرد تکراری و تایید مسدودسازی |
| **فاز ۵** | **تست نهایی و ساخت محصول** | • اجرای کامل تست‌های فرانت‌اند و بک‌اند<br>• اجرای بیلد نهایی `npm run build` | تأیید عملکرد بدون خطا با اسکرین‌شات مرورگر |

</div>
