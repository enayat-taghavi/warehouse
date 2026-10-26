// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';

import { CompanyNumberingTabComponent, NumberingSeries, IssuedNumber } from './company-numbering-tab.component';
import { ApiService } from '../../../../../../core/api/api.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyNumberingTabComponent DOM Spec', () => {
  let fixture: ComponentFixture<CompanyNumberingTabComponent>;
  let component: CompanyNumberingTabComponent;
  let api: { get: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const series: NumberingSeries = {
    key: 'invoice',
    title_fa: 'فاکتور',
    template: '{prefix}-{period}-{seq}',
    prefix: 'INV',
    seq_padding: 4,
    start_number: 1,
    default_template: '{period}-{seq}',
    period_key: '1405',
    next_preview: 'INV-1405-0008',
    last_seq: 7,
    can_edit: true
  };

  const voidRow: IssuedNumber = {
    id: 1,
    series_key: 'invoice',
    display: 'INV-1405-0003',
    period_key: '1405',
    seq: 3,
    entity_kind: 'invoice',
    entity_id: 9,
    status: 'void',
    issued_at: '2026-10-20T08:00:00Z',
    issued_by: 'ali',
    void_reason: 'اشتباه ثبت شد',
    voided_at: '2026-10-21T08:00:00Z',
    voided_by: 'ali'
  };

  function mockGet(results: NumberingSeries[], issued: IssuedNumber[] = []): void {
    api.get.mockImplementation((endpoint: string) =>
      endpoint.endsWith('/issued')
        ? of({ count: issued.length, next: null, previous: null, results: issued })
        : of({ company_id: 3, results })
    );
  }

  beforeEach(async () => {
    api = { get: vi.fn(), patch: vi.fn().mockReturnValue(of({})) };
    toast = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [CompanyNumberingTabComponent],
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

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function createComponent(results: NumberingSeries[] = [series], issued: IssuedNumber[] = []): Promise<void> {
    mockGet(results, issued);
    fixture = TestBed.createComponent(CompanyNumberingTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 3);
    await settle();
    await settle();
  }

  function setInput(selector: string, value: string): void {
    const el = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  async function openEditor(): Promise<void> {
    (fixture.nativeElement.querySelector('button[aria-label="ویرایش قالب"]') as HTMLButtonElement).click();
    await settle();
    await settle();
  }

  it('renders series with Persian-digit preview', async () => {
    await createComponent();
    expect(api.get).toHaveBeenCalledWith('numbering/3/series');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('فاکتور');
    expect(fixture.nativeElement.querySelector('[data-next-preview]').textContent).toContain('INV-۱۴۰۵-۰۰۰۸');
  });

  it('shows empty state', async () => {
    await createComponent([]);
    expect(fixture.nativeElement.textContent).toContain('سری شماره‌ای برای تنظیم ندارید.');
  });

  it('shows error state with retry', async () => {
    api.get.mockReturnValue(throwError(() => ({ error: { detail: 'دسترسی ندارید' } })));
    fixture = TestBed.createComponent(CompanyNumberingTabComponent);
    fixture.componentRef.setInput('companyId', 3);
    await settle();
    await settle();
    expect(fixture.nativeElement.textContent).toContain('دسترسی ندارید');
    expect(fixture.nativeElement.querySelector('button[aria-label="تلاش دوباره"]')).toBeTruthy();
  });

  it('live preview updates on input', async () => {
    await createComponent();
    await openEditor();
    setInput('input[name="prefix"]', 'FA');
    await settle();
    expect(fixture.nativeElement.querySelector('[data-live-preview]').textContent).toContain('FA-۱۴۰۵-۰۰۰۸');
  });

  it('invalid template blocks save with message', async () => {
    await createComponent();
    await openEditor();
    setInput('input[name="template"]', '{prefix}-{seq}');
    await settle();
    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle();
    expect(api.patch).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('قالب باید هم {seq} و هم {period} را داشته باشد.');
  });

  it('save sends PATCH and updates card', async () => {
    await createComponent();
    await openEditor();
    api.patch.mockReturnValue(
      of({ ...series, prefix: 'FA', template: '{prefix}-{period}-{seq}', next_preview: 'FA-1405-0008' })
    );
    setInput('input[name="prefix"]', 'FA');
    await settle();
    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle();
    await settle();
    expect(api.patch).toHaveBeenCalledWith('numbering/3/series/invoice', {
      template: '{prefix}-{period}-{seq}',
      prefix: 'FA',
      seq_padding: 4,
      start_number: 1
    });
    expect(fixture.nativeElement.querySelector('[data-next-preview]').textContent).toContain('FA-۱۴۰۵-۰۰۰۸');
  });

  it('ledger status filter sends status=void and renders void reason', async () => {
    await createComponent();
    mockGet([series], [voidRow]);
    component.filterStatus = 'void';
    await component.onFilterChange();
    await settle();
    expect(api.get).toHaveBeenCalledWith('numbering/3/issued', { page: 1, status: 'void' });
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('اشتباه ثبت شد');
    expect(text).toContain('شمارهٔ باطل‌شده');
    expect(text).toContain('INV-۱۴۰۵-۰۰۰۳');
  });
});
