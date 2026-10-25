// @vitest-environment jsdom
import '@angular/compiler';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService, patchDocumentRow, DocumentChangedEvent } from './websocket.service';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../../shared';
import { ActiveCompanyService } from '../services/active-company.service';

describe('WebSocket document_changed specs', () => {
  let service: WebSocketService;
  let activeCompanySignal: WritableSignal<any>;

  beforeEach(() => {
    activeCompanySignal = signal<any>(null);

    TestBed.configureTestingModule({
      providers: [
        WebSocketService,
        { provide: AuthService, useValue: { getToken: () => null } },
        {
          provide: ToastService,
          useValue: {
            show: vi.fn(),
            error: vi.fn(),
            warning: vi.fn(),
            success: vi.fn(),
            info: vi.fn()
          }
        },
        {
          provide: ActiveCompanyService,
          useValue: { activeCompanySignal }
        }
      ]
    });

    service = TestBed.inject(WebSocketService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('1. patchDocumentRow sets the status of the matching row', () => {
    const rows = [
      { id: 1, status: 'draft' },
      { id: 2, status: 'draft' }
    ];
    const ev: DocumentChangedEvent = {
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 2,
      action: 'status_changed',
      status: 'paid'
    };

    const res = patchDocumentRow(rows, ev);

    expect(res).toBe(true);
    expect(rows[0].status).toBe('draft');
    expect(rows[1].status).toBe('paid');
  });

  it('2. patchDocumentRow returns false for a missing row, a non-status action or a null status', () => {
    const rows = [
      { id: 1, status: 'draft' },
      { id: 2, status: 'draft' }
    ];

    // Missing row
    const evMissing: DocumentChangedEvent = {
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 999,
      action: 'status_changed',
      status: 'paid'
    };
    expect(patchDocumentRow(rows, evMissing)).toBe(false);
    expect(rows[0].status).toBe('draft');
    expect(rows[1].status).toBe('draft');

    // Non-status action
    const evNonStatus: DocumentChangedEvent = {
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 1,
      action: 'created',
      status: 'paid'
    };
    expect(patchDocumentRow(rows, evNonStatus)).toBe(false);
    expect(rows[0].status).toBe('draft');
    expect(rows[1].status).toBe('draft');

    // Null status
    const evNullStatus: DocumentChangedEvent = {
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 1,
      action: 'status_changed',
      status: null
    };
    expect(patchDocumentRow(rows, evNullStatus)).toBe(false);
    expect(rows[0].status).toBe('draft');
    expect(rows[1].status).toBe('draft');
  });

  it('3. patchDocumentRow uses the given status field', () => {
    const rows = [{ id: 5, payment_status: 'PENDING' }];
    const ev: DocumentChangedEvent = {
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 5,
      action: 'status_changed',
      status: 'PAID'
    };

    const res = patchDocumentRow(rows, ev, 'payment_status');

    expect(res).toBe(true);
    expect(rows[0].payment_status).toBe('PAID');
  });

  it('4. documentChanges$ emits only the requested doc types', () => {
    const emitted: DocumentChangedEvent[] = [];
    const sub = service.documentChanges$(['petty_cash']).subscribe(ev => {
      emitted.push(ev);
    });

    service.notifications$.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 1,
      action: 'status_changed',
      status: 'paid'
    });

    service.notifications$.next({
      type: 'document_changed',
      doc_type: 'petty_cash',
      doc_id: 2,
      action: 'status_changed',
      status: 'paid'
    });

    expect(emitted.length).toBe(1);
    expect(emitted[0].doc_type).toBe('petty_cash');
    expect(emitted[0].doc_id).toBe(2);

    sub.unsubscribe();
  });

  it('5. documentChanges$ drops events of the same tab', () => {
    const emitted: DocumentChangedEvent[] = [];
    const sub = service.documentChanges$(['expense_invoice']).subscribe(ev => {
      emitted.push(ev);
    });

    service.notifications$.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 1,
      action: 'status_changed',
      status: 'paid',
      client_tab_id: service.tabId
    });

    expect(emitted.length).toBe(0);

    sub.unsubscribe();
  });

  it('6. documentChanges$ drops events of another company', () => {
    activeCompanySignal.set({ id: 3 });

    const emitted: DocumentChangedEvent[] = [];
    const sub = service.documentChanges$(['expense_invoice']).subscribe(ev => {
      emitted.push(ev);
    });

    service.notifications$.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 1,
      action: 'status_changed',
      status: 'paid',
      company_id: 4
    });

    service.notifications$.next({
      type: 'document_changed',
      doc_type: 'expense_invoice',
      doc_id: 2,
      action: 'status_changed',
      status: 'paid',
      company_id: 3
    });

    expect(emitted.length).toBe(1);
    expect(emitted[0].doc_id).toBe(2);
    expect(emitted[0].company_id).toBe(3);

    sub.unsubscribe();
  });
});
