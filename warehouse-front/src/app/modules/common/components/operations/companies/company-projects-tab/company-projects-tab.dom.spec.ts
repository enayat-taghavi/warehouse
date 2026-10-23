// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { CompanyProjectsTabComponent } from './company-projects-tab';
import { OrgStructureApiService } from '../../../../../../core/api/org-structure-api.service';
import { AccountsHttpService, User } from '../../../../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { SectionRoleSpec } from '../../../../../../core/modules/module-contract';
import { OrgProject, OrgProjectSection, OrgSectionAssignment } from '../../../../../../core/models/company.model';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { OfflineSyncService } from '../../../../../../core/services/offline-sync.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const user = (id: number, username: string, first: string, last: string): User => ({
  id, username, first_name: first, last_name: last, email: `${username}@example.com`, national_code: '', phone_number: '',
  operational_zone: '', supervisor: null, is_active: true, groups: [], assigned_warehouses: [], roles: []
} as User);

const userA = user(101, 'user_a', 'علی', 'اکبری');
const userB = user(102, 'user_b', 'رضا', 'بهرامی');
const userC = user(103, 'user_c', 'محمد', 'سجادی');

const ROLES: SectionRoleSpec[] = [
  { key: 'manager', labelFa: 'مدیران (تایید نهایی)', shortLabelFa: 'مدیران', icon: 'crown', tone: 'purple', order: 10, missingWarningFa: 'فاقد مدیر' },
  { key: 'employee', labelFa: 'کارمندان', shortLabelFa: 'کارمندان', icon: 'user', tone: 'slate', order: 20 }
];

