import { Injectable, signal } from '@angular/core';

export interface ToggleSection {
  code: string;
  title_fa: string;
}

/**
 * بخش‌های خاموش (ص۱۲ طرح ۲.۶): فهرست از `/api/public/config/` می‌آید و منو و گارد مسیر آیتم دارای
 * `sectionKey` خاموش را پنهان یا مسدود می‌کنند. پنهان کردن داده‌ای را پاک نمی‌کند.
 * آخرین فهرست در localStorage می‌ماند تا بوت آفلاین هم همان را ببیند.
 */
@Injectable({ providedIn: 'root' })
export class SectionToggleService {
  private static readonly STORAGE_KEY = 'wh_disabled_sections';

  /** کدهای بخش خاموش */
  readonly disabled = signal<string[]>(SectionToggleService.readStored());
  /** بخش‌های اعلام‌شدهٔ ماژول‌ها؛ سرور فقط به مدیر کل می‌فرستد */
  readonly declared = signal<ToggleSection[]>([]);

  private static readStored(): string[] {
    if (typeof window === 'undefined') return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(SectionToggleService.STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
    } catch {
      return [];
    }
  }

  /** به‌روزرسانی از پاسخ public config؛ پاسخ بدون این کلید (سرور قدیمی) چیزی را تغییر نمی‌دهد */
  applyConfig(config: { disabled_sections?: unknown; toggle_sections?: unknown } | null | undefined): void {
    if (!config) return;
    if (Array.isArray(config.disabled_sections)) {
      const codes = config.disabled_sections.filter((c): c is string => typeof c === 'string');
      this.disabled.set(codes);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SectionToggleService.STORAGE_KEY, JSON.stringify(codes));
        } catch {}
      }
    }
    if (Array.isArray(config.toggle_sections)) {
      this.declared.set(
        config.toggle_sections.filter(
          (s): s is ToggleSection => !!s && typeof s.code === 'string' && typeof s.title_fa === 'string'
        )
      );
    }
  }

  /** آیتم بدون sectionKey همیشه روشن است */
  isEnabled(sectionKey: string | null | undefined): boolean {
    return !sectionKey || !this.disabled().includes(sectionKey);
  }
}
