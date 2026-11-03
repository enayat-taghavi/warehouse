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
import { firstValueFrom } from 'rxjs';
import {
  WorkflowCompanySettings,
  WorkflowThreshold,
  WorkflowDefinition,
  WorkflowThresholdInput,
  WorkflowCompanyPolicies,
  WorkflowNotifyMode,
  WorkflowPolicyLevel,
  WorkflowPolicyPreview,
  WorkflowPolicyPreviewInput,
  WorkflowPolicyStep,
  WorkflowPolicyValues,
  WorkflowPolicyWorkflow,
  WorkflowRoleAction
} from '../../../../../../core/models/workflow.model';

/** پیش‌نویس ویرایش یک سطح (پیش‌فرض شرکت یا تنظیم جدای یک گردش)؛ null = از سطح بالاتر */
export interface WorkflowPolicyDraft {
  roleActions: Record<string, WorkflowRoleAction | null>;
  creatorMayApproveOwn: boolean | null;
  notifyMode: WorkflowNotifyMode | null;
  notifyUserIds: number[];
}

/** کلید پیش‌فرض شرکت در savingPolicyKey و previewFor */
export const COMPANY_POLICY_KEY = '';
/** بیشترین دفعهٔ تکرار پیش‌نمایش پس از 409 preview_stale در یک ذخیره */
const MAX_STALE_RETRIES = 3;
import { OrgProjectSection } from '../../../../../../core/models/company.model';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { normalizeDigits } from '../../../../../../core/utils/date-utils';

