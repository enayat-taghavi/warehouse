// @vitest-environment jsdom
import '@angular/compiler';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService } from './websocket.service';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../../shared';
import { ActiveCompanyService } from '../services/active-company.service';

describe('WebSocketService', () => {
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

  it('1. skips a falsy message', () => {
    expect(service.skipLiveEvent(null)).toBe(true);
    expect(service.skipLiveEvent(undefined)).toBe(true);
  });

  it('2. skips an event from the same tab', () => {
    expect(service.skipLiveEvent({ client_tab_id: service.tabId })).toBe(true);
  });

  it('3. keeps an event from another tab', () => {
    activeCompanySignal.set({ id: 5 });
    expect(service.skipLiveEvent({ client_tab_id: 'tab_other', company_id: 5 })).toBe(false);
  });

  it('4. skips an event of another company', () => {
    activeCompanySignal.set({ id: 5 });
    expect(service.skipLiveEvent({ company_id: 7 })).toBe(true);
    expect(service.skipLiveEvent({ company_id: '5' })).toBe(false);
  });

  it('5. uses metadata.company_id when company_id is missing', () => {
    activeCompanySignal.set({ id: 5 });
    expect(service.skipLiveEvent({ metadata: { company_id: 9 } })).toBe(true);
  });

  it('6. keeps events when no active company or no event company', () => {
    activeCompanySignal.set(null);
    expect(service.skipLiveEvent({ company_id: 7 })).toBe(false);
    activeCompanySignal.set({ id: 5 });
    expect(service.skipLiveEvent({})).toBe(false);
  });
});
