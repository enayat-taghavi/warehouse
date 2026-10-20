// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { DeepSyncModalComponent, DeepSyncSectionView } from './deep-sync-modal.component';
import { getModuleRegistry, WhFrontendModule } from '../../../core/modules/module-registry.service';
import { DeepSyncSectionSpec } from '../../../core/modules/module-contract';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const OPEN = { isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } };

const QA_SECTION: DeepSyncSectionSpec = {
  scope: 'qa_mod', order: 30, tabLabel: 'ماژول آزمون', icon: 'package',
  sectionTitle: 'فهرست آزمون', opsSectionTitle: 'هدف‌های ماژول آزمون',
  bannerTitle: 'انتخاب هدف‌های آزمون', bannerDescription: 'توضیح آزمون',
  emptyText: 'هدفی یافت نشد.', selectAllLabel: 'انتخاب همه هدف‌ها', clearAllLabel: 'لغو انتخاب هدف‌ها',
  itemLabel: 'هدف', summaryLabel: 'آزمون', accent: 'emerald',
  loadItems: async () => [{ id: 7, name: 'هدف هفت' }]
};

function toView(spec: DeepSyncSectionSpec, items: { id: number; name: string }[]): DeepSyncSectionView {
  const { loadItems, initialItems, preselectId, ...view } = spec;
  return { ...view, items };
}

/** بخش‌های deepSync ماژول‌های رجیستری به ترتیب order */
function registrySections(): DeepSyncSectionSpec[] {
  return getModuleRegistry().getAllModules()
    .map(m => m.extensions?.userMenu?.deepSync)
    .filter((d): d is DeepSyncSectionSpec => !!d)
    .sort((a, b) => a.order - b.order);
}

describe('Deep update sections from module userMenu extensions (step 6, session 28)', () => {
  let fixture: ComponentFixture<DeepSyncModalComponent>;
  let component: DeepSyncModalComponent;
  let originalModules: WhFrontendModule[];
  let originalInstalled: string[];

  beforeEach(async () => {
    originalModules = [...getModuleRegistry().getAllModules()];
    originalInstalled = getModuleRegistry().getInstalledCodes();
    await TestBed.configureTestingModule({ imports: [DeepSyncModalComponent] }).compileComponents();
    fixture = TestBed.createComponent(DeepSyncModalComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    (getModuleRegistry() as any).modules = originalModules;
    getModuleRegistry().setInstalledModules(originalInstalled);
    TestBed.resetTestingModule();
  });

  it('1. the two real modules give their sections in today\'s order with today\'s titles', () => {
    const secs = registrySections();
    expect(secs.map(s => s.order)).toEqual([10, 20]);
    expect(secs.map(s => s.tabLabel)).toEqual(['انبارداری', 'مالی و پرسنلی']);
    expect(secs.map(s => s.sectionTitle)).toEqual(['لیست انبارها', 'لیست پروژه‌ها / کارگاه‌ها']);
    expect(secs.map(s => s.opsSectionTitle)).toEqual(['انبارهای فعال سازمان', 'پروژه‌ها و کارگاه‌های مالی']);
    expect(secs.map(s => s.accent)).toEqual(['indigo', 'emerald']);
  });

  it('2. a registered fake module qa_mod with a deepSync section adds a third tab in the operations context', () => {
    getModuleRegistry().registerModule({
      code: 'qa_mod', titleFa: 'آزمون', titleShortFa: 'آزمون', descriptionFa: '', icon: '🧪',
      routePrefix: '/app/qa-mod', defaultRoute: '/app/qa-mod', scopeKind: 'qa_mod', permissionMarkers: [], roles: [],
      extensions: { userMenu: { deepSync: QA_SECTION } }
    });
    const secs = registrySections();
    expect(secs.map(s => s.scope)).toEqual(['warehouse', 'finance', 'qa_mod']);

    component.contextMode = 'operations';
    component.sections = secs.map(s => toView(s, s.scope === 'qa_mod' ? [{ id: 7, name: 'هدف هفت' }] : [{ id: 1, name: 'یک' }]));
    component.isOpen = true;
    component.ngOnChanges(OPEN);
    fixture.detectChanges();

    const labels = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).map(b => b.textContent || '');
    expect(labels.some(t => t.includes('کل سازمان'))).toBe(true);
    expect(labels.some(t => t.includes('انبارداری'))).toBe(true);
    expect(labels.some(t => t.includes('مالی و پرسنلی'))).toBe(true);
    expect(labels.some(t => t.includes('ماژول آزمون'))).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.grid > div').length).toBe(3);
  });

  it('3. selecting ids in the qa_mod section emits them under idsByScope.qa_mod', () => {
    component.contextMode = 'operations';
    component.sections = [toView(QA_SECTION, [{ id: 7, name: 'هدف هفت' }, { id: 8, name: 'هدف هشت' }])];
    component.isOpen = true;
    component.ngOnChanges(OPEN);
    fixture.detectChanges();

    let emitted: any = null;
    component.startSyncMulti.subscribe(v => (emitted = v));
    const cards = fixture.nativeElement.querySelectorAll('.grid > div');
    cards[1].dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    component.confirm();

    expect(emitted).toEqual({ warehouseIds: [], projectIds: [], idsByScope: { qa_mod: [8] } });
  });

  it('4. with no deepSync contribution the dialog shows no section', () => {
    component.contextMode = 'operations';
    component.sections = [];
    component.isOpen = true;
    component.ngOnChanges(OPEN);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.grid').length).toBe(0);
    expect(component.totalSelectedCount()).toBe(0);
    const submit = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find(b => b.textContent?.includes('شروع بروزرسانی'));
    expect(submit?.disabled).toBe(true);
  });

  it('5. a single-scope context shows that section\'s banner, title and empty text', () => {
    component.contextMode = 'qa_mod';
    component.sections = [toView(QA_SECTION, [])];
    component.isOpen = true;
    component.ngOnChanges(OPEN);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent || '';
    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain('انتخاب هدف‌های آزمون');
    expect(text).toContain('فهرست آزمون');
    expect(text).toContain('هدفی یافت نشد.');
    expect(text).not.toContain('کل سازمان');
  });
});
