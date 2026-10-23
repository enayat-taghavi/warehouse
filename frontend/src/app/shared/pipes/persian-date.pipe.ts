import { Pipe, PipeTransform } from '@angular/core';

const FORMATTERS: Record<string, Intl.DateTimeFormat> = {
  'short': new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
  'short-time': new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  'long': new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' }),
  'medium': new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
};

const VALUE_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

/**
 * تبدیل تاریخ ISO به تاریخ شمسی خوانا (فوق سریع با کش حافظه)
 *
 * استفاده:
 *   {{ record.created_at | persianDate }}
 *   {{ record.created_at | persianDate:'short' }}
 *   {{ record.created_at | persianDate:'short-time' }}
 *   {{ record.created_at | persianDate:'long' }}
 */
@Pipe({
  name: 'persianDate',
  standalone: true,
  pure: true
})
export class PersianDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, format: 'short' | 'medium' | 'long' | 'short-time' = 'medium'): string {
    if (!value) return '—';

    const cacheKey = typeof value === 'string' ? `${value}_${format}` : null;
    if (cacheKey && VALUE_CACHE.has(cacheKey)) {
      return VALUE_CACHE.get(cacheKey)!;
    }

    try {
      const date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) return String(value);

      const formatter = FORMATTERS[format] || FORMATTERS['medium'];
      const result = formatter.format(date);

      if (cacheKey) {
        if (VALUE_CACHE.size >= MAX_CACHE_SIZE) {
          VALUE_CACHE.clear();
        }
        VALUE_CACHE.set(cacheKey, result);
      }

      return result;
    } catch {
      return String(value);
    }
  }
}
