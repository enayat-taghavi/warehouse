// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError, BehaviorSubject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { ManagerReportsComponent } from './manager-reports';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { ExpenseReport } from '../../../../models/accounting-reports.model';

const saveBlob = vi.fn().mockResolvedValue(undefined);

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ManagerReportsComponent (Release v1 step 4.7-c)', () => {
  let fixture: ComponentFixture<ManagerReportsComponent>;
  let component: ManagerReportsComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockCompanyApi: any;
  let mockNetwork: any;
  let mockToast: any;
  let networkSubject: BehaviorSubject<string>;

  beforeEach(async () => {
    vi.clearAllMocks();
    networkSubject = new BehaviorSubject<string>('online');
    mockNetwork = {
      isOnline: true,
      state$: networkSubject.asObservable(),
    };
    mockAuth = {
      hasPermission: vi.fn().mockReturnValue(false),
    };
    mockPersonnelApi = {
      getFinancialProjects: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getAccountingReport: vi.fn().mockReturnValue(of({
        report: 'expense',
        date_from: '1405/08/01',
        date_to: '1405/08/30',
        filters: { company_id: null, section_id: null, project_id: null },
        group_by: 'head',
        rows: [],
        totals: { invoice_amount: 0, petty_amount: 0, total: 0, vat_amount: 0, invoice_count: 0 },
      })),
      exportAccountingReport: vi.fn().mockReturnValue(of(new Blob(['excel-content']))),
    };
    mockCompanyApi = {
      getUserAvailable: vi.fn().mockReturnValue(of({ companies: [] })),
    };
    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    if (typeof URL.createObjectURL === 'function') {
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: any) => {
        saveBlob(blob);
        return 'blob:mock-url';
      });
    } else {
      (URL as any).createObjectURL = vi.fn().mockImplementation((blob: any) => {
        saveBlob(blob);
        return 'blob:mock-url';
      });
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      (URL as any).revokeObjectURL = vi.fn();
    }
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      imports: [ManagerReportsComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: NetworkStatusService, useValue: mockNetwork },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagerReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('a) tabs by permission: with hasPermission returning false for everything, component.tabs ids are exactly expense, unpaid-invoices, petty-cash, bank-payments; with view_sys_payroll and view_sys_fleet_settlement true (new fixture), the ids also contain labor-cost and fleet-cost', () => {
    expect(component.tabs.map(t => t.id)).toEqual(['expense', 'unpaid-invoices', 'petty-cash', 'bank-payments']);

    mockAuth.hasPermission.mockImplementation((perm: string) => perm === 'view_sys_payroll' || perm === 'view_sys_fleet_settlement');
    const fixture2 = TestBed.createComponent(ManagerReportsComponent);
    fixture2.detectChanges();
    const ids = fixture2.componentInstance.tabs.map(t => t.id);
    expect(ids).toContain('labor-cost');
    expect(ids).toContain('fleet-cost');
    fixture2.destroy();
  });

  it('b) filters to API params: set component.companyId = 5, component.sectionId = 7, component.groupBy = "section", date controls 1405/08/01 and 1405/08/30, call component.load() -> getAccountingReport last called with key expense and params containing company_id: 5, section_id: 7, group_by: "section", date_from: "1405/08/01", date_to: "1405/08/30"', () => {
    component.companyId = 5;
    component.sectionId = 7;
    component.groupBy = 'section';
    component.dateFromCtrl.setValue('1405/08/01');
    component.dateToCtrl.setValue('1405/08/30');

    component.load();

    expect(mockPersonnelApi.getAccountingReport).toHaveBeenLastCalledWith(
      'expense',
      expect.objectContaining({
        company_id: 5,
        section_id: 7,
        group_by: 'section',
        date_from: '1405/08/01',
        date_to: '1405/08/30',
      })
    );
  });

  it('c) unpaid-invoices: onTabChange("unpaid-invoices") -> params have page: 1 and page_size and no date_from/date_to', () => {
    component.onTabChange('unpaid-invoices');

    expect(mockPersonnelApi.getAccountingReport).toHaveBeenLastCalledWith(
      'unpaid-invoices',
      expect.objectContaining({
        page: 1,
        page_size: component.pageSize,
      })
    );
    const lastCallParams = mockPersonnelApi.getAccountingReport.mock.calls.at(-1)[1];
    expect(lastCallParams.date_from).toBeUndefined();
    expect(lastCallParams.date_to).toBeUndefined();
  });

  it('d) offline: with the network offline before detectChanges, the rendered text contains component.offlineMessage, the Excel button (button[aria-label] whose aria-label contains the word for Excel used in the template - read it from the html) is disabled, and getAccountingReport was not called', () => {
    mockNetwork.isOnline = false;
    networkSubject.next('offline');
    mockPersonnelApi.getAccountingReport.mockClear();

    const offFixture = TestBed.createComponent(ManagerReportsComponent);
    const offComp = offFixture.componentInstance;
    offFixture.detectChanges();

    expect(offFixture.nativeElement.textContent).toContain(offComp.offlineMessage);
    const excelBtn = offFixture.nativeElement.querySelector('button[aria-label*="اکسل"]') as HTMLButtonElement;
    expect(excelBtn).toBeTruthy();
    expect(excelBtn.disabled).toBe(true);
    expect(mockPersonnelApi.getAccountingReport).not.toHaveBeenCalled();

    offFixture.destroy();
  });

  it('e) Excel: online with a loaded expense result, calling component.exportExcel() calls exportAccountingReport with key expense and params without page, then the mocked saveBlob is called once', () => {
    const expenseData: ExpenseReport = {
      report: 'expense',
      date_from: '1405/08/01',
      date_to: '1405/08/30',
      filters: { company_id: null, section_id: null, project_id: null },
      group_by: 'head',
      rows: [
        {
          key: 1,
          label: 'هزینه ۱',
          group_key: 10,
          group_label: 'سرفصل ۱',
          invoice_amount: 1000,
          petty_amount: 200,
          total: 1200,
          vat_amount: 120,
          invoice_count: 3,
        },
      ],
      totals: { invoice_amount: 1000, petty_amount: 200, total: 1200, vat_amount: 120, invoice_count: 3 },
    };
    mockPersonnelApi.getAccountingReport.mockReturnValue(of(expenseData));
    component.load();
    fixture.detectChanges();

    mockPersonnelApi.exportAccountingReport.mockClear();
    saveBlob.mockClear();

    component.exportExcel();

    expect(mockPersonnelApi.exportAccountingReport).toHaveBeenCalledTimes(1);
    const lastExportCall = mockPersonnelApi.exportAccountingReport.mock.calls.at(-1);
    expect(lastExportCall[0]).toBe('expense');
    expect(lastExportCall[1].page).toBeUndefined();
    expect(lastExportCall[1].page_size).toBeUndefined();
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it('f) 400: getAccountingReport returns throwError(() => new HttpErrorResponse({status: 400, error: {error: "X400"}})) -> after load() and detectChanges, the page text contains X400', () => {
    mockPersonnelApi.getAccountingReport.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'X400' } }))
    );

    component.load();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('X400');
  });
});
