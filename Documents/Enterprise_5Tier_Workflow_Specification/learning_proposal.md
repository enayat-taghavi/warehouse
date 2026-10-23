<div dir="rtl" align="right">

# پروپوزال یادگیری و استخراج قوانین گردش کار ۵ سطحی هوشمند سازمانی
## (Learning Proposal: Enterprise 5-Tier Dynamic Workflow Invariants)

### ۱. دسته‌بندی و منطق یادگیری (Classification & Rationale)
* **نوع:** قانون جدید سیستم (Workspace Rule Addition).
* **هدف:** اضافه کردن **بخش ۸ (Enterprise 5-Tier Dynamic Workflow Standards)** به فایل قوانین سراسری پروژه (`.agents\AGENTS.md`) جهت تضمین پایبندی تمامی ایجنت‌ها، مدل‌های بک‌اند، کامپوننت‌های انگولار، تست‌ها و کارتابل‌ها به این معماری.

---

### ۲. قوانین و اصول استخراج‌شده (Extracted Engineering Rules)

1. **تفکیک قطعی نقش‌های ۵ گانه (Separation of 5 Roles):**
   * **کارمند انبار:** ثبت اولیه داده‌ها، مدارک و ترددها.
   * **سرپرست انبار:** تایید فیزیکی و عملیاتی حضور و سرویس‌ها.
   * **حسابدار:** کنترل قوانین، بیمه، مالیات، شبا و صدور سند حسابداری.
   * **مدیر شرکت:** تصویب نهایی بودجه، استخدام و صدور «مجوز پرداخت».
   * **خزانه‌دار / متصدی پرداخت:** انجام عملیات بانکی، ثبت شماره پیگیری و تیک تسویه نهایی.
   * *قانون استقلال حسابدار و خزانه‌دار:* حسابدار نباید مستقیم واریز کند و خزانه‌دار نباید اسناد حقوق را دستکاری کند.

2. **الگوی عبور هوشمند از بالا به پایین (Dynamic Auto-Pass Principle):**
   * اگر کاربری با سطح دسترسی بالاتر داده‌ای را ثبت کند، مراحل پایین‌تر به صورت خودکار تایید (`Auto-Passed`) می‌شوند و پرونده مستقیماً به مرحله همان کاربر یا مرحله بعد هدایت می‌گردد، همراه با ثبت ردپای ممیزی (`created_by`, `auto_passed_by`).

3. **مسیرهای بازگشت و رد (Rejection & Revision Protocol):**
   * تمامی عملیات رد یا ارجاع به بازنگری الزاماً باید با ثبت فیلد توضیحات (`rejection_reason`) همراه باشند.
   * ارجاع به بازنگری به مبدا خطا برمی‌گردد تا اپراتور با هایلایت تغییرات (Diff Viewer) اصلاح و باز ارسال کند.

4. **تفکیک و تاب‌آوری پرداخت در خزانه‌داری (Partial & Batch Treasury Resilience):**
   * عملیات پرداخت در کارتابل خزانه‌داری باید از پرداخت‌های گروهی و تفکیکی پشتیبانی کند؛ بروز نقص بانکی یا شبای یک شخص نباید کل پرداخت‌های دیگران را مسدود سازد.

5. **فریز سوابق بسته شده و تعدیلات ماه جاری (Locking & Retroactive Adjustments):**
   * با پرداخت و تسویه نهایی ماه، سوابق فریز و قفل می‌شوند (`is_locked: True`). هرگونه اصلاح عطف به ماسبق تنها از طریق ثبت اقلام تعدیل در ماه جاری امکان‌پذیر است.

---

### ۳. متن پیشنهادی جهت الحاق به `AGENTS.md` (Proposed Diff)

```markdown
### 8. Enterprise 5-Tier Dynamic Workflow Standards
- **Strict 5-Tier Separation:** The lifecycle for personnel onboarding, fleet registration, attendance/trips, monthly payroll, and invoices MUST strictly adhere to the 5 distinct roles: 1) Warehouse Operator (entry), 2) Warehouse Supervisor (operational approval), 3) Accountant (financial audit/tax/social security/sheba), 4) Executive Manager (budget approval & payment authorization), and 5) Treasury/Cashier (bank disbursement & final settlement checkbox).
- **Accountant vs. Treasury Separation:** Accounting calculation permissions (`perm_approve_personnel_finance`) and cash/bank execution permissions (`perm_treasury_disburse`) MUST remain strictly isolated roles.
- **Dynamic Auto-Pass Principle:** If a higher-tier authority (Supervisor, Accountant, Executive) initiates a record, preceding levels MUST be automatically marked as `auto_passed` with complete audit metadata, skipping unnecessary administrative friction.
- **Mandatory Rejection Reasons & Revision Routing:** Rejections and return-for-revision actions MUST strictly require a mandatory `rejection_reason` and route back directly to the faulty stage or operator for amendment without resetting the entire history.
- **Partial & Batch Treasury Resilience:** Treasury disbursement workflows MUST support single-item fallback alongside batch payouts, ensuring a single invalid Sheba or bank error never blocks the rest of the disbursement pool.
- **Retroactive Adjustment Invariant:** Closed and paid periods (`is_locked: True`) are immutable; historical revisions MUST be booked as retroactive adjustments in the current open period.
```

</div>
