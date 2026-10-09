// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runInInjectionContext, Injector, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { CompanyGdriveTabComponent, GDriveConfigResponse, MODEL_NAME_PERSIAN_MAP } from './company-gdrive-tab';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ToastService } from '../../../../services/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';

describe('CompanyGdriveTabComponent', () => {
  let component: CompanyGdriveTabComponent;
  let httpMock: any;
  let activeCompanyServiceMock: any;
  let toastServiceMock: any;
  let confirmDialogMock: any;

  const mockConfig: GDriveConfigResponse = {
    company_id: 1,
    company_name: 'شرکت آزمایشی',
    is_enabled: true,
    is_connected: true,
    auth_status: 'connected',
    worker_alive: true,
    worker_heartbeat_at: '2026-10-06T08:00:00Z',
    other_accounts_count: 0,
    account_email: 'test@gmail.com',
    root_folder_id: 'folder_123',
    root_folder_name: 'سامانه ابری شرکت',
    root_folder_url: 'https://drive.google.com/drive/folders/folder_123',
    sync_accounting_docs: true,
    sync_personnel_docs: true,
    sync_fleet_docs: true,
    sync_inventory_photos: true,
    sync_backups: true,
    sync_mode: 'immediate',
    scheduled_start_time: '23:00',
    scheduled_end_time: '06:00',
    chunk_delay_seconds: 1,
    last_sync_at: '2026-10-05T06:00:00Z',
    last_error: null,
    stats: {
      total: 10,
      completed: 8,
      pending: 2,
      processing: 0,
      failed: 0
    }
  };

  beforeEach(() => {
    httpMock = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/queue/')) {
          return of({ results: [], count: 0 });
        }
        return of(mockConfig);
      }),
      patch: vi.fn().mockReturnValue(of({ success: true })),
      post: vi.fn().mockReturnValue(of({ success: true, message: 'انجام شد' }))
    };

    activeCompanyServiceMock = {
      activeCompany$: of({ id: 1, name: 'شرکت آزمایشی', code: 'COMP1' }),
      activeCompanySignal: signal({ id: 1, name: 'شرکت آزمایشی', code: 'COMP1' }),
      availableCompanies: [{ id: 1, name: 'شرکت آزمایشی', code: 'COMP1' }],
      availableCompanies$: of([{ id: 1, name: 'شرکت آزمایشی', code: 'COMP1' }]),
      loadAvailableCompanies: vi.fn().mockReturnValue(of([{ id: 1, name: 'شرکت آزمایشی', code: 'COMP1' }]))
    };

    toastServiceMock = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn()
    };

    confirmDialogMock = {
      open: vi.fn().mockResolvedValue(true)
    };

    const authServiceMock = {
      isSuperuser: signal(true)
    };

    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: httpMock },
        { provide: ActiveCompanyService, useValue: activeCompanyServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: ConfirmDialogService, useValue: confirmDialogMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ModuleRegistryService, useValue: { isModuleInstalled: () => true } }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new CompanyGdriveTabComponent();
    });
  });

  it('should initialize and load Google Drive configuration and queue', () => {
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith(expect.stringContaining('/personnel/companies/1/gdrive/'));
    expect(component.config()?.account_email).toBe('test@gmail.com');
    expect(component.config()?.is_connected).toBe(true);
    expect(component.config()?.worker_alive).toBe(true);
  });

  it('should call patch when updating a single category toggle with optimistic update', () => {
    component.config.set({ ...mockConfig });
    component.selectedCompanyId.set(1);
    component.updateConfigField('sync_accounting_docs', false);
    expect(component.config()?.sync_accounting_docs).toBe(false);
    expect(httpMock.patch).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/'),
      { sync_accounting_docs: false }
    );
  });

  it('should rollback configuration field when patch fails', () => {
    component.config.set({ ...mockConfig });
    component.selectedCompanyId.set(1);
    httpMock.patch.mockReturnValue(throwError(() => ({ error: { error: 'خطای سرور' } })));

    component.updateConfigField('sync_personnel_docs', false);

    expect(toastServiceMock.error).toHaveBeenCalled();
    expect(component.config()?.sync_personnel_docs).toBe(true);
  });

  it('should reject chunk_delay_seconds greater than 300', () => {
    component.config.set({ ...mockConfig });
    component.selectedCompanyId.set(1);
    component.updateConfigField('chunk_delay_seconds', 350);

    expect(toastServiceMock.error).toHaveBeenCalledWith('مکث بین فایل‌ها باید عددی بین ۰ تا ۳۰۰ ثانیه باشد.');
    expect(httpMock.patch).not.toHaveBeenCalled();
  });

  it('should reject scheduled_start_time equal to scheduled_end_time', () => {
    component.config.set({ ...mockConfig, scheduled_end_time: '23:00' });
    component.selectedCompanyId.set(1);
    component.updateConfigField('scheduled_start_time', '23:00');

    expect(toastServiceMock.error).toHaveBeenCalledWith('ساعت شروع و پایان ارسال ساعات خلوتی نمی‌تواند یکسان باشد.');
    expect(httpMock.patch).not.toHaveBeenCalled();
  });

  it('should change sync mode and update field', () => {
    component.config.set({ ...mockConfig });
    component.selectedCompanyId.set(1);
    component.setSyncMode('scheduled');
    expect(component.config()?.sync_mode).toBe('scheduled');
    expect(httpMock.patch).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/'),
      { sync_mode: 'scheduled' }
    );
  });

  it('should toggle is_enabled state', () => {
    component.config.set({ ...mockConfig, is_enabled: true });
    component.selectedCompanyId.set(1);
    component.toggleIsEnabled();
    expect(component.config()?.is_enabled).toBe(false);
    expect(httpMock.patch).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/'),
      { is_enabled: false }
    );
  });

  it('should call triggerManualSync and show success toast', () => {
    component.selectedCompanyId.set(1);
    component.triggerManualSync();
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/trigger-sync/'),
      {}
    );
    expect(toastServiceMock.success).toHaveBeenCalledWith('انجام شد');
  });

  it('should call syncAll endpoint when user clicks sync all', () => {
    component.selectedCompanyId.set(1);
    component.syncAllFiles();
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/sync-all/'),
      {}
    );
    expect(toastServiceMock.success).toHaveBeenCalledWith('انجام شد');
  });

  it('should open confirm dialog before disconnecting Google Drive', async () => {
    component.selectedCompanyId.set(1);
    await component.disconnectGoogleDrive();
    expect(confirmDialogMock.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'قطع اتصال حساب گوگل‌درایو',
        type: 'danger'
      })
    );
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/disconnect/'),
      {}
    );
  });

  it('should not disconnect Google Drive if user cancels dialog', async () => {
    confirmDialogMock.open.mockResolvedValueOnce(false);
    component.selectedCompanyId.set(1);
    await component.disconnectGoogleDrive();
    expect(httpMock.post).not.toHaveBeenCalled();
  });

  it('should toggle expanded task in accordion', () => {
    expect(component.isTaskExpanded(101)).toBe(false);
    component.toggleTaskExpand(101);
    expect(component.isTaskExpanded(101)).toBe(true);
    component.toggleTaskExpand(101);
    expect(component.isTaskExpanded(101)).toBe(false);
  });

  it('should return Persian model name properly', () => {
    expect(component.getModelNamePersian('ExpenseInvoice')).toBe(MODEL_NAME_PERSIAN_MAP['ExpenseInvoice']);
    expect(component.getModelNamePersian('CompanyDocument')).toBe(MODEL_NAME_PERSIAN_MAP['CompanyDocument']);
    expect(component.getModelNamePersian('Company', 'scan_all')).toBe('پیمایش سوابق');
    expect(component.getModelNamePersian('UnknownModel')).toBe('UnknownModel');
  });
});
