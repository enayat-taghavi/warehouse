// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { DeepSyncModalComponent } from './deep-sync-modal.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('DeepSyncModalComponent DOM & Behavior Tests', () => {
  let component: DeepSyncModalComponent;
  let fixture: ComponentFixture<DeepSyncModalComponent>;

  const sampleWarehouses = [
    { id: 1, name: 'انبار مرکزی' },
    { id: 2, name: 'انبار قطعات یدکی' },
    { id: 3, name: 'انبار محصولات نهایی' }
  ];

  const sampleProjects = [
    { id: 10, name: 'پروژه خط ۲ مترو' },
    { id: 11, name: 'کارگاه ساختمانی سپهر' }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeepSyncModalComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DeepSyncModalComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should not render modal in DOM when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('should render modal in DOM with title and warehouse cards in warehouse mode', () => {
    component.isOpen = true;
    component.contextMode = 'warehouse';
    component.warehouses = sampleWarehouses;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const titleEl = fixture.nativeElement.querySelector('h2');
    expect(titleEl?.textContent?.trim()).toBe('بروزرسانی عمیق');

    const cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('انبار مرکزی');
    expect(cards[1].textContent).toContain('انبار قطعات یدکی');
    expect(cards[2].textContent).toContain('انبار محصولات نهایی');
  });

  it('should adapt DOM text to warehouse scope when contextMode is warehouse', () => {
    component.isOpen = true;
    component.contextMode = 'warehouse';
    component.warehouses = sampleWarehouses;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('h3');
    expect(header?.textContent).toContain('انتخاب انبارهای هدف');

    const sectionTitle = fixture.nativeElement.textContent;
    expect(sectionTitle).toContain('لیست انبارها');
  });

  it('should render projects and adapt DOM text in finance/accounting mode', () => {
    component.isOpen = true;
    component.contextMode = 'finance';
    component.projects = sampleProjects;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('h3');
    expect(header?.textContent).toContain('انتخاب پروژه‌ها و کارگاه‌های هدف');

    const cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('پروژه خط ۲ مترو');
    expect(cards[1].textContent).toContain('کارگاه ساختمانی سپهر');
  });

  it('should render operations mode with multi-module tabs and dual sections', () => {
    component.isOpen = true;
    component.contextMode = 'operations';
    component.warehouses = sampleWarehouses;
    component.projects = sampleProjects;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const titleEl = fixture.nativeElement.querySelector('h2');
    expect(titleEl?.textContent?.trim()).toBe('بروزرسانی عمیق مرکز عملیات');

    const header = fixture.nativeElement.querySelector('h3');
    expect(header?.textContent).toContain('همگام‌سازی و بازخوانی یکپارچه سازمان');

    // Check tabs
    const tabButtons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const allTab = tabButtons.find(b => b.textContent?.includes('کل سازمان'));
    const whTab = tabButtons.find(b => b.textContent?.includes('انبارداری'));
    const finTab = tabButtons.find(b => b.textContent?.includes('مالی و پرسنلی'));

    expect(allTab).toBeDefined();
    expect(whTab).toBeDefined();
    expect(finTab).toBeDefined();

    // In 'all' tab, both sections (warehouses and projects) are visible: 3 + 2 = 5 cards
    const cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(cards.length).toBe(5);
  });

  it('should filter visible cards when switching tabs in operations mode', () => {
    component.isOpen = true;
    component.contextMode = 'operations';
    component.warehouses = sampleWarehouses;
    component.projects = sampleProjects;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    // Switch to warehouse tab
    component.activeOpsTab.set('warehouse');
    fixture.detectChanges();
    let cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(cards.length).toBe(3);

    // Switch to finance tab
    component.activeOpsTab.set('finance');
    fixture.detectChanges();
    cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(cards.length).toBe(2);
  });

  it('should disable confirm button when total selected count is 0', () => {
    component.isOpen = true;
    component.warehouses = sampleWarehouses;
    component.selectedWarehouseIds.set([]);
    component.selectedProjectIds.set([]);
    fixture.detectChanges();

    const allButtons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const submitBtn = allButtons.find(b => b.textContent?.includes('شروع بروزرسانی'));

    expect(submitBtn).toBeDefined();
    expect(submitBtn?.disabled).toBe(true);
    expect(submitBtn?.classList.contains('cursor-not-allowed')).toBe(true);
    expect(submitBtn?.textContent).toContain('شروع بروزرسانی (0)');
  });

  it('should toggle selection in DOM when a warehouse card is clicked', () => {
    component.isOpen = true;
    component.contextMode = 'warehouse';
    component.warehouses = sampleWarehouses;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(component.selectedWarehouseIds().length).toBe(0);

    // Click first card
    cards[0].dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(component.selectedWarehouseIds()).toEqual([1]);
    expect(cards[0].classList.contains('border-indigo-500')).toBe(true);

    const submitBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b: any) => b.textContent?.includes('شروع بروزرسانی')
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toContain('شروع بروزرسانی (1)');

    // Click again to unselect
    cards[0].dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(component.selectedWarehouseIds().length).toBe(0);
    expect(cards[0].classList.contains('border-slate-200')).toBe(true);
  });

  it('should support toggle select all warehouses', () => {
    component.isOpen = true;
    component.contextMode = 'warehouse';
    component.warehouses = sampleWarehouses;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const selectAllBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b: any) => b.textContent?.includes('انتخاب همه انبارها')
    ) as HTMLButtonElement;

    expect(selectAllBtn).toBeDefined();

    // Click select all
    selectAllBtn.click();
    fixture.detectChanges();

    expect(component.selectedWarehouseIds()).toEqual([1, 2, 3]);
    expect(selectAllBtn.textContent?.trim()).toBe('لغو انتخاب انبارها');

    // Click again to clear all
    selectAllBtn.click();
    fixture.detectChanges();

    expect(component.selectedWarehouseIds()).toEqual([]);
    expect(selectAllBtn.textContent?.trim()).toBe('انتخاب همه انبارها');
  });

  it('should support toggle select entire organization in operations mode', () => {
    component.isOpen = true;
    component.contextMode = 'operations';
    component.warehouses = sampleWarehouses;
    component.projects = sampleProjects;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    const orgBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b: any) => b.textContent?.includes('انتخاب کل سامانه‌های سازمان')
    ) as HTMLButtonElement;

    expect(orgBtn).toBeDefined();

    // Click select entire organization
    orgBtn.click();
    fixture.detectChanges();

    expect(component.selectedWarehouseIds()).toEqual([1, 2, 3]);
    expect(component.selectedProjectIds()).toEqual([10, 11]);
    expect(component.totalSelectedCount()).toBe(5);
    expect(orgBtn.textContent?.trim()).toBe('لغو انتخاب کل سازمان');

    // Click again to deselect entire org
    orgBtn.click();
    fixture.detectChanges();

    expect(component.selectedWarehouseIds()).toEqual([]);
    expect(component.selectedProjectIds()).toEqual([]);
    expect(component.totalSelectedCount()).toBe(0);
    expect(orgBtn.textContent?.trim()).toBe('انتخاب کل سامانه‌های سازمان');
  });

  it('should automatically select preselectWarehouseId when opened in warehouse mode', () => {
    component.isOpen = true;
    component.contextMode = 'warehouse';
    component.warehouses = sampleWarehouses;
    component.preselectWarehouseId = 2;
    component.ngOnChanges({ isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();

    expect(component.selectedWarehouseIds()).toEqual([2]);

    const cards = fixture.nativeElement.querySelectorAll('.grid > div');
    expect(cards[1].classList.contains('border-indigo-500')).toBe(true);
    expect(cards[0].classList.contains('border-slate-200')).toBe(true);
  });

  it('should emit startSync and startSyncMulti when confirmed in operations mode', () => {
    component.isOpen = true;
    component.contextMode = 'operations';
    component.warehouses = sampleWarehouses;
    component.projects = sampleProjects;
    component.selectedWarehouseIds.set([1, 2]);
    component.selectedProjectIds.set([10]);
    fixture.detectChanges();

    let emittedMulti: any = null;
    let closedEmitted = false;

    component.startSyncMulti.subscribe((val) => (emittedMulti = val));
    component.closed.subscribe(() => (closedEmitted = true));

    const submitBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b: any) => b.textContent?.includes('شروع بروزرسانی')
    ) as HTMLButtonElement;

    submitBtn.click();

    expect(emittedMulti).toEqual({ warehouseIds: [1, 2], projectIds: [10] });
    expect(closedEmitted).toBe(true);
  });

  it('should emit closed when cancel button is clicked', () => {
    component.isOpen = true;
    fixture.detectChanges();

    let closedEmitted = false;
    component.closed.subscribe(() => (closedEmitted = true));

    const cancelBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b: any) => b.textContent?.trim() === 'انصراف'
    ) as HTMLButtonElement;

    cancelBtn.click();
    expect(closedEmitted).toBe(true);
  });

  it('should support backwards compatibility setters isWarehouseScope and preselectId', () => {
    component.isWarehouseScope = false;
    expect(component.contextMode).toBe('finance');

    component.preselectId = 99;
    expect(component.preselectProjectId).toBe(99);

    component.isWarehouseScope = true;
    expect(component.contextMode).toBe('warehouse');

    component.preselectId = 77;
    expect(component.preselectWarehouseId).toBe(77);
  });
});
