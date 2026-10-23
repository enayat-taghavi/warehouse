/**
 * وصله‌ی پس از build روی ngsw-worker.js — تحمل کدهای Cloudflare هنگام قطع origin
 *
 * چرا: Service Worker انگولار در fetchLatestManifest فقط ۵۰۳ و ۵۰۴ را به‌عنوان
 * «آفلاین» تحمل می‌کند. در محیط عملیاتی این برنامه پشت Cloudflare Tunnel است و
 * وقتی origin خاموش شود، Cloudflare یک پاسخ کامل HTTP با کد ۵۳۰ (یا ۵۰۲/۵۲۰–۵۲۹)
 * برمی‌گرداند. آن کد از فیلتر انگولار رد می‌شود، خطا پرتاب می‌شود و درایور به
 * حالت EXISTING_CLIENTS_ONLY می‌رود — در آن حالت هر رفرش به‌جای پوسته‌ی کش‌شده،
 * صفحه‌ی خطای ۱۰۳۳ Cloudflare را نشان می‌دهد. (تأییدشده با /ngsw/state روی
 * app.farsalish.ir و مطالعه‌ی سورس ngsw-worker.js نسخه ۲۲.۰.۲)
 *
 * چرا وصله و نه Cloudflare Worker: این رفع اشکال باید همراه خود برنامه بماند،
 * نه در پیکربندی یک ارائه‌دهنده‌ی خاص که با جابه‌جایی هاست از دست می‌رود.
 *
 * ایمنی: ngsw-worker.js در hashTable فایل ngsw.json نیست، پس تغییرش هش‌ها را
 * نمی‌شکند. اگر الگو پیدا نشود (مثلاً پس از ارتقای انگولار) این اسکریپت build
 * را با خطا متوقف می‌کند تا نبودِ وصله هرگز بی‌صدا نماند.
 */
const fs = require('fs');
const path = require('path');

function resolveWorkerPath() {
  if (process.argv[2]) {
    const customOut = path.resolve(process.cwd(), process.argv[2]);
    const inBrowser = path.join(customOut, 'browser', 'ngsw-worker.js');
    if (fs.existsSync(inBrowser)) return inBrowser;
    const direct = path.join(customOut, 'ngsw-worker.js');
    if (fs.existsSync(direct)) return direct;
    return inBrowser;
  }
  return path.join(__dirname, '..', 'dist', 'warehouse-app', 'browser', 'ngsw-worker.js');
}

const workerPath = resolveWorkerPath();

const ORIGINAL_MANIFEST_CHECK = '(res.status === 503 || res.status === 504) && ignoreOfflineError';
const PATCHED_MANIFEST_CHECK =
  '(res.status === 502 || res.status === 503 || res.status === 504 || (res.status >= 520 && res.status <= 530)) && ignoreOfflineError';

const ORIGINAL_DEGRADE = 'this.state = DriverReadyState.EXISTING_CLIENTS_ONLY;';
const PATCHED_DEGRADE = 'if (!String(err).match(/50[234]|52[0-9]|530/)) { this.state = DriverReadyState.EXISTING_CLIENTS_ONLY; }';

if (!fs.existsSync(workerPath)) {
  console.error(`[patch-ngsw-530] ✖ File not found: ${workerPath}`);
  console.error('[patch-ngsw-530] This script must run after ng build.');
  process.exit(1);
}

let source = fs.readFileSync(workerPath, 'utf8');
let patched = false;

if (source.includes(PATCHED_MANIFEST_CHECK) && source.includes(PATCHED_DEGRADE)) {
  console.log('[patch-ngsw-530] ✔ Patch already applied.');
  process.exit(0);
}

if (!source.includes(ORIGINAL_MANIFEST_CHECK) && !source.includes(PATCHED_MANIFEST_CHECK)) {
  console.error('[patch-ngsw-530] ✖ Expected pattern not found in ngsw-worker.js.');
  console.error('[patch-ngsw-530] Likely @angular/service-worker was upgraded and code changed.');
  process.exit(1);
}

source = source.replace(ORIGINAL_MANIFEST_CHECK, PATCHED_MANIFEST_CHECK);
source = source.replace(new RegExp(ORIGINAL_DEGRADE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), PATCHED_DEGRADE);

fs.writeFileSync(workerPath, source, 'utf8');
console.log('[patch-ngsw-530] ✔ ngsw-worker.js patched successfully (Cloudflare 5xx degradation prevented).');
