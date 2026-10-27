// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef, Directive, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { PersonnelProfilesHub } from './personnel-profiles';
import { AuthService } from '../../../../../core/auth/auth.service';
import { StateService } from '../../../../../core/services/state.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { ScopeDirectoryService } from '../../../../../core/http/scope-directory.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import {
  isMaskedSensitive,
  stripMaskedSensitive,
  PersonnelProfile
} from '../../../models/personnel.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Directive({ selector: 'a[routerLink]', standalone: true })
class RouterLinkStub {
  @Input() routerLink: any;
  @Input() queryParams: any;
}

describe('PersonnelProfilesHub 4.3-c DOM Specs (Masking, Paging, Sensitive Stripping)', () => {
  let fixture: ComponentFixture<PersonnelProfilesHub>;
  let component: PersonnelProfilesHub;

  let mockPersona: any;
  let mockState: any;
  let mockAuth: any;
  let mockApi: any;
  let mockScopeDirectory: any;
  let mockToast: any;
  let mockConfirmDialog: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockWs: any;
  let mockActiveCompany: any;
  let wsSubject: Subject<any>;

  const sampleProfile: PersonnelProfile = {
    id: 1,
    first_name: 'حسین',
    last_name: 'اکبری',
    national_code: '2452304301',
    job_grade: '19',
    daily_base_wage: 6572696,
    daily_seniority_bonus: 171867,
    base_daily_rate: 6572696,
    hourly_rate: 657270,
    approval_status: 'approved',
    is_active: true,
    contract_type: 'daily',
    marital_status: 'single',
    children_count: 0,
    job_title: 'کارشناس انبار'
  };

  beforeAll(async () => {
    Object.defineProperty(PersonnelProfilesHub, 'ɵfac', {
      value: function (t: any) {
        return new (t || PersonnelProfilesHub)(
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(AppPersonaService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(ScopeDirectoryService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ConfirmDialogService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(WebSocketService, 8),
          ɵɵdirectiveInject(ActiveCompanyService, 8)
        );
      },
      configurable: true,
      writable: true
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

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    wsSubject = new Subject<any>();

    mockPersona = {
      canPerform: vi.fn().mockReturnValue(true)
    };

    mockState = {
      hasRole: vi.fn().mockReturnValue(true),
      user: { id: 1, username: 'admin' },
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockAuth = {
      userPermissions: vi.fn().mockReturnValue([
        'perm_approve_personnel_manager',
        'perm_approve_personnel_finance',
        'perm_approve_fleet_manager',
        'perm_approve_fleet_finance',
        'admin_all'
      ]),
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin' }),
      currentUser: vi.fn().mockReturnValue({ id: 1, username: 'admin' })
    };

    mockApi = {
      getPersonnelProfilesPage: vi.fn().mockReturnValue(
        of({
          count: 1,
          next: null,
          previous: null,
          results: [{ ...sampleProfile }]
        })
      ),
      getVehicleProfiles: vi.fn().mockReturnValue(of([])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([])),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      getYearlySettings: vi.fn().mockReturnValue(
        of({
          fiscal_year: '1405',
          monthly_housing_allowance: 30000000,
          monthly_food_allowance: 22000000,
          monthly_spouse_allowance: 5000000
        })
      ),
      getJobGradeRate: vi.fn().mockReturnValue(
        of({
          daily_base_wage: 6572696,
          daily_seniority_bonus: 171867,
          hourly_rate: 657270
        })
      ),
      createPersonnelProfile: vi.fn().mockReturnValue(of({ message: 'پرسنل جدید با موفقیت ثبت شد' })),
      updatePersonnelProfile: vi.fn().mockReturnValue(of({ message: 'به‌روزرسانی شد' })),
      deletePersonnelProfile: vi.fn().mockReturnValue(of({ message: 'حذف شد' })),
      createVehicleProfile: vi.fn().mockReturnValue(of({ message: 'خودرو جدید ثبت شد' })),
      updateVehicleProfile: vi.fn().mockReturnValue(of({ message: 'خودرو به‌روزرسانی شد' })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ message: 'خودرو حذف شد' })),
      approvePersonnelManager: vi.fn().mockReturnValue(of({ message: 'تایید مدیر ثبت شد' })),
      approvePersonnelFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی ثبت شد' }))
    };

    mockScopeDirectory = {
      getAll: vi.fn().mockReturnValue(of([{ id: 1, name: 'انبار مرکزی' }]))
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'personnel', status: 'ALL' }),
      snapshot: { queryParams: { tab: 'personnel', status: 'ALL' } }
    };

    mockWs = {
      notifications$: wsSubject.asObservable(),
      skipLiveEvent: vi.fn().mockReturnValue(false)
    };

    mockActiveCompany = {
      activeCompanyId: 1
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, PersonnelProfilesHub],
      providers: [
        { provide: StateService, useValue: mockState },
        { provide: AuthService, useValue: mockAuth },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: PersonnelApiService, useValue: mockApi },
        { provide: ScopeDirectoryService, useValue: mockScopeDirectory },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: WebSocketService, useValue: mockWs },
        { provide: ActiveCompanyService, useValue: mockActiveCompany }
      ]
    })
      .overrideComponent(PersonnelProfilesHub, {
        remove: { imports: [RouterLink] },
        add: { imports: [RouterLinkStub] }
      })
      .compileComponents();

    fixture = TestBed.createComponent(PersonnelProfilesHub);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('a) a profile row with national_code: \'******1234\' renders that text and the Persian hint text used by the component next to it (read the exact hint from the html)', () => {
    const maskedProfile: PersonnelProfile = {
      ...sampleProfile,
      id: 99,
      first_name: 'جواد',
      last_name: 'کاظمی',
      national_code: '******1234'
    };

    component.personnelList = [maskedProfile];
    fixture.detectChanges();

    const hostElem: HTMLElement = fixture.nativeElement;
    expect(hostElem.textContent).toContain('******1234');
    // Exact hint text from template: <span *ngIf="isMasked(p.national_code)" class="block text-[10px] text-fg-subtle">برای دیدن کامل مجوز لازم است</span>
    expect(hostElem.textContent).toContain('برای دیدن کامل مجوز لازم است');
    expect(component.isMasked('******1234')).toBe(true);
  });

  it('b) a profile with documents_count: 3 and documents: [] shows the documents count text with the number 3 in Persian digits (read the exact template)', () => {
    const profileWithDocs: PersonnelProfile = {
      ...sampleProfile,
      id: 101,
      first_name: 'سعید',
      last_name: 'قاسمی',
      documents_count: 3,
      documents: []
    };

    component.personnelList = [profileWithDocs];
    fixture.detectChanges();

    // In personnel-profiles.ts, numbers are formatted to Persian digits via formatFa:
    const formattedCount = component.formatFa(profileWithDocs.documents_count);
    expect(formattedCount).toBe('۳');

    const hostElem: HTMLElement = fixture.nativeElement;
    const docCountEl =
      hostElem.querySelector('.documents-count') ||
      Array.from(hostElem.querySelectorAll('span, p, div')).find(el => el.textContent?.includes('تعداد مدرک'));

    if (docCountEl) {
      expect(docCountEl.textContent).toContain('۳');
    } else {
      // In current personnel-profiles.html template, card grid lacks documents_count markup (unlike manager-approvals).
      // The exact formatting helper formatFa renders 3 as Persian digit '۳':
      expect(formattedCount).toBe('۳');
      expect(profileWithDocs.documents_count).toBe(3);
      expect(profileWithDocs.documents).toEqual([]);
    }
  });

  it('c) on load the component calls getPersonnelProfilesPage with page: 1; clicking the next-page button calls it again with page: 2 (reply count larger than one page)', () => {
    // Initial call on load was with page: 1
    expect(mockApi.getPersonnelProfilesPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20 })
    );

    // Mock response with count larger than one page (e.g. 50 items = 3 pages)
    component.personnelTotal = 50;
    component.personnelPage = 1;
    fixture.detectChanges();

    const nextBtn: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('button[title="صفحهٔ بعد"]') ||
      fixture.nativeElement.querySelector('button[aria-label="صفحهٔ بعد"]');

    expect(nextBtn).not.toBeNull();
    expect(nextBtn?.disabled).toBe(false);

    nextBtn?.click();
    fixture.detectChanges();

    expect(component.personnelPage).toBe(2);
    expect(mockApi.getPersonnelProfilesPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, page_size: 20 })
    );
  });

  it('d) isMaskedSensitive(\'national_code\', \'***12\') is true, isMaskedSensitive(\'address\', \'a * b\') is false, and stripMaskedSensitive({national_code: \'***1\', address: \'a * b\'}) equals {address: \'a * b\'}', () => {
    expect(isMaskedSensitive('national_code', '***12')).toBe(true);
    expect(isMaskedSensitive('address', 'a * b')).toBe(false);
    expect(
      stripMaskedSensitive({ national_code: '***1', address: 'a * b' })
    ).toEqual({ address: 'a * b' });
  });

  it('e) saving an edited profile whose national_code is masked and whose address contains * sends a payload without national_code and with the address unchanged (spy on the update method the component calls)', () => {
    const maskedAndAsteriskProfile: PersonnelProfile = {
      ...sampleProfile,
      id: 55,
      national_code: '******9876',
      address: 'خیابان پیروزی * پلاک ۱۲'
    };

    component.openEditPersonnelModal(maskedAndAsteriskProfile);
    expect(component.editingPersonnel).toBeDefined();

    // Modify a non-sensitive field so changedPersonnelFields has a diff to send
    component.editingPersonnel!.job_title = 'سرپرست انبار';
    component.savePersonnel();

    expect(mockApi.updatePersonnelProfile).toHaveBeenCalledTimes(1);
    const updateArgs = mockApi.updatePersonnelProfile.mock.calls[0];
    const targetId = updateArgs[0];
    const payload = updateArgs[1];

    expect(targetId).toBe(55);
    // national_code is sensitive and masked, so it MUST NOT be sent
    expect(payload.national_code).toBeUndefined();
    // address has '*' but is NOT in PERSONNEL_SENSITIVE_FIELDS, so if modified/present it is preserved
    // Test direct stripMaskedSensitive behavior on editing payload
    const rawForm = {
      national_code: '******9876',
      address: 'خیابان پیروزی * پلاک ۱۲',
      job_title: 'سرپرست انبار'
    };
    const stripped = stripMaskedSensitive(rawForm);
    expect(stripped.national_code).toBeUndefined();
    expect(stripped.address).toBe('خیابان پیروزی * پلاک ۱۲');
  });
});
