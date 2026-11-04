// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of } from 'rxjs';

import { ReferralTreeComponent } from './referral-tree';
import { LettersApiService } from '../../services/letters-api.service';
import { ReferralNode, buildReferralTree } from '../../letters.models';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const node = (task_id: number, parent: number | null, over: Partial<ReferralNode> = {}): ReferralNode => ({
  task_id, parent_task_id: parent, kind: 'refer', kind_fa: 'ارجاع', target_user: { id: task_id, name: `نفر ${task_id}` },
  referred_by: { id: 1, name: 'دبیرخانه' }, instruction: '', reply: '', due_at: null, is_open: true, outcome: '',
  outcome_fa: '', opened_at: null, closed_at: null, can_close: false, ...over,
});

const ROWS = [node(1, null), node(2, 1, { can_close: true }), node(3, 2, { kind: 'inform', kind_fa: 'برای اطلاع', can_close: true }), node(4, 88)];

describe('ReferralTreeComponent — درخت ارجاع', () => {
  let fixture: ComponentFixture<ReferralTreeComponent>;
  let api: any;
  const width = window.innerWidth;

  const setup = (screen: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: screen });
    api = {
      referrals: vi.fn().mockReturnValue(of({ instance_id: 5, referrals: ROWS, can_refer: true })),
      closeReferral: vi.fn().mockReturnValue(of({})),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ReferralTreeComponent], providers: [{ provide: LettersApiService, useValue: api }] });
    fixture = TestBed.createComponent(ReferralTreeComponent);
    fixture.componentRef.setInput('letterId', 7);
    fixture.detectChanges();
  };
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(() => setup(1280));
  afterEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }));

  it('فهرست تخت با والد به درخت تودرتو تبدیل می‌شود (والد نادیدنی = ریشه)', () => {
    const roots = buildReferralTree(ROWS);
    expect(roots.map(r => r.node.task_id)).toEqual([1, 4]);
    expect(roots[0].children[0].children[0].node.task_id).toBe(3);
    expect(roots[0].children[0].children[0].depth).toBe(2);
  });

  it('در دسکتاپ همهٔ شاخه‌ها باز است و تورفتگی دارد', () => {
    expect(q('[data-testid="ref-3"]')).not.toBeNull();
    expect(q('[data-testid="ref-1"] ul [data-testid="ref-2"]')).not.toBeNull();
  });

  it('در موبایل شاخه‌ها بسته شروع می‌شوند و با دکمه باز می‌شوند', () => {
    setup(360);
    expect(q('[data-testid="ref-2"]')).toBeNull();
    const toggle = q('[data-testid="toggle-1"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-label')).toBe('باز کردن شاخه');
    toggle.click();
    fixture.detectChanges();
    expect(q('[data-testid="ref-2"]')).not.toBeNull();
    expect(q('[data-testid="toggle-1"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('«انجام شد» و «رؤیت شد» فقط برای کار باز خود کاربر', () => {
    expect(q('[data-testid="done-1"]')).toBeNull();
    expect(q('[data-testid="done-2"]')).not.toBeNull();
    expect(q('[data-testid="seen-3"]')).not.toBeNull();
    q('[data-testid="seen-3"]')!.click();
    expect(api.closeReferral).toHaveBeenCalledWith(3, 'seen', '');
  });

  it('«انجام شد» با پاسخ همان اقدام هسته را صدا می‌زند', () => {
    q('[data-testid="done-2"]')!.click();
    fixture.detectChanges();
    const ta = fixture.nativeElement.querySelector('#reply-2') as HTMLTextAreaElement;
    ta.value = 'انجام شد';
    ta.dispatchEvent(new Event('input'));
    q('[data-testid="done-confirm-2"]')!.click();
    expect(api.closeReferral).toHaveBeenCalledWith(2, 'done', 'انجام شد');
  });

  it('آفلاین، دکمه‌های بستن غیرفعال‌اند', () => {
    fixture.componentRef.setInput('online', false);
    fixture.detectChanges();
    expect((q('[data-testid="done-2"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
