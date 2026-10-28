import { compareVersions, parseVersion } from './app-version.service';

/**
 * «چه چیزی تازه است» (طرح ۵ اندروید، د۳): برای هر نسخه چند سطر کوتاه فارسی.
 * پنجرهٔ یک‌باره فقط وقتی نشان داده می‌شود که برای APP_VERSION یادداشتی اینجا باشد.
 */
export const RELEASE_NOTES: Record<string, string[]> = {
  '1.0.0': [
    'اولین نسخهٔ سامانهٔ حسابداری روی وب و اندروید.',
    'کار بدون اینترنت: ثبت‌ها در صف می‌مانند و پس از وصل شدن فرستاده می‌شوند.',
    'شمارهٔ نسخه در منوی کاربر دیده می‌شود.',
  ],
};

/** کلید localStorage برای آخرین نسخه‌ای که کاربر دیده است */
export const LAST_SEEN_VERSION_KEY = 'app.lastSeenVersion';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** «1.0.0» → «۱٫۰٫۰» برای نمایش */
export function formatVersionFa(version: string): string {
  return String(version ?? '')
    .replace(/\d/g, (d) => FA_DIGITS[Number(d)])
    .replace(/\./g, '٫');
}

/**
 * تصمیم نمایش پنجره: نصب تازه (کلید خالی یا نادرست) پنجره ندارد و فقط کلید ثبت می‌شود؛
 * ارتقا (نسخهٔ دیده‌شده کمتر از نسخهٔ فعلی) با یادداشت موجود پنجره دارد.
 */
export function releaseNotesToShow(lastSeen: string | null, current: string): string[] | null {
  if (!lastSeen || !parseVersion(lastSeen)) {
    return null;
  }
  if (compareVersions(lastSeen, current) >= 0) {
    return null;
  }
  const notes = RELEASE_NOTES[current];
  return notes && notes.length ? notes : null;
}
