import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { resolveServerUrl, isServerPath } from '../platform/server-origin';
import { isNativePlatform, getAppPlatform } from '../platform/platform';
import { APP_VERSION } from '../platform/app-version';

/**
 * HTTP Interceptor to rewrite server URLs (/api, /media) to the full server origin
 * when running in a native mobile container (Capacitor), and attach X-App-Version
 * and X-App-Platform headers on native server-path requests.
 *
 * On web (non-native) or for non-server assets (e.g. /assets/...), the original
 * HttpRequest instance is passed through directly without any modifications.
 */
export const apiOriginInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const isNative = isNativePlatform();
  const isServer = isServerPath(req.url);

  if (isNative && isServer) {
    const resolvedUrl = resolveServerUrl(req.url);
    const headers = req.headers
      .set('X-App-Version', APP_VERSION)
      .set('X-App-Platform', getAppPlatform());
    return next(req.clone({ url: resolvedUrl, headers }));
  }

  const resolvedUrl = resolveServerUrl(req.url);
  if (resolvedUrl !== req.url) {
    return next(req.clone({ url: resolvedUrl }));
  }
  return next(req);
};
