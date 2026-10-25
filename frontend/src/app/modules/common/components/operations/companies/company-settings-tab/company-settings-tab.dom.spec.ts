// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';

import { CompanySettingsTabComponent, CompanySettingItem } from './company-settings-tab.component';
import { ApiService } from '../../../../../../core/api/api.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanySettingsTabComponent DOM Spec', () => {
  let fixture: ComponentFixture<CompanySettingsTabComponent>;
  let component: CompanySettingsTabComponent;
  let api: {
    get: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const sampleResults: CompanySettingItem[] = [
    {
      module: 'zzmod',
      key: 'flag',
      type: 'bool',
      title_fa: 'Flag',
      default: false,
      value: false,
      is_default: true,
      can_edit: true
    },
    {
      module: 'zzmod',
      key: 'limit',
      type: 'int',
      title_fa: 'Limit',
      default: 5,
      value: 5,
      is_default: true,
      can_edit: false
    }
  ];

  beforeEach(async () => {
    api = {
      get: vi.fn().mockReturnValue(of({ company_id: 3, results: sampleResults })),
      patch: vi.fn().mockReturnValue(of({}))
    };
    toast = {
      success: vi.fn(),
      error: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CompanySettingsTabComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function createComponent(results: CompanySettingItem[] = sampleResults): Promise<void> {
    api.get.mockReturnValue(of({ company_id: 3, results }));
    fixture = TestBed.createComponent(CompanySettingsTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('loads settings of the company', async () => {
    await createComponent();
    expect(api.get).toHaveBeenCalledWith('settings/company/3');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Flag');
    expect(text).toContain('Limit');
  });

  it('shows empty state', async () => {
    await createComponent([]);
    expect(fixture.nativeElement.textContent).toContain('هنوز هیچ ماژولی تنظیمی برای شرکت اعلام نکرده است.');
  });

  it('read only row is disabled', async () => {
    await createComponent();
    const limitInput = fixture.nativeElement.querySelector('input[aria-label="Limit"]') as HTMLInputElement;
    expect(limitInput).toBeTruthy();
    expect(limitInput.disabled).toBe(true);
  });

  it('toggle sends patch', async () => {
    await createComponent();
    const flagRow = component.groups[0].rows.find((r) => r.key === 'flag')!;
    component.onToggle(flagRow, true);
    await fixture.whenStable();
    expect(api.patch).toHaveBeenCalledWith('settings/company/3', {
      module: 'zzmod',
      key: 'flag',
      value: true
    });
  });

  it('shows server detail on error', async () => {
    await createComponent();
    api.patch.mockReturnValue(throwError(() => ({ error: { detail: 'bad' } })));

    const flagRow = component.groups[0].rows.find((r) => r.key === 'flag')!;
    component.onToggle(flagRow, true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('bad');
    expect(flagRow.draft).toBe(false);
  });
});
