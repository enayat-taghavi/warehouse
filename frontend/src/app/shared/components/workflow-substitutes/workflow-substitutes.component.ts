import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import {
  WorkflowSubstitute,
  WorkflowSubstituteInput
} from '../../../core/models/workflow.model';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { ToastService } from '../toast/toast.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { normalizeDigits, jalaliToGregorian } from '../../../core/utils/date-utils';

export function parseShamsiToGregorianIso(val: string | null | undefined): string | null {
  if (!val) return null;
  const clean = normalizeDigits(val).trim();
  const parts = clean.split(/[/.-]/).map((p) => Number(p));
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const { gy, gm, gd } = jalaliToGregorian(parts[0], parts[1], parts[2]);
    const mm = String(gm).padStart(2, '0');
    const dd = String(gd).padStart(2, '0');
    return `${gy}-${mm}-${dd}`;
  }
  return null;
}

@Component({
  selector: 'app-workflow-substitutes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgPersianDatepickerModule,
    SvgIconDirective,
    ActionButtonComponent
  ],
  templateUrl: './workflow-substitutes.component.html'
})
export class WorkflowSubstitutesComponent implements OnInit, OnChanges {
  /** شناسهٔ کاربر مرجع در حالت مدیر؛ اگر مشخص نباشد، جانشین‌های خود کاربر نمایش می‌یابد */
  @Input() principalId?: number;

  private workflowApi = inject(WorkflowApiService);
  private activeCompany = inject(ActiveCompanyService, { optional: true });
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef, { optional: true });

  substitutes: WorkflowSubstitute[] = [];
  loading = false;
  error = '';
  serverError = '';
  is403 = false;

  // فرم ایجاد
  substituteId: number | null = null;
  companyId: number | null = null;
  startControl = new FormControl('');
  endControl = new FormControl('');
  isStartDatePickerOpen = false;
  isEndDatePickerOpen = false;
  isCreating = false;

  fieldErrors: { substitute?: string; dates?: string } = {};

  // لیست کاربران برای جستجو و انتخاب
  availableUsers: { id: number; name: string }[] = [];
  userSearch = '';
  isLoadingUsers = false;

  get isManagerMode(): boolean {
    return this.principalId != null && this.principalId > 0;
  }

  get companies() {
    return this.activeCompany?.manageableCompanies?.() || [];
  }

  get filteredUsers() {
    if (!this.userSearch.trim()) return this.availableUsers;
    const q = this.userSearch.trim().toLowerCase();
    return this.availableUsers.filter((u) => u.name.toLowerCase().includes(q));
  }

  ngOnInit(): void {
    this.loadSubstitutes();
    this.loadUsers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['principalId'] && !changes['principalId'].firstChange) {
      this.loadSubstitutes();
      this.loadUsers();
    }
  }

  loadSubstitutes(): void {
    this.loading = true;
    this.error = '';
    this.is403 = false;

    this.workflowApi.getSubstitutes(this.principalId).subscribe({
      next: (res) => {
        this.substitutes = res || [];
        this.loading = false;
        this.cdr?.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 403) {
          this.is403 = true;
          this.error = err.error?.detail || 'اجازهٔ مدیریت جانشین‌های این کاربر را ندارید.';
        } else {
          this.error = err.error?.detail || err.message || 'خطا در بارگذاری جانشین‌ها';
        }
        this.cdr?.markForCheck();
      }
    });
  }

  /** نامزدها از سرور با همان شرط ثبت جانشین (هم‌شرکتی‌های صاحب کار در شرکت انتخاب‌شده یا همهٔ شرکت‌ها). */
  loadUsers(): void {
    this.isLoadingUsers = true;
    const company = this.companyId ? Number(this.companyId) : null;
    this.workflowApi.getSubstituteCandidates(this.principalId, company).subscribe({
      next: (list) => {
        this.availableUsers = list || [];
        if (this.substituteId != null && !this.availableUsers.some((u) => u.id === Number(this.substituteId))) {
          this.substituteId = null;
        }
        this.isLoadingUsers = false;
        this.cdr?.markForCheck();
      },
      error: () => {
        this.availableUsers = [];
        this.isLoadingUsers = false;
        this.cdr?.markForCheck();
      }
    });
  }

  onStartDateSelect(date: any): void {
    this.isStartDatePickerOpen = false;
  }

  onEndDateSelect(date: any): void {
    this.isEndDatePickerOpen = false;
  }

  validate(): boolean {
    this.fieldErrors = {};
    let valid = true;

    if (!this.substituteId) {
      this.fieldErrors.substitute = 'انتخاب کاربر جانشین الزامی است.';
      valid = false;
    }

    const startIso = parseShamsiToGregorianIso(this.startControl.value);
    const endIso = parseShamsiToGregorianIso(this.endControl.value);

    if (!startIso || !endIso) {
      this.fieldErrors.dates = 'تعیین تاریخ شروع و تاریخ پایان الزامی است.';
      valid = false;
    } else if (endIso < startIso) {
      this.fieldErrors.dates = 'تاریخ پایان نباید پیش از تاریخ شروع باشد.';
      valid = false;
    }

    return valid;
  }

  onSubmit(): void {
    if (!this.validate()) return;

    const startIso = parseShamsiToGregorianIso(this.startControl.value)!;
    const endIso = parseShamsiToGregorianIso(this.endControl.value)!;

    const payload: WorkflowSubstituteInput = {
      substitute_id: Number(this.substituteId),
      start_date: startIso,
      end_date: endIso,
      principal_id: this.principalId ?? null,
      company_id: this.companyId ? Number(this.companyId) : null
    };

    this.isCreating = true;
    this.serverError = '';

    this.workflowApi.createSubstitute(payload).subscribe({
      next: () => {
        this.isCreating = false;
        this.toast?.show?.('success', 'جانشینی موقت با موفقیت ثبت شد.');
        this.resetForm();
        this.loadSubstitutes();
      },
      error: (err) => {
        this.isCreating = false;
        this.serverError = err.error?.detail || err.error?.error || err.message || 'خطا در ثبت جانشین';
        this.cdr?.markForCheck();
      }
    });
  }

  resetForm(): void {
    this.substituteId = null;
    this.companyId = null;
    this.startControl.setValue('');
    this.endControl.setValue('');
    this.fieldErrors = {};
    this.serverError = '';
  }

  async onRevoke(sub: WorkflowSubstitute): Promise<void> {
    if (!sub.can_revoke) return;

    if (this.confirmDialog) {
      const ok = await this.confirmDialog.open({
        title: 'لغو جانشینی موقت',
        message: `آیا از لغو جانشینی موقت «${sub.substitute?.name || ''}» اطمینان دارید؟`,
        type: 'danger',
        confirmText: 'لغو جانشینی',
        cancelText: 'انصراف'
      });
      if (!ok) return;
    }

    this.workflowApi.revokeSubstitute(sub.id).subscribe({
      next: () => {
        this.toast?.show?.('success', 'جانشینی موقت لغو شد.');
        this.loadSubstitutes();
      },
      error: (err) => {
        const msg = err.error?.detail || err.message || 'خطا در لغو جانشین';
        this.toast?.show?.('error', msg);
      }
    });
  }

  getStatusBadgeClass(sub: WorkflowSubstitute): string {
    if (sub.is_current) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (sub.is_active && !sub.is_current) {
      return 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (sub.revoked_at) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

  getStatusLabel(sub: WorkflowSubstitute): string {
    if (sub.is_current) return 'فعال';
    if (sub.is_active && !sub.is_current) return 'آینده';
    if (sub.revoked_at) return 'لغوشده';
    return 'پایان‌یافته';
  }
}
