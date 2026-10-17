/**
 * Environment — Mobile Staging / Test (app.farsalish.ir)
 * در زمان build آزمایشی اپ موبایل استفاده می‌شود
 */

export const environment = {
  production: true,
  apiUrl: '/api',
  accessTokenLifetime: 15 * 60 * 1000,
  useMockData: false,
  // Local-First شمارش: false = برگشت فوری به مسیر سرور-محور قبلی (feature flag)
  useLocalFirstCounting: true,
  serverOrigin: 'https://app.farsalish.ir',
  appChannel: 'direct',
};
