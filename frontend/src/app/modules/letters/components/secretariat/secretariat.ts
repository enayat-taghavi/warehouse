import { Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../shared/components/command-center/command-center.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { FileOutputService } from '../../../../core/platform/file-output';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { LETTER_DOC_TYPE, LETTER_KIND_LABELS, LETTER_STATUS_LABELS, RegisterRow } from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { RegisterIncomingComponent } from '../register-incoming/register-incoming';

export type SecretariatTab = 'register' | 'pending' | 'incoming';

/**
 * دبیرخانه (`/app/letters/secretariat`، ن۱۶): دفتر (همهٔ شماره‌ها با باطل‌شده‌ها و خروجی اکسل)، «منتظر ارسال» و
 * «ثبت وارده». دبیرخانه رویداد زندهٔ نامه‌هایی را که در آن‌ها درگیر نیست نمی‌گیرد (یادداشت ادغام ل-ه):
 * دفتر هنگام فوکوس پنجره و با هر رویداد «سند تغییر کرد» نامه دوباره خوانده می‌شود.
 */
@Component({
  selector: 'app-letter-secretariat',
  standalone: true,
  imports: [
    RouterLink, ActionButtonComponent, CommandCenterComponent, LoadingSkeletonComponent, StatusBadgeComponent,
    TabBarComponent, PersianDatePipe, RegisterIncomingComponent, SvgIconDirective,
  ],
  templateUrl: './secretariat.html',
})
export class SecretariatPage implements OnInit {
  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);
  private readonly ws = inject(WebSocketService);
  private readonly companies = inject(ActiveCompanyService);
  private readonly files = inject(FileOutputService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs: TabDef[] = [
    { id: 'register', label: 'دفتر', icon: 'list' },
    { id: 'pending', label: 'منتظر ارسال', shortLabel: 'ارسال', icon: 'send' },
    { id: 'incoming', label: 'ثبت وارده', shortLabel: 'وارده', icon: 'file-plus' },
  ];
  readonly kindLabels = LETTER_KIND_LABELS;
  readonly statusLabels = LETTER_STATUS_LABELS;
  readonly online = this.offline.online;
  readonly company = computed(() => this.companies.activeCompanySignal()?.id ?? null);
  readonly tab = signal<SecretariatTab>('register');
  readonly rows = signal<RegisterRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<'offline' | 'forbidden' | 'error' | 'no-company' | null>(null);
  readonly exporting = signal(false);
  readonly exportError = signal('');
  readonly visibleRows = computed(() => this.tab() === 'pending'
    ? this.rows().filter(r => r.kind === 'outgoing' && r.status === 'registered')
    : this.rows());
  private seq = 0;

  private autoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // شرکت فعال (در شروع خالی یا بعداً عوض‌شده) دفتر را دوباره می‌خواند
    effect(() => {
      this.company();
      untracked(() => this.reload());
    });
    this.destroyRef.onDestroy(() => { if (this.autoTimer) clearTimeout(this.autoTimer); });
  }

  ngOnInit(): void {
    this.ws.documentChanges$([LETTER_DOC_TYPE]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.autoReload());
    this.ws.liveRefresh$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.autoReload());
  }

  @HostListener('window:focus')
  onFocus(): void {
    this.autoReload();
  }

  /** بازخوانی خودکار: ۵۰۰ میلی‌ثانیه تجمیع؛ هنگام «ثبت وارده» انجام نمی‌شود */
  private autoReload(): void {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (this.tab() !== 'incoming') this.reload(true);
    }, 500);
  }

  onTab(id: string): void {
    this.tab.set(id as SecretariatTab);
  }

  reload(silent = false): void {
    const company = this.company();
    if (!company) {
      this.error.set('no-company');
      this.loading.set(false);
      return;
    }
    const seq = ++this.seq;
    if (!silent) this.loading.set(true);
    this.api.register(company).subscribe({
      next: rows => {
        if (seq !== this.seq) return;
        this.rows.set(rows || []);
        this.error.set(null);
        this.loading.set(false);
      },
      error: err => {
        if (seq !== this.seq) return;
        const status = err?.status ?? 0;
        // بازخوانی بی‌صدا در قطعی، دفتر نشان‌داده‌شده را پاک نمی‌کند
        if (silent && this.rows().length && isServerUnreachable(status)) return;
        this.error.set(isServerUnreachable(status) ? 'offline' : status === 403 ? 'forbidden' : 'error');
        this.loading.set(false);
      },
    });
  }

  exportExcel(): void {
    const company = this.company();
    if (!company || this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set('');
    this.api.registerExport(company).subscribe({
      next: blob => {
        this.exporting.set(false);
        void this.files.saveBlob(blob, 'letters_register.xlsx');
      },
      error: err => {
        this.exporting.set(false);
        this.exportError.set(isServerUnreachable(err?.status ?? 0) ? 'اتصال برقرار نیست؛ خروجی ساخته نشد.' : 'ساخت خروجی ناموفق بود.');
      },
    });
  }

  onCreated(id: number): void {
    void this.router.navigate(['/app/letters', id]);
  }
}
