import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompaniesStudioFacade } from '../companies-studio.facade';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyBoardMember, CompanyBoardMemberRole, CompanyBoardMemberType } from '../../../../../core/models/company.model';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ExternalLinkDirective } from '../../../../../shared/directives/external-link.directive';

/** شناسهٔ تب در استودیوی شرکت (`?tab=governance`) */
export const GOVERNANCE_TAB_ID = 'governance';

/**
 * تب «هیئت‌مدیره و امضا» استودیوی شرکت (مشارکت ماژول حسابداری از راه `companies.studioTabs`).
 * فقط با CompanyStudioContextService با هستهٔ استودیو حرف می‌زند.
 */
@Component({
  selector: 'app-company-governance-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective, ActionButtonComponent, ExternalLinkDirective],
  providers: [CompaniesStudioFacade],
  templateUrl: './company-governance-tab.html'
})
export class CompanyGovernanceTabComponent implements OnInit, OnChanges, OnDestroy {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  @Input() companyId: number | null = null;

  private facade = inject(CompaniesStudioFacade);
  private companyApi = inject(CompanyApiService);
  private studioContext = inject(CompanyStudioContextService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private ws = inject(WebSocketService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private offlineSync = OfflineSyncService.getInstance();
  private destroy$ = new Subject<void>();
  private unregisterDirty: () => void;

  // کنترل‌های فرم تقویم شمسی جلالی (Reactive FormControls برای عملکرد بی‌نقص ng-persian-datepicker)
  boardTermStartControl = new FormControl('');
  boardTermExpiryControl = new FormControl('');

  // مدیریت اعضای هیئت‌مدیره، مدیرعامل و صاحبان امضا
  companyBoardMembers: CompanyBoardMember[] = [];
  isLoadingBoardMembers = false;
  /** دریافت اعضا شکست خورد (حالت خطا با «تلاش دوباره») */
  loadError = false;
  isSavingBoardMember = false;
  isEditingBoardMember = false;
  editingBoardMemberId: number | null = null;
  showBoardMemberForm = false;
  isBoardTermStartDatePickerOpen = false;
  isBoardTermExpiryDatePickerOpen = false;
  selectedIdDocFile: File | null = null;
  selectedAppointmentDocFile: File | null = null;

  readonly boardRolesList: { value: CompanyBoardMemberRole; label: string; badgeClass: string }[] = [
    { value: 'chairman', label: 'رئیس هیئت‌مدیره', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { value: 'vice_chairman', label: 'نایب‌رئیس هیئت‌مدیره', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'managing_director', label: 'مدیرعامل', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'managing_director_and_member', label: 'عضو هیئت‌مدیره و مدیرعامل', badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
    { value: 'board_member', label: 'عضو هیئت‌مدیره', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' },
    { value: 'main_inspector', label: 'بازرس اصلی', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'alternate_inspector', label: 'بازرس علی‌البدل', badgeClass: 'bg-amber-50/60 text-amber-600 border-amber-100' },
    { value: 'secretary', label: 'دبیر هیئت‌مدیره', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
    { value: 'other', label: 'سایر ارکان قانونی', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  ];

  newBoardMember = this.getEmptyBoardMemberData();

  constructor() {
    // فرم عضو باز در هشدار خروج استودیو حساب می‌شود (ت۳)
    this.unregisterDirty = this.studioContext.registerDirty(GOVERNANCE_TAB_ID, () => this.showBoardMemberForm);
  }

  ngOnInit(): void {
    this.boardTermStartControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newBoardMember.term_start = val || '';
    });
    this.boardTermExpiryControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newBoardMember.term_expiry = val || '';
    });
    this.setupRealtimeListeners();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      this.cancelBoardMemberForm();
      this.setMembers([]);
      if (this.companyId) {
        this.loadCompanyBoardMembers(this.companyId);
      }
    }
  }

  ngOnDestroy(): void {
    this.unregisterDirty();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** شمارندهٔ تب از context به هستهٔ استودیو می‌رسد */
  private setMembers(members: CompanyBoardMember[]): void {
    this.companyBoardMembers = members;
    this.studioContext.setCount(GOVERNANCE_TAB_ID, members.length);
  }

  private setupRealtimeListeners(): void {
    // ۱. وب‌سوکت: تغییر اعضا در تب یا دستگاه دیگر
    this.ws?.notifications$.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      if (msg?.type_str !== 'org_structure_updated' || msg.entity_type !== 'company_board_member') return;
      if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) return;
      const targetCompanyId = msg.company_id || msg.project_id;
      if (this.companyId && (!targetCompanyId || targetCompanyId === this.companyId)) {
        this.loadCompanyBoardMembers(this.companyId);
      }
    });

    // ۲. نتیجهٔ پس‌زمینهٔ کش SWR
    this.offlineSync.liveDataUpdates$.pipe(takeUntil(this.destroy$)).subscribe(({ url, data }) => {
      if (!url || !this.companyId || !this.companyApi.matchesCompanyUrl(url, 'boardMembers')) return;
      // تطبیق دقیق شناسه (company_id=1 نباید با company_id=12 جور شود)
      if (!new RegExp(`[?&]company_id=${this.companyId}(&|$)`).test(url)) return;
      if (Array.isArray(data)) {
        this.setMembers(data);
      } else if (data && Array.isArray((data as any).results)) {
        this.setMembers((data as any).results);
      }
      this.cdr.markForCheck();
    });
  }

