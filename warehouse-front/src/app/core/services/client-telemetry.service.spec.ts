// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ClientTelemetryService } from './client-telemetry.service';
import { SessionTabService, TabSessionMessage } from './session-tab.service';
import { WebSocketService } from '../http/websocket.service';
import { ToastService } from '../../shared/components/toast/toast.component';
import { Subject } from 'rxjs';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ClientTelemetryService (BroadcastChannel Loop Prevention)', () => {
  let service: ClientTelemetryService;
  let sessionTabMock: any;
  let onMessageCallback: (msg: TabSessionMessage) => void;
  let broadcastSpy: any;

  beforeEach(() => {
    TestBed.resetTestingModule();
    broadcastSpy = vi.fn();
    sessionTabMock = {
      tabId: 'test_tab_1',
      getActiveApp: vi.fn().mockReturnValue('warehouse'),
      getActiveRole: vi.fn().mockReturnValue('counter'),
      getScopedAccessToken: vi.fn().mockReturnValue('mock_token'),
      broadcastMessage: broadcastSpy,
      onMessage: vi.fn((cb) => {
        onMessageCallback = cb;
        return () => {};
      })
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ClientTelemetryService,
        { provide: SessionTabService, useValue: sessionTabMock },
        { provide: WebSocketService, useValue: { notifications$: new Subject() } },
        { provide: ToastService, useValue: { show: vi.fn() } }
      ]
    });

    service = TestBed.inject(ClientTelemetryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should announce current tab with PING (isReply: false) on initialization', () => {
    expect(broadcastSpy).toHaveBeenCalledWith('PING', expect.objectContaining({
      isReply: false,
      appScope: 'warehouse',
      activeRole: 'counter'
    }));
  });

  it('should respond to incoming PING with PONG and isReply: true (NOT with PING)', () => {
    broadcastSpy.mockClear();

    const incomingPing: TabSessionMessage = {
      type: 'PING',
      sourceTabId: 'test_tab_2',
      payload: { isReply: false, appScope: 'warehouse', activeRole: 'supervisor' },
      timestamp: Date.now()
    };

    onMessageCallback(incomingPing);

    // Must respond with PONG, never PING
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith('PONG', expect.objectContaining({
      isReply: true,
      appScope: 'warehouse',
      activeRole: 'counter'
    }));
  });

  it('CRITICAL INVARIANT: should NEVER reply to PONG (prevents infinite broadcast storm)', () => {
    broadcastSpy.mockClear();

    const incomingPong: TabSessionMessage = {
      type: 'PONG',
      sourceTabId: 'test_tab_2',
      payload: { isReply: true, appScope: 'finance', activeRole: 'accountant' },
      timestamp: Date.now()
    };

    onMessageCallback(incomingPong);

    // Must NOT broadcast any response to PONG
    expect(broadcastSpy).not.toHaveBeenCalled();

    // But should update localTabs signal
    const tabs = service.localTabs();
    expect(tabs.some(t => t.tabId === 'test_tab_2')).toBe(true);
  });

  it('CRITICAL INVARIANT: should NEVER reply to PING that has isReply: true', () => {
    broadcastSpy.mockClear();

    const incomingRepliedPing: TabSessionMessage = {
      type: 'PING',
      sourceTabId: 'test_tab_3',
      payload: { isReply: true, appScope: 'warehouse', activeRole: 'manager' },
      timestamp: Date.now()
    };

    onMessageCallback(incomingRepliedPing);

    // Must NOT broadcast another response
    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});
