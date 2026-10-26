import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { hasStructureWritePermission } from '../../../../../core/auth/auth.guard';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { ExcelImportModal } from '../../../../../shared/components/excel-import-modal/excel-import-modal';
import { Counterparty, CounterpartyKind, PartyBankAccount } from '../../../models/personnel.model';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  extractShebaDigits,
  generateShebaFromAccount,
  validateAccountNumber
} from '../../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';
import { saveBlob } from '../../../../../core/platform/file-output';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';

export interface CounterpartyTypeOption {
  key: 'driver' | 'repair_shop' | 'fuel_station' | 'contractor' | 'other';
  label: string;
  badgeClass: string;
  bgClass: string;
  icon: string;
}

@Component({
  selector: 'app-counterparties',
  standalone: true,
  imports: [CommonModule, FormsModule, ExcelImportModal, SvgIconDirective, TabBarComponent, ActionButtonComponent, CommandCenterComponent, LoadingSkeletonComponent],
  templateUrl: './counterparties.html',
  styleUrl: './counterparties.css'
})
export class CounterpartiesComponent implements OnInit, OnDestroy {
  counterparties: Counterparty[] = [];
  isLoading = false;
  isRefreshing = false;
  loadError = '';
  isOfflineError = false;

  // فیلترها و جستجوی سریع
  searchQuery: string = '';
  typeFilter: string = 'all';
  statusFilter: string = 'all';
  viewMode: 'table' | 'cards' = 'table';

  // سوییچر نمای جدولی و کارتی با دو تب بدون آیکون
  readonly viewModeTabs: TabDef[] = [
    { id: 'table', label: 'جدول', shortLabel: 'جدول' },
    { id: 'cards', label: 'کارت', shortLabel: 'کارت' }
  ];

  // تب‌های نوار دسته‌بندی با الگوی memoized (جلوگیری از خطای NG0100)
  private typeFilterTabsKey = '';
  private typeFilterTabsCache: TabDef[] = [];
  get typeFilterTabs(): TabDef[] {
    const key = `${this.totalCount}:${this.driversCount}:${this.repairShopsCount}:${this.fuelStationsCount}:${this.contractorsCount}:${this.othersCount}`;
    if (key !== this.typeFilterTabsKey) {
      this.typeFilterTabsKey = key;
      this.typeFilterTabsCache = [
        {
          id: 'all',
          label: 'همه',
          shortLabel: 'همه',
          icon: 'status-all',
          count: this.totalCount,
          tone: 'indigo'
        },
        {
          id: 'driver',
          label: 'راننده',
          shortLabel: 'راننده',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: this.driversCount,
          tone: 'indigo'
        },
        {
          id: 'repair_shop',
          label: 'تعمیرگاه',
          shortLabel: 'تعمیرگاه',
          icon: ACCOUNTING_ENTITY_ICONS.repairShop,
          count: this.repairShopsCount,
          tone: 'indigo'
        },
        {
          id: 'fuel_station',
          label: 'جایگاه سوخت',
          shortLabel: 'سوخت',
          icon: ACCOUNTING_ENTITY_ICONS.fuelStation,
          count: this.fuelStationsCount,
          tone: 'indigo'
        },
        {
          id: 'contractor',
          label: 'پیمانکار',
          shortLabel: 'پیمانکار',
          icon: ACCOUNTING_ENTITY_ICONS.contractor,
          count: this.contractorsCount,
          tone: 'indigo'
        },
        {
          id: 'other',
          label: 'سایر',
          shortLabel: 'سایر',
          icon: ACCOUNTING_ENTITY_ICONS.otherCounterparty,
          count: this.othersCount,
          tone: 'indigo'
        }
      ];
    }
    return this.typeFilterTabsCache;
  }

