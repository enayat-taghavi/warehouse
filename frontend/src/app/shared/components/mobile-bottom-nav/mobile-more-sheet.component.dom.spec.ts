// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileMoreSheetComponent } from './mobile-more-sheet.component';
import { MobileBottomNavItem } from './mobile-bottom-nav.component';

describe('MobileMoreSheetComponent (DOM specs)', () => {
  let fixture: ComponentFixture<MobileMoreSheetComponent>;
  let component: MobileMoreSheetComponent;

  const sampleItems: MobileBottomNavItem[] = [
    { id: 'a', label: 'مورد الف', title: 'عنوان الف', icon: 'package', active: false },
    { id: 'b', label: 'مورد ب', title: 'عنوان ب', icon: 'grid', active: false },
    { id: 'c', label: 'مورد ج', title: 'عنوان ج', icon: 'users', active: true },
    { id: 'd', label: 'مورد د', title: 'عنوان د', icon: 'settings', active: false },
    { id: 'e', label: 'مورد ه', title: 'عنوان ه', icon: 'box', active: false },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MobileMoreSheetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileMoreSheetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', sampleItems);
    fixture.detectChanges();
  });

  it('1. renders the dialog: role="dialog", aria-modal="true", has data-back-closes, heading text contains بخش', () => {
    const dialog = fixture.nativeElement.querySelector('[data-testid="mobile-more-sheet"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.hasAttribute('data-back-closes')).toBe(true);

    const heading = fixture.nativeElement.querySelector('#mobile-more-sheet-title') as HTMLElement;
    expect(heading).not.toBeNull();
    expect(heading.textContent).toContain('بخش');
  });

  it('2. renders exactly 5 item buttons in a ul with class grid-cols-4, each with title/aria-label = the item title and text = the item label', () => {
    const grid = fixture.nativeElement.querySelector('ul[data-testid="mobile-more-grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.classList.contains('grid-cols-4')).toBe(true);

    const buttons = Array.from(grid.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.length).toBe(5);

    sampleItems.forEach(item => {
      const btn = grid.querySelector(`[data-testid="mobile-more-item-${item.id}"]`) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.getAttribute('title')).toBe(item.title);
      expect(btn.getAttribute('aria-label')).toBe(item.title);
      expect(btn.textContent).toContain(item.label);
    });
  });

  it('3. only item c has aria-current="page"', () => {
    sampleItems.forEach(item => {
      const btn = fixture.nativeElement.querySelector(`[data-testid="mobile-more-item-${item.id}"]`) as HTMLButtonElement;
      if (item.id === 'c') {
        expect(btn.getAttribute('aria-current')).toBe('page');
      } else {
        expect(btn.getAttribute('aria-current')).toBeNull();
      }
    });
  });

  it('4. clicking item b emits itemSelect with b', () => {
    let emittedId: string | null = null;
    component.itemSelect.subscribe(id => {
      emittedId = id;
    });

    const btnB = fixture.nativeElement.querySelector('[data-testid="mobile-more-item-b"]') as HTMLButtonElement;
    expect(btnB).not.toBeNull();
    btnB.click();

    expect(emittedId).toBe('b');
  });

  it('5. clicking the close button emits closed; clicking the backdrop emits closed', () => {
    let closedCount = 0;
    component.closed.subscribe(() => {
      closedCount++;
    });

    const closeBtn = fixture.nativeElement.querySelector('[data-testid="mobile-more-close"]') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(closedCount).toBe(1);

    const backdrop = fixture.nativeElement.querySelector('[data-testid="mobile-more-backdrop"]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    backdrop.click();
    expect(closedCount).toBe(2);
  });

  it('6. dispatching new KeyboardEvent(\'keydown\', { key: \'Escape\' }) on document emits closed', () => {
    let closedEmitted = false;
    component.closed.subscribe(() => {
      closedEmitted = true;
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closedEmitted).toBe(true);
  });

  it('7. with an empty list, mobile-more-empty is shown and the grid is absent', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('[data-testid="mobile-more-empty"]');
    expect(empty).not.toBeNull();

    const grid = fixture.nativeElement.querySelector('[data-testid="mobile-more-grid"]');
    expect(grid).toBeNull();
  });
});
