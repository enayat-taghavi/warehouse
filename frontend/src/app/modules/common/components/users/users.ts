import { UsersFacade } from './users.facade';
import {
  SYSTEM_ROLE_PRESETS,
  RolePreset,
  SHORT_PERMISSION_NAMES,
  getShortPermissionName,
  getRolePermissionPercent,
  DEFAULT_ASSIGNMENT_SCOPE_LABELS,
  extractApiError
} from './users.helpers';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, computed, ViewChild, ElementRef, inject, Injector } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { AssignmentScopeLabels, ModulePermissionGroup } from '../../../../core/modules/module-contract';
import { AccountsHttpService, User, Role, Permission, ImportResult } from '../../../../core/http/accounts-http.service';
import { ScopeDirectoryService } from '../../../../core/http/scope-directory.service';
import { ApiService } from '../../../../core/api/api.service';
import { ClickOutsideDirective } from '../../../../shared/directives/click-outside.directive';
import { IdCards } from '../id-cards/id-cards';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ExcelImportModal } from '../../../../shared/components/excel-import-modal/excel-import-modal';
import { SmartDeleteModalComponent } from '../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { AvatarCropperModal } from '../../../../shared/components/avatar-cropper-modal/avatar-cropper-modal';
import { environment } from '../../../../../environments/environment';
import { Observable, Subject, Subscription, forkJoin, merge, of } from 'rxjs';
import { debounceTime, finalize, map, catchError, takeUntil, tap } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { Company } from '../../../../core/models/company.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { ToggleSwitchComponent } from '../../../../shared/components/toggle-switch/toggle-switch.component';
import { ServerUrlPipe } from '../../../../shared/pipes/server-url.pipe';
import { RoleBundlesPanel } from './role-bundles-panel/role-bundles-panel';
import { UserPermissionsTabComponent } from './user-permissions-tab/user-permissions-tab';
import { WorkflowSubstitutesComponent } from '../../../../shared/components/workflow-substitutes/workflow-substitutes.component';
import { saveBlob } from '../../../../core/platform/file-output';
import { NetworkStatusService } from '../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../core/services/server-reachability';

import { IconName } from '../../../../shared/icons/icon-registry';

interface AuthorizedSystems {
  isSuperuser: boolean;
  hasWarehouse: boolean;
  hasFinance: boolean;
  hasGlobal: boolean;
  warehouseCount: number;
  badges: { key: string; label: string; icon: string; bgClass: string; textClass: string; borderClass: string }[];
  isEmpty: boolean;
}

