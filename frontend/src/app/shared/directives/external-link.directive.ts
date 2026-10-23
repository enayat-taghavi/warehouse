import { Directive, ElementRef, inject, input } from '@angular/core';
import { isNativePlatform } from '../../core/platform/platform';
import { openExternal } from '../../core/platform/external-link';

/**
 * دایرکتیو هدایت لینک‌های بیرونی:
 * روی وب: هیچ دخالتی نمی‌کند و مرورگر طبق href و target عمل می‌کند.
 * روی اپلیکیشن بومی (Capacitor): رویداد کلیک پیش‌گیری (preventDefault) شده و
 * آدرس از طریق openExternal (در فاز بعد مرورگر سیستمی) باز می‌شود.
 */
@Directive({
  selector: 'a[appExternalLink]',
  standalone: true,
  host: {
    '(click)': 'onClick($event)',
  },
})
export class ExternalLinkDirective {
  private readonly el = inject(ElementRef<HTMLAnchorElement>);

  readonly appExternalLink = input<string | null | undefined>(undefined);

  onClick(event: MouseEvent): void {
    if (!isNativePlatform()) {
      return;
    }

    event.preventDefault();

    const rawInput = this.appExternalLink();
    const targetUrl =
      (typeof rawInput === 'string' && rawInput.trim() !== '')
        ? rawInput
        : (this.el.nativeElement.getAttribute('href') || this.el.nativeElement.href || '');

    if (targetUrl) {
      openExternal(targetUrl);
    }
  }
}