  private async askConfirm(title: string, message: string): Promise<boolean> {
    if (this.confirmDialog) {
      const res = await this.confirmDialog.open({
        title,
        message,
        type: 'danger',
        confirmText: 'حذف',
        cancelText: 'انصراف'
      });
      return res === true;
    }
    return window.confirm(message);
  }

  retry(): void {
    if (this.companyId) this.loadCompanyBoardMembers(this.companyId);
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت اعضای هیئت‌مدیره و ارکان قانونی شرکت
  // ═════════════════════════════════════════════════════════════════════
  getEmptyBoardMemberData() {
    return {
      first_name: '',
      last_name: '',
      national_code: '',
      member_type: 'real' as CompanyBoardMemberType,
      represented_legal_name: '',
      role: 'board_member' as CompanyBoardMemberRole,
      has_signature_right: false,
      signature_scope: '',
      term_start: '',
      term_expiry: '',
      is_active: true
    };
  }

  loadCompanyBoardMembers(companyId: number): void {
    this.isLoadingBoardMembers = true;
    this.loadError = false;
    this.studioContext.reportError(GOVERNANCE_TAB_ID, false);
    this.facade.getBoardMembers(companyId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        // پاسخ دیررسِ شرکت پیشین شمارندهٔ شرکت تازه را عوض نمی‌کند
        if (companyId !== this.companyId) return;
        this.isLoadingBoardMembers = false;
        if (Array.isArray(res)) {
          this.setMembers(res);
        } else if (res && Array.isArray((res as any).results)) {
          this.setMembers((res as any).results);
        } else {
          this.setMembers([]);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingBoardMembers = false;
        this.loadError = true;
        this.studioContext.reportError(GOVERNANCE_TAB_ID);
        this.cdr.markForCheck();
      }
    });
  }

