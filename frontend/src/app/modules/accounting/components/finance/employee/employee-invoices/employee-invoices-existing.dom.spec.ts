// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

import { EmployeeInvoicesHubComponent } from './employee-invoices';
import { Counterparty, ProjectSection } from '../../../../models/personnel.model';

describe('EmployeeInvoicesHubComponent - Quick Counterparty Modal existing Spec (Release v1 step 3.1-c)', () => {
  let component: EmployeeInvoicesHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

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

    component = new EmployeeInvoicesHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );

    component.ngOnInit();
  });

  it('پاسخ ثبت طرف‌حساب با پرچم موجود (existing: true) باید پیام info با عبارت تکراری نمایش دهد و در صورت باز بودن مودال فاکتور، شناسه را در newInvoice.counterparty انتساب دهد', () => {
    component.openNewInvoiceModal();
    expect(component.isNewInvoiceModalOpen).toBe(true);
    expect(component.newInvoice.counterparty).toBeUndefined();

    component.openQuickCounterpartyModal();
    expect(component.isQuickCounterpartyModalOpen).toBe(true);

    component.newCounterparty = {
      name: 'فروشگاه لوازم یدکی البرز',
      counterparty_type: 'repair_shop',
      phone: '09121112233',
      is_active: true
    };

    const existingCounterpartyResponse: Counterparty = {
      id: 205,
      name: 'فروشگاه لوازم یدکی البرز',
      counterparty_type: 'repair_shop',
      is_active: true,
      existing: true
    };
    mockPersonnelApi.createCounterparty.mockReturnValue(of(existingCounterpartyResponse));

    component.saveQuickCounterparty();

    expect(mockPersonnelApi.createCounterparty).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'فروشگاه لوازم یدکی البرز',
        counterparty_type: 'repair_shop'
      })
    );
    expect(mockToast.show).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('تکراری')
    );
    expect(component.isQuickCounterpartyModalOpen).toBe(false);
    expect(component.newInvoice.counterparty).toBe(205);
  });

  it('پاسخ ثبت طرف‌حساب جدید بدون ویژگی existing باید پیام موفقیت success نمایش دهد و شناسه را در newInvoice.counterparty تنظیم کند', () => {
    component.openNewInvoiceModal();
    expect(component.isNewInvoiceModalOpen).toBe(true);

    component.openQuickCounterpartyModal();
    expect(component.isQuickCounterpartyModalOpen).toBe(true);

    component.newCounterparty = {
      name: 'تعمیرگاه نوین صنعت',
      counterparty_type: 'repair_shop',
      phone: '09123334455',
      is_active: true
    };

    const newCounterpartyResponse: Counterparty = {
      id: 206,
      name: 'تعمیرگاه نوین صنعت',
      counterparty_type: 'repair_shop',
      is_active: true
    };
    mockPersonnelApi.createCounterparty.mockReturnValue(of(newCounterpartyResponse));

    component.saveQuickCounterparty();

    expect(mockPersonnelApi.createCounterparty).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'تعمیرگاه نوین صنعت',
        counterparty_type: 'repair_shop'
      })
    );
    expect(mockToast.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('با موفقیت')
    );
    expect(component.isQuickCounterpartyModalOpen).toBe(false);
    expect(component.newInvoice.counterparty).toBe(206);
  });

  it('هنگامی که مودال فاکتور باز نباشد (isNewInvoiceModalOpen: false)، پاسخ با existing: true همچنان پیام info تکراری می‌دهد ولی newInvoice.counterparty مقداردهی نمی‌شود', () => {
    component.isNewInvoiceModalOpen = false;

    component.openQuickCounterpartyModal();
    expect(component.isQuickCounterpartyModalOpen).toBe(true);

    component.newCounterparty = {
      name: 'فروشگاه لاستیک بارز',
      counterparty_type: 'repair_shop',
      is_active: true
    };

    const existingResponse: Counterparty = {
      id: 207,
      name: 'فروشگاه لاستیک بارز',
      counterparty_type: 'repair_shop',
      is_active: true,
      existing: true
    };
    mockPersonnelApi.createCounterparty.mockReturnValue(of(existingResponse));

    component.saveQuickCounterparty();

    expect(mockToast.show).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('تکراری')
    );
    expect(component.isQuickCounterpartyModalOpen).toBe(false);
    expect(component.newInvoice.counterparty).toBeUndefined();
  });
});
