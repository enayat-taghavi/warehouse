<div dir="rtl" align="right">

# طرح جامع ارتقای پنل ثبت و چرخه تایید پرسنل و ناوگان

این سند فنی به تشریح نقشه مهندسی و تغییرات دقیق کدها در بک‌اند و فرانت‌اند برای حل ریشه‌ای خطای اعتبارسنجی شرکت (`company`)، افزودن قابلیت ثبت یادداشت/توضیحات در مراحل تایید (`approval_note`)، و تفکیک وظایف در تکمیل اطلاعات مالی و احکام حقوقی می‌پردازد.

---

## ۱. اهداف و نیازمندی‌ها (Requirements & Objectives)

| ردیف | موضوع | وضعیت فعلی | وضعیت هدف |
| :--- | :--- | :--- | :--- |
| ۱ | **حل خطای شرکت در ثبت پرسنل و خودرو** | خطای ۴۰۰ `company: This field is required` به دلیل اعتبارسنجی خودکار DRF روی `UniqueConstraint` | استخراج خودکار شرکت از روی بخش انتخابی و ارسال همزمان از فرانت‌اند و تزریق در بک‌اند |
| ۲ | **ثبت یادداشت و توضیحات در مسیر تایید** | تاییدات بدون یادداشت انجام شده و فیلد دلیل صرفاً برای رد/عودت فعال است | امکان ثبت توضیحات و شروط اختیاری در تمامی گام‌های تایید (سرپرست، حسابدار، مدیر) و ثبت در `WorkflowAuditLog` |
| ۳ | **تکمیل احکام و اطلاعات بیمه/مالیات در کارتابل** | فرم اولیه بیش از حد سنگین است یا اطلاعات احکام در فرآیند تایید مفقود می‌شود | حفظ سادگی ثبت اولیه (اطلاعات فردی و بانکی) و فراهم‌سازی فرم بازبینی و تکمیل احکام در کارتابل حسابداری/مدیریت |
| ۴ | **تثبیت تبدیل دوطرفه شبا و حساب** | توابع شبا و بانک پیاده‌سازی شده | تثبیت و حفظ سازگاری کامل در فرمت ارسال داده‌ها و اعتبارسنجی |

---

## ۲. ریشه‌یابی فنی مشکل شرکت (Root Cause Analysis)

> [!IMPORTANT]
> **علت رخداد خطای ۴۰۰ (`company: This field is required`):**
> در مدل‌های `PersonnelProfile` و `VehicleDriverProfile` قید یکتایی `UniqueConstraint(fields=['company', 'national_code'])` و `UniqueConstraint(fields=['company', 'plate_number'])` تعریف شده است. فریم‌ورک DRF هنگام ساخت سریالایزر، به‌طور خودکار اعتبارسنج `UniqueTogetherValidator` تولید می‌کند و تمامی فیلدهای داخل قید را اجباری (`required = True`) می‌سازد. از طرفی فرم فرانت‌اند فقط `section` را می‌فرستاد، لذا قبل از رسیدن به متد `save()`، سریالایزر مانع ثبت می‌شد.

---

## ۳. تغییرات پیشنهادی در لایه بک‌اند (Backend Changes)

### الف) سریالایزرهای پرسنل و خودرو (`backend/personnel/serializers.py`)
* تنظیم `extra_kwargs` برای فیلد `company` در هر دو مدل جهت جلوگیری از اجباری شدن توسط `UniqueTogetherValidator`.
* افزودن فیلد خواندنی `company_id` در `ProjectSectionSerializer`.

```python
# personnel/serializers.py

class ProjectSectionSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_code = serializers.CharField(source='project.code', read_only=True)
    company_id = serializers.IntegerField(source='project.company_id', read_only=True)

    class Meta:
        model = ProjectSection
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PersonnelProfileSerializer(serializers.ModelSerializer):
    # ... سایر فیلدهای موجود ...
    class Meta:
        model = PersonnelProfile
        fields = '__all__'
        read_only_fields = [
            'created_at', 'updated_at', 'created_by',
            'supervisor_approved_by', 'supervisor_approved_at',
            'accountant_approved_by', 'accountant_approved_at',
            'manager_approved_by', 'manager_approved_at',
            'treasury_paid_by', 'treasury_paid_at',
            'is_auto_passed', 'auto_passed_by', 'auto_passed_at',
            'revision_requested_by', 'revision_requested_at'
        ]
        extra_kwargs = {
            'company': {'required': False, 'allow_null': True}
        }


class VehicleDriverProfileSerializer(serializers.ModelSerializer):
    # ... سایر فیلدهای موجود ...
    class Meta:
        model = VehicleDriverProfile
        fields = '__all__'
        read_only_fields = [ ... ]
        extra_kwargs = {
            'company': {'required': False, 'allow_null': True}
        }
```

### ب) ویوهای پرسنل و خودرو (`backend/personnel/views.py`)
1. **تزریق خودکار شرکت در متد `create` و `perform_create`:**
   اگر فرانت‌اند به هر دلیلی مقدار `company` را خالی گذاشته باشد، سرور از روی بخش انتخابی (`section.project.company_id`) یا شرکت فعال تانت آن را پیش از اعتبارسنجی پر می‌کند:
```python
    def create(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        section_id = data.get('section')
        if not data.get('company') and section_id:
            try:
                sec = ProjectSection.objects.filter(id=int(section_id)).select_related('project').first()
                if sec and sec.project and sec.project.company_id:
                    data['company'] = sec.project.company_id
            except (ValueError, TypeError):
                pass
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
```