  // تعاریف ۵ گانه انواع طرف‌حساب
  readonly typeOptions: CounterpartyTypeOption[] = [
    { key: 'driver', label: 'راننده / مالک خودرو', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', bgClass: 'bg-blue-50', icon: '🚚' },
    { key: 'repair_shop', label: 'تعمیرگاه و قطعات', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', bgClass: 'bg-amber-50', icon: '🔧' },
    { key: 'fuel_station', label: 'جایگاه سوخت', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', bgClass: 'bg-rose-50', icon: '⛽' },
    { key: 'contractor', label: 'پیمانکار خدماتی', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200', bgClass: 'bg-purple-50', icon: '🏗️' },
    { key: 'other', label: 'سایر اشخاص حقیقی/حقوقی', badgeClass: 'bg-slate-100 text-slate-800 border-slate-200', bgClass: 'bg-slate-50', icon: '🏢' },
  ];

  readonly kindOptions: { key: CounterpartyKind; label: string }[] = [
    { key: 'person', label: 'حقیقی' },
    { key: 'legal', label: 'حقوقی' },
  ];

  // مدل فرم ایجاد و ویرایش
  newCounterparty: Partial<Counterparty> = this.emptyForm();
  editingCounterparty: Counterparty | null = null;

  // حساب‌های بانکی طرف حساب در حال ویرایش (ص۹ طرح ۳.۱)؛ فیلدهای بانکی فرم در ویرایش «حساب تازه» هستند
  bankAccounts: PartyBankAccount[] = [];
  isBankAccountsLoading = false;
  bankAccountsError = '';
  isBankSaving = false;
  bankCardNumber = '';
  bankOwnerName = '';
  copiedBankKey = '';

  // مدیریت بانک عامل و شماره شبا
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay: string = '';
  isBankDropdownOpen: boolean = false;
  bankSearchQuery: string = '';
  isShebaCopied: boolean = false;
  isAccountCopied: boolean = false;
  private _isSyncingBank = false;

  // مودال اکسل
  isExcelModalOpen = false;
  excelModalTitle = 'آپلود و ثبت دسته‌جمعی طرف‌حساب‌های مالی از اکسل';

  // مودال تایید اختصاصی
  confirmModal = {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'تایید و حذف',
    cancelText: 'انصراف',
    isDanger: true,
    onConfirm: () => {}
  };

  private subs: Subscription[] = [];
  private offlineSync = OfflineSyncService.getInstance();

  constructor(
    public auth: AuthService,
    public state: StateService,
    private api: PersonnelApiService,
    private ws: WebSocketService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() private activeCompanyService?: ActiveCompanyService
  ) {}

  ngOnInit(): void {
    this.ws.connect();
    this.setupRealtimeListeners();
    this.setupRouteQuerySync();
    this.loadCounterparties();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private setupRouteQuerySync(): void {
    this.subs.push(
      this.route.queryParams.subscribe(params => {
        if (params['q'] !== undefined) this.searchQuery = params['q'] || '';
        if (params['type'] !== undefined) this.typeFilter = params['type'] || 'all';
        if (params['status'] !== undefined) this.statusFilter = params['status'] || 'all';
        if (params['view'] !== undefined) this.viewMode = params['view'] === 'cards' ? 'cards' : 'table';
        this.cdr.detectChanges();
      })
    );
  }

  private updateQueryParams(params: Record<string, any>): void {
    this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onSearchChange(val: string): void {
    this.searchQuery = val;
    this.updateQueryParams({ q: val?.trim() || null });
  }

  onTypeFilterChange(val: string): void {
    this.typeFilter = val || 'all';
    this.updateQueryParams({ type: val !== 'all' ? val : null });
  }

  onStatusFilterChange(val: string): void {
    this.statusFilter = val || 'all';
    this.updateQueryParams({ status: val !== 'all' ? val : null });
  }

  onViewModeChange(mode: string): void {
    const cleanMode: 'table' | 'cards' = mode === 'cards' ? 'cards' : 'table';
    this.viewMode = cleanMode;
    this.updateQueryParams({ view: cleanMode !== 'table' ? cleanMode : null });
  }

  private setupRealtimeListeners(): void {
    this.subs.push(
      this.ws.notifications$.subscribe(msg => {
        if (msg?.type_str === 'org_structure_updated' && msg.entity_type === 'counterparty') {
          if (msg.client_tab_id && msg.client_tab_id === this.ws.tabId) {
            return;
          }
          this.loadCounterparties();
        }
      })
    );

    this.subs.push(
      this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
        if (url && url.includes('/counterparties/') && Array.isArray(data)) {
          this.counterparties = data;
          this.cdr.detectChanges();
        }
      })
    );
  }

  loadCounterparties(): void {
    this.refreshCounterparties(false);
  }

  refreshCounterparties(isManual = true): void {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.isLoading = true;
    const startTime = Date.now();

    this.api.getCounterparties().subscribe({
      next: (cp) => {
        this.counterparties = cp;
        this.loadError = '';
        this.isOfflineError = false;
        const elapsed = Date.now() - startTime;
        const minDuration = isManual ? 650 : 0;
        const remainingTime = Math.max(minDuration - elapsed, 0);

        setTimeout(() => {
          this.isLoading = false;
          this.isRefreshing = false;
          if (isManual) {
            this.toast.show('success', `اطلاعات و فهرست ${this.counterparties.length} طرف‌حساب مالی بروزرسانی شد.`);
          }
          this.cdr.detectChanges();
        }, remainingTime);
      },
      error: (err) => {
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(500 - elapsed, 0);
        setTimeout(() => {
          this.isLoading = false;
          this.isRefreshing = false;
          this.isOfflineError = isServerUnreachable(err?.status ?? 0);
          this.loadError = this.isOfflineError
            ? 'سرور در دسترس نیست؛ آخرین فهرست ذخیره‌شده نمایش داده می‌شود.'
            : this.extractApiErrorMessage(err, 'خطا در بروزرسانی اطلاعات طرف‌حساب‌ها');
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در بروزرسانی اطلاعات طرف‌حساب‌ها'));
          this.cdr.detectChanges();
        }, remainingTime);
      }
    });
  }

  // محاسبات آماری (KPIs)
  get totalCount(): number {
    return this.counterparties.length;
  }

  get activeCount(): number {
    return this.counterparties.filter(c => c.is_active !== false).length;
  }

  get driversCount(): number {
    return this.counterparties.filter(c => c.counterparty_type === 'driver').length;
  }

  get repairShopsCount(): number {
    return this.counterparties.filter(c => c.counterparty_type === 'repair_shop').length;
  }

  get fuelStationsCount(): number {
    return this.counterparties.filter(c => c.counterparty_type === 'fuel_station').length;
  }

  get contractorsCount(): number {
    return this.counterparties.filter(c => c.counterparty_type === 'contractor').length;
  }

  get othersCount(): number {
    return this.counterparties.filter(c => c.counterparty_type === 'other').length;
  }

  // فیلترگذاری درجا در حافظه
  get filteredCounterparties(): Counterparty[] {
    let list = this.counterparties;

    if (this.typeFilter && this.typeFilter !== 'all') {
      list = list.filter(c => c.counterparty_type === this.typeFilter);
    }

    if (this.statusFilter === 'active') {
      list = list.filter(c => c.is_active !== false);
    } else if (this.statusFilter === 'inactive') {
      list = list.filter(c => c.is_active === false);
    }

    if (this.searchQuery?.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.mobile && c.mobile.includes(q)) ||
        (c.economic_code && c.economic_code.includes(q)) ||
        (c.national_id && c.national_id.includes(q)) ||
        (c.account_number && c.account_number.includes(q)) ||
        (c.sheba_number && c.sheba_number.includes(q)) ||
        (c.account_code && c.account_code.includes(q)) ||
        (c.bank_name && c.bank_name.toLowerCase().includes(q))
      );
    }

    return list;
  }

  getTypeOption(key: string): CounterpartyTypeOption {
    return this.typeOptions.find(o => o.key === key) || this.typeOptions[4];
  }

  // عملیات فرم ایجاد و ویرایش
  saveCounterparty(): void {
    const name = this.newCounterparty.name?.trim() || '';
    if (!name) {
      this.toast.show('warning', 'لطفاً نام طرف‌حساب را وارد نمایید.');
      return;
    }

    const identity = this.buildIdentityPayload(name);

    if (this.editingCounterparty?.id) {
      const editId = this.editingCounterparty.id;
      // ویرایش: بانک فقط از زیرفهرست حساب‌ها؛ شرکت عوض نمی‌شود؛ مقدار پوشیده فرستاده نمی‌شود
      const pendingBank = this.hasPendingBankAccount() ? this.buildBankAccountPayload() : null;
      this.api.updateCounterparty(editId, identity).subscribe({
        next: (updated) => {
          this.toast.show('success', `طرف‌حساب «${updated.name}» با موفقیت ویرایش شد.`);
          if (pendingBank && updated.party) {
            this.api.createPartyBankAccount({ ...pendingBank, party: updated.party }).subscribe({
              next: () => this.offlineSync.invalidateCache('counterparties'),
              error: (err) => this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ثبت حساب بانکی'))
            });
          }
          this.resetForm();
          this.counterparties = this.counterparties.map(c => c.id === editId ? updated : c);
          this.offlineSync.invalidateCache('counterparties');
          this.loadCounterparties();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ویرایش طرف‌حساب'));
          this.cdr.detectChanges();
        }
      });
    } else {
      // ساخت: حساب اولیه (اصلی) تو در تو در همان درخواست، تا صف آفلاین یک رکورد داشته باشد
      const createPayload: Partial<Counterparty> = { ...identity };
      if (this.hasPendingBankAccount()) {
        createPayload.bank_accounts = [{ ...this.buildBankAccountPayload(), is_primary: true }];
      }
      // شرکت فعال در بدنه می‌ماند تا بازپخش صف آفلاین (که هدر شرکت ندارد) در شرکت درست ساخته شود
      const companyId = this.activeCompanyService?.activeCompanyId;
      if (companyId) createPayload.company = companyId;
      this.api.createCounterparty(createPayload).subscribe({
        next: (created) => {
          if (created.existing) {
            this.toast.show('info', `طرف‌حساب «${created.name}» از قبل ثبت شده بود (تکراری)؛ همان نمایش داده شد.`);
          } else {
            this.toast.show('success', `طرف‌حساب «${created.name}» با موفقیت ایجاد شد.`);
          }
          this.resetForm();
          this.counterparties = [created, ...this.counterparties.filter(c => c.id !== created.id)];
          this.offlineSync.invalidateCache('counterparties');
          this.loadCounterparties();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ایجاد طرف‌حساب'));
          this.cdr.detectChanges();
        }
      });
    }
  }

  editCounterparty(cp: Counterparty): void {
    this.resetForm();
    this.editingCounterparty = cp;
    // فیلدهای بانکی فرم در ویرایش خالی می‌مانند و فقط حساب تازه می‌سازند؛ حساب‌های موجود در زیرفهرست‌اند
    this.newCounterparty = {
      ...this.emptyForm(),
      kind: cp.kind || 'person',
      name: cp.name,
      counterparty_type: cp.counterparty_type,
      national_id: cp.national_id || '',
      economic_code: cp.economic_code || '',
      registration_number: cp.registration_number || '',
      phone: cp.phone || '',
      mobile: cp.mobile || '',
      email: cp.email || '',
      address: cp.address || '',
      postal_code: cp.postal_code || '',
      notes: cp.notes || '',
      account_code: cp.account_code || '',
      is_active: cp.is_active !== false
    };
    this.bankAccounts = [...(cp.bank_accounts || [])];
    this.loadBankAccounts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.detectChanges();
  }

  cancelEdit(): void {
    this.resetForm();
    this.cdr.detectChanges();
  }

  resetForm(): void {
    this.editingCounterparty = null;
    this.newCounterparty = this.emptyForm();
    this.bankAccounts = [];
    this.isBankAccountsLoading = false;
    this.bankAccountsError = '';
    this.resetBankForm();
  }

  private emptyForm(): Partial<Counterparty> {
    return {
      kind: undefined,
      name: '',
      counterparty_type: 'driver',
      national_id: '',
      economic_code: '',
      registration_number: '',
      phone: '',
      mobile: '',
      email: '',
      address: '',
      postal_code: '',
      notes: '',
      bank_name: '',
      account_number: '',
      sheba_number: '',
      account_code: '',
      is_active: true
    };
  }

  private resetBankForm(): void {
    this.newCounterparty.bank_name = '';
    this.newCounterparty.account_number = '';
    this.newCounterparty.sheba_number = '';
    this.bankCardNumber = '';
    this.bankOwnerName = '';
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.isAccountCopied = false;
    this.isShebaCopied = false;
  }

  /** مقدار پوشیده (دارای *) از سرور آمده و نباید دوباره فرستاده شود. */
  isMaskedValue(val?: string | null): boolean {
    return !!val && val.includes('*');
  }

  /** طرف حساب در حال ویرایش برای این کاربر پوشیده است (فقط نمایش، بی کپی). */
  get isEditingMasked(): boolean {
    return !!this.editingCounterparty?.bank_masked;
  }

  /** فیلدهای هویتی و مالی بی بانک؛ مقدار پوشیده و `company` (در ویرایش) فرستاده نمی‌شوند. */
  private buildIdentityPayload(name: string): Partial<Counterparty> {
    const f = this.newCounterparty;
    const payload: Partial<Counterparty> = {
      name,
      counterparty_type: f.counterparty_type || 'other',
      economic_code: this.normalizeInput(f.economic_code),
      registration_number: this.normalizeInput(f.registration_number),
      phone: this.normalizeInput(f.phone),
      mobile: this.normalizeInput(f.mobile),
      email: (f.email || '').trim(),
      address: (f.address || '').trim(),
      postal_code: this.normalizeInput(f.postal_code),
      notes: (f.notes || '').trim(),
      account_code: this.normalizeInput(f.account_code),
      is_active: f.is_active !== false
    };
    if (f.kind) payload.kind = f.kind;
    const nationalId = this.normalizeInput(f.national_id);
    if (!this.isMaskedValue(nationalId)) payload.national_id = nationalId;
    return payload;
  }

  /** فرم بانک چیزی برای ثبت دارد (شبا اجباری است). */
  hasPendingBankAccount(): boolean {
    return !!this.newCounterparty.sheba_number && !this.isMaskedValue(this.newCounterparty.sheba_number);
  }

  private buildBankAccountPayload(): PartyBankAccount {
    const digits = extractShebaDigits(this.newCounterparty.sheba_number || '');
    return {
      bank_name: (this.newCounterparty.bank_name || '').trim(),
      account_number: this.normalizeInput(this.newCounterparty.account_number),
      sheba_number: digits ? `IR${digits}` : '',
      card_number: this.normalizeInput(this.bankCardNumber).replace(/\D/g, ''),
      owner_name: this.bankOwnerName.trim()
    };
  }

  // ── زیرفهرست حساب‌های بانکی (`/api/personnel/party-bank-accounts/?party=`) ──
  loadBankAccounts(): void {
    const partyId = this.editingCounterparty?.party;
    if (!partyId) return;
    this.isBankAccountsLoading = true;
    this.bankAccountsError = '';
    this.api.getPartyBankAccounts(partyId).subscribe({
      next: (rows) => {
        if (this.editingCounterparty?.party !== partyId) return;
        this.bankAccounts = rows || [];
        this.isBankAccountsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (this.editingCounterparty?.party !== partyId) return;
        this.isBankAccountsLoading = false;
        this.bankAccountsError = this.extractApiErrorMessage(err, 'خطا در دریافت حساب‌های بانکی');
        this.cdr.detectChanges();
      }
    });
  }

  addBankAccount(): void {
    const partyId = this.editingCounterparty?.party;
    if (!partyId || this.isBankSaving) return;
    if (!this.hasPendingBankAccount()) {
      this.toast.show('warning', 'لطفاً شماره شبا را وارد نمایید.');
      return;
    }
    if (this.shebaValidationResult && !this.shebaValidationResult.isValid) {
      this.toast.show('warning', 'شماره شبا معتبر نیست.');
      return;
    }
    const payload: PartyBankAccount = {
      ...this.buildBankAccountPayload(),
      party: partyId,
      is_primary: this.bankAccounts.length === 0
    };
    this.isBankSaving = true;
    this.api.createPartyBankAccount(payload).subscribe({
      next: () => {
        this.isBankSaving = false;
        this.toast.show('success', 'حساب بانکی ثبت شد.');
        this.resetBankForm();
        this.afterBankChange();
      },
      error: (err) => {
        this.isBankSaving = false;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ثبت حساب بانکی'));
        this.cdr.detectChanges();
      }
    });
  }

  setPrimaryBankAccount(acc: PartyBankAccount): void {
    if (!acc.id || acc.is_primary || this.isBankSaving) return;
    this.isBankSaving = true;
    // فقط پرچم اصلی فرستاده می‌شود، هرگز مقدار پوشیده
    this.api.updatePartyBankAccount(acc.id, { is_primary: true }).subscribe({
      next: () => {
        this.isBankSaving = false;
        this.toast.show('success', 'حساب اصلی تغییر کرد.');
        this.afterBankChange();
      },
      error: (err) => {
        this.isBankSaving = false;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در تغییر حساب اصلی'));
        this.cdr.detectChanges();
      }
    });
  }

  deleteBankAccount(acc: PartyBankAccount): void {
    if (!acc.id) return;
    this.openConfirmDialog({
      title: 'حذف حساب بانکی',
      message: `آیا از حذف حساب بانکی ${acc.bank_name || ''} اطمینان دارید؟`,
      confirmText: 'بله، حذف شود',
      cancelText: 'انصراف',
      isDanger: true,
      onConfirm: () => {
        this.api.deletePartyBankAccount(acc.id!).subscribe({
          next: () => {
            this.toast.show('success', 'حساب بانکی حذف شد.');
            this.afterBankChange();
          },
          error: (err) => this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در حذف حساب بانکی'))
        });
      }
    });
  }

  private afterBankChange(): void {
    this.offlineSync.invalidateCache('counterparties');
    this.loadBankAccounts();
    this.loadCounterparties();
    this.cdr.detectChanges();
  }

  /** کپی یک مقدار حساب (فقط وقتی پوشیده نیست)؛ بازخورد دو ثانیه‌ای با کلید `id:field`. */
  copyBankValue(acc: PartyBankAccount, field: 'sheba_number' | 'account_number' | 'card_number'): void {
    const raw = acc[field] || '';
    if (!raw || this.isMaskedValue(raw)) return;
    const value = field === 'sheba_number' ? raw.toUpperCase().replace(/^IR/, '') : raw;
    const key = `${acc.id}:${field}`;
    navigator.clipboard.writeText(value).then(() => {
      this.copiedBankKey = key;
      this.toast.show('success', 'در کلیپ‌بورد کپی شد.');
      setTimeout(() => {
        if (this.copiedBankKey === key) this.copiedBankKey = '';
        this.cdr.detectChanges();
      }, 2000);
      this.cdr.detectChanges();
    });
  }

  toggleCounterpartyStatus(cp: Counterparty, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (!cp.id) return;
    const newStatus = !cp.is_active;
    this.api.updateCounterparty(cp.id, { is_active: newStatus }).subscribe({
      next: (updated) => {
        cp.is_active = updated.is_active;
        this.toast.show('success', `وضعیت طرف‌حساب «${cp.name}» به ${newStatus ? 'فعال' : 'غیرفعال'} تغییر یافت.`);
        this.offlineSync.invalidateCache('counterparties');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در تغییر وضعیت طرف‌حساب'));
        this.cdr.detectChanges();
      }
    });
  }

  deleteCounterparty(cp: Counterparty, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (!cp.id) return;
    this.openConfirmDialog({
      title: 'حذف طرف‌حساب مالی',
      message: `آیا از حذف یا غیرفعال‌سازی طرف‌حساب مالی «${cp.name}» اطمینان دارید؟`,
      confirmText: 'بله، حذف شود',
      cancelText: 'انصراف',
      isDanger: true,
      onConfirm: () => {
        this.api.deleteCounterparty(cp.id!).subscribe({
          next: () => {
            this.toast.show('success', 'طرف‌حساب با موفقیت حذف یا غیرفعال شد.');
            this.counterparties = this.counterparties.filter(c => c.id !== cp.id);
            this.offlineSync.invalidateCache('counterparties');
            this.loadCounterparties();
            this.cdr.detectChanges();
          },
          error: (err) => this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در حذف طرف‌حساب'))
        });
      }
    });
  }

  // مدیریت بانک عامل و شماره شبا
  get filteredBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery?.trim()) return this.iranianBanks;
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanks.filter(b => b.name.toLowerCase().includes(q) || b.code.includes(q));
  }

