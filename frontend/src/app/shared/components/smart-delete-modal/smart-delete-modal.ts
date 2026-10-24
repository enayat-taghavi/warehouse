import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SKIP_OFFLINE } from '../../../core/interceptors/offline.interceptor';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ActionButtonComponent } from '../action-button/action-button.component';

/** ردیف اثر حذف: نام مدل و شمار رکوردها (پاسخ delete_impact در DeleteImpactMixin) */
export interface DeleteImpactRow {
  model_name: string;
  count: number;
}

let nextSmartDeleteId = 0;

@Component({
  selector: 'app-smart-delete-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './smart-delete-modal.html',
  styleUrl: './smart-delete-modal.css'
})
export class SmartDeleteModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() title: string = 'حذف موجودیت';
  @Input() entityName: string = '';
  @Input() deleteImpactUrl: string = '';
  @Input() isSubmitting: boolean = false;
  @Input() errorMessage: string = '';
  /** اگر true باشد، تا اثر حذف با موفقیت دریافت نشود حذف ممکن نیست (برای حذف‌های آبشاری) */
  @Input() requireImpact = false;
  /** برچسب کار جایگزین (مثلاً «غیرفعال کردن به‌جای حذف»)؛ خالی یعنی نمایش داده نشود */
  @Input() alternativeLabel = '';
  /** توضیح کوتاه کار جایگزین */
  @Input() alternativeHint = '';

  @Output() hardDelete = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() alternative = new EventEmitter<void>();

  @ViewChild('dialogPanel') private dialogPanel?: ElementRef<HTMLElement>;
  @ViewChild('confirmInput') private confirmInput?: ElementRef<HTMLInputElement>;

  readonly titleId = `smart-delete-title-${nextSmartDeleteId++}`;

  isLoadingImpact = false;
  impactData: DeleteImpactRow[] = [];
  totalAffected = 0;
  impactLoaded = false;
  impactError = '';
  /** سرور اجازهٔ دیدن اثر حذف را نداد (۴۰۳)؛ حذف مسدود است */
  impactForbidden = false;
  /** حذف به‌خاطر قاعدهٔ کسب‌وکار یا رابطهٔ PROTECT ممکن نیست */
  blocked = false;
  blockers: string[] = [];
  protectedRows: DeleteImpactRow[] = [];

  countdown = 3;
  timerInterval: any;
  confirmationText = '';

  private returnFocusTo: HTMLElement | null = null;
  private static readonly FA_NUMBER = new Intl.NumberFormat('fa-IR');

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    this.returnFocusTo = active instanceof HTMLElement ? active : null;
    this.startCountdown();
    if (this.deleteImpactUrl) {
      this.fetchImpact();
    }
  }

  ngAfterViewInit() {
    this.focusStart();
  }

  /** کانون روی فیلد تأیید؛ اگر حذف مسدود است (فیلد غیرفعال) روی خود پنجره */
  private focusStart(): void {
    const input = this.confirmInput?.nativeElement;
    if (input && !input.disabled && !this.blocked) {
      input.focus({ preventScroll: true });
    } else {
      this.dialogPanel?.nativeElement.focus({ preventScroll: true });
    }
  }

  /** «تلاش دوباره»: دکمه با پاک شدن خطا از DOM می‌رود، پس کانون به پنجره برمی‌گردد */
  retryImpact(): void {
    this.dialogPanel?.nativeElement.focus({ preventScroll: true });
    this.fetchImpact();
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.returnFocusTo?.isConnected) {
      this.returnFocusTo.focus({ preventScroll: true });
    }
  }

  fetchImpact() {
    this.isLoadingImpact = true;
    this.impactError = '';
    this.impactForbidden = false;
    this.impactLoaded = false;
    // اثر حذف همیشه تازه از سرور خوانده می‌شود: نه از کش آفلاین (SWR) و نه در حالت آفلاین
    this.http.get<any>(this.deleteImpactUrl, { context: new HttpContext().set(SKIP_OFFLINE, true) }).subscribe({
      next: (res) => {
        const wasBlocked = this.blocked;
        this.impactData = res?.impact || [];
        this.totalAffected = res?.total_affected || 0;
        this.blockers = Array.isArray(res?.blockers) ? res.blockers : [];
        this.protectedRows = Array.isArray(res?.protected) ? res.protected : [];
        this.blocked = Boolean(res?.blocked) || this.blockers.length > 0 || this.protectedRows.length > 0;
        this.impactLoaded = true;
        this.isLoadingImpact = false;
        this.cdr.detectChanges();
        // فیلد تأیید در حالت مسدود غیرفعال می‌شود؛ کانون نباید به body بیفتد
        const panel = this.dialogPanel?.nativeElement;
        const active = document.activeElement;
        if (panel && this.blocked && !wasBlocked && (!active || active === document.body || panel.contains(active))) {
          panel.focus({ preventScroll: true });
        }
      },
      error: (err) => {
        this.isLoadingImpact = false;
        this.impactForbidden = err?.status === 403;
        this.impactError = (typeof err?.error?.detail === 'string' && err.error.detail)
          || (typeof err?.error?.error === 'string' && err.error.error)
          || (this.impactForbidden ? 'اجازهٔ دیدن اثر حذف این مورد را ندارید.' : 'اثر حذف محاسبه نشد.');
        this.cdr.detectChanges();
      }
    });
  }

  startCountdown() {
    this.timerInterval = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.timerInterval);
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  /** اثر حذف اجازهٔ حذف می‌دهد: مسدود نیست، و اگر لازم است با موفقیت دریافت شده است */
  get impactAllowsDelete(): boolean {
    if (this.blocked || this.impactForbidden) return false;
    if (this.requireImpact) return this.impactLoaded && !this.isLoadingImpact;
    return true;
  }

  get isHardDeleteEnabled(): boolean {
    return this.impactAllowsDelete && this.countdown <= 0 && this.confirmationText.trim() === 'حذف';
  }

  fa(n: number): string {
    return SmartDeleteModalComponent.FA_NUMBER.format(n ?? 0);
  }

  onHardDelete() {
    if (this.isHardDeleteEnabled) {
      this.hardDelete.emit();
    }
  }

  onCancel() {
    this.cancel.emit();
  }

  onAlternative() {
    if (!this.isSubmitting) {
      this.alternative.emit();
    }
  }

  /** تله‌کانون: Tab و Shift+Tab درون پنجره می‌چرخند */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.dialogPanel) return;
    const panel = this.dialogPanel.nativeElement;
    const all = Array.from(
      panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    );
    const visible = all.filter(el => el.getClientRects().length > 0);
    const focusables = visible.length > 0 ? visible : all;
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && panel.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape() {
    if (!this.isSubmitting) {
      this.onCancel();
    }
  }

  @HostListener('document:keydown.enter')
  handleEnter() {
    if (this.isSubmitting) return;
    if (this.isHardDeleteEnabled) {
      this.onHardDelete();
    }
  }
}
