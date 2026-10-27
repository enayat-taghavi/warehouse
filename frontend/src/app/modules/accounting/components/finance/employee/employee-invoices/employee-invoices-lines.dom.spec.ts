// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

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

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeeInvoicesHubComponent — Lines Form and Duplicate Dialog DOM Specs (Task B)', () => {
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
  let promptSpy: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true }
  ];

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

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

  afterEach(() => {
    expect(promptSpy).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    promptSpy = vi.spyOn(window, 'prompt');

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_user', is_superuser: false }),
      currentUser: vi.fn().mockReturnValue({ id: 1, username: 'employee_user' }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getExpenseInvoices: vi.fn().mockReturnValue(of([])),
      getExpenseHeads: vi.fn().mockReturnValue(of([
        { id: 1, company: 1, parent: null, code: '10', title: 'عمومی', is_active: true },
        { id: 11, company: 1, parent: 1, code: '1001', title: 'لوازم یدکی', is_active: true }
      ])),
      getCounterparties: vi.fn().mockReturnValue(of([{ id: 101, name: 'فروشگاه البرز', is_active: true }])),
      createExpenseInvoice: vi.fn().mockReturnValue(of({ id: 99 })),
      updateExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
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
      getExpenseInvoicesPage: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      getExpenseInvoiceDuplicates: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      submitExpenseInvoice: vi.fn().mockReturnValue(of({ id: 10, status: 'pending_supervisor' }))
    };

    mockConfirm = {
      confirm: vi.fn().mockReturnValue(of(true)),
      open: vi.fn().mockResolvedValue(true)
    };

    mockPrintService = {
      downloadPdf: vi.fn().mockResolvedValue(undefined)
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, EmployeeInvoicesHubComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: { user: { id: 1 } } },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
        { provide: TreasuryOrgApiService, useValue: mockTreasuryOrgApi },
        { provide: ConfirmDialogService, useValue: mockConfirm },
        { provide: PrintService, useValue: mockPrintService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.selectedSectionId = 10;
    component.selectedSection = sampleSections[0];
  });

  it('a) the lines table renders one row; clicking the add-line button renders two rows; the remove button of row 2 removes it', () => {
    component.openNewInvoiceModal();
    fixture.detectChanges();

    const initialLineRows = fixture.nativeElement.querySelectorAll('div.space-y-2 > div');
    expect(initialLineRows.length).toBe(1);

    const addBtn = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('افزودن ردیف'));
    expect(addBtn).toBeTruthy();

    addBtn!.click();
    fixture.detectChanges();

    const lineRowsAfterAdd = fixture.nativeElement.querySelectorAll('div.space-y-2 > div');
    expect(lineRowsAfterAdd.length).toBe(2);

    const removeBtns = fixture.nativeElement.querySelectorAll('button[aria-label="حذف این ردیف"]') as NodeListOf<HTMLButtonElement>;
    expect(removeBtns.length).toBe(2);

    removeBtns[1].click();
    fixture.detectChanges();

    const lineRowsAfterRemove = fixture.nativeElement.querySelectorAll('div.space-y-2 > div');
    expect(lineRowsAfterRemove.length).toBe(1);
  });

  it('b) setting two lines (quantity × unit price) updates the displayed subtotal and payable total text (Persian digits: compare with component.formatNumber(value))', () => {
    component.openNewInvoiceModal();
    fixture.detectChanges();

    const addBtn = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('افزودن ردیف'));
    expect(addBtn).toBeTruthy();
    addBtn!.click();
    fixture.detectChanges();

    const lineRows = fixture.nativeElement.querySelectorAll('div.space-y-2 > div');
    expect(lineRows.length).toBe(2);

    const qty0 = lineRows[0].querySelector('input[type="number"]') as HTMLInputElement;
    const price0 = lineRows[0].querySelector('app-amount-input input') as HTMLInputElement;
    const qty1 = lineRows[1].querySelector('input[type="number"]') as HTMLInputElement;
    const price1 = lineRows[1].querySelector('app-amount-input input') as HTMLInputElement;

    expect(qty0).toBeTruthy();
    expect(price0).toBeTruthy();
    expect(qty1).toBeTruthy();
    expect(price1).toBeTruthy();

    qty0.value = '2';
    qty0.dispatchEvent(new Event('input'));

    price0.value = '150000';
    price0.dispatchEvent(new Event('input'));

    qty1.value = '3';
    qty1.dispatchEvent(new Event('input'));

    price1.value = '200000';
    price1.dispatchEvent(new Event('input'));

    fixture.detectChanges();

    const expectedSubtotal = 2 * 150000 + 3 * 200000; // 900,000
    const expectedPayable = expectedSubtotal;

    const dl = fixture.nativeElement.querySelector('dl');
    expect(dl).toBeTruthy();

    const dds = dl.querySelectorAll('dd');
    expect(dds[0].textContent?.trim()).toBe(component.formatNumber(expectedSubtotal));
    expect(dds[3].textContent?.trim()).toBe(component.formatNumber(expectedPayable));
  });

  it('c) turning the VAT checkbox on shows the VAT amount input; turning it off hides it', () => {
    component.openNewInvoiceModal();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#invoice_vat')).toBeNull();

    const vatCheckbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(vatCheckbox).toBeTruthy();

    vatCheckbox.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#invoice_vat')).not.toBeNull();

    vatCheckbox.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#invoice_vat')).toBeNull();
  });

  it('d) when getExpenseInvoiceDuplicates returns { count: 1, results: [...] } after onDuplicateKeyChange() and vi.advanceTimersByTime(500) (fake timers), the duplicate warning block is rendered', () => {
    vi.useFakeTimers();
    try {
      component.openNewInvoiceModal();
      component.newInvoice.counterparty = 101;
      component.newInvoice.invoice_number = 'INV-555';
      fixture.detectChanges();

      const dupResult = {
        count: 1,
        matches: [{
          id: 77,
          number: 'INV-555',
          invoice_number: 'INV-555',
          invoice_date_shamsi: '1405/03/10',
          amount: 450000,
          status: 'pending_supervisor',
          status_display: 'در انتظار تایید سرپرست'
        }],
        hidden_count: 0
      };
      mockTreasuryOrgApi.getExpenseInvoiceDuplicates.mockReturnValue(of(dupResult));

      component.onDuplicateKeyChange();
      vi.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(mockTreasuryOrgApi.getExpenseInvoiceDuplicates).toHaveBeenCalled();
      expect(component.duplicateInfo).toEqual(dupResult);

      const dupBlock = fixture.nativeElement.querySelector('div[role="alert"].border-amber-300');
      expect(dupBlock).toBeTruthy();
      expect(dupBlock.textContent).toContain('این شماره فاکتور برای این طرف حساب قبلاً ثبت شده است');
    } finally {
      vi.useRealTimers();
    }
  });

  it('e) submitExpenseInvoice returning 400 { code: \'duplicate_reason_required\' } opens app-workflow-reason-dialog (open true); confirming calls submitExpenseInvoice(id, reason)', async () => {
    const sampleInvoice: ExpenseInvoice = {
      id: 88,
      invoice_number: 'INV-88',
      amount: 600000,
      status: 'draft',
      section: 10
    } as any;

    mockTreasuryOrgApi.submitExpenseInvoice.mockReturnValue(throwError(() => ({
      status: 400,
      error: { code: 'duplicate_reason_required' }
    })));

    await component.sendToSupervisor(sampleInvoice);
    fixture.detectChanges();

    expect(component.isDuplicateReasonOpen).toBe(true);
    const reasonDialogEl = fixture.nativeElement.querySelector('app-workflow-reason-dialog');
    expect(reasonDialogEl).toBeTruthy();

    mockTreasuryOrgApi.submitExpenseInvoice.mockReturnValue(of({ id: 88, status: 'pending_supervisor' }));
    component.onDuplicateReasonConfirmed('فاکتور تکراری نیست، خرید مجدد است');

    expect(mockTreasuryOrgApi.submitExpenseInvoice).toHaveBeenCalledWith(88, 'فاکتور تکراری نیست، خرید مجدد است');
  });

  it('f) window.prompt is never called (spy in beforeEach)', () => {
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