  toggleBankDropdown(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.isBankDropdownOpen = !this.isBankDropdownOpen;
    if (this.isBankDropdownOpen) {
      this.bankSearchQuery = '';
    }
  }

  selectBank(bank: IranianBankInfo, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.newCounterparty.bank_name = bank.name;
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';

    const accValidation = validateAccountNumber(this.newCounterparty.account_number);
    if (accValidation.isValid) {
      const generated = generateShebaFromAccount(bank.name, this.newCounterparty.account_number);
      if (generated) {
        this.onShebaInput(generated);
      }
    }
    this.cdr.detectChanges();
  }

  onShebaInput(event: any): void {
    if (this._isSyncingBank) return;
    this._isSyncingBank = true;
    try {
      const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
      const digits = extractShebaDigits(rawVal);
      const res = validateSheba(digits);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || digits;
      this.newCounterparty.sheba_number = digits;
      if (res.bank) {
        this.newCounterparty.bank_name = res.bank.name;
      }
      if (res.accountNumber) {
        this.newCounterparty.account_number = res.accountNumber;
      }
      if (event?.target) {
        event.target.value = this.shebaDigitsDisplay;
      }
    } finally {
      this._isSyncingBank = false;
    }
    this.cdr.detectChanges();
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = this.normalizeInput(rawVal).replace(/\D/g, '').substring(0, 18);
    this.newCounterparty.account_number = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }
    if (cleanAcc && this.newCounterparty.bank_name) {
      const generated = generateShebaFromAccount(this.newCounterparty.bank_name, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.newCounterparty.sheba_number = res.rawSheba?.replace(/^IR/i, '') || '';
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.detectChanges();
  }

  copyShebaToClipboard(targetSheba?: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const shebaDigits = targetSheba || this.newCounterparty.sheba_number;
    if (!shebaDigits || this.isMaskedValue(shebaDigits)) return;
    const cleanDigits = shebaDigits.toString().trim().toUpperCase().replace(/^IR/i, '');
    navigator.clipboard.writeText(cleanDigits).then(() => {
      this.isShebaCopied = true;
      this.toast.show('success', `شماره شبا (بدون IR) در کلیپ‌بورد کپی شد: ${cleanDigits}`);
      setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    });
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.newCounterparty.account_number || '';
    if (!acc || this.isMaskedValue(acc)) return;
    navigator.clipboard.writeText(acc).then(() => {
      this.isAccountCopied = true;
      this.toast.show('success', `شماره حساب ${acc} کپی شد.`);
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    });
  }

  // ورودی و خروجی اکسل
  private triggerDownloadBlob(blob: Blob, filename: string): void {
    void saveBlob(blob, filename);
  }

  exportExcel(): void {
    this.isLoading = true;
    this.api.exportCounterpartiesExcel().subscribe({
      next: (blob) => {
        this.triggerDownloadBlob(blob, 'counterparties.xlsx');
        this.toast.show('success', 'فایل اکسل طرف‌حساب‌های مالی با موفقیت دانلود شد.');
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در دانلود فایل اکسل');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  downloadTemplate(): void {
    this.api.downloadCounterpartiesTemplate().subscribe({
      next: (blob) => {
        this.triggerDownloadBlob(blob, 'counterparties_template.xlsx');
        this.toast.show('success', 'قالب اکسل طرف‌حساب‌ها با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل')
    });
  }

  /** درون‌ریزی اکسل برای نویسندگان طرف‌حساب (از جمله حسابدار)؛ بک‌اند آن را به شرکت فعالِ مجاز محدود می‌کند. */
  get canImportExcel(): boolean {
    const user = this.auth.user();
    const perms = this.auth.userPermissions() || [];
    return hasStructureWritePermission(perms, !!user?.is_superuser || !!user?.roles?.includes('admin'))
      || perms.includes('perm_counterparty_manage')
      || perms.includes('perm_approve_personnel_finance');
  }

  openImportModal(): void {
    this.isExcelModalOpen = true;
    this.cdr.detectChanges();
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.cdr.detectChanges();
  }

  excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => {
    return this.api.importCounterpartiesExcel(file, dryRun);
  };

  excelTemplateFn = () => {
    this.downloadTemplate();
  };

  onExcelImported(result: any): void {
    if (result?.success) {
      this.toast.show('success', 'اطلاعات اکسل با موفقیت اعمال شد.');
      this.loadCounterparties();
    }
  }

  // سیستم دیالوگ تایید اختصاصی
  openConfirmDialog(options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }): void {
    this.confirmModal = {
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'تایید و حذف',
      cancelText: options.cancelText || 'انصراف',
      isDanger: options.isDanger !== false,
      onConfirm: options.onConfirm
    };
    this.cdr.detectChanges();
  }

  closeConfirmDialog(): void {
    this.confirmModal.isOpen = false;
    this.cdr.detectChanges();
  }

  executeConfirmDialog(): void {
    const action = this.confirmModal.onConfirm;
    this.closeConfirmDialog();
    if (action) action();
  }

  normalizeInput(val?: string | null): string {
    if (!val) return '';
    return val
      .toString()
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .trim();
  }

  extractApiErrorMessage(err: any, fallback: string): string {
    if (!err?.error) return fallback;
    if (typeof err.error === 'string') return err.error;
    if (err.error.error && typeof err.error.error === 'string') return err.error.error;
    if (err.error.message && typeof err.error.message === 'string') return err.error.message;
    if (err.error.detail && typeof err.error.detail === 'string') return err.error.detail;
    if (typeof err.error === 'object') {
      const messages: string[] = [];
      for (const [key, val] of Object.entries(err.error)) {
        if (key === 'success' || key === 'status') continue;
        const text = Array.isArray(val) ? val.join('، ') : String(val);
        messages.push(`${key}: ${text}`);
      }
      if (messages.length > 0) return messages.join(' | ');
    }
    return fallback;
  }
}
