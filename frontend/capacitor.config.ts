import type { CapacitorConfig } from '@capacitor/cli';

/**
 * پیکربندی Capacitor برای اپ موبایل CoManage.
 *
 * هشدار حیاتی (AGENTS §10 و بند ۴-د طرح):
 * مقادیر زیر پس از اولین انتشار دائمی و تغییرناپذیر هستند:
 * - appId: 'ir.comanage.soft'
 * - server.androidScheme: 'https'
 * - server.hostname: 'localhost'
 *
 * تغییر هر یک از این مقادیر مبدأ امنیتی (Origin) برنامه در WebView را تغییر داده
 * و دسترسی به پایگاه‌داده آفلاین کاربر (IndexedDB/Dexie) و localStorage را برای همیشه از بین می‌برد.
 */
const config: CapacitorConfig = {
  appId: 'ir.comanage.soft',
  appName: 'CoManage',
  webDir: 'dist-mobile/warehouse-app/browser',
  server: {
    androidScheme: 'https',
    hostname: 'localhost'
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false
    }
  }
};

export default config;
