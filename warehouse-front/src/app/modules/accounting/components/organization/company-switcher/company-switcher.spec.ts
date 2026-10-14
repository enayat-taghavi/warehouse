// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Injector, runInInjectionContext, ElementRef, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { CompanySwitcherComponent } from './company-switcher';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';

describe('CompanySwitcherComponent', () => {
  let component: CompanySwitcherComponent;
  let mockCompanyService: any;
  let mockAuthService: any;
  let mockToast: any;
  let mockElementRef: any;
  let mockCdr: any;

  beforeEach(() => {
    mockCompanyService = {
      activeCompany: { id: 1, name: 'شرکت اول', code: 'C01' },
      availableCompanies: [{ id: 1, name: 'شرکت اول', code: 'C01' }],
      availableCompanies$: of([{ id: 1, name: 'شرکت اول', code: 'C01' }]),
      isSuperuser: false,
      isSuperuser$: of(false),
      selectCompany: vi.fn(),
      openSwitchModal: vi.fn(),
      loadAvailableCompanies: vi.fn().mockReturnValue(of({ companies: [{ id: 1, name: 'شرکت اول', code: 'C01' }] }))
    };

    mockAuthService = {
      user: vi.fn().mockReturnValue({ is_superuser: false, roles: [], permissions: [] }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockToast = {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn()
    };

    mockElementRef = {
      nativeElement: document.createElement('div')
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    const injector = Injector.create({
      providers: [
        { provide: ActiveCompanyService, useValue: mockCompanyService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ToastService, useValue: mockToast },
        { provide: ElementRef, useValue: mockElementRef },
        { provide: ChangeDetectorRef, useValue: mockCdr }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new CompanySwitcherComponent();
    });
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.restoreAllMocks();
  });

  it('باید برای کاربر تک‌شرکتی مقدار isMultiCompanyUser برابر false باشد', () => {
    mockCompanyService.availableCompanies = [{ id: 1, name: 'شرکت اول', code: 'C01' }];
    mockCompanyService.isSuperuser = false;

    expect(component.isMultiCompanyUser).toBe(false);
  });

  it('برای کاربر تک‌شرکتی متد toggleDropdown دراپ‌داون را باز نمی‌کند و پیام راهنما نمایش می‌دهد', () => {
    mockCompanyService.availableCompanies = [{ id: 1, name: 'شرکت اول', code: 'C01' }];
    mockCompanyService.isSuperuser = false;

    const mockEvent = { stopPropagation: vi.fn() } as any;
    component.toggleDropdown(mockEvent);

    expect(component.isOpen).toBe(false);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining('اختصاص دارد'));
  });

  it('برای کاربر چندشرکتی مقدار isMultiCompanyUser برابر true است و دراپ‌داون باز می‌شود', () => {
    mockCompanyService.availableCompanies = [
      { id: 1, name: 'شرکت اول', code: 'C01' },
      { id: 2, name: 'شرکت دوم', code: 'C02' }
    ];
    mockCompanyService.isSuperuser = false;

    expect(component.isMultiCompanyUser).toBe(true);

    const mockEvent = { stopPropagation: vi.fn() } as any;
    component.toggleDropdown(mockEvent);

    expect(component.isOpen).toBe(true);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });

  it('برای کاربر سوپریوزر حتی با ۱ شرکت هم isMultiCompanyUser برابر true است', () => {
    mockCompanyService.availableCompanies = [{ id: 1, name: 'شرکت اول', code: 'C01' }];
    mockCompanyService.isSuperuser = true;

    expect(component.isMultiCompanyUser).toBe(true);

    const mockEvent = { stopPropagation: vi.fn() } as any;
    component.toggleDropdown(mockEvent);

    expect(component.isOpen).toBe(true);
  });

  it('در ngOnInit اگر شرکت‌ها لود نشده باشند، اقدام به لود خودکار می‌کند', () => {
    mockCompanyService.availableCompanies = [];
    component.ngOnInit();

    expect(mockCompanyService.loadAvailableCompanies).toHaveBeenCalled();
    expect(mockCdr.markForCheck).toHaveBeenCalled();
  });

  it('در toggleDropdown اگر شرکت‌ها خالی باشند، استعلام گرفته و سپس باز می‌کند', () => {
    mockCompanyService.availableCompanies = [];
    mockCompanyService.loadAvailableCompanies.mockImplementation(() => {
      mockCompanyService.availableCompanies = [{ id: 1, name: 'C1' }, { id: 2, name: 'C2' }];
      return of({ companies: mockCompanyService.availableCompanies });
    });

    const mockEvent = { stopPropagation: vi.fn() } as any;
    component.toggleDropdown(mockEvent);

    expect(mockCompanyService.loadAvailableCompanies).toHaveBeenCalled();
    expect(component.isOpen).toBe(true);
  });
});
