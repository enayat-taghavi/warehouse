import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { ReferralNode, ReferralTreeNode, buildReferralTree, errorText } from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';

/** عرض موبایل: شاخه‌های زیرین بسته شروع می‌شوند (ن۱۶) */
export const isMobileWidth = (): boolean => typeof window !== 'undefined' && window.innerWidth < 640;

/**
 * درخت ارجاع نامه (ن۷، ن۱۶): تورفتگی راست‌به‌چپ، دستور، مهلت، وضعیت و پاسخ؛ در موبایل فهرست تودرتوی تاشو.
 * «انجام شد» و «رؤیت شد» همان اقدام‌های کار ارجاع هسته‌اند و فقط برای گیرندهٔ کار باز (`can_close` سرور).
 */
@Component({
  selector: 'app-letter-referral-tree',
  standalone: true,
  imports: [NgTemplateOutlet, ReactiveFormsModule, ActionButtonComponent, LoadingSkeletonComponent, StatusBadgeComponent, PersianDatePipe, SvgIconDirective],
  templateUrl: './referral-tree.html',
})
export class ReferralTreeComponent {
  private readonly api = inject(LettersApiService);

  readonly letterId = input.required<number>();
  /** هر تغییر = بازخوانی (پس از کنش، ارجاع یا رویداد زنده) */
  readonly version = input(0);
  readonly online = input(true);
  readonly referFrom = output<number>();

  readonly roots = signal<ReferralTreeNode[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal<'offline' | 'error' | null>(null);
  readonly stale = signal(false);
  readonly collapsed = signal<ReadonlySet<number>>(new Set());
  readonly replyFor = signal<number | null>(null);
  readonly busy = signal<number | null>(null);
  readonly actionError = signal('');
  readonly reply = new FormControl('', { nonNullable: true });
  private seq = 0;
  private initialized = false;

  constructor() {
    effect(() => {
      const id = this.letterId();
      this.version();
      untracked(() => this.load(id));
    });
  }

  load(id = this.letterId()): void {
    const seq = ++this.seq;
    if (!this.initialized) this.loading.set(true);
    this.api.referrals(id).subscribe({
      next: tree => {
        if (seq !== this.seq) return;
        const roots = buildReferralTree(tree.referrals || []);
        if (!this.initialized && isMobileWidth()) {
          // موبایل: شاخه‌های فرزنددار بسته شروع می‌شوند
          const closed = new Set<number>();
          const walk = (items: ReferralTreeNode[]) => items.forEach(i => { if (i.children.length) closed.add(i.node.task_id); walk(i.children); });
          walk(roots);
          this.collapsed.set(closed);
        }
        this.initialized = true;
        this.roots.set(roots);
        this.count.set((tree.referrals || []).length);
        this.error.set(null);
        this.stale.set(false);
        this.loading.set(false);
      },
      error: err => {
        if (seq !== this.seq) return;
        const unreachable = isServerUnreachable(err?.status ?? 0);
        if (this.initialized && unreachable) {
          // درخت نشان‌داده‌شده می‌ماند؛ فقط یادداشت «قدیمی»
          this.stale.set(true);
          this.loading.set(false);
          return;
        }
        this.error.set(unreachable ? 'offline' : 'error');
        this.loading.set(false);
      },
    });
  }

  isOpen(n: ReferralTreeNode): boolean {
    return !this.collapsed().has(n.node.task_id);
  }

  toggle(n: ReferralTreeNode): void {
    const next = new Set(this.collapsed());
    if (next.has(n.node.task_id)) next.delete(n.node.task_id);
    else next.add(n.node.task_id);
    this.collapsed.set(next);
  }

  startDone(node: ReferralNode): void {
    this.reply.setValue('');
    this.actionError.set('');
    this.replyFor.set(this.replyFor() === node.task_id ? null : node.task_id);
  }

  close(node: ReferralNode, action: 'done' | 'seen'): void {
    if (!this.online() || this.busy()) return;
    this.busy.set(node.task_id);
    this.actionError.set('');
    this.api.closeReferral(node.task_id, action, action === 'done' ? this.reply.value.trim() : '').subscribe({
      next: () => {
        this.busy.set(null);
        this.replyFor.set(null);
        this.load();
      },
      error: err => {
        this.busy.set(null);
        this.actionError.set(isServerUnreachable(err?.status ?? 0)
          ? 'اتصال برقرار نیست؛ کار بسته نشد.'
          : errorText(err?.error) || 'بستن کار انجام نشد.');
        this.load();
      },
    });
  }
}
