/**
 * مدیریت فوکوس مودال‌ها (WCAG 2.4.3)، همان الگوی settings-backup-tab:
 * فوکوس اولیه روی اولین عنصر قابل فوکوس، نگه داشتن Tab درون مودال و بازگرداندن فوکوس به عنصر بازکننده.
 * ظرف مودال با شناسهٔ DOM (id) پیدا می‌شود تا کامپوننت به ViewChild نیاز نداشته باشد.
 */
const FOCUSABLE_SELECTOR =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export class ModalFocus {
  private opener: HTMLElement | null = null;

  /** بلافاصله پس از باز کردن مودال صدا زده شود */
  open(containerId: string): void {
    if (typeof document === 'undefined') return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => {
      document.getElementById(containerId)?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });
  }

  /** پس از بستن مودال صدا زده شود */
  close(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener) {
      setTimeout(() => opener.focus());
    }
  }

  /** برای رویداد keydown سند، وقتی مودال باز است */
  trapTab(event: KeyboardEvent, containerId: string): void {
    if (event.key !== 'Tab' || typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!container || !focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const outside = !container.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }
}
