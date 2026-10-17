// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PushService, pushNotificationBridge, PUSH_TOKEN_STORAGE_KEY } from './push.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { APP_VERSION } from './app-version';
import { environment } from '../../../environments/environment';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

describe('PushService', () => {
  let service: PushService;
  let mockHttp: { post: any; delete: any; get: any };
  let mockRouter: { navigate: any; navigateByUrl: any };
  let mockModuleRegistry: { getExtensions: any };
  let listeners: Record<string, (arg: any) => void>;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.clear();
    listeners = {};

    vi.spyOn(pushNotificationBridge, 'checkPermissions').mockImplementation(async () => ({ receive: 'prompt' } as any));
    vi.spyOn(pushNotificationBridge, 'requestPermissions').mockImplementation(async () => ({ receive: 'granted' } as any));
    vi.spyOn(pushNotificationBridge, 'register').mockImplementation(async () => {});
    vi.spyOn(pushNotificationBridge, 'unregister').mockImplementation(async () => {});
    vi.spyOn(pushNotificationBridge, 'removeAllListeners').mockImplementation(async () => {});
    vi.spyOn(pushNotificationBridge, 'addListener').mockImplementation(async (event: string, fn: any) => {
      listeners[event] = fn;
      return { remove: vi.fn() } as any;
    });

    mockHttp = {
      post: vi.fn().mockReturnValue(of({ success: true })),
      delete: vi.fn().mockReturnValue(of({ success: true })),
      get: vi.fn().mockReturnValue(of({})),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    mockModuleRegistry = {
      getExtensions: vi.fn().mockReturnValue([]),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PushService,
        { provide: HttpClient, useValue: mockHttp },
        { provide: Router, useValue: mockRouter },
        { provide: ModuleRegistryService, useValue: mockModuleRegistry },
      ],
    });

    service = TestBed.inject(PushService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    localStorage.clear();
  });

  it('1. web does nothing: does not request permissions, register, or delete token on web platform', async () => {
    // Platform is web by default (isNativePlatform === false)
    await service.register();

    expect(pushNotificationBridge.checkPermissions).not.toHaveBeenCalled();
    expect(pushNotificationBridge.requestPermissions).not.toHaveBeenCalled();
    expect(pushNotificationBridge.register).not.toHaveBeenCalled();
    expect(pushNotificationBridge.addListener).not.toHaveBeenCalled();
    expect(mockHttp.post).not.toHaveBeenCalled();

    await service.deleteToken();

    expect(mockHttp.delete).not.toHaveBeenCalled();
    expect(pushNotificationBridge.removeAllListeners).not.toHaveBeenCalled();
  });

  it('2. native registers and posts the token to backend upon registration event', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    await service.register();

    expect(pushNotificationBridge.checkPermissions).toHaveBeenCalled();
    expect(pushNotificationBridge.requestPermissions).toHaveBeenCalled();
    expect(pushNotificationBridge.register).toHaveBeenCalled();
    expect(pushNotificationBridge.addListener).toHaveBeenCalledWith('registration', expect.any(Function));
    expect(pushNotificationBridge.addListener).toHaveBeenCalledWith('registrationError', expect.any(Function));
    expect(pushNotificationBridge.addListener).toHaveBeenCalledWith('pushNotificationActionPerformed', expect.any(Function));

    // Simulate native plugin emitting registration event with FCM token
    expect(listeners['registration']).toBeDefined();
    listeners['registration']({ value: 'mock-fcm-token-xyz-123' });

    expect(mockHttp.post).toHaveBeenCalledWith(
      `${environment.apiUrl}/notifications/devices/`,
      {
        token: 'mock-fcm-token-xyz-123',
        platform: 'android',
        app_version: APP_VERSION,
      },
      expect.anything()
    );

    expect(service.getToken()).toBe('mock-fcm-token-xyz-123');
    expect(localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)).toBe('mock-fcm-token-xyz-123');
  });

  it('3. logout deletes it: unregister sends DELETE request with token and clears stored token', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    // Store existing token
    localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, 'fcm-device-token-456');

    // Re-create service so it loads stored token
    const testService = TestBed.inject(PushService);
    expect(testService.getToken()).toBe('fcm-device-token-456');

    await testService.deleteToken();

    expect(mockHttp.delete).toHaveBeenCalledWith(
      `${environment.apiUrl}/notifications/devices/`,
      expect.objectContaining({
        body: { token: 'fcm-device-token-456' },
      })
    );
    expect(testService.getToken()).toBeNull();
    expect(localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(pushNotificationBridge.removeAllListeners).toHaveBeenCalled();
  });

  it('4. a registration error is swallowed: missing google-services.json or HTTP errors never throw', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    // Test rejection in requestPermissions / register (missing google-services.json)
    vi.spyOn(pushNotificationBridge, 'requestPermissions').mockRejectedValue(
      new Error('Default FirebaseApp is not initialized in this process')
    );

    await expect(service.register()).resolves.toBeUndefined();

    // Test registrationError event from native plugin
    expect(listeners['registrationError']).toBeDefined();
    expect(() => {
      listeners['registrationError']({ error: 'SERVICE_NOT_AVAILABLE' });
    }).not.toThrow();

    // Test backend HTTP error swallowing
    mockHttp.post.mockReturnValue(throwError(() => new Error('Network error')));
    expect(() => {
      service.handleRegistrationSuccess('fcm-token-fail-test');
    }).not.toThrow();
  });

  it('5. a tap navigates: routes to direct URL, matches modular notification handler, or falls back to /notifications', () => {
    // 5a. Direct URL in payload
    service.handleNotificationTap({
      actionId: 'tap',
      notification: {
        id: '1',
        data: { url: '/app/finance/employee-fleet' },
      } as any,
    });
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance/employee-fleet');

    // 5b. Modular notification handler match (target_model: PersonnelProfile)
    const mockHandler = {
      canHandle: vi.fn((item: any) => item?.target_model === 'PersonnelProfile'),
      navigate: vi.fn(),
    };
    mockModuleRegistry.getExtensions.mockReturnValue([{ extension: [mockHandler] }]);

    service.handleNotificationTap({
      actionId: 'tap',
      notification: {
        id: '2',
        title: 'اعلان پرسنلی',
        body: 'پرونده پرسنلی تایید شد',
        data: { target_model: 'PersonnelProfile', target_id: '88' },
      } as any,
    });

    expect(mockHandler.canHandle).toHaveBeenCalled();
    expect(mockHandler.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          target_model: 'PersonnelProfile',
          target_id: '88',
        }),
        router: mockRouter,
      })
    );

    // 5c. Fallback navigation when no handler matches
    mockModuleRegistry.getExtensions.mockReturnValue([]);
    service.handleNotificationTap({
      actionId: 'tap',
      notification: {
        id: '3',
        data: { target_model: 'UnknownModel' },
      } as any,
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/notifications']);
  });

  it('6. permission denied gracefully skips registration without throwing', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    vi.spyOn(pushNotificationBridge, 'checkPermissions').mockResolvedValue({ receive: 'denied' } as any);

    await service.register();

    expect(pushNotificationBridge.register).not.toHaveBeenCalled();
    expect(mockHttp.post).not.toHaveBeenCalled();
  });
});
