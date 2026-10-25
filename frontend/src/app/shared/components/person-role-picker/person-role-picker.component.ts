import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Subject, debounceTime, of, switchMap, catchError, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export type PersonRoleValue = { type: 'user' | 'role'; id: number | string; label: string };

interface PickerResult {
  items: PersonRoleValue[];
  failed: boolean;
}

let nextPickerId = 0;

const unwrap = (res: any): any[] => (Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : []);

/** انتخاب‌گر شخص/نقش با جست‌وجو؛ مقدار: آرایه‌ای از PersonRoleValue */
@Component({
  selector: 'app-person-role-picker',
  standalone: true,
  imports: [SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PersonRolePickerComponent), multi: true },
  ],
  template: `
    <div class="relative min-w-0" dir="rtl">
      <div
        class="flex flex-wrap items-center gap-1.5 min-w-0 bg-surface border border-line rounded-xl px-2 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500"
        [class.opacity-60]="disabled()"
      >
        @for (v of value(); track v.type + ':' + v.id) {
          <span class="inline-flex items-center gap-1 max-w-full min-w-0 bg-surface-muted border border-line rounded-lg ps-2 pe-1 text-xs font-bold text-fg">
            <svg [appIcon]="v.type === 'user' ? 'user' : 'users'" class="w-3.5 h-3.5 shrink-0 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
            <span class="truncate min-w-0">{{ v.label }}</span>
            <button
              type="button"
              class="inline-flex items-center justify-center w-10 h-10 -my-2 shrink-0 rounded-lg text-fg-muted hover:text-rose-600 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              [attr.aria-label]="'حذف ' + v.label"
              [attr.title]="'حذف ' + v.label"
              [disabled]="disabled()"
              (click)="remove(v)"
            >
              <svg appIcon="x" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
            </button>
          </span>
        }
        <input
          type="text"
          role="combobox"
          autocomplete="off"
          class="flex-1 min-w-[8rem] min-h-[40px] bg-transparent outline-none text-sm text-fg placeholder:text-fg-subtle"
          [id]="inputId"
          [placeholder]="placeholder()"
          [attr.aria-label]="placeholder()"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeId()"
          aria-autocomplete="list"
          [disabled]="disabled() || maxReached()"
          [value]="query()"
          (input)="onInput($any($event.target).value)"
          (focus)="openList()"
          (keydown)="onKeydown($event)"
          (blur)="onBlur()"
        />
      </div>

      @if (maxReached()) {
        <p class="text-[11px] text-fg-muted mt-1">حداکثر {{ maxFa() }} مورد</p>
      }

      @if (open() && !maxReached()) {
        <ul
          [id]="listId"
          role="listbox"
          class="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-surface border border-line rounded-xl shadow-lg py-1"
        >
          @if (!online()) {
            <li class="px-3 py-2 text-xs text-fg-muted" role="presentation">در حالت آفلاین جست‌وجو ممکن نیست</li>
          } @else if (loading()) {
            <li class="px-3 py-2 text-xs text-fg-muted" role="presentation">در حال جست‌وجو…</li>
          } @else if (failed()) {
            <li class="px-3 py-2 text-xs text-rose-600" role="presentation">جست‌وجو ناموفق بود</li>
          } @else if (options().length === 0) {
            <li class="px-3 py-2 text-xs text-fg-muted" role="presentation">موردی پیدا نشد</li>
          } @else {
            @for (o of options(); track o.type + ':' + o.id; let i = $index) {
              <li
                role="option"
                [id]="optionId(i)"
                [attr.aria-selected]="i === activeIndex()"
                class="flex items-center gap-2 px-3 min-h-[40px] cursor-pointer text-sm text-fg"
                [class.bg-surface-muted]="i === activeIndex()"
                (mousedown)="$event.preventDefault(); add(o)"
              >
                <svg [appIcon]="o.type === 'user' ? 'user' : 'users'" class="w-4 h-4 shrink-0 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
                <span class="truncate min-w-0 flex-1">{{ o.label }}</span>
                <span class="text-[11px] text-fg-subtle shrink-0">{{ o.type === 'user' ? 'شخص' : 'نقش' }}</span>
              </li>
            }
          }
        </ul>
      }
    </div>
  `,
})
export class PersonRolePickerComponent implements ControlValueAccessor {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly network = NetworkStatusService.getInstance();

  readonly allowUsers = input(true);
  readonly allowRoles = input(true);
  readonly max = input<number | null>(null);
  readonly placeholder = input('جست‌وجوی شخص یا نقش');

  readonly inputId = `prp-input-${nextPickerId}`;
  readonly listId = `prp-list-${nextPickerId++}`;

