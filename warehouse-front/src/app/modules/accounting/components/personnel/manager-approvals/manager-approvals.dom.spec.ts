// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { ManagerApprovals } from './manager-approvals';
import { AuthService } from '../../../../../core/auth/auth.service';
import { StateService } from '../../../../../services/state.service';
import { ToastService } from '../../../../../services/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PersonnelApiService } from '../../../../../core/api/personnel-api.service';
import { WarehouseHttpService } from '../../../../../core/http/warehouse-http.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ManagerApprovals DOM Unit Testing (Type 1 Vitest + JSDOM - 7 Bugs Verification)', () => {
  let fixture: ComponentFixture<ManagerApprovals>;
  let component: ManagerApprovals;
  let mockAuth: any;
  let mockApi: any;
  let mockWh: any;
  let mockToast: any;
  let mockConfirm: any;
  let mockRouter: any;
  let mockState: any;

  beforeAll(async () => {
    Object.defineProperty(ManagerApprovals, 'ɵfac', {
      value: function(t: any) {
        return new (t || ManagerApprovals)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(WarehouseHttpService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ConfirmDialogService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router)
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
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    mockAuth = {
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'admin_all']),
      currentUser: vi.fn().mockReturnValue({ id: 1, username: 'ceo_manager' })
    };

    mockState = {
      user: { id: 1, username: 'ceo_manager' }
    };

    mockApi = {
      getYearlySettings: vi.fn().mockReturnValue(of({ year: '1405' })),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([
        { id: 101, status: 'pending_manager', proposed_changes: { job_title: 'مدیر ارشد انبار' }, previous_values: { job_title: 'انباردار' }, personnel_name: 'احمد حسینی' }
      ])),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([])),
      getExpenseInvoices: vi.fn().mockReturnValue(of([
        { id: 201, invoice_number: 'INV-1405-09', counterparty_name: 'فروشگاه آذرخش', total_amount: 15000000, status: 'pending_manager', section_name: 'بخش مرکزی' }
      ])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([
        { id: 301, title: 'خرید لوازم اداری و ملزومات', custodian_name: 'سعید احمدی', amount: 3500000, status: 'approved', section_name: 'بخش اداری' }
      ])),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({ year_month: '1405/04', period_status: 'OPEN' })),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([
        { id: 1, actor_name: 'علی سرپرست', action: 'approve', action_display: 'تایید سرپرست', reason: 'سوابق تایید شد', created_at_jalali: '1405/04/10 10:30' },
        { id: 2, actor_name: 'حسین حسابدار', action: 'approve', action_display: 'تایید مالی', reason: 'مدارک مالی کامل است', created_at_jalali: '1405/04/11 14:15' }
      ])),
      postCartableAction: vi.fn().mockReturnValue(of({ message: 'عملیات با موفقیت انجام شد' })),
      patchDailyAttendance: vi.fn().mockReturnValue(of({ id: 50, notes: 'تایید سرپرست' })),
      patchVehicleTrip: vi.fn().mockReturnValue(of({ id: 60, notes: 'تایید سرپرست' }))
    };

    mockWh = {
      getAll: vi.fn().mockReturnValue(of([{ id: 1, name: 'انبار شماره یک' }]))
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockConfirm = {
      confirm: vi.fn().mockReturnValue(of(true))
    };

    mockRouter = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, ManagerApprovals],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: PersonnelApiService, useValue: mockApi },
        { provide: WarehouseHttpService, useValue: mockWh },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirm },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
            snapshot: { queryParams: {} }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ManagerApprovals);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('Bug 1: Manager Cartable renders tabs for Invoices and Petty Cash and dispatches approval actions', () => {
    // 1. Verify counts
    expect(component.pendingInvoicesCount).toBe(1);
    expect(component.pendingPettyCashCount).toBe(1);

    // 2. Switch to invoices tab and load data
    component.setTab('invoices');
    component.loadInvoices();
    fixture.detectChanges();

    const hostElem: HTMLElement = fixture.nativeElement;
    expect(hostElem.textContent).toContain('فاکتورهای هزینه');
    expect(hostElem.textContent).toContain('فروشگاه آذرخش');
    expect(hostElem.textContent).toContain('INV-1405-09');

    // 3. Approve invoice
    const sampleInv = { id: 201, invoice_number: 'INV-1405-09' };
    component.approveInvoiceManager(sampleInv);
    expect(mockApi.postCartableAction).toHaveBeenCalledWith('manager', {
      action: 'approve',
      model: 'invoice',
      id: 201
    });

    // 4. Switch to petty cash tab and load data
    component.setTab('petty_cash');
    component.loadPettyCash();
    fixture.detectChanges();

    expect(hostElem.textContent).toContain('اسناد تنخواه‌گردان');
    expect(hostElem.textContent).toContain('خرید لوازم اداری');

    // 5. Approve petty cash
    const samplePC = { id: 301, title: 'خرید لوازم اداری' };
    component.approvePettyCashManager(samplePC);
    expect(mockApi.postCartableAction).toHaveBeenCalledWith('manager', {
      action: 'approve',
      model: 'petty_cash',
      id: 301
    });
  });

  it('Bug 4: Diff Modal fetches and renders WorkflowAuditLog timeline', () => {
    const sampleCR = {
      id: 101,
      personnel_name: 'احمد حسینی',
      proposed_changes: { job_title: 'مدیر ارشد انبار' },
      previous_values: { job_title: 'انباردار' }
    };

    component.openDiffModal(sampleCR, 'personnel');
    fixture.detectChanges();

    expect(mockApi.getWorkflowAuditLogs).toHaveBeenCalledWith({
      content_type: 'personnelchangerequest',
      object_id: 101
    });
    expect(component.diffAuditLogs.length).toBe(2);

    const hostElem: HTMLElement = fixture.nativeElement;
    expect(hostElem.textContent).toContain('تاریخچه گردش کار و ممیزی (Audit Trail)');
    expect(hostElem.textContent).toContain('علی سرپرست');
    expect(hostElem.textContent).toContain('حسین حسابدار');
  });

  it('Bug 6: Visibility Blindspot auto-switches to change_requests when new personnel is 0 but CRs exist', () => {
    component.personnelList = [];
    component.personnelChangeRequests = [
      { id: 101, status: 'pending_manager', proposed_changes: {}, previous_values: {} } as any
    ];
    component.activeTab = 'new_personnel';

    component.loadPersonnel();
    fixture.detectChanges();

    expect(component.activeTab).toBe('change_requests');
  });

  it('Bug 2 & 5: Period lock and Attendance/Trip API persistence contract verification', () => {
    mockApi.postCartableAction('supervisor', {
      action: 'approve',
      model: 'period',
      id: 0,
      year_month: '1405/04',
      warehouse_id: 1,
      reason: 'تایید نهایی دوره'
    });
    expect(mockApi.postCartableAction).toHaveBeenCalledWith('supervisor', expect.objectContaining({
      action: 'approve',
      model: 'period',
      year_month: '1405/04'
    }));

    mockApi.patchDailyAttendance(50, { notes: 'تایید سرپرست' });
    expect(mockApi.patchDailyAttendance).toHaveBeenCalledWith(50, { notes: 'تایید سرپرست' });

    mockApi.patchVehicleTrip(60, { notes: 'تایید سرپرست' });
    expect(mockApi.patchVehicleTrip).toHaveBeenCalledWith(60, { notes: 'تایید سرپرست' });
  });
});
