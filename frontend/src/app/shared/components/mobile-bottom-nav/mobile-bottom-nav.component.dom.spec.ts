// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { MobileBottomNavComponent, MobileBottomNavItem } from './mobile-bottom-nav.component';
import { CommunicationService } from '../../../core/services/communication.service';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';

interface MockCommService {
  isChatAvailable: WritableSignal<boolean>;
  isChatDrawerOpen: WritableSignal<boolean>;
  totalUnreadCount: WritableSignal<number>;
  hasNewIncomingPulse: WritableSignal<boolean>;
  hasActiveConversation: WritableSignal<boolean>;
  toggleChatDrawer: ReturnType<typeof vi.fn>;
}

interface FakeNotificationCenter {
  isOpen: WritableSignal<boolean>;
  unreadCount: WritableSignal<number>;
  hasNewPulse: WritableSignal<boolean>;
  toggleDropdown: ReturnType<typeof vi.fn>;
}

describe('MobileBottomNavComponent (DOM specs)', () => {
  let fixture: ComponentFixture<MobileBottomNavComponent>;
  let component: MobileBottomNavComponent;
  let mockComm: MockCommService;
  let fakeNotif: FakeNotificationCenter;

  const sampleItems: MobileBottomNavItem[] = [
    { id: 'item1', label: 'کالاها', title: 'فهرست کالاهای انبار', icon: 'package', active: false },
    { id: 'item2', label: 'انبارها', title: 'فهرست انبارهای فعال', icon: 'grid', active: false },
    { id: 'item3', label: 'کاربران', title: 'مدیریت کاربران و دسترسی‌ها', icon: 'users', active: false },
  ];

  beforeEach(async () => {
    mockComm = {
      isChatAvailable: signal(true),
      isChatDrawerOpen: signal(false),
      totalUnreadCount: signal(0),
      hasNewIncomingPulse: signal(false),
      hasActiveConversation: signal(false),
      toggleChatDrawer: vi.fn(),
    };

    fakeNotif = {
      isOpen: signal(false),
      unreadCount: signal(0),
      hasNewPulse: signal(false),
      toggleDropdown: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MobileBottomNavComponent],
      providers: [
        { provide: CommunicationService, useValue: mockComm },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileBottomNavComponent);
    component = fixture.componentInstance;
  });

  it('1. chat available + notifications given + 3 items: tab order is chat, notifications, item 1, item 2, more; item 3 is absent', () => {
    mockComm.isChatAvailable.set(true);
    fixture.componentRef.setInput('items', sampleItems);
    fixture.componentRef.setInput('notifications', fakeNotif as unknown as NotificationCenterComponent);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('nav[data-testid="mobile-bottom-nav"] button')) as HTMLElement[];
    const testIds = buttons.map(b => b.getAttribute('data-testid'));
    expect(testIds).toEqual([
      'bottom-nav-chat',
      'bottom-nav-notifications',
      'bottom-nav-item-item1',
      'bottom-nav-item-item2',
      'bottom-nav-more',
    ]);
    expect(fixture.nativeElement.querySelector('[data-testid="bottom-nav-item-item3"]')).toBeNull();
  });

  it('2. chat unavailable: 3 item tabs and no chat tab', () => {
    mockComm.isChatAvailable.set(false);
    fixture.componentRef.setInput('items', sampleItems);
    fixture.componentRef.setInput('notifications', fakeNotif as unknown as NotificationCenterComponent);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('nav[data-testid="mobile-bottom-nav"] button')) as HTMLElement[];
    const testIds = buttons.map(b => b.getAttribute('data-testid'));
    expect(testIds).toEqual([
      'bottom-nav-notifications',
      'bottom-nav-item-item1',
      'bottom-nav-item-item2',
      'bottom-nav-item-item3',
      'bottom-nav-more',
    ]);
    expect(fixture.nativeElement.querySelector('[data-testid="bottom-nav-chat"]')).toBeNull();
  });

  it('3. hasActiveConversation true: no element [data-testid="mobile-bottom-nav"]', () => {
    mockComm.hasActiveConversation.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-bottom-nav"]')).toBeNull();
  });

  it('3b. chat drawer open (conversation list): no element [data-testid="mobile-bottom-nav"]', () => {
    mockComm.hasActiveConversation.set(false);
    mockComm.isChatDrawerOpen.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-bottom-nav"]')).toBeNull();
  });

  it('4. clicking the chat tab calls toggleChatDrawer once and emits overlayOpen', () => {
    mockComm.isChatAvailable.set(true);
    mockComm.hasActiveConversation.set(false);
    fixture.componentRef.setInput('items', sampleItems);
    fixture.detectChanges();

    let overlayOpened = false;
    component.overlayOpen.subscribe(() => {
      overlayOpened = true;
    });

    const chatBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-chat"]') as HTMLButtonElement;
    expect(chatBtn).not.toBeNull();
    chatBtn.click();

    expect(mockComm.toggleChatDrawer).toHaveBeenCalledTimes(1);
    expect(overlayOpened).toBe(true);
  });

  it('5. clicking the notifications tab calls toggleDropdown once and does not touch the chat drawer', () => {
    mockComm.isChatAvailable.set(true);
    mockComm.hasActiveConversation.set(false);
    mockComm.isChatDrawerOpen.set(false);
    fixture.componentRef.setInput('items', sampleItems);
    fixture.componentRef.setInput('notifications', fakeNotif as unknown as NotificationCenterComponent);
    fixture.detectChanges();

    let overlayOpened = false;
    component.overlayOpen.subscribe(() => {
      overlayOpened = true;
    });

    const notifBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-notifications"]') as HTMLButtonElement;
    expect(notifBtn).not.toBeNull();
    notifBtn.click();

    expect(fakeNotif.toggleDropdown).toHaveBeenCalledTimes(1);
    expect(mockComm.toggleChatDrawer).not.toHaveBeenCalled();
    expect(overlayOpened).toBe(true);
  });

  it('6. clicking an item tab emits itemSelect with the item id; clicking more opens the more sheet', () => {
    mockComm.isChatAvailable.set(true);
    mockComm.hasActiveConversation.set(false);
    fixture.componentRef.setInput('items', sampleItems);
    fixture.detectChanges();

    let selectedId: string | null = null;
    component.itemSelect.subscribe(id => {
      selectedId = id;
    });

    const item1Btn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-item-item1"]') as HTMLButtonElement;
    item1Btn.click();
    expect(selectedId).toBe('item1');

    const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
    moreBtn.click();
    fixture.detectChanges();
    expect(component.sheetOpen()).toBe(true);
    expect(moreBtn.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-more-sheet"]')).not.toBeNull();
  });

  it('7. the active item tab has aria-current="page"; the more dot is shown when no item is active and hidden when one is active', () => {
    mockComm.isChatAvailable.set(true);
    mockComm.hasActiveConversation.set(false);

    // Case A: one item is active -> aria-current="page" and more dot hidden
    const itemsWithActive: MobileBottomNavItem[] = [
      { id: 'item1', label: 'کالاها', title: 'فهرست کالاها', icon: 'package', active: true },
      { id: 'item2', label: 'انبارها', title: 'فهرست انبارها', icon: 'grid', active: false },
    ];
    fixture.componentRef.setInput('items', itemsWithActive);
    fixture.detectChanges();

    const item1Btn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-item-item1"]') as HTMLButtonElement;
    const item2Btn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-item-item2"]') as HTMLButtonElement;
    expect(item1Btn.getAttribute('aria-current')).toBe('page');
    expect(item2Btn.getAttribute('aria-current')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="bottom-nav-more-dot"]')).toBeNull();

    // Case B: no item is active -> more dot is visible
    const itemsNoneActive: MobileBottomNavItem[] = [
      { id: 'item1', label: 'کالاها', title: 'فهرست کالاها', icon: 'package', active: false },
      { id: 'item2', label: 'انبارها', title: 'فهرست انبارها', icon: 'grid', active: false },
    ];
    fixture.componentRef.setInput('items', itemsNoneActive);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="bottom-nav-more-dot"]')).not.toBeNull();
  });

  it('8. labels: an item tab shows its short label as text and its full title in title and aria-label; unread count 5 shows badge text 5 on chat and 120 shows +99', () => {
    mockComm.isChatAvailable.set(true);
    mockComm.hasActiveConversation.set(false);
    mockComm.totalUnreadCount.set(5);

    const testItems: MobileBottomNavItem[] = [
      { id: 'test1', label: 'کوتاه', title: 'عنوان کامل برای عنوان و شناسه دسترس‌پذیری', icon: 'box', active: false },
    ];
    fixture.componentRef.setInput('items', testItems);
    fixture.detectChanges();

    const itemBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-item-test1"]') as HTMLButtonElement;
    expect(itemBtn.textContent).toContain('کوتاه');
    expect(itemBtn.getAttribute('title')).toBe('عنوان کامل برای عنوان و شناسه دسترس‌پذیری');
    expect(itemBtn.getAttribute('aria-label')).toBe('عنوان کامل برای عنوان و شناسه دسترس‌پذیری');

    const chatBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-chat"]') as HTMLButtonElement;
    expect(chatBtn.textContent).toContain('5');

    mockComm.totalUnreadCount.set(120);
    fixture.detectChanges();
    expect(chatBtn.textContent).toContain('+99');
  });

  describe('Mobile more sheet integration (6 items)', () => {
    const sixItems: MobileBottomNavItem[] = [
      { id: 'it1', label: 'یک', title: 'مورد یک', icon: 'package', active: false },
      { id: 'it2', label: 'دو', title: 'مورد دو', icon: 'grid', active: false },
      { id: 'it3', label: 'سه', title: 'مورد سه', icon: 'users', active: false },
      { id: 'it4', label: 'چهار', title: 'مورد چهار', icon: 'settings', active: false },
      { id: 'it5', label: 'پنج', title: 'مورد پنج', icon: 'box', active: false },
      { id: 'it6', label: 'شش', title: 'مورد شش', icon: 'activity', active: false },
    ];

    it('(1) chat available: after clicking bottom-nav-more, the sheet shows exactly items 3 to 6 and not items 1 and 2', () => {
      mockComm.isChatAvailable.set(true);
      fixture.componentRef.setInput('items', sixItems);
      fixture.detectChanges();

      const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
      expect(moreBtn).not.toBeNull();
      moreBtn.click();
      fixture.detectChanges();

      expect(component.sheetOpen()).toBe(true);
      const sheet = fixture.nativeElement.querySelector('[data-testid="mobile-more-sheet"]');
      expect(sheet).not.toBeNull();

      expect(sheet.querySelector('[data-testid="mobile-more-item-it1"]')).toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it2"]')).toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it3"]')).not.toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it4"]')).not.toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it5"]')).not.toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it6"]')).not.toBeNull();
    });

    it('(2) chat not available: the sheet shows items 4 to 6', () => {
      mockComm.isChatAvailable.set(false);
      fixture.componentRef.setInput('items', sixItems);
      fixture.detectChanges();

      const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
      expect(moreBtn).not.toBeNull();
      moreBtn.click();
      fixture.detectChanges();

      expect(component.sheetOpen()).toBe(true);
      const sheet = fixture.nativeElement.querySelector('[data-testid="mobile-more-sheet"]');
      expect(sheet).not.toBeNull();

      expect(sheet.querySelector('[data-testid="mobile-more-item-it1"]')).toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it2"]')).toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it3"]')).toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it4"]')).not.toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it5"]')).not.toBeNull();
      expect(sheet.querySelector('[data-testid="mobile-more-item-it6"]')).not.toBeNull();
    });

    it('(3) clicking a sheet item emits itemSelect with its id and the sheet is gone (sheetOpen() false)', () => {
      mockComm.isChatAvailable.set(true);
      fixture.componentRef.setInput('items', sixItems);
      fixture.detectChanges();

      const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
      moreBtn.click();
      fixture.detectChanges();
      expect(component.sheetOpen()).toBe(true);

      let selectedId: string | null = null;
      component.itemSelect.subscribe(id => {
        selectedId = id;
      });

      const sheetItem = fixture.nativeElement.querySelector('[data-testid="mobile-more-item-it3"]') as HTMLButtonElement;
      expect(sheetItem).not.toBeNull();
      sheetItem.click();
      fixture.detectChanges();

      expect(selectedId).toBe('it3');
      expect(component.sheetOpen()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="mobile-more-sheet"]')).toBeNull();
    });

    it('(4) clicking bottom-nav-more emits overlayOpen; clicking it again closes the sheet', () => {
      mockComm.isChatAvailable.set(true);
      fixture.componentRef.setInput('items', sixItems);
      fixture.detectChanges();

      let overlayCount = 0;
      component.overlayOpen.subscribe(() => {
        overlayCount++;
      });

      const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
      moreBtn.click();
      fixture.detectChanges();

      expect(overlayCount).toBe(1);
      expect(component.sheetOpen()).toBe(true);

      moreBtn.click();
      fixture.detectChanges();

      expect(component.sheetOpen()).toBe(false);
    });

    it('(5) Escape on document closes the sheet', () => {
      mockComm.isChatAvailable.set(true);
      fixture.componentRef.setInput('items', sixItems);
      fixture.detectChanges();

      const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
      moreBtn.click();
      fixture.detectChanges();
      expect(component.sheetOpen()).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();

      expect(component.sheetOpen()).toBe(false);
    });

    it('(6) with the sheet open, clicking bottom-nav-chat closes it', () => {
      mockComm.isChatAvailable.set(true);
      fixture.componentRef.setInput('items', sixItems);
      fixture.detectChanges();

      const moreBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-more"]') as HTMLButtonElement;
      moreBtn.click();
      fixture.detectChanges();
      expect(component.sheetOpen()).toBe(true);

      const chatBtn = fixture.nativeElement.querySelector('[data-testid="bottom-nav-chat"]') as HTMLButtonElement;
      expect(chatBtn).not.toBeNull();
      chatBtn.click();
      fixture.detectChanges();

      expect(component.sheetOpen()).toBe(false);
    });
  });
});
