// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runInInjectionContext, Injector, signal, ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';

import { Settings } from './settings';
import { SettingsService } from '../../../../core/services/settings';
import { ApiService } from '../../../../core/api/api.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmDialogService } from '../../../../shared';

describe('Settings Component (Core Settings & Delta Management)', () => {
  let component: Settings;
  let settingsServiceMock: any;
  let toastServiceMock: any;
  let apiMock: any;
  let moduleRegistryMock: any;
  let authServiceMock: any;
  let cdrMock: any;
  let routeMock: any;
  let routerMock: any;
  let confirmMock: any;

  beforeEach(() => {
    settingsServiceMock = {
      getGlobalSettings: vi.fn().mockReturnValue(of({
        offline_sync_interval_minutes: 15,
        offline_cache_ttl_minutes: 60,
        blind_counting: 'blind',
        field_permissions_counter: {},
        field_permissions_doc: {},
      })),
      getGlobalSettingsWithMeta: vi.fn().mockReturnValue(of({
        data: {
          offline_sync_interval_minutes: 15,
          offline_cache_ttl_minutes: 60,
          blind_counting: 'blind',
          field_permissions_counter: {},
          field_permissions_doc: {},
        },
        etag: '"w/123456"'
      })),
      saveGlobalSettings: vi.fn().mockReturnValue(of({ status: 'success', etag: '"w/new789"' })),
    };

    toastServiceMock = {
      show: vi.fn(),
    };

    apiMock = {
      get: vi.fn().mockReturnValue(of([])),
    };

    moduleRegistryMock = {
      getExtensions: vi.fn().mockImplementation((key: string) => {
        if (key === 'dynamicFields') {
          return [
            {
              moduleCode: 'warehouse',
              extension: {
                fieldsEndpoint: '/inventory/dynamic-fields/'
              }
            }
          ];
        }
        return [];
      })
    };

    authServiceMock = {
      user: signal({
        id: 1,
        username: 'admin',
        first_name: 'مدیر',
        last_name: 'سیستم',
        is_superuser: true,
        permissions: ['perm_sys_settings'],
      }),
      logout: vi.fn(),
    };

    cdrMock = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn(),
    };

    routeMock = {
      queryParams: of({ tab: 'operations' }),
    };

    routerMock = {
      navigate: vi.fn(),
    };

    confirmMock = {
      open: vi.fn().mockResolvedValue(true),
    };

    const injector = Injector.create({
      providers: [
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: ApiService, useValue: apiMock },
        { provide: ModuleRegistryService, useValue: moduleRegistryMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ChangeDetectorRef, useValue: cdrMock },
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: Router, useValue: routerMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
      ],
    });

    runInInjectionContext(injector, () => {
      component = new Settings(
        settingsServiceMock,
        toastServiceMock,
        authServiceMock,
        cdrMock,
        routeMock,
        routerMock,
        confirmMock
      );
    });
  });

  it('should initialize component and load global settings with ETag', () => {
    expect(component).toBeTruthy();
    component.ngOnInit();
    expect(settingsServiceMock.getGlobalSettingsWithMeta).toHaveBeenCalled();
    expect(component.settings.offline_sync_interval_minutes).toBe(15);
    expect(component.currentEtag).toBe('"w/123456"');
    expect(component.activeTab).toBe('operations');
  });

  it('should navigate to another tab with setTab', () => {
    component.setTab('backup');
    expect(routerMock.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { tab: 'backup' },
      queryParamsHandling: 'merge'
    }));
  });

  it('should detect changes when settings are modified', () => {
    component.ngOnInit();
    expect(component.hasChanges()).toBe(false);

    component.settings.offline_sync_interval_minutes = 30;
    expect(component.hasChanges()).toBe(true);
  });

  it('should send delta and currentEtag when saving modified settings', () => {
    component.ngOnInit();
    component.settings.offline_sync_interval_minutes = 30;

    component.saveGlobalSettings();

    expect(settingsServiceMock.saveGlobalSettings).toHaveBeenCalledWith(
      expect.objectContaining({ offline_sync_interval_minutes: 30 }),
      '"w/123456"'
    );
    expect(toastServiceMock.show).toHaveBeenCalledWith('success', expect.stringMatching('موفقیت'));
    expect(component.currentEtag).toBe('"w/new789"');
  });

  it('should show concurrency error toast when server returns 412 Precondition Failed', () => {
    component.ngOnInit();
    component.settings.offline_sync_interval_minutes = 30;

    settingsServiceMock.saveGlobalSettings.mockReturnValue(throwError(() => ({
      status: 412,
      error: {
        code: 'CONCURRENT_MODIFICATION',
        error: 'تنظیمات همزمان توسط کاربر یا تب دیگری تغییر کرده است. لطفاً صفحه را تازه‌سازی کنید.'
      }
    })));

    component.saveGlobalSettings();

    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'error',
      expect.stringMatching('تنظیمات همزمان')
    );
  });

  it('should block saving if dynamic fields failed to load', () => {
    component.dynamicFieldsLoadFailed = true;
    component.saveGlobalSettings();
    expect(settingsServiceMock.saveGlobalSettings).not.toHaveBeenCalled();
  });
});

