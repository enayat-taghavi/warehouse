import { ApplicationConfig, provideZoneChangeDetection, provideBrowserGlobalErrorListeners, isDevMode, provideAppInitializer, ErrorHandler, inject } from '@angular/core';
import { ActivatedRouteSnapshot, provideRouter, RouteReuseStrategy, withViewTransitions } from '@angular/router';
import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { firstValueFrom, of, catchError, timeout } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/error/error.interceptor';
import { GlobalErrorHandler } from './core/error/global-error-handler';
import { offlineInterceptor } from './core/interceptors/offline.interceptor';
import { apiOriginInterceptor } from './core/interceptors/api-origin.interceptor';
import { CustomRouteReuseStrategy } from './core/strategies/custom-route-reuse-strategy';
import { OfflineSyncService } from './core/services/offline-sync.service';
import { CacheWarmupService } from './core/services/cache-warmup.service';
import { ConfigApiService } from './core/api/config-api.service';
import { resolveServerUrl } from './core/platform/server-origin';
import { isNativePlatform } from './core/platform/platform';

/** مسیر اصلی (بدون query و fragment) از ریشهٔ snapshot تا عمیق‌ترین فرزند. */
function primaryPath(snapshot: ActivatedRouteSnapshot | null): string {
  const segments: string[] = [];
  for (let route = snapshot; route; route = route.firstChild) {
    segments.push(...route.url.map((segment) => segment.path));
  }
  return segments.join('/');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // گذار نرم بین صفحه‌ها (View Transitions API)؛ مرورگرهای بدون پشتیبانی بی‌اثر می‌مانند.
      // بارگذاری اول و تغییرِ فقط query یا fragment (فیلتر، صفحه‌بندی) بدون انیمیشن است.
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          if (primaryPath(from) === primaryPath(to)) {
            transition.skipTransition();
          }
        },
      }),
    ),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor, offlineInterceptor, apiOriginInterceptor])
    ),
    ...(isNativePlatform()
      ? [
          {
            provide: IMAGE_LOADER,
            useValue: (config: ImageLoaderConfig) => resolveServerUrl(config.src)
          }
        ]
      : []),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: RouteReuseStrategy, useClass: CustomRouteReuseStrategy },
    provideServiceWorker('ngsw-worker.js', {
      // 'registerWhenStable:30000' یعنی تا پایدار شدن برنامه (حداکثر ۳۰ ثانیه)
      // هیچ چیزی کش نمی‌شود. برای یک PWA انبارگردانی که کاربر بلافاصله پس از
      // نصب ممکن است وارد محیط بدون شبکه شود، این پنجره خطرناک است: اگر در آن
      // فاصله اتصال قطع شود، پوسته برنامه هرگز کش نمی‌شود و دفعه بعد به‌جای
      // حالت آفلاین، صفحه خطای مرورگر بالا می‌آید.
      enabled: !isDevMode() && !isNativePlatform(),
      registrationStrategy: 'registerImmediately'
    }),
    provideAppInitializer(() => {
      OfflineSyncService.getInstance().initialize();
      // ص۵ طرح ۲.۵: پیش‌خوانی کش GET ماژول‌ها بعد از ورود، برگشت اتصال و بروزرسانی عمیق
      inject(CacheWarmupService).start();
      // درخواست ماندگاری storage — بدون آن مرورگر می‌تواند تحت فشار دیسک
      // IndexedDB (صف و دادهٔ آفلاین کاربر) را پاک کند. fire-and-forget.
      navigator.storage?.persist?.().then(
        (granted) => console.log(`[Storage] persist: ${granted ? '✅ ماندگار شد' : '⚠️ رد شد (best-effort)'}`),
        () => {}
      );
      const configApi = inject(ConfigApiService);
      return firstValueFrom(
        configApi.getPublicConfig().pipe(
          timeout(1500),
          catchError(() => of(null))
        )
      ).catch(() => null);
    })
  ]
};
