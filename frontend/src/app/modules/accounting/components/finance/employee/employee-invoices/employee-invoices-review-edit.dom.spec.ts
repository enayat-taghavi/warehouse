// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { EmployeeInvoicesHubComponent } from './employee-invoices';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { PrintService } from '../../../../../../core/services/print.service';
import { ProjectSection, ExpenseInvoice } from '../../../../models/personnel.model';
import { PermissionService } from '../../../../../../core/services/permission.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeeInvoicesHubComponent - Review Accountant Edit DOM Specs', () => {
  let fixture: ComponentFixture<EmployeeInvoicesHubComponent>;
  let component: EmployeeInvoicesHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockToast: any;
  let mockRoute: any;
  let mockRouter: any;
  let mockActiveCompany: any;
  let mockTreasuryOrgApi: any;
  let mockConfirm: any;
  let mockPrintService: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true }
  ];

  const sampleInvoice: ExpenseInvoice = {
    id: 101,
    invoice_number: 'INV-101',
    invoice_date_shamsi: '1405/08/12',
    counterparty: 101,
    counterparty_name: 'فروشگاه البرز',
    section: 10,
    section_name: 'بخش ابنیه',
    description: 'خرید قطعات',
    amount: 1000000,
    status: 'pending_accountant',
    my_step: 'accountant_review',
    paid_amount: '0',
    lines: [
      { id: 1, description: 'لوازم یدکی', quantity: '2', unit: 'عدد', unit_price: '500000', expense_head: 11 }
    ],
    created_by_name: 'کارمند ۱',
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z'
  };

  beforeAll(async () => {
    Object.defineProperty(EmployeeInvoicesHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || EmployeeInvoicesHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActiveCompanyService, 8),
          ɵɵdirectiveInject(TreasuryOrgApiService, 8),
          ɵɵdirectiveInject(ConfirmDialogService, 8),
          ɵɵdirectiveInject(WebSocketService, 8),
          ɵɵdirectiveInject(PrintService, 8)
        );
      },
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'accountant_user', is_superuser: false }),
      currentUser: vi.fn().mockReturnValue({ id: 1, username: 'accountant_user' }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getExpenseInvoices: vi.fn().mockReturnValue(of([sampleInvoice])),
      getExpenseHeads: vi.fn().mockReturnValue(of([
        { id: 1, company: 1, parent: null, code: '10', title: 'عمومی', is_active: true },
        { id: 11, company: 1, parent: 1, code: '1001', title: 'لوازم یدکی', is_active: true }
      ])),
      getCounterparties: vi.fn().mockReturnValue(of([{ id: 101, name: 'فروشگاه البرز', is_active: true }])),
      createExpenseInvoice: vi.fn().mockReturnValue(of({ id: 99 })),
      updateExpenseInvoice: vi.fn().mockReturnValue(of({ ...sampleInvoice })),
      deleteExpenseInvoice: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockRoute = {
      queryParams: of({ section_id: '10' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockActiveCompany = {
      activeCompanyId: 1,
      activeCompany$: of({ id: 1, name: 'شرکت اصلی' })
    };

    mockTreasuryOrgApi = {
      getExpenseInvoicesPage: vi.fn().mockReturnValue(of({ count: 1, results: [sampleInvoice] })),
      getExpenseInvoiceDuplicates: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      submitExpenseInvoice: vi.fn().mockReturnValue(of({ id: 10, status: 'pending_supervisor' }))
    };

    mockConfirm = {
      confirm: vi.fn().mockReturnValue(of(true)),
      open: vi.fn().mockResolvedValue(true)
    };

    mockPrintService = {
      isOnline: vi.fn().mockReturnValue(true),
      downloadPdf: vi.fn().mockResolvedValue(undefined)
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, EmployeeInvoicesHubComponent],
      providers: [ { provide: PermissionService, useValue: { canWriteDocuments: () => true } },
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: { user: { id: 1 } } },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
        { provide: TreasuryOrgApiService, useValue: mockTreasuryOrgApi },
        { provide: ConfirmDialogService, useValue: mockConfirm },
        { provide: WebSocketService, useValue: { connect: vi.fn(), on: vi.fn().mockReturnValue(of()) } },
        { provide: PrintService, useValue: mockPrintService }
      ]
    }).compileComponents();
  });

  it('review accountant row shows edit but not send', async () => {
    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isReviewEditable(sampleInvoice)).toBe(true);
    expect(component.isEditable(sampleInvoice)).toBe(false);
    expect(component.canEditInvoice(sampleInvoice)).toBe(true);

    const el = fixture.nativeElement as HTMLElement;
    // Desktop table row action cell
    const editBtns = el.querySelectorAll('button[appAction="edit"]');
    expect(editBtns.length).toBeGreaterThan(0);

    // Verify hint mentions accountant review
    const reviewEditBtn = Array.from(editBtns).find(b => (b.getAttribute('title') || b.getAttribute('hint') || (b as any).title || '').includes('بررسی حسابدار'));
    expect(reviewEditBtn).toBeDefined();

    // Verify send button is NOT present for this invoice
    const sendBtns = el.querySelectorAll('button[appAction="send"]');
    expect(sendBtns.length).toBe(0);
  });

  it('row with my_step other than accountant_review shows no edit button for pending_accountant', async () => {
    const inv: ExpenseInvoice = {
      ...sampleInvoice,
      my_step: 'supervisor_ok'
    };
    mockTreasuryOrgApi.getExpenseInvoicesPage.mockReturnValue(of({ count: 1, results: [inv] }));
    mockPersonnelApi.getExpenseInvoices.mockReturnValue(of([inv]));

    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isReviewEditable(inv)).toBe(false);
    expect(component.isEditable(inv)).toBe(false);
    expect(component.canEditInvoice(inv)).toBe(false);

    const el = fixture.nativeElement as HTMLElement;
    const editBtns = el.querySelectorAll('button[appAction="edit"]');
    expect(editBtns.length).toBe(0);
  });

  it('no edit button when a payment exists', async () => {
    const inv: ExpenseInvoice = {
      ...sampleInvoice,
      paid_amount: '500000'
    };
    mockTreasuryOrgApi.getExpenseInvoicesPage.mockReturnValue(of({ count: 1, results: [inv] }));
    mockPersonnelApi.getExpenseInvoices.mockReturnValue(of([inv]));

    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isReviewEditable(inv)).toBe(false);
    expect(component.canEditInvoice(inv)).toBe(false);

    const el = fixture.nativeElement as HTMLElement;
    const editBtns = el.querySelectorAll('button[appAction="edit"]');
    expect(editBtns.length).toBe(0);
  });

  it('review edit modal hides send and shows save changes label', async () => {
    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    component.openEditInvoiceModal(sampleInvoice);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isNewInvoiceModalOpen).toBe(true);
    expect(component.editingInFlow).toBe(true);

    const el = fixture.nativeElement as HTMLElement;
    const modalDialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(modalDialog).not.toBeNull();
    expect(modalDialog.getAttribute('aria-label')).toBe('ویرایش رسید پرداخت در مرحلهٔ بررسی');

    const modalTitle = el.querySelector('h3');
    expect(modalTitle?.textContent).toContain('ویرایش رسید پرداخت در مرحلهٔ بررسی');

    // Section and Project select must be disabled
    const projectSelect = el.querySelector('#invoice_project') as HTMLSelectElement;
    const sectionSelect = el.querySelector('#invoice_section') as HTMLSelectElement;
    expect(projectSelect.disabled).toBe(true);
    expect(sectionSelect.disabled).toBe(true);

    // Send button must NOT be present in modal
    const sendBtn = el.querySelector('.p-4.bg-slate-50.border-t button[appAction="send"]');
    expect(sendBtn).toBeNull();

    // Save button must show 'ذخیرهٔ تغییرات'
    const saveBtn = el.querySelector('.p-4.bg-slate-50.border-t button[appAction="save"]') as HTMLElement;
    expect(saveBtn).not.toBeNull();
    expect((saveBtn?.textContent || saveBtn?.getAttribute('aria-label') || '')).toContain('ذخیرهٔ تغییرات');
  });

  it('review edit PATCH payload has no status field', async () => {
    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    component.openEditInvoiceModal(sampleInvoice);
    fixture.detectChanges();
    await fixture.whenStable();

    component.saveInvoice('close');

    expect(mockPersonnelApi.updateExpenseInvoice).toHaveBeenCalledWith(
      101,
      expect.not.objectContaining({ status: expect.anything() })
    );

    const calledPayload = mockPersonnelApi.updateExpenseInvoice.mock.calls[0][1];
    expect(calledPayload.status).toBeUndefined();
    expect(mockToast.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('تغییرات رسید پرداخت')
    );
    expect(mockToast.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('در سابقه ثبت شد')
    );
  });
});
