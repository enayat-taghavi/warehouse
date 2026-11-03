// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { CompanySelectionModalComponent } from './company-selection-modal';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { Company } from '../../../../../core/models/company.model';

describe('CompanySelectionModalComponent', () => {
  let component: CompanySelectionModalComponent;
  let mockCompanyService: any;

  beforeEach(() => {
    mockCompanyService = {
      isModalOpen$: of(true),
      availableCompanies$: of([{ id: 1, name: 'شرکت ۱', code: 'C1' }]),
      selectCompany: vi.fn(),
      switchCompany: vi.fn().mockResolvedValue(true),
      closeSwitchModal: vi.fn(),
    };

    const injector = Injector.create({
      providers: [
        { provide: ActiveCompanyService, useValue: mockCompanyService },
      ]
    });

    runInInjectionContext(injector, () => {
      component = new CompanySelectionModalComponent();
    });
  });

  it('با متد onSelect باید شرکت انتخابی به switchCompany (تعویض با بارگذاری دوباره) ارسال شود', () => {
    const comp: Company = { id: 2, name: 'شرکت ۲', code: 'C2' } as Company;
    component.onSelect(comp);
    expect(mockCompanyService.switchCompany).toHaveBeenCalledWith(comp);
  });

  it('با متد onClose باید closeSwitchModal فراخوانی شود', () => {
    component.onClose();
    expect(mockCompanyService.closeSwitchModal).toHaveBeenCalledTimes(1);
  });
});
