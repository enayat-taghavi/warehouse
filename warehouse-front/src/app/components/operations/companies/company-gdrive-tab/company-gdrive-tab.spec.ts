// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runInInjectionContext, Injector, signal } from '@angular/core';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { CompanyGdriveTabComponent, GDriveConfigResponse } from './company-gdrive-tab';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ToastService } from '../../../../services/toast.service';

describe('CompanyGdriveTabComponent', () => {
  let component: CompanyGdriveTabComponent;
  let httpMock: any;
  let activeCompanyServiceMock: any;
  let toastServiceMock: any;

  const mockConfig: GDriveConfigResponse = {
    company_id: 1,
    company_name: 'شرکت آزمایشی',
    is_enabled: true,
    is_connected: true,
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

    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: httpMock },
        { provide: ActiveCompanyService, useValue: activeCompanyServiceMock },
        { provide: ToastService, useValue: toastServiceMock }
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
  });

  it('should call patch when updating category toggles', () => {
    component.config.set({ ...mockConfig });
    component.selectedCompanyId.set(1);
    component.updateToggles();
    expect(httpMock.patch).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/'),
      expect.objectContaining({ sync_accounting_docs: true, is_enabled: true, sync_mode: 'immediate' })
    );
  });

  it('should change sync mode and update toggles', () => {
    component.config.set({ ...mockConfig });
    component.selectedCompanyId.set(1);
    component.setSyncMode('scheduled');
    expect(component.config()?.sync_mode).toBe('scheduled');
    expect(httpMock.patch).toHaveBeenCalledWith(
      expect.stringContaining('/personnel/companies/1/gdrive/'),
      expect.objectContaining({ sync_mode: 'scheduled' })
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
});
