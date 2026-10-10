import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { OVERFLOW_MENU_CONTEXT, OverflowMenuContext } from './overflow-menu.token';

let nextMenuId = 0;

/**
 * منوی «بیشتر» واکنش‌گرا برای تجمیع گزینه‌های اضافی در موبایل.
 * از ۶۴۰px به بالا گزینه‌ها را به‌صورت ردیفی (display: contents) نشان می‌دهد.
 * در موبایل (زیر ۶۴۰px) دکمه appAction="more" و پاپ‌اوور عمودی را فعال می‌کند.
 */
@Component({
  selector: 'app-overflow-menu',
  standalone: true,
  imports: [CommonModule, ActionButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: OVERFLOW_MENU_CONTEXT,
      useExisting: OverflowMenuComponent,
    },
  ],
  template: `
    <!-- دکمه سه‌نقطه در موبایل -->
    <button
      #triggerButton
      type="button"
      appAction="more"
      [autoClose]="false"
      class="sm:hidden"
      [attr.aria-expanded]="isOpen() ? 'true' : 'false'"
      [attr.aria-controls]="menuId"
      (click)="toggleMenu()"
    ></button>

    @if (isOpen()) {
      <!-- پس‌زمینه شفاف جهت بستن با لمس/کلیک بیرون در موبایل -->
      <div
        class="fixed inset-0 z-40 sm:hidden"
        (click)="closeMenu()"
      ></div>
    }

    <!-- ظرف گزینه‌ها: در دسکتاپ contents و در موبایل پاپ‌اوور -->
    <div
      #menuContainer
      [id]="menuId"
      [class]="isOpen()
        ? 'absolute start-auto end-0 top-full mt-1.5 z-50 min-w-[11rem] bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 flex flex-col gap-1 sm:contents'
        : 'hidden sm:contents'"
    >
      <ng-content></ng-content>
    </div>
  `,
  host: {
    class: 'relative sm:contents',
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class OverflowMenuComponent implements OverflowMenuContext {
  /** الگوی disclosure: گزینه‌ها دکمه‌های عادی‌اند، نه menuitem؛ پس role="menu" نمی‌گیرد. */
  readonly menuId = `overflow-menu-${nextMenuId++}`;
  readonly isOpen = signal<boolean>(false);

  @ViewChild('triggerButton', { read: ElementRef })
  private triggerButton?: ElementRef<HTMLButtonElement>;

  toggleMenu(): void {
    if (this.isOpen()) {
      this.closeMenu();
    } else {
      this.isOpen.set(true);
    }
  }

  close(): void {
    this.closeMenu();
  }

  closeMenu(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.triggerButton?.nativeElement.focus();
    }
  }

  onEscape(event: Event): void {
    if (this.isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
    }
  }
}
