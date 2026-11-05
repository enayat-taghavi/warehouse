// @vitest-environment jsdom
import '@angular/compiler';
import { Component, forwardRef, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { of, EMPTY } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { PettyCashPageComponent } from './petty-cash-page';
import { PettyRole } from './petty-cash-page.config';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PermissionService } from '../../../../../core/services/permission.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { PettyAccountManagerComponent } from '../accountant/accountant-petty-cash/petty-account-manager/petty-account-manager';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  selector: 'app-petty-account-manager',
  standalone: true,
  template: '<div class="stub-petty-account-manager">استاب مدیریت حساب‌های تنخواه</div>',
  providers: [
    { provide: PettyAccountManagerComponent, useExisting: forwardRef(() => StubPettyAccountManagerComponent) }
  ]
})
class StubPettyAccountManagerComponent {
  load = vi.fn();
  openCreate = vi.fn();
}

interface TestContext {
  fixture: ComponentFixture<PettyCashPageComponent>;
  component: PettyCashPageComponent;
  el: HTMLElement;
  api: any;
  toast: any;
  router: any;
}

async function createPage(
  role: PettyRole = 'accountant',
  queryParams: Record<string, any> = {}
): Promise<TestContext> {
  const mockApi = {
    getMySections: vi.fn().mockReturnValue(of([
      { id: 10, name: 'بخش کارگاهی ۱', project_name: 'پروژه الف' }
    ])),
    getProjectSections: vi.fn().mockReturnValue(of([
      { id: 10, name: 'بخش کارگاهی ۱', project_name: 'پروژه الف' }
    ])),
    getPettyCashTransactions: vi.fn().mockReturnValue(of([
      {
        id: 1,
        status: 'pending_accountant',
        amount: 1000000,
        title: 'تنخواه ۱',
        custodian_name: 'علی احمدی',
        section_name: 'بخش کارگاهی ۱',
        category: 'تدارکات'
      },
      {
        id: 2,
        status: 'pending_manager',
        amount: 2000000,
        title: 'تنخواه ۲',
        custodian_name: 'رضا حسینی',
        section_name: 'بخش کارگاهی ۱',
        category: 'پذیرایی'
      },
      {
        id: 3,
        status: 'approved',
        amount: 3000000,
        title: 'تنخواه ۳',
        custodian_name: 'محمد کریمی',
        section_name: 'بخش کارگاهی ۱',
        category: 'ابزارآلات'
      }
    ])),
    approvePettyCashTransaction: vi.fn().mockReturnValue(of({})),
    rejectPettyCashTransaction: vi.fn().mockReturnValue(of({})),
    exportPettyCashTransactionsExcel: vi.fn().mockReturnValue(of(new Blob()))
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn()
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true)
  };

  const mockRoute = {
    snapshot: { data: { pettyRole: role } },
    queryParams: of(queryParams)
  };

  const mockPerm = {
    canWriteDocuments: vi.fn().mockReturnValue(true)
  };

  const mockWs = {
    documentChanges$: vi.fn().mockReturnValue(EMPTY)
  };

  TestBed.resetTestingModule();

  await TestBed.configureTestingModule({
    imports: [PettyCashPageComponent],
    providers: [
      { provide: PersonnelApiService, useValue: mockApi },
      { provide: ToastService, useValue: mockToast },
      { provide: Router, useValue: mockRouter },
      { provide: ActivatedRoute, useValue: mockRoute },
      { provide: PermissionService, useValue: mockPerm },
      { provide: WebSocketService, useValue: mockWs }
    ]
  })
    .overrideComponent(PettyCashPageComponent, {
      remove: { imports: [PettyAccountManagerComponent] },
      add: { imports: [StubPettyAccountManagerComponent] }
    })
    .compileComponents();

  const fixture = TestBed.createComponent(PettyCashPageComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();

  return {
    fixture,
    component,
    el: fixture.nativeElement,
    api: mockApi,
    toast: mockToast,
    router: mockRouter
  };
}

