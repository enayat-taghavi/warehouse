import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { resolveServerUrl } from '../platform/server-origin';

/**
 * HTTP Interceptor to rewrite server URLs (/api, /media) to the full server origin
 * when running in a native mobile container (Capacitor).
 *
 * If `resolveServerUrl(req.url)` returns the same URL (e.g. on web, for absolute URLs,
 * or non-server assets), the original HttpRequest instance is passed through directly.
 */
export const apiOriginInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const resolvedUrl = resolveServerUrl(req.url);
  if (resolvedUrl !== req.url) {
    return next(req.clone({ url: resolvedUrl }));
  }
  return next(req);
};
