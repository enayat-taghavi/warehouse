import { InjectionToken } from '@angular/core';

export interface OverflowMenuContext {
  close(): void;
}

/**
 * توکن تزریق وابستگی برای آگاهی دکمه‌های action-button از قرارگیری درون منوی پاپ‌اوور «بیشتر».
 * دکمه‌ها درون پاپ‌اوور همیشه با عنوان نمایش داده می‌شوند و با کلیک روی آنها منو بسته می‌شود.
 */
export const OVERFLOW_MENU_CONTEXT = new InjectionToken<OverflowMenuContext>('OVERFLOW_MENU_CONTEXT');
