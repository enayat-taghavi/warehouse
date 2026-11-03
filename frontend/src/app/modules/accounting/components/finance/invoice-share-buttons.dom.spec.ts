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
import * as fs from 'fs';
import * as path from 'path';

import { TreasurerInvoicesComponent } from './treasurer/treasurer-invoices/treasurer-invoices';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../api/personnel-api.service';
import { TreasuryOrgApiService } from '../../api/treasury-org-api.service';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { PrintService } from '../../../../core/services/print.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionService } from '../../../../core/services/permission.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('Invoice Share Buttons & Template Verifications (Step J)', () => {
  const templates = [
    {
      role: 'accountant',
      path: 'accountant/accountant-invoices/accountant-invoices.html',
    },
    {
      role: 'manager',
      path: 'manager/manager-invoices/manager-invoices.html',
    },
    {
      role: 'supervisor',
      path: 'supervisor/supervisor-invoices/supervisor-invoices.html',
    },
    {
      role: 'treasurer',
      path: 'treasurer/treasurer-invoices/treasurer-invoices.html',
    },
    {
      role: 'employee',
      path: 'employee/employee-invoices/employee-invoices.html',
    },
  ];

  describe('Static template checks across 5 role views', () => {
    templates.forEach(({ role, path: relPath }) => {
      it(`verifies ${role} template has no appAction="history", no 'history') call, and at least one appAction="share"`, () => {
        const fullPath = path.resolve(__dirname, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, 'utf-8');

        expect(content).not.toContain('appAction="history"');
        expect(content).not.toContain("'history')");
        expect(content).toContain('appAction="share"');
      });
    });
  });

  describe('TreasurerInvoicesComponent rendered share action', () => {
    let fixture: ComponentFixture<TreasurerInvoicesComponent>;
    let component: TreasurerInvoicesComponent;
    let mockAuth: any;
    let mockState: any;
    let mockToast: any;
    let mockPersonnelApi: any;
    let mockTreasuryOrgApi: any;
    let mockCompanyApi: any;
    let mockPrintService: any;
    let mockRouter: any;
    let mockRoute: any;
    let mockConfirm: any;

    beforeAll(() => {
      Object.defineProperty(TreasurerInvoicesComponent, 'ɵfac', {
        value: function (t: any) {
          return new (t || TreasurerInvoicesComponent)(
            ɵɵdirectiveInject(AuthService),
            ɵɵdirectiveInject(StateService),
            ɵɵdirectiveInject(ToastService),
            ɵɵdirectiveInject(PersonnelApiService),
            ɵɵdirectiveInject(TreasuryOrgApiService),
            ɵɵdirectiveInject(CompanyApiService),
            ɵɵdirectiveInject(PrintService),
            ɵɵdirectiveInject(Router),
            ɵɵdirectiveInject(ActivatedRoute),
            ɵɵdirectiveInject(ChangeDetectorRef),
            ɵɵdirectiveInject(WebSocketService, 8)
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
      mockAuth = {
        user: vi.fn().mockReturnValue({ id: 1, username: 'treasurer_user' }),
        currentUser: vi.fn().mockReturnValue({ id: 1, username: 'treasurer_user' }),
        userPermissions: vi.fn().mockReturnValue(['perm_treasury', 'admin_all']),
      };

      mockState = {
        user: { id: 1, username: 'treasurer_user' },
      };

      mockToast = {
        show: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
      };

      mockPersonnelApi = {
        getMySections: vi.fn().mockReturnValue(of([{ id: 1, name: 'بخش اصلی', is_active: true }])),
        getProjectSections: vi.fn().mockReturnValue(of([{ id: 1, name: 'بخش اصلی', is_active: true }])),
        getTreasuryCartable: vi.fn().mockReturnValue(
          of({
            invoices: [
              {
                id: 7,
                invoice_number: 'F-7',
                number: 'INV-1405-0007',
                amount: 1000000,
                paid_amount: '400000',
                remaining: '600000',
                status: 'partially_paid',
                counterparty: null,
              },
            ],
          })
        ),
        getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
        getCounterparties: vi.fn().mockReturnValue(of([])),
        getPartyBankAccounts: vi.fn().mockReturnValue(of([])),
      };

      mockTreasuryOrgApi = {
        getInvoicePayments: vi.fn().mockReturnValue(
          of({
            results: [],
            paid_amount: '400000',
            remaining: '600000',
          })
        ),
      };

      mockCompanyApi = {
        getBankAccounts: vi.fn().mockReturnValue(
          of([{ id: 5, bank_name: 'Mellat', account_title: 'Main', is_primary: true, is_active: true }])
        ),
      };

      mockPrintService = {
        downloadPdf: vi.fn().mockResolvedValue(undefined),
        sharePdf: vi.fn().mockResolvedValue(true),
      };

      mockRouter = {
        navigate: vi.fn(),
      };

      mockRoute = {
        queryParams: of({}),
      };

      mockConfirm = {
        confirm: vi.fn().mockReturnValue(of(true)),
        open: vi.fn().mockResolvedValue(true),
      };

      await TestBed.configureTestingModule({
        imports: [CommonModule, FormsModule, ReactiveFormsModule, TreasurerInvoicesComponent],
        providers: [ { provide: PermissionService, useValue: { canWriteDocuments: () => true } },
          { provide: AuthService, useValue: mockAuth },
          { provide: StateService, useValue: mockState },
          { provide: ToastService, useValue: mockToast },
          { provide: PersonnelApiService, useValue: mockPersonnelApi },
          { provide: TreasuryOrgApiService, useValue: mockTreasuryOrgApi },
          { provide: CompanyApiService, useValue: mockCompanyApi },
          { provide: PrintService, useValue: mockPrintService },
          { provide: Router, useValue: mockRouter },
          { provide: ActivatedRoute, useValue: mockRoute },
          { provide: ConfirmDialogService, useValue: mockConfirm },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(TreasurerInvoicesComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('clicking «همرسانی» on a row calls sharePdf("expense_invoice", <row id>, ...)', async () => {
      const shareBtn = fixture.nativeElement.querySelector('button[appAction="share"]') as HTMLButtonElement;
      expect(shareBtn).toBeTruthy();

      shareBtn.click();
      fixture.detectChanges();

      expect(mockPrintService.sharePdf).toHaveBeenCalledWith(
        'expense_invoice',
        7,
        'payment-receipt-INV-1405-0007.pdf'
      );
    });
  });
});
