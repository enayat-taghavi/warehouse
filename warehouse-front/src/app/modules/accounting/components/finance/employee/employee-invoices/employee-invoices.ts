import { Component, OnInit, ChangeDetectorRef, Optional } from '@angular/core';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectSection, Counterparty, ExpenseInvoice } from '../../../../../../core/models/personnel.model';
import { PersonnelApiService } from '../../../../../../core/api/personnel-api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';
import { validateSheba, ShebaValidationResult } from '../../../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export type InvoiceStatusTab = 'all' | 'draft' | 'pending_supervisor' | 'pending_accountant' | 'ready_to_pay' | 'paid' | 'rejected';

@Component({
  selector: 'app-employee-invoices-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionButtonComponent, TabBarComponent, CommandCenterComponent],
  templateUrl: './employee-invoices.html',
  styleUrl: './employee-invoices.css'
})
export class EmployeeInvoicesHubComponent implements OnInit {
  readonly Math = Math;

  // Memoized tabs for app-tab-bar
  private invoiceStatusTabsKey = '';
  private invoiceStatusTabsCache: TabDef[] = [];
  get invoiceStatusTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.all}:${sc.draft}:${sc.pending_supervisor}:${sc.pending_accountant}:${sc.ready_to_pay}:${sc.paid}`;
    if (key !== this.invoiceStatusTabsKey) {
      this.invoiceStatusTabsKey = key;
      this.invoiceStatusTabsCache = [
        { id: 'all', label: 'همه', icon: 'status-all', count: sc.all },
        { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft', count: sc.draft },
        { id: 'pending_supervisor', label: 'در انتظار سرپرست', shortLabel: 'سرپرست', icon: 'status-pending', count: sc.pending_supervisor },
        { id: 'pending_accountant', label: 'در انتظار حسابدار', shortLabel: 'حسابدار', icon: 'role-accountant', count: sc.pending_accountant },
        { id: 'ready_to_pay', label: 'آماده پرداخت', shortLabel: 'آماده', icon: 'status-approved', count: sc.ready_to_pay },
        { id: 'paid', label: 'پرداخت‌شده', icon: ACCOUNTING_ENTITY_ICONS.payroll, count: sc.paid },
      ];
    }
    return this.invoiceStatusTabsCache;
  }
  // ─── مدیریت بخش و ایزولاسیون داده‌ها (Guardian G1: Section Isolation) ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;

  // ─── لیست فاکتورها و وضعیت بارگذاری ───
  invoices: ExpenseInvoice[] = [];
  isLoading: boolean = false;
  isSaving: boolean = false;

  // ─── جستجو و فیلتر کارتابل ───
  invoiceSearch: string = '';
  statusFilter: InvoiceStatusTab = 'all';

  // ─── لیست طرف‌های حساب ───
  counterparties: Counterparty[] = [];
  isLoadingCounterparties: boolean = false;

  // ─── دسته‌بندی‌های استاندارد هزینه ───
  readonly expenseCategories: string[] = [
    'تعمیرات و نگهداری',
    'سوخت و روغن',
    'کرایه و حمل',
    'قطعات یدکی',
    'تجهیزات و ملزومات',
    'پذیرایی و اداری',
    'متفرقه'
  ];

  // ─── مودال ثبت فاکتور جدید (Guardian G2: Draft Invariant) ───
  isNewInvoiceModalOpen: boolean = false;
  newInvoice: Partial<ExpenseInvoice> = {
    invoice_number: '',
    invoice_date_shamsi: '',
    amount: 0,
    category: 'تعمیرات و نگهداری',
    counterparty: undefined,
    description: '',
    status: 'draft'
  };
  selectedInvoiceAttachment: File | null = null;
  attachmentFileName: string = '';

  // ─── مودال تعریف سریع طرف‌حساب جدید ───
  isQuickCounterpartyModalOpen: boolean = false;
  newCounterparty: Partial<Counterparty> = {
    name: '',
    counterparty_type: 'repair_shop',
    phone: '',
    national_id: '',
    bank_name: '',
    account_number: '',
    sheba_number: '',
    is_active: true
  };
  shebaValidationResult: ShebaValidationResult | null = null;

  // ─── مودال پیش‌نمایش تصویر پیوست فاکتور ───
  isAttachmentPreviewModalOpen: boolean = false;
  previewAttachmentUrl: string | null = null;
  previewInvoiceTitle: string = '';

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() private activeCompanyService?: ActiveCompanyService
  ) {}

  ngOnInit(): void {
    this.initTodayShamsi();
    this.loadMySections();
    this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId) && sId !== this.selectedSectionId) {
          this.selectedSectionId = sId;
          this.selectedSection = this.mySections.find(s => s.id === sId) || null;
          if (this.selectedSectionId) {
            this.loadInvoices();
            this.loadCounterparties();
          }
        }
      }
    });
  }

  // ─── تاریخ شمسی امروز ───
  todayShamsi: string = '';
  private initTodayShamsi(): void {
    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    this.todayShamsi = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }

  // ─── بارگذاری بخش‌های مجاز کارمند ───
  loadMySections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          const isSuper = this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all');
          if (isSuper) {
            this.personnelApi.getProjectSections({ is_active: true }).subscribe({
              next: (allSecs: ProjectSection[]) => {
                this.mySections = allSecs || [];
                this.pickDefaultSection();
              },
              error: () => {
                this.isLoadingSections = false;
                this.cdr.detectChanges();
              }
            });
            return;
          }
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.cdr.detectChanges();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      if (this.selectedSectionId) {
        this.loadInvoices();
        this.loadCounterparties();
      }
    }
    this.isLoadingSections = false;
    this.cdr.detectChanges();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId },
      queryParamsHandling: 'merge'
    });
    this.loadInvoices();
    this.loadCounterparties();
  }

  // ─── بارگذاری فاکتورهای بخش فعال (Guardian G1: Section Isolation) ───
  loadInvoices(): void {
    if (!this.selectedSectionId) return;
    this.isLoading = true;
    this.personnelApi.getExpenseInvoices({ section_id: this.selectedSectionId }).subscribe({
      next: (res: ExpenseInvoice[]) => {
        this.invoices = res || [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.show('error', 'خطا در بارگذاری فاکتورها: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── بارگذاری طرف‌های حساب ───
  loadCounterparties(): void {
    this.isLoadingCounterparties = true;
    this.personnelApi.getCounterparties().subscribe({
      next: (res: any) => {
        // Handle pagination or plain list
        this.counterparties = Array.isArray(res) ? res : (res?.results || []);
        this.isLoadingCounterparties = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingCounterparties = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فیلتر هوشمند فاکتورها ───
  get filteredInvoices(): ExpenseInvoice[] {
    let list = this.invoices;

    // فیلتر تب وضعیت
    if (this.statusFilter !== 'all') {
      list = list.filter(inv => inv.status === this.statusFilter);
    }

    // جستجوی متنی
    const q = this.invoiceSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(inv =>
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
        (inv.counterparty_name && inv.counterparty_name.toLowerCase().includes(q)) ||
        (inv.category && inv.category.toLowerCase().includes(q)) ||
        (inv.description && inv.description.toLowerCase().includes(q))
      );
    }

    return list;
  }

  // ─── شمارنده‌های تب‌های وضعیت ───
  get statusCounters(): Record<InvoiceStatusTab, number> {
    return {
      all: this.invoices.length,
      draft: this.invoices.filter(i => i.status === 'draft').length,
      pending_supervisor: this.invoices.filter(i => i.status === 'pending_supervisor').length,
      pending_accountant: this.invoices.filter(i => i.status === 'pending_accountant').length,
      ready_to_pay: this.invoices.filter(i => i.status === 'ready_to_pay').length,
      paid: this.invoices.filter(i => i.status === 'paid').length,
      rejected: this.invoices.filter(i => i.status === 'rejected').length
    };
  }

  // ─── شاخص‌های کلیدی آماری (KPI Metrics) ───
  get summaryMetrics() {
    const totalCount = this.invoices.length;
    const totalAmount = this.invoices.reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);
    const draftCount = this.statusCounters.draft;
    const pendingCount = this.statusCounters.pending_supervisor + this.statusCounters.pending_accountant;
    const paidAmount = this.invoices
      .filter(i => i.status === 'paid')
      .reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);

    return {
      totalCount,
      totalAmount,
      totalAmountTomans: Math.floor(totalAmount / 10),
      draftCount,
      pendingCount,
      paidAmount,
      paidAmountTomans: Math.floor(paidAmount / 10)
    };
  }

  // ─── سوییچ تب وضعیت ───
  setStatusFilter(tab: string): void {
    if (
      tab === 'all' ||
      tab === 'draft' ||
      tab === 'pending_supervisor' ||
      tab === 'pending_accountant' ||
      tab === 'ready_to_pay' ||
      tab === 'paid' ||
      tab === 'rejected'
    ) {
      this.statusFilter = tab;
    }
  }

  // ─── تبدیل ریال به تومان برای فرم ثبت ───
  get amountInTomans(): number {
    return Math.floor((Number(this.newInvoice.amount) || 0) / 10);
  }

  // ─── مودال ثبت فاکتور جدید (Guardian G2: Force status = 'draft') ───
  openNewInvoiceModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.newInvoice = {
      section: this.selectedSectionId,
      invoice_number: '',
      invoice_date_shamsi: this.todayShamsi,
      amount: 0,
      category: 'تعمیرات و نگهداری',
      counterparty: undefined,
      description: '',
      status: 'draft' // Guardian G2: تحمیل وضعیت پیش‌نویس
    };
    this.selectedInvoiceAttachment = null;
    this.attachmentFileName = '';
    this.isNewInvoiceModalOpen = true;
    this.cdr.detectChanges();
  }

  closeNewInvoiceModal(): void {
    this.isNewInvoiceModalOpen = false;
    this.cdr.detectChanges();
  }

  onInvoiceFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      // محدودیت حجم فایل تا ۱۰ مگابایت
      if (file.size > 10 * 1024 * 1024) {
        this.toast.show('warning', 'حجم فایل پیوست نباید بیشتر از ۱۰ مگابایت باشد.');
        return;
      }
      this.selectedInvoiceAttachment = file;
      this.attachmentFileName = file.name;
    }
  }

  removeSelectedAttachment(): void {
    this.selectedInvoiceAttachment = null;
    this.attachmentFileName = '';
  }

  saveInvoice(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'بخش فعال مشخص نیست.');
      return;
    }
    if (!this.newInvoice.counterparty) {
      this.toast.show('warning', 'لطفاً طرف‌حساب فاکتور را انتخاب کنید.');
      return;
    }
    if (!this.newInvoice.invoice_number?.trim()) {
      this.toast.show('warning', 'شماره فاکتور / رسید الزامی است.');
      return;
    }
    if (!this.newInvoice.invoice_date_shamsi?.trim()) {
      this.toast.show('warning', 'تاریخ فاکتور الزامی است.');
      return;
    }
    if (!this.newInvoice.amount || this.newInvoice.amount <= 0) {
      this.toast.show('warning', 'مبلغ فاکتور باید بزرگتر از صفر ریال باشد.');
      return;
    }

    this.isSaving = true;

    // در صورت وجود پیوست از FormData استفاده می‌کنیم
    let payload: Partial<ExpenseInvoice> | FormData;

    if (this.selectedInvoiceAttachment) {
      const formData = new FormData();
      formData.append('section', String(this.selectedSectionId));
      formData.append('counterparty', String(this.newInvoice.counterparty));
      formData.append('invoice_number', this.newInvoice.invoice_number.trim());
      formData.append('invoice_date_shamsi', this.newInvoice.invoice_date_shamsi.trim());
      formData.append('amount', String(this.newInvoice.amount));
      formData.append('category', this.newInvoice.category || 'متفرقه');
      formData.append('description', this.newInvoice.description || '');
      formData.append('status', 'draft'); // Guardian G2
      formData.append('attachment', this.selectedInvoiceAttachment);
      payload = formData;
    } else {
      payload = {
        section: this.selectedSectionId,
        counterparty: this.newInvoice.counterparty,
        invoice_number: this.newInvoice.invoice_number.trim(),
        invoice_date_shamsi: this.newInvoice.invoice_date_shamsi.trim(),
        amount: this.newInvoice.amount,
        category: this.newInvoice.category || 'متفرقه',
        description: this.newInvoice.description || '',
        status: 'draft' // Guardian G2
      };
    }

    this.personnelApi.createExpenseInvoice(payload).subscribe({
      next: (created: ExpenseInvoice) => {
        this.isSaving = false;
        this.toast.show('success', `فاکتور «${created.invoice_number}» با موفقیت در وضعیت پیش‌نویس ثبت شد.`);
        this.closeNewInvoiceModal();
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت فاکتور: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── مودال تعریف سریع طرف‌حساب جدید ───
  openQuickCounterpartyModal(): void {
    this.newCounterparty = {
      name: '',
      counterparty_type: 'repair_shop',
      phone: '',
      national_id: '',
      bank_name: '',
      account_number: '',
      sheba_number: '',
      is_active: true
    };
    this.shebaValidationResult = null;
    this.isQuickCounterpartyModalOpen = true;
    this.cdr.detectChanges();
  }

  closeQuickCounterpartyModal(): void {
    this.isQuickCounterpartyModalOpen = false;
    this.cdr.detectChanges();
  }

  onShebaInput(): void {
    if (!this.newCounterparty.sheba_number) {
      this.shebaValidationResult = null;
      return;
    }
    const val = this.newCounterparty.sheba_number.trim();
    this.shebaValidationResult = validateSheba(val);
    if (this.shebaValidationResult.isValid && this.shebaValidationResult.bank) {
      this.newCounterparty.bank_name = this.shebaValidationResult.bank.name;
    }
  }

  saveQuickCounterparty(): void {
    if (!this.newCounterparty.name?.trim()) {
      this.toast.show('warning', 'نام شخص یا شرکت/فروشگاه الزامی است.');
      return;
    }

    this.isSaving = true;
    const payload = {
      ...this.newCounterparty,
      name: this.newCounterparty.name.trim(),
      phone: this.newCounterparty.phone?.trim() || undefined,
      national_id: this.newCounterparty.national_id?.trim() || undefined,
      sheba_number: this.newCounterparty.sheba_number?.trim() || undefined,
      bank_name: this.newCounterparty.bank_name?.trim() || undefined,
      account_number: this.newCounterparty.account_number?.trim() || undefined,
      is_active: true
    };

    // شرکت فعال در بدنه می‌ماند تا بازپخش صف آفلاین (که هدر شرکت ندارد) طرف‌حساب را سراسری نسازد
    const companyId = this.activeCompanyService?.activeCompanyId;
    this.personnelApi.createCounterparty(companyId ? { ...payload, company: companyId } : payload).subscribe({
      next: (created: Counterparty) => {
        this.isSaving = false;
        this.toast.show('success', `طرف‌حساب «${created.name}» با موفقیت افزوده شد.`);
        this.closeQuickCounterpartyModal();
        this.loadCounterparties();
        // انتساب خودکار طرف‌حساب تازه تعریف‌شده در فرم ثبت فاکتور
        if (this.isNewInvoiceModalOpen && created.id) {
          this.newInvoice.counterparty = created.id;
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت طرف‌حساب: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── ارسال فاکتور پیش‌نویس به سرپرست کارگاه ───
  sendToSupervisor(invoice: ExpenseInvoice): void {
    if (!invoice.id) return;
    if (invoice.status !== 'draft') {
      this.toast.show('warning', 'فقط فاکتورهای پیش‌نویس قابلیت ارسال به سرپرست را دارند.');
      return;
    }

    if (!confirm(`آیا از ارسال فاکتور شماره «${invoice.invoice_number}» به سرپرست جهت بررسی و تایید اطمینان دارید؟`)) {
      return;
    }

    this.isSaving = true;
    this.personnelApi.updateExpenseInvoice(invoice.id, { status: 'pending_supervisor' }).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `فاکتور شماره «${invoice.invoice_number}» با موفقیت جهت تایید به کارتابل سرپرست ارسال شد.`);
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ارسال به سرپرست: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── حذف فاکتور پیش‌نویس ───
  deleteDraftInvoice(invoice: ExpenseInvoice): void {
    if (!invoice.id) return;
    if (invoice.status !== 'draft') {
      this.toast.show('warning', 'فقط فاکتورهای در وضعیت پیش‌نویس قابل حذف توسط کارمند هستند.');
      return;
    }

    if (!confirm(`آیا از حذف فاکتور پیش‌نویس شماره «${invoice.invoice_number}» اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`)) {
      return;
    }

    this.isSaving = true;
    this.personnelApi.deleteExpenseInvoice(invoice.id).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `فاکتور پیش‌نویس «${invoice.invoice_number}» حذف شد.`);
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در حذف فاکتور: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── پیش‌نمایش تصویر پیوست ───
  openAttachmentPreview(invoice: ExpenseInvoice): void {
    if (!invoice.attachment) return;
    this.previewAttachmentUrl = invoice.attachment;
    this.previewInvoiceTitle = `پیوست فاکتور شماره ${invoice.invoice_number} - ${invoice.counterparty_name || ''}`;
    this.isAttachmentPreviewModalOpen = true;
    this.cdr.detectChanges();
  }

  closeAttachmentPreview(): void {
    this.isAttachmentPreviewModalOpen = false;
    this.previewAttachmentUrl = null;
    this.previewInvoiceTitle = '';
    this.cdr.detectChanges();
  }

  // ─── خروجی اکسل استاندارد فاکتورها ───
  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    const params = {
      section_id: this.selectedSectionId,
      status: this.statusFilter !== 'all' ? this.statusFilter : undefined
    };

    this.toast.show('info', 'در حال تولید فایل اکسل فاکتورهای هزینه...');
    this.personnelApi.exportExpenseInvoicesExcel(params).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expense_invoices_${this.selectedSection?.code || 'section'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.show('success', 'فایل اکسل با موفقیت دانلود شد.');
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در دانلود فایل اکسل: ' + (err.message || 'نامشخص'));
      }
    });
  }

  // ─── برچسب‌ها و استایل‌های وضعیت فاکتور ───
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'pending_supervisor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'pending_accountant':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'ready_to_pay':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس کارمند';
      case 'pending_supervisor':
        return 'در انتظار تایید سرپرست';
      case 'pending_accountant':
        return 'در انتظار بررسی حسابدار';
      case 'ready_to_pay':
        return 'تایید مدیر / آماده پرداخت';
      case 'paid':
        return 'تسویه و پرداخت‌شده';
      case 'rejected':
        return 'رد شده';
      default:
        return status || 'نامشخص';
    }
  }

  formatNumber(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '۰';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    return n.toLocaleString('fa-IR');
  }
}