@Component({
  selector: 'app-users',
  imports: [CommonModule, NgOptimizedImage, FormsModule, ClickOutsideDirective, IdCards, ExcelImportModal, SmartDeleteModalComponent, AvatarCropperModal, SvgIconDirective, ActionButtonComponent, TabBarComponent, ToggleSwitchComponent, ServerUrlPipe, RoleBundlesPanel, UserPermissionsTabComponent, WorkflowSubstitutesComponent],
  providers: [UsersFacade],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users implements OnInit, OnDestroy {
  @ViewChild(IdCards) idCardsComponent?: IdCards;
  @ViewChild(RoleBundlesPanel) roleBundlesPanel?: RoleBundlesPanel;
  @ViewChild('otpClose') otpCloseBtn?: ElementRef<HTMLButtonElement>;
  activeTab = 'users';
  showUserFilters = false;

  /** آرایهٔ تب‌ها فقط با تغییر شمارش‌ها تازه می‌شود (NG0103: هر چرخهٔ تشخیص تغییر آرایهٔ نو نگیرد) */
  private userTabsCache: TabDef[] = [];
  private userTabsKey = '';

  /** آرایهٔ تب‌های مودال کاربر فقط با تغییر وضعیت یا خطا تازه می‌شود (NG0103) */
  private userModalTabsCache: TabDef[] = [];
  private userModalTabsKey = '';

  get userModalTabs(): TabDef[] {
    const editId = this.editingUser?.id ? String(this.editingUser.id) : '';
    const companiesTabLabel = this.scopeLabels.companiesTab;
    const hasIdentityErr = !!(this.userFormErrors['first_name'] || this.userFormErrors['last_name'] || this.userFormErrors['phone_number'] || this.userFormErrors['national_code']);
    const isIdentityValid = this.isFieldValid('first_name') && this.isFieldValid('last_name') && this.isFieldValid('phone_number');
    const hasSecurityErr = !!(this.userFormErrors['username'] || this.userFormErrors['password']);
    const isSecurityValid = this.isFieldValid('username');
    const rolesCount = this.userForm.groups?.length || 0;
    const companyCount = this.userForm.company_ids?.length || 0;
    const whCount = this.userForm.assigned_warehouses?.length || 0;

    const key = `${editId}|${companiesTabLabel}|${hasIdentityErr}|${isIdentityValid}|${hasSecurityErr}|${isSecurityValid}|${rolesCount}|${companyCount}|${whCount}`;
    if (key !== this.userModalTabsKey) {
      this.userModalTabsKey = key;

      let identityIndicator: TabDef['indicator'] = undefined;
      if (hasIdentityErr) {
        identityIndicator = { tone: 'rose', label: 'خطا در این بخش', pulse: true };
      } else if (isIdentityValid) {
        identityIndicator = { tone: 'emerald', label: 'تکمیل شده' };
      }

      let securityIndicator: TabDef['indicator'] = undefined;
      if (hasSecurityErr) {
        securityIndicator = { tone: 'rose', label: 'خطا در این بخش', pulse: true };
      } else if (isSecurityValid) {
        securityIndicator = { tone: 'emerald', label: 'تکمیل شده' };
      }

      const tabs: TabDef[] = [
        {
          id: 'identity',
          label: 'هویت و تماس',
          shortLabel: 'هویت',
          icon: 'user',
          tone: 'indigo',
          indicator: identityIndicator,
        },
        {
          id: 'security',
          label: 'امنیت و ورود',
          shortLabel: 'امنیت',
          icon: 'key',
          tone: 'indigo',
          indicator: securityIndicator,
        },
        {
          id: 'roles',
          label: 'نقش‌های سازمانی',
          shortLabel: 'نقش‌ها',
          icon: 'shield',
          tone: 'indigo',
          count: rolesCount,
        },
        {
          id: 'warehouses',
          label: companiesTabLabel,
          shortLabel: 'شرکت‌ها',
          icon: 'building',
          tone: 'indigo',
        },
      ];

      if (this.editingUser?.id) {
        tabs.push(
          {
            id: 'permissions',
            label: 'مجوزها',
            shortLabel: 'مجوزها',
            icon: 'lock',
            tone: 'indigo',
          },
          {
            id: 'substitute',
            label: 'جانشین موقت',
            shortLabel: 'جانشین',
            icon: 'users',
            tone: 'indigo',
          }
        );
      }

      this.userModalTabsCache = tabs;
    }
    return this.userModalTabsCache;
  }

  get userTabs(): TabDef[] {
    const usersCount = this.userCounts.all;
    const rolesCount = this.allRoles?.length || 0;
    const key = `${usersCount}|${rolesCount}`;
    if (key !== this.userTabsKey) {
      this.userTabsKey = key;
      this.userTabsCache = [
        { id: 'users', label: 'کاربران', shortLabel: 'کاربران', count: usersCount, icon: 'users', tone: 'indigo' },
        { id: 'roles', label: 'نقش‌ها', shortLabel: 'نقش‌ها', count: rolesCount, icon: 'shield', tone: 'indigo' },
        { id: 'id-cards', label: 'کارت پرسنلی', shortLabel: 'کارت', icon: 'id-card', tone: 'indigo' },
      ];
    }
    return this.userTabsCache;
  }

  /** زیرتب تب «نقش‌ها» (طرح ۲.۲): نقش‌های انتساب (بسته‌ها) یا نقش‌های سامانه‌ای (`CustomRole`) */
  rolesSubTab: 'assignment' | 'system' = 'assignment';

  readonly roleSubTabs: TabDef[] = [
    { id: 'assignment', label: 'نقش‌های انتساب', shortLabel: 'انتساب', icon: 'users', tone: 'indigo' },
    { id: 'system', label: 'نقش‌های سامانه‌ای', shortLabel: 'سامانه‌ای', icon: 'shield', tone: 'indigo' },
  ];

  /** پیش‌نویس ذخیره‌نشدهٔ بستهٔ نقش با ترک پنل از بین می‌رود؛ پیش از آن می‌پرسد */
  formatFa(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString('fa-IR');
  }

  private hasUnsavedBundles(): boolean {
    return this.activeTab === 'roles' && this.rolesSubTab === 'assignment' && !!this.roleBundlesPanel?.hasUnsavedChanges();
  }

  private async confirmLeaveBundles(): Promise<boolean> {
    const ok = await this.confirmDialog.open({
      title: 'تغییر ذخیره‌نشده',
      message: 'تغییرهای ذخیره‌نشدهٔ بستهٔ نقش از بین می‌رود. ادامه می‌دهید؟',
      confirmText: 'ادامه، بدون ذخیره',
      type: 'warning',
    });
    return ok === true;
  }

  switchRolesSubTab(id: string): void | Promise<void> {
    const next = id === 'system' ? 'system' : 'assignment';
    if (next !== this.rolesSubTab && this.hasUnsavedBundles()) {
      return this.confirmLeaveBundles().then(ok => { if (ok) this.applyRolesSubTab(id); });
    }
    this.applyRolesSubTab(id);
  }

  private applyRolesSubTab(id: string): void {
    this.rolesSubTab = id === 'system' ? 'system' : 'assignment';
    this.router.navigate([], { queryParams: { roles: this.rolesSubTab }, queryParamsHandling: 'merge', replaceUrl: true });
    this.cdr.detectChanges();
  }

  /** نوشتن نقش سامانه‌ای (ساخت، ویرایش، تکثیر، حذف، ورود اکسل): مدیر کل یا `perm_usr_role` (ت۱۰-۲)؛ `view_sys_users` تنها = فقط خواندن */
  canWriteRoles(): boolean {
    return this.isSuperuser() || !!this.auth.hasPermission?.('perm_usr_role');
  }

  /** ساخت کاربر و ورود اکسل: مدیر کل یا `perm_usr_add`؛ `view_sys_users` تنها = فقط خواندن (۲.۹) */
  canAddUsers(): boolean {
    return this.isSuperuser() || !!this.auth.hasPermission?.('perm_usr_add');
  }

  /** ویرایش، تعلیق/فعال‌سازی، بازنشانی رمز، حذف و تصویر کاربر: مدیر کل یا `perm_usr_edit` (۲.۹) */
  canEditUsers(): boolean {
    return this.isSuperuser() || !!this.auth.hasPermission?.('perm_usr_edit');
  }

  private network = NetworkStatusService.getInstance();

  /** آفلاین: خواندن از حافظهٔ نهان ادامه دارد اما همهٔ نوشتن‌ها بسته است (۲.۹-ب) */
  get isOffline(): boolean {
    return !this.network.isOnline;
  }

  /** فرم پنجرهٔ کاربر فقط‌خواندنی است: بدون مجوز ویرایش/افزودن یا آفلاین (inputها در fieldset غیرفعال می‌شوند) */
  get userFormReadonly(): boolean {
    return this.isOffline || !(this.editingUser ? this.canEditUsers() : this.canAddUsers());
  }

  readonly offlineTitle = 'در حالت آفلاین ممکن نیست';

  private denyUserWrite(kind: 'add' | 'edit'): boolean {
    if (this.isOffline) {
      this.toast.show('error', this.offlineTitle);
      return true;
    }
    if (kind === 'add' ? this.canAddUsers() : this.canEditUsers()) return false;
    this.toast.show('error', kind === 'add' ? 'افزودن کاربر به مجوز «افزودن کاربر» نیاز دارد.' : 'تغییر کاربران به مجوز «ویرایش کاربر» نیاز دارد.');
    return true;
  }

  /** ویرایش کاربری غیر از کاربر واردشده؛ رمز چنین کاربری فقط با «بازنشانی رمز» عوض می‌شود (۲.۹، سرور ۴۰۰ می‌دهد) */
  get isEditingOtherUser(): boolean {
    return !!this.editingUser?.id && this.editingUser.id !== this.auth.user()?.id;
  }

  // ─── رمز یک‌بارمصرف (۲.۹): فقط یک بار نمایش داده می‌شود ───
  /** ردیف‌های رمز یک‌بارمصرف پنل باز؛ null = پنل بسته */
  oneTimePasswords: { username: string; password: string }[] | null = null;

  showOneTimePasswords(rows: { username: string; password: string }[]): void {
    const valid = (rows || []).filter(r => !!r?.password);
    if (!valid.length) return;
    this.oneTimePasswords = valid;
    this.cdr.detectChanges();
    // فوکوس به پنل برود تا صفحه‌خوان و صفحه‌کلید آن را ببینند
    setTimeout(() => this.otpCloseBtn?.nativeElement.focus());
  }

  closeOneTimePasswords(): void {
    this.oneTimePasswords = null;
    this.cdr.detectChanges();
  }

  async copyOneTimePasswords(row?: { username: string; password: string }): Promise<void> {
    const rows = row ? [row] : (this.oneTimePasswords || []);
    const text = row ? row.password : rows.map(r => `${r.username}\t${r.password}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('success', row ? 'رمز یک‌بارمصرف کپی شد.' : 'همهٔ رمزها کپی شد.');
    } catch {
      this.toast.show('error', 'کپی انجام نشد؛ رمز را دستی یادداشت کنید.');
    }
  }

  // ─── به‌روزرسانی زنده (۲.۹): users_changed و permissions_updated ───
  private destroy$ = new Subject<void>();
  /** رویدادی برای کاربرِ باز در پنجرهٔ ویرایش رسید؛ نوار «این کاربر تغییر کرده است» */
  editingUserChanged = false;
  /** دریافت تازهٔ کاربر باز در پنجره از سرور */
  isRefetchingEditingUser = false;
  private editingUserSeq = 0;
  /** فرم پنجره درست پس از پر شدن از سرور؛ معیار «ویرایش ذخیره‌نشده» */
  private userFormBaseline = '';

  /** فرم پنجره ویرایش ذخیره‌نشده دارد */
  get isUserFormDirty(): boolean {
    return JSON.stringify(this.userForm) !== this.userFormBaseline;
  }

  private subscribeDirectoryChanges(): void {
    const ps = this.permissionService;
    if (!ps?.permissionsChanged$ || !ps?.usersChanged$) return;
    merge(ps.permissionsChanged$, ps.usersChanged$).pipe(
      tap(ev => {
        // فرم بی‌تغییر بی‌صدا تازه می‌شود؛ فقط با ویرایش ذخیره‌نشده نوار «این کاربر تغییر کرده است» می‌آید
        if (this.isUserModalOpen && this.editingUser?.id && ev?.user_id === this.editingUser.id) this.refetchEditingUser();
      }),
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => this.refreshDirectorySilently());
  }

  /** دریافت دوبارهٔ کاربران و نقش‌ها بی اسپینر؛ انتخاب و صفحه حفظ می‌شود */
  refreshDirectorySilently(): void {
    this.accountsService.getUsers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : [];
        const ids = new Set(list.map((u: any) => u.id));
        for (const id of Array.from(this.selectedUserIds)) if (!ids.has(id)) this.selectedUserIds.delete(id);
        this.state.appState.users = list;
        if (this.editingUser?.id) {
          const fresh = list.find((u: any) => u.id === this.editingUser.id);
          if (fresh && !this.isUserModalOpen) this.editingUser = fresh;
        }
        this.rebuildMemoizedData();
        this.cdr.detectChanges();
      },
      error: () => {}
    });
    this.accountsService.getRoles().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.state.appState.roles = Array.isArray(res) ? res : [];
        this.rebuildMemoizedData();
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  /** کاربر باز در پنجره را از سرور می‌خواند؛ ردیف فهرست تا رسیدن پاسخ جایگزین است و ویرایش ذخیره‌نشده بی‌صدا رونویسی نمی‌شود */
  refetchEditingUser(force = false): void {
    const id = this.editingUser?.id;
    if (!id || typeof this.accountsService.getUser !== 'function') return;
    const seq = ++this.editingUserSeq;
    this.isRefetchingEditingUser = true;
    this.accountsService.getUser(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (fresh: any) => {
        if (seq !== this.editingUserSeq || !this.isUserModalOpen || this.editingUser?.id !== id) return;
        this.isRefetchingEditingUser = false;
        const row = this.state.appState.users.find((x: any) => x.id === id);
        if (row) Object.assign(row, fresh);
        if (force || !this.isUserFormDirty) {
          this.editingUser = row || fresh;
          this.applyUserToForm(this.editingUser);
          this.editingUserChanged = false;
        } else {
          this.editingUserChanged = true;
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (seq !== this.editingUserSeq) return;
        this.isRefetchingEditingUser = false;
        if (force) this.toast.show('error', extractApiError(err, 'اطلاعات تازهٔ کاربر دریافت نشد.'));
        this.cdr.detectChanges();
      }
    });
  }

  /** دکمهٔ «بارگذاری دوباره» نوار تغییر کاربر */
  reloadEditingUser(): void {
    this.refetchEditingUser(true);
  }

  /** بازنشانی رمز کاربر باز در پنجره (تب امنیت) */
  resetEditingUserPassword(): void {
    if (this.editingUser?.id) void this.resetPassword(this.editingUser.id);
  }

  private denyRoleWrite(): boolean {
    if (this.isOffline) {
      this.toast.show('error', this.offlineTitle);
      return true;
    }
    if (this.canWriteRoles()) return false;
    this.toast.show('error', 'تغییر نقش‌های سامانه‌ای به مجوز «مدیریت نقش‌ها» نیاز دارد.');
    return true;
  }

  switchTab(tabId: string): void | Promise<void> {
    if (tabId !== this.activeTab && this.hasUnsavedBundles()) {
      return this.confirmLeaveBundles().then(ok => { if (ok) this.applyTab(tabId); });
    }
    this.applyTab(tabId);
  }

  private applyTab(tabId: string): void {
    this.activeTab = tabId;
    this.router.navigate([], { queryParams: { tab: tabId }, queryParamsHandling: 'merge', replaceUrl: true });
    this.openMenuId = null;
    this.cdr.detectChanges();
  }

  activePermTab = 'MAIN_MENU';
  /** 'all'، 'global' یا کلید users.roleScope یکی از ماژول‌ها */
  userRoleModalTab: string = 'global';
  userModalInnerTab: 'identity' | 'security' | 'roles' | 'warehouses' | 'permissions' | 'substitute' = 'identity';
  searchQuery = '';
  searchSubject = new Subject<string>();
  private searchSub?: Subscription;

  // Pagination & Filtering
  currentPage = 1;
  pageSize = 24;
  visibleCount = 24;
  pageSizeOptions = [12, 24, 48, 96];
  userStatusFilter: 'all' | 'active' | 'inactive' | 'no_warehouse' | 'superuser' = 'all';
  userRoleFilter: number | 'ALL' = 'ALL';
  userWarehouseFilter: number | string | 'ALL' = 'ALL';
  selectedUserIds = new Set<number>();
  lockedUsernames = new Set<string>();
  activePopoverRoleId: number | null = null;
  userViewMode: 'grid' | 'table' = 'grid';
  activeRolePresetId: string | null = null;
  showPassword = false;
  sortField: string = 'id';
  sortOrder: 'asc' | 'desc' = 'desc';

  setSort(field: string): void {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortOrder = 'asc';
    }
    this.cdr.detectChanges();
  }

  toggleShowPassword(): void {
    this.showPassword = !this.showPassword;
    this.cdr.detectChanges();
  }

  readonly ROLE_COLORS = [
    '#4f46e5', // نیلی ایندیگو
    '#7c3aed', // بنفش سلطنتی
    '#059669', // سبز زمردی
    '#0284c7', // آبی آسمانی
    '#d97706', // کهربایی گرم
    '#dc2626', // یاقوتی / سرخ
    '#e11d48', // رز متالیک
    '#475569', // سربی تیره
  ];

  setRoleColor(color: string) {
    this.roleForm.color = color;
    this.cdr.detectChanges();
  }

  setViewMode(mode: 'grid' | 'table') {
    this.userViewMode = mode;
    try {
      localStorage.setItem('users_view_mode', mode);
    } catch (e) {}
    this.cdr.detectChanges();
  }

  roleSearchQuery: string = '';

  onRoleSearchChange(query: string) {
    this.roleSearchQuery = query ? query.trim() : '';
    this.cdr.detectChanges();
  }

  get displayedRoles(): any[] {
    const roles = this.allRoles;
    if (!this.roleSearchQuery) return roles;
    const q = this.roleSearchQuery.toLowerCase();
    return roles.filter((r: any) => 
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.title && r.title.toLowerCase().includes(q))
    );
  }

  printIdCards() {
    if (this.idCardsComponent) {
      this.idCardsComponent.executeCardPrint();
    }
    this.cdr.detectChanges();
  }

  openIdCardsSheetPreview() {
    if (this.idCardsComponent) {
      this.idCardsComponent.openSheetPreviewModal();
    }
    this.cdr.detectChanges();
  }

  openIdCardsExportModal() {
    if (this.idCardsComponent) {
      this.idCardsComponent.openExportModal();
    }
    this.cdr.detectChanges();
  }

  get idCardsPrintableCount(): number {
    return this.idCardsComponent?.printableUsers?.length || 0;
  }

  get isIdCardsExporting(): boolean {
    return this.idCardsComponent?.isExportingImage || false;
  }

  // Memoization Caches (O(1) lookups during change detection)
  roleUsersCountMap = new Map<number, number>();
  userRolesMap = new Map<number, { name: string, color: string }[]>();
  primaryRoleMap = new Map<number, { name: string, color: string }>();
  permIdToCodenameMap = new Map<number, string>();

  openMenuId: string | null = null;

  isUserModalOpen = false;
  isRoleModalOpen = false;
  isDeleteModalOpen = false;
  isAvatarCropperOpen = false;
  targetUserForAvatar: any = null;
  isSavingUserAvatar = false;
  entityToDelete: any = null;
  deleteImpactUrl = '';
  deleteType: 'user' | 'role' = 'user';
  isDeleting = false;
  deleteErrorMessage = '';

  // Role Form
  editingRole: any = null;
  roleForm = {
    id: null as number | null, name: '', title: '', color: '#94a3b8', permissions: [] as number[], user_ids: [] as number[]
  };
  roleMemberSearchQuery: string = '';
  isRoleMembersExpanded: boolean = false;

  // User Form (با حذف فیلدهای موهومی انقضا و افزودن کلمه عبور و آواتار تراکنشی)
  editingUser: any = null;
  availableCompanies: Company[] = [];
  modalWarehouses: any[] = [];
  isLoadingModalWarehouses = false;
  userForm: any = {
    id: null as number | null, first_name: '', last_name: '', national_code: '', username: '', phone_number: '', password: '',
    operational_zone: '', supervisor: null as number | null, address: '', company: '', email: '', avatar: null as string | null,
    _pendingAvatarBlob: null as Blob | null, _pendingAvatarDelete: false, blood_type: '', emergency_contact: '', groups: [] as number[],
    assigned_warehouses: [] as number[], date_joined: '', last_login: '', is_active: true, is_superuser: false,
    company_ids: [] as number[], default_company_id: null as number | null
  };

  // Quick Role Presets / Templates for One-Click Permission Granting
  /** قالب‌های ماژول‌ها (users.rolePresets، به ترتیب قلمرو) و قالب‌های سراسری */
  get ROLE_PRESETS(): RolePreset[] {
    const fromModules = this.moduleUsersExts().flatMap(e => e.ext.rolePresets || []);
    return [...fromModules, ...SYSTEM_ROLE_PRESETS];
  }

  /** 'all'، 'system' یا کلید users.presetCategory یکی از ماژول‌ها */
  activePresetCategory: string = 'all';

  /** extension users ماژول‌های نصب‌شده به ترتیب roleScope.order */
  private moduleUsersExts() {
    return this.registry.getExtensions('users')
      .map(e => ({ module: e.module, ext: e.extension }))
      .sort((a, b) => (a.ext.roleScope?.order ?? 100) - (b.ext.roleScope?.order ?? 100));
  }

  /**
   * ماژول نصب‌شده‌ای که گروه مجوزش در فهرست گروه‌های سرور هست؛ ماژول قالب تازه (بی permissionGroup، ت۶)
   * وقتی در دسترس است که فهرست کامل سرور برایش مجوز داشته باشد.
   */
  private isUsersExtAvailable(ext: { permissionGroup?: ModulePermissionGroup }, moduleCode?: string): boolean {
    const key = ext.permissionGroup?.key;
    if (key) return this.systemPermissionGroups.some(g => g.key === key);
    return !!moduleCode && (this.permissionService.catalog()?.permissions || []).some(p => p.module === moduleCode);
  }

  /** ماژول‌های در دسترسی که محدودهٔ تخصیص کاربران (انبار، پروژه، …) عرضه می‌کنند، به ترتیب priority */
  private assignmentScopeProviders() {
    return this.moduleUsersExts()
      .filter(e => !!e.ext.assignmentScope && this.isUsersExtAvailable(e.ext, e.module?.code))
      .sort((a, b) => a.ext.assignmentScope!.priority - b.ext.assignmentScope!.priority);
  }

  /** برچسب‌های فارسی محدودهٔ تخصیص از نخستین ماژول در دسترس */
  get scopeLabels(): AssignmentScopeLabels {
    // پیش از رسیدن گروه‌های مجوز سرور (یا در خطای آن)، نخستین ماژول نصب‌شده برچسب می‌دهد تا متن عمومی چشمک نزند
    const providers = this.systemPermissionGroups.length
      ? this.assignmentScopeProviders()
      : this.moduleUsersExts().filter(e => !!e.ext.assignmentScope)
          .sort((a, b) => a.ext.assignmentScope!.priority - b.ext.assignmentScope!.priority);
    return providers[0]?.ext.assignmentScope!.labels ?? DEFAULT_ASSIGNMENT_SCOPE_LABELS;
  }

  /** دسته‌های قالب نقش ماژول‌های در دسترس، با شمار قالب‌های هر دسته */
  get presetCategories(): Array<{ key: string; labelFa: string; icon: IconName; activeClass: string; hoverClass: string; countFa: string }> {
    const tones: Record<string, { activeClass: string; hoverClass: string }> = {
      sky: { activeClass: 'bg-sky-600 text-white shadow-sm', hoverClass: 'text-slate-600 hover:text-sky-600 hover:bg-slate-100/70' },
      emerald: { activeClass: 'bg-emerald-600 text-white shadow-sm', hoverClass: 'text-slate-600 hover:text-emerald-600 hover:bg-slate-100/70' },
    };
    return this.moduleUsersExts()
      .filter(e => !!e.ext.presetCategory && this.isUsersExtAvailable(e.ext, e.module?.code))
      .map(e => {
        const c = e.ext.presetCategory!;
        return { key: c.key, labelFa: c.labelFa, icon: c.icon, ...tones[c.tone], countFa: (e.ext.rolePresets || []).length.toLocaleString('fa-IR') };
      });
  }

  trackByKey(_i: number, item: { key: string }): string {
    return item.key;
  }

  /** قلمروهای نقش ماژول‌های در دسترس (زبانه‌های مودال کاربر) */
  get roleScopes() {
    return this.moduleUsersExts()
      .filter(e => !!e.ext.roleScope && this.isUsersExtAvailable(e.ext))
      .map(e => e.ext.roleScope!);
  }

  /** قلمرو نقش همهٔ ماژول‌های این بیلد (برای برچسب نقش‌ها، مستقل از نصب) */
  private get knownRoleScopes() {
    return this.registry.getAllModules()
      .filter(m => !!m.extensions?.users?.roleScope)
      .map(m => ({ code: m.code, scope: m.extensions!.users!.roleScope! }))
      .sort((a, b) => a.scope.order - b.scope.order);
  }

  roleScopeFor(key: string) {
    return this.knownRoleScopes.find(s => s.scope.key === key)?.scope;
  }

  /** کلاس برچسب قلمرو نقش در مودال */
  roleScopeBadgeClass(key: string): string {
    const tone = this.roleScopeFor(key)?.tone;
    if (tone === 'sky') return 'bg-sky-50 text-sky-700 border border-sky-200';
    if (tone === 'emerald') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    return 'bg-purple-50 text-purple-700 border border-purple-200';
  }

  roleScopeTabClass(tone: string, active: boolean): string {
    if (!active) return 'text-slate-500 hover:text-slate-800';
    return tone === 'emerald' ? 'bg-white text-emerald-700 shadow-sm font-black' : 'bg-white text-sky-700 shadow-sm font-black';
  }

  roleScopeCountClass(tone: string): string {
    return tone === 'emerald'
      ? 'px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black border border-emerald-200'
      : 'px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-black border border-sky-200';
  }

  /** برچسب کوتاه نشان سامانه (اندازهٔ عادی یا ریز) */
  badgeShortLabel(key: string, tiny = false): string {
    if (key === 'superuser') return tiny ? 'ادمین کل' : 'همه (ادمین)';
    const scope = this.roleScopeFor(key);
    if (!scope) return 'کلان';
    return tiny ? scope.tinyLabelFa : scope.shortLabelFa;
  }
  isPresetsExpanded = false;

  getActivePresetTitle(): string {
    const p = this.ROLE_PRESETS.find(x => x.id === this.activeRolePresetId);
    return p ? p.title : '';
  }

  get visiblePermissionGroups() {
    return (this.systemPermissionGroups || []).filter(group => {
      // گروه مجوزی که یک ماژول شناخته‌شده اعلام کرده، فقط وقتی آن ماژول نصب است دیده می‌شود
      const owners = this.registry.getAllModules().filter(m => m.extensions?.users?.permissionGroup?.key === group.key);
      if (owners.length === 0) return true;
      return this.registry.getExtensions('users').some(e => e.extension.permissionGroup?.key === group.key);
    });
  }

  get availableRolePresets() {
    return this.ROLE_PRESETS.filter(p => {
      if (p.category === 'system') return true;
      return this.presetCategories.some(c => c.key === p.category);
    });
  }

  get filteredRolePresets() {
    const list = this.availableRolePresets;
    if (this.activePresetCategory === 'all') {
      return list;
    }
    return list.filter(p => p.category === this.activePresetCategory);
  }

  // عناوین کوتاه و مختصر جهت نمایش بهینه در چیپ‌های دسترسی تفکیکی (پلتفرم + users.shortPermissionNames ماژول‌ها)
  private _shortPermissionNames: Record<string, string> | null = null;
  get SHORT_PERMISSION_NAMES(): Record<string, string> {
    if (!this._shortPermissionNames) {
      const fromModules = this.registry.getAllModules().map(m => m.extensions?.users?.shortPermissionNames || {});
      this._shortPermissionNames = Object.assign({}, ...fromModules, SHORT_PERMISSION_NAMES);
    }
    return this._shortPermissionNames!;
  }
  getShortPermissionName(perm: Permission | any): string {
    if (!perm) return '';
    return this.SHORT_PERMISSION_NAMES[perm.codename] || this.permissionService.spec(perm.codename)?.label_fa || perm.name;
  }

  getPermissionTooltip(perm: Permission | any): string {
    if (!perm) return '';
    // راهنمای «تنها»ی ماژول صاحب مجوز وقتی محدودهٔ تخصیص از همان ماژول است یا هیچ ماژولی محدوده نمی‌دهد
    const owner = this.registry.getAllModules().find(m => !!m.extensions?.users?.permissionGroup?.codenames.includes(perm.codename));
    const standalone = owner?.extensions?.users?.standalonePermissionTooltips?.[perm.codename];
    if (owner && standalone) {
      const top = this.assignmentScopeProviders()[0];
      if (!top || top.module?.code === owner.code) return standalone;
    }
    return perm.name || '';
  }

  systemPermissions: Permission[] = [];
  systemPermissionGroups: { key: string, title: string, items: Permission[], is_sensitive_group?: boolean }[] = [];
  permSearchQuery = '';
  isLoading = false;

  // Sensitive Permissions Guard Modal
  pendingSensitivePerm: Permission | null = null;
  isSensitiveWarningModalOpen = false;
  isSuperuser = computed(() => !!(this.auth.user()?.is_superuser));
  public isOperationsMode = computed(() => {
    const app = typeof this.persona?.activeApp === 'function' ? this.persona.activeApp() : (this.persona?.activeApp || '');
    return app === 'operations' || (this.router?.url ? this.router.url.includes('/operations/') : false);
  });

  isSavingUser = false;
  /** پیام خطای بارگذاری فهرست کاربران؛ null = بی‌خطا */
  usersLoadError: string | null = null;
  userFormErrors: { [key: string]: boolean } = {};
  /** متن خطای هر فیلد فرم کاربر (از اعتبارسنجی محلی یا بدنهٔ ۴۰۰ سرور) */
  userFieldMessages: { [key: string]: string } = {};

  // Excel Import/Export
  isExcelModalOpen = false;
  excelModalTitle = '';
  excelImportFn!: (file: File, updateExisting: boolean, dryRun?: boolean) => Observable<ImportResult>;
  excelTemplateFn!: () => void;

  public state = inject(StateService);
  public auth = inject(AuthService);
  public persona = inject(AppPersonaService);
  public registry = inject(ModuleRegistryService);
  private toast = inject(ToastService);
  private accountsService = inject(AccountsHttpService);
  private facade = inject(UsersFacade);
  private scopeDirectory = inject(ScopeDirectoryService);
  private injector = inject(Injector);
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  private confirmDialog = inject(ConfirmDialogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public activeCompanyService = inject(ActiveCompanyService);
  private companyApi = inject(CompanyApiService);
  /** مجوزهای ریز (۲.۲): فهرست کامل سرور برای ماژول‌های قالب تازه (ت۶) */
  public permissionService = inject(PermissionService);

  constructor() {}

  ngOnInit() {
    try {
      const savedMode = localStorage.getItem('users_view_mode');
      if (savedMode === 'grid' || savedMode === 'table') {
        this.userViewMode = savedMode;
      }
    } catch (e) {}

    this.route.queryParams.subscribe((params: any) => {
      this.activeTab = params['tab'] || 'users';
      this.rolesSubTab = params['roles'] === 'system' ? 'system' : 'assignment';
      const q = params['q'] || '';
      if (q !== this.searchQuery) {
        this.searchQuery = q;
        this.selectedUserIds.clear();
      }
      this.cdr.detectChanges();
    });

    this.searchSub = this.searchSubject.pipe(
      debounceTime(350)
    ).subscribe(q => {
      this.router.navigate([], { queryParams: { q: q || null }, queryParamsHandling: 'merge', replaceUrl: true });
    });

    this.loadData();
    this.subscribeDirectoryChanges();
    this.network.state$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.detectChanges());
  }

  ngOnDestroy() {
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** گروه‌های مجوز صفحهٔ نقش‌های سامانه‌ای: گروه ماژول‌های قالب قدیم، گروه فهرست کامل سرور برای قالب تازه، سیستم، سایر و حساس */
  private buildPermissionGroups(res: Permission[]): void {
    
    // مجوز حساس: نشانهٔ سرور روی خود مجوز یا `sensitive` فهرست مجوزها (ت۱۰-۴)
    const catalogSensitive = new Set((this.permissionService.catalog()?.permissions || []).filter(p => p.sensitive).map(p => p.code));
    for (const p of res as any[]) {
      if (catalogSensitive.has(p.codename)) p.is_sensitive = true;
    }
    const sensitivePerms = res.filter((p: any) => p.is_sensitive);

    // گروه مجوزهای هر ماژول از users.permissionGroup همان ماژول (همهٔ ماژول‌های بیلد؛ نمایش با visiblePermissionGroups)
    const moduleGroupDefs = this.registry.getAllModules()
      .map(m => m.extensions?.users?.permissionGroup)
      .filter((g): g is ModulePermissionGroup => !!g)
      .sort((a, b) => a.order - b.order);
    const moduleGroups = moduleGroupDefs.map(g => ({
      key: g.key,
      title: g.titleFa,
      items: res.filter((p: any) => g.codenames.includes(p.codename) && !p.is_sensitive)
    }));

    // ماژول‌های قالب تازه (ت۶): گروه از فهرست کامل سرور؛ مجوز بخشی در نقش سامانه‌ای جایی ندارد (ت۱۱، سرور ۴۰۰ می‌دهد)
    const catalogSpecs = this.permissionService.catalog()?.permissions || [];
    const legacyCodes = new Set(moduleGroupDefs.flatMap(g => g.codenames));
    const sectionScoped = new Set(catalogSpecs.filter(p => p.scope === 'section').map(p => p.code));
    const moduleOfCode = new Map(catalogSpecs.filter(p => !!p.module).map(p => [p.code, p.module as string]));
    const catalogModules = [...new Set(moduleOfCode.values())];
    const catalogGroups = catalogModules.map(mod => ({
      key: `CATALOG_${mod}`,
      title: this.registry.getSpec(mod)?.titleFa || mod,
      items: res.filter((p: any) =>
        !p.is_sensitive && !sectionScoped.has(p.codename) && !legacyCodes.has(p.codename) && moduleOfCode.get(p.codename) === mod)
    }));
    moduleGroups.push(...catalogGroups);
    const isSectionScoped = (p: any) => sectionScoped.has(p.codename);

    // مدیریت و زیرساخت سیستم
    const systemCodenames = [
      'view_sys_dashboard', 'view_sys_users', 'view_sys_projects', 'view_sys_id_cards',
      'view_sys_export', 'view_sys_settings', 'view_sys_reports',
      'perm_sys_settings', 'perm_sys_logs', 'perm_usr_add', 'perm_usr_edit', 'perm_usr_role',
      'view_customuser', 'add_customuser', 'change_customuser', 'delete_customuser',
      'view_group', 'add_group', 'change_group', 'delete_group'
    ];

    const systemPerms = res.filter((p: any) => systemCodenames.includes(p.codename) && !p.is_sensitive);

    const otherPerms = res.filter((p: any) =>
      !p.is_sensitive &&
      !isSectionScoped(p) &&
      !moduleGroups.some(g => g.items.includes(p)) &&
      !systemPerms.includes(p)
    );

    const groups: { key: string, title: string, items: Permission[], is_sensitive_group?: boolean }[] = [
      ...moduleGroups,
      {
        key: 'MAIN_MENU',
        title: 'سیستم ⚙️',
        items: systemPerms
      },
      {
        key: 'BACKEND',
        title: 'سایر 📑',
        items: otherPerms
      },
      {
        key: 'SENSITIVE',
        title: 'حساس 🛡️',
        items: sensitivePerms,
        is_sensitive_group: true
      }
    ];

    this.systemPermissionGroups = groups.filter(g => g.items.length > 0);
    this.rebuildMemoizedData();
  }

  loadData() {
    this.companyApi.getAll().pipe(catchError(() => of([]))).subscribe((res: any) => {
      this.availableCompanies = Array.isArray(res) ? res : (res?.results || []);
      this.cdr.detectChanges();
    });

    // ماژول‌های قالب تازه گروه مجوزشان را از فهرست کامل سرور می‌گیرند (ت۶)؛ با رسیدنش گروه‌ها دوباره ساخته می‌شوند
    void this.permissionService.ensureCatalog().then(() => {
      if (this.systemPermissions.length) {
        this.buildPermissionGroups(this.systemPermissions);
        this.cdr.detectChanges();
      }
    });

    this.accountsService.getPermissions().subscribe(res => {
      this.systemPermissions = res;
      this.buildPermissionGroups(res);
    }, error => {
      console.warn('[Users] خطا در دریافت مجوزهای سیستم:', error);
    });

    this.accountsService.getRoles().subscribe({
      next: (res) => {
        const rolesList = Array.isArray(res) ? res : [];
        this.state.appState.roles = rolesList;
        const map: any = {};
        const flattenRoles = (roles: any[]) => {
          for (const r of roles) {
            map[r.name] = { title: r.title, color: r.color };
            if (Array.isArray(r.children) && r.children.length) flattenRoles(r.children);
          }
        };
        flattenRoles(rolesList);
        this.state.appState.rolesMap = map;
        this.rebuildMemoizedData();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.warn('[Users] خطا در دریافت نقش‌ها:', err);
      }
    });

    this.isLoading = true;
    this.usersLoadError = null;
    this.accountsService.getUsers().subscribe({
      next: (res) => {
        this.state.appState.users = Array.isArray(res) ? res : [];
        this.rebuildMemoizedData();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        // خطای بارگذاری فهرست: کارت خطا با «تلاش دوباره» (سرور در دسترس نیست جدا از بقیه)
        const status = Number(err?.status ?? -1);
        this.usersLoadError = isServerUnreachable(status)
          ? 'سرور در دسترس نیست'
          : extractApiError(err, 'بارگذاری کاربران انجام نشد.');
        this.cdr.detectChanges();
      }
    });

    this.loadAssignmentScopeItems(this.assignmentScopeProviders());

    if (typeof this.accountsService?.getLockedStatus === 'function') {
      this.accountsService.getLockedStatus().subscribe({
        next: (res) => {
          if (res && Array.isArray(res.locked_users)) {
            this.lockedUsernames = new Set(
              res.locked_users.filter((u: any) => u.is_locked).map((u: any) => u.username)
            );
            this.cdr.detectChanges();
          }
        },
        error: () => {}
      });
    }
  }

  /** فهرست هدف‌های تخصیص از نخستین ماژول در دسترس؛ خطای بارگذاری به ماژول بعدی می‌رود */
  private loadAssignmentScopeItems(providers: ReturnType<Users['assignmentScopeProviders']>): void {
    const [first, ...rest] = providers;
    if (!first) return;
    first.ext.assignmentScope!.loadItems(this.injector).then(
      (items) => {
        this.state.appState.projects = Array.isArray(items) ? items : [];
        this.cdr.detectChanges();
      },
      () => this.loadAssignmentScopeItems(rest)
    );
  }

  rebuildMemoizedData(): void {
    const roles: any[] = Array.isArray(this.state.appState.roles) ? this.state.appState.roles : [];
    const users: any[] = Array.isArray(this.state.appState.users) ? this.state.appState.users : [];
    this.authorizedSystemsEpoch++;

    // 1. Permissions id -> codename map
    if (this.systemPermissions && this.systemPermissions.length > 0) {
      this.permIdToCodenameMap.clear();
      for (const p of this.systemPermissions) {
        this.permIdToCodenameMap.set(p.id, p.codename);
      }
    }

    // 3. Count of users per role
    this.roleUsersCountMap.clear();
    for (const u of users) {
      if (Array.isArray(u.groups)) {
        for (const gId of u.groups) {
          this.roleUsersCountMap.set(gId, (this.roleUsersCountMap.get(gId) || 0) + 1);
        }
      }
    }

    // 4. Map user to roles list & primary role
    this.userRolesMap.clear();
    this.primaryRoleMap.clear();
    const rolesById = new Map<number, any>(roles.map((r: any) => [r.id, r]));

    for (const u of users) {
      const uGroups = u.groups || [];
      const userRoles = uGroups.map((rId: any) => {
        const r = rolesById.get(rId);
        if (!r) return { name: 'نامشخص', color: '#94a3b8' };
        return { name: r.title || r.name, color: r.color || '#94a3b8' };
      });
      this.userRolesMap.set(u.id, userRoles);
      this.primaryRoleMap.set(u.id, userRoles[0] || { name: 'نامشخص', color: '#94a3b8' });
    }
  }

  get filteredUsers() {
    const q = this.searchQuery.trim().toLowerCase();
    let users = Array.isArray(this.state.appState.users) ? this.state.appState.users : [];

    // فیلتر سریع بر اساس وضعیت سازمانی
    if (this.userStatusFilter === 'active') {
      users = users.filter((u: any) => u.is_active);
    } else if (this.userStatusFilter === 'inactive') {
      users = users.filter((u: any) => !u.is_active);
    } else if (this.userStatusFilter === 'no_warehouse') {
      users = users.filter((u: any) => !u.assigned_warehouses || u.assigned_warehouses.length === 0);
    } else if (this.userStatusFilter === 'superuser') {
      users = users.filter((u: any) => u.is_superuser);
    }

    // فیلتر انتخابی بر اساس نقش سازمانی
    if (this.userRoleFilter !== 'ALL') {
      const rId = Number(this.userRoleFilter);
      users = users.filter((u: any) => Array.isArray(u.groups) && u.groups.includes(rId));
    }

    // فیلتر انتخابی بر اساس انبار انتساب‌یافته
    if (this.userWarehouseFilter !== 'ALL') {
      const wId = String(this.userWarehouseFilter);
      users = users.filter((u: any) => Array.isArray(u.assigned_warehouses) && u.assigned_warehouses.some((id: any) => String(id) === wId));
    }

    let resultList = users;
    if (q) {
      resultList = users.filter((u: any) => {
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
        const username = (u.username || '').toLowerCase();
        const nid = (u.national_code || '');
        const phone = (u.phone_number || '');
        const comp = (u.company || '').toLowerCase();
        const compAccesses = (u.company_accesses || []).map((ca: any) => (ca.company_name || '').toLowerCase()).join(' ');
        const opZone = (u.operational_zone || '').toLowerCase();
        const roleTitles = this.getUserRoles(u).map((r: any) => r.name.toLowerCase()).join(' ');

        return fullName.includes(q) ||
               username.includes(q) ||
               nid.includes(q) ||
               phone.includes(q) ||
               comp.includes(q) ||
               compAccesses.includes(q) ||
               opZone.includes(q) ||
               roleTitles.includes(q);
      });
    }

    const sorted = [...resultList];
    sorted.sort((a: any, b: any) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];
      if (this.sortField === 'full_name') {
        valA = `${a.first_name || ''} ${a.last_name || ''}`.trim();
        valB = `${b.first_name || ''} ${b.last_name || ''}`.trim();
      }
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA === valB) return 0;
      if (valA == null || valA === '') return 1;
      if (valB == null || valB === '') return -1;
      const cmp = valA > valB ? 1 : -1;
      return this.sortOrder === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }

  // ── Pagination Getters & Methods ─────────────────────────────────
  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get pagedUsers(): any[] {
    const page = Math.min(Math.max(1, this.currentPage), this.totalPages);
    const start = (page - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get displayedUsers(): any[] {
    if (this.userViewMode === 'table') {
      return this.pagedUsers;
    }
    return this.filteredUsers.slice(0, this.visibleCount);
  }

  loadMoreUsers(): void {
    if (this.visibleCount < this.filteredUsers.length) {
      this.visibleCount += this.pageSize;
    }
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
    this.cdr.detectChanges();
  }

  get paginationRange(): { start: number; end: number } {
    if (this.filteredUsers.length === 0) return { start: 0, end: 0 };
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.filteredUsers.length, this.currentPage * this.pageSize);
    return { start, end };
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.cdr.detectChanges();
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.visibleCount = size;
    this.cdr.detectChanges();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.visibleCount = this.pageSize;
    this.clearUserSelection();
    this.cdr.detectChanges();
  }

  getPageNumbers(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [1];
    if (current > 3) {
      pages.push('...');
    }
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (current < total - 2) {
      pages.push('...');
    }
    pages.push(total);
    return pages;
  }

  setStatusFilter(filter: 'all' | 'active' | 'inactive' | 'no_warehouse' | 'superuser') {
    this.userStatusFilter = filter;
    this.currentPage = 1;
    this.visibleCount = this.pageSize;
    this.clearUserSelection();
    this.cdr.detectChanges();
  }

  // ── Bulk Selection & Actions ─────────────────────────────────────
  isUserSelected(id: number): boolean {
    return this.selectedUserIds.has(id);
  }

  toggleSelectUser(id: number, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.selectedUserIds.has(id)) {
      this.selectedUserIds.delete(id);
    } else {
      this.selectedUserIds.add(id);
    }
    this.cdr.detectChanges();
  }

  isAllCurrentPageSelected(): boolean {
    const users = this.pagedUsers;
    return users.length > 0 && users.every(u => this.selectedUserIds.has(u.id));
  }

  toggleSelectAllCurrentPage(event?: Event): void {
    if (event) event.stopPropagation();
    const users = this.pagedUsers;
    if (this.isAllCurrentPageSelected()) {
      users.forEach(u => this.selectedUserIds.delete(u.id));
    } else {
      users.forEach(u => this.selectedUserIds.add(u.id));
    }
    this.cdr.detectChanges();
  }

  clearUserSelection(): void {
    this.selectedUserIds.clear();
    this.cdr.detectChanges();
  }

  async bulkToggleStatus(activate: boolean): Promise<void> {
    if (this.denyUserWrite('edit')) return;
    const targetIds = Array.from(this.selectedUserIds).filter(id => {
      const u = this.state.appState.users.find((x: any) => x.id === id);
      return u && u.is_active !== activate;
    });

    if (targetIds.length === 0) {
      this.toast.show('info', `تمامی کاربران انتخاب‌شده در حال حاضر ${activate ? 'فعال' : 'معلق'} هستند.`);
      return;
    }

    if (!activate) {
      const ok = await this.confirmDialog.open({
        title: 'تعلیق گروهی کاربران',
        message: `${targetIds.length.toLocaleString('fa-IR')} کاربر معلق می‌شوند و دسترسی آن‌ها فوراً قطع می‌گردد. ادامه می‌دهید؟`,
        confirmText: 'بله، معلق شوند',
        cancelText: 'انصراف',
        type: 'warning',
      });
      if (ok !== true) return;
    }

    interface BulkToggleItem {
      success: boolean;
      id: number;
      res?: any;
      err?: any;
    }

    this.isLoading = true;
    const requests: Observable<BulkToggleItem>[] = targetIds.map(id =>
      this.accountsService.toggleUserStatus(id, activate).pipe(
        map((res): BulkToggleItem => ({ success: true, id, res })),
        catchError((err): Observable<BulkToggleItem> => of({ success: false, id, err }))
      )
    );

    forkJoin(requests).subscribe({
      next: (results) => {
        this.isLoading = false;
        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        // بروزرسانی رکوردهای موفق در حافظه کامپوننت و حذف تیک انتخاب آن‌ها
        successes.forEach(r => {
          const u = this.state.appState.users.find((x: any) => x.id === r.id);
          if (u) u.is_active = activate;
          this.selectedUserIds.delete(r.id);
        });

        if (failures.length === 0) {
          this.toast.show('success', `وضعیت ${successes.length} کاربر با موفقیت به «${activate ? 'فعال' : 'معلق'}» تغییر یافت.`);
          this.clearUserSelection();
        } else if (successes.length > 0) {
          const firstErr = failures[0].err;
          const msg = firstErr?.error?.detail || firstErr?.error?.error || (typeof firstErr?.error === 'string' ? firstErr.error : 'خطای دسترسی یا محدودیت سیستمی');
          this.toast.show('warning', `وضعیت ${successes.length} کاربر تغییر یافت؛ اما ${failures.length} کاربر تغییر نکرد: ${msg}`);
        } else {
          const firstErr = failures[0].err;
          const msg = firstErr?.error?.detail || firstErr?.error?.error || (typeof firstErr?.error === 'string' ? firstErr.error : 'خطا در تغییر وضعیت کاربران');
          this.toast.show('error', msg);
        }

        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.toast.show('error', 'خطای غیرمنتظره در تغییر وضعیت کاربران');
        this.loadData();
      }
    });
  }

  bulkExportSelectedUsers(): void {
    const ids = Array.from(this.selectedUserIds);
    if (ids.length === 0) {
      this.exportUsersExcel();
      return;
    }
    this.facade.exportUsersExcel(ids).subscribe({
      next: (blob) => {
        this.triggerDownload(blob, `users_export_${ids.length}_selected.xlsx`);
        this.toast.show('success', `خروجی اکسل ${ids.length} کاربر انتخاب‌شده با موفقیت دانلود شد.`);
      },
      error: () => {
        this.toast.show('error', 'خطا در دانلود فایل اکسل کاربران انتخاب‌شده.');
      }
    });
  }

  // ── Role Percentage & Popover Helpers ────────────────────────────
  getRolePermissionPercent(role: any): number {
    const total = this.systemPermissions.length || 70;
    const count = role.permissions?.length || 0;
    return Math.min(100, Math.round((count / total) * 100));
  }

  toggleRolePopover(roleId: number, event: Event): void {
    event.stopPropagation();
    this.activePopoverRoleId = this.activePopoverRoleId === roleId ? null : roleId;
    this.cdr.detectChanges();
  }

  closeRolePopover(): void {
    this.activePopoverRoleId = null;
    this.cdr.detectChanges();
  }

  getRoleGroupSummary(role: any): { title: string; count: number; total: number }[] {
    if (!role || !role.permissions) return [];
    const rolePermSet = new Set<number>(role.permissions);
    return (this.systemPermissionGroups || []).map(group => {
      const count = group.items.filter(p => rolePermSet.has(p.id)).length;
      return {
        title: group.title,
        count: count,
        total: group.items.length
      };
    }).filter(g => g.count > 0);
  }

  get userCounts() {
    const users = Array.isArray(this.state.appState.users) ? this.state.appState.users : [];
    return {
      all: users.length,
      active: users.filter((u: any) => u.is_active).length,
      inactive: users.filter((u: any) => !u.is_active).length,
      noWarehouse: users.filter((u: any) => !u.assigned_warehouses || u.assigned_warehouses.length === 0).length,
      superuser: users.filter((u: any) => u.is_superuser).length
    };
  }

  getAvailableSupervisors() {
    const users = this.state.appState.users || [];
    if (!this.editingUser || !this.editingUser.id) return users;

    const invalidIds = new Set<number>();
    invalidIds.add(this.editingUser.id);

    // پیشگیری از بروز وابستگی چرخه‌ای مستقیم و غیرمستقیم در چارت سازمانی (A -> B -> A)
    const addSubordinates = (supId: number) => {
      users.forEach((u: any) => {
        if (u.supervisor === supId && !invalidIds.has(u.id)) {
          invalidIds.add(u.id);
          addSubordinates(u.id);
        }
      });
    };
    addSubordinates(this.editingUser.id);

    return users.filter((u: any) => !invalidIds.has(u.id));
  }

  getUserAvatarLetter(u: any): string {
    if (u.first_name && u.first_name.trim().length > 0) {
      return u.first_name.trim()[0];
    }
    if (u.username && u.username.trim().length > 0) {
      return u.username.trim()[0].toUpperCase();
    }
    return '👤';
  }

  getUsersInRoleCount(roleId: number): number {
    return this.roleUsersCountMap.get(roleId) || 0;
  }

  getUsersInRole(roleId: number): any[] {
    const users = this.state.appState?.users || [];
    return users.filter((u: any) => u.groups && u.groups.includes(roleId));
  }

  get allRoles(): any[] {
    return Array.isArray(this.state.appState?.roles) ? this.state.appState.roles : [];
  }

  getPrimaryRole(u: any) {
    return this.primaryRoleMap.get(u.id) || { name: 'نامشخص', color: '#94a3b8' };
  }

  getUserRoles(u: any) {
    return this.userRolesMap.get(u.id) || [];
  }

  getProjectName(id: any) {
    const p = this.state.appState.projects.find((proj: any) => String(proj.id) === String(id));
    return p ? p.name : id;
  }

  private static readonly EMPTY_BADGES: { name: string; is_default: boolean; code?: string }[] = [];
  private companyBadgesCache = new WeakMap<object, { sig: string; value: { name: string; is_default: boolean; code?: string }[] }>();

  /** نشان شرکت‌ها؛ تا وقتی داده‌ی کاربر عوض نشده همان آرایه برمی‌گردد (NG0103) */
  getUserCompanyBadges(u: any): { name: string; is_default: boolean; code?: string }[] {
    if (!u) return Users.EMPTY_BADGES;
    const sig = JSON.stringify([u.company_accesses, u.company]);
    const hit = this.companyBadgesCache.get(u);
    if (hit && hit.sig === sig) return hit.value;
    let value: { name: string; is_default: boolean; code?: string }[] = Users.EMPTY_BADGES;
    if (u.company_accesses && u.company_accesses.length > 0) {
      value = u.company_accesses.map((ca: any) => ({
        name: ca.company_name || ca.company_code || 'شرکت',
        is_default: !!ca.is_default,
        code: ca.company_code
      }));
    } else if (u.company) {
      value = [{ name: u.company, is_default: true }];
    }
    this.companyBadgesCache.set(u, { sig, value });
    return value;
  }

  switchPermTab(tab: string) {
    this.activePermTab = tab;
    this.cdr.detectChanges();
  }

  onSearchChange(val: string) {
    this.currentPage = 1;
    this.visibleCount = this.pageSize;
    // نتیجهٔ جستجو عوض می‌شود؛ انتخاب گروهی قبلی نباید روی کاربران پنهان اثر کند (۲.۹-ب)
    if (this.selectedUserIds.size) this.selectedUserIds.clear();
    this.searchSubject.next(val);
  }

  isUserLocked(username: string): boolean {
    return this.lockedUsernames.has(username);
  }

  unlockUser(u: any, event?: Event): void {
    if (event) event.stopPropagation();
    this.closeMenus();
    this.accountsService.resetLockout(u.username).subscribe({
      next: () => {
        this.lockedUsernames.delete(u.username);
        this.toast.show('success', `مسدودیت ضدنفوذ کاربر ${u.username} با موفقیت رفع شد.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در رفع مسدودیت ضدنفوذ کاربر');
      }
    });
  }

  toggleMenu(event: Event, menuId: string) {
    event.stopPropagation();
    if (this.openMenuId === menuId) this.openMenuId = null;
    else this.openMenuId = menuId;
    this.cdr.detectChanges();
  }

  closeMenus() {
    this.openMenuId = null;
    this.cdr.detectChanges();
  }

  trackById(index: number, item: any) {
    return item.id;
  }

  async toggleUserStatus(id: number): Promise<void> {
    this.closeMenus();
    if (this.denyUserWrite('edit')) return;
    const target = this.state.appState.users.find((x: any) => x.id === id);
    // تعلیق (غیرفعال‌سازی) نیاز به تأیید دارد؛ فعال‌سازی دوباره نه (۲.۹-ب)
    if (target?.is_active) {
      const name = `${target.first_name || ''} ${target.last_name || ''}`.trim() || target.username;
      const ok = await this.confirmDialog.open({
        title: 'تعلیق کاربر',
        message: `حساب «${name}» معلق می‌شود و دسترسی او فوراً قطع می‌گردد. ادامه می‌دهید؟`,
        confirmText: 'بله، معلق شود',
        cancelText: 'انصراف',
        type: 'warning',
      });
      if (ok !== true) return;
    }
    this.accountsService.toggleUserStatus(id).subscribe({
      next: (res) => {
        const u = this.state.appState.users.find((x: any) => x.id === id);
        if (u) {
          u.is_active = res.is_active;
          if (res.is_active) {
              this.toast.show('success', `حساب کاربری از تعلیق خارج و مجدداً فعال شد.`);
          } else {
              this.toast.show('warning', `حساب کاربری مسدود و دسترسی وی قطع شد.`);
          }
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        this.toast.show('error', extractApiError(err, 'خطا در تغییر وضعیت حساب کاربری'));
      }
    });
  }

  async resetPassword(id: number) {
    this.closeMenus();
    if (this.denyUserWrite('edit')) return;
    const u = this.state.appState.users.find((x: any) => x.id === id) || (this.editingUser?.id === id ? this.editingUser : null);
    const name = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username : 'این کاربر';
    const confirmed = await this.confirmDialog.open({
      title: 'بازنشانی رمز عبور',
      message: `رمز عبور ${name} بازنشانی و یک رمز یک‌بارمصرف ساخته می‌شود که کاربر در ورود اول باید آن را عوض کند. ادامه می‌دهید؟`,
      confirmText: 'بله، بازنشانی',
      cancelText: 'انصراف',
      type: 'warning',
    });
    if (confirmed) {
        this.accountsService.adminResetPassword(id).subscribe({
          next: (res) => {
            if (res?.one_time_password) {
              this.showOneTimePasswords([{ username: u?.username || '', password: res.one_time_password }]);
            } else {
              this.toast.show('success', res?.message || 'رمز عبور بازنشانی شد.');
            }
          },
          error: (err) => {
            this.toast.show('error', extractApiError(err, 'خطا در بازنشانی رمز عبور'));
          }
        });
    }
  }

  openAvatarModalForUser(u: any) {
    this.closeMenus();
    if (this.denyUserWrite('edit')) return;
    this.targetUserForAvatar = u;
    this.isAvatarCropperOpen = true;
    this.cdr.detectChanges();
  }

  onSaveUserAvatar(blob: Blob) {
    if (this.isUserModalOpen) {
      // در حالت باز بودن فرم: تغییرات به صورت تراکنشی ذخیره می‌شود و تا قبل از ذخیره نهایی به سرور ارسال نمی‌شود
      this.userForm._pendingAvatarBlob = blob;
      this.userForm._pendingAvatarDelete = false;
      this.userForm.avatar = URL.createObjectURL(blob);
      this.isAvatarCropperOpen = false;
      this.toast.show('info', 'تصویر انتخاب شد و پس از ذخیره فرم اعمال خواهد شد.');
      this.cdr.detectChanges();
    } else if (this.targetUserForAvatar && this.targetUserForAvatar.id) {
      this.isSavingUserAvatar = true;
      this.accountsService.updateUserAvatar(this.targetUserForAvatar.id, blob).subscribe({
        next: (res) => {
          this.isSavingUserAvatar = false;
          this.isAvatarCropperOpen = false;
          const bustAvatar = res.avatar ? `${res.avatar}?t=${Date.now()}` : null;
          this.targetUserForAvatar.avatar = bustAvatar;
          if (this.editingUser && this.editingUser.id === this.targetUserForAvatar.id) {
            this.userForm.avatar = bustAvatar;
          }
          if (this.auth.user()?.id === this.targetUserForAvatar.id) {
            this.auth.updateUserAvatar(bustAvatar);
          }
          this.toast.show('success', 'تصویر کاربر با موفقیت بروزرسانی شد.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSavingUserAvatar = false;
          this.toast.show('error', extractApiError(err, 'خطا در ذخیره تصویر کاربر'));
          this.cdr.detectChanges();
        }
      });
    }
  }

  onRemoveUserAvatar() {
    if (this.isUserModalOpen) {
      // در حالت باز بودن فرم: علامت‌گذاری برای حذف در زمان ذخیره نهایی فرم
      this.userForm._pendingAvatarBlob = null;
      this.userForm._pendingAvatarDelete = true;
      this.userForm.avatar = null;
      this.isAvatarCropperOpen = false;
      this.toast.show('info', 'تصویر حذف شد و پس از ذخیره فرم اعمال خواهد شد.');
      this.cdr.detectChanges();
    } else if (this.targetUserForAvatar && this.targetUserForAvatar.id) {
      this.isSavingUserAvatar = true;
      this.accountsService.deleteUserAvatar(this.targetUserForAvatar.id).subscribe({
        next: () => {
          this.isSavingUserAvatar = false;
          this.isAvatarCropperOpen = false;
          this.targetUserForAvatar.avatar = null;
          if (this.editingUser && this.editingUser.id === this.targetUserForAvatar.id) {
            this.userForm.avatar = null;
          }
          if (this.auth.user()?.id === this.targetUserForAvatar.id) {
            this.auth.updateUserAvatar(null);
          }
          this.toast.show('success', 'تصویر کاربر حذف شد.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSavingUserAvatar = false;
          this.toast.show('error', extractApiError(err, 'خطا در حذف تصویر کاربر'));
          this.cdr.detectChanges();
        }
      });
    }
  }

  openUserModal(id: number | null = null) {
    this.closeMenus();
    this.userFormErrors = {};
    this.isSavingUser = false;
    this.editingUserChanged = false;
    this.isRefetchingEditingUser = false;
    this.editingUserSeq++;
    if (id) {
      // بی perm_usr_edit پنجره فقط خواندنی است؛ ذخیره با canEditUsers بسته است
      const u = this.state.appState.users.find((x: any) => x.id === id);
      if (!u) return;
      this.editingUser = u;
      this.applyUserToForm(u);
    } else {
      if (this.denyUserWrite('add')) return;
      this.editingUser = null;
      this.showPassword = false;
      const activeCid = this.activeCompanyService.activeCompany?.id || (this.availableCompanies[0]?.id ?? null);
      const activeName = this.activeCompanyService.activeCompany?.name || (this.availableCompanies[0]?.name ?? '');
      this.userForm = {
        id: null, first_name: '', last_name: '', national_code: '', username: '', phone_number: '', password: '',
        operational_zone: '', supervisor: null, address: '', company: activeName, email: '', avatar: null, _pendingAvatarBlob: null,
        _pendingAvatarDelete: false, blood_type: '', emergency_contact: '', groups: [], assigned_warehouses: [],
        date_joined: '', last_login: '', is_active: true, is_superuser: false,
        company_ids: activeCid ? [activeCid] : [],
        default_company_id: activeCid
      };
      this.userFormBaseline = JSON.stringify(this.userForm);
    }
    this.userRoleModalTab = this.roleScopes[0]?.key ?? 'global';
    this.userModalInnerTab = 'identity';
    this.isUserModalOpen = true;
    // باز کردن پنجره انبارهای ثبت‌شده را دست نمی‌زند؛ فقط تغییر شرکت‌ها انتخاب را هرس می‌کند
    this.updateModalWarehouses(false);
    this.cdr.detectChanges();
    // ردیف فهرست جایگزین است تا نسخهٔ تازهٔ سرور برسد (۲.۹)
    if (id) this.refetchEditingUser();
  }

  /** پر کردن فرم پنجره از یک ردیف کاربر (باز کردن، بارگذاری دوباره، پس از ساخت) */
  private applyUserToForm(u: any): void {
    {
      const { roles, role_objects, ...userFields } = u;
      const compIds = u.company_ids ? [...u.company_ids].map(Number) : (u.company_accesses ? u.company_accesses.map((a: any) => Number(a.company_id)) : []);
      this.userForm = {
        ...userFields,
        company: u.company || '',
        address: u.address || '',
        email: u.email || '',
        avatar: u.avatar || null,
        password: '',
        _pendingAvatarBlob: null,
        _pendingAvatarDelete: false,
        blood_type: u.blood_type || '',
        emergency_contact: u.emergency_contact || '',
        operational_zone: u.operational_zone || '',
        supervisor: u.supervisor || null,
        company_ids: compIds,
        default_company_id: u.default_company_id ? Number(u.default_company_id) : (compIds[0] || null)
      };
      this.userForm.groups = u.groups ? [...u.groups].map(Number) : [];
      this.userForm.assigned_warehouses = (this.userForm.assigned_warehouses || []).map(Number);

      // اگر کاربر شرکت تعریف‌شده در لیست ندارد ولی نام شرکت ثبت شده، مطابقت بدهیم
      if (this.userForm.company_ids.length === 0 && u.company && this.availableCompanies.length > 0) {
        const matched = this.availableCompanies.find(c => c.name === u.company);
        if (matched) {
          this.userForm.company_ids = [matched.id];
          this.userForm.default_company_id = matched.id;
        }
      }
    }
    this.userFormBaseline = JSON.stringify(this.userForm);
  }

  toggleUserCompany(companyId: number) {
    const numId = Number(companyId);
    let ids: number[] = [...(this.userForm.company_ids || [])];
    if (ids.includes(numId)) {
      ids = ids.filter(id => id !== numId);
      if (this.userForm.default_company_id === numId) {
        this.userForm.default_company_id = ids.length > 0 ? ids[0] : null;
      }
      // پاک‌سازی انبارهای تخصیص‌یافته به شرکت غیرفعال‌شده
      if (this.userForm.assigned_warehouses && this.userForm.assigned_warehouses.length > 0) {
        const removedWhIds = new Set(
          this.modalWarehouses
            .filter((wh: any) => wh.company_id === numId || wh.company === numId)
            .map((wh: any) => wh.id)
        );
        this.userForm.assigned_warehouses = this.userForm.assigned_warehouses.filter(
          (whId: number) => !removedWhIds.has(whId)
        );
      }
    } else {
      ids.push(numId);
      if (!this.userForm.default_company_id) {
        this.userForm.default_company_id = numId;
      }
    }
    this.userForm.company_ids = ids;
    const defComp = this.availableCompanies.find(c => c.id === this.userForm.default_company_id);
    this.userForm.company = defComp ? defComp.name : '';
    this.updateModalWarehouses();
    this.cdr.detectChanges();
  }

  setDefaultCompany(companyId: number, event?: Event) {
    if (event) event.stopPropagation();
    const numId = Number(companyId);
    if (!this.userForm.company_ids.includes(numId)) {
      this.userForm.company_ids.push(numId);
    }
    this.userForm.default_company_id = numId;
    const defComp = this.availableCompanies.find(c => c.id === numId);
    this.userForm.company = defComp ? defComp.name : '';
    this.cdr.detectChanges();
  }

  selectAllModalWarehouses() {
    const ids = (this.modalWarehouses || []).map((w: any) => w.id);
    this.userForm.assigned_warehouses = Array.from(new Set([...(this.userForm.assigned_warehouses || []), ...ids]));
    this.cdr.detectChanges();
  }

  clearAllModalWarehouses() {
    const modalIds = new Set((this.modalWarehouses || []).map((w: any) => w.id));
    this.userForm.assigned_warehouses = (this.userForm.assigned_warehouses || []).filter((id: number) => !modalIds.has(id));
    this.cdr.detectChanges();
  }

  updateModalWarehouses(pruneSelection = true) {
    this.isLoadingModalWarehouses = true;
    const selectedCompanyIds = (this.userForm.company_ids || []).map(Number);
    
    if (selectedCompanyIds.length === 0) {
      this.modalWarehouses = [];
      if (pruneSelection) this.userForm.assigned_warehouses = [];
      this.isLoadingModalWarehouses = false;
      this.cdr.detectChanges();
      return;
    }

    const requests = selectedCompanyIds.map((cid: number) =>
      this.scopeDirectory.getAll(cid).pipe(catchError(() => of([])))
    );

    forkJoin<any[]>(requests).subscribe({
      next: (results: any) => {
        const combined = new Map<number, any>();
        results.forEach((whList: any) => {
          if (Array.isArray(whList)) {
            whList.forEach((wh: any) => {
              combined.set(wh.id, wh);
            });
          }
        });
        this.modalWarehouses = Array.from(combined.values());
        this.isLoadingModalWarehouses = false;
        if (pruneSelection && this.userForm.assigned_warehouses && this.userForm.assigned_warehouses.length > 0) {
          const currentValidWhIds = new Set(this.modalWarehouses.map((w: any) => Number(w.id)));
          this.userForm.assigned_warehouses = this.userForm.assigned_warehouses.filter(
            (id: number) => currentValidWhIds.has(Number(id))
          );
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingModalWarehouses = false;
        this.cdr.detectChanges();
      }
    });
  }

  setUserModalInnerTab(tab: 'identity' | 'security' | 'roles' | 'warehouses' | 'permissions' | 'substitute') {
    // تب «مجوزها» و «جانشین» فقط برای کاربر ذخیره‌شده (طرح ۲.۲، ۲.۳)
    if ((tab === 'permissions' || tab === 'substitute') && !this.editingUser?.id) return;
    this.userModalInnerTab = tab;
    this.cdr.detectChanges();
  }

  /** بستن پنجرهٔ کاربر؛ با ویرایش ذخیره‌نشده اول می‌پرسد (بک‌دراپ، انصراف، ضربدر و Escape همه از همین‌جا) */
  async requestCloseUserModal(): Promise<void> {
    if (!this.isUserModalOpen) return;
    if (this.isSavingUser || this.closeAsking) return;
    if (this.isUserFormDirty) {
      this.closeAsking = true;
      let ok: boolean | string | undefined;
      try {
        ok = await this.confirmDialog.open({
          title: 'تغییرات ذخیره نشده',
          message: 'تغییرات ذخیره‌نشده‌اند. بسته شود؟',
          confirmText: 'بله، بسته شود',
          cancelText: 'ادامه ویرایش',
          type: 'warning',
        });
      } finally {
        this.closeAsking = false;
      }
      if (ok !== true) return;
    }
    this.isUserModalOpen = false;
    this.cdr.detectChanges();
  }

  /** پرسش «بسته شود؟» باز است؛ Escape دوباره پرسش دوم نمی‌سازد */
  private closeAsking = false;

  /** فرم نقش درست پس از باز شدن پنجره؛ معیار «ویرایش ذخیره‌نشده» */
  private roleFormBaseline = '';

  get isRoleFormDirty(): boolean {
    return JSON.stringify(this.roleForm) !== this.roleFormBaseline;
  }

  async requestCloseRoleModal(): Promise<void> {
    if (!this.isRoleModalOpen) return;
    if (this.closeAsking) return;
    if (this.isRoleFormDirty) {
      this.closeAsking = true;
      let ok: boolean | string | undefined;
      try {
        ok = await this.confirmDialog.open({
          title: 'تغییرات ذخیره نشده',
          message: 'تغییرات ذخیره‌نشده‌اند. بسته شود؟',
          confirmText: 'بله، بسته شود',
          cancelText: 'ادامه ویرایش',
          type: 'warning',
        });
      } finally {
        this.closeAsking = false;
      }
      if (ok !== true) return;
    }
    this.isRoleModalOpen = false;
    this.cdr.detectChanges();
  }

  /** Escape و کلیدهای Tab (فوکوس‌ترپ): بالاترین پنجرهٔ باز */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onEscapeKey(event);
      return;
    }

    if (event.key === 'Tab') {
      this.handleFocusTrap(event);
    }
  }

  onEscapeKey(event?: Event): void {
    if (this.oneTimePasswords) {
      // رمز یک‌بارمصرف فقط یک بار دیده می‌شود؛ Escape آن را نمی‌بندد و پنجرهٔ زیرین هم بسته نمی‌شود
      event?.preventDefault?.();
      return;
    }
    if (this.isSensitiveWarningModalOpen) return;
    if (this.isDeleteModalOpen) {
      event?.preventDefault?.();
      this.isDeleteModalOpen = false;
      this.cdr.detectChanges();
      return;
    }
    if (this.isUserModalOpen) {
      event?.preventDefault?.();
      void this.requestCloseUserModal();
      return;
    }
    if (this.isRoleModalOpen) {
      event?.preventDefault?.();
      void this.requestCloseRoleModal();
    }
  }

  private handleFocusTrap(event: KeyboardEvent): void {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (!dialogs || dialogs.length === 0) return;
    const topDialog = dialogs[dialogs.length - 1];

    const focusable = topDialog.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!topDialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  /** پیوند «پروژه‌ها و بخش‌ها» در تب مجوزها: استودیوی شرکتِ نخستین انتساب کاربر، تب پروژه‌ها (با بررسی تغییرات ذخیره‌نشده) */
  async openUserAssignments(companyId: number | null): Promise<void> {
    await this.requestCloseUserModal();
    if (this.isUserModalOpen) return;
    if (companyId) {
      this.router.navigate(['/app/companies', companyId], { queryParams: { tab: 'projects' } });
    } else {
      this.router.navigate(['/app/companies']);
    }
  }

  toggleUserRoleCheckbox(roleId: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.userForm.groups.includes(roleId)) this.userForm.groups.push(roleId);
    } else {
      this.userForm.groups = this.userForm.groups.filter((id: number) => id !== roleId);
    }
  }

  isWarehouseAssigned(projId: any): boolean {
    const numId = Number(projId);
    return (this.userForm.assigned_warehouses || []).some((id: any) => Number(id) === numId);
  }

  toggleUserProjCheckbox(projId: any, event: Event) {
    const numId = Number(projId);
    const checked = (event.target as HTMLInputElement).checked;
    let list = (this.userForm.assigned_warehouses || []).map(Number);
    if (checked) {
      if (!list.includes(numId)) list.push(numId);
    } else {
      list = list.filter((id: number) => id !== numId);
    }
    this.userForm.assigned_warehouses = list;
  }

  getContrastTextColor(hexColor: string): string {
    if (!hexColor) return '#ffffff';
    let c = hexColor.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return '#ffffff';
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 165 ? '#0f172a' : '#ffffff';
  }

  validateNationalCode(code: string): boolean {
    if (!code) return true;
    let clean = this.toEnglishDigits(code).replace(/\D/g, '');
    if (clean.length > 0 && clean.length < 10) {
      clean = clean.padStart(10, '0');
    }
    if (clean.length !== 10) return false;
    if (/^(\d)\1{9}$/.test(clean)) return false;
    const digits = clean.split('').map(Number);
    const checksum = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
    const remainder = sum % 11;
    return (remainder < 2 && checksum === remainder) || (remainder >= 2 && checksum === 11 - remainder);
  }

  clearUserFormError(field: string) {
    if (this.userFormErrors[field]) {
      delete this.userFormErrors[field];
    }
    if (this.userFieldMessages[field]) {
      delete this.userFieldMessages[field];
    }
  }

  /** تب پنجرهٔ کاربر که هر فیلد در آن است (برای پرش به نخستین فیلد دارای خطا) */
  private static readonly FIELD_TAB: Record<string, 'identity' | 'security' | 'roles' | 'warehouses'> = {
    username: 'identity',
    password: 'security',
    groups: 'roles',
    company_ids: 'warehouses',
    assigned_warehouses: 'warehouses',
  };

  private fieldTab(field: string): 'identity' | 'security' | 'roles' | 'warehouses' {
    return Users.FIELD_TAB[field] || 'identity';
  }

  /** خطای یک فیلد: پیام زیر فیلد، رفتن به تب آن و اعلان کوتاه */
  private failUserField(field: string, tab: 'identity' | 'security' | 'roles' | 'warehouses', message: string): void {
    this.userModalInnerTab = tab;
    this.userFormErrors[field] = true;
    this.userFieldMessages[field] = message;
    this.toast.show('error', message);
  }

  /**
   * بدنهٔ ۴۰۰ سرور به شکل {فیلد: [پیام‌ها]} به خطای همان فیلد زیر ورودی می‌رود و به تب نخستین فیلد خطادار می‌پریم.
   * true = دست‌کم یک فیلد شناخته‌شده در فرم بود؛ پیام‌های بدون فیلد (detail و ...) را فراخوان با extractApiError اعلان می‌کند.
   */
  private applyServerFieldErrors(err: any): boolean {
    const body = err?.error;
    if (err?.status !== 400 || !body || typeof body !== 'object' || Array.isArray(body)) return false;
    let first: string | null = null;
    for (const key of Object.keys(body)) {
      if (key === 'detail' || key === 'error' || key === 'non_field_errors') continue;
      if (!(key in this.userForm)) continue;
      const raw = body[key];
      const msg = (Array.isArray(raw) ? raw : [raw]).filter(m => typeof m === 'string').join(' ');
      if (!msg) continue;
      this.userFormErrors[key] = true;
      this.userFieldMessages[key] = msg;
      if (!first) first = key;
    }
    if (!first) return false;
    this.userModalInnerTab = this.fieldTab(first);
    return true;
  }

  toEnglishDigits(str: string): string {
    if (!str) return '';
    return str
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧۸۹'.indexOf(d).toString());
  }

  isFieldValid(field: string): boolean {
    if (this.userFormErrors && this.userFormErrors[field]) return false;

    switch (field) {
      case 'first_name':
        return (this.userForm.first_name || '').trim().length >= 2;

      case 'last_name':
        return (this.userForm.last_name || '').trim().length >= 2;

      case 'username': {
        const u = (this.userForm.username || '').trim();
        return u.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(u);
      }

      case 'national_code': {
        let val = this.toEnglishDigits(this.userForm.national_code || '').replace(/\D/g, '');
        if (val.length > 0 && val.length < 10) {
          val = val.padStart(10, '0');
        }
        return val.length === 10 && this.validateNationalCode(val);
      }

      case 'phone_number': {
        let p = this.toEnglishDigits(this.userForm.phone_number || '').replace(/[\s\-_]/g, '');
        if (p.startsWith('+98')) p = '0' + p.substring(3);
        else if (p.startsWith('0098')) p = '0' + p.substring(4);
        else if (p.startsWith('98') && p.length === 12) p = '0' + p.substring(2);
        else if (p.startsWith('9') && p.length === 10) p = '0' + p;
        return /^09\d{9}$/.test(p);
      }

      case 'emergency_contact': {
        const em = this.toEnglishDigits(this.userForm.emergency_contact || '').replace(/\D/g, '');
        return em.length >= 8 && em.length <= 11;
      }

      case 'email': {
        const email = (this.userForm.email || '').trim();
        return email.length > 0 && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
      }

      case 'password': {
        const pwd = this.userForm.password || '';
        return pwd.length >= 6;
      }

      case 'company':
        return (this.userForm.company || '').trim().length >= 2;

      case 'operational_zone':
        return (this.userForm.operational_zone || '').trim().length >= 2;

      case 'address':
        return (this.userForm.address || '').trim().length >= 5;

      case 'blood_type':
        return !!this.userForm.blood_type;

      case 'supervisor':
        return this.userForm.supervisor !== null;

      default:
        return false;
    }
  }

  getFieldClass(field: string): string {
    if (this.userFormErrors && this.userFormErrors[field]) {
      return 'border-rose-400 bg-rose-50/50 text-rose-900 ring-2 ring-rose-200/80 focus:border-rose-500 focus:ring-rose-300';
    }
    if (this.isFieldValid(field)) {
      return 'border-emerald-500 bg-emerald-50/20 text-slate-800 ring-1.5 ring-emerald-400/80 focus:border-emerald-500 focus:ring-emerald-300';
    }
    return 'border-slate-200 bg-slate-50/60 text-slate-800 focus:border-indigo-500 focus:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500';
  }

  generateRandomPassword() {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.userForm.password = pwd;
    this.clearUserFormError('password');
  }

  saveUser() {
    if (this.denyUserWrite(this.editingUser ? 'edit' : 'add')) return;
    this.userFormErrors = {};
    this.userFieldMessages = {};

    const fName = (this.userForm.first_name || '').trim();
    const lName = (this.userForm.last_name || '').trim();
    const uName = (this.userForm.username || '').trim();

    if (!fName) {
      return this.failUserField('first_name', 'identity', 'وارد کردن «نام» الزامی است.');
    }

    if (!lName) {
      return this.failUserField('last_name', 'identity', 'وارد کردن «نام خانوادگی» الزامی است.');
    }

    if (!uName) {
      return this.failUserField('username', 'security', 'وارد کردن «کد / نام کاربری (Username)» الزامی است.');
    }

    const normalizeDigits = (str: string) => {
      return (str || '')
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
        .replace(/[\s\-_]/g, '')
        .trim();
    };

    let phone = normalizeDigits(this.userForm.phone_number);
    let nid = normalizeDigits(this.userForm.national_code);
    if (nid && nid.length > 0 && nid.length < 10) {
      nid = nid.padStart(10, '0');
      this.userForm.national_code = nid;
    }
    let emergency = normalizeDigits(this.userForm.emergency_contact);

    if (nid && !this.validateNationalCode(nid)) {
      return this.failUserField('national_code', 'identity', 'کد ملی وارد شده با الگوریتم استاندارد ۱۰ رقمی همخوانی ندارد.');
    }

    if (phone) {
      if (phone.startsWith('+98')) phone = '0' + phone.substring(3);
      else if (phone.startsWith('0098')) phone = '0' + phone.substring(4);
      else if (phone.startsWith('98') && phone.length === 12) phone = '0' + phone.substring(2);
      else if (phone.startsWith('9') && phone.length === 10) phone = '0' + phone;
    }

    if (!this.editingUser && !phone) {
      return this.failUserField('phone_number', 'identity', 'وارد کردن شماره تلفن همراه برای تعریف کاربر جدید الزامی است.');
    }

    if (phone && !/^09\d{9}$/.test(phone)) {
      return this.failUserField('phone_number', 'identity', 'فرمت شماره همراه نامعتبر است. شماره همراه باید با 09 شروع شده و ۱۱ رقم باشد (مانند 09123456789).');
    }

    const emailVal = (this.userForm.email || '').trim();
    if (emailVal && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailVal)) {
      return this.failUserField('email', 'identity', 'فرمت آدرس ایمیل واردشده نامعتبر است (مانند user@example.com).');
    }

    const pwdVal = (this.userForm.password || '').trim();
    if (pwdVal && pwdVal.length < 6) {
      return this.failUserField('password', 'security', 'کلمه عبور باید حداقل ۶ کاراکتر باشد.');
    }

    const pendingBlob = this.userForm._pendingAvatarBlob;
    const pendingDelete = this.userForm._pendingAvatarDelete;
    const payload: any = { ...this.userForm };
    delete payload._pendingAvatarBlob;
    delete payload._pendingAvatarDelete;
    delete payload.avatar; // Avatar is uploaded via dedicated endpoint
    if (!payload.password) delete payload.password;
    // رمز کاربر دیگر هرگز با ویرایش فرستاده نمی‌شود؛ فقط «بازنشانی رمز» (۲.۹، سرور ۴۰۰ می‌دهد)
    if (this.isEditingOtherUser) delete payload.password;
    payload.first_name = fName;
    payload.last_name = lName;
    payload.username = uName;
    payload.national_code = nid || null;
    payload.emergency_contact = emergency || null;
    if (!payload.supervisor) payload.supervisor = null;
    payload.phone_number = phone || null;
    payload.email = payload.email ? payload.email.trim() : '';
    if (!payload.company) payload.company = null;
    if (!payload.address) payload.address = null;
    if (!payload.operational_zone) payload.operational_zone = null;

    // پاک‌سازی قطعی فیلدهای سیستمی تا از خطای فرمت تاریخ جنگو جلوگیری شود
    delete payload.date_joined;
    delete payload.last_login;
    delete payload.created_by;
    delete payload.modified_by;
    delete payload.updated_at;
    delete payload.roles;
    delete payload.role_objects;
    payload.groups = (this.userForm.groups || []).map(Number);
    payload.company_ids = (this.userForm.company_ids || []).map(Number);
    payload.default_company_id = this.userForm.default_company_id ? Number(this.userForm.default_company_id) : null;
    payload.assigned_warehouses = (this.userForm.assigned_warehouses || []).map(Number);
    if (!this.editingUser) {
      delete payload.id;
    }

    this.isSavingUser = true;
    if (this.editingUser) {
      this.accountsService.updateUser(this.editingUser.id, payload).pipe(
        finalize(() => {
          this.isSavingUser = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: (res) => {
          Object.assign(this.editingUser, res);
          if (pendingBlob) {
            this.accountsService.updateUserAvatar(this.editingUser.id, pendingBlob).subscribe({
              next: (avatarRes) => {
                this.editingUser.avatar = avatarRes.avatar;
                if (this.auth.user()?.id === this.editingUser.id) {
                  this.auth.updateUserAvatar(avatarRes.avatar);
                }
                this.cdr.detectChanges();
              }
            });
          } else if (pendingDelete) {
            this.accountsService.deleteUserAvatar(this.editingUser.id).subscribe({
              next: () => {
                this.editingUser.avatar = null;
                if (this.auth.user()?.id === this.editingUser.id) {
                  this.auth.updateUserAvatar(null);
                }
                this.cdr.detectChanges();
              }
            });
          }
          this.rebuildMemoizedData();
          this.toast.show('success', 'اطلاعات کاربر با موفقیت بروزرسانی شد.');
          this.isUserModalOpen = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.applyServerFieldErrors(err);
          this.toast.show('error', extractApiError(err, 'خطا در بروزرسانی اطلاعات کاربر'));
        }
      });
    } else {
      this.accountsService.createUser(payload).pipe(
        finalize(() => {
          this.isSavingUser = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: (res) => {
          this.state.appState.users.unshift(res);
          if (pendingBlob) {
            this.accountsService.updateUserAvatar(res.id, pendingBlob).subscribe({
              next: (avatarRes) => {
                res.avatar = avatarRes.avatar;
                this.cdr.detectChanges();
              }
            });
          }
          this.rebuildMemoizedData();
          this.toast.show('success', 'کاربر جدید ایجاد شد؛ اکنون مجوزها و انتساب‌هایش را تنظیم کنید.');
          // پنجره باز می‌ماند و برای کاربر تازه به حالت ویرایش و تب «مجوزها» می‌رود (۲.۹ #1)
          const oneTime = (res as any)?.one_time_password;
          this.editingUser = res;
          this.applyUserToForm(res);
          this.editingUserChanged = false;
          this.userModalInnerTab = 'permissions';
          this.cdr.detectChanges();
          if (oneTime) this.showOneTimePasswords([{ username: res.username, password: oneTime }]);
        },
        error: (err) => {
          this.applyServerFieldErrors(err);
          this.toast.show('error', extractApiError(err, 'خطا در ایجاد کاربر'));
        }
      });
    }
  }

  openRoleModal(id: number | null = null) {
    this.closeMenus();
    if (this.denyRoleWrite()) return;
    this.permSearchQuery = '';
    this.activeRolePresetId = null;
    this.roleMemberSearchQuery = '';
    this.isRoleMembersExpanded = false;
    if (id) {
      const r = this.state.appState.roles.find((x: any) => x.id === id);
      this.editingRole = r;
      const assignedUserIds = (r.user_ids && Array.isArray(r.user_ids))
        ? [...r.user_ids]
        : (this.state.appState.users || [])
            .filter((u: any) => u.groups && u.groups.includes(r.id))
            .map((u: any) => u.id);

      this.roleForm = { 
        id: r.id, 
        name: r.name, 
        title: r.title || r.name, 
        color: r.color || '#94a3b8', 
        permissions: r.permissions ? [...r.permissions] : [],
        user_ids: assignedUserIds
      };
    } else {
      this.editingRole = null;
      this.roleForm = { id: null, name: '', title: '', color: '#94a3b8', permissions: [], user_ids: [] };
    }
    this.activePermTab = this.visiblePermissionGroups[0]?.key || 'MAIN_MENU';
    this.isPresetsExpanded = false;
    this.roleFormBaseline = JSON.stringify(this.roleForm);
    this.isRoleModalOpen = true;
    this.cdr.detectChanges();
  }

  cloneRole(role: any) {
    this.closeMenus();
    if (this.denyRoleWrite()) return;
    this.editingRole = null;
    this.activeRolePresetId = null;
    this.permSearchQuery = '';
    this.roleMemberSearchQuery = '';
    this.isRoleMembersExpanded = false;
    this.roleForm = {
      id: null,
      name: `${role.name}_copy`,
      title: `${role.title || role.name} (کپی)`,
      color: role.color || '#94a3b8',
      permissions: role.permissions ? [...role.permissions] : [],
      user_ids: []
    };
    this.activePermTab = this.visiblePermissionGroups[0]?.key || 'MAIN_MENU';
    this.roleFormBaseline = JSON.stringify(this.roleForm);
    this.isRoleModalOpen = true;
    this.toast.show('info', `نقش «${role.title || role.name}» با دسترسی‌های مرتبط آماده تکثیر است.`);
    this.cdr.detectChanges();
  }

  getFilteredPersonnelForRole(): any[] {
    const q = (this.roleMemberSearchQuery || '').trim().toLowerCase();
    const users = this.state.appState.users || [];
    if (!q) return users;
    return users.filter((u: any) => {
      const fn = (u.first_name || '').toLowerCase();
      const ln = (u.last_name || '').toLowerCase();
      const un = (u.username || '').toLowerCase();
      const nc = (u.national_code || '').toLowerCase();
      const phone = (u.phone_number || '').toLowerCase();
      return fn.includes(q) || ln.includes(q) || un.includes(q) || nc.includes(q) || phone.includes(q);
    });
  }

  toggleRoleMember(userId: number): void {
    if (!this.roleForm.user_ids) this.roleForm.user_ids = [];
    const idx = this.roleForm.user_ids.indexOf(userId);
    if (idx > -1) {
      this.roleForm.user_ids.splice(idx, 1);
    } else {
      this.roleForm.user_ids.push(userId);
    }
  }

  selectAllFilteredRoleMembers(): void {
    if (!this.roleForm.user_ids) this.roleForm.user_ids = [];
    const filtered = this.getFilteredPersonnelForRole();
    const currentSet = new Set(this.roleForm.user_ids);
    filtered.forEach((u: any) => currentSet.add(u.id));
    this.roleForm.user_ids = Array.from(currentSet);
  }

  deselectAllRoleMembers(): void {
    if (!this.roleMemberSearchQuery.trim()) {
      this.roleForm.user_ids = [];
      return;
    }
    const filtered = this.getFilteredPersonnelForRole();
    const filteredIds = new Set(filtered.map((u: any) => u.id));
    this.roleForm.user_ids = (this.roleForm.user_ids || []).filter((id: number) => !filteredIds.has(id));
  }

  isRoleMemberSelected(userId: number): boolean {
    return this.roleForm.user_ids?.includes(userId) ?? false;
  }

  getSelectedRoleMembers(): any[] {
    const ids = new Set(this.roleForm.user_ids || []);
    return (this.state.appState.users || []).filter((u: any) => ids.has(u.id));
  }

  applyRolePreset(preset: any) {
    this.activeRolePresetId = preset.id;
    if (preset.permissionCodenames === 'ALL') {
      this.roleForm.permissions = this.selectableRolePermissionIds();
    } else {
      const targetCodenames = new Set(preset.permissionCodenames);
      const allowed = new Set(this.selectableRolePermissionIds());
      const matchedIds = this.systemPermissions
        .filter(p => targetCodenames.has(p.codename) && allowed.has(p.id))
        .map(p => p.id);
      this.roleForm.permissions = Array.from(new Set([...matchedIds]));
    }

    // اگر در حال ایجاد نقش جدید هستیم و فیلدها خالی هستند، مشخصات قالب را پر کند
    if (!this.editingRole && (!this.roleForm.title || !this.roleForm.name)) {
      this.roleForm.title = preset.title.split('/')[0].trim();
      let baseName = preset.id;
      let candidate = baseName;
      let counter = 1;
      const existingNames = new Set((this.state.appState.roles || []).map((r: any) => (r.name || '').toLowerCase()));
      while (existingNames.has(candidate.toLowerCase())) {
        candidate = `${baseName}_${counter++}`;
      }
      this.roleForm.name = candidate;
      this.roleForm.color = preset.color;
    }

    this.isPresetsExpanded = false;
    this.toast.show(
      'success',
      `قالب «${preset.title}» اعمال شد (${this.roleForm.permissions.length} مجوز انتخاب گردید).`
    );
    this.cdr.detectChanges();
  }

  getGroupPermissionCount(groupKey: string): { selected: number, total: number } {
    const group = this.systemPermissionGroups.find(g => g.key === groupKey);
    if (!group || !group.items) return { selected: 0, total: 0 };
    const selectedIds = new Set(this.roleForm.permissions || []);
    const selectedCount = group.items.filter(p => selectedIds.has(p.id)).length;
    return { selected: selectedCount, total: group.items.length };
  }

  onPermSearchChange(query: string): void {
    this.permSearchQuery = query || '';
    if (query && query.trim()) {
      const activeGroup = this.filteredPermissionGroups.find(g => g.key === this.activePermTab);
      if (!activeGroup || activeGroup.items.length === 0) {
        const firstWithMatches = this.filteredPermissionGroups.find(g => g.items.length > 0);
        if (firstWithMatches) {
          this.activePermTab = firstWithMatches.key;
        }
      }
    }
    this.cdr.detectChanges();
  }

  get filteredPermissionGroups() {
    const sourceGroups = this.visiblePermissionGroups;
    if (!this.permSearchQuery.trim()) {
      return sourceGroups;
    }
    const q = this.permSearchQuery.trim().toLowerCase();
    return sourceGroups.map(group => ({
      ...group,
      items: group.items.filter((p: any) => 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (this.getShortPermissionName(p) && this.getShortPermissionName(p).toLowerCase().includes(q)) ||
        (p.codename && p.codename.toLowerCase().includes(q))
      )
    })).filter(group => group.items.length > 0);
  }

  toggleRolePermission(perm: Permission, event: Event) {
    const target = event.target as HTMLInputElement;
    const isCurrentlyChecked = this.roleForm.permissions.includes(perm.id);

    if (perm.is_sensitive) {
      if (!this.isSuperuser()) {
        event.preventDefault();
        target.checked = isCurrentlyChecked;
        this.toast.show('error', 'تخصیص یا تغییر دسترسی‌های حساس و بحرانی صرفاً در انحصار مدیر ارشد سامانه (Superuser) می‌باشد.');
        return;
      }

      if (!isCurrentlyChecked) {
        // User clicked to check a sensitive permission -> prevent instant check & open warning modal
        event.preventDefault();
        target.checked = false;
        this.pendingSensitivePerm = perm;
        this.isSensitiveWarningModalOpen = true;
      } else {
        // Uncheck directly
        this.roleForm.permissions = this.roleForm.permissions.filter((id: number) => id !== perm.id);
      }
    } else {
      if (target.checked) {
        if (!this.roleForm.permissions.includes(perm.id)) this.roleForm.permissions.push(perm.id);
      } else {
        this.roleForm.permissions = this.roleForm.permissions.filter((id: number) => id !== perm.id);
      }
    }
  }

  confirmSensitivePermission() {
    if (this.pendingSensitivePerm) {
      if (!this.roleForm.permissions.includes(this.pendingSensitivePerm.id)) {
        this.roleForm.permissions.push(this.pendingSensitivePerm.id);
      }
      this.toast.show('warning', `دسترسی حساس «${this.pendingSensitivePerm.name}» به این نقش اضافه شد.`);
    }
    this.isSensitiveWarningModalOpen = false;
    this.pendingSensitivePerm = null;
    this.cdr.detectChanges();
  }

  cancelSensitivePermission() {
    this.isSensitiveWarningModalOpen = false;
    this.pendingSensitivePerm = null;
    this.cdr.detectChanges();
  }

  /** مجوزهای قابل انتخاب گروهی نقش سامانه‌ای: غیرحساس و سامانه‌ای (فقط گروه‌های ساخته‌شده؛ مجوز بخشی هرگز) */
  selectableRolePermissionIds(): number[] {
    return this.systemPermissionGroups
      .filter(g => !g.is_sensitive_group)
      .flatMap(g => g.items)
      .filter(p => !p.is_sensitive)
      .map(p => p.id);
  }

  toggleAllPermissions() {
    // Only toggle normal/non-sensitive permissions. Sensitive permissions are NEVER selected by toggleAll.
    const normalPermIds = this.selectableRolePermissionIds();
    const hasAllNormal = normalPermIds.every(id => this.roleForm.permissions.includes(id));
    
    if (hasAllNormal) {
      this.roleForm.permissions = this.roleForm.permissions.filter(id => !normalPermIds.includes(id));
      this.toast.show('info', 'کلیه دسترسی‌های عمومی لغو شدند.');
    } else {
      const newPerms = new Set([...this.roleForm.permissions, ...normalPermIds]);
      this.roleForm.permissions = Array.from(newPerms);
      this.toast.show('info', 'کلیه دسترسی‌های عمومی انتخاب شدند (دسترسی‌های حساس مستثنی هستند).');
    }
  }

  toggleGroupPermissions(groupKey: string) {
    if (groupKey === 'SENSITIVE') {
      this.toast.show('warning', 'دسترسی‌های حساس و بحرانی قابلیت انتخاب گروهی ندارند و صرفاً باید به صورت دستی و تک‌به‌تک اعطا شوند.');
      return;
    }
    const group = this.systemPermissionGroups.find(g => g.key === groupKey);
    if (!group) return;
    
    const groupPermIds = group.items.map((p: any) => p.id);
    const hasAll = groupPermIds.every((id: number) => this.roleForm.permissions.includes(id));
    
    if (hasAll) {
      this.roleForm.permissions = this.roleForm.permissions.filter((id: number) => !groupPermIds.includes(id));
    } else {
      const newPerms = new Set([...this.roleForm.permissions, ...groupPermIds]);
      this.roleForm.permissions = Array.from(newPerms);
    }
  }

  saveRole() {
    if (this.denyRoleWrite()) return;
    const payload = {
        name: this.roleForm.name.trim(),
        title: this.roleForm.title.trim(),
        color: this.roleForm.color,
        permissions: this.roleForm.permissions,
        user_ids: this.roleForm.user_ids || []
    };

    if (!payload.name || !payload.title) return this.toast.show('error', 'عنوان و کد سیستمی نقش الزامی است.');

    const syncUsersLocalRoles = (roleId: number, targetUserIds: number[]) => {
      const targetSet = new Set(targetUserIds);
      (this.state.appState.users || []).forEach((u: any) => {
        if (!u.groups) u.groups = [];
        const hasRole = u.groups.includes(roleId);
        const shouldHave = targetSet.has(u.id);
        if (shouldHave && !hasRole) {
          u.groups.push(roleId);
        } else if (!shouldHave && hasRole) {
          u.groups = u.groups.filter((gid: number) => gid !== roleId);
        }
      });
    };

    if (this.editingRole) {
      this.accountsService.updateRole(this.editingRole.id, payload).subscribe({
        next: (res) => {
          Object.assign(this.editingRole, res);
          this.editingRole.user_ids = [...(payload.user_ids || [])];
          syncUsersLocalRoles(this.editingRole.id, payload.user_ids || []);
          this.rebuildMemoizedData();
          this.toast.show('success', 'نقش، دسترسی‌ها و اعضای منتسب با موفقیت بروزرسانی شد.');
          this.isRoleModalOpen = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', extractApiError(err, 'خطا در ویرایش نقش'));
        }
      });
    } else {
      this.accountsService.createRole(payload).subscribe({
        next: (res) => {
          res.user_ids = [...(payload.user_ids || [])];
          this.state.appState.roles.push(res);
          syncUsersLocalRoles(res.id, payload.user_ids || []);
          this.rebuildMemoizedData();
          this.toast.show('success', 'نقش جدید به همراه اعضای منتسب ایجاد شد.');
          this.isRoleModalOpen = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', extractApiError(err, 'خطا در ایجاد نقش'));
        }
      });
    }
  }

  deleteRole(id: number) {
    if (this.denyRoleWrite()) return;
    const role = this.state.appState.roles.find((r: any) => r.id === id);
    if (!role) return;

    this.entityToDelete = role;
    this.deleteType = 'role';
    this.deleteImpactUrl = `${environment.apiUrl}/auth/roles/${id}/delete_impact/`;
    this.isDeleteModalOpen = true;
    this.isDeleting = false;
    this.deleteErrorMessage = '';
    this.cdr.detectChanges();
  }

  deleteUser(id: number) {
    if (this.denyUserWrite('edit')) return;
    const user = this.state.appState.users.find((u: any) => u.id === id);
    if (!user) return;

    this.entityToDelete = user;
    this.deleteType = 'user';
    this.deleteImpactUrl = `${environment.apiUrl}/auth/users/${id}/delete_impact/`;
    this.isDeleteModalOpen = true;
    this.isDeleting = false;
    this.deleteErrorMessage = '';
    this.cdr.detectChanges();
  }

  handleHardDelete() {
    if (!this.entityToDelete) return;
    const id = this.entityToDelete.id;
    this.isDeleting = true;
    this.deleteErrorMessage = '';
    
    if (this.deleteType === 'role') {
        this.facade.deleteRole(id).subscribe({
            next: () => {
                this.state.appState.roles = this.state.appState.roles.filter((r: any) => r.id !== id);
                this.state.appState.users.forEach((u: any) => {
                    if (u.groups && u.groups.includes(id)) {
                        u.groups = u.groups.filter((gId: number) => gId !== id);
                    }
                });
                this.rebuildMemoizedData();
                this.toast.show('success', 'نقش مورد نظر حذف و دسترسی کاربران مرتبط بروزرسانی شد.');
                this.isDeleteModalOpen = false;
                this.entityToDelete = null;
                this.isDeleting = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.deleteErrorMessage = extractApiError(err, 'خطا در حذف نقش');
                this.isDeleting = false;
            }
        });
    } else {
        this.accountsService.deleteUser(id).subscribe({
            next: () => {
                this.selectedUserIds.delete(id);
                this.state.appState.users = this.state.appState.users.filter((u: any) => u.id !== id);
                this.rebuildMemoizedData();
                this.toast.show('success', 'حساب کاربری برای همیشه حذف شد.');
                this.isDeleteModalOpen = false;
                this.entityToDelete = null;
                this.isDeleting = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.deleteErrorMessage = extractApiError(err, 'این کاربر به دلیل داشتن تراکنش یا تاریخچه سیستم قابل حذف فیزیکی نیست. می‌توانید آن را تعلیق کنید.');
                this.isDeleting = false;
            }
        });
    }
  }

  formatDate(dStr: string) {
    if (!dStr) return '';
    try {
      return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dStr));
    } catch {
      return dStr;
    }
  }

  getRoleTitleForForm(r: any) {
    return r.title || r.name;
  }

  /** کلید قلمرو نقش: کلید roleScope تنها ماژولی که مجوزهایش را دارد، یا 'global' */
  getRoleAppScope(r: any): string {
    const permIds: number[] = Array.isArray(r.permissions) ? r.permissions : [];
    const permCodenames: string[] = permIds
      .map(id => this.permIdToCodenameMap.get(id))
      .filter((c): c is string => typeof c === 'string');

    const scopes = this.knownRoleScopes;
    const matched = scopes.filter(s => {
      const markers = this.registry.permissionMarkers(s.code);
      return permCodenames.some(p => markers.includes(p));
    });
    if (matched.length > 1) return 'global';
    if (matched.length === 1) return matched[0].scope.key;

    // fallback به عناوین قدیمی برای نقش‌های بدون پرمیشن ست‌شده
    const name = (r.name || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    if (name === 'admin' || name === 'superuser' || title.includes('مدیر کل') || title.includes('مدیر ارشد') || title.includes('ادمین')) {
      return 'global';
    }
    for (const s of scopes) {
      if (s.scope.nameHints.some(h => name.includes(h)) || s.scope.titleHints.some(h => title.includes(h))) {
        return s.scope.key;
      }
    }
    return 'global';
  }

  /** نقش در زبانهٔ این قلمرو می‌آید: قلمرو خودش یا نقش‌های اضافهٔ اعلام‌شده */
  private roleInScopeTab(r: any, key: string): boolean {
    if (this.getRoleAppScope(r) === key) return true;
    const scope = this.roleScopeFor(key);
    if (!scope?.extraRoleNames && !scope?.extraTitleHints) return false;
    const name = (r.name || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    return (scope.extraRoleNames || []).includes(name) || (scope.extraTitleHints || []).some(h => title.includes(h));
  }

  getFilteredRolesForModal(tab: string): any[] {
    const roles = this.state.appState.roles || [];
    if (tab === 'all') return roles;
    return roles.filter((r: any) => this.roleInScopeTab(r, tab));
  }

  getSelectedRolesCountForScope(scope: string): number {
    const selectedIds = this.userForm.groups || [];
    const roles = this.state.appState.roles || [];
    return roles.filter((r: any) => selectedIds.includes(r.id) && this.roleInScopeTab(r, scope)).length;
  }

  /**
   * محاسبه خودکار و هوشمند سامانه‌های مجاز کاربر بر اساس سطح دسترسی و نقش‌های انتخابی (Computed Scope Badge)
   */
  getUserAuthorizedSystems(u: any): AuthorizedSystems {
    if (!u) return this.computeAuthorizedSystems(u);
    // نتیجه تا وقتی ورودی (و نقش‌ها) عوض نشده همان شیء است تا قالب هر چرخه آرایهٔ نو نبیند (NG0103)
    const sig = `${this.authorizedSystemsEpoch}|${u.is_superuser ? 1 : 0}|${Array.isArray(u.assigned_warehouses) ? u.assigned_warehouses.length : 0}|${Array.isArray(u.groups) ? u.groups.join(',') : ''}`;
    const hit = this.authorizedSystemsCache.get(u);
    if (hit && hit.sig === sig) return hit.value;
    const value = this.computeAuthorizedSystems(u);
    this.authorizedSystemsCache.set(u, { sig, value });
    return value;
  }

  private authorizedSystemsEpoch = 0;
  private authorizedSystemsCache = new WeakMap<object, { sig: string; value: AuthorizedSystems }>();

  private computeAuthorizedSystems(u: any): AuthorizedSystems {
    if (!u) {
      return {
        isSuperuser: false,
        hasWarehouse: false,
        hasFinance: false,
        hasGlobal: false,
        warehouseCount: 0,
        badges: [],
        isEmpty: true
      };
    }

    const isSuperuser = Boolean(u.is_superuser);
    const assignedWhs = Array.isArray(u.assigned_warehouses) ? u.assigned_warehouses : [];
    const warehouseCount = assignedWhs.length;

    if (isSuperuser) {
      return {
        isSuperuser: true,
        hasWarehouse: true,
        hasFinance: true,
        hasGlobal: true,
        warehouseCount,
        badges: [
          {
            key: 'superuser',
            label: 'تمام سامانه‌ها (مدیر ارشد)',
            icon: '🌐',
            bgClass: 'bg-purple-100',
            textClass: 'text-purple-900',
            borderClass: 'border-purple-300'
          }
        ],
        isEmpty: false
      };
    }

    const groupIds: number[] = Array.isArray(u.groups) ? u.groups.map(Number) : [];
    const allRoles: any[] = Array.isArray(this.state.appState.roles) ? this.state.appState.roles : [];
    const userRoles = allRoles.filter((r: any) => groupIds.includes(Number(r.id)));

    const scopeKeys = new Set<string>();
    let hasGlobal = false;

    for (const r of userRoles) {
      const scope = this.getRoleAppScope(r);
      if (scope === 'global') {
        hasGlobal = true;
      } else {
        scopeKeys.add(scope);
      }
    }

    const badges: { key: string; label: string; icon: string; bgClass: string; textClass: string; borderClass: string }[] = [];
    const toneClasses: Record<string, { bgClass: string; textClass: string; borderClass: string }> = {
      sky: { bgClass: 'bg-sky-50', textClass: 'text-sky-800', borderClass: 'border-sky-300' },
      emerald: { bgClass: 'bg-emerald-50', textClass: 'text-emerald-800', borderClass: 'border-emerald-300' },
    };
    for (const { scope } of this.knownRoleScopes) {
      if (!scopeKeys.has(scope.key)) continue;
      const label = scope.countsWarehouses
        ? (warehouseCount > 0 ? `${scope.badgeLabelFa} (${warehouseCount} انبار)` : `${scope.badgeLabelFa} (فاقد انبار)`)
        : scope.badgeLabelFa;
      badges.push({ key: scope.key, label, icon: scope.icon, ...toneClasses[scope.tone] });
    }
    const hasWarehouse = this.knownRoleScopes.some(s => s.scope.countsWarehouses && scopeKeys.has(s.scope.key));
    const hasFinance = this.knownRoleScopes.some(s => !s.scope.countsWarehouses && scopeKeys.has(s.scope.key));

    if (hasGlobal) {
      badges.push({
        key: 'global',
        label: 'مدیریت و مانیتورینگ کلان',
        icon: '⚡',
        bgClass: 'bg-indigo-50',
        textClass: 'text-indigo-800',
        borderClass: 'border-indigo-300'
      });
    }

    const isEmpty = badges.length === 0;

    return {
      isSuperuser: false,
      hasWarehouse,
      hasFinance,
      hasGlobal,
      warehouseCount,
      badges,
      isEmpty
    };
  }

  get currentFormAuthorizedSystems() {
    return this.getUserAuthorizedSystems(this.userForm);
  }

  // ── Excel Import/Export ──────────────────────────────────────────
  private triggerDownload(blob: Blob, filename: string) {
    void saveBlob(blob, filename);
  }

  /** با جستجو یا فیلتر فعال فقط کاربران فیلترشده صادر می‌شوند؛ وگرنه همه (۲.۹-ب) */
  private get hasActiveUserFilter(): boolean {
    return !!this.searchQuery.trim() || this.userStatusFilter !== 'all'
      || this.userRoleFilter !== 'ALL' || this.userWarehouseFilter !== 'ALL';
  }

  exportUsersExcel(ids?: number[]) {
    if (!ids && this.hasActiveUserFilter) {
      ids = this.filteredUsers.map((u: any) => u.id);
      if (ids.length === 0) {
        this.toast.show('info', 'کاربری برای خروجی اکسل با این فیلتر نیست.');
        return;
      }
    }
    this.facade.exportUsersExcel(ids).subscribe({
      next: (blob) => {
        const filename = ids && ids.length > 0 ? `users_export_${ids.length}_selected.xlsx` : 'users_export.xlsx';
        this.triggerDownload(blob, filename);
        this.toast.show('success', 'فایل اکسل کاربران با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.show('error', 'خطا در دانلود فایل اکسل کاربران.');
      }
    });
  }

  openUsersImportModal() {
    if (this.denyUserWrite('add')) return;
    this.excelModalTitle = 'آپلود دسته‌جمعی کاربران';
    // رمزهای یک‌بارمصرف کاربران تازه فقط یک بار برگشت داده می‌شوند (۲.۹)
    this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => this.accountsService.importUsersExcel(file, updateExisting, dryRun || false).pipe(
      tap(res => {
        if (!dryRun && res?.one_time_passwords?.length) {
          this.showOneTimePasswords(res.one_time_passwords.map(r => ({ username: r.username, password: r.one_time_password })));
        }
      })
    );
    this.excelTemplateFn = () => this.downloadUsersTemplate();
    this.isExcelModalOpen = true;
    this.cdr.detectChanges();
  }

  downloadUsersTemplate() {
    this.facade.downloadUsersTemplate().subscribe({
      next: (blob) => {
        this.triggerDownload(blob, 'users_template.xlsx');
      },
      error: () => {
        this.toast.show('error', 'خطا در دانلود قالب اکسل کاربران.');
      }
    });
  }

  exportRolesExcel(ids?: number[]) {
    this.facade.exportRolesExcel(ids).subscribe({
      next: (blob) => {
        const filename = ids && ids.length > 0 ? `roles_export_${ids.length}_selected.xlsx` : 'roles_export.xlsx';
        this.triggerDownload(blob, filename);
        this.toast.show('success', 'فایل اکسل نقش‌ها با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.show('error', 'خطا در دانلود فایل اکسل نقش‌ها.');
      }
    });
  }

  openRolesImportModal() {
    if (this.denyRoleWrite()) return;
    this.excelModalTitle = 'آپلود دسته‌جمعی نقش‌ها';
    this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => this.accountsService.importRolesExcel(file, updateExisting, dryRun || false);
    this.excelTemplateFn = () => this.downloadRolesTemplate();
    this.isExcelModalOpen = true;
    this.cdr.detectChanges();
  }

  downloadRolesTemplate() {
    this.facade.downloadRolesTemplate().subscribe({
      next: (blob) => {
        this.triggerDownload(blob, 'roles_template.xlsx');
      },
      error: () => {
        this.toast.show('error', 'خطا در دانلود قالب اکسل نقش‌ها.');
      }
    });
  }

  onExcelImported(result: ImportResult) {
    if (result.success) {
      const parts = [];
      if (result.summary.created > 0) parts.push(`${result.summary.created} رکورد ایجاد شد`);
      if (result.summary.updated && result.summary.updated > 0) parts.push(`${result.summary.updated} رکورد به‌روزرسانی شد`);
      if (parts.length > 0) {
        this.toast.show('success', parts.join(' و ') + '.');
      }
      this.loadData();
    }
  }

  closeExcelModal() {
    this.isExcelModalOpen = false;
    this.cdr.detectChanges();
  }
}
