/** حجم فایل به فارسی، مثل «۱٫۲ مگابایت»؛ مقدار نامعتبر رشتهٔ خالی می‌دهد */
export function formatFileSizeFa(bytes?: number | null): string {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b < 0) return '';
  const fmt = (v: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(v);
  if (b < 1024) return `${fmt(b)} بایت`;
  if (b < 1024 * 1024) return `${fmt(b / 1024)} کیلوبایت`;
  return `${fmt(b / (1024 * 1024))} مگابایت`;
}
