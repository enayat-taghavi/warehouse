// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { Login } from './login';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfigApiService } from '../../../../core/api/config-api.service';
import { BiometricAuthService } from '../../../../core/auth/biometric-auth.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

describe('Login Component', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authMock: any;
  let biometricAuthMock: any;
  let toastMock: any;
  let configApiMock: any;
  let routerMock: any;
  let mockStorage: ReturnType<typeof createStorageMock>;

  beforeEach(async () => {
    mockStorage = createStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    authMock = {
      login: vi.fn().mockReturnValue(of({ access: 'token' })),
      logout: vi.fn(),
      isLoggedIn: vi.fn().mockReturnValue(false),
      user: vi.fn().mockReturnValue({ is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    biometricAuthMock = {
      isAvailable: vi.fn().mockResolvedValue(false),
      hasSavedCredentials: vi.fn().mockResolvedValue(false),
      getSavedUsername: vi.fn().mockResolvedValue(null),
      saveCredentials: vi.fn().mockResolvedValue(true),
      authenticate: vi.fn().mockResolvedValue(null),
      clearCredentials: vi.fn().mockResolvedValue(undefined)
    };

    toastMock = {
      success: vi.fn(),
      error: vi.fn(),
      show: vi.fn()
    };

    configApiMock = {
      getPublicConfig: vi.fn().mockReturnValue(of({ system_version: '1.2.3' }))
    };

    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
      url: '/login'
    };

    const cdrMock: any = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    const routeMock: any = {
      snapshot: { queryParams: {} }
    };

    const activeCompanyMock: any = {
      fetchManageableCompanies: vi.fn().mockReturnValue(of([]))
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: BiometricAuthService, useValue: biometricAuthMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ConfigApiService, useValue: configApiMock },
        { provide: Router, useValue: routerMock },
        { provide: ActiveCompanyService, useValue: activeCompanyMock }
      ]
    });

    component = TestBed.runInInjectionContext(() =>
      new Login(authMock, routerMock, toastMock, cdrMock, configApiMock, routeMock)
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('1. should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('2. prefills username from localStorage last_username on init', () => {
    mockStorage.setItem('last_username', 'previous_user');
    component.ngOnInit();

    expect(component.username).toBe('previous_user');
  });

  it('3. saves last_username and triggers biometric save on successful login', async () => {
    biometricAuthMock.isAvailable.mockResolvedValue(true);
    component.username = 'manager';
    component.password = 'pass123';

    await component.handleLogin();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockStorage.getItem('last_username')).toBe('manager');
    expect(biometricAuthMock.saveCredentials).toHaveBeenCalledWith('manager', 'pass123');
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith(expect.any(String), { replaceUrl: true });
  });

  it('4. detects biometric capability and enables biometric login option', async () => {
    biometricAuthMock.isAvailable.mockResolvedValue(true);
    biometricAuthMock.hasSavedCredentials.mockResolvedValue(true);
    biometricAuthMock.getSavedUsername.mockResolvedValue('bio_user');

    await component.initBiometricState();

    expect(component.canUseBiometrics).toBe(true);
    expect(component.hasBiometricCredentials).toBe(true);
    expect(component.username).toBe('bio_user');
  });

  it('5. loginWithBiometrics authenticates and logs in automatically', async () => {
    biometricAuthMock.authenticate.mockResolvedValue({
      username: 'biometric_user',
      password: 'secret_password'
    });

    await component.loginWithBiometrics();

    expect(component.username).toBe('biometric_user');
    expect(component.password).toBe('secret_password');
    expect(authMock.login).toHaveBeenCalledWith('biometric_user', 'secret_password', expect.any(String));
  });
});
