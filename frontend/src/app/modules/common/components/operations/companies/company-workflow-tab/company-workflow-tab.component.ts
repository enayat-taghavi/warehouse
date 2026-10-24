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
import { FormsModule } from '@angular/forms';
import { WorkflowApiService } from '../../../../../../core/api/workflow-api.service';
import { OrgStructureApiService } from '../../../../../../core/api/org-structure-api.service';
import {
  WorkflowCompanySettings,
  WorkflowThreshold,
  WorkflowDefinition,
  WorkflowThresholdInput
} from '../../../../../../core/models/workflow.model';
import { OrgProjectSection } from '../../../../../../core/models/company.model';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { normalizeDigits } from '../../../../../../core/utils/date-utils';

@Component({
  selector: 'app-company-workflow-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SvgIconDirective,
    ActionButtonComponent
  ],
  templateUrl: './company-workflow-tab.component.html'
})
export class CompanyWorkflowTabComponent implements OnInit, OnChanges {
  @Input({ required: true }) companyId!: number;

  private workflowApi = inject(WorkflowApiService);
  private orgApi = inject(OrgStructureApiService, { optional: true });
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef, { optional: true });

  loading = false;
  savingSettings = false;
  savingThreshold = false;
  is403 = false;
  forbiddenMessage = 'اجازهٔ ویرایش تنظیمات گردش کار این شرکت را ندارید';
  error = '';

  // تنظیمات ساعات یادآوری و ارتقا
  settings: WorkflowCompanySettings | null = null;
  reminderHours: number = 24;
  escalationHours: number = 72;
  settingsErrors: { reminder?: string; escalation?: string } = {};

  // سقف‌های تایید مبلغ
  thresholds: WorkflowThreshold[] = [];
  definitions: WorkflowDefinition[] = [];
  sections: OrgProjectSection[] = [];

  // فرم افزودن سقف
  selectedWorkflowKey: string = '';
  selectedStepKey: string = '';
  selectedSectionId: number | null = null;
  thresholdAmount: string = '';
  thresholdError: string = '';

  get amountWorkflows(): WorkflowDefinition[] {
    return this.definitions.filter((d) => d.has_amount);
  }

  get availableSteps() {
    const wf = this.definitions.find((d) => d.key === this.selectedWorkflowKey);
    if (!wf || !wf.steps) return [];
    return wf.steps.filter((s) => s.kind === 'approve');
  }

  ngOnInit(): void {
    if (this.companyId) {
      this.loadAll();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && !changes['companyId'].firstChange) {
      this.loadAll();
    }
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';
    this.is403 = false;

    this.loadDefinitions();
    this.loadSections();
    this.loadSettings();
    this.loadThresholds();
  }

  loadSettings(): void {
    this.workflowApi.getCompanySettings(this.companyId).subscribe({
      next: (res) => {
        this.settings = res;
        this.reminderHours = res.reminder_hours;
        this.escalationHours = res.escalation_hours;
        this.loading = false;
        this.cdr?.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 403) {
          this.is403 = true;
          this.forbiddenMessage = err.error?.detail || 'اجازهٔ ویرایش تنظیمات گردش کار این شرکت را ندارید';
        } else {
          this.error = err.error?.detail || 'خطا در بارگذاری تنظیمات شرکت';
        }
        this.cdr?.markForCheck();
      }
    });
  }

  loadThresholds(): void {
    this.workflowApi.getThresholds(this.companyId).subscribe({
      next: (res) => {
        this.thresholds = res || [];
        this.cdr?.markForCheck();
      },
      error: (err) => {
        if (err.status === 403) {
          this.is403 = true;
          this.forbiddenMessage = err.error?.detail || 'اجازهٔ ویرایش تنظیمات گردش کار این شرکت را ندارید';
        }
        this.cdr?.markForCheck();
      }
    });
  }

  loadDefinitions(): void {
    this.workflowApi.getDefinitions().subscribe({
      next: (res) => {
        this.definitions = res || [];
        this.cdr?.markForCheck();
      },
      error: () => {}
    });
  }

  loadSections(): void {
    if (!this.orgApi) return;
    this.orgApi.getSections(undefined, this.companyId).subscribe({
      next: (res) => {
        this.sections = res || [];
        this.cdr?.markForCheck();
      },
      error: () => {}
    });
  }

  onWorkflowChange(): void {
    this.selectedStepKey = '';
    const steps = this.availableSteps;
    if (steps.length > 0) {
      this.selectedStepKey = steps[0].key;
    }
  }

  validateSettings(): boolean {
    this.settingsErrors = {};
    let valid = true;

    const r = Number(this.reminderHours);
    const e = Number(this.escalationHours);

    if (isNaN(r) || r < 1 || r > 720) {
      this.settingsErrors.reminder = 'ساعت یادآوری باید بین ۱ تا ۷۲۰ باشد.';
      valid = false;
    }

    if (isNaN(e) || e < 1 || e > 720) {
      this.settingsErrors.escalation = 'ساعت خبر به بالاتر باید بین ۱ تا ۷۲۰ باشد.';
      valid = false;
    }

    if (valid && r >= e) {
      this.settingsErrors.escalation = 'ساعت خبر به بالاتر باید بیشتر از ساعت یادآوری باشد (۱ ≤ یادآوری < خبر به بالاتر ≤ ۷۲۰).';
      valid = false;
    }

    return valid;
  }

  saveCompanySettings(): void {
    if (!this.validateSettings()) return;

    this.savingSettings = true;
    this.workflowApi
      .saveCompanySettings(this.companyId, {
        reminder_hours: Number(this.reminderHours),
        escalation_hours: Number(this.escalationHours)
      })
      .subscribe({
        next: (res) => {
          this.savingSettings = false;
          this.settings = res;
          this.toast?.show?.('success', 'تنظیمات یادآوری با موفقیت ذخیره شد.');
          this.cdr?.markForCheck();
        },
        error: (err) => {
          this.savingSettings = false;
          const msg = err.error?.detail || 'خطا در ذخیرهٔ تنظیمات گردش کار';
          this.toast?.show?.('error', msg);
          this.cdr?.markForCheck();
        }
      });
  }

  saveThreshold(): void {
    this.thresholdError = '';

    if (!this.selectedWorkflowKey) {
      this.thresholdError = 'انتخاب گردش کار الزامی است.';
      return;
    }

    if (!this.selectedStepKey) {
      this.thresholdError = 'انتخاب مرحله الزامی است.';
      return;
    }

    const cleanAmount = normalizeDigits(this.thresholdAmount).replace(/[,٬\s]/g, '');
    const numAmount = Number(cleanAmount);
    if (isNaN(numAmount) || numAmount < 0 || cleanAmount.trim() === '') {
      this.thresholdError = 'مبلغ سقف باید یک عدد معتبر و نامنفی باشد.';
      return;
    }

    const payload: WorkflowThresholdInput = {
      company: this.companyId,
      section: this.selectedSectionId ? Number(this.selectedSectionId) : null,
      workflow_key: this.selectedWorkflowKey,
      step_key: this.selectedStepKey,
      amount: numAmount
    };

    this.savingThreshold = true;
    this.workflowApi.saveThreshold(payload).subscribe({
      next: () => {
        this.savingThreshold = false;
        this.toast?.show?.('success', 'سقف مبلغ با موفقیت ثبت شد.');
        this.resetThresholdForm();
        this.loadThresholds();
      },
      error: (err) => {
        this.savingThreshold = false;
        this.thresholdError = err.error?.detail || err.error?.error || 'خطا در ثبت سقف مبلغ';
        this.cdr?.markForCheck();
      }
    });
  }

  resetThresholdForm(): void {
    this.selectedWorkflowKey = '';
    this.selectedStepKey = '';
    this.selectedSectionId = null;
    this.thresholdAmount = '';
    this.thresholdError = '';
  }

  async deleteThreshold(th: WorkflowThreshold): Promise<void> {
    if (this.confirmDialog) {
      const ok = await this.confirmDialog.open({
        title: 'حذف سقف مبلغ',
        message: `آیا از حذف سقف مبلغ مرحلهٔ «${th.step_title_fa}» برای ${th.section ? th.section.name : 'کل شرکت'} اطمینان دارید؟`,
        type: 'danger',
        confirmText: 'حذف',
        cancelText: 'انصراف'
      });
      if (!ok) return;
    }

    this.workflowApi.deleteThreshold(th.id).subscribe({
      next: () => {
        this.toast?.show?.('success', 'سقف مبلغ حذف شد.');
        this.loadThresholds();
      },
      error: (err) => {
        const msg = err.error?.detail || 'خطا در حذف سقف مبلغ';
        this.toast?.show?.('error', msg);
      }
    });
  }

  formatAmount(val: string | number | null | undefined): string {
    if (val == null || val === '') return '۰ ریال';
    const num = Number(val);
    if (isNaN(num)) return `${val} ریال`;
    return `${num.toLocaleString('fa-IR')} ریال`;
  }
}
