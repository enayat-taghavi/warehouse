// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';

import { NotificationCenterComponent, NotificationItem } from './notification-center.component';
import { INSTALLED_MODULES } from '../../../modules/installed-modules';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';
import { AuthService } from '../../../core/auth/auth.service';
import { WebSocketService } from '../../../core/http/websocket.service';
import { CommunicationService } from '../../../core/services/communication.service';
import { NotificationHandler } from '../../../core/modules/module-contract';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const accountingModule = INSTALLED_MODULES.find(m => m.code === 'accounting');
const ACCOUNTING_NOTIFICATION_HANDLERS: NotificationHandler[] =
  (accountingModule?.extensions?.notificationHandlers as NotificationHandler[]) || [];

describe('NotificationCenterComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<NotificationCenterComponent>;
  let component: NotificationCenterComponent;

  let mockHttp: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let mockRouter: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let mockAuth: { user: ReturnType<typeof vi.fn> };
  let mockWs: { notifications$: Subject<any> };
  let mockRegistry: { getExtensions: ReturnType<typeof vi.fn> };
  let mockCommService: { isChatDrawerOpen: { set: ReturnType<typeof vi.fn> } };

  let currentUnreadCount: number;
  let currentNotifications: NotificationItem[];
  let currentVehicleResponse: any;
  let currentProfileResponse: any;

  beforeAll(() => {
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
  });

  beforeEach(async () => {
    currentUnreadCount = 0;
    currentNotifications = [];
    currentVehicleResponse = { id: 12, plate_number: '12B345', approval_status: 'pending_accountant' };
    currentProfileResponse = { id: 88, national_code: '0012345678', approval_status: 'pending_supervisor' };

    mockHttp = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/notifications/unread-count/')) {
          return of({ unread_count: currentUnreadCount });
        }
        if (url.includes('/notifications/')) {
          return of(currentNotifications);
        }
        if (url.includes('/personnel/vehicles/')) {
          return of(currentVehicleResponse);
        }
        if (url.includes('/personnel/profiles/')) {
          return of(currentProfileResponse);
        }
        return of({});
      }),
      post: vi.fn().mockReturnValue(of({}))
    };

    mockRouter = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn()
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ permissions: [], is_superuser: false })
    };

    mockWs = {
      notifications$: new Subject<any>()
    };

    mockCommService = {
      isChatDrawerOpen: {
        set: vi.fn()
      }
    };

    mockRegistry = {
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'notificationHandlers') {
          return [{
            module: accountingModule || ({ code: 'accounting' } as any),
            moduleCode: 'accounting',
            extension: ACCOUNTING_NOTIFICATION_HANDLERS
          }];
        }
        return [];
      })
    };

    await TestBed.configureTestingModule({
      imports: [NotificationCenterComponent],
      providers: [
        { provide: HttpClient, useValue: mockHttp },
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuth },
        { provide: WebSocketService, useValue: mockWs },
        { provide: ModuleRegistryService, useValue: mockRegistry },
        { provide: CommunicationService, useValue: mockCommService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenterComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {}
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function openPanel(): void {
    const triggerBtn = fixture.nativeElement.querySelector('button[aria-label="مرکز اعلان‌های سامانه"]') as HTMLButtonElement;
    triggerBtn.click();
    fixture.detectChanges();
  }

  function getNotificationRow(title: string): HTMLElement {
    const rows = fixture.nativeElement.querySelectorAll('.max-h-80 > div.cursor-pointer') as NodeListOf<HTMLElement>;
    const match = Array.from(rows).find(r => r.textContent?.includes(title));
    if (!match) {
      throw new Error(`Notification element with title "${title}" not found in DOM`);
    }
    return match;
  }

  it('a) The list renders one row per notification and the unread badge shows the unread count', () => {
    currentUnreadCount = 2;
    currentNotifications = [
      {
        id: 101,
        title: 'اعلان اول',
        message: 'پیام تست ۱',
        notification_type: 'info',
        target_model: null,
        target_id: null,
        is_read: false,
        created_at: '2026-10-16T10:00:00Z'
      },
      {
        id: 102,
        title: 'اعلان دوم',
        message: 'پیام تست ۲',
        notification_type: 'info',
        target_model: null,
        target_id: null,
        is_read: false,
        created_at: '2026-10-16T10:00:00Z'
      },
      {
        id: 103,
        title: 'اعلان سوم',
        message: 'پیام تست ۳',
        notification_type: 'info',
        target_model: null,
        target_id: null,
        is_read: true,
        created_at: '2026-10-16T10:00:00Z'
      }
    ];

    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('button[aria-label="مرکز اعلان‌های سامانه"] span');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('2');

    openPanel();

    const rows = fixture.nativeElement.querySelectorAll('.max-h-80 > div.cursor-pointer');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('اعلان اول');
    expect(rows[0].textContent).toContain('پیام تست ۱');
    expect(rows[1].textContent).toContain('اعلان دوم');
    expect(rows[1].textContent).toContain('پیام تست ۲');
    expect(rows[2].textContent).toContain('اعلان سوم');
    expect(rows[2].textContent).toContain('پیام تست ۳');
  });

  it('b) Fleet: with the accounting registry and manager permission set, clicking a fleet_change_request item calls Router.navigate with changes tab', () => {
    mockAuth.user.mockReturnValue({
      permissions: ['perm_approve_fleet_manager'],
      is_superuser: false
    });

    const fleetItem: NotificationItem = {
      id: 201,
      title: 'درخواست تغییرات ناوگان',
      message: 'درخواست تغییرات راننده ثبت شد',
      notification_type: 'fleet_change_request',
      target_model: null,
      target_id: null,
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [fleetItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('درخواست تغییرات ناوگان');
    row.click();
    fixture.detectChanges();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/app/finance/manager-fleet'],
      { queryParams: { tab: 'changes' } }
    );
  });

  it('c) A VehicleDriverProfile item for the accountant permission set: calls Router.navigate with same arguments as handler spec', () => {
    mockAuth.user.mockReturnValue({
      permissions: ['perm_approve_fleet_finance'],
      is_superuser: false
    });

    currentVehicleResponse = {
      id: 12,
      plate_number: '12B345',
      approval_status: 'pending_accountant'
    };

    const vehicleItem: NotificationItem = {
      id: 301,
      title: 'پرونده ناوگان راننده',
      message: 'ناوگان جدید نیازمند تایید حسابدار است',
      notification_type: 'workflow',
      target_model: 'VehicleDriverProfile',
      target_id: '12',
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [vehicleItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('پرونده ناوگان راننده');
    row.click();
    fixture.detectChanges();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/app/finance/accountant-fleet'],
      { queryParams: { tab: 'new', q: '12B345' } }
    );
  });

  it('d1) A PersonnelProfile item for the supervisor permission set: calls Router.navigate with same arguments as handler spec', () => {
    mockAuth.user.mockReturnValue({
      permissions: ['perm_approve_personnel_supervisor'],
      is_superuser: false
    });

    currentProfileResponse = {
      id: 88,
      national_code: '0012345678',
      approval_status: 'pending_supervisor'
    };

    const personnelItem: NotificationItem = {
      id: 401,
      title: 'پرونده پرسنلی سرپرست',
      message: 'پرسنل جدید نیازمند تایید سرپرست کارگاه است',
      notification_type: 'workflow',
      target_model: 'PersonnelProfile',
      target_id: '88',
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [personnelItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('پرونده پرسنلی سرپرست');
    row.click();
    fixture.detectChanges();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/app/finance/supervisor-personnel'],
      { queryParams: { tab: 'new', q: '0012345678' } }
    );
  });

  it('d2) A PersonnelProfile item for a plain employee: calls Router.navigate with same arguments as handler spec', () => {
    mockAuth.user.mockReturnValue({
      permissions: [],
      is_superuser: false
    });

    currentProfileResponse = {
      id: 88,
      national_code: '0012345678',
      approval_status: 'approved',
      section: 4
    };

    const plainEmployeeItem: NotificationItem = {
      id: 402,
      title: 'پرونده پرسنلی کارمند',
      message: 'پرونده پرسنلی شما با موفقیت تایید شد',
      notification_type: 'workflow',
      target_model: 'PersonnelProfile',
      target_id: '88',
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [plainEmployeeItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('پرونده پرسنلی کارمند');
    row.click();
    fixture.detectChanges();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      ['/app/finance/employee-new-personnel'],
      { queryParams: { section_id: 4, search: '0012345678' } }
    );
  });

  it('e) An item with url calls Router.navigateByUrl with that url and no handler navigation', () => {
    mockAuth.user.mockReturnValue({
      permissions: ['perm_approve_personnel_supervisor'],
      is_superuser: false
    });

    const urlItem: NotificationItem = {
      id: 501,
      title: 'لینک مستقیم سامانه',
      message: 'هدایت به مرکز عملیات و پدافند',
      notification_type: 'system',
      target_model: 'PersonnelProfile',
      target_id: '88',
      url: '/app/operations/cockpit',
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [urlItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('لینک مستقیم سامانه');
    row.click();
    fixture.detectChanges();

    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/operations/cockpit');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('f) Warehouse-only registry: clicking a PersonnelProfile item marks it read, closes the panel, calls neither navigate nor navigateByUrl, and throws nothing', () => {
    mockRegistry.getExtensions.mockImplementation(() => []);

    const profileItem: NotificationItem = {
      id: 601,
      title: 'پرونده پرسنلی فقط انبار',
      message: 'اعلان بدون ماژول حسابداری',
      notification_type: 'workflow',
      target_model: 'PersonnelProfile',
      target_id: '88',
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [profileItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('پرونده پرسنلی فقط انبار');
    expect(() => {
      row.click();
      fixture.detectChanges();
    }).not.toThrow();

    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    expect(component.isOpen()).toBe(false);
    expect(profileItem.is_read).toBe(true);
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/601/mark-read/'),
      {},
      expect.any(Object)
    );
  });

  it('g) Every click marks the item read (visible read state in the DOM and the mocked mark-read HTTP call)', () => {
    const unreadItem: NotificationItem = {
      id: 701,
      title: 'اعلان نیازمند مطالعه',
      message: 'بررسی علامت‌گذاری خوانده‌شده',
      notification_type: 'info',
      target_model: null,
      target_id: null,
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [unreadItem];

    fixture.detectChanges();
    openPanel();

    const rowBefore = getNotificationRow('اعلان نیازمند مطالعه');
    const markBtnBefore = rowBefore.querySelector('button[title="علامت‌گذاری به عنوان خوانده‌شده"]');
    expect(markBtnBefore).toBeTruthy();

    rowBefore.click();
    fixture.detectChanges();

    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/701/mark-read/'),
      {},
      expect.any(Object)
    );
    expect(unreadItem.is_read).toBe(true);
    expect(component.unreadCount()).toBe(0);

    // پنل مجدداً باز می‌شود تا وضعیت خوانده‌شده در DOM بررسی گردد
    openPanel();
    const rowAfter = getNotificationRow('اعلان نیازمند مطالعه');
    const markBtnAfter = rowAfter.querySelector('button[title="علامت‌گذاری به عنوان خوانده‌شده"]');
    expect(markBtnAfter).toBeNull();
  });

  it('h) Clicking a chat notification (target_model === Conversation or notification_type === chat_message) opens the chat drawer', () => {
    const chatItem: NotificationItem = {
      id: 801,
      title: 'پیام چت جدید',
      message: 'سلام، لطفاً بررسی کنید',
      notification_type: 'chat_message',
      target_model: 'Conversation',
      target_id: 'conv-123',
      is_read: false,
      created_at: '2026-10-16T10:00:00Z'
    };
    currentUnreadCount = 1;
    currentNotifications = [chatItem];

    fixture.detectChanges();
    openPanel();

    const row = getNotificationRow('پیام چت جدید');
    row.click();
    fixture.detectChanges();

    expect(mockCommService.isChatDrawerOpen.set).toHaveBeenCalledWith(true);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    expect(component.isOpen()).toBe(false);
  });
});
