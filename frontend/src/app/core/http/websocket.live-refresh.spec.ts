// @vitest-environment jsdom
import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService } from './websocket.service';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../../shared';
import { ActiveCompanyService } from '../services/active-company.service';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  send(): void {}
  close(): void { this.readyState = FakeSocket.CLOSED; }
  open(): void { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
}

describe('WebSocketService live refresh (step D)', () => {
  let service: WebSocketService;
  let originalWs: any;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWs = (globalThis as any).WebSocket;
    FakeSocket.instances = [];
    // jsdom here has no localStorage; a stored module keeps connect() off that path
    sessionStorage.setItem('active_app_module', 'accounting');
    (globalThis as any).WebSocket = FakeSocket;
    TestBed.configureTestingModule({
      providers: [
        WebSocketService,
        { provide: AuthService, useValue: { getToken: () => null } },
        { provide: ToastService, useValue: { show: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } },
        { provide: ActiveCompanyService, useValue: { activeCompanySignal: signal<any>(null) } }
      ]
    });
    service = TestBed.inject(WebSocketService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    (globalThis as any).WebSocket = originalWs;
    vi.useRealTimers();
  });

  it('1. first open does not emit reconnected$; a later open does', () => {
    const spy = vi.fn();
    service.reconnected$.subscribe(spy);
    service.connect();
    FakeSocket.instances[0].open();
    expect(spy).not.toHaveBeenCalled();

    FakeSocket.instances[0].readyState = FakeSocket.CLOSED;
    service.connect();
    FakeSocket.instances[1].open();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('2. visibilitychange to visible and Capacitor resume emit appResumed$', () => {
    const spy = vi.fn();
    service.appResumed$.subscribe(spy);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('resume'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('3. liveRefresh$ collapses a reconnect and a resume that arrive together', () => {
    const spy = vi.fn();
    const sub = service.liveRefresh$().subscribe(spy);
    service.appResumed$.next();
    service.reconnected$.next();
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(900);
    expect(spy).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });

  it('4. hidden visibility does not emit appResumed$', () => {
    const spy = vi.fn();
    service.appResumed$.subscribe(spy);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spy).not.toHaveBeenCalled();
  });
});
