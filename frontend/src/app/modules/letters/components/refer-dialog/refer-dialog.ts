import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { PersonRolePickerComponent, PersonRoleValue } from '../../../../shared/components/person-role-picker/person-role-picker.component';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { ReferPayload, errorText } from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';

/** سقف گیرنده در هر بار ارجاع (قاعدهٔ هسته) */
export const MAX_REFER_TARGETS = 20;

/**
 * فرم ارجاع (ن۷): گیرنده‌ها با `app-person-role-picker`، «ارجاع» یا «برای اطلاع»، دستور (پاراف) و مهلت شمسی.
 * فقط آنلاین؛ هرگز در صف نمی‌رود. `parentTask` = ارجاع از کار ارجاع باز خود کاربر (شاخه).
 */
@Component({
  selector: 'app-letter-refer-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, NgPersianDatepickerModule, ActionButtonComponent, PersonRolePickerComponent],
  templateUrl: './refer-dialog.html',
})
export class ReferDialogComponent {
  private readonly api = inject(LettersApiService);

  readonly letterId = input.required<number>();
  readonly parentTask = input<number | null>(null);
  readonly done = output<void>();
  readonly cancelled = output<void>();

  readonly maxTargets = MAX_REFER_TARGETS;
  readonly targets = new FormControl<PersonRoleValue[]>([], { nonNullable: true });
  readonly kind = new FormControl<'refer' | 'inform'>('refer', { nonNullable: true });
  readonly instruction = new FormControl('', { nonNullable: true });
  readonly dueText = new FormControl('', { nonNullable: true });
  readonly dueAt = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  onDueSelect(ev: any): void {
    this.dueAt.set(ev?.gregorian ? String(ev.gregorian).slice(0, 10) : null);
  }

  clearDue(): void {
    this.dueAt.set(null);
    this.dueText.setValue('');
  }

  submit(): void {
    if (this.busy()) return;
    const ids = this.targets.value.filter(v => v.type === 'user').map(v => Number(v.id)).filter(Boolean);
    if (!ids.length) {
      this.error.set('دست‌کم یک گیرنده انتخاب کنید.');
      return;
    }
    if (ids.length > MAX_REFER_TARGETS) {
      this.error.set(`حداکثر ${MAX_REFER_TARGETS} گیرنده در هر بار.`);
      return;
    }
    const payload: ReferPayload = {
      targets: ids,
      kind: this.kind.value,
      instruction: this.instruction.value.trim(),
      due_at: this.dueAt(),
      parent_task: this.parentTask(),
    };
    this.busy.set(true);
    this.error.set('');
    this.api.refer(this.letterId(), payload).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.emit();
      },
      error: err => {
        this.busy.set(false);
        this.error.set(isServerUnreachable(err?.status ?? 0)
          ? 'اتصال برقرار نیست؛ ارجاع فرستاده نشد.'
          : errorText(err?.error) || 'ارجاع انجام نشد.');
      },
    });
  }
}
