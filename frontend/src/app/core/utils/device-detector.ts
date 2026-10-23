/**
 * موتور هوشمند چندلایه‌ای تشخیص و ترجمه مدل دقیق تلفن‌های همراه و سخت‌افزار
 */

const KNOWN_DEVICE_MODELS: Record<string, string> = {
  // Samsung Galaxy S Series
  'SM-S928B': 'سامسونگ Galaxy S24 Ultra',
  'SM-S928U': 'سامسونگ Galaxy S24 Ultra',
  'SM-S926B': 'سامسونگ Galaxy S24+',
  'SM-S921B': 'سامسونگ Galaxy S24',
  'SM-S918B': 'سامسونگ Galaxy S23 Ultra',
  'SM-S918U': 'سامسونگ Galaxy S23 Ultra',
  'SM-S916B': 'سامسونگ Galaxy S23+',
  'SM-S911B': 'سامسونگ Galaxy S23',
  'SM-S908B': 'سامسونگ Galaxy S22 Ultra',
  'SM-S906B': 'سامسونگ Galaxy S22+',
  'SM-S901B': 'سامسونگ Galaxy S22',
  'SM-G998B': 'سامسونگ Galaxy S21 Ultra',
  'SM-G996B': 'سامسونگ Galaxy S21+',
  'SM-G991B': 'سامسونگ Galaxy S21',
  'SM-G988B': 'سامسونگ Galaxy S20 Ultra',
  'SM-G985F': 'سامسونگ Galaxy S20+',
  'SM-G980F': 'سامسونگ Galaxy S20',

  // Samsung Galaxy A Series
  'SM-A556B': 'سامسونگ Galaxy A55 5G',
  'SM-A546B': 'سامسونگ Galaxy A54 5G',
  'SM-A536B': 'سامسونگ Galaxy A53 5G',
  'SM-A528B': 'سامسونگ Galaxy A52s 5G',
  'SM-A525F': 'سامسونگ Galaxy A52',
  'SM-A515F': 'سامسونگ Galaxy A51',
  'SM-A505F': 'سامسونگ Galaxy A50',
  'SM-A356B': 'سامسونگ Galaxy A35 5G',
  'SM-A346B': 'سامسونگ Galaxy A34 5G',
  'SM-A336B': 'سامسونگ Galaxy A33 5G',
  'SM-A325F': 'سامسونگ Galaxy A32',
  'SM-A256B': 'سامسونگ Galaxy A25 5G',
  'SM-A245F': 'سامسونگ Galaxy A24',
  'SM-A235F': 'سامسونگ Galaxy A23',
  'SM-A155F': 'سامسونگ Galaxy A15',
  'SM-A145F': 'سامسونگ Galaxy A14',
  'SM-A135F': 'سامسونگ Galaxy A13',
  'SM-A127F': 'سامسونگ Galaxy A12',
  'SM-A055F': 'سامسونگ Galaxy A05',
  'SM-A045F': 'سامسونگ Galaxy A04',

  // Samsung Galaxy Z Series
  'SM-F946B': 'سامسونگ Galaxy Z Fold 5',
  'SM-F936B': 'سامسونگ Galaxy Z Fold 4',
  'SM-F731B': 'سامسونگ Galaxy Z Flip 5',
  'SM-F721B': 'سامسونگ Galaxy Z Flip 4',

  // Xiaomi & Redmi
  '23127PN0CG': 'شیائومی 14 Pro',
  '2312DRA50G': 'شیائومی Redmi Note 13 Pro+ 5G',
  '23117RA68G': 'شیائومی Redmi Note 13 Pro',
  '23129RAA4G': 'شیائومی Redmi Note 13 4G',
  '22101316G': 'شیائومی 13 Pro',
  '2201116TG': 'شیائومی Redmi Note 11 Pro 4G',
  '2201117TY': 'شیائومی Redmi Note 11S',
  '2201117TG': 'شیائومی Redmi Note 11',
  'M2101K6G': 'شیائومی Redmi Note 10 Pro',
  'M2101K7BNY': 'شیائومی Redmi Note 10S',
  'M2101K7BG': 'شیائومی Redmi Note 10',
  '22081212UG': 'پوکو Poco F4 GT',
  '23049PCD8G': 'پوکو Poco F5',
  '24069PC21G': 'پوکو Poco F6',
  '2311DRK48G': 'پوکو Poco X6 Pro 5G',
  '2201116PG': 'پوکو Poco X4 Pro 5G',
  'M2007J20CG': 'پوکو Poco X3 NFC',
  'M2007J20CT': 'پوکو Poco X3 Pro',

  // Apple iPhone
  'iPhone16,2': 'اپل iPhone 15 Pro Max',
  'iPhone16,1': 'اپل iPhone 15 Pro',
  'iPhone15,5': 'اپل iPhone 15 Plus',
  'iPhone15,4': 'اپل iPhone 15',
  'iPhone15,3': 'اپل iPhone 14 Pro Max',
  'iPhone15,2': 'اپل iPhone 14 Pro',
  'iPhone14,8': 'اپل iPhone 14 Plus',
  'iPhone14,7': 'اپل iPhone 14',
  'iPhone14,3': 'اپل iPhone 13 Pro Max',
  'iPhone14,2': 'اپل iPhone 13 Pro',
  'iPhone14,5': 'اپل iPhone 13',
  'iPhone14,4': 'اپل iPhone 13 mini',
  'iPhone13,4': 'اپل iPhone 12 Pro Max',
  'iPhone13,3': 'اپل iPhone 12 Pro',
  'iPhone13,2': 'اپل iPhone 12',
  'iPhone12,5': 'اپل iPhone 11 Pro Max',
  'iPhone12,3': 'اپل iPhone 11 Pro',
  'iPhone12,1': 'اپل iPhone 11',
  'iPhone11,8': 'اپل iPhone XR',
  'iPhone11,6': 'اپل iPhone XS Max',
  'iPhone11,2': 'اپل iPhone XS',
  'iPhone10,6': 'اپل iPhone X',
};

