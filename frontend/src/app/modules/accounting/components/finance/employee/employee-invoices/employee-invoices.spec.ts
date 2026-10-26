// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeInvoicesHubComponent } from './employee-invoices';
import { of, Subject } from 'rxjs';
import { ExpenseInvoice, Counterparty, ProjectSection } from '../../../../models/personnel.model';

describe('EmployeeInvoicesHubComponent Vitest Suite (Phase 3)', () => {
  let component: EmployeeInvoicesHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true },
    { id: 20, name: 'بخش تاسیسات', code: 'MEC', project: 1, project_name: 'پروژه پردیس', is_active: true }
  ];

  const sampleCounterparties: Counterparty[] = [
    {
      id: 101,
      name: 'تعمیرگاه مرکزی ایران',
      counterparty_type: 'repair_shop',
      counterparty_type_display: 'تعمیرگاه و قطعات یدکی',
      national_id: '1010101010',
      phone: '09121111111',
      bank_name: 'ملت',
      sheba_number: 'IR120120000000000000000001',
      is_active: true
    },
    {
      id: 102,
      name: 'جایگاه سوخت البرز',
      counterparty_type: 'fuel_station',
      counterparty_type_display: 'جایگاه سوخت و روانکارها',
      phone: '09122222222',
      is_active: true
    }
  ];

  const sampleInvoices: ExpenseInvoice[] = [
    {
      id: 1,
      section: 10,
      section_name: 'بخش ابنیه',
      counterparty: 101,
      counterparty_name: 'تعمیرگاه مرکزی ایران',
      invoice_number: 'INV-1001',
      invoice_date_shamsi: '1405/04/01',
      amount: 15000000,
      category: 'تعمیرات و نگهداری',
      description: 'تعمیر پمپ هیدرولیک بیل مکانیکی',
      attachment: 'http://localhost:8000/media/invoices/inv1.jpg',
      status: 'draft',
      status_display: 'پیش‌نویس کارمند',
      created_by_name: 'کارمند نمونه'
    },
    {
      id: 2,
      section: 10,
      section_name: 'بخش ابنیه',
      counterparty: 102,
      counterparty_name: 'جایگاه سوخت البرز',
      invoice_number: 'INV-1002',
      invoice_date_shamsi: '1405/04/02',
      amount: 8500000,
      category: 'سوخت و روغن',
      description: 'سوخت گازوئیل ماشین‌آلات بتن‌ریزی',
      attachment: null,
      status: 'pending_supervisor',
      status_display: 'در انتظار تایید سرپرست',
      created_by_name: 'کارمند نمونه'
    },
    {
      id: 3,
      section: 10,
      section_name: 'بخش ابنیه',
      counterparty: 101,
      counterparty_name: 'تعمیرگاه مرکزی ایران',
      invoice_number: 'INV-1003',
      invoice_date_shamsi: '1405/04/03',
      amount: 25000000,
      category: 'قطعات یدکی',
      description: 'خرید فیلتر و تسمه',
      attachment: 'http://localhost:8000/media/invoices/inv3.pdf',
      status: 'paid',
      status_display: 'تسویه و پرداخت‌شده',
      created_by_name: 'کارمند نمونه'
    }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_test', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getExpenseInvoices: vi.fn().mockReturnValue(of(sampleInvoices)),
      getCounterparties: vi.fn().mockReturnValue(of(sampleCounterparties)),
      getExpenseHeads: vi.fn().mockReturnValue(of([{ id: 1, company: 1, parent: null, code: '10', title: 'عملیاتی', is_active: true }, { id: 11, company: 1, parent: 1, code: '1001', title: 'تعمیرات و نگهداری', is_active: true }])),
      createExpenseInvoice: vi.fn().mockImplementation((data: any) => of({ id: 4, ...data, invoice_number: data.invoice_number || 'INV-1004' })),
      updateExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
      deleteExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
      createCounterparty: vi.fn().mockImplementation((data: any) => of({ id: 103, ...data })),
      exportExpenseInvoicesExcel: vi.fn().mockReturnValue(of(new Blob(['fake-excel-data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })))
    };

    mockToast = {
      show: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn()
    };

    mockRoute = {
      queryParams: of({ section_id: '10' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeeInvoicesHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );
  });

  describe('۱. مقداردهی اولیه و ایزولاسیون قلمرو بخش (Guardian G1: Section Isolation)', () => {
    it('باید بخش‌های مجاز کارمند را بارگذاری کرده و بخش پیش‌فرض را انتخاب کند', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
      expect(component.mySections.length).toBe(2);
      expect(component.selectedSectionId).toBe(10);
      expect(component.selectedSection?.name).toBe('بخش ابنیه');
    });

    it('باید فاکتورها را اجباراً با پارامتر section_id واکشی کند (تضمین نگهبان G1)', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getExpenseInvoices).toHaveBeenCalledWith({ section_id: 10 });
      expect(component.invoices.length).toBe(3);
    });

    it('در صورت تغییر بخش فعال، باید شناسه بخش جدید در URL ثبت و فاکتورها مجدداً واکشی شوند', () => {
      component.ngOnInit();
      component.selectedSectionId = 20;
      component.onSectionChanged();

      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { section_id: 20 },
        queryParamsHandling: 'merge'
      });
      expect(mockPersonnelApi.getExpenseInvoices).toHaveBeenCalledWith({ section_id: 20 });
    });
  });

  describe('۲. شاخص‌های کلیدی آماری و شمارنده‌های وضعیت (KPI Metrics & Counters)', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('باید جمع مبالغ و تعداد فاکتورها را به درستی محاسبه کند', () => {
      const metrics = component.summaryMetrics;
      expect(metrics.totalCount).toBe(3);
      // 15,000,000 + 8,500,000 + 25,000,000 = 48,500,000 Rials
      expect(metrics.totalAmount).toBe(48500000);
      expect(metrics.totalAmountTomans).toBe(4850000);
      expect(metrics.draftCount).toBe(1);
      expect(metrics.pendingCount).toBe(1);
      expect(metrics.paidAmount).toBe(25000000);
      expect(metrics.paidAmountTomans).toBe(2500000);
    });

    it('باید شمارنده‌های تب‌های وضعیت را به تفکیک محاسبه کند', () => {
      const counters = component.statusCounters;
      expect(counters.all).toBe(3);
      expect(counters.draft).toBe(1);
      expect(counters.pending_supervisor).toBe(1);
      expect(counters.ready_to_pay).toBe(0);
      expect(counters.paid).toBe(1);
      expect(counters.rejected).toBe(0);
    });
  });

  describe('۳. فیلتر کارتابل فاکتورها و جستجوی متنی', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('باید فاکتورها را بر اساس تب وضعیت فیلتر کند', () => {
      component.setStatusFilter('draft');
      expect(component.filteredInvoices.length).toBe(1);
      expect(component.filteredInvoices[0].invoice_number).toBe('INV-1001');

      component.setStatusFilter('pending_accountant');
      expect(component.filteredInvoices.length).toBe(0);

      component.setStatusFilter('paid');
      expect(component.filteredInvoices.length).toBe(1);
      expect(component.filteredInvoices[0].invoice_number).toBe('INV-1003');

      component.setStatusFilter('all');
      expect(component.filteredInvoices.length).toBe(3);
    });

    it('باید فاکتورها را بر اساس جستجوی شماره فاکتور فیلتر کند', () => {
      component.invoiceSearch = '1002';
      expect(component.filteredInvoices.length).toBe(1);
      expect(component.filteredInvoices[0].invoice_number).toBe('INV-1002');
    });

    it('باید فاکتورها را بر اساس نام طرف‌حساب و شرح فیلتر کند', () => {
      component.invoiceSearch = 'سوخت';
      expect(component.filteredInvoices.length).toBe(1);
      expect(component.filteredInvoices[0].counterparty_name).toBe('جایگاه سوخت البرز');

      component.invoiceSearch = 'هیدرولیک';
      expect(component.filteredInvoices.length).toBe(1);
      expect(component.filteredInvoices[0].invoice_number).toBe('INV-1001');
    });
  });

  describe('۴. تحمیل وضعیت پیش‌نویس در ثبت فاکتور (Guardian G2: Draft Invariant)', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('باز کردن مودال فاکتور جدید باید وضعیت را حتماً روی draft قرار دهد', () => {
      component.openNewInvoiceModal();
      expect(component.isNewInvoiceModalOpen).toBe(true);
      expect(component.newInvoice.status).toBe('draft');
      expect(component.newInvoice.section).toBe(10);
      expect(component.newInvoice.invoice_date_shamsi).toBe(component.todayShamsi);
    });

    it('در صورت ناقص بودن فیلدهای اجباری، پیام هشدار نمایش داده شده و درخواستی ارسال نشود', () => {
      component.openNewInvoiceModal();
      component.newInvoice.counterparty = undefined;
      component.saveInvoice();

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('طرف‌حساب'));
      expect(mockPersonnelApi.createExpenseInvoice).not.toHaveBeenCalled();

      component.newInvoice.counterparty = 101;
      component.newInvoice.invoice_number = '';
      component.saveInvoice();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('شماره فاکتور'));

      component.newInvoice.invoice_number = 'INV-999';
      component.newInvoice.amount = 0;
      component.saveInvoice();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('بزرگتر از صفر'));
    });

    it('ذخیره موفق فاکتور باید اجباراً وضعیت status="draft" را به بک‌اند ارسال کند', () => {
      component.openNewInvoiceModal();
      component.newInvoice = {
        section: 10,
        counterparty: 101,
        invoice_number: 'INV-NEW-99',
        invoice_date_shamsi: '1405/04/10',
        amount: 12000000,
        expense_head: 11,
        description: 'سرویس دوره‌ای بیل مکانیکی',
        status: 'draft'
      };

      component.saveInvoice();

      expect(mockPersonnelApi.createExpenseInvoice).toHaveBeenCalledWith(expect.objectContaining({
        section: 10,
        counterparty: 101,
        invoice_number: 'INV-NEW-99',
        amount: 12000000,
        expense_head: 11,
        status: 'draft' // Guardian G2
      }));
      expect(mockPersonnelApi.createExpenseInvoice.mock.calls[0][0]).not.toHaveProperty('category');
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس'));
      expect(component.isNewInvoiceModalOpen).toBe(false);
    });

    it('در صورت پیوست فایل، باید درخواست به صورت FormData و با وضعیت draft ارسال شود', () => {
      component.openNewInvoiceModal();
      component.newInvoice = {
        section: 10,
        counterparty: 101,
        invoice_number: 'INV-WITH-FILE',
        invoice_date_shamsi: '1405/04/10',
        amount: 5000000,
        expense_head: 11,
        description: 'خرید ابزار',
        status: 'draft'
      };

      const dummyFile = new File(['image-content'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedInvoiceAttachment = dummyFile;

      component.saveInvoice();

      expect(mockPersonnelApi.createExpenseInvoice).toHaveBeenCalled();
      const callArg = mockPersonnelApi.createExpenseInvoice.mock.calls[0][0];
      expect(callArg instanceof FormData).toBe(true);
      expect((callArg as FormData).get('status')).toBe('draft');
      expect((callArg as FormData).get('invoice_number')).toBe('INV-WITH-FILE');
      expect((callArg as FormData).get('expense_head')).toBe('11');
      expect((callArg as FormData).has('category')).toBe(false);
      expect((callArg as FormData).get('attachment')).toBe(dummyFile);
    });

    it('محاسبه زنده معادل تومان باید به درستی از مبلغ ریالی به دست آید', () => {
      component.newInvoice.amount = 45000000;
      expect(component.amountInTomans).toBe(4500000);
    });
  });

  describe('۵. مودال تعریف سریع طرف‌حساب جدید (QuickCounterpartyModal)', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('باز کردن مودال طرف‌حساب فیلدها را با مقادیر اولیه مقداردهی کند', () => {
      component.openQuickCounterpartyModal();
      expect(component.isQuickCounterpartyModalOpen).toBe(true);
      expect(component.newCounterparty.counterparty_type).toBe('repair_shop');
      expect(component.newCounterparty.is_active).toBe(true);
    });

    it('در صورت نامعتبر بودن نام طرف‌حساب خطا دهد', () => {
      component.openQuickCounterpartyModal();
      component.newCounterparty.name = '   ';
      component.saveQuickCounterparty();

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('نام شخص'));
      expect(mockPersonnelApi.createCounterparty).not.toHaveBeenCalled();
    });

    it('ثبت موفق طرف‌حساب باید آن را به صورت خودکار در فرم فاکتور انتساب دهد', () => {
      component.openNewInvoiceModal();
      component.openQuickCounterpartyModal();
      component.newCounterparty = {
        name: 'فروشگاه لاستیک بارز',
        counterparty_type: 'repair_shop',
        phone: '09123333333',
        national_id: '1234567890',
        is_active: true
      };

      component.saveQuickCounterparty();

      expect(mockPersonnelApi.createCounterparty).toHaveBeenCalledWith(expect.objectContaining({
        name: 'فروشگاه لاستیک بارز',
        counterparty_type: 'repair_shop'
      }));
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('با موفقیت افزوده شد'));
      expect(component.isQuickCounterpartyModalOpen).toBe(false);
      // انتساب خودکار به طرف‌حساب فاکتور
      expect(component.newInvoice.counterparty).toBe(103);
    });

    it('اعتبارسنجی شماره شبا باید نام بانک را تشخیص دهد', () => {
      component.newCounterparty.sheba_number = 'IR120120000000000000000001';
      component.onShebaInput();
      expect(component.shebaValidationResult).not.toBeNull();
    });
  });

  describe('۶. عملیات روی فاکتورها (ارسال به سرپرست، حذف، پیش‌نمایش، اکسل)', () => {
    beforeEach(() => {
      component.ngOnInit();
      (component as any).confirmDialog = { open: vi.fn().mockResolvedValue(true) };
    });

    it('ارسال به سرپرست فقط روی فاکتورهای پیش‌نویس مجاز باشد و وضعیت را به pending_supervisor تغییر دهد', async () => {
      const draftInv = sampleInvoices[0];
      await component.sendToSupervisor(draftInv);

      expect(mockPersonnelApi.updateExpenseInvoice).toHaveBeenCalledWith(draftInv.id, { status: 'pending_supervisor' });
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('کارتابل سرپرست'));
    });

    it('ارسال به سرپرست برای فاکتورهای غیر پیش‌نویس باید رد شود', () => {
      const paidInv = sampleInvoices[2];
      component.sendToSupervisor(paidInv);

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط فاکتورهای پیش‌نویس'));
      expect(mockPersonnelApi.updateExpenseInvoice).not.toHaveBeenCalled();
    });

    it('حذف فاکتور پیش‌نویس با تایید کاربر باید اجرا شود', async () => {
      const draftInv = sampleInvoices[0];
      await component.deleteDraftInvoice(draftInv);

      expect(mockPersonnelApi.deleteExpenseInvoice).toHaveBeenCalledWith(draftInv.id);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('حذف شد'));
    });

    it('حذف فاکتور غیر پیش‌نویس باید مسدود شود', () => {
      const paidInv = sampleInvoices[2];
      component.deleteDraftInvoice(paidInv);

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط فاکتورهای در وضعیت پیش‌نویس'));
      expect(mockPersonnelApi.deleteExpenseInvoice).not.toHaveBeenCalled();
    });

    it('پیش‌نمایش تصویر فاکتور باید مودال پیش‌نمایش را باز کند', () => {
      const invWithAttachment = sampleInvoices[0];
      component.openAttachmentPreview(invWithAttachment);

      expect(component.isAttachmentPreviewModalOpen).toBe(true);
      expect(component.previewAttachmentUrl).toBe(invWithAttachment.attachment);

      component.closeAttachmentPreview();
      expect(component.isAttachmentPreviewModalOpen).toBe(false);
      expect(component.previewAttachmentUrl).toBeNull();
    });

    it('خروجی اکسل استاندارد فاکتورها باید متد exportExpenseInvoicesExcel را فراخوانی کند', () => {
      // Mock URL.createObjectURL and revokeObjectURL
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-url');
      window.URL.revokeObjectURL = vi.fn();

      component.exportExcel();

      expect(mockPersonnelApi.exportExpenseInvoicesExcel).toHaveBeenCalledWith({
        section_id: 10,
        status: undefined
      });
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('دانلود'));
    });
  });

  describe('۷. هلپرهای فرمت‌دهی و نمایش وضعیت', () => {
    it('باید کلاس رنگی و برچسب وضعیت فاکتورها را به درستی برگرداند', () => {
      expect(component.getStatusBadgeClass('draft')).toContain('bg-slate-100');
      expect(component.getStatusBadgeClass('pending_supervisor')).toContain('bg-amber-50');
      expect(component.getStatusBadgeClass('ready_to_pay')).toContain('bg-indigo-50');
      expect(component.getStatusBadgeClass('paid')).toContain('bg-emerald-50');
      expect(component.getStatusBadgeClass('rejected')).toContain('bg-rose-50');

      expect(component.getStatusLabel('draft')).toBe('پیش‌نویس کارمند');
      expect(component.getStatusLabel('pending_supervisor')).toBe('در انتظار تایید سرپرست');
      expect(component.getStatusLabel('ready_to_pay')).toBe('تایید مدیر / آماده پرداخت');
      expect(component.getStatusLabel('paid')).toBe('تسویه و پرداخت‌شده');
      expect(component.getStatusLabel('rejected')).toBe('رد شده');
    });

    it('باید فرمت‌بندی اعداد به فارسی را به درستی انجام دهد', () => {
      expect(component.formatNumber(1000)).toContain('۱');
      expect(component.formatNumber(null)).toBe('۰');
    });
  });

  describe('۸. جزئیات فاکتور و لغو گردش کار (Workflow History & Cancel)', () => {
    let mockTreasuryApi: any;
    let mockConfirm: any;

    beforeEach(() => {
      mockTreasuryApi = {
        getExpenseInvoice: vi.fn().mockReturnValue(of(sampleInvoices[0])),
        cancelExpenseInvoice: vi.fn().mockReturnValue(of({ ...sampleInvoices[0], status: 'draft' }))
      };
      mockConfirm = {
        open: vi.fn().mockResolvedValue(true)
      };
    });

    it('خواندن پارامتر invoice از queryParams باید پنل جزئیات را باز کرده و فاکتور را لود کند', () => {
      const routeWithInvoice = {
        queryParams: of({ section_id: '10', invoice: '1' })
      };
      const comp = new EmployeeInvoicesHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        routeWithInvoice as any,
        mockRouter,
        undefined,
        mockTreasuryApi,
        mockConfirm
      );

      comp.ngOnInit();

      expect(comp.isDetailPanelOpen).toBe(true);
      expect(mockTreasuryApi.getExpenseInvoice).toHaveBeenCalledWith(1);
      expect(comp.selectedInvoiceDetail).toEqual(sampleInvoices[0]);
    });

    it('جریان لغو فاکتور باید پس از تایید دیالوگ خطر، cancelExpenseInvoice را فراخوانی کرده و لیست را بروزرسانی کند', async () => {
      const comp = new EmployeeInvoicesHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter,
        undefined,
        mockTreasuryApi,
        mockConfirm
      );
      comp.selectedInvoiceDetail = sampleInvoices[0];

      await comp.onCancelInvoice();

      expect(mockConfirm.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
      expect(mockTreasuryApi.cancelExpenseInvoice).toHaveBeenCalledWith(sampleInvoices[0].id, 'لغو توسط کاربر');
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('لغو شد'));
    });

    it('خطای ۴۰۹ در لغو فاکتور باید پیام اخطار toast نمایش دهد', async () => {
      const { throwError } = await import('rxjs');
      mockTreasuryApi.cancelExpenseInvoice.mockReturnValue(throwError(() => ({
        status: 409,
        error: { detail: 'امکان لغو وجود ندارد چون مرحله بعد اقدام شده است.' }
      })));

      const comp = new EmployeeInvoicesHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter,
        undefined,
        mockTreasuryApi,
        mockConfirm
      );
      comp.selectedInvoiceDetail = sampleInvoices[0];

      await comp.onCancelInvoice();

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('امکان لغو وجود ندارد'));
    });
  });
});