  openNewBoardMemberForm(): void {
    if (!this.companyId) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید تا شناسه شرکت صادر گردد.');
      return;
    }
    this.newBoardMember = this.getEmptyBoardMemberData();
    this.boardTermStartControl.setValue('', { emitEvent: false });
    this.boardTermExpiryControl.setValue('', { emitEvent: false });
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.isEditingBoardMember = false;
    this.editingBoardMemberId = null;
    this.showBoardMemberForm = true;
    this.cdr.markForCheck();
  }

  editBoardMember(member: CompanyBoardMember): void {
    this.editingBoardMemberId = member.id || null;
    this.isEditingBoardMember = true;
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.newBoardMember = {
      first_name: member.first_name,
      last_name: member.last_name,
      national_code: member.national_code,
      member_type: member.member_type,
      represented_legal_name: member.represented_legal_name || '',
      role: member.role,
      has_signature_right: member.has_signature_right,
      signature_scope: member.signature_scope || '',
      term_start: member.term_start || '',
      term_expiry: member.term_expiry || '',
      is_active: member.is_active !== false
    };
    this.showBoardMemberForm = true;
    this.boardTermStartControl.setValue(member.term_start || '', { emitEvent: false });
    this.boardTermExpiryControl.setValue(member.term_expiry || '', { emitEvent: false });
    this.cdr.markForCheck();
  }

  cancelBoardMemberForm(): void {
    this.showBoardMemberForm = false;
    this.isEditingBoardMember = false;
    this.editingBoardMemberId = null;
    this.newBoardMember = this.getEmptyBoardMemberData();
    this.boardTermStartControl.setValue('', { emitEvent: false });
    this.boardTermExpiryControl.setValue('', { emitEvent: false });
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.cdr.markForCheck();
  }

  onIdDocFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        this.toast.error('حجم فایل مدارک هویتی نباید بیش از ۲۰ مگابایت باشد.');
        return;
      }
      this.selectedIdDocFile = file;
    }
  }

  onAppointmentDocFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        this.toast.error('حجم فایل حکم انتصاب نباید بیش از ۲۰ مگابایت باشد.');
        return;
      }
      this.selectedAppointmentDocFile = file;
    }
  }

  onBoardTermStartSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newBoardMember.term_start = val;
    this.boardTermStartControl.setValue(val, { emitEvent: false });
    this.isBoardTermStartDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onBoardTermExpirySelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newBoardMember.term_expiry = val;
    this.boardTermExpiryControl.setValue(val, { emitEvent: false });
    this.isBoardTermExpiryDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  saveBoardMember(): void {
    if (!this.companyId) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید.');
      return;
    }
    if (!this.newBoardMember.first_name.trim() || !this.newBoardMember.last_name.trim()) {
      this.toast.warning('نام و نام خانوادگی عضو هیئت‌مدیره الزامی است.');
      return;
    }
    const cleanCode = this.newBoardMember.national_code.replace(/[^0-9]/g, '');
    if (cleanCode.length !== 10) {
      this.toast.warning('کد ملی عضو باید دقیقاً ۱۰ رقم باشد.');
      return;
    }
    if (!this.validateNationalCode(cleanCode)) {
      this.toast.warning('کد ملی عضو هیئت‌مدیره با الگوریتم ثبت احوال همخوانی ندارد.');
      return;
    }

    this.isSavingBoardMember = true;
    const formData = new FormData();
    formData.append('company', String(this.companyId));
    formData.append('first_name', this.newBoardMember.first_name.trim());
    formData.append('last_name', this.newBoardMember.last_name.trim());
    formData.append('national_code', cleanCode);
    formData.append('member_type', this.newBoardMember.member_type);
    if (this.newBoardMember.member_type === 'legal_rep' && this.newBoardMember.represented_legal_name) {
      formData.append('represented_legal_name', this.newBoardMember.represented_legal_name.trim());
    }
    formData.append('role', this.newBoardMember.role);
    formData.append('has_signature_right', String(this.newBoardMember.has_signature_right));
    if (this.newBoardMember.signature_scope) {
      formData.append('signature_scope', this.newBoardMember.signature_scope.trim());
    }
    if (this.newBoardMember.term_start) {
      formData.append('term_start', this.newBoardMember.term_start);
    }
    if (this.newBoardMember.term_expiry) {
      formData.append('term_expiry', this.newBoardMember.term_expiry);
    }
    formData.append('is_active', String(this.newBoardMember.is_active));

    if (this.selectedIdDocFile) {
      formData.append('attached_id_doc', this.selectedIdDocFile);
    }
    if (this.selectedAppointmentDocFile) {
      formData.append('attached_appointment_doc', this.selectedAppointmentDocFile);
    }

    if (this.isEditingBoardMember && this.editingBoardMemberId) {
      this.facade.updateBoardMember(this.editingBoardMemberId, formData).subscribe({
        next: (updated) => {
          this.isSavingBoardMember = false;
          this.toast.success(`مشخصات «${updated.first_name} ${updated.last_name}» با موفقیت ویرایش شد.`);
          this.cancelBoardMemberForm();
          const idx = this.companyBoardMembers.findIndex(m => m.id === updated.id);
          if (idx !== -1) {
            this.companyBoardMembers[idx] = updated;
            this.setMembers([...this.companyBoardMembers]);
          } else {
            this.setMembers([updated, ...this.companyBoardMembers]);
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBoardMember = false;
          const msg = err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ویرایش عضو هیئت‌مدیره';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    } else {
      this.facade.createBoardMember(formData).subscribe({
        next: (created) => {
          this.isSavingBoardMember = false;
          this.toast.success(`عضو جدید «${created.first_name} ${created.last_name}» با موفقیت افزوده شد.`);
          this.cancelBoardMemberForm();
          this.setMembers([created, ...this.companyBoardMembers.filter(m => m.id !== created.id)]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBoardMember = false;
          const msg = err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ثبت عضو هیئت‌مدیره';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    }
  }

  async deleteBoardMember(member: CompanyBoardMember): Promise<void> {
    if (!member.id) return;
    const ok = await this.askConfirm(
      'حذف عضو هیئت‌مدیره',
      `آیا از حذف عضو «${member.first_name} ${member.last_name}» اطمینان دارید؟`
    );
    if (!ok) return;
    this.facade.deleteBoardMember(member.id).subscribe({
      next: () => {
        this.toast.success('عضو هیئت‌مدیره با موفقیت حذف گردید.');
        this.setMembers(this.companyBoardMembers.filter(m => m.id !== member.id));
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در حذف عضو هیئت‌مدیره')
    });
  }

  getRoleBadgeClass(role: CompanyBoardMemberRole): string {
    const found = this.boardRolesList.find(r => r.value === role);
    return found ? found.badgeClass : 'bg-slate-50 text-slate-700 border-slate-200';
  }

  getRoleLabel(role: CompanyBoardMemberRole): string {
    const found = this.boardRolesList.find(r => r.value === role);
    return found ? found.label : role;
  }

  getSignersCount(): number {
    return this.companyBoardMembers.filter(m => m.has_signature_right).length;
  }

  getCeoMember(): CompanyBoardMember | undefined {
    return this.companyBoardMembers.find(m => m.role === 'managing_director' || m.role === 'managing_director_and_member');
  }

  getChairmanMember(): CompanyBoardMember | undefined {
    return this.companyBoardMembers.find(m => m.role === 'chairman');
  }

  validateNationalCode(code?: string | null): boolean {
    if (!code) return true;
    let clean = code.replace(/[^0-9]/g, '');
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
}
