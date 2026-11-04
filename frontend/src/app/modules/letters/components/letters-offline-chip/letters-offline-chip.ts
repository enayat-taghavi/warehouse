import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

/** نشان کوچک «آفلاین» که همهٔ صفحه‌های ماژول نامه‌ها یکسان نشان می‌دهند. */
@Component({
  selector: 'app-letters-offline-chip',
  standalone: true,
  imports: [SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="text-[11px] rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 inline-flex items-center gap-1 shrink-0 self-start" role="status" data-testid="offline-chip">
      <svg appIcon="wifi-off" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
      {{ text() }}
    </span>
  `,
})
export class LettersOfflineChipComponent {
  readonly text = input('آفلاین');
}
