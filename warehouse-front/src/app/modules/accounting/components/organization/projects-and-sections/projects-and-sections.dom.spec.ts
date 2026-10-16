// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ProjectsAndSectionsComponent } from './projects-and-sections';
import { AuthService } from '../../../../../core/auth/auth.service';
import { StateService } from '../../../../../core/services/state.service';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { AccountsHttpService, User } from '../../../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { FinancialProject, ProjectSection, UserSectionAssignment } from '../../../models/personnel.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ProjectsAndSectionsComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<ProjectsAndSectionsComponent>;
  let component: ProjectsAndSectionsComponent;

  let mockAuth: any;
  let mockState: any;
  let mockPersonnelApi: any;
  let mockAccountsHttp: any;
  let mockWebSocket: any;
  let mockToast: any;
  let mockRoute: any;
  let mockRouter: any;
  let mockActiveCompanyService: any;

  const userA: User = {
    id: 101,
    username: 'user_a',
    first_name: 'علی',
    last_name: 'اکبری',
    email: 'a@example.com',
    national_code: '1234567890',
    phone_number: '09120000001',
    operational_zone: 'Zone 1',
    supervisor: null,
    is_active: true,
    groups: [],
    assigned_warehouses: [],
    roles: ['employee']
  };

  const userB: User = {
    id: 102,
    username: 'user_b',
    first_name: 'رضا',
    last_name: 'بهرامی',
    email: 'b@example.com',
    national_code: '1234567891',
    phone_number: '09120000002',
    operational_zone: 'Zone 1',
    supervisor: null,
    is_active: true,
    groups: [],
    assigned_warehouses: [],
    roles: ['employee']
  };

  const userC: User = {
    id: 103,
    username: 'user_c',
    first_name: 'محمد',
    last_name: 'سجادی',
    email: 'c@example.com',
    national_code: '1234567892',
    phone_number: '09120000003',
    operational_zone: 'Zone 1',
    supervisor: null,
    is_active: true,
    groups: [],
    assigned_warehouses: [],
    roles: ['employee']
  };

  const mockProjects: FinancialProject[] = [
    {
      id: 1,
      code: 'PRJ-1',
      name: 'پروژه مرکزی',
      description: 'توضیحات پروژه مرکزی',
      is_active: true
    }
  ];

  const mockSections: ProjectSection[] = [
    {
      id: 1,
      project: 1,
      project_name: 'پروژه مرکزی',
      code: 'SEC-1',
      name: 'بخش عملیات و توزیع',
      is_active: true
    }
  ];

  const mockAssignments: UserSectionAssignment[] = [];

  function openUserDirectoryModal(targetFixture: ComponentFixture<ProjectsAndSectionsComponent>): void {
    // ۱. کلیک روی تب انتساب کاربران و نقش‌ها در هدر نوار تب‌ها
    const tabButtons = targetFixture.nativeElement.querySelectorAll('button[role="tab"]');
    const assignmentsTab = Array.from(tabButtons).find((btn: any) =>
      btn.textContent?.includes('انتساب')
    ) as HTMLButtonElement | undefined;

    if (assignmentsTab) {
      assignmentsTab.click();
    } else {
      targetFixture.componentInstance.switchSubTab('assignments');
    }
    targetFixture.detectChanges();

    // ۲. کلیک روی دکمه باز کردن همه بخش‌ها
    const expandBtn = Array.from(targetFixture.nativeElement.querySelectorAll('button')).find((b: any) =>
      b.textContent?.includes('باز کردن همه')
    ) as HTMLButtonElement | undefined;

    if (expandBtn) {
      expandBtn.click();
    } else {
      targetFixture.componentInstance.expandAllSections();
    }
    targetFixture.detectChanges();

    // ۳. کلیک روی دکمه افزودن کاربر در کارت نقش جهت باز شدن مدال انتساب
    const addBtn = Array.from(targetFixture.nativeElement.querySelectorAll('button')).find((b: any) =>
      b.getAttribute('appaction') === 'create' || b.textContent?.includes('افزودن')
    ) as HTMLButtonElement | undefined;

    if (addBtn) {
      addBtn.click();
    } else if (targetFixture.componentInstance.projectSections.length > 0) {
      targetFixture.componentInstance.openQuickAssignModal(
        targetFixture.componentInstance.projectSections[0],
        'employee'
      );
    }
    targetFixture.detectChanges();
  }

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

    window.scrollTo = vi.fn();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:4200/test-blob');
    window.URL.revokeObjectURL = vi.fn();
  });

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 10, username: 'org_admin', is_superuser: false, roles: [] }),
      userPermissions: vi.fn().mockReturnValue(['perm_manage_projects_sections']),
      isSuperuser: vi.fn().mockReturnValue(false),
      isLoggedIn: vi.fn().mockReturnValue(true)
    };

    mockState = {
      appState: { activeWarehouseId: 'ALL' },
      selectedWarehouseId: vi.fn().mockReturnValue(null)
    };

    mockPersonnelApi = {
      getFinancialProjects: vi.fn().mockReturnValue(of(mockProjects)),
      getProjectSections: vi.fn().mockReturnValue(of(mockSections)),
      getUserSectionAssignments: vi.fn().mockReturnValue(of(mockAssignments)),
      bulkAssignUsersToSection: vi.fn().mockReturnValue(of([])),
      cloneSectionAssignments: vi.fn().mockReturnValue(of({ message: 'OK' })),
      updateUserSectionAssignment: vi.fn().mockReturnValue(of({})),
      deleteUserSectionAssignment: vi.fn().mockReturnValue(of(null)),
      exportFinancialProjectsExcel: vi.fn().mockReturnValue(of(new Blob())),
      importFinancialProjectsExcel: vi.fn().mockReturnValue(of({ success: true })),
      downloadFinancialProjectsTemplate: vi.fn().mockReturnValue(of(new Blob())),
      downloadProjectSectionsTemplate: vi.fn().mockReturnValue(of(new Blob())),
      downloadUserSectionAssignmentsTemplate: vi.fn().mockReturnValue(of(new Blob())),
      createFinancialProject: vi.fn().mockReturnValue(of({})),
      updateFinancialProject: vi.fn().mockReturnValue(of({})),
      deleteFinancialProject: vi.fn().mockReturnValue(of(null)),
      createProjectSection: vi.fn().mockReturnValue(of({})),
      updateProjectSection: vi.fn().mockReturnValue(of({})),
      deleteProjectSection: vi.fn().mockReturnValue(of(null))
    };

    mockAccountsHttp = {
      getUsers: vi.fn().mockReturnValue(of([userA, userB]))
    };

    mockWebSocket = {
      connect: vi.fn(),
      notifications$: of(),
      tabId: 'test-tab-id'
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockRoute = {
      queryParams: of({}),
      snapshot: {
        queryParams: {}
      }
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
      events: of()
    };

    mockActiveCompanyService = {
      activeCompany$: of(null),
      activeCompanyId: 1,
      availableCompanies: []
    };

    await TestBed.configureTestingModule({
      imports: [ProjectsAndSectionsComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: AccountsHttpService, useValue: mockAccountsHttp },
        { provide: WebSocketService, useValue: mockWebSocket },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectsAndSectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('a) For the org admin, after getUsers() returns users A and B, the user directory shows A and B (by the name field the template renders)', () => {
    openUserDirectoryModal(fixture);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('علی اکبری');
    expect(compiled.textContent).toContain('user_a');
    expect(compiled.textContent).toContain('رضا بهرامی');
    expect(compiled.textContent).toContain('user_b');
  });

  it('b) A user C that the API did not return never appears in fixture.nativeElement.textContent', () => {
    openUserDirectoryModal(fixture);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain(userC.first_name);
    expect(compiled.textContent).not.toContain(userC.last_name);
    expect(compiled.textContent).not.toContain(userC.username);
  });

  it('c) getUsers() is called exactly once on init, without a has_perm argument (as today)', () => {
    expect(mockAccountsHttp.getUsers).toHaveBeenCalledTimes(1);
    expect(mockAccountsHttp.getUsers).toHaveBeenCalledWith();
  });

  it('d) When getUsers() errors, the mocked toast receives "error" and a message containing «خطا در دریافت لیست کاربران», and the page header still renders', async () => {
    mockAccountsHttp.getUsers.mockReturnValue(throwError(() => new Error('Server connection error')));

    const errFixture = TestBed.createComponent(ProjectsAndSectionsComponent);
    errFixture.detectChanges();
    await errFixture.whenStable();

    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('خطا در دریافت لیست کاربران')
    );

    const header = errFixture.nativeElement.querySelector('app-command-center');
    expect(header).toBeTruthy();
    expect(errFixture.nativeElement.textContent).toContain('پروژه‌های مالی');

    errFixture.destroy();
  });

  it('e) An empty user list renders without throwing and shows no user entries', async () => {
    mockAccountsHttp.getUsers.mockReturnValue(of([]));

    const emptyFixture = TestBed.createComponent(ProjectsAndSectionsComponent);
    emptyFixture.detectChanges();
    await emptyFixture.whenStable();

    openUserDirectoryModal(emptyFixture);

    const compiled = emptyFixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('کاربری برای انتساب یافت نشد');

    const renderedUserCards = compiled.querySelectorAll('.max-h-52 .cursor-pointer');
    expect(renderedUserCards.length).toBe(0);

    emptyFixture.destroy();
  });

  it('f) After the public flow that refreshes assignments runs (the one the template triggers), users A and B are still shown', () => {
    openUserDirectoryModal(fixture);

    // ۱. بررسی نمایش کاربران A و B پیش از بازخوانی
    expect(fixture.nativeElement.textContent).toContain('علی اکبری');
    expect(fixture.nativeElement.textContent).toContain('رضا بهرامی');

    // ۲. اجرای فرایند عمومی بازخوانی از طریق دکمه بروزرسانی اطلاعات در سربرگ (همان جریانی که قالب فعال می‌کند)
    const refreshBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b: any) =>
      b.getAttribute('appaction') === 'refresh'
    ) as HTMLButtonElement | undefined;

    if (refreshBtn) {
      refreshBtn.click();
    } else {
      component.loadAllData();
    }
    fixture.detectChanges();

    // ۳. بررسی ماندگاری و نمایش کاربران A و B در دایرکتوری پس از بازخوانی
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('علی اکبری');
    expect(compiled.textContent).toContain('رضا بهرامی');
  });
});
