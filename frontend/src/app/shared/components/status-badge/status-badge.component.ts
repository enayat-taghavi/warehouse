import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Badge رنگی وضعیت — نمایش وضعیت‌های مختلف با رنگ مناسب
 *
 * استفاده:
 *   <app-status-badge status="completed" />
 *   <app-status-badge [status]="record.field_status" domain="field" />
 *   <app-status-badge [label]="'سفارشی'" color="purple" />
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold leading-relaxed"
      [ngClass]="badgeClass"
    >
      <span class="w-1.5 h-1.5 rounded-full" [ngClass]="dotClass"></span>
      {{ displayLabel }}
    </span>
  `,
})
export class StatusBadgeComponent {
  /** مقدار status (enum value) */
  @Input() status = '';

  /** دامنه — تعیین‌کننده mapping مناسب */
  @Input() domain: 'record' | 'field' | 'doc' | 'label' | 'mt' | 'project' | 'user' | 'fleet' = 'record';

  /** لیبل سفارشی (اگر ست شود، از mapping استفاده نمی‌شود) */
  @Input() label = '';

  /** رنگ سفارشی */
  @Input() color: 'green' | 'blue' | 'amber' | 'rose' | 'purple' | 'slate' | 'indigo' | 'cyan' | 'emerald' = 'slate';

  private readonly STATUS_MAP: Record<string, Record<string, { label: string; color: string }>> = {
    fleet: {
      draft: { label: 'پیش‌نویس', color: 'slate' },
      pending_supervisor: { label: 'در انتظار سرپرست', color: 'amber' },
      pending_accountant: { label: 'در انتظار حسابدار', color: 'blue' },
      pending_manager: { label: 'در انتظار مدیر', color: 'indigo' },
      manager_approved: { label: 'تصویب‌شده', color: 'emerald' },
      approved: { label: 'مصوب و فعال', color: 'emerald' },
      revision_required: { label: 'نیازمند اصلاح', color: 'amber' },
      rejected: { label: 'رد شده', color: 'rose' },
    },
    record: {
      defined: { label: 'تعریف شده', color: 'slate' },
      counting: { label: 'در حال شمارش', color: 'blue' },
      completed: { label: 'تکمیل شده', color: 'emerald' },
      feeding: { label: 'در جریان تغذیه', color: 'amber' },
      archived: { label: 'آرشیو نهایی', color: 'purple' },
    },
    field: {
      waiting: { label: 'در انتظار', color: 'slate' },
      counting: { label: 'در کارتابل', color: 'blue' },
      recount: { label: 'مغایرت', color: 'rose' },
      done: { label: 'تایید میدانی', color: 'emerald' },
    },
    doc: {
      waiting: { label: 'در انتظار', color: 'slate' },
      processing: { label: 'در دست بررسی', color: 'amber' },
      done: { label: 'تکمیل اسناد', color: 'emerald' },
    },
    label: {
      pending: { label: 'چاپ نشده', color: 'slate' },
      printed: { label: 'چاپ شده', color: 'emerald' },
      reprint: { label: 'چاپ مجدد', color: 'amber' },
    },
    mt: {
      ready: { label: 'آماده', color: 'slate' },
      exported: { label: 'صادر شده', color: 'blue' },
      completed: { label: 'تکمیل', color: 'emerald' },
    },
    project: {
      active: { label: 'جاری', color: 'emerald' },
      configured: { label: 'تنظیم شده', color: 'amber' },
      frozen: { label: 'فریز شده', color: 'blue' },
      deleted: { label: 'حذف شده', color: 'rose' },
    },
    user: {
      active: { label: 'فعال', color: 'emerald' },
      suspended: { label: 'تعلیق‌شده', color: 'rose' },
    },
  };

  private readonly COLOR_CLASSES: Record<string, { bg: string; dot: string }> = {
    green: { bg: 'bg-green-500/10 text-green-600', dot: 'bg-green-500' },
    emerald: { bg: 'bg-emerald-500/10 text-emerald-600', dot: 'bg-emerald-500' },
    blue: { bg: 'bg-blue-500/10 text-blue-600', dot: 'bg-blue-500' },
    cyan: { bg: 'bg-cyan-500/10 text-cyan-600', dot: 'bg-cyan-500' },
    amber: { bg: 'bg-amber-500/10 text-amber-600', dot: 'bg-amber-500' },
    rose: { bg: 'bg-rose-500/10 text-rose-600', dot: 'bg-rose-500' },
    purple: { bg: 'bg-purple-500/10 text-purple-600', dot: 'bg-purple-500' },
    indigo: { bg: 'bg-indigo-500/10 text-indigo-600', dot: 'bg-indigo-500' },
    slate: { bg: 'bg-slate-500/10 text-slate-500', dot: 'bg-slate-400' },
  };

  get resolved(): { label: string; color: string } {
    if (this.label) return { label: this.label, color: this.color };
    return this.STATUS_MAP[this.domain]?.[this.status] ?? { label: this.status || '—', color: 'slate' };
  }

  get displayLabel(): string { return this.resolved.label; }
  get badgeClass(): string { return this.COLOR_CLASSES[this.resolved.color]?.bg ?? this.COLOR_CLASSES['slate'].bg; }
  get dotClass(): string { return this.COLOR_CLASSES[this.resolved.color]?.dot ?? this.COLOR_CLASSES['slate'].dot; }
}
