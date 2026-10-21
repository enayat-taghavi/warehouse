import { Injectable, signal } from '@angular/core';
import { Company } from '../models/company.model';

/**
 * context مشترک استودیوی شرکت: کامپوننت‌های مشارکتی ماژول‌ها (تب‌ها و بخش‌ها) فقط از راه همین سرویس
 * با هستهٔ استودیو حرف می‌زنند. در `providers` استودیو فراهم می‌شود، پس هر استودیو نمونهٔ خودش را دارد.
 */
@Injectable()
export class CompanyStudioContextService {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  readonly companyId = signal<number | null>(null);
  readonly company = signal<Company | null>(null);

  private readonly counts = signal<Record<string, number>>({});
  private readonly errors = signal<Record<string, boolean>>({});
  private readonly dirtyChecks = new Map<string, () => boolean>();

  /** شمارندهٔ کنار عنوان تب */
  setCount(tabId: string, n: number): void {
    this.counts.update(c => ({ ...c, [tabId]: n }));
  }

  count(tabId: string): number | undefined {
    return this.counts()[tabId] || undefined;
  }

  /** نشان خطای تب (مثلاً شکست دریافت داده یا خطای اعتبارسنجی) */
  reportError(tabId: string, hasError = true): void {
    this.errors.update(e => ({ ...e, [tabId]: hasError }));
  }

  hasError(tabId: string): boolean {
    return this.errors()[tabId] === true;
  }

  /**
   * فرم ذخیره‌نشدهٔ یک کامپوننت مشارکتی در هشدار خروج (ت۳) حساب می‌شود.
   * تابع برگشتی ثبت را لغو می‌کند (در ngOnDestroy کامپوننت صدا زده شود).
   */
  registerDirty(key: string, isDirty: () => boolean): () => void {
    this.dirtyChecks.set(key, isDirty);
    return () => {
      if (this.dirtyChecks.get(key) === isDirty) this.dirtyChecks.delete(key);
    };
  }

  isDirty(): boolean {
    for (const check of this.dirtyChecks.values()) {
      if (check()) return true;
    }
    return false;
  }

  /** شرکت جاری استودیو؛ با تغییر شناسه شمارنده‌ها و خطاهای شرکت پیشین پاک می‌شوند */
  setCompany(company: Company | null): void {
    const id = company?.id && company.id > 0 ? company.id : null;
    if (id !== this.companyId()) {
      this.counts.set({});
      this.errors.set({});
    }
    this.companyId.set(id);
    this.company.set(company);
  }
}
