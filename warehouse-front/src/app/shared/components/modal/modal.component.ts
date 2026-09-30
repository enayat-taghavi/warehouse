import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

/**
 * مودال عمومی — overlay + animation + close on escape/backdrop
 *
 * استفاده:
 *   <app-modal [isOpen]="showModal" (closed)="showModal = false" title="عنوان">
 *     <p>محتوای مودال</p>
 *   </app-modal>
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-24"
        role="dialog"
        aria-modal="true"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          (click)="onBackdropClick()"
        ></div>

        <!-- Modal Content -->
        <div
          class="modal-panel relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col"
          [ngClass]="sizeClass"
          [style.max-height]="'90vh'"
        >
          <!-- Header -->
          @if (title) {
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 class="text-sm font-black text-slate-800">{{ title }}</h2>
              <button
                (click)="close()"
                class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="بستن"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
              </button>
            </div>
          }

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-6 py-5">
            <ng-content></ng-content>
          </div>

          <!-- Footer (optional via projection) -->
          <ng-content select="[modal-footer]"></ng-content>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-panel {
      animation: modalIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95) translateY(8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `],
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' | 'full' = 'md';
  @Input() closeOnBackdrop = true;
  @Output() closed = new EventEmitter<void>();

  get sizeClass(): string {
    const sizes: Record<string, string> = {
      sm: 'max-w-sm',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
      full: 'max-w-6xl',
    };
    return sizes[this.size] || sizes['md'];
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) this.close();
  }

  close(): void {
    this.closed.emit();
  }
}
