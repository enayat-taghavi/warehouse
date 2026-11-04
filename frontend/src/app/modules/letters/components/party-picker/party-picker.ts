import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, switchMap, of, catchError, map } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { LetterParty } from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService, serverErrorText } from '../../services/letters-offline';

/**
 * انتخابگر طرف بیرونی (ن۱۶): جست‌وجو و «طرف تازه» از API خود ماژول (`/api/letters/parties/`).
 * کد ملی حقیقی‌ها را سرور برای کسی که مجوز دبیرخانه ندارد پوشیده می‌فرستد (ق۱۶). فقط آنلاین.
 */
@Component({
  selector: 'app-letter-party-picker',
  standalone: true,
  imports: [FormsModule, SvgIconDirective],
  templateUrl: './party-picker.html',
})
export class PartyPickerComponent {
  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);

  readonly company = input<number | null>(null);
  readonly disabled = input(false);
  readonly picked = output<LetterParty>();

  readonly online = this.offline.online;
  readonly query = signal('');
  readonly results = signal<LetterParty[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly creating = signal(false);
  readonly newName = signal('');
  readonly newKind = signal<'person' | 'legal'>('legal');
  readonly newNationalId = signal('');
  readonly saving = signal(false);

  private readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(
      debounceTime(300),
      switchMap(q => {
        const company = this.company();
        if (!company || q.trim().length < 2) return of<LetterParty[] | null>([]);
        this.loading.set(true);
        return this.api.parties(company, q).pipe(
          catchError(err => {
            this.error.set(isServerUnreachable(err?.status ?? 0) ? 'اتصال برقرار نیست.' : 'جست‌وجو ناموفق بود.');
            return of(null);
          }),
          map(rows => rows),
        );
      }),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(rows => {
      this.loading.set(false);
      if (rows) {
        this.error.set(null);
        this.results.set(rows);
      }
    });
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.search$.next(value);
  }

  choose(p: LetterParty): void {
    this.picked.emit(p);
    this.query.set('');
    this.results.set([]);
  }

  startCreate(): void {
    this.creating.set(true);
    this.newName.set(this.query().trim());
    this.error.set(null);
  }

  create(): void {
    const company = this.company();
    const name = this.newName().trim();
    if (!company || !name || this.saving()) return;
    this.saving.set(true);
    const nid = this.newNationalId().trim();
    this.api.createParty(company, { name, kind: this.newKind(), ...(nid ? { national_id: nid } : {}) }).subscribe({
      next: party => {
        this.saving.set(false);
        this.creating.set(false);
        this.newNationalId.set('');
        this.choose(party);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(isServerUnreachable(err?.status ?? 0) ? 'اتصال برقرار نیست.' : serverErrorText(err?.error).message);
      },
    });
  }
}
