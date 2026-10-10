import { Directive, ElementRef, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ICONS, IconName } from './icon-registry';
import { resolveSemanticIcon } from './semantic-icons';

/**
 * آیکن مشترک برنامه، روی خود عنصر <svg>:
 *
 *   <svg appIcon="trash-2" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
 *   <svg appIcon="action-create" class="w-4 h-4" ...></svg>
 *   <svg appIcon="status-pending" class="w-4 h-4" ...></svg>
 *
 * همهٔ ویژگی‌های بیرونی svg (اندازه، رنگ، viewBox، stroke) در قالب می‌ماند و فقط
 * محتوای درونی (path و ...) از رجیستری (icon-registry.ts) یا فرهنگ معنایی (semantic-icons.ts)
 * می‌آید. نام‌های با پیشوند action-* و status-* به آیکون متناظرشان نگاشت می‌شوند.
 */
@Directive({
  selector: 'svg[appIcon]',
  standalone: true,
  host: { '[innerHTML]': 'markup()' },
})
export class SvgIconDirective {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly el = inject(ElementRef<SVGElement>, { optional: true });

  /** نام آیکن در رجیستری یا نام معنایی (action-* / status-*)؛ نام‌های ثابت در قالب‌ها با نگهبان ۵۲ بررسی می‌شوند. */
  readonly appIcon = input<IconName | string | null | undefined>();

  protected readonly markup = computed(() => {
    const raw = this.appIcon() ?? this.el?.nativeElement?.getAttribute('appIcon') ?? this.el?.nativeElement?.getAttribute('appicon');
    const resolved = resolveSemanticIcon(raw);
    const inner = resolved ? ((ICONS as Record<string, string>)[resolved] ?? '') : '';
    return this.sanitizer.bypassSecurityTrustHtml(inner);
  });
}
