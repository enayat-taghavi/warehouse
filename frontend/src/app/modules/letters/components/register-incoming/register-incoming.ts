import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { firstValueFrom } from 'rxjs';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { LetterParty, errorText } from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { PartyPickerComponent } from '../party-picker/party-picker';

/** سقف اندازهٔ اسکن (همان سقف رایج پیوست) */
export const MAX_SCAN_BYTES = 20 * 1024 * 1024;

const newTempId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

/**
 * ثبت وارده (ن۱۶): موضوع، شمارهٔ بیرونی، تاریخ نامه، فرستنده و اسکن (دوربین یا فایل). فقط آنلاین.
 * ترتیب: ساخت نامهٔ «دریافت‌شده» (با client_temp_id، تکرار امن) ← بارگذاری اسکن ← «ثبت» دبیرخانه.
 * اگر گام بعدی ناموفق شود، نامهٔ ساخته‌شده می‌ماند و کاربر به صفحهٔ آن می‌رود (چیزی پاک نمی‌شود).
 */
@Component({
  selector: 'app-letter-register-incoming',
  standalone: true,
  imports: [ReactiveFormsModule, NgPersianDatepickerModule, ActionButtonComponent, PartyPickerComponent],
  templateUrl: './register-incoming.html',
})
export class RegisterIncomingComponent {
  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);

  readonly company = input<number | null>(null);
  readonly created = output<number>();

  readonly online = this.offline.online;
  readonly form = new FormGroup({
    subject: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
    external_number: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(64)] }),
    dateText: new FormControl('', { nonNullable: true }),
  });
  readonly externalDate = signal<string | null>(null);
  readonly sender = signal<LetterParty | null>(null);
  readonly scan = signal<File | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly subjectError = signal(false);
  private tempId = newTempId();

  onDateSelect(ev: any): void {
    this.externalDate.set(ev?.gregorian ? String(ev.gregorian).slice(0, 10) : null);
  }

  onFile(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const file = el.files?.[0] || null;
    el.value = '';
    if (file && file.size > MAX_SCAN_BYTES) {
      this.error.set('اندازهٔ اسکن بیش از ۲۰ مگابایت است.');
      return;
    }
    this.error.set('');
    this.scan.set(file);
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    const company = this.company();
    const subject = this.form.controls.subject.value.trim();
    this.subjectError.set(!subject);
    if (!subject) {
      this.error.set('موضوع نامه را بنویسید.');
      return;
    }
    if (!company) {
      this.error.set('نخست شرکت را انتخاب کنید.');
      return;
    }
    if (!this.online()) {
      this.error.set('ثبت وارده فقط با اتصال انجام می‌شود.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    let letterId = 0;
    try {
      const letter = await firstValueFrom(this.api.create({
        kind: 'incoming', company, client_temp_id: this.tempId, subject,
        external_number: this.form.controls.external_number.value.trim(),
        external_date: this.externalDate(), sender_party: this.sender()?.id ?? null,
      } as any));
      letterId = letter.id;
      const file = this.scan();
      if (file) await firstValueFrom(this.api.uploadScan(letterId, file));
      await firstValueFrom(this.api.lifecycle(letterId, 'register'));
      this.reset();
      this.created.emit(letterId);
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (letterId) {
        // نامه ساخته شده است؛ کاربر در صفحهٔ آن اسکن یا ثبت را دوباره انجام می‌دهد
        this.reset();
        this.created.emit(letterId);
      } else {
        this.error.set(isServerUnreachable(status) ? 'اتصال برقرار نیست؛ چیزی ثبت نشد و فرم سر جایش است.'
          : errorText(err?.error) || 'ثبت وارده انجام نشد.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  private reset(): void {
    this.form.reset();
    this.externalDate.set(null);
    this.sender.set(null);
    this.scan.set(null);
    this.tempId = newTempId();
  }
}