describe('PettyCashPageComponent (DOM specs — صفحه مشترک تن‌خواه)', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const candidates = [
        path.resolve(__dirname, filename),
        path.resolve(__dirname, '../accountant/accountant-petty-cash/petty-account-manager', filename)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf-8');
        }
      }
      return '';
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('a) accountant: rendered tab labels in order are «همه»، «بررسی»، «پرداخت‌شده»، «حساب‌ها» and active tab is «همه»', async () => {
    const { component, el } = await createPage('accountant');
    const tabs = el.querySelectorAll('[role="tab"]');
    const labels = Array.from(tabs).map(btn => btn.querySelector('span')?.textContent?.trim());
    expect(labels).toEqual(['همه', 'بررسی', 'پرداخت‌شده', 'حساب‌ها']);

    expect(component.activeSubTab).toBe('all');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
    expect(tabs[3].getAttribute('aria-selected')).toBe('false');
  });

  it('b) manager: tab labels in order are «همه»، «بررسی»، «حساب‌ها», no approve/return buttons, and «از کارتابل» is shown', async () => {
    const { component, fixture, el } = await createPage('manager');
    const tabs = el.querySelectorAll('[role="tab"]');
    const labels = Array.from(tabs).map(btn => btn.querySelector('span')?.textContent?.trim());
    expect(labels).toEqual(['همه', 'بررسی', 'حساب‌ها']);

    component.switchSubTab('pending_review');
    fixture.detectChanges();

    expect(el.querySelector('button[appAction="approve"]')).toBeNull();
    expect(el.querySelector('button[appAction="return"]')).toBeNull();
    expect(el.textContent).toContain('از کارتابل');
  });

  it('c) treasurer: tab labels in order are «همه»، «واریز»، «پرداخت‌شده», no create/excel buttons, and deposit button shown on «واریز» tab', async () => {
    const { component, fixture, el } = await createPage('treasurer');
    const tabs = el.querySelectorAll('[role="tab"]');
    const labels = Array.from(tabs).map(btn => btn.querySelector('span')?.textContent?.trim());
    expect(labels).toEqual(['همه', 'واریز', 'پرداخت‌شده']);

    expect(el.querySelector('button[appAction="create"]')).toBeNull();
    expect(el.querySelector('button[appAction="export-excel"]')).toBeNull();
    expect(el.querySelector('button[appAction="import-excel"]')).toBeNull();

    component.switchSubTab('pending_review');
    fixture.detectChanges();

    const confirmBtn = el.querySelector('button[appAction="confirm"]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn?.getAttribute('label') || confirmBtn?.textContent).toContain('واریز');
  });

  it('d) the «بررسی» tab (accountant) carries a count equal to the number of pending_accountant rows, and no other tab carries a count', async () => {
    const { component, el } = await createPage('accountant');
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(4);

    expect(component.tabs[1].count).toBe(1);
    expect(component.tabs[0].count).toBeUndefined();
    expect(component.tabs[2].count).toBeUndefined();
    expect(component.tabs[3].count).toBeUndefined();

    const reviewCountEl = tabs[1].querySelector('.tabular-nums');
    expect(reviewCountEl).not.toBeNull();
    expect(reviewCountEl?.textContent?.trim()).toBe('1');

    expect(tabs[0].querySelector('.tabular-nums')).toBeNull();
    expect(tabs[2].querySelector('.tabular-nums')).toBeNull();
    expect(tabs[3].querySelector('.tabular-nums')).toBeNull();
  });

  it('e) each tab has a title attribute with the full old text for accountant', async () => {
    const { el } = await createPage('accountant');
    const tabs = el.querySelectorAll('[role="tab"]');
    const titles = Array.from(tabs).map(btn => btn.getAttribute('title'));
    expect(titles).toEqual([
      'کل دفاتر تنخواه',
      'نیازمند ممیزی',
      'شارژ و تسویه شده',
      'حساب‌های تنخواه'
    ]);
  });

  it('f) section filter and search input present on «همه» and absent on «حساب‌ها», where stub manager is rendered', async () => {
    const { component, fixture, el } = await createPage('accountant');

    expect(component.activeSubTab).toBe('all');
    expect(el.querySelector('#pc-section')).not.toBeNull();
    expect(el.querySelector('#pc-search')).not.toBeNull();
    expect(el.querySelector('app-petty-account-manager')).toBeNull();
    expect(el.querySelector('table')).not.toBeNull();

    component.switchSubTab('accounts');
    fixture.detectChanges();

    expect(component.activeSubTab).toBe('accounts');
    expect(component.isAccountsTab).toBe(true);
    expect(el.querySelector('#pc-section')).toBeNull();
    expect(el.querySelector('#pc-search')).toBeNull();
    expect(el.querySelector('app-petty-account-manager')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
  });

  it('g) accountant command center shows exactly one refresh button and one create button; clicking refresh on «همه» calls getPettyCashTransactions again', async () => {
    const { api, fixture, el } = await createPage('accountant');

    const actions = el.querySelector('[cc-actions]');
    expect(actions).not.toBeNull();

    const refreshBtns = actions!.querySelectorAll('button[appAction="refresh"]');
    const createBtns = actions!.querySelectorAll('button[appAction="create"]');
    expect(refreshBtns.length).toBe(1);
    expect(createBtns.length).toBe(1);

    const initialCalls = api.getPettyCashTransactions.mock.calls.length;
    const refreshBtn = refreshBtns[0] as HTMLButtonElement;
    refreshBtn.click();
    fixture.detectChanges();

    expect(api.getPettyCashTransactions).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it('h) ?tab=pending_review in the route query params opens the «بررسی» tab', async () => {
    const { component, el } = await createPage('accountant', { tab: 'pending_review' });

    expect(component.activeSubTab).toBe('pending_review');
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    const label = tabs[1].querySelector('span')?.textContent?.trim();
    expect(label).toBe('بررسی');
  });
});