  readonly value = signal<PersonRoleValue[]>([]);
  readonly query = signal('');
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly disabled = signal(false);
  readonly online = signal(this.network.isBrowserOnline && this.network.state !== 'offline');
  readonly activeIndex = signal(-1);
  private readonly results = signal<PersonRoleValue[]>([]);
  private rolesCache: PersonRoleValue[] | null = null;
  private readonly search$ = new Subject<string>();

  readonly options = computed(() => {
    const picked = new Set(this.value().map((v) => v.type + ':' + v.id));
    return this.results().filter((r) => !picked.has(r.type + ':' + r.id));
  });
  readonly maxReached = computed(() => {
    const m = this.max();
    return m !== null && m > 0 && this.value().length >= m;
  });
  readonly maxFa = computed(() => new Intl.NumberFormat('fa-IR').format(this.max() ?? 0));
  readonly activeId = computed(() => {
    const i = this.activeIndex();
    return this.open() && i >= 0 && i < this.options().length ? this.optionId(i) : null;
  });

  private onChange: (v: PersonRoleValue[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    this.network.state$.pipe(takeUntilDestroyed()).subscribe((s) => this.online.set(s !== 'offline'));
    this.search$
      .pipe(
        debounceTime(300),
        switchMap((q) => {
          if (!this.online()) {
            return of<PickerResult>({ items: [], failed: false });
          }
          this.loading.set(true);
          this.failed.set(false);
          return this.fetch(q);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.results.set(r.items);
        this.failed.set(r.failed);
        this.loading.set(false);
        this.activeIndex.set(r.items.length ? 0 : -1);
      });
  }

  optionId(i: number): string {
    return `${this.listId}-opt-${i}`;
  }

  private fetch(q: string) {
    const term = q.trim();
    const skip = { context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true) };
    const users$ = this.allowUsers()
      ? this.http
          .get<any>(`${environment.apiUrl}/auth/users/`, { ...skip, params: new HttpParams().set('search', term) })
          .pipe(
            map((res) =>
              unwrap(res).map(
                (u): PersonRoleValue => ({
                  type: 'user',
                  id: u.id,
                  label: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.username || String(u.id),
                }),
              ),
            ),
          )
      : of<PersonRoleValue[]>([]);
    const roles$ = this.allowRoles()
      ? this.rolesCache
        ? of(this.rolesCache)
        : this.http.get<any>(`${environment.apiUrl}/auth/roles/`, skip).pipe(
            map((res) => {
              const list = unwrap(res).map(
                (r): PersonRoleValue => ({ type: 'role', id: r.id, label: r.title || r.name || String(r.id) }),
              );
              this.rolesCache = list;
              return list;
            }),
          )
      : of<PersonRoleValue[]>([]);

    return users$.pipe(
      switchMap((users) =>
        roles$.pipe(
          map((roles): PickerResult => {
            const rolesF = term ? roles.filter((r) => r.label.includes(term)) : roles;
            return { items: [...users.slice(0, 20), ...rolesF.slice(0, 20)], failed: false };
          }),
        ),
      ),
      catchError(() => of<PickerResult>({ items: [], failed: true })),
    );
  }

  onInput(v: string): void {
    this.query.set(v);
    this.open.set(true);
    this.search$.next(v);
  }

  openList(): void {
    if (this.disabled() || this.maxReached()) return;
    this.open.set(true);
    this.search$.next(this.query());
  }

  onBlur(): void {
    this.open.set(false);
    this.onTouched();
  }

  add(o: PersonRoleValue): void {
    if (this.disabled() || this.maxReached()) return;
    this.commit([...this.value(), o]);
    this.query.set('');
    this.search$.next('');
    this.activeIndex.set(0);
  }

  remove(v: PersonRoleValue): void {
    if (this.disabled()) return;
    this.commit(this.value().filter((x) => !(x.type === v.type && x.id === v.id)));
  }

  private commit(next: PersonRoleValue[]): void {
    this.value.set(next);
    this.onChange(next);
  }

  onKeydown(e: KeyboardEvent): void {
    const n = this.options().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.open()) this.openList();
        if (n) this.activeIndex.set((this.activeIndex() + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) this.activeIndex.set((this.activeIndex() - 1 + n) % n);
        break;
      case 'Enter': {
        const o = this.options()[this.activeIndex()];
        if (this.open() && o) {
          e.preventDefault();
          this.add(o);
        }
        break;
      }
      case 'Backspace':
        if (!this.query() && this.value().length) {
          this.remove(this.value()[this.value().length - 1]);
        }
        break;
      case 'Escape':
        if (this.open()) {
          e.preventDefault();
          this.open.set(false);
        }
        break;
    }
  }

  // ─── ControlValueAccessor ───
  writeValue(v: PersonRoleValue[] | null): void {
    this.value.set(Array.isArray(v) ? v : []);
  }
  registerOnChange(fn: (v: PersonRoleValue[]) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) this.open.set(false);
  }
}