describe('CompanyProjectsTabComponent (تب «پروژه‌ها و بخش‌ها»ی استودیوی شرکت)', () => {
  let fixture: ComponentFixture<CompanyProjectsTabComponent>;
  let component: CompanyProjectsTabComponent;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let accountsHttp: { getUsers: ReturnType<typeof vi.fn> };
  let toast: Record<string, ReturnType<typeof vi.fn>>;
  let registry: { getExtensions: ReturnType<typeof vi.fn> };
  let notifications$: Subject<any>;
  let router: { navigate: ReturnType<typeof vi.fn> };

  const projects: OrgProject[] = [{ id: 1, company: 7, code: 'PRJ-1', name: 'پروژه مرکزی', description: 'توضیحات', is_active: true, sections_count: 1 }];
  const sections: OrgProjectSection[] = [{ id: 1, project: 1, project_name: 'پروژه مرکزی', code: 'SEC-1', name: 'بخش عمران و توزیع', is_active: true }];
  let assignments: OrgSectionAssignment[];

  async function create(canWrite = true, roles: SectionRoleSpec[] = ROLES): Promise<ComponentFixture<CompanyProjectsTabComponent>> {
    registry.getExtensions.mockReturnValue(roles.length ? [{ moduleCode: 'mod', extension: { sectionRoles: roles } }] : []);
    const f = TestBed.createComponent(CompanyProjectsTabComponent);
    f.componentRef.setInput('companyId', 7);
    f.componentRef.setInput('canWrite', canWrite);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  function openQuickAssign(f: ComponentFixture<CompanyProjectsTabComponent>): void {
    const tab = Array.from(f.nativeElement.querySelectorAll('button[role="tab"]') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('انتساب'));
    tab!.click();
    f.detectChanges();
    f.componentInstance.expandAllSections();
    f.detectChanges();
    const add = Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.getAttribute('appaction') === 'create' && b.textContent?.includes('کارمندان'));
    add!.click();
    f.detectChanges();
  }

  beforeAll(() => {
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    window.URL.revokeObjectURL = vi.fn();
  });

  beforeEach(async () => {
    assignments = [];
    api = {
      getProjects: vi.fn().mockReturnValue(of(projects)),
      getSections: vi.fn().mockReturnValue(of(sections)),
      getAssignments: vi.fn().mockImplementation(() => of(assignments)),
      createProject: vi.fn().mockImplementation((p: any) => of({ id: 2, ...p })),
      updateProject: vi.fn().mockImplementation((id: number, p: any) => of({ id, ...p })),
      deleteProject: vi.fn().mockReturnValue(of(null)),
      createSection: vi.fn().mockImplementation((s: any) => of({ id: 2, project_name: 'پروژه مرکزی', ...s })),
      updateSection: vi.fn(),
      deleteSection: vi.fn().mockReturnValue(of(null)),
      bulkAssign: vi.fn().mockReturnValue(of([])),
      updateAssignment: vi.fn(),
      deleteAssignment: vi.fn(),
      cloneSectionAssignments: vi.fn(),
      exportProjectsExcel: vi.fn().mockReturnValue(of(new Blob())),
      exportSectionsExcel: vi.fn().mockReturnValue(of(new Blob())),
      exportAssignmentsExcel: vi.fn().mockReturnValue(of(new Blob()))
    };
    accountsHttp = { getUsers: vi.fn().mockReturnValue(of([userA, userB])) };
    toast = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    registry = { getExtensions: vi.fn() };
    notifications$ = new Subject();
    router = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [CompanyProjectsTabComponent],
      providers: [
        { provide: OrgStructureApiService, useValue: api },
        { provide: AccountsHttpService, useValue: accountsHttp },
        { provide: WebSocketService, useValue: { connect: vi.fn(), notifications$, tabId: 'tab-1' } },
        { provide: ToastService, useValue: toast },
        { provide: ModuleRegistryService, useValue: registry },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = await create();
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('همهٔ فهرست‌ها فقط برای شرکت همین استودیو (company_id) دریافت می‌شوند', () => {
    expect(api['getProjects']).toHaveBeenCalledWith(undefined, 7);
    expect(api['getSections']).toHaveBeenCalledWith(undefined, 7);
    expect(api['getAssignments']).toHaveBeenCalledWith(undefined, false, 7);
    expect(fixture.nativeElement.textContent).toContain('پروژه مرکزی');
  });

  it('a) کاربران A و B که getUsers برگرداند در فهرست انتساب دیده می‌شوند', () => {
    openQuickAssign(fixture);
    const text = (document.body.textContent || '') + fixture.nativeElement.textContent;
    expect(text).toContain('علی اکبری');
    expect(text).toContain('user_a');
    expect(text).toContain('رضا بهرامی');
    expect(text).toContain('user_b');
  });

  it('b) کاربر C که API برنگرداند هرگز دیده نمی‌شود', () => {
    openQuickAssign(fixture);
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain(userC.first_name);
    expect(text).not.toContain(userC.username);
  });

  it('c) getUsers یک بار و بی آرگومان صدا زده می‌شود', () => {
    expect(accountsHttp.getUsers).toHaveBeenCalledTimes(1);
    expect(accountsHttp.getUsers).toHaveBeenCalledWith();
  });

  it('d) خطای getUsers پیام «خطا در دریافت لیست کاربران» می‌دهد و تب همچنان رندر می‌شود', async () => {
    accountsHttp.getUsers.mockReturnValue(throwError(() => ({ status: 400 })));
    const f = await create();
    expect(toast['show']).toHaveBeenCalledWith('error', expect.stringContaining('خطا در دریافت لیست کاربران'));
    expect(f.nativeElement.querySelector('app-tab-bar')).toBeTruthy();
    expect(f.nativeElement.textContent).toContain('پروژه‌ها');
    f.destroy();
  });

  it('e) فهرست تهی کاربران بی خطا رندر و پیام نبود کاربر نشان داده می‌شود', async () => {
    accountsHttp.getUsers.mockReturnValue(of([]));
    const f = await create();
    openQuickAssign(f);
    expect(f.nativeElement.textContent).toContain('کاربری برای انتساب یافت نشد');
    f.destroy();
  });

  it('f) پس از «بارگذاری دوباره» کاربران A و B هنوز در فهرست انتساب هستند', () => {
    openQuickAssign(fixture);
    const refresh = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.getAttribute('appaction') === 'refresh')!;
    refresh.click();
    fixture.detectChanges();
    expect(api['getProjects']).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('علی اکبری');
    expect(fixture.nativeElement.textContent).toContain('رضا بهرامی');
  });

  it('ثبت پروژهٔ تازه زیر شرکت همین استودیو و ثبت بخش و فیلتر جستجو', () => {
    component.newProject = { name: 'پروژه پایانه', code: 'bnd-۱', description: '', is_active: true };
    component.saveProject();
    expect(api['createProject']).toHaveBeenCalledWith(expect.objectContaining({ name: 'پروژه پایانه', code: 'BND-1', company: 7 }));
    expect(toast['success']).toHaveBeenCalledWith(expect.stringContaining('پروژه'));
    expect(component.projects.length).toBe(2);

    component.switchSubTab('sections');
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { sub: 'sections' } }));
    component.newSection = { name: 'واحد کنترل کیفیت', code: 'QC', project: 1, is_active: true };
    component.saveSection();
    expect(api['createSection']).toHaveBeenCalledWith(expect.objectContaining({ name: 'واحد کنترل کیفیت', code: 'QC', project: 1 }));

    component.sectionSearchQuery = 'عمران';
    expect(component.filteredSections.length).toBe(1);
    component.sectionSearchQuery = 'ناموجود';
    expect(component.filteredSections.length).toBe(0);
  });

  it('سطح «خواندن»: فرم و دکمه‌های نوشتن دیده نمی‌شوند و نوشتن صدا زده نمی‌شود', async () => {
    const f = await create(false);
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('button[appaction="edit"]')).toBeNull();
    expect(el.querySelector('button[appaction="import-excel"]')).toBeNull();
    expect(el.textContent).toContain('فقط خواندنی');
    f.componentInstance.newProject = { code: 'X', name: 'Y', is_active: true };
    f.componentInstance.saveProject();
    expect(api['createProject']).not.toHaveBeenCalled();
    f.destroy();
  });

  it('بی نقشِ اعلام‌شده از ماژول‌ها زیرتب انتساب نمایش داده نمی‌شود', async () => {
    const f = await create(true, []);
    const tabs = Array.from(f.nativeElement.querySelectorAll('button[role="tab"]') as NodeListOf<HTMLButtonElement>).map(b => b.textContent || '');
    expect(tabs.some(t => t.includes('انتساب'))).toBe(false);
    f.destroy();
  });

  it('هشدار «فاقد مدیر» برای بخش بی انتساب فعالِ نقشِ دارای هشدار', () => {
    expect(component.groupedAssignmentsBySection[0].missingWarnings).toEqual(['فاقد مدیر']);
  });

  it('رویداد بلادرنگ شرکت دیگر فهرست این شرکت را دوباره دریافت نمی‌کند', () => {
    api['getProjects'].mockClear();
    notifications$.next({ type_str: 'org_structure_updated', entity_type: 'project', company_id: 99 });
    expect(api['getProjects']).not.toHaveBeenCalled();
    notifications$.next({ type_str: 'org_structure_updated', entity_type: 'project', company_id: 7 });
    expect(api['getProjects']).toHaveBeenCalledWith(undefined, 7);
  });

  it('آفلاین (پاسخ صف خوش‌بینانه): کش ابطال نمی‌شود، فهرست دوباره دریافت نمی‌شود و ردیف محلی «در صف» دیده می‌شود', async () => {
    const invalidate = vi.spyOn(OfflineSyncService.getInstance(), 'invalidateCache');
    api['createProject'].mockImplementation((p: any) => of({ ...p, id: -11, _tempId: -11, _offlinePending: true }));
    api['deleteProject'].mockReturnValue(of({ id: -12, _offlinePending: true }));
    api['getProjects'].mockClear();

    component.newProject = { name: 'پروژه آفلاین', code: 'OFF-1', description: '', is_active: true };
    component.saveProject();
    expect(component.projects.some(p => p.id === -11 && p._offlinePending)).toBe(true);
    expect(toast['info']).toHaveBeenCalled();

    await component.deleteProject(projects[0]);
    expect(component.projects.some(p => p.id === 1)).toBe(false);
    expect(component.sections.some(s => s.project === 1)).toBe(false);

    expect(invalidate).not.toHaveBeenCalled();
    expect(api['getProjects']).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('در صف ارسال');
    invalidate.mockRestore();
  });

  it('آنلاین: پس از حذف، فهرست تازه از سرور دریافت می‌شود و کش با دست ابطال نمی‌شود', async () => {
    const invalidate = vi.spyOn(OfflineSyncService.getInstance(), 'invalidateCache');
    api['getProjects'].mockClear();
    await component.deleteProject(projects[0]);
    expect(api['getProjects']).toHaveBeenCalledWith(undefined, 7);
    expect(invalidate).not.toHaveBeenCalled();
    invalidate.mockRestore();
  });

  it('?sub=assignments بی نقشِ اعلام‌شده به زیرتب پروژه‌ها برمی‌گردد', async () => {
    const route = TestBed.inject(ActivatedRoute) as any;
    route.snapshot.queryParamMap.get = () => 'assignments';
    const f = await create(true, []);
    expect(f.componentInstance.activeSubTab).toBe('projects');
    f.destroy();
  });

  it('خطای دریافت فهرست حالت خطا با «تلاش دوباره» نشان می‌دهد', async () => {
    api['getProjects'].mockReturnValue(throwError(() => ({ status: 500, error: { detail: 'x' } })));
    const f = await create();
    expect(f.componentInstance.loadError).toBe(true);
    expect(f.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('تلاش دوباره');
    f.destroy();
  });
});
