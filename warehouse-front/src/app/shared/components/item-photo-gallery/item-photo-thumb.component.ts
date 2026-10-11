import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export type PhotoThumbSize = 'xs' | 'sm' | 'md' | 'lg';
export type PhotoThumbAccent = 'indigo' | 'blue';

/**
 * کلاس‌ها به‌صورت رشتهٔ کامل و ثابت نوشته شده‌اند، نه ساخته‌شده با درج متغیر
 * (`hover:border-${accent}-500`): Tailwind فایل‌های منبع را *متنی* اسکن می‌کند و
 * کلاسِ ساخته‌شده در زمان اجرا را هرگز در CSS خروجی نمی‌گذارد.
 */
const SIZE_CLASSES: Record<PhotoThumbSize, string> = {
  xs: 'w-8 h-8 rounded-lg shadow-2xs hover:scale-110',
  sm: 'w-10 h-10 rounded-xl shadow-xs hover:scale-105',
  md: 'w-11 h-11 rounded-xl shadow-xs hover:scale-105',
  lg: 'w-12 h-12 rounded-2xl shadow-sm hover:scale-105',
};

const ICON_SIZE_CLASSES: Record<PhotoThumbSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-base',
};

const BADGE_CLASSES: Record<PhotoThumbSize, string> = {
  xs: 'text-[7px] px-0.5 rounded-tl-sm',
  sm: 'text-[8px] px-1 rounded-tl-md',
  md: 'text-[8px] px-1 rounded-tl-md',
  lg: 'text-[9px] px-1.5 py-0.5 rounded-tl-lg',
};

const ACCENT_BORDER_CLASSES: Record<PhotoThumbAccent, string> = {
  indigo: 'hover:border-indigo-500',
  blue: 'hover:border-blue-500',
};

const ACCENT_ICON_CLASSES: Record<PhotoThumbAccent, string> = {
  indigo: 'group-hover:text-indigo-600',
  blue: 'group-hover:text-blue-600',
};

const ACCENT_BADGE_CLASSES: Record<PhotoThumbAccent, string> = {
  indigo: 'bg-indigo-600',
  blue: 'bg-blue-600',
};

/**
 * بندانگشتی تصویر کالا در لیست‌ها
 *
 * پیش از این همین ۲۴ خط HTML در ۱۴ نقطه از شش قالب کپی شده بود — با تفاوت‌های
 * ریز و ناخواسته در متن راهنما و رنگ. مقدارهای شمارنده و آدرس تصویر عمداً
 * ورودی‌های صریح‌اند (نه خودِ ردیف) تا این کامپوننت لازم نباشد شکل ردیف‌های
 * متفاوت هر صفحه را بشناسد.
 */
@Component({
  selector: 'app-item-photo-thumb',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="containerClass"
      [title]="hintText"
      [attr.aria-label]="hintText"
      role="button"
      tabindex="0"
      (click)="onClick($event)"
      (keydown.enter)="onClick($any($event))"
      (keydown.space)="$event.preventDefault(); onClick($any($event))"
    >
      <img
        *ngIf="thumbUrl"
        [src]="thumbUrl"
        alt="تصویر کالا"
        class="w-full h-full object-cover"
        loading="lazy"
      />
      <div
        *ngIf="!thumbUrl"
        [class]="placeholderClass"
      >
        <svg class="shrink-0" [ngClass]="size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="camera"></svg>
        <span *ngIf="size !== 'xs'" class="text-[8px] font-bold mt-0.5 leading-none">+</span>
      </div>
      <span *ngIf="photoCount" [class]="badgeClass">{{ photoCount }}</span>
    </div>
  `,
})
export class ItemPhotoThumbComponent {
  /** تعداد عکس‌های ثبت‌شدهٔ کالا روی سرور */
  @Input() photoCount: number | null | undefined = 0;

  /** آدرس بندانگشتی عکس شاخص؛ خالی یعنی آیکون دوربین نشان داده شود */
  @Input() thumbUrl: string | null | undefined = null;

  @Input() size: PhotoThumbSize = 'sm';
  @Input() accent: PhotoThumbAccent = 'indigo';

  /** رنگ کادر و پس‌زمینه در پنل‌های روشن با زمینهٔ سفید کمی متفاوت است */
  @Input() light = false;

  @Output() openRequested = new EventEmitter<MouseEvent>();

  get containerClass(): string {
    const frame = this.light
      ? 'border-indigo-200 bg-white'
      : 'border-slate-200 bg-slate-100';
    return [
      'relative overflow-hidden cursor-pointer border flex items-center justify-center tap-target',
      'shrink-0 transition-all active:scale-95 group',
      frame,
      SIZE_CLASSES[this.size],
      ACCENT_BORDER_CLASSES[this.accent],
    ].join(' ');
  }

  get placeholderClass(): string {
    return [
      'flex flex-col items-center justify-center text-slate-400 transition-colors',
      ACCENT_ICON_CLASSES[this.accent],
    ].join(' ');
  }

  get iconSizeClass(): string {
    return ICON_SIZE_CLASSES[this.size];
  }

  get badgeClass(): string {
    return [
      'absolute bottom-0 right-0 text-white font-black shadow-xs leading-tight',
      BADGE_CLASSES[this.size],
      ACCENT_BADGE_CLASSES[this.accent],
    ].join(' ');
  }

  get hintText(): string {
    return this.photoCount
      ? `${this.photoCount} تصویر ثبت شده — کلیک برای مشاهدهٔ آلبوم`
      : 'عکاسی یا انتخاب تصویر برای این کالا';
  }

  /**
   * جلوگیری از رسیدن کلیک به ردیف
   *
   * ردیف‌های لیست خودشان کلیک‌پذیرند (باز کردن جزئیات تسک)؛ بدون این، هر بار
   * دیدن عکس، پنجرهٔ جزئیات را هم باز می‌کرد.
   */
  onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.openRequested.emit(event);
  }
}
