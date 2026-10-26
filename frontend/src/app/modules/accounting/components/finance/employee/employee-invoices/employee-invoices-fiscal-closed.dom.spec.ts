// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { EmployeeInvoicesHubComponent } from './employee-invoices';
import { Counterparty, ProjectSection } from '../../../../models/personnel.model';

describe('EmployeeInvoicesHubComponent - Fiscal Period Closed Spec (Release v1 step 3.2-c)', () => {
  let component: EmployeeInvoicesHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;
  let mockConfirm: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_test', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getExpenseInvoices: vi.fn().mockReturnValue(of([])),
      getCounterparties: vi.fn().mockReturnValue(of([])),
      createExpenseInvoice: vi.fn().mockImplementation((data: any) => of({ id: 1, ...data })),
      updateExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
      deleteExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
      createCounterparty: vi.fn().mockImplementation((data: any) => of({ id: 103, ...data })),
      exportExpenseInvoicesExcel: vi.fn().mockReturnValue(of(new Blob(['fake-excel-data'])))
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

    mockConfirm = {
      open: vi.fn().mockResolvedValue(true)
    };

    component = new EmployeeInvoicesHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter,
      undefined,
      undefined,
      mockConfirm
    );

    component.ngOnInit();
  });

  it('خطای ۴۰۰ دورهٔ مالی بسته (fiscal_period_closed) در saveInvoice متن خطا را در invoiceDateError (برای عنصر #invoice_date_error در مودال باز) می‌نشاند و toast.show خطا فراخوانی می‌شود', () => {
    component.openNewInvoiceModal();
    expect(component.isNewInvoiceModalOpen).toBe(true);

    component.selectedSectionId = 10;
    component.selectedSection = sampleSections[0];
    component.newInvoice = {
      section: 10,
      counterparty: 101,
      invoice_number: 'INV-1042',
      invoice_date_shamsi: '1403/08/15',
      amount: 4500000,
      category: 'تعمیرات و نگهداری',
      description: 'تعمیرات دوره بسته',
      status: 'draft'
    };

    const closedError = {
      status: 400,
      error: {
        invoice_date_shamsi: ['دورهٔ مالی این تاریخ بسته است؛ سند با این تاریخ ثبت نمی‌شود.'],
        code: 'fiscal_period_closed'
      }
    };
    mockPersonnelApi.createExpenseInvoice.mockReturnValueOnce(throwError(() => closedError));

    component.saveInvoice();

    expect(component.invoiceDateError).toBe('دورهٔ مالی این تاریخ بسته است؛ سند با این تاریخ ثبت نمی‌شود.');
    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      'دورهٔ مالی این تاریخ بسته است؛ سند با این تاریخ ثبت نمی‌شود.'
    );
    // مودال همچنان باز می‌ماند تا کاربر فیلد تاریخ متناظر با #invoice_date_error را اصلاح کند
    expect(component.isNewInvoiceModalOpen).toBe(true);
  });

  it('خطای ۵۰۰ سرور مقدار invoiceDateError را خالی نگه می‌دارد و توست پیش‌فرض قدیمی خطا در ثبت فاکتور را نمایش می‌دهد', () => {
    component.openNewInvoiceModal();
    expect(component.isNewInvoiceModalOpen).toBe(true);

    component.selectedSectionId = 10;
    component.selectedSection = sampleSections[0];
    component.newInvoice = {
      section: 10,
      counterparty: 101,
      invoice_number: 'INV-1043',
      invoice_date_shamsi: '1404/02/10',
      amount: 2500000,
      category: 'سوخت و روغن',
      description: 'سوخت لودر',
      status: 'draft'
    };

    const server500Error = {
      status: 500,
      error: { error: 'Database connection failed' }
    };
    mockPersonnelApi.createExpenseInvoice.mockReturnValueOnce(throwError(() => server500Error));

    component.saveInvoice();

    expect(component.invoiceDateError).toBe('');
    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('خطا در ثبت فاکتور')
    );
    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Database connection failed')
    );
    // پیام خطای فیلد تاریخ #invoice_date_error خالی می‌ماند
    expect(component.invoiceDateError).toBe('');
  });

  it('فراخوانی openNewInvoiceModal مقدار پیشین invoiceDateError (پیام #invoice_date_error) را پاک می‌کند', () => {
    component.invoiceDateError = 'خطای تاریخ فاکتور در دوره بسته #invoice_date_error';
    expect(component.invoiceDateError).toBeTruthy();

    component.openNewInvoiceModal();

    expect(component.invoiceDateError).toBe('');
    expect(component.isNewInvoiceModalOpen).toBe(true);
  });

  it('ارسال به سرپرست sendToSupervisor و حذف فاکتور پیش‌نویس deleteDraftInvoice در صورت خطای fiscal_period_closed پیام دوره بسته را در توست خطا نشان می‌دهند', async () => {
    const draftInvoice = {
      id: 77,
      status: 'draft',
      invoice_number: 'INV-DRAFT-77',
      invoice_date_shamsi: '1403/04/10'
    } as any;

    const closedError = {
      status: 400,
      error: {
        invoice_date_shamsi: ['دوره مالی بسته است و امکان عملیات وجود ندارد.'],
        code: 'fiscal_period_closed'
      }
    };

    mockPersonnelApi.updateExpenseInvoice.mockReturnValueOnce(throwError(() => closedError));
    await component.sendToSupervisor(draftInvoice);
    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      'دوره مالی بسته است و امکان عملیات وجود ندارد.'
    );

    mockPersonnelApi.deleteExpenseInvoice.mockReturnValueOnce(throwError(() => closedError));
    await component.deleteDraftInvoice(draftInvoice);
    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      'دوره مالی بسته است و امکان عملیات وجود ندارد.'
    );
  });
});