/**
 * تبدیل کد سخت‌افزاری مدل گوشی به نام تجاری خوانا
 */
export function formatDeviceModelName(rawModel?: string | null): string {
  if (!rawModel) return '';
  const trimmed = rawModel.trim();
  if (KNOWN_DEVICE_MODELS[trimmed]) {
    return KNOWN_DEVICE_MODELS[trimmed];
  }

  // بررسی بر اساس پیشوند مدل‌های خانواده سامسونگ (مثلاً SM-A546E -> سامسونگ Galaxy A54 5G)
  const smPrefixMatch = trimmed.match(/^(SM-[A-Z][0-9]{3})/i);
  if (smPrefixMatch && smPrefixMatch[1]) {
    const basePrefix = smPrefixMatch[1].toUpperCase();
    for (const [knownKey, knownLabel] of Object.entries(KNOWN_DEVICE_MODELS)) {
      if (knownKey.toUpperCase().startsWith(basePrefix)) {
        return knownLabel;
      }
    }
  }
  
  if (trimmed.startsWith('SM-')) {
    return `سامسونگ (${trimmed})`;
  }
  if (trimmed.toLowerCase().includes('pixel')) {
    return `گوگل ${trimmed}`;
  }
  if (trimmed.toLowerCase().includes('poco')) {
    return `پوکو ${trimmed}`;
  }
  if (trimmed.toLowerCase().includes('redmi')) {
    return `شیائومی ${trimmed}`;
  }
  return trimmed;
}

/**
 * دریافت شناسه کارت گرافیک موبایل از طریق WebGL
 */
function getWebGLRenderer(): string {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        return (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      }
    }
  } catch {}
  return '';
}

/**
 * استخراج مدل سخت‌افزاری بر پایه اثر انگشت چندلایه‌ای سخت‌افزار (GPU + Screen + Sensors)
 */
function detectDeviceByFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const gpu = getWebGLRenderer();
  const width = window.screen.width;
  const height = window.screen.height;
  const dpr = window.devicePixelRatio || 1;
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  // بررسی آیفون‌ها بر اساس مشخصات رزولوشن و رندرر
  if (navigator.userAgent.includes('iPhone') || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
    if (minDim >= 430 && maxDim >= 932) return 'اپل iPhone 14 / 15 Pro Max';
    if (minDim >= 393 && maxDim >= 852) return 'اپل iPhone 14 / 15 Pro';
    if (minDim >= 428 && maxDim >= 926) return 'اپل iPhone 13 Pro Max / 14 Plus';
    if (minDim >= 390 && maxDim >= 844) return 'اپل iPhone 12 / 13 / 14';
    if (minDim >= 414 && maxDim >= 896) return 'اپل iPhone 11 / XR / XS Max';
    if (minDim >= 375 && maxDim >= 812) return 'اپل iPhone X / XS / 11 Pro';
    if (minDim >= 375 && maxDim >= 667) return 'اپل iPhone SE';
    return 'اپل iPhone';
  }

  // بررسی گوشی‌های اندرویدی از روی چیپ گرافیکی GPU
  if (gpu) {
    if (gpu.includes('Adreno (TM) 750')) return 'سامسونگ Galaxy S24 Ultra / شیائومی 14';
    if (gpu.includes('Adreno (TM) 740')) return 'سامسونگ Galaxy S23 Ultra / S23+';
    if (gpu.includes('Adreno (TM) 730')) return 'سامسونگ Galaxy S22 Ultra / شیائومی 12';
    if (gpu.includes('Adreno (TM) 660')) return 'سامسونگ Galaxy S21 FE / شیائومی 11T Pro';
    if (gpu.includes('Adreno (TM) 650')) return 'سامسونگ Galaxy S20 FE / پوکو F3';
    if (gpu.includes('Adreno (TM) 642L')) return 'سامسونگ Galaxy A52s 5G / شیائومی 11 Lite 5G';
    if (gpu.includes('Adreno (TM) 619')) return 'سامسونگ Galaxy A23 5G / شیائومی Redmi Note 11 Pro 5G';
    if (gpu.includes('Adreno (TM) 618')) return 'سامسونگ Galaxy A52 4G / پوکو X3 NFC';
    if (gpu.includes('Adreno (TM) 610')) return 'شیائومی Redmi Note 11 / سامسونگ Galaxy A23';
    if (gpu.includes('Mali-G715')) return 'شیائومی 13T Pro / گوگل Pixel 8';
    if (gpu.includes('Mali-G710')) return 'گوگل Pixel 7 / 7 Pro';
    if (gpu.includes('Mali-G78')) return 'سامسونگ Galaxy S21 5G';
    if (gpu.includes('Mali-G68')) return 'سامسونگ Galaxy A54 / A53 / A34 5G';
    if (gpu.includes('Mali-G57')) return 'شیائومی Redmi Note 11S / سامسونگ Galaxy A15';
    if (gpu.includes('Mali-G52')) return 'سامسونگ Galaxy A14 / A13 / شیائومی Redmi 10';
    if (gpu.includes('Mali-G77')) return 'شیائومی 11T / ردمی K30 Pro';
    if (gpu.includes('PowerVR')) return 'دستگاه با چیپست مدیاتک Helio';
  }

  return '';
}

/**
 * استخراج جامع و ناهمگام مدل دستگاه از مرورگر کاربر با لایه‌های پشتیبان
 */
export async function detectClientDeviceModel(): Promise<string> {
  if (typeof navigator !== 'undefined') {
    // لایه ۱: استاندارد Client-Hints (در بستر HTTPS/localhost)
    const navAny = navigator as any;
    if (navAny.userAgentData && navAny.userAgentData.getHighEntropyValues) {
      try {
        const values = await navAny.userAgentData.getHighEntropyValues(['model', 'platformVersion']);
        if (values && values.model && values.model !== 'K' && values.model !== 'Android' && values.model !== '') {
          return values.model;
        }
      } catch {}
    }

    // لایه ۲: جستجو در User-Agent سنتی
    const ua = navigator.userAgent || '';
    const match = ua.match(/;\s*([A-Z0-9_-]+)\s+Build\//i);
    if (match && match[1] && match[1] !== 'K' && match[1] !== 'Android') {
      return match[1];
    }

    const smMatch = ua.match(/(SM-[A-Z0-9]+)/i);
    if (smMatch && smMatch[1]) {
      return smMatch[1];
    }

    const xiaomiMatch = ua.match(/(Redmi[A-Za-z0-9\s_-]+|POCO[A-Za-z0-9\s_-]+|Mi\s*[A-Za-z0-9\s_-]+)/i);
    if (xiaomiMatch && xiaomiMatch[1]) {
      return xiaomiMatch[1].trim();
    }

    // لایه ۳: شناسایی سخت‌افزاری بر پایه چیپ گرافیکی WebGL و رزولوشن صفحه
    const fpModel = detectDeviceByFingerprint();
    if (fpModel) {
      return fpModel;
    }

    // لایه ۴: تشخیص بر مبنای نوع پلتفرم و نوع سخت‌افزار (Fallback فارسی معتبر)
    const isMobile = /Android|iPhone|iPod|Mobile/i.test(ua);
    const isTablet = /Tablet|iPad/i.test(ua);

    if (isTablet) {
      return /iPad/i.test(ua) ? 'تبلت اپل آیپد (iPadOS)' : 'تبلت اندروید';
    }
    if (isMobile) {
      return /iPhone/i.test(ua) ? 'گوشی هوشمند اپل آیفون' : 'گوشی هوشمند اندروید';
    }
    if (ua.includes('Windows')) {
      return 'رایانه رومیزی / لپ‌تاپ ویندوز';
    }
    if (ua.includes('Macintosh')) {
      return 'رایانه اپل مکینتاش (macOS)';
    }
    if (ua.includes('Linux')) {
      return 'رایانه رومیزی لینوکس';
    }
  }
  return '';
}
