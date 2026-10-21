import { IdCardsFacade } from './id-cards.facade';
import {
  CardCustomTexts,
  DEFAULT_CARD_TEXTS,
  IdCardSettings,
  drawPure2DBarcode,
  drawCanvas1DBarcode,
  drawCanvas2DBarcode,
  getBarcodeSvgString,
  getQrCodeSvgString
} from './id-cards.helpers';
import { Component, OnInit, ChangeDetectorRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AccountsHttpService, User, Role } from '../../../../core/http/accounts-http.service';
import { ScopeDirectoryService, ScopeDirectoryEntry } from '../../../../core/http/scope-directory.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { QRCodeWriter, BarcodeFormat, EncodeHintType } from '@zxing/library';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { ServerUrlPipe } from '../../../../shared/pipes/server-url.pipe';
import { printWindow, saveUrl } from '../../../../core/platform/file-output';
import { publicOrigin } from '../../../../core/platform/server-origin';

import { LOCKED_OFFLINE_SCOPES } from '../../../../core/services/offline-db';

@Component({
  selector: 'app-id-cards',
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent, TabBarComponent, ServerUrlPipe],
  providers: [IdCardsFacade],
  templateUrl: './id-cards.html',
  styleUrl: './id-cards.css'
})
export class IdCards implements OnInit {
  private facade = inject(IdCardsFacade);
  private readonly STORAGE_KEY = 'aalish_id_card_settings_v5';

  readonly PRESET_COLORS = [
    { name: 'سورمه‌ای سازمانی', color: '#4f46e5' },
    { name: 'آبی تیره رسمی', color: '#0284c7' },
    { name: 'زرد ایمنی و هشدار', color: '#d97706' },
    { name: 'زمردی عملیاتی', color: '#059669' },
    { name: 'زرشکی مدیریتی', color: '#dc2626' },
    { name: 'کربن متالیک تیره', color: '#1e293b' }
  ];

  idCardSettings: IdCardSettings = {
    dataSource: 'db',
    presetLayout: 'classic-vertical',
    cardType: 'pvc-vertical',
    theme: 'corporate',
    customColor: '#4f46e5',
    customDomain: '',
    photoPosition: 'center',
    barcodeType: '1d',
    barcodePlacement: 'back',
    expiryDays: 0,
    globalProjectNote: 'پروژه ساماندهی و مدیریت متمرکز',
    customTexts: { ...DEFAULT_CARD_TEXTS },
    fields: {
      photo: true,
      role: true,
      nationalCode: true,
      personnelCode: true,
      projects: true,
      barcode: true,
      expiry: true,
      bloodType: true,
      emergencyContact: true,
      globalNote: true,
      signature: true,
      hologram: true,
      regulations: true
    },
    printSide: 'both',
    printLayout: 'laminate-side-by-side'
  };

  isCardFlipped: boolean = false;
  selectedUserId: number | null = null;
  selectedUserIds: Set<number> = new Set<number>();
  
  searchQuery: string = '';
  filterRoleId: number | 'ALL' = 'ALL';
  filterWarehouseId: string | 'ALL' = 'ALL';

  usersList: User[] = [];
  rolesList: Role[] = [];
  warehousesList: ScopeDirectoryEntry[] = [];
  isLoading: boolean = false;
  
  // Settings Tab in Control Panel
  settingsActiveTab: 'presets-layout' | 'texts-info' | 'fields-visibility' = 'presets-layout';
  readonly settingsTabs: TabDef[] = [
    { id: 'presets-layout', label: 'چیدمان و رنگ', icon: 'grid' },
    { id: 'texts-info', label: 'متن‌ها و پروژه', icon: 'edit' },
    { id: 'fields-visibility', label: 'فیلدهای کارت', icon: 'eye' }
  ];

  // Digital Export Modal
  isExportModalOpen: boolean = false;
  exportSide: 'front' | 'back' | 'both' = 'both';
  exportScale: number = 2; // 1x, 2x, 3x
  isExportingImage: boolean = false;

  readonly exportSideTabs: TabDef[] = [
    { id: 'both', label: 'دورو (رو و پشت)', shortLabel: 'دورو', icon: 'id-card' },
    { id: 'front', label: 'فقط روی کارت', shortLabel: 'رو', icon: 'file-text' },
    { id: 'back', label: 'فقط پشت کارت', shortLabel: 'پشت', icon: 'copy' }
  ];

  // مودال max-w-xl حدود ۵۲۸px و در ۳۶۰px حدود ۲۸۰px جا دارد؛ نوار تب نمی‌شکند، پس عنوان‌ها کوتاه و زیر sm کوتاه‌تر.
  readonly exportScaleTabs: TabDef[] = [
    { id: '1', label: '۱× استاندارد (72 DPI)', shortLabel: '۱×' },
    { id: '2', label: '۲× HD پیشنهادی (150 DPI)', shortLabel: '۲× HD' },
    { id: '3', label: '۳× Ultra (300 DPI)', shortLabel: '۳× Ultra' }
  ];

  // Sheet Live Preview Modal (A4 Print Preview)
  isPreviewSheetModalOpen: boolean = false;
  previewSheetActiveTab: 'front' | 'back' = 'front';

  readonly previewSheetTabs: TabDef[] = [
    { id: 'front', label: 'صفحه ۱: روی کارت‌ها (Front)', icon: 'file-text' },
    { id: 'back', label: 'صفحه ۲: پشت کارت‌ها (Back)', icon: 'copy' }
  ];

  onSettingsTabChange(tabId: string): void {
    if (tabId === 'presets-layout' || tabId === 'texts-info' || tabId === 'fields-visibility') {
      this.settingsActiveTab = tabId;
    }
  }

  onExportSideChange(tabId: string): void {
    if (tabId === 'both' || tabId === 'front' || tabId === 'back') {
      this.exportSide = tabId;
    }
  }

  onExportScaleChange(tabId: string): void {
    const scale = Number(tabId);
    if (scale === 1 || scale === 2 || scale === 3) {
      this.exportScale = scale;
    }
  }

