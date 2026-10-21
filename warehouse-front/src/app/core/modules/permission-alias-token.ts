/**
 * توکن alias مجوز (گام ۸). فایل خالص و بی ایمپورت رجیستری است تا فایل‌هایی که زود بارگذاری می‌شوند
 * (مثل route-access ماژول‌ها) بتوانند ایمپورتش کنند.
 * ماژول صاحب مجوز آن را در extension `permissionAliases` به یک «توانایی» نام‌دار می‌دهد؛
 * ماژول دیگر فقط `permissionAlias('<توانایی>')` را در فهرست مجوزهایش می‌گذارد.
 */
export const PERMISSION_ALIAS_PREFIX = 'alias:';

export function permissionAlias(capability: string): string {
  return `${PERMISSION_ALIAS_PREFIX}${capability}`;
}