@Component({
  selector: 'app-company-workflow-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SvgIconDirective,
    ActionButtonComponent,
    LoadingSkeletonComponent
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

  // «وقتی کسی برای مرحله نیست» (طرح نبودن نفر ۱۴۰۵-۰۸): پیش‌فرض شرکت و تنظیم جدای هر گردش.
  // «ایجادکننده می‌تواند سند خودش را تأیید کند» از کارت مهلت‌ها به اینجا آمده است.
  readonly companyPolicyKey = COMPANY_POLICY_KEY;
  policies: WorkflowCompanyPolicies | null = null;
  policyLoading = false;
  policyError = '';
  companyDraft: WorkflowPolicyDraft | null = null;
  workflowDrafts: Record<string, WorkflowPolicyDraft> = {};
  expandedWorkflowKey: string | null = null;
  /** کلید سطحی که در حال پیش‌نمایش/ذخیره است ('' = پیش‌فرض شرکت)؛ null = هیچ */
  savingPolicyKey: string | null = null;
  /** خطای اعتبارسنجی هر سطح، با همان کلید */
  policyFormErrors: Record<string, string> = {};

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
    this.loadPolicies();
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
        // creator_may_approve_own دیگر از اینجا فرستاده نمی‌شود (کارت «وقتی کسی برای مرحله نیست»)؛
        // فرستادنش مقدار تازهٔ پیش‌فرض شرکت را با مقدار کهنهٔ این فرم بازنویسی می‌کرد.
        reminder_hours: Number(this.reminderHours),
        escalation_hours: Number(this.escalationHours)
      })
      .subscribe({
        next: (res) => {
          this.savingSettings = false;
          this.settings = res;
          this.toast?.show?.('success', 'تنظیمات گردش کار با موفقیت ذخیره شد.');
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

  // ─── «وقتی کسی برای مرحله نیست» ───

  loadPolicies(): void {
    this.policyLoading = true;
    this.policyError = '';
    this.workflowApi.getCompanyPolicies(this.companyId).subscribe({
      next: (res) => {
        this.applyPolicies(res);
        this.policyLoading = false;
        this.cdr?.markForCheck();
      },
      error: (err) => {
        this.policyLoading = false;
        // 403 را loadSettings برای کل زبانه نشان می‌دهد
        if (err?.status !== 403) {
          this.policyError = err?.error?.detail || 'خطا در بارگذاری تنظیم «وقتی کسی برای مرحله نیست»';
        }
        this.cdr?.markForCheck();
      }
    });
  }

  /** پاسخ GET یا ذخیره را جایگزین می‌کند و پیش‌نویس‌ها را از مقدار ذخیره‌شده از نو می‌سازد */
  applyPolicies(res: WorkflowCompanyPolicies): void {
    this.policies = res;
    this.companyDraft = this.draftFromLevel(res.company_default);
    const drafts: Record<string, WorkflowPolicyDraft> = {};
    for (const wf of res.workflows || []) drafts[wf.key] = this.draftFromLevel(wf);
    this.workflowDrafts = drafts;
    this.policyFormErrors = {};
  }

  draftFromLevel(level: WorkflowPolicyLevel): WorkflowPolicyDraft {
    const roleActions: Record<string, WorkflowRoleAction | null> = {};
    for (const r of level.roles || []) roleActions[r.role] = r.value ?? null;
    return {
      roleActions,
      creatorMayApproveOwn: level.creator_may_approve_own?.value ?? null,
      notifyMode: level.notify?.mode ?? null,
      notifyUserIds: [...(level.notify?.user_ids ?? [])]
    };
  }

  /** پیش‌نویس ← بدنهٔ values (کل ردیف؛ null = از سطح بالاتر) */
  valuesFromDraft(draft: WorkflowPolicyDraft): WorkflowPolicyValues {
    const roleActions: Record<string, WorkflowRoleAction> = {};
    for (const [role, action] of Object.entries(draft.roleActions)) {
      if (action === 'skip' || action === 'wait') roleActions[role] = action;
    }
    return {
      role_actions: roleActions,
      creator_may_approve_own: draft.creatorMayApproveOwn,
      notify_mode: draft.notifyMode,
      notify_user_ids: draft.notifyMode === 'users' ? [...draft.notifyUserIds] : []
    };
  }

  draftFor(key: string): WorkflowPolicyDraft | null {
    return key === COMPANY_POLICY_KEY ? this.companyDraft : (this.workflowDrafts[key] ?? null);
  }

  workflowPolicy(key: string): WorkflowPolicyWorkflow | undefined {
    return this.policies?.workflows.find((w) => w.key === key);
  }

  toggleWorkflowPolicy(key: string): void {
    this.expandedWorkflowKey = this.expandedWorkflowKey === key ? null : key;
  }

  setRoleAction(key: string, role: string, action: WorkflowRoleAction | null): void {
    const draft = this.draftFor(key);
    if (draft) draft.roleActions = { ...draft.roleActions, [role]: action };
  }

  setNotifyMode(key: string, mode: WorkflowNotifyMode | null): void {
    const draft = this.draftFor(key);
    if (draft) draft.notifyMode = mode;
  }

  toggleNotifyUser(key: string, userId: number): void {
    const draft = this.draftFor(key);
    if (!draft) return;
    draft.notifyUserIds = draft.notifyUserIds.includes(userId)
      ? draft.notifyUserIds.filter((id) => id !== userId)
      : [...draft.notifyUserIds, userId];
  }

  /** برچسب منبع مقدار مؤثر */
  sourceLabel(source: string): string {
    switch (source) {
      case 'own': return 'تنظیم جدا';
      case 'company': return 'پیش‌فرض شرکت';
      case 'locked': return 'قفل';
      default: return 'پیش‌فرض سامانه';
    }
  }

  actionLabel(action: WorkflowRoleAction | null | undefined): string {
    return action === 'skip' ? 'رد شود' : action === 'wait' ? 'منتظر بماند' : '';
  }

  /** دلیل قفل مرحله (س۱) */
  lockReason(step: WorkflowPolicyStep): string {
    return step.locked
      ? `«${step.title_fa}» همیشه منتظر می‌ماند: این مرحله داده‌های مالی (مثل شبا و نرخ) را کامل می‌کند و رد شدنش پرداخت بعدی را خراب می‌کند.`
      : '';
  }

  /** «رد شود» در مرحلهٔ پرداخت یعنی سند تأییدشده، پرداخت بیرون از سامانه */
  stepSkipNote(step: WorkflowPolicyStep): string {
    return step.payment && step.effective === 'skip' && !step.locked ? 'تأییدشده، پرداخت بیرون از سامانه' : '';
  }

  /** متن پنجرهٔ تأیید از شمارهای پیش‌نمایش */
  previewMessage(preview: WorkflowPolicyPreview): string {
    const c = preview.counts || { advance: 0, recipients_changed: 0, waiting: 0 };
    const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');
    const parts: string[] = [];
    if (c.advance) parts.push(`${fa(c.advance)} سند جلو می‌رود`);
    if (c.recipients_changed) parts.push(`${fa(c.recipients_changed)} سند گیرنده‌اش عوض می‌شود`);
    if (c.waiting) parts.push(`${fa(c.waiting)} سند منتظر می‌ماند`);
    return parts.length
      ? `با این تغییر، ${parts.join('، ')}.`
      : 'این تغییر روی سندهای باز اثری ندارد؛ فقط سندهای تازه با آن جلو می‌روند.';
  }

  previewSamples(preview: WorkflowPolicyPreview): string {
    const titles = (preview.samples || []).map((s) => s.title).filter(Boolean);
    return titles.length ? `نمونه: ${titles.join('، ')}` : '';
  }

  savePolicy(key: string): Promise<void> {
    const draft = this.draftFor(key);
    if (!draft || this.savingPolicyKey !== null) return Promise.resolve();
    this.policyFormErrors = { ...this.policyFormErrors, [key]: '' };
    if (draft.notifyMode === 'users' && draft.notifyUserIds.length === 0) {
      this.policyFormErrors = { ...this.policyFormErrors, [key]: 'دست‌کم یک کاربر برای خبر انتظار انتخاب کنید.' };
      return Promise.resolve();
    }
    const values = this.valuesFromDraft(draft);
    return this.runConfirmed(
      key,
      { workflow_key: key, values },
      'ذخیرهٔ تنظیم «وقتی کسی برای مرحله نیست»',
      'ذخیره',
      (token) => firstValueFrom(this.workflowApi.saveCompanyPolicy(this.companyId, key, values, token)),
      'تنظیم ذخیره شد.'
    );
  }

  resetWorkflowPolicy(key: string): Promise<void> {
    if (!key || this.savingPolicyKey !== null) return Promise.resolve();
    return this.runConfirmed(
      key,
      { workflow_key: key, reset: true },
      'برگشت به پیش‌فرض شرکت',
      'برگشت',
      (token) => firstValueFrom(this.workflowApi.resetWorkflowPolicy(this.companyId, key, token)),
      'این گردش دوباره از پیش‌فرض شرکت پیروی می‌کند.'
    );
  }

  /**
   * پیش‌نمایش ← پنجرهٔ تأیید با شمارها ← ذخیره با token. با 409 preview_stale شمارهای تازه دوباره نشان داده
   * و پرسیده می‌شود (حداکثر MAX_STALE_RETRIES بار). انصراف چیزی نمی‌نویسد.
   */
  private async runConfirmed(
    key: string,
    previewBody: WorkflowPolicyPreviewInput,
    title: string,
    confirmText: string,
    commit: (token: string) => Promise<WorkflowCompanyPolicies>,
    successMessage: string
  ): Promise<void> {
    this.savingPolicyKey = key;
    this.cdr?.markForCheck();
    try {
      let preview = await firstValueFrom(this.workflowApi.previewCompanyPolicy(this.companyId, previewBody));
      for (let attempt = 0; attempt <= MAX_STALE_RETRIES; attempt++) {
        const ok = await this.confirmPreview(preview, title, confirmText, attempt > 0);
        if (!ok) return;
        try {
          const res = await commit(preview.token);
          this.applyPolicies(res);
          this.toast?.show?.('success', successMessage);
          return;
        } catch (err: any) {
          if (err?.status === 409 && err?.error?.code === 'preview_stale' && err?.error?.preview) {
            preview = err.error.preview as WorkflowPolicyPreview;
            continue;
          }
          throw err;
        }
      }
      this.toast?.show?.('warning', 'سندها پشت سر هم عوض می‌شوند؛ کمی بعد دوباره ذخیره کنید.');
    } catch (err: any) {
      const msg = err?.error?.detail || 'خطا در ذخیرهٔ تنظیم';
      this.policyFormErrors = { ...this.policyFormErrors, [key]: msg };
      this.toast?.show?.('error', msg);
    } finally {
      this.savingPolicyKey = null;
      this.cdr?.markForCheck();
    }
  }

  private async confirmPreview(preview: WorkflowPolicyPreview, title: string, confirmText: string, stale: boolean): Promise<boolean> {
    if (!this.confirmDialog) return true;
    const head = stale ? 'وضع سندها پس از پیش‌نمایش عوض شد. شمارهای تازه: ' : '';
    const ok = await this.confirmDialog.open({
      title,
      message: head + this.previewMessage(preview),
      extraText: this.previewSamples(preview) || undefined,
      confirmText,
      cancelText: 'انصراف',
      type: 'warning'
    });
    return ok === true;
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
