// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵɵdirectiveInject, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { EmployeeInvoicesHubComponent } from './employee-invoices';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { PrintService } from '../../../../../../core/services/print.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeeInvoicesHubComponent tracking values DOM spec', () => {
  let fixture: ComponentFixture<EmployeeInvoicesHubComponent>;
  let component: EmployeeInvoicesHubComponent;

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
      writable: true,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    const mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_user', is_superuser: false }),
      currentUser: vi.fn().mockReturnValue({ id: 1, username: 'employee_user' }),
      userPermissions: vi.fn().mockReturnValue([]),
    };

    const mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش ابنیه', is_active: true }])),
      getProjectSections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش ابنیه', is_active: true }])),
      getExpenseInvoices: vi.fn().mockReturnValue(of([
        {
          id: 101,
          invoice_number: 'INV-101',
          number: 'DOC-101',
          invoice_date_shamsi: '1405/08/10',
          amount: 5000000,
          status: 'pending_supervisor',
          created_by_name: 'کارمند نمونه',
          created_at: '2026-11-01T10:00:00Z',
          updated_by_name: 'سرپرست نمونه',
          updated_at: '2026-11-02T12:00:00Z',
        },
      ])),
      getExpenseHeads: vi.fn().mockReturnValue(of([])),
      getCounterparties: vi.fn().mockReturnValue(of([])),
    };

    const mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    const mockRoute = { queryParams: of({ section_id: '10' }) };
    const mockRouter = { navigate: vi.fn() };
    const mockActiveCompany = { activeCompanyId: 1, activeCompany$: of({ id: 1, name: 'شرکت اصلی' }) };
    const mockTreasuryOrgApi = {
      getExpenseInvoicesPage: vi.fn().mockReturnValue(of({ count: 1, results: [] })),
      getExpenseInvoiceDuplicates: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
    };

    TestBed.configureTestingModule({
      imports: [EmployeeInvoicesHubComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
        { provide: TreasuryOrgApiService, useValue: mockTreasuryOrgApi },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
        { provide: WebSocketService, useValue: { documentChanges$: vi.fn().mockReturnValue(of()) } },
        { provide: PrintService, useValue: { downloadPdf: vi.fn(), isOnline: vi.fn().mockReturnValue(true) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('row shows last modifier name', () => {
    component.invoices = [
      {
        id: 101,
        invoice_number: 'INV-101',
        amount: 5000000,
        status: 'pending_supervisor',
        created_by_name: 'کارمند نمونه',
        created_at: '2026-11-01T10:00:00Z',
        updated_by_name: 'علی کارشناس',
        updated_at: '2026-11-02T12:00:00Z',
      } as any,
    ];
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('table tbody tr');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('علی کارشناس');
    expect(row.textContent).toContain('آخرین تغییردهنده:');
  });
});
