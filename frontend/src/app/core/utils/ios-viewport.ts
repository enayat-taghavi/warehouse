/**
 * جلوگیری از زوم خودکار آیفون روی خانه‌های ورودی کوچک‌تر از ۱۶px.
 *
 * Safari در iOS با فوکوس روی ورودی ریز صفحه را بزرگ می‌کند و پس از آن زوم‌شده می‌ماند، پس کاربر باید اسکرول کند.
 * `maximum-scale=1` در iOS فقط همین زوم خودکار را می‌بندد و زوم دستی (دو انگشت) را نگه می‌دارد؛ در اندروید زوم دستی
 * را هم می‌بندد، پس فقط روی iOS (آیفون، آی‌پاد و آی‌پد با شناسهٔ مک) افزوده می‌شود.
 */
export function isIosDevice(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> | undefined): boolean {
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent || '')) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1;
}

export function preventIosInputZoom(doc: Document | undefined, nav: Navigator | undefined): boolean {
  if (!doc || !isIosDevice(nav)) return false;
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return false;
  const content = meta.getAttribute('content') || '';
  if (/maximum-scale\s*=/.test(content)) return false;
  meta.setAttribute('content', content ? `${content}, maximum-scale=1` : 'width=device-width, initial-scale=1, maximum-scale=1');
  return true;
}
