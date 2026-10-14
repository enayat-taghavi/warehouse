import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { IdCards, DEFAULT_CARD_TEXTS } from './id-cards';
import { AccountsHttpService, User, Role } from '../../../../core/http/accounts-http.service';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
import { ToastService } from '../../../../services/toast.service';
import { StateService } from '../../../../services/state.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { DomSanitizer } from '@angular/platform-browser';

describe('IdCards Component Comprehensive Tests (Tab 3: ID Cards & Gate Pass)', () => {
  let component: IdCards;
  let fixture: ComponentFixture<IdCards>;

  const mockUsersList: User[] = [
    {
      id: 1,
      username: 's.taghavi',
      first_name: 'سامان',
      last_name: 'تقوی سوق',
      national_code: '1280954310',
      phone_number: '09121234567',
      operational_zone: 'انبار مرکزی',
      assigned_warehouses: ['انبار مرکزی A', 'انبار قطعات یدکی'],
      avatar: null,
      blood_type: 'O+',
      emergency_contact: '09121234567',
      is_active: true,
      groups: [1],
      supervisor: null,
      email: 'saman@aalish.com',
      user_permissions: [],
      role_titles: ['مدیر انبار']
    },
    {
      id: 2,
      username: 'm.rezaei',
      first_name: 'محمد',
      last_name: 'رضایی',
      national_code: '0012345678',
      phone_number: '09129876543',
      operational_zone: 'انبار قطعات',
      assigned_warehouses: ['انبار قطعات یدکی'],
      avatar: null,
      blood_type: 'A+',
      emergency_contact: '09129876543',
      is_active: true,
      groups: [2],
      supervisor: 1,
      email: 'rezaei@aalish.com',
      user_permissions: [],
      role_titles: ['انباردار']
    }
  ];

  const mockRolesList: Role[] = [
    { id: 1, name: 'wh_manager', title: 'مدیر انبار', color: '#4f46e5', parent: null, permissions: [] },
    { id: 2, name: 'wh_clerk', title: 'انباردار', color: '#059669', parent: null, permissions: [] }
  ];

  const mockWarehousesList = [
    { id: 1, name: 'انبار مرکزی A', code: 'WH-01' },
    { id: 2, name: 'انبار قطعات یدکی', code: 'WH-02' }
  ];

  let mockToast: any;
  let mockAccountsHttp: any;
  let mockWarehouseHttp: any;
  let mockState: any;

  beforeEach(async () => {
    mockToast = {
      show: vi.fn()
    };

    mockAccountsHttp = {
      getUsers: vi.fn().mockReturnValue(of(mockUsersList)),
      getRoles: vi.fn().mockReturnValue(of(mockRolesList))
    };

    mockWarehouseHttp = {
      getAll: vi.fn().mockReturnValue(of(mockWarehousesList))
    };

    mockState = {
      appState: {
        users: [] as any[],
        roles: [] as any[],
        projects: [] as any[]
      }
    };

    await TestBed.configureTestingModule({
      imports: [IdCards],
      providers: [
        { provide: ToastService, useValue: mockToast },
        { provide: AccountsHttpService, useValue: mockAccountsHttp },
        { provide: WarehouseHttpService, useValue: mockWarehouseHttp },
        { provide: StateService, useValue: mockState },
        { provide: ModuleRegistryService, useValue: { isModuleInstalled: vi.fn().mockReturnValue(true) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(IdCards);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------
  // ۱. راه‌اندازی و بارگذاری داده‌ها (Initialization & Data Loading)
  // -------------------------------------------------------------
  describe('۱. راه‌اندازی و بارگذاری داده‌ها', () => {
    it('باید کامپوننت با موفقیت ایجاد شده و داده‌های کاربران و نقش‌ها را دریافت کند', () => {
      expect(component).toBeTruthy();
      expect(component.usersList.length).toBe(2);
      expect(component.rolesList.length).toBe(2);
      expect(component.warehousesList.length).toBe(2);
      expect(component.selectedUserId).toBe(1);
      expect(component.selectedUserIds.has(1)).toBe(true);
    });

    it('باید در صورت وجود کش در StateService، از درخواست مجدد به سرور خودداری کند', () => {
      mockState.appState.users = [...mockUsersList];
      mockState.appState.roles = [...mockRolesList];
      mockState.appState.projects = [...mockWarehousesList];

      const freshComp = new IdCards(
        mockState,
        mockAccountsHttp,
        mockWarehouseHttp,
        mockToast,
        TestBed.inject(DomSanitizer),
        (component as any).cdr,
        { isModuleInstalled: vi.fn().mockReturnValue(true) } as any
      );
      freshComp.ngOnInit();

      expect(freshComp.usersList.length).toBe(2);
      expect(freshComp.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // ۲. پریست‌ها و شخصی‌سازی تم و رنگ (Presets & Theme)
  // -------------------------------------------------------------
  describe('۲. پریست‌ها و قالب‌های آماده کارت', () => {
    it('باید پریست کارت پرسنلی عمودی (classic-vertical) را اعمال کند', () => {
      component.applyPreset('classic-vertical');
      expect(component.idCardSettings.presetLayout).toBe('classic-vertical');
      expect(component.idCardSettings.cardType).toBe('pvc-vertical');
      expect(component.idCardSettings.photoPosition).toBe('center');
      expect(component.idCardSettings.theme).toBe('corporate');
      expect(component.idCardSettings.fields.photo).toBe(true);
    });

    it('باید پریست کارت سینه افقی (badge-horizontal) را اعمال کند', () => {
      component.applyPreset('badge-horizontal');
      expect(component.idCardSettings.presetLayout).toBe('badge-horizontal');
      expect(component.idCardSettings.cardType).toBe('badge-horizontal');
      expect(component.idCardSettings.photoPosition).toBe('left');
    });

    it('باید پریست صنعتی/حراستی (industrial-security) با بارکد جلو را اعمال کند', () => {
      component.applyPreset('industrial-security');
      expect(component.idCardSettings.cardType).toBe('pvc-vertical');
      expect(component.idCardSettings.barcodePlacement).toBe('front');
      expect(component.idCardSettings.theme).toBe('industrial');
    });

    it('باید پریست فشرده بدون عکس (compact-minimal) را اعمال کند', () => {
      component.applyPreset('compact-minimal');
      expect(component.idCardSettings.cardType).toBe('badge-horizontal');
      expect(component.idCardSettings.fields.photo).toBe(false);
      expect(component.idCardSettings.barcodeType).toBe('2d');
    });

    it('باید انتخاب رنگ سفارشی تم را به حالت custom تغییر دهد', () => {
      component.setCustomColor('#dc2626');
      expect(component.idCardSettings.customColor).toBe('#dc2626');
      expect(component.idCardSettings.theme).toBe('custom');
      expect(component.effectiveCardColor).toBe('#dc2626');
    });

    it('باید رنگ مؤثر کارت برای تم صنعتی رنگ زرد انبار باشد', () => {
      component.idCardSettings.theme = 'industrial';
      expect(component.effectiveCardColor).toBe('#d97706');
    });

    it('باید رنگ مؤثر کارت برای تم حراست رنگ سربی تیره باشد', () => {
      component.idCardSettings.theme = 'security';
      expect(component.effectiveCardColor).toBe('#1e293b');
    });
  });

  // -------------------------------------------------------------
  // ۳. تنظیمات بارکد، موقعیت عکس و متن‌ها (Barcode & Text Settings)
  // -------------------------------------------------------------
  describe('۳. تنظیمات موقعیت عکس، بارکد و متن‌ها', () => {
    it('باید موقعیت عکس پرسنلی تغییر کند', () => {
      component.setPhotoPosition('top');
      expect(component.idCardSettings.photoPosition).toBe('top');
      component.setPhotoPosition('right');
      expect(component.idCardSettings.photoPosition).toBe('right');
    });

    it('باید نوع بارکد بین ۱ بعدی و ۲ بعدی تغییر یابد', () => {
      component.setBarcodeType('2d');
      expect(component.idCardSettings.barcodeType).toBe('2d');
      component.setBarcodeType('1d');
      expect(component.idCardSettings.barcodeType).toBe('1d');
    });

    it('باید محل قرارگیری بارکد تغییر یابد', () => {
      component.setBarcodePlacement('both');
      expect(component.idCardSettings.barcodePlacement).toBe('both');
      component.setBarcodePlacement('none');
      expect(component.idCardSettings.barcodePlacement).toBe('none');
    });

    it('باید ریست کردن متن‌ها به مقادیر پیش‌فرض سازمانی پیام موفقیت دهد', () => {
      component.idCardSettings.customTexts.companyName = 'شرکت متفرقه';
      component.resetToDefaultTexts();
      expect(component.idCardSettings.customTexts.companyName).toBe(DEFAULT_CARD_TEXTS.companyName);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('بازنشانی'));
    });
  });

  // -------------------------------------------------------------
  // ۴. چرخش کارت و کلیدهای میانبر (Card Flip & Shortcuts)
  // -------------------------------------------------------------
  describe('۴. چرخش کارت و کلیدهای میانبر', () => {
    it('باید متد toggleFlip وضعیت پشت و روی کارت را تغییر دهد', () => {
      expect(component.isCardFlipped).toBe(false);
      component.toggleFlip();
      expect(component.isCardFlipped).toBe(true);
      component.toggleFlip();
      expect(component.isCardFlipped).toBe(false);
    });

    it('باید متد setFlipped وضعیت را مستقیم تنظیم کند', () => {
      component.setFlipped(true);
      expect(component.isCardFlipped).toBe(true);
      component.setFlipped(false);
      expect(component.isCardFlipped).toBe(false);
    });

    it('باید فشردن کلید Space یا F کارت را بچرخاند', () => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      component.handleKeyDown(event);
      expect(component.isCardFlipped).toBe(true);

      const eventF = new KeyboardEvent('keydown', { key: 'f' });
      component.handleKeyDown(eventF);
      expect(component.isCardFlipped).toBe(false);
    });

    it('باید فشردن کلید Escape مودال‌های باز را ببندد', () => {
      component.isPreviewSheetModalOpen = true;
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      component.handleKeyDown(event);
      expect(component.isPreviewSheetModalOpen).toBe(false);

      component.isExportModalOpen = true;
      component.handleKeyDown(event);
      expect(component.isExportModalOpen).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // ۵. انتخاب کاربران و فیلترها (User Selection & Filtering)
  // -------------------------------------------------------------
  describe('۵. انتخاب پرسنل و فیلترها', () => {
    it('باید با انتخاب کاربر منفرد، activeUser به‌روز شود', () => {
      component.selectUser(mockUsersList[1]);
      expect(component.selectedUserId).toBe(2);
      expect(component.activeUser.username).toBe('m.rezaei');
    });

    it('باید متد toggleUserSelect کاربر را به چک‌باکس اضافه یا حذف کند', () => {
      component.selectedUserIds.clear();
      component.toggleUserSelect(2);
      expect(component.isUserSelected(2)).toBe(true);
      expect(component.selectedCount).toBe(1);

      component.toggleUserSelect(2);
      expect(component.isUserSelected(2)).toBe(false);
      expect(component.selectedCount).toBe(0);
    });

    it('باید متد toggleSelectAll همه پرسنل لیست را انتخاب یا لغو انتخاب کند', () => {
      component.selectedUserIds.clear();
      expect(component.areAllSelected).toBe(false);

      component.toggleSelectAll();
      expect(component.areAllSelected).toBe(true);
      expect(component.selectedCount).toBe(2);

      component.toggleSelectAll();
      expect(component.areAllSelected).toBe(false);
      expect(component.selectedCount).toBe(0);
    });

    it('باید فیلتر متنی نام یا شماره پرسنل لیست را پالایش کند', () => {
      component.searchQuery = 'رضایی';
      expect(component.filteredUsers.length).toBe(1);
      expect(component.filteredUsers[0].username).toBe('m.rezaei');

      component.searchQuery = 'ناموجود';
      expect(component.filteredUsers.length).toBe(0);
    });

    it('باید فیلتر نقش سازمانی کاربران متناظر را نشان دهد', () => {
      component.filterRoleId = 1;
      expect(component.filteredUsers.length).toBe(1);
      expect(component.filteredUsers[0].id).toBe(1);
    });

    it('باید getter لیست printableUsers در صورت نبود انتخاب، کاربر فعال را برگرداند', () => {
      component.selectedUserIds.clear();
      const printable = component.printableUsers;
      expect(printable.length).toBe(1);
      expect(printable[0].id).toBe(component.activeUser.id);
    });
  });

  // -------------------------------------------------------------
  // ۶. محاسبات چاپ دوطرفه و انطباق پشت و رو (Duplex Print Mirroring)
  // -------------------------------------------------------------
  describe('۶. محاسبات چاپ دوطرفه و انطباق پشت و رو', () => {
    it('باید متد getMirroredPrintableUsers ترتیب ستون‌ها را برای چاپ معکوس کند', () => {
      component.selectedUserIds.clear();
      component.selectedUserIds.add(1);
      component.selectedUserIds.add(2);

      // در حالت ۲ ستونه: ردیف اول [کاربر۱، کاربر۲] باید به [کاربر۲، کاربر۱] معکوس شود
      const mirrored = component.getMirroredPrintableUsers(2);
      expect(mirrored.length).toBe(2);
      expect(mirrored[0]?.id).toBe(2);
      expect(mirrored[1]?.id).toBe(1);
    });

    it('باید در صورت فرد بودن تعداد رکوردهای ستون، مقدار null درج شود', () => {
      component.selectedUserIds.clear();
      component.selectedUserIds.add(1);

      const mirrored = component.getMirroredPrintableUsers(2);
      expect(mirrored.length).toBe(2);
      expect(mirrored[0]).toBeNull();
      expect(mirrored[1]?.id).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // ۷. فرمت‌بندی انبارها، تاریخ انقضا و کد پرسنلی (Formatting Utilities)
  // -------------------------------------------------------------
  describe('۷. فرمت‌بندی انبارها، تاریخ انقضا و کد پرسنلی', () => {
    it('باید کد پرسنلی استاندارد را تولید کند', () => {
      const code = component.getUserPersonnelCode(mockUsersList[0]);
      expect(code).toBe('EMP-1001');
    });

    it('باید تاریخ انقضا برای مقدار صفر، نامحدود باشد', () => {
      expect(component.calculateExpiryString(0)).toBe('تا پایان پروژه (نامحدود)');
    });

    it('باید تاریخ انقضا برای روزهای مشخص، تاریخ شمسی برگرداند', () => {
      const str = component.calculateExpiryString(30);
      expect(str).toMatch(/[۰-۹0-9]{4}\/[۰-۹0-9]{2}\/[۰-۹0-9]{2}/);
    });

    it('باید آدرس لینک اعتبارسنجی QR Code را به درستی بسازد', () => {
      const url = component.getCardVerificationUrl(mockUsersList[0]);
      expect(url).toContain('/verify-card/EMP-1001');
    });

    it('باید خلاصه نام انبارها را به درستی تولید کند', () => {
      // حالت اول: وقتی تمام انبارها به کاربر منتسب شده، خلاصه هوشمند 'تمامی انبارها' باشد
      expect(component.getWarehouseSummary(mockUsersList[0], 1)).toBe('تمامی انبارها (دسترسی کامل)');

      // حالت دوم: وقتی تعداد کل انبارها بیشتر است و تعداد منتسب از حد فراتر می‌رود، خلاصه با (+1) نمایش یابد
      component.warehousesList = [
        ...mockWarehousesList,
        { id: 3, name: 'انبار قطعات ویژه', code: 'WH-03' }
      ] as any;
      const partialSummary = component.getWarehouseSummary(mockUsersList[0], 1);
      expect(partialSummary).toContain('(+1)');
    });

    it('باید گروه خونی و شماره تماس اضطراری را بازگرداند', () => {
      expect(component.getUserBloodType(mockUsersList[0])).toBe('O+');
      expect(component.getUserEmergencyContact(mockUsersList[0])).toBe('09121234567');
    });
  });

  // -------------------------------------------------------------
  // ۸. مودال‌های پیش‌نمایش و صدور (Preview & Export Modals)
  // -------------------------------------------------------------
  describe('۸. مودال‌های پیش‌نمایش و صدور دیجیتال', () => {
    it('باید مودال پیش‌نمایش شیت باز و بسته شود', () => {
      component.openSheetPreviewModal();
      expect(component.isPreviewSheetModalOpen).toBe(true);
      expect(component.previewSheetActiveTab).toBe('front');

      component.closeSheetPreviewModal();
      expect(component.isPreviewSheetModalOpen).toBe(false);
    });

    it('باید مودال صدور تصویر دیجیتال باز و بسته شود', () => {
      component.openExportModal();
      expect(component.isExportModalOpen).toBe(true);

      component.closeExportModal();
      expect(component.isExportModalOpen).toBe(false);
    });

    it('باید دستور پرینت با نمایش پیام مناسب فراخوانی شود', () => {
      component.executeCardPrint();
      expect(mockToast.show).toHaveBeenCalledWith('info', expect.stringContaining('شیت‌های چاپ'));
    });
  });
});