2. **پشتیبانی از یادداشت تایید (`approval_note`) در اکشن‌های تایید:**
```python
    @action(detail=True, methods=['post'], url_path='approve-supervisor')
    def approve_supervisor(self, request, pk=None):
        # ... بررسی مجوز سرپرست ...
        instance = self.get_object()
        note = request.data.get('note') or request.data.get('approval_note') or ''
        
        old_status = instance.approval_status
        instance.approval_status = 'pending_accountant'
        instance.supervisor_approved_by = user
        instance.supervisor_approved_at = timezone.now()
        instance.rejection_reason = None
        instance.save()
        
        # ثبت در لاگ ممیزی جامع
        WorkflowAuditLog.objects.create(
            content_type='personnel',
            object_id=instance.id,
            actor=user,
            from_status=old_status,
            to_status='pending_accountant',
            action='approve_supervisor',
            reason=note,
            metadata={'approval_note': note, 'actor_role': 'supervisor'}
        )
        # ... broadcast ...
```

---

## ۴. تغییرات پیشنهادی در لایه فرانت‌اند (Frontend Changes)

### الف) فرم‌های ثبت پرسنل و خودرو
* [employee-new-personnel.ts](file:///e:/warehouse%20project/frontend/src/app/components/finance/employee/employee-new-personnel/employee-new-personnel.ts) و [employee-new-vehicle.ts](file:///e:/warehouse%20project/frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts):
  - در متد `savePersonnel()` و `saveVehicle()`، مقدار `company` بر اساس اولویت:
    1) `this.selectedSection?.company_id`
    2) `this.activeCompanyService?.activeCompany?.id`
    شناسایی شده و به `payload` یا `formData` اضافه می‌گردد.

### ب) سرویس API پرسنل (`personnel-api.service.ts`)
* گسترش متدهای تایید جهت دریافت یادداشت اختیاری:
```typescript
approvePersonnelSupervisor(id: number, note?: string): Observable<any> {
  return this.api.post<any>(`${this.baseUrl}/profiles/${id}/approve-supervisor/`, { note });
}
approvePersonnelFinance(id: number, note?: string): Observable<any> {
  return this.api.post<any>(`${this.baseUrl}/profiles/${id}/approve-finance/`, { note });
}
approvePersonnelManager(id: number, note?: string): Observable<any> {
  return this.api.post<any>(`${this.baseUrl}/profiles/${id}/approve-manager/`, { note });
}
```

### ج) مودال تایید با ثبت یادداشت و بازبینی احکام در کارتابل‌ها
* در [supervisor-new-profiles.ts](file:///e:/warehouse%20project/frontend/src/app/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.ts) و [manager-approvals.ts](file:///e:/warehouse%20project/frontend/src/app/components/personnel/manager-approvals/manager-approvals.ts):
  - اضافه شدن مودال تایید (`openApproveModal(item)`) شامل کادر متنی توضیحات اختیاری و ثبت در لاگ سیستم.
  - امکان ویرایش و تدقیق فیلدهای مالی در مودال جزئیات قبل از تایید نهایی.

---

## ۵. نقشه فایل‌های درگیر و تغییرات (Files to Modify)

| ردیف | مسیر فایل | نوع عملیات | هدف تغییر |
| :--- | :--- | :--- | :--- |
| ۱ | `backend/personnel/serializers.py` | `[MODIFY]` | اضافه کردن `extra_kwargs` برای شرکت و `company_id` در بخش |
| ۲ | `backend/personnel/views.py` | `[MODIFY]` | تزریق خودکار شرکت در `create` و ثبت لاگ توضیحات در `approve_*` |
| ۳ | `frontend/src/app/core/models/personnel.model.ts` | `[MODIFY]` | افزودن `company_id` به اینترفیس `ProjectSection` |
| ۴ | `frontend/src/app/core/api/personnel-api.service.ts` | `[MODIFY]` | افزودن آرگومان اختیاری `note` به متدهای تایید |
| ۵ | `frontend/src/app/components/finance/employee/employee-new-personnel/employee-new-personnel.ts` | `[MODIFY]` | ارسال فیلد `company` در ذخیره فرم پرسنل |
| ۶ | `frontend/src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts` | `[MODIFY]` | ارسال فیلد `company` در ذخیره فرم خودرو |
| ۷ | `frontend/src/app/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.ts` | `[MODIFY]` | مودال تایید با قابلیت ثبت توضیحات اختیاری |
| ۸ | `frontend/src/app/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.html` | `[MODIFY]` | رابط کاربری مودال ثبت توضیحات تایید |
| ۹ | `frontend/src/app/components/personnel/manager-approvals/manager-approvals.ts` | `[MODIFY]` | پشتیبانی از یادداشت تایید مدیر و بازبینی احکام |
| ۱۰ | `frontend/src/app/components/personnel/manager-approvals/manager-approvals.html` | `[MODIFY]` | رابط کاربری مودال تایید و توضیحات مدیر |

---

## ۶. برنامه اعتبارسنجی و تست‌ها (Verification Plan)

### تست‌های خودکار (Automated Tests)
1. **تست بک‌اند جنگو:**
   ```bash
   .\venv\Scripts\python.exe manage.py test personnel.tests_personnel_cycle personnel.tests_vehicle_cycle
   ```
2. **تست فرانت‌اند انگولار:**
   ```bash
   npm test -- --include src/app/components/finance/employee/employee-new-personnel/employee-new-personnel.spec.ts --run
   npm test -- --include src/app/components/finance/employee/employee-new-vehicle/employee-new-vehicle.spec.ts --run
   ```
3. **تست ساخت نهایی (Build Verification):**
   ```bash
   npm run build
   ```

</div>
