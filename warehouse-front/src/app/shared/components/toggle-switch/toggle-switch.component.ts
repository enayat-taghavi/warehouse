import { Component, EventEmitter, Input, Output, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button 
      type="button" 
      role="switch" 
      [attr.aria-checked]="checked"
      [attr.aria-label]="label || 'سوئیچ تغییر وضعیت'"
      [title]="title || label || 'سوئیچ تغییر وضعیت'"
      (click)="toggle($event)"
      class="toggle-switch-btn tap-target"
      [class.checked]="checked">
      <span class="toggle-slider"></span>
    </button>
  `,
  styles: [`
    .toggle-switch-btn {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      padding: 0;
      background-color: transparent;
      border: none;
      outline: none;
      cursor: pointer;
    }
    .toggle-slider {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #cbd5e1;
      transition: .3s;
      border-radius: 12px;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      right: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    .toggle-switch-btn.checked .toggle-slider {
      background-color: #4f46e5;
    }
    .toggle-switch-btn.checked .toggle-slider:before {
      right: calc(100% - 21px);
    }
    .toggle-switch-btn:focus-visible .toggle-slider {
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
    }
  `]
})
export class ToggleSwitchComponent {
  @Input() checked: boolean = false;
  @Input() label?: string;
  @Input() title?: string;
  @Output() checkedChange = new EventEmitter<boolean>();

  toggle(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.checked = !this.checked;
    this.checkedChange.emit(this.checked);
  }

  @HostListener('keydown.space', ['$event'])
  @HostListener('keydown.enter', ['$event'])
  onKeydown(event: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.toggle(event);
  }
}
