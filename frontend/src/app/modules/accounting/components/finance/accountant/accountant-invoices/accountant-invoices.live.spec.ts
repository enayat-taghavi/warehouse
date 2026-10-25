// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AccountantInvoicesHubComponent } from './accountant-invoices';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';

describe('AccountantInvoicesHubComponent live document_changed', () => {
  let fixture: ComponentFixture<AccountantInvoicesHubComponent>;
  let component: AccountantInvoicesHubComponent;
  let api: any;
  let ws: any;
  let subject: Subject<any>;
  let toast: any;
  let router: any;

  beforeEach(() => {
    subject = new Subject<any>();

    api = {
      getMySections: vi.fn(() => of([{ id: 11 }])),
      getProjectSections: vi.fn(() => of([])),
      getExpenseInvoices: vi.fn(() => of([
        { id: 1, status: 'pending_accountant' },
        { id: 2, status: 'pending_accountant' }
      ]))
    };

    ws = {
      documentChanges$: vi.fn(() => subject.asObservable())
    };

    toast = {
      show: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      info: vi.fn()
    };

    router = {
      navigate: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [AccountantInvoicesHubComponent],
      providers: [
        { provide: PersonnelApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: {} },
        { provide: StateService, useValue: {} },
        { provide: WebSocketService, useValue: ws }
      ]
    });

    TestBed.overrideComponent(AccountantInvoicesHubComponent, {
      set: {
        template: '',
        imports: []
      }
    });

    fixture = TestBed.createComponent(AccountantInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    api.getExpenseInvoices.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('1. subscribes to expense_invoice document events', () => {
    expect(ws.documentChanges$).toHaveBeenCalledWith(['expense_invoice']);
  });

  it('2. a status change of a listed invoice is patched in place without a refetch', () => {
    subject.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 1,
      action: 'status_changed',
      status: 'pending_manager',
      section_id: 11
    });

    expect(component.allInvoices[0].status).toBe('pending_manager');
    expect(api.getExpenseInvoices).not.toHaveBeenCalled();
    expect(component.statusCounters.pending_audit).toBe(1);
  });

  it('3. an unknown invoice triggers a silent refetch', () => {
    subject.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 99,
      action: 'created',
      section_id: 11
    });

    expect(api.getExpenseInvoices).toHaveBeenCalledTimes(1);
    expect(component.isLoading).toBe(false);
  });

  it('4. an event of another section is ignored', () => {
    component.selectedSectionId = 11;
    subject.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 99,
      action: 'created',
      section_id: 12
    });

    expect(api.getExpenseInvoices).not.toHaveBeenCalled();
  });
});
