// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { OperationsRbacGovernanceComponent } from './operations-rbac-governance';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { AccountsHttpService } from '../../../../../core/http/accounts-http.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('OperationsRbacGovernanceComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<OperationsRbacGovernanceComponent>;
  let component: OperationsRbacGovernanceComponent;
  let mockAuth: any;
  let mockPersona: any;
  let mockToast: any;
  let mockAccounts: any;

  beforeAll(async () => {
    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; }
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
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

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin' }),
      userName: vi.fn().mockReturnValue('مدیر ارشد')
    };
    mockPersona = {};
    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };
    mockAccounts = {
      getUsers: vi.fn().mockReturnValue(of([
        {
          id: 1,
          username: 'superuser',
          is_superuser: true,
          is_staff: true,
          allowed_apps: ['warehouse', 'finance', 'operations']
        },
        {
          id: 2,
          username: 'regular_user',
          is_superuser: false,
          is_staff: false,
          allowed_apps: ['warehouse', 'finance']
        }
      ]))
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, OperationsRbacGovernanceComponent],
      providers: [
        provideHttpClient(),
        { provide: AuthService, useValue: mockAuth },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: ToastService, useValue: mockToast },
        { provide: AccountsHttpService, useValue: mockAccounts }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OperationsRbacGovernanceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('wh_installed_modules');
    TestBed.resetTestingModule();
  });

  it('۱. فیلتر allowedApps در نصب فقط مالی: اپ warehouse فیلتر شده و finance نگاشت به accounting باقی می‌ماند', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'accounting']);

    const filtered = component.filterInstalledApps(['warehouse', 'finance', 'operations']);
    expect(filtered).not.toContain('warehouse');
    expect(filtered).toContain('finance');
    expect(filtered).toContain('operations');

    // لود داده‌های حاکمیت
    component.loadGovernanceData();
    const users = component.users();
    expect(users[0].allowedApps).not.toContain('warehouse');
    expect(users[1].allowedApps).not.toContain('warehouse');
  });

  it('۲. فیلتر allowedApps در نصب فقط انبار: اپ finance فیلتر می‌شود و warehouse باقی می‌ماند', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse']);

    const filtered = component.filterInstalledApps(['warehouse', 'finance', 'operations']);
    expect(filtered).toContain('warehouse');
    expect(filtered).not.toContain('finance');
    expect(filtered).toContain('operations');
  });

  it('۳. شرح مجوز فریز اضطراری خنثی شده است (L17)', () => {
    const freezePerm = component.sensitivePermissions.find(p => p.code === 'perm_sys_emergency_freeze');
    expect(freezePerm).toBeDefined();
    expect(freezePerm?.description).toBe('قفل کردن کلیه ثبت‌های عملیاتی در بازه‌های معین بدون امکان ویرایش');
    expect(freezePerm?.description).not.toContain('انبار و مالی');
  });
});
