/**
 * Environment — Development
 * هنگام اجرای ng serve استفاده می‌شود
 */
export const environment = {
  production: false,
  apiUrl: '/api', // به جای http://192.168.1.172:8000/api
  accessTokenLifetime: 15 * 60 * 1000,
  useMockData: false,
  // Local-First شمارش: false = برگشت فوری به مسیر سرور-محور قبلی (feature flag)
  useLocalFirstCounting: true,
  serverOrigin: '',
  appChannel: 'direct',
};
