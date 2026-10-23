import {
  Directive,
  ElementRef,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  NgZone,
  inject
} from '@angular/core';

/**
 * تشخیص کلیک بیرون از المان — برای بستن dropdown و menu
 *
 * استفاده:
 *   <div appClickOutside (clickedOutside)="closeMenu()">
 *     ... dropdown content ...
 *   </div>
 */
@Directive({
  selector: '[appClickOutside]',
  standalone: true,
})
export class ClickOutsideDirective implements OnInit, OnDestroy {
  @Output() clickedOutside = new EventEmitter<void>();

  private listener!: (event: Event) => void;
  private el = inject(ElementRef);
  private ngZone = inject(NgZone);

  constructor() {}

  ngOnInit(): void {
    // ثبت listener خارج از zone برای جلوگیری از change detection اضافی
    this.ngZone.runOutsideAngular(() => {
      this.listener = (event: Event) => {
        const target = event.target as HTMLElement;
        if (target && !this.el.nativeElement.contains(target)) {
          this.ngZone.run(() => this.clickedOutside.emit());
        }
      };
      // با یک delay کوچک ثبت می‌شود تا کلیک فعلی trigger نشود
      setTimeout(() => {
        document.addEventListener('click', this.listener, true);
      }, 0);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.listener, true);
  }
}
