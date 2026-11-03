// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { TreasurerInvoicesComponent } from './treasurer-invoices';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { PermissionService } from '../../../../../../core/services/permission.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function __inCtx<T>(factory: () => T): T {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: PermissionService, useValue: { canWriteDocuments: () => true } }],
  });
  return TestBed.runInInjectionContext(factory);
}


describe('TreasurerInvoicesComponent — فقط فاکتورهای آماده پرداخت', () => {
  let component: TreasurerInvoicesComponent;
  let mockToast: any;
  let mockPersonnelApi: any;

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getTreasuryCartable: vi.fn().mockReturnValue(of({ invoices: [] })),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
      payExpenseInvoice: vi.fn().mockReturnValue(of({ message: 'ok' })),
      approvePettyCashTransaction: vi.fn().mockReturnValue(of({ message: 'ok' }))
    };

    component = __inCtx(() => new TreasurerInvoicesComponent(
      {} as any, {} as any, mockToast, mockPersonnelApi,
      {} as any,
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any
    ));
  });

  it('1. loads only payable invoices; petty cash refills moved to their own treasurer page', () => {
    component.loadTreasuryData();
    expect(mockPersonnelApi.getTreasuryCartable).toHaveBeenCalled();
    expect(mockPersonnelApi.getPettyCashTransactions).not.toHaveBeenCalled();
    expect((component as any).tabs).toBeUndefined();
  });

  it('opens and closes preview modal for invoice preview and history', () => {
    const item = { id: 501, invoice_number: 'INV-PAY-1' } as any;
    component.openPreview(item, 'preview');
    expect(component.previewModalOpen).toBe(true);
    expect(component.previewInvoiceId).toBe(501);
    expect(component.previewInitialTab).toBe('preview');

    component.openPreview(item, 'history');
    expect(component.previewInitialTab).toBe('history');

    component.closePreview();
    expect(component.previewModalOpen).toBe(false);
    expect(component.previewInvoiceId).toBeNull();
  });

  it('emitting on the live subject after ngOnInit() calls getTreasuryCartable again; after ngOnDestroy() it does not', () => {
    const live$ = new Subject<void>();
    const mockWs = {
      liveRefresh$: vi.fn(() => live$.asObservable())
    };
    const comp = __inCtx(() => new TreasurerInvoicesComponent(
      {} as any, {} as any, mockToast, mockPersonnelApi,
      {} as any,
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any,
      mockWs as any
    ));

    comp.ngOnInit();
    const callsAfterInit = mockPersonnelApi.getTreasuryCartable.mock.calls.length;

    live$.next();
    expect(mockPersonnelApi.getTreasuryCartable).toHaveBeenCalledTimes(callsAfterInit + 1);

    comp.ngOnDestroy();
    live$.next();
    expect(mockPersonnelApi.getTreasuryCartable).toHaveBeenCalledTimes(callsAfterInit + 1);
  });
});
