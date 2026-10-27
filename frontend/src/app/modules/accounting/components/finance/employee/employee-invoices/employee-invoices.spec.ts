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
  let mockTreasuryOrgApi: any;

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

    mockTreasuryOrgApi = {
      getExpenseInvoicesPage: vi.fn().mockImplementation(() => of({ count: sampleInvoices.length, next: null, previous: null, results: sampleInvoices })),
      getExpenseInvoiceDuplicates: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      submitExpenseInvoice: vi.fn().mockReturnValue(of({ ...sampleInvoices[0], status: 'pending_supervisor' }))
    };

    component = new EmployeeInvoicesHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter,
      undefined,
      mockTreasuryOrgApi
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

    it('باید صفحهٔ اول فاکتورها را اجباراً با پارامتر section_id از سرور بگیرد (تضمین نگهبان G1)', () => {
      component.ngOnInit();
      expect(mockTreasuryOrgApi.getExpenseInvoicesPage).toHaveBeenCalledWith({ page: 1, page_size: 25, section_id: 10 });
      expect(component.invoices.length).toBe(3);
      expect(component.totalCount).toBe(3);
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
      expect(mockTreasuryOrgApi.getExpenseInvoicesPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, section_id: 20 }));
    });
  });

  describe('۲. صفحه‌بندی سمت سرور و حالت خطا', () => {
    it('رفتن به صفحهٔ بعد باید شمارهٔ صفحه را به سرور بفرستد و از آخرین صفحه جلوتر نرود', () => {
      mockTreasuryOrgApi.getExpenseInvoicesPage.mockImplementation(() => of({ count: 60, next: null, previous: null, results: sampleInvoices }));
      component.ngOnInit();
      expect(component.totalPages).toBe(3);

      component.goToPage(2);
      expect(component.page).toBe(2);
      expect(mockTreasuryOrgApi.getExpenseInvoicesPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, section_id: 10 }));

      component.goToPage(9);
      expect(component.page).toBe(3);
    });

    it('خطای سرور باید پیام خطا را نشان دهد و فهرست را خالی نکند', async () => {
      const { throwError } = await import('rxjs');
      component.ngOnInit();
      mockTreasuryOrgApi.getExpenseInvoicesPage.mockReturnValue(throwError(() => ({ status: 500, error: { error: 'خطای داخلی' } })));
      component.loadInvoices();
      expect(component.isLoading).toBe(false);
      expect(component.loadError).toContain('خطای داخلی');
      expect(component.invoices.length).toBe(3);
    });
  });

  describe('۳. فیلتر وضعیت و جستجوی سمت سرور', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('تغییر تب وضعیت باید وضعیت را به سرور بفرستد و به صفحهٔ اول برگردد', () => {
      component.page = 2;
      component.setStatusFilter('draft');
      expect(component.page).toBe(1);
      expect(mockTreasuryOrgApi.getExpenseInvoicesPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'draft' }));

      component.setStatusFilter('all');
      expect(mockTreasuryOrgApi.getExpenseInvoicesPage.mock.lastCall[0]).not.toHaveProperty('status');
    });

    it('جستجو باید با تأخیر کوتاه به سرور فرستاده شود', () => {
      vi.useFakeTimers();
      try {
        component.invoiceSearch = ' 1002 ';
        component.onSearchChange();
        const callsBefore = mockTreasuryOrgApi.getExpenseInvoicesPage.mock.calls.length;
        vi.advanceTimersByTime(400);
        expect(mockTreasuryOrgApi.getExpenseInvoicesPage.mock.calls.length).toBe(callsBefore + 1);
        expect(mockTreasuryOrgApi.getExpenseInvoicesPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: '1002' }));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('۴. فرم ردیفی، تخفیف، مالیات و وضعیت پیش‌نویس (Guardian G2: Draft Invariant)', () => {
    const fillHeader = () => {
      component.newInvoice.counterparty = 101;
      component.newInvoice.invoice_number = 'INV-NEW-99';
      component.newInvoice.invoice_date_shamsi = '1405/04/10';
      component.newInvoice.description = 'سرویس دوره‌ای بیل مکانیکی';
    };

    beforeEach(() => {
      component.ngOnInit();
    });

    it('باز کردن مودال فاکتور جدید باید وضعیت را draft و یک ردیف خالی بسازد', () => {
      component.openNewInvoiceModal();
      expect(component.isNewInvoiceModalOpen).toBe(true);
      expect(component.newInvoice.status).toBe('draft');
      expect(component.newInvoice.section).toBe(10);
      expect(component.newInvoice.invoice_date_shamsi).toBe(component.todayShamsi);
      expect(component.formLines.length).toBe(1);
      expect(component.vatApplicable).toBe(false);
    });

    it('افزودن و حذف ردیف؛ ردیف تازه سرفصل ردیف قبلی را می‌گیرد و آخرین ردیف حذف نمی‌شود', () => {
      component.openNewInvoiceModal();
      component.formLines[0].expense_head = 11;
      component.addLine();
      expect(component.formLines.length).toBe(2);
      expect(component.formLines[1].expense_head).toBe(11);
      component.removeLine(1);
      component.removeLine(0);
      expect(component.formLines.length).toBe(1);
    });

    it('جمع‌های زنده: جمع ردیف‌ها، تخفیف، مالیات پیشنهادی و مالیات دستی', () => {
      component.openNewInvoiceModal();
      component.formLines = [
        { description: 'الف', quantity: 2, unit: 'عدد', unit_price: 1000000, expense_head: 11 },
        { description: 'ب', quantity: 1, unit: '', unit_price: 500000, expense_head: 11 }
      ];
      expect(component.subtotal).toBe(2500000);
      component.discountInput = '500000';
      expect(component.vatBase).toBe(2000000);
      component.vatApplicable = true;
      expect(component.suggestedVat).toBe(200000);
      expect(component.payableAmount).toBe(2200000);
      component.onVatInput('150000');
      expect(component.vatAmount).toBe(150000);
      expect(component.isVatManual).toBe(true);
      component.resetVatToSuggested();
      expect(component.isVatManual).toBe(false);
    });

    it('در صورت ناقص بودن فیلدها یا ردیف‌ها، پیام هشدار نمایش داده شده و درخواستی ارسال نشود', () => {
      component.openNewInvoiceModal();
      component.saveInvoice();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('طرف‌حساب'));

      fillHeader();
      component.newInvoice.invoice_number = '';
      component.saveInvoice();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('شماره فاکتور'));

      fillHeader();
      component.saveInvoice();
      expect(component.lineErrors[0]).toBeTruthy();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('ردیف'));

      component.formLines = [{ description: 'الف', quantity: 1, unit: '', unit_price: 1000, expense_head: 11 }];
      component.discountInput = '5000';
      component.saveInvoice();
      expect(component.discountError).toBeTruthy();
      expect(mockPersonnelApi.createExpenseInvoice).not.toHaveBeenCalled();
    });

    it('ذخیرهٔ موفق باید ردیف‌ها و status="draft" را بفرستد و مالیات پیشنهادی را نفرستد', () => {
      component.openNewInvoiceModal();
      fillHeader();
      component.formLines = [{ description: 'سرویس', quantity: 3, unit: 'بار', unit_price: 4000000, expense_head: 11 }];
      component.vatApplicable = true;

      component.saveInvoice();

      const body = mockPersonnelApi.createExpenseInvoice.mock.calls[0][0];
      expect(body).toEqual(expect.objectContaining({
        section: 10,
        counterparty: 101,
        invoice_number: 'INV-NEW-99',
        status: 'draft', // Guardian G2
        discount_amount: 0,
        vat_applicable: true,
        lines: [{ description: 'سرویس', quantity: 3, unit: 'بار', unit_price: 4000000, expense_head: 11 }]
      }));
      expect(body).not.toHaveProperty('vat_amount');
      expect(body).not.toHaveProperty('category');
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس'));
      expect(component.isNewInvoiceModalOpen).toBe(false);
    });

    it('مالیات دستی باید همراه vat_amount فرستاده شود', () => {
      component.openNewInvoiceModal();
      fillHeader();
      component.formLines = [{ description: 'سرویس', quantity: 1, unit: '', unit_price: 1000000, expense_head: 11 }];
      component.vatApplicable = true;
      component.onVatInput('90000');
      component.saveInvoice();
      expect(mockPersonnelApi.createExpenseInvoice.mock.calls[0][0]).toEqual(expect.objectContaining({ vat_amount: 90000 }));
    });

    it('در صورت پیوست فایل، باید FormData با ردیف‌های JSON و وضعیت draft ارسال شود', () => {
      component.openNewInvoiceModal();
      fillHeader();
      component.newInvoice.invoice_number = 'INV-WITH-FILE';
      component.formLines = [{ description: 'خرید ابزار', quantity: 1, unit: '', unit_price: 5000000, expense_head: 11 }];
      const dummyFile = new File(['image-content'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedInvoiceAttachment = dummyFile;

      component.saveInvoice();

      const callArg = mockPersonnelApi.createExpenseInvoice.mock.calls[0][0] as FormData;
      expect(callArg instanceof FormData).toBe(true);
      expect(callArg.get('status')).toBe('draft');
      expect(callArg.get('invoice_number')).toBe('INV-WITH-FILE');
      expect(JSON.parse(String(callArg.get('lines')))[0]).toEqual(expect.objectContaining({ expense_head: 11, unit_price: 5000000 }));
      expect(callArg.has('category')).toBe(false);
      expect(callArg.get('attachment')).toBe(dummyFile);
    });

    it('خطای سرور روی یک ردیف باید کنار همان ردیف نمایش داده شود', async () => {
      const { throwError } = await import('rxjs');
      mockPersonnelApi.createExpenseInvoice.mockReturnValue(throwError(() => ({ status: 400, error: { lines: { 0: { expense_head: ['سرفصل نامعتبر است.'] } } } })));
      component.openNewInvoiceModal();
      fillHeader();
      component.formLines = [{ description: 'سرویس', quantity: 1, unit: '', unit_price: 1000, expense_head: 99 }];
      component.saveInvoice();
      expect(component.lineErrors[0]).toBe('سرفصل نامعتبر است.');
      expect(component.isNewInvoiceModalOpen).toBe(true);
    });

    it('هشدار تکراری: پاسخ سرور با count>0 هشدار را نشان می‌دهد', () => {
      vi.useFakeTimers();
      try {
        mockTreasuryOrgApi.getExpenseInvoiceDuplicates.mockReturnValue(of({ count: 1, results: [{ id: 3, invoice_number: 'INV-NEW-99' }] }));
        component.openNewInvoiceModal();
        fillHeader();
        component.onDuplicateKeyChange();
        vi.advanceTimersByTime(500);
        expect(mockTreasuryOrgApi.getExpenseInvoiceDuplicates).toHaveBeenCalledWith({ counterparty: 101, invoice_number: 'INV-NEW-99' });
        expect(component.duplicateInfo?.count).toBe(1);
      } finally {
        vi.useRealTimers();
      }
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

    it('ارسال به سرپرست فقط روی فاکتورهای پیش‌نویس مجاز باشد و از مسیر submit برود', async () => {
      const draftInv = sampleInvoices[0];
      await component.sendToSupervisor(draftInv);

      expect(mockTreasuryOrgApi.submitExpenseInvoice).toHaveBeenCalledWith(draftInv.id, undefined);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('کارتابل سرپرست'));
    });

    it('فاکتور تکراری: خطای duplicate_reason_required دیالوگ دلیل را باز می‌کند و دلیل دوباره فرستاده می‌شود', async () => {
      const { throwError } = await import('rxjs');
      const draftInv = sampleInvoices[0];
      mockTreasuryOrgApi.submitExpenseInvoice.mockReturnValueOnce(throwError(() => ({ status: 400, error: { code: 'duplicate_reason_required', error: 'دلیل لازم است' } })));
      await component.sendToSupervisor(draftInv);
      expect(component.isDuplicateReasonOpen).toBe(true);

      component.onDuplicateReasonConfirmed('فاکتور اصلاحی فروشنده');
      expect(mockTreasuryOrgApi.submitExpenseInvoice).toHaveBeenLastCalledWith(draftInv.id, 'فاکتور اصلاحی فروشنده');
      expect(component.isDuplicateReasonOpen).toBe(false);
    });

    it('ارسال به سرپرست برای فاکتورهای غیر پیش‌نویس باید رد شود', () => {
      const paidInv = sampleInvoices[2];
      component.sendToSupervisor(paidInv);

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط فاکتورهای پیش‌نویس'));
      expect(mockTreasuryOrgApi.submitExpenseInvoice).not.toHaveBeenCalled();
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
        getExpenseInvoicesPage: vi.fn().mockReturnValue(of({ count: 0, next: null, previous: null, results: [] })),
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