  onPreviewSheetTabChange(tabId: string): void {
    if (tabId === 'front' || tabId === 'back') {
      this.previewSheetActiveTab = tabId;
    }
  }

  private barcodeCache: Map<string, SafeHtml> = new Map();

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    // Escape: close modals
    if (event.key === 'Escape') {
      if (this.isPreviewSheetModalOpen) {
        event.preventDefault();
        this.closeSheetPreviewModal();
      } else if (this.isExportModalOpen) {
        event.preventDefault();
        this.closeExportModal();
      }
      return;
    }

    // Ctrl+P: print sheet
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
      event.preventDefault();
      this.executeCardPrint();
      return;
    }

    // Ctrl+S: save settings
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveSettings();
      return;
    }

    // Space / F: Flip card if not typing
    if (!isInsideInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'f' || event.key === 'F' || event.key === 'ب' || event.key === ' ') {
        event.preventDefault();
        this.toggleFlip();
      }
    }
  }

  public state = inject(StateService);
  private accountsHttp = inject(AccountsHttpService);
  private scopeDirectory = inject(ScopeDirectoryService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private registry = inject(ModuleRegistryService);

  constructor() {}

  get isWarehouseInstalled(): boolean {
    return this.registry.getExtensions('idCards').some(e => e.extension.supported);
  }

  get isWarehouseScope(): boolean {
    // قلمرو دوم قفل‌شده (مالی) کارت انبار ندارد
    return this.isWarehouseInstalled && this.state.appState.appScope !== LOCKED_OFFLINE_SCOPES[1];
  }

  ngOnInit() {
    this.restoreSavedSettings();
    this.loadData();
  }

  private restoreSavedSettings() {
    try {
      const saved = this.facade.loadSavedSettings();
      if (saved) {
        this.idCardSettings = {
          ...this.idCardSettings,
          ...saved,
          customTexts: { ...DEFAULT_CARD_TEXTS, ...(saved.customTexts || {}) },
          fields: { ...this.idCardSettings.fields, ...(saved.fields || {}) }
        };
      }
    } catch (e) {
      console.warn('Failed to load id card settings from localStorage', e);
    }
  }

  saveSettings() {
    this.facade.saveSettings(this.idCardSettings);
  }

  resetToDefaultTexts() {
    this.idCardSettings.customTexts = { ...DEFAULT_CARD_TEXTS };
    this.saveSettings();
    this.toast.show('success', 'تمام متن‌های کارت به حالت پیش‌فرض سازمانی بازنشانی شدند.');
  }

  loadData() {
    // بازاستفاده از کش محلی در صورت لود قبلی توسط کامپوننت مادر Users جهت حذف تکرار درخواست شبکه
    if (this.state.appState.users && this.state.appState.users.length > 0) {
      this.usersList = this.state.appState.users;
      this.rolesList = this.state.appState.roles || [];
      this.warehousesList = this.state.appState.projects || [];
      if (this.usersList.length > 0 && !this.selectedUserId) {
        this.selectedUserId = this.usersList[0].id;
        this.selectedUserIds.add(this.usersList[0].id);
      }
      this.isLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.isLoading = true;

    // Load Roles
    this.accountsHttp.getRoles().subscribe({
      next: (roles) => {
        this.rolesList = roles || [];
        this.state.appState.roles = this.rolesList;
      },
      error: () => {}
    });

    // Load Warehouses
    this.scopeDirectory.getAll().subscribe({
      next: (whs) => {
        this.warehousesList = whs || [];
      },
      error: () => {}
    });

    // Load Users
    this.accountsHttp.getUsers().subscribe({
      next: (users) => {
        this.usersList = users || [];
        this.state.appState.users = this.usersList;
        if (this.usersList.length > 0) {
          this.selectedUserId = this.usersList[0].id;
          this.selectedUserIds.add(this.usersList[0].id);
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.usersList = this.state.appState.users || [];
        if (this.usersList.length === 0) {
          this.usersList = [
            {
              id: 1,
              username: 's.taghavi',
              first_name: 'سامان',
              last_name: 'تقوی سوق',
              national_code: '1280954310',
              phone_number: '09121234567',
              operational_zone: this.isWarehouseScope ? 'انبار مرکزی' : 'دفتر مرکزی / ستاد',
              assigned_warehouses: this.isWarehouseScope ? ['انبار مرکزی A', 'انبار قطعات یدکی'] : ['دفتر مرکزی', 'پروژه مرکزی'],
              avatar: null,
              blood_type: 'O+',
              emergency_contact: '09121234567',
              is_active: true,
              groups: [1],
              supervisor: null,
              email: 'saman@aalish.com',
              user_permissions: []
            }
          ];
        }
        if (this.usersList.length > 0) {
          this.selectedUserId = this.usersList[0].id;
          this.selectedUserIds.add(this.usersList[0].id);
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  get filteredUsers(): User[] {
    return this.usersList.filter(u => {
      const q = this.searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        (u.first_name && u.first_name.toLowerCase().includes(q)) ||
        (u.last_name && u.last_name.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.national_code && u.national_code.includes(q));

      const matchesRole = this.filterRoleId === 'ALL' || (u.groups && u.groups.includes(this.filterRoleId as number));
      const matchesWh = this.filterWarehouseId === 'ALL' || (u.assigned_warehouses && u.assigned_warehouses.some(w => String(w) === String(this.filterWarehouseId) || String(w) === this.getWarehouseNameById(this.filterWarehouseId)));

      return matchesSearch && matchesRole && matchesWh;
    });
  }

  getWarehouseNameById(whId: string | number): string {
    const found = this.warehousesList.find(w => String(w.id) === String(whId) || w.name === String(whId));
    return found?.name || '';
  }

  getWarehouseNamesList(user: User): string[] {
    const defaultZone = this.isWarehouseScope ? 'انبار مرکزی' : 'دفتر مرکزی';
    if (!user || !user.assigned_warehouses || user.assigned_warehouses.length === 0) {
      return [defaultZone];
    }
    const names: string[] = [];
    for (const item of user.assigned_warehouses) {
      const wh = this.warehousesList.find(w => String(w.id) === String(item) || w.name === String(item));
      if (wh && wh.name) {
        names.push(wh.name);
      } else if (typeof item === 'string' && isNaN(Number(item))) {
        names.push(item);
      }
    }
    return names.length > 0 ? names : [defaultZone];
  }

  /**
   * خلاصه‌سازی هوشمند نام انبارها جهت جلوگیری از سرریز یا شکستن کادر محدود کارت
   */
  getWarehouseSummary(user: User, maxItems: number = 1): string {
    const list = this.getWarehouseNamesList(user);
    if (this.warehousesList.length > 0 && list.length >= this.warehousesList.length && this.warehousesList.length > 1) {
      return this.isWarehouseScope ? 'تمامی انبارها (دسترسی کامل)' : 'تمامی پروژه‌ها (دسترسی کامل)';
    }
    if (list.length <= maxItems) {
      return list.join('، ');
    }
    const remaining = list.length - maxItems;
    return `${list.slice(0, maxItems).join('، ')} (+${remaining})`;
  }

  getWarehouseFullText(user: User): string {
    return this.getWarehouseNamesList(user).join('، ');
  }

  get activeUser(): User {
    if (this.selectedUserId) {
      const found = this.usersList.find(u => u.id === this.selectedUserId);
      if (found) return found;
    }
    return this.usersList[0] || {
      id: 1,
      username: 's.taghavi',
      first_name: 'سامان',
      last_name: 'تقوی سوق',
      national_code: '1280954310',
      phone_number: '09121234567',
      operational_zone: this.isWarehouseScope ? 'انبار مرکزی' : 'دفتر مرکزی / ستاد',
      assigned_warehouses: this.isWarehouseScope ? ['انبار مرکزی A', 'انبار قطعات یدکی'] : ['دفتر مرکزی', 'پروژه مرکزی'],
      avatar: null,
      blood_type: 'O+',
      emergency_contact: '09121234567',
      is_active: true,
      groups: [1],
      supervisor: null,
      email: '',
      user_permissions: []
    };
  }

  get effectiveCardColor(): string {
    if (this.idCardSettings.theme === 'custom') {
      return this.idCardSettings.customColor || '#4f46e5';
    }
    if (this.idCardSettings.theme === 'industrial') {
      return '#d97706';
    }
    if (this.idCardSettings.theme === 'security') {
      return '#1e293b';
    }
    return this.activeRole.color || '#4f46e5';
  }

  get activeRole(): { title: string; color: string } {
    return this.getUserRole(this.activeUser);
  }

  getUserRole(user: User): { title: string; color: string } {
    if (!user) return { title: 'پرسنل سازمانی', color: '#4f46e5' };
    if (user.role_titles && user.role_titles.length > 0) {
      const roleObj = this.rolesList.find(r => user.groups && user.groups.includes(r.id));
      return {
        title: user.role_titles[0],
        color: roleObj?.color || '#4f46e5'
      };
    }
    if (user.groups && user.groups.length > 0) {
      const roleObj = this.rolesList.find(r => r.id === user.groups[0]);
      if (roleObj) return { title: roleObj.title || roleObj.name, color: roleObj.color || '#4f46e5' };
    }
    return { title: 'پرسنل و کاربر سازمانی', color: '#4f46e5' };
  }

  getUserAvatarInitial(user: User): string {
    if (user?.first_name) return user.first_name[0];
    if (user?.username) return user.username[0].toUpperCase();
    return 'پ';
  }

  getUserPersonnelCode(user: User): string {
    const rawId = user?.id || 1;
    return `EMP-${1000 + rawId}`;
  }

  getCardVerificationUrl(user: User): string {
    const code = this.getUserPersonnelCode(user);
    let base = (this.idCardSettings.customDomain || '').trim();
    if (!base) {
      base = publicOrigin() || 'https://app.farsalish.ir';
    }
    base = base.replace(/\/+$/, '');
    return `${base}/verify-card/${code}`;
  }

  getUserBloodType(user: User): string {
    return user?.blood_type || 'ثبت‌نشده';
  }

  getBloodType(user: User): string {
    return this.getUserBloodType(user);
  }

  getUserEmergencyContact(user: User): string {
    return user?.emergency_contact || user?.phone_number || 'ثبت‌نشده';
  }

  getEmergencyContact(user: User): string {
    return this.getUserEmergencyContact(user);
  }

  get expiryText(): string {
    return this.calculateExpiryString(this.idCardSettings.expiryDays);
  }

  calculateExpiryString(days: number | string): string {
    const d = parseInt(days as string) || 0;
    if (d === 0) return 'تا پایان پروژه (نامحدود)';
    const future = new Date();
    future.setDate(future.getDate() + d);
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(future);
  }

  applyPreset(preset: 'classic-vertical' | 'badge-horizontal' | 'industrial-security' | 'compact-minimal') {
    this.idCardSettings.presetLayout = preset;
    if (preset === 'classic-vertical') {
      this.idCardSettings.cardType = 'pvc-vertical';
      this.idCardSettings.photoPosition = 'center';
      this.idCardSettings.barcodeType = '1d';
      this.idCardSettings.barcodePlacement = 'back';
      this.idCardSettings.theme = 'corporate';
      this.idCardSettings.fields.photo = true;
    } else if (preset === 'badge-horizontal') {
      this.idCardSettings.cardType = 'badge-horizontal';
      this.idCardSettings.photoPosition = 'left';
      this.idCardSettings.barcodeType = '1d';
      this.idCardSettings.barcodePlacement = 'back';
      this.idCardSettings.theme = 'corporate';
      this.idCardSettings.fields.photo = true;
    } else if (preset === 'industrial-security') {
      this.idCardSettings.cardType = 'pvc-vertical';
      this.idCardSettings.photoPosition = 'center';
      this.idCardSettings.barcodeType = '1d';
      this.idCardSettings.barcodePlacement = 'front';
      this.idCardSettings.theme = 'industrial';
      this.idCardSettings.fields.photo = true;
    } else if (preset === 'compact-minimal') {
      this.idCardSettings.cardType = 'badge-horizontal';
      this.idCardSettings.photoPosition = 'right';
      this.idCardSettings.barcodeType = '2d';
      this.idCardSettings.barcodePlacement = 'front';
      this.idCardSettings.theme = 'security';
      this.idCardSettings.fields.photo = false;
    }
    this.saveSettings();
  }

  toggleFlip() {
    this.isCardFlipped = !this.isCardFlipped;
  }

  setFlipped(state: boolean) {
    this.isCardFlipped = state;
  }

  selectUser(user: User) {
    this.selectedUserId = user.id;
    if (this.selectedUserIds.size <= 1) {
      this.selectedUserIds.clear();
      this.selectedUserIds.add(user.id);
    }
  }

  isUserSelected(id: number): boolean {
    return this.selectedUserIds.has(id);
  }

  toggleUserSelect(id: number, event?: Event) {
    if (event) event.stopPropagation();
    if (this.selectedUserIds.has(id)) {
      this.selectedUserIds.delete(id);
    } else {
      this.selectedUserIds.add(id);
    }
  }

  toggleSelectAll() {
    const visible = this.filteredUsers;
    const allSelected = visible.every(u => this.selectedUserIds.has(u.id));
    if (allSelected) {
      visible.forEach(u => this.selectedUserIds.delete(u.id));
    } else {
      visible.forEach(u => this.selectedUserIds.add(u.id));
    }
  }

  get areAllSelected(): boolean {
    const visible = this.filteredUsers;
    if (visible.length === 0) return false;
    return visible.every(u => this.selectedUserIds.has(u.id));
  }

  get selectedCount(): number {
    return this.selectedUserIds.size;
  }

  get printableUsers(): User[] {
    if (this.selectedUserIds.size > 0) {
      return this.usersList.filter(u => this.selectedUserIds.has(u.id));
    }
    return [this.activeUser];
  }

  setCustomColor(color: string) {
    this.idCardSettings.customColor = color;
    this.idCardSettings.theme = 'custom';
    this.saveSettings();
  }

  setPhotoPosition(pos: 'center' | 'top' | 'left' | 'right') {
    this.idCardSettings.photoPosition = pos;
    this.saveSettings();
  }

  setBarcodeType(type: '1d' | '2d') {
    this.idCardSettings.barcodeType = type;
    this.saveSettings();
  }

  setBarcodePlacement(placement: 'front' | 'back' | 'both' | 'none') {
    this.idCardSettings.barcodePlacement = placement;
    this.saveSettings();
  }

  getMirroredPrintableUsers(columns: number): (User | null)[] {
    const list = this.printableUsers;
    if (!list || list.length === 0) return [];
    const mirrored: (User | null)[] = [];
    for (let i = 0; i < list.length; i += columns) {
      const chunk: (User | null)[] = list.slice(i, i + columns);
      while (chunk.length < columns) {
        chunk.push(null);
      }
      // معکوس کردن افقی ستون‌ها برای انطباق فیزیکی پشت و رو در پرینتر
      chunk.reverse();
      mirrored.push(...chunk);
    }
    return mirrored;
  }

  openSheetPreviewModal() {
    this.previewSheetActiveTab = 'front';
    this.isPreviewSheetModalOpen = true;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  closeSheetPreviewModal() {
    this.isPreviewSheetModalOpen = false;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  executeCardPrint() {
    this.saveSettings();
    const count = this.printableUsers.length;
    this.toast.show('info', `در حال آماده‌سازی شیت‌های چاپ برای ${count} پرسنل...`);
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    setTimeout(() => {
      printWindow();
    }, 250);
  }

  openExportModal() {
    this.isExportModalOpen = true;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  closeExportModal() {
    this.isExportModalOpen = false;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  private loadAvatarImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 1500);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(img);
        }
      };
      img.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
      img.src = url;
    });
  }

  /**
   * صدور و دانلود تصویر دیجیتال کارت به فرمت PNG با رندر باکیفیت و عکس واقعی
   */
  async exportDigitalCard(side: 'front' | 'back' | 'both' = this.exportSide, scale: number = this.exportScale) {
    this.isExportingImage = true;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    const user = this.activeUser;
    const cleanName = `${user.first_name || 'Personnel'}_${user.last_name || user.id}`.replace(/\s+/g, '_');
    this.toast.show('info', `در حال پردازش و رندر خروجی تصویر (${scale}x)...`);

    try {
      // Load real avatar image if present
      let avatarImg: HTMLImageElement | null = null;
      if (user.avatar) {
        avatarImg = await this.loadAvatarImage(user.avatar);
      }

      const isVertical = this.idCardSettings.cardType === 'pvc-vertical';
      const cardW = isVertical ? 340 : 540;
      const cardH = isVertical ? 540 : 340;

      const totalW = side === 'both' ? (cardW * 2 + 60) * scale : (cardW + 40) * scale;
      const totalH = (cardH + 40) * scale;

      const canvas = document.createElement('canvas');
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        this.toast.show('error', 'مرورگر از خروجی گرافیکی پشتیبانی نمی‌کند.');
        this.isExportingImage = false;
        return;
      }

      ctx.scale(scale, scale);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, totalW / scale, totalH / scale);

      if (side === 'front' || side === 'both') {
        const offsetX = 20;
        const offsetY = 20;
        this.drawCardFaceOnCanvas(ctx, user, 'front', offsetX, offsetY, cardW, cardH, isVertical, avatarImg);
      }

      if (side === 'back' || side === 'both') {
        const offsetX = side === 'both' ? cardW + 40 : 20;
        const offsetY = 20;
        this.drawCardFaceOnCanvas(ctx, user, 'back', offsetX, offsetY, cardW, cardH, isVertical, avatarImg);
      }

      // Download triggered
      void saveUrl(canvas.toDataURL('image/png', 1.0), `ID_CARD_${cleanName}_${side.toUpperCase()}_${scale}X.png`);

      this.toast.show('success', `تصویر کارت دیجیتال با موفقیت دانلود شد.`);
      this.isExportModalOpen = false;
    } catch (err) {
      console.error('Export error', err);
      this.toast.show('error', 'خطا در صدور خروجی دیجیتال.');
    } finally {
      this.isExportingImage = false;
      this.cdr.markForCheck();
    }
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number {
    if (!text) return y;
    const words = text.split(' ');
    let line = '';
    let curY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, curY);
        line = words[n] + ' ';
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, curY);
    return curY + lineHeight;
  }

  private drawCardFaceOnCanvas(
    ctx: CanvasRenderingContext2D,
    user: User,
    side: 'front' | 'back',
    x: number,
    y: number,
    w: number,
    h: number,
    isVertical: boolean,
    avatarImg: HTMLImageElement | null
  ) {
    const radius = 16;
    const mainColor = this.effectiveCardColor;
    const texts = this.idCardSettings.customTexts;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();

    if (side === 'front') {
      if (isVertical) {
        // === VERTICAL FRONT FACE ===
        const headerHeight = 110;
        const grad = ctx.createLinearGradient(x, y, x + w, y + headerHeight);
        grad.addColorStop(0, mainColor);
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, headerHeight);

        // Pattern dots
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        for (let py = y + 8; py < y + headerHeight; py += 12) {
          for (let px = x + 10; px < x + w; px += 14) {
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.direction = 'rtl';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(texts.companyName, x + w / 2, y + 36);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText(texts.companySub, x + w / 2, y + 50);

        if (this.idCardSettings.fields.photo) {
          const avatarW = 90;
          const avatarH = 108;
          let avX = x + (w - avatarW) / 2;
          if (this.idCardSettings.photoPosition === 'right') avX = x + w - avatarW - 20;
          if (this.idCardSettings.photoPosition === 'left') avX = x + 20;
          const avY = y + headerHeight - 36;

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(avX, avY, avatarW, avatarH, 12);
          ctx.fillStyle = '#f1f5f9';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3.5;
          ctx.stroke();
          ctx.clip();

          if (avatarImg) {
            ctx.drawImage(avatarImg, avX, avY, avatarW, avatarH);
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 30px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.getUserAvatarInitial(user), avX + avatarW / 2, avY + avatarH / 2 + 10);
          }
          ctx.restore();
        }

        const nameY = this.idCardSettings.fields.photo ? y + headerHeight + 86 : y + headerHeight + 35;
        const nameX = x + w / 2;
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${user.first_name || ''} ${user.last_name || ''}`, nameX, nameY);

        if (this.idCardSettings.fields.role) {
          const role = this.getUserRole(user);
          ctx.font = 'bold 10px Vazirmatn, sans-serif';
          const roleMetrics = ctx.measureText(role.title);
          const pillW = Math.min(roleMetrics.width + 16, w - 40);
          const pillH = 20;
          const pillX = nameX - pillW / 2;
          const pillY = nameY + 10;

          ctx.fillStyle = mainColor + '18';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 10);
          ctx.fill();
          ctx.strokeStyle = mainColor + '50';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = mainColor;
          ctx.textAlign = 'center';
          ctx.fillText(role.title, nameX, pillY + 14);
        }

        // Info box
        const infoStartY = y + h - 130;
        ctx.strokeStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.moveTo(x + 20, infoStartY - 8);
        ctx.lineTo(x + w - 20, infoStartY - 8);
        ctx.stroke();

        ctx.font = 'bold 9px Vazirmatn, sans-serif';
        ctx.textAlign = 'right';

        if (this.idCardSettings.fields.personnelCode) {
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('کد پرسنلی:', x + w - 20, infoStartY + 10);
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(this.getUserPersonnelCode(user), x + 20, infoStartY + 10);
          ctx.textAlign = 'right';
          ctx.font = 'bold 9px Vazirmatn, sans-serif';
        }

        if (this.idCardSettings.fields.projects) {
          const whSummary = this.getWarehouseSummary(user, 1);
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('مجوز تردد:', x + w - 20, infoStartY + 28);
          ctx.fillStyle = '#4338ca';
          ctx.font = 'bold 9px Vazirmatn, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(whSummary, x + 20, infoStartY + 28);
          ctx.textAlign = 'right';
        }

        // Barcode on Front Face
        if (this.idCardSettings.fields.barcode && (this.idCardSettings.barcodePlacement === 'front' || this.idCardSettings.barcodePlacement === 'both')) {
          if (this.idCardSettings.barcodeType === '1d') {
            const barY = y + h - 68;
            this.drawCanvas1DBarcode(ctx, this.getUserPersonnelCode(user), x + 20, barY, w - 40, 24);
          } else {
            const qrSize = 64;
            const qrX = x + (w - qrSize) / 2;
            const qrY = y + h - 98;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(qrX, qrY, qrSize, qrSize, 10);
            ctx.fill();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.stroke();
            this.drawPure2DBarcode(ctx, this.getCardVerificationUrl(user), qrX + 4, qrY + 4, qrSize - 8);
          }
        }

        // Expiry footer
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y + h - 30, w, 30);
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(x, y + h - 30);
        ctx.lineTo(x + w, y + h - 30);
        ctx.stroke();

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 9px Vazirmatn, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`اعتبار: ${this.expiryText}`, x + w - 16, y + h - 11);

        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(this.getUserPersonnelCode(user), x + 16, y + h - 11);

      } else {
        // === HORIZONTAL FRONT FACE ===
        const stripeW = 38;
        // Right vertical stripe (GATE PASS)
        ctx.fillStyle = mainColor;
        ctx.fillRect(x + w - stripeW, y, stripeW, h);

        ctx.save();
        ctx.translate(x + w - stripeW / 2, y + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GATE PASS · PERMIT', 0, 3);
        ctx.restore();

        const contentW = w - stripeW;

        // Header
        ctx.direction = 'rtl';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(texts.companyName, x + contentW - 20, y + 28);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText(texts.companySub, x + contentW - 20, y + 43);

        // Header 1D Barcode (if selected)
        if (this.idCardSettings.fields.barcode && (this.idCardSettings.barcodePlacement === 'front' || this.idCardSettings.barcodePlacement === 'both') && this.idCardSettings.barcodeType === '1d') {
          this.drawCanvas1DBarcode(ctx, this.getUserPersonnelCode(user), x + 20, y + 14, 110, 24);
        }

        // Header separator line
        ctx.strokeStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.moveTo(x + 20, y + 54);
        ctx.lineTo(x + contentW - 20, y + 54);
        ctx.stroke();

        // Photo & Info & QR Section
        const avatarW = 76;
        const avatarH = 94;
        const avatarY = y + 68;
        const qrBoxW = 120;
        const qrBoxH = 120;
        const qrInnerSize = 106;

        let photoX = x + contentW - avatarW - 16;
        let qrX = x + 16;
        let qrY = y + 66;
        let detailsX = photoX - 14;

        if (this.idCardSettings.photoPosition === 'left') {
          photoX = x + 16;
          qrX = x + contentW - qrBoxW - 16;
          qrY = y + 66;
          detailsX = qrX - 14;
        }

        // Draw Avatar
        if (this.idCardSettings.fields.photo) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(photoX, avatarY, avatarW, avatarH, 10);
          ctx.fillStyle = '#f1f5f9';
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.clip();

          if (avatarImg) {
            ctx.drawImage(avatarImg, photoX, avatarY, avatarW, avatarH);
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 28px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.getUserAvatarInitial(user), photoX + avatarW / 2, avatarY + avatarH / 2 + 10);
          }
          ctx.restore();
        }

        // Details
        ctx.direction = 'rtl';
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('نام و نام خانوادگی:', detailsX, avatarY + 12);

        // Name
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 15px Vazirmatn, Tahoma, sans-serif';
        ctx.fillText(`${user.first_name || ''} ${user.last_name || ''}`, detailsX, avatarY + 34);

        // Role Badge Pill
        if (this.idCardSettings.fields.role) {
          const role = this.getUserRole(user);
          ctx.font = 'bold 10px Vazirmatn, sans-serif';
          const roleMetrics = ctx.measureText(role.title);
          const pillW = roleMetrics.width + 16;
          const pillH = 22;
          const pillX = detailsX - pillW;
          const pillY = avatarY + 48;

          ctx.fillStyle = '#eef2ff';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 6);
          ctx.fill();
          ctx.strokeStyle = '#e0e7ff';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#4338ca';
          ctx.textAlign = 'center';
          ctx.fillText(role.title, pillX + pillW / 2, pillY + 15);
          ctx.textAlign = 'right';
        }

        // Permit (Warehouse summary)
        if (this.idCardSettings.fields.projects) {
          const whSummary = this.getWarehouseSummary(user, 2);
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 10px Vazirmatn, sans-serif';
          ctx.fillText('مجوز تردد: ', detailsX, avatarY + 90);
          const lblW = ctx.measureText('مجوز تردد: ').width;
          ctx.fillStyle = '#1e293b';
          ctx.fillText(whSummary, detailsX - lblW, avatarY + 90);
        }

        // Dedicated Large QR Code Box (2D) on Front Face
        if (this.idCardSettings.fields.barcode && (this.idCardSettings.barcodePlacement === 'front' || this.idCardSettings.barcodePlacement === 'both') && this.idCardSettings.barcodeType === '2d') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(qrX, qrY, qrBoxW, qrBoxH, 12);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          this.drawPure2DBarcode(ctx, this.getCardVerificationUrl(user), qrX + 7, qrY + 7, qrInnerSize);

          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 8px Vazirmatn, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('استعلام اصالت کارت', qrX + qrBoxW / 2, qrY + qrBoxH + 14);
        }

        // Footer
        ctx.strokeStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.moveTo(x + 20, y + h - 36);
        ctx.lineTo(x + contentW - 20, y + h - 36);
        ctx.stroke();

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 9px Vazirmatn, sans-serif';
        ctx.textAlign = 'right';
        if (this.idCardSettings.fields.expiry) {
          ctx.fillText(`اعتبار: ${this.expiryText}`, x + contentW - 20, y + h - 14);
        }
        if (this.idCardSettings.fields.personnelCode) {
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(this.getUserPersonnelCode(user), x + 20, y + h - 14);
        }
      }

    } else {
      // === BACK FACE ===
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x, y, w, h);

      // Security waves simulation
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < h + w; i += 16) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x, y + i);
        ctx.stroke();
      }

      if (isVertical) {
        // === VERTICAL BACK FACE (340 x 540) ===
        ctx.direction = 'rtl';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(texts.backHeaderTitle, x + w - 20, y + 28);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText(texts.backHeaderSub, x + w - 20, y + 40);

        // Header dot
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(x + 24, y + 28, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(x + 20, y + 48);
        ctx.lineTo(x + w - 20, y + 48);
        ctx.stroke();

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 9px Vazirmatn, Tahoma, sans-serif';
        let lineY = y + 64;

        if (this.idCardSettings.fields.regulations) {
          lineY = this.wrapText(ctx, `• ${texts.regulationsText}`, x + w - 20, lineY, w - 40, 15);
        }
        if (this.idCardSettings.fields.nationalCode) {
          ctx.fillText(`• کد ملی دارنده: ${user.national_code || '---'}`, x + w - 20, lineY);
          lineY += 17;
        }
        if (this.idCardSettings.fields.bloodType && user.blood_type) {
          ctx.fillText(`• گروه خونی: ${this.getUserBloodType(user)}`, x + w - 20, lineY);
          lineY += 17;
        }
        if (this.idCardSettings.fields.emergencyContact) {
          ctx.fillText(`• تماس اضطراری: ${this.getUserEmergencyContact(user)}`, x + w - 20, lineY);
          lineY += 17;
        }
        if (this.idCardSettings.fields.globalNote) {
          ctx.fillText(`• پروژه: ${this.idCardSettings.globalProjectNote}`, x + w - 20, lineY);
          lineY += 17;
        }

        // Dedicated Large QR Code Box (2.5x to 3x Larger) on Back Face
        if (this.idCardSettings.fields.barcode && (this.idCardSettings.barcodePlacement === 'back' || this.idCardSettings.barcodePlacement === 'both')) {
          if (this.idCardSettings.barcodeType === '1d') {
            const barY = y + h - (this.idCardSettings.fields.signature ? 90 : 65);
            this.drawCanvas1DBarcode(ctx, this.getUserPersonnelCode(user), x + 24, barY, w - 48, 26);
          } else {
            const qrBoxW = 136;
            const qrBoxH = 136;
            const qrInnerSize = 120;
            const qrX = x + (w - qrBoxW) / 2;
            const qrY = y + 258;

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(qrX, qrY, qrBoxW, qrBoxH, 14);
            ctx.fill();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            this.drawPure2DBarcode(ctx, this.getCardVerificationUrl(user), qrX + 8, qrY + 8, qrInnerSize);

            // Verification hint caption
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 8px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('اسکن جهت استعلام اصالت دیجیتال', x + w / 2, qrY + qrBoxH + 14);
          }
        }

        // Official Stamp / Signature on Back Face
        if (this.idCardSettings.fields.signature) {
          const sigY = y + h - 46;
          ctx.strokeStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.moveTo(x + 20, sigY);
          ctx.lineTo(x + w - 20, sigY);
          ctx.stroke();

          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 8px Vazirmatn, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(texts.signatureTitle, x + w - 20, sigY + 18);
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 6px sans-serif';
          ctx.fillText(texts.signatureSub, x + w - 20, sigY + 28);

          // Stamp Box
          ctx.save();
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = '#94a3b8';
          ctx.strokeRect(x + 20, sigY + 6, 52, 28);
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 7px Vazirmatn, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('مهر رسمی', x + 46, sigY + 22);
          ctx.restore();
        }

      } else {
        // === HORIZONTAL BACK FACE (540 x 340) ===
        ctx.direction = 'rtl';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(texts.backHeaderTitle, x + w - 20, y + 26);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText(texts.backHeaderSub, x + w - 20, y + 38);

        if (this.idCardSettings.fields.nationalCode) {
          const natText = `کد ملی: ${user.national_code || '---'}`;
          ctx.font = 'bold 9px monospace';
          const natW = ctx.measureText(natText).width + 16;
          const natX = x + 20;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(natX, y + 14, natW, 20, 6);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'center';
          ctx.fillText(natText, natX + natW / 2, y + 28);
        }

        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(x + 20, y + 46);
        ctx.lineTo(x + w - 20, y + 46);
        ctx.stroke();

        // Right: Dedicated Large QR Code zone (120px)
        const qrBoxSize = 120;
        const qrInnerSize = 106;
        const qrX = x + w - qrBoxSize - 20;
        const qrY = y + 62;

        if (this.idCardSettings.fields.barcode && (this.idCardSettings.barcodePlacement === 'back' || this.idCardSettings.barcodePlacement === 'both')) {
          if (this.idCardSettings.barcodeType === '1d') {
            this.drawCanvas1DBarcode(ctx, this.getUserPersonnelCode(user), qrX, y + 80, qrBoxSize, 30);
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(qrX, qrY, qrBoxSize, qrBoxSize, 12);
            ctx.fill();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            this.drawPure2DBarcode(ctx, this.getCardVerificationUrl(user), qrX + 7, qrY + 7, qrInnerSize);

            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 8px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('استعلام اصالت کارت', qrX + qrBoxSize / 2, qrY + qrBoxSize + 14);
          }
        }

        // Left: Information lines & Regulations
        const textStartX = qrX - 20;
        const textMaxW = textStartX - (x + 20);
        let rY = y + 72;

        ctx.font = 'bold 9px Vazirmatn, Tahoma, sans-serif';
        ctx.textAlign = 'right';

        if (this.idCardSettings.fields.regulations) {
          rY = this.wrapText(ctx, `• ${texts.regulationsText}`, textStartX, rY, textMaxW, 16);
        }
        if (this.idCardSettings.fields.bloodType && user.blood_type) {
          ctx.fillStyle = '#475569';
          ctx.fillText(`• گروه خونی: `, textStartX, rY);
          const lblW = ctx.measureText('• گروه خونی: ').width;
          ctx.fillStyle = '#be123c';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(this.getUserBloodType(user), textStartX - lblW, rY);
          ctx.font = 'bold 9px Vazirmatn, Tahoma, sans-serif';
          rY += 18;
        }
        if (this.idCardSettings.fields.emergencyContact) {
          ctx.fillStyle = '#475569';
          ctx.fillText(`• تماس اضطراری: `, textStartX, rY);
          const lblW = ctx.measureText('• تماس اضطراری: ').width;
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(this.getUserEmergencyContact(user), textStartX - lblW, rY);
          ctx.font = 'bold 9px Vazirmatn, Tahoma, sans-serif';
          rY += 18;
        }
        if (this.idCardSettings.fields.globalNote) {
          ctx.fillStyle = '#475569';
          ctx.fillText(`• پروژه: ${this.idCardSettings.globalProjectNote}`, textStartX, rY);
          rY += 18;
        }

        // Signature on Horizontal Back
        if (this.idCardSettings.fields.signature) {
          const sigY = y + h - 46;
          ctx.strokeStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(x + 20, sigY);
          ctx.lineTo(x + w - 20, sigY);
          ctx.stroke();

          // Right: Signature Title
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 8px Vazirmatn, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(texts.signatureTitle, x + w - 20, sigY + 16);
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 6px sans-serif';
          ctx.fillText(texts.signatureSub, x + w - 20, sigY + 26);

          // Left: Official Stamp Box
          ctx.save();
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = '#94a3b8';
          ctx.strokeRect(x + 20, sigY + 6, 52, 26);
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 7px Vazirmatn, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('مهر رسمی', x + 46, sigY + 22);
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  private drawPure2DBarcode(ctx: CanvasRenderingContext2D, codeStr: string, x: number, y: number, size: number) {
    try {
      const writer = new QRCodeWriter();
      const hints = new Map();
      hints.set(EncodeHintType.MARGIN, 0);
      const bitMatrix = writer.encode(codeStr, BarcodeFormat.QR_CODE, 25, 25, hints);
      const width = bitMatrix.getWidth();
      const height = bitMatrix.getHeight();
      const cellW = size / width;
      const cellH = size / height;

      ctx.fillStyle = '#0f172a';
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (bitMatrix.get(c, r)) {
            ctx.fillRect(x + c * cellW, y + r * cellH, cellW + 0.2, cellH + 0.2);
          }
        }
      }
    } catch (e) {
      // Fallback
    }
  }

  private drawCanvas1DBarcode(ctx: CanvasRenderingContext2D, codeStr: string, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h + 15);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(x, y, w, h + 15);

    ctx.fillStyle = '#0f172a';
    let curX = x + 10;
    const usableW = w - 20;
    const barCount = 30;
    const step = usableW / barCount;

    for (let i = 0; i < barCount; i++) {
      const bw = (i % 3 === 0 || i % 7 === 0) ? step * 0.7 : step * 0.35;
      ctx.fillRect(curX, y + 4, bw, h - 8);
      curX += step;
    }

    // Text under barcode
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(codeStr, x + w / 2, y + h + 11);
  }

  private drawCanvas2DBarcode(ctx: CanvasRenderingContext2D, codeStr: string, x: number, y: number, size: number) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 4, y - 4, size + 8, size + 18);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 18);

    try {
      const writer = new QRCodeWriter();
      const hints = new Map();
      hints.set(EncodeHintType.MARGIN, 0);
      const bitMatrix = writer.encode(codeStr, BarcodeFormat.QR_CODE, 25, 25, hints);
      const width = bitMatrix.getWidth();
      const height = bitMatrix.getHeight();
      const cellW = size / width;
      const cellH = size / height;

      ctx.fillStyle = '#0f172a';
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (bitMatrix.get(c, r)) {
            ctx.fillRect(x + c * cellW, y + r * cellH, cellW + 0.3, cellH + 0.3);
          }
        }
      }
    } catch (e) {
      // Fallback
    }

    // Text under QR
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(codeStr, x + size / 2, y + size + 10);
  }

  /**
   * تولید بارکد میله‌ای تک بعدی Code 39
   */
  getBarcodeSvg(text: string): SafeHtml {
    const code = (text || 'EMP-1001').toUpperCase().replace(/[^0-9A-Z\-.\s\$\/\+\%]/g, '');
    const cacheKey = '1D_' + code;
    if (this.barcodeCache.has(cacheKey)) {
      return this.barcodeCache.get(cacheKey)!;
    }

    const code39: Record<string, string> = {
      '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
      '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
      '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
      'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
      'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
      'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
      'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
      'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
      'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
      '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
      '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010'
    };

    const formatted = `*${code}*`;
    let curX = 2;
    const barHeight = 28;
    let rects = '';

    for (let i = 0; i < formatted.length; i++) {
      const char = formatted[i];
      const pattern = code39[char] || code39['0'];
      for (let j = 0; j < 9; j++) {
        const isBar = j % 2 === 0;
        const isWide = pattern[j] === '1';
        const w = isWide ? 2.2 : 0.9;
        if (isBar) {
          rects += `<rect x="${curX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${barHeight}" fill="#1e293b" />`;
        }
        curX += w;
      }
      curX += 1.0;
    }

    const totalWidth = curX + 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(0)} ${barHeight}" preserveAspectRatio="none" class="w-full h-full">${rects}</svg>`;
    const safe = this.sanitizer.bypassSecurityTrustHtml(svg);
    this.barcodeCache.set(cacheKey, safe);
    return safe;
  }

  /**
   * تولید بارکد دوبعدی QR Code برداری داینامیک با الگوریتم ماتریسی استاندارد و لینک استعلام
   */
  getQrCodeSvg(input: string | User): SafeHtml {
    let urlOrText = '';
    if (typeof input === 'object' && input !== null) {
      urlOrText = this.getCardVerificationUrl(input);
    } else if (typeof input === 'string') {
      if (input.startsWith('http') || input.includes('/verify-card/')) {
        urlOrText = input;
      } else {
        urlOrText = `${publicOrigin()}/verify-card/${input}`;
      }
    } else {
      urlOrText = `${publicOrigin()}/verify-card/EMP-1001`;
    }

    const cacheKey = '2D_' + urlOrText;
    if (this.barcodeCache.has(cacheKey)) {
      return this.barcodeCache.get(cacheKey)!;
    }

    try {
      const writer = new QRCodeWriter();
      const hints = new Map();
      hints.set(EncodeHintType.MARGIN, 0);
      const bitMatrix = writer.encode(urlOrText, BarcodeFormat.QR_CODE, 25, 25, hints);
      const width = bitMatrix.getWidth();
      const height = bitMatrix.getHeight();

      let rects = '';
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (bitMatrix.get(c, r)) {
            rects += `<rect x="${c}" y="${r}" width="1.02" height="1.02" fill="#0f172a" />`;
          }
        }
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="w-full h-full" shape-rendering="crispEdges">${rects}</svg>`;
      const safe = this.sanitizer.bypassSecurityTrustHtml(svg);
      this.barcodeCache.set(cacheKey, safe);
      return safe;
    } catch (e) {
      console.warn('QR code generation fallback', e);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" class="w-full h-full" shape-rendering="crispEdges">
        <rect x="0" y="0" width="7" height="7" fill="#0f172a"/>
        <rect x="1" y="1" width="5" height="5" fill="#ffffff"/>
        <rect x="2" y="2" width="3" height="3" fill="#0f172a"/>
        <rect x="14" y="0" width="7" height="7" fill="#0f172a"/>
        <rect x="15" y="1" width="5" height="5" fill="#ffffff"/>
        <rect x="16" y="2" width="3" height="3" fill="#0f172a"/>
        <rect x="0" y="14" width="7" height="7" fill="#0f172a"/>
        <rect x="1" y="15" width="5" height="5" fill="#ffffff"/>
        <rect x="2" y="16" width="3" height="3" fill="#0f172a"/>
        <rect x="9" y="9" width="3" height="3" fill="#0f172a"/>
      </svg>`;
      const safe = this.sanitizer.bypassSecurityTrustHtml(svg);
      this.barcodeCache.set(cacheKey, safe);
      return safe;
    }
  }
}
