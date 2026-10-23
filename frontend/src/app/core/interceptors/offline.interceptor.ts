import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpResponse, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { from, Observable, of, throwError } from 'rxjs';
import { switchMap, tap, catchError, timeout, finalize } from 'rxjs/operators';
import { NetworkStatusService } from '../services/network-status.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { offlineDb, resolveEntityTypeFromUrl } from '../services/offline-db';
import { isServerUnreachable } from '../services/server-reachability';
import { environment } from '../../../environments/environment';

/**
 * اگر روی یک request تنظیم شود، آن را از مدار آفلاین عبور می‌دهد
 * مثال: درخواست‌های login و refresh
 */
export const SKIP_OFFLINE = new HttpContextToken<boolean>(() => false);

/**
 * وقتی درخواستی آفلاین بوده و در کش هم چیزی نبوده، این توکن ست می‌شود تا
 * errorInterceptor به‌جای «خطای داخلی سرور» پیام درست آفلاین را نشان دهد.
 */
export const OFFLINE_NO_CACHE = new HttpContextToken<boolean>(() => false);

/**
 * وقتی یک آپلود فایل (FormData) در حالت آفلاین رد می‌شود، این توکن ست می‌شود
 * تا errorInterceptor پیام روشن «آپلود آفلاین ممکن نیست» را نشان دهد.
 */
export const OFFLINE_UPLOAD_UNSUPPORTED = new HttpContextToken<boolean>(() => false);

/**
 * سقف انتظار برای یک GET روی شبکه کند. بعد از این مهلت به کش fallback می‌کنیم
 * چون داده کهنه از اسپینر بی‌پایان بهتر است. بارگذاری فایل‌های سنگین از این
 * مسیر عبور نمی‌کند (فقط GETهای API).
 */
const SLOW_NETWORK_TIMEOUT_MS = 20_000;

/**
 * آدرس‌های سیگنالینگ، ضربان قلب، پایش سلامت و مدیریت نشست که هرگز نباید در صف آفلاین ذخیره شوند
 */
export function isNonQueueableEndpoint(url: string): boolean {
  if (!url) return false;
  const clean = url.toLowerCase();
  return (
    clean.includes('/telemetry/') ||
    clean.includes('/heartbeat/') ||
    clean.includes('/health/') ||
    clean.includes('/system-health/') ||
    clean.includes('/auth/login') ||
    clean.includes('/auth/logout') ||
    clean.includes('/auth/token') ||
    clean.includes('/auth/refresh') ||
    clean.includes('/ping')
  );
}

/**
 * محاسبه کلید کش آفلاین با تفکیک قطعی چندشرکتی (Multi-Tenant Cache Key Isolation)
 * جهت جلوگیری از تداخل و نشت داده‌های کش‌شده انبارها، کالاها و پروژه‌ها میان شرکت‌های مختلف
 */
export function getOfflineCacheKey(req: HttpRequest<unknown>): string {
  const url = req.urlWithParams || req.url;
  const headerCid = req.headers.get('X-Company-ID');
  let cid = headerCid;
  if (!cid) {
    try {
      const parsed = new URL(url, 'http://localhost');
      cid = parsed.searchParams.get('company_id') || parsed.searchParams.get('cid');
    } catch {}
  }
  if (!cid && typeof window !== 'undefined') {
    try {
      cid = sessionStorage.getItem('active_company_id') || localStorage.getItem('active_company_id');
    } catch {}
  }
  return cid ? `${url}::cid_${cid}` : url;
}

/**
 * رهگیری درخواست‌های استعلام پس‌زمینه در حال اجرا جهت جلوگیری قطعی از درخواست‌های تکراری،
 * تداخل چندگانه و حلقه‌های رگباری SWR
 */
const inFlightRevalidations = new Set<string>();

/**
 * حداقل فاصله زمانی مجاز برای استعلام مجدد پس‌زمینه برای یک کلید کش (۱۵ ثانیه)
 */
const REVALIDATION_COOLDOWN_MS = 15_000;
const lastRevalidationTime = new Map<string, number>();

/**
 * offlineInterceptor — اینترسپتور آفلاین با قابلیت Lie-Fi و ادغام کش+صف
 *
 * رفتار:
 * ─── آنلاین ───
 * • GET: ارسال به سرور + ذخیره پاسخ در کش لوکال
 *   (اگر سرور پاسخ نداد → fallback به حالت آفلاین: Lie-Fi)
 * • تغییری: ارسال عادی به سرور
 *   (اگر سرور پاسخ نداد → ذخیره در صف: Lie-Fi)
 *
 * ─── آفلاین ───
 * • GET: خواندن از کش + ادغام با داده‌های جدید در صف
 * • تغییری: ذخیره در صف + پاسخ خوش‌بینانه
 */
export const offlineInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<any> => {
  // فقط درخواست‌های API را مدیریت کن
  if (!req.url.startsWith(environment.apiUrl) && !req.url.startsWith('/api')) {
    return next(req);
  }

  // اگر SKIP_OFFLINE تنظیم شده یا آدرس سیستمی/گذرا است، از مدار آفلاین رد شو
  if (req.context.get(SKIP_OFFLINE) || isNonQueueableEndpoint(req.url)) {
    return next(req);
  }

  const network = NetworkStatusService.getInstance();
  const syncService = OfflineSyncService.getInstance();

  // ─── توابع کمکی ───

  /**
   * ادغام داده‌های کش با رکوردهای صف (Merge Cache + Queue)
   * برای نمایش داده‌های جدید آفلاین در لیست‌ها
   */
  const mergeWithQueue = async (cachedData: any, requestUrl: string): Promise<any> => {
    try {
      const queueEntries = await syncService.getQueueEntries();
      if (queueEntries.length === 0) return cachedData;

      // استخراج مسیر پایه و کوئری‌پارامترها از requestUrl (تسک ۹ و ۱۰)
      const parsedUrl = new URL(requestUrl, 'http://localhost');
      const baseUrl = requestUrl.split('?')[0].replace(/\/+$/, '');
      const reqWarehouseId = parsedUrl.searchParams.get('warehouse_id') || parsedUrl.searchParams.get('warehouse');
      const reqCompanyId = parsedUrl.searchParams.get('company_id') || parsedUrl.searchParams.get('company');
      const reqPage = parsedUrl.searchParams.get('page');
      const isFirstPage = !reqPage || reqPage === '1';
      const reqSearch = parsedUrl.searchParams.get('search')?.trim().toLowerCase();

      // تابع کمکی تطبیق دقیق مسیر برای منبع فرزند مستقیم (نه زیرمنبع‌های تودرتو مانند /photos/ یا /stats/)
      const matchDirectResource = (targetUrl: string): { matches: boolean; recordId: number | null; syncId: string | null } => {
        const cleanTarget = targetUrl.split('?')[0].replace(/\/+$/, '');
        const prefix = baseUrl + '/';
        if (!cleanTarget.startsWith(prefix)) return { matches: false, recordId: null, syncId: null };
        const remainder = cleanTarget.slice(prefix.length);
        if (remainder.includes('/')) return { matches: false, recordId: null, syncId: null }; // زیرمنبع تودرتو است (تسک ۹)
        const num = parseInt(remainder, 10);
        return {
          matches: true,
          recordId: !isNaN(num) ? num : null,
          syncId: isNaN(num) ? remainder : null,
        };
      };

      // پیدا کردن رکوردهای صف مرتبط با این endpoint با تطبیق دقیق و احترام به فیلترها (تسک ۱۰)
      const relatedPosts = queueEntries.filter((e) => {
        if (e.method !== 'POST') return false;
        const postBase = e.url.split('?')[0].replace(/\/+$/, '');
        if (postBase !== baseUrl) return false;

        // فقط به صفحه اول اضافه شود
        if (!isFirstPage) return false;
        if (reqWarehouseId && e.body && typeof e.body === 'object') {
          const bodyWh = e.body.warehouse_id || e.body.warehouse;
          if (bodyWh && String(bodyWh) !== String(reqWarehouseId)) return false;
        }
        if (reqCompanyId && e.body && typeof e.body === 'object') {
          const bodyCo = e.body.company_id || e.body.company;
          if (bodyCo && String(bodyCo) !== String(reqCompanyId)) return false;
        }
        if (reqSearch && e.body && typeof e.body === 'object') {
          const text = JSON.stringify(e.body).toLowerCase();
          if (!text.includes(reqSearch)) return false;
        }
        return true;
      });

      const relatedPatches = queueEntries
        .filter((e) => e.method === 'PATCH' || e.method === 'PUT')
        .map((e) => ({ entry: e, match: matchDirectResource(e.url) }))
        .filter((item) => item.match.matches);

      const relatedDeletes = queueEntries
        .filter((e) => e.method === 'DELETE')
        .map((e) => ({ entry: e, match: matchDirectResource(e.url) }))
        .filter((item) => item.match.matches);

      const deletedIds = new Set(
        relatedDeletes.map((d) => d.match.recordId).filter((id): id is number => id !== null)
      );
      const deletedSyncIds = new Set(
        relatedDeletes.map((d) => d.match.syncId).filter((s): s is string => s !== null)
      );

      if (relatedPosts.length === 0 && relatedPatches.length === 0 && deletedIds.size === 0 && deletedSyncIds.size === 0) {
        return cachedData;
      }

      // ──── ادغام: پاسخ Django REST Framework (ساختار paginated) ────
      let mergedData = JSON.parse(JSON.stringify(cachedData)); // deep clone

      if (mergedData && typeof mergedData === 'object') {
        // اگر پاسخ DRF (دارای results) باشد
        if (Array.isArray(mergedData.results)) {
          // POST — اضافه کردن رکوردهای جدید به ابتدای لیست
          for (const post of relatedPosts) {
            if (post.body && typeof post.body === 'object') {
              const postTempId = post.body.id ?? (post.id ? -post.id : -Date.now());
              mergedData.results.unshift({
                ...post.body,
                id: postTempId,
                _tempId: postTempId,
                _offlineId: post.id,
                _offlinePending: true,
                ...(post.entitySyncId ? { sync_id: post.entitySyncId } : {}),
              });
            }
          }

          // PATCH/PUT — به‌روزرسانی رکوردهای موجود با تطبیق شناسه عددی یا sync_id
          for (const patchItem of relatedPatches) {
            const patch = patchItem.entry;
            const { recordId, syncId } = patchItem.match;

            if (patch.body) {
              const index = mergedData.results.findIndex((r: any) =>
                (recordId !== null && r.id === recordId) ||
                (syncId !== null && (r.sync_id === syncId || String(r.id) === syncId))
              );
              if (index !== -1) {
                mergedData.results[index] = {
                  ...mergedData.results[index],
                  ...patch.body,
                  _offlinePending: true,
                };
              }
            }
          }

          // DELETE — حذف رکوردهای حذف‌شده آفلاین از لیست
          let removedCount = 0;
          if (deletedIds.size > 0 || deletedSyncIds.size > 0) {
            const before = mergedData.results.length;
            mergedData.results = mergedData.results.filter(
              (r: any) => !deletedIds.has(r.id) && !(r.sync_id && deletedSyncIds.has(r.sync_id))
            );
            removedCount = before - mergedData.results.length;
          }

          // به‌روزرسانی count
          if (typeof mergedData.count === 'number') {
            mergedData.count += relatedPosts.length - removedCount;
          }
        } else if (Array.isArray(mergedData)) {
          // اگر پاسخ مستقیم آرایه باشد (بدون pagination)
          for (const post of relatedPosts) {
            if (post.body && typeof post.body === 'object') {
              const postTempId = post.body.id ?? (post.id ? -post.id : -Date.now());
              mergedData.unshift({
                ...post.body,
                id: postTempId,
                _tempId: postTempId,
                _offlineId: post.id,
                _offlinePending: true,
                ...(post.entitySyncId ? { sync_id: post.entitySyncId } : {}),
              });
            }
          }

          for (const patchItem of relatedPatches) {
            const patch = patchItem.entry;
            const { recordId, syncId } = patchItem.match;
            if (patch.body) {
              const index = mergedData.findIndex((r: any) =>
                (recordId !== null && r.id === recordId) ||
                (syncId !== null && (r.sync_id === syncId || String(r.id) === syncId))
              );
              if (index !== -1) {
                mergedData[index] = { ...mergedData[index], ...patch.body, _offlinePending: true };
              }
            }
          }

          // DELETE — حذف رکوردهای حذف‌شده آفلاین از آرایه
          if (deletedIds.size > 0 || deletedSyncIds.size > 0) {
            mergedData = mergedData.filter(
              (r: any) => !deletedIds.has(r.id) && !(r.sync_id && deletedSyncIds.has(r.sync_id))
            );
          }
        }
      }

      console.log(`[OfflineInterceptor] 🔀 ادغام ایمن: ${relatedPosts.length} POST + ${relatedPatches.length} PATCH/PUT + ${relatedDeletes.length} DELETE`);
      return mergedData;
    } catch (error) {
      console.error('[OfflineInterceptor] خطا در ادغام:', error);
      return cachedData;
    }
  };

  // ─── مدیریت GET با الگوی Stale-While-Revalidate (SWR) ───
  const handleGetSWR = (): Observable<any> => {
    const cacheKey = getOfflineCacheKey(req);

    return from(syncService.getCachedEntry(cacheKey)).pipe(

      switchMap((entry) => {
        // ۱. اگر داده در کش محلی IndexedDB موجود باشد (تحویل فوری ۰ میلی‌ثانیه):
        if (entry !== null) {
          return from(mergeWithQueue(entry.response, req.url)).pipe(
            switchMap((merged) => {
              console.log(
                `[OfflineInterceptor] ⚡ تحویل آنی SWR از کش محلی (0ms): ${cacheKey}${entry.isStale ? ' (Stale)' : ''}`
              );

              // استعلام آرام و نامحسوس در پس‌زمینه (Background Revalidation با جلوگیری قطعی از حلقه‌های تکراری)
              const now = Date.now();
              const lastReval = lastRevalidationTime.get(cacheKey) || 0;
              const isCooldownActive = now - lastReval < REVALIDATION_COOLDOWN_MS;

              if (network.isBrowserOnline && !inFlightRevalidations.has(cacheKey) && !isCooldownActive) {
                inFlightRevalidations.add(cacheKey);
                lastRevalidationTime.set(cacheKey, now);

                next(req)
                  .pipe(
                    timeout(10_000),
                    catchError((err) => {
                      if (err?.status && isServerUnreachable(err.status)) {
                        network.reportServerUnreachable();
                      }
                      console.log(
                        `[OfflineInterceptor] 🤫 استعلام پس‌زمینه بدون مزاحمت گذشت (سرور غیرقابل‌دسترس/آفلاین): ${req.url}`
                      );
                      return of(null);
                    }),
                    finalize(() => {
                      inFlightRevalidations.delete(cacheKey);
                    })
                  )
                  .subscribe(async (event) => {
                    if (event instanceof HttpResponse && event.ok) {
                      network.reportServerReachable();
                      // بررسی تغییر واقعی داده‌ها جهت جلوگیری از سربار حافظه و رندرهای اضافه
                      const hasDataChanged = JSON.stringify(event.body) !== JSON.stringify(entry.response);
                      if (hasDataChanged) {
                        // به‌روزرسانی کش IndexedDB
                        await syncService.cacheResponse(cacheKey, event.body);
                        // ادغام با رکوردهای صف آفلاین
                        const freshMerged = await mergeWithQueue(event.body, req.url);
                        // اطلاع‌رسانی به کل برنامه جهت به‌روزرسانی زنده و هایلایت انیمیشنی
                        syncService.notifyDataUpdated(req.urlWithParams || req.url, freshMerged);
                        console.log(`[OfflineInterceptor] 🔄 داده‌های جدید پس‌زمینه دریافت و منتشر شد: ${req.urlWithParams || req.url}`);
                      } else {
                        console.log(`[OfflineInterceptor] ⚡ داده‌های سرور با کش محلی یکسان بود؛ صرف‌نظر از رندرهای اضافی: ${cacheKey}`);
                      }
                    }
                  });
              }

              return of(
                new HttpResponse({
                  body: merged,
                  status: 200,
                  statusText: entry.isStale ? 'OK (Offline SWR Cache - Stale)' : 'OK (Offline SWR Cache + Merged)',
                  url: req.url,
                })
              );
            })
          );
        }

        // ۲. اگر در کش داده‌ای نباشد (بازدید اول):
        if (network.isBrowserOnline) {
          return next(req).pipe(
            timeout(10_000),
            tap((event) => {
              if (event instanceof HttpResponse && event.ok) {
                network.reportServerReachable();
                syncService.cacheResponse(cacheKey, event.body);
              }
            }),
            catchError((error: HttpErrorResponse) => {
              if (isServerUnreachable(error.status)) {
                network.reportServerUnreachable();
                console.warn(`[OfflineInterceptor] ⚠️ سرور در دسترس نیست و کش اولیه خالی است: ${req.url}`);
                req.context.set(OFFLINE_NO_CACHE, true);
                return throwError(
                  () =>
                    new HttpErrorResponse({
                      error: {
                        detail:
                          'ارتباط با سرور برقرار نشد و داده‌ای در حافظه آفلاین موجود نیست. لطفاً اتصال شبکه را بررسی نمایید.',
                      },
                      status: 503,
                      statusText: 'Offline - No Cache',
                      url: req.url,
                    })
                );
              }
              network.reportServerReachable();
              return throwError(() => error);
            })
          );
        }

        // ۳. حالت کاملاً آفلاین و بدون کش قبلی
        console.warn(`[OfflineInterceptor] ⚠️ آفلاین کامل و کش موجود نیست: ${cacheKey}`);
        req.context.set(OFFLINE_NO_CACHE, true);
        return throwError(
          () =>
            new HttpErrorResponse({
              error: { detail: 'دستگاه در حالت آفلاین است و داده‌ای در حافظه محلی ذخیره نشده است.' },
              status: 503,
              statusText: 'Offline - No Cache',
              url: req.url,
            })
        );
      })
    );
  };

  const handleOfflineMutation = (): Observable<any> => {
    // درخواست‌های پایش، سیگنالینگ، ضربان قلب و نشست نباید صف‌بندی شوند
    if (isNonQueueableEndpoint(req.url)) {
      console.warn(`[OfflineInterceptor] 🚫 جلوگیری از صف‌بندی اندپوینت سیستمی/گذرا: ${req.method} ${req.url}`);
      return throwError(
        () =>
          new HttpErrorResponse({
            error: { detail: 'این درخواست مربوط به پایش سیستمی بوده و در صف آفلاین ذخیره نمی‌شود.' },
            status: 503,
            statusText: 'Offline - Non Queueable',
            url: req.url,
          })
      );
    }

    // FormData در IndexedDB قابل ذخیره نیست (DataCloneError) و حتی اگر بود،
    // replay با JSON.stringify بدنه را خالی می‌کرد. صف نکن؛ خطای روشن بده
    // تا کاربر بداند فایل نزد خودش مانده و باید بعد از اتصال دوباره تلاش کند.
    if (req.body instanceof FormData) {
      console.warn(`[OfflineInterceptor] 📎 آپلود فایل در حالت آفلاین پشتیبانی نمی‌شود: ${req.method} ${req.url}`);
      req.context.set(OFFLINE_UPLOAD_UNSUPPORTED, true);
      return throwError(
        () =>
          new HttpErrorResponse({
            error: { detail: 'آپلود فایل در حالت آفلاین ممکن نیست. پس از برقراری اتصال دوباره تلاش کنید.' },
            status: 503,
            statusText: 'Offline - Upload Not Supported',
            url: req.url,
          })
      );
    }

    const fullUrl = req.url;

    // استخراج متادیتای هویتی برای صف و reconciliation (تسک ۳)
    let entityType: string | undefined = req.headers.get('X-Entity-Type') || undefined;
    let entitySyncId: string | undefined = req.headers.get('X-Entity-Sync-Id') || undefined;
    let baseUpdatedAt: string | undefined = req.headers.get('X-Base-Updated-At') || undefined;

    const lowerUrl = fullUrl.toLowerCase();
    if (!entityType) {
      // الگوهای نوع موجودیت را خود ماژول‌ها اعلام می‌کنند (offlineSync.entityTypeUrlPatterns)
      entityType = resolveEntityTypeFromUrl(lowerUrl);
    }

    let modifiedBody: any = req.body;
    if (req.body && typeof req.body === 'object') {
      const bodyObj = req.body as any;
      entitySyncId = entitySyncId || bodyObj.sync_id || bodyObj._offlineSyncId;
      baseUpdatedAt = baseUpdatedAt || bodyObj.base_updated_at || bodyObj.updated_at;
      if (!entitySyncId && req.method === 'POST') {
        entitySyncId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        modifiedBody = { ...bodyObj, sync_id: entitySyncId };
      }
    }

    return from(
      syncService.enqueue(req.method, fullUrl, modifiedBody, {
        entityType,
        entitySyncId,
        baseUpdatedAt,
      })
    ).pipe(
      switchMap((entry) => {
        console.log(`[OfflineInterceptor] 📥 ذخیره در صف آفلاین: ${req.method} ${fullUrl} [${entityType || 'unknown'}]`);

        // تولید شناسه معتبر محلی در پاسخ خوش‌بینانه متد POST (تسک ۸)
        const hasExistingId = modifiedBody && typeof modifiedBody === 'object' && (modifiedBody as any).id;
        const tempId = hasExistingId ? (modifiedBody as any).id : (entry.id ? -entry.id : -Date.now());

        const optimisticBody = {
          ...(typeof modifiedBody === 'object' && modifiedBody !== null ? modifiedBody : {}),
          id: tempId,
          _tempId: tempId,
          _offlineId: entry.id,
          _offlinePending: true,
          ...(entitySyncId ? { sync_id: entitySyncId } : {}),
        };

        return of(
          new HttpResponse({
            body: optimisticBody,
            status: 200,
            statusText: 'OK (Queued Offline)',
            url: req.url,
          })
        );
      })
    );
  };

  // ─── مسیر اصلی ───
  if (req.method === 'GET') {
    return handleGetSWR();
  }

  // ─── متدهای تغییری (POST / PUT / PATCH / DELETE) ───
  if (network.isBrowserOnline) {
    return next(req).pipe(
      switchMap(async (event) => {
        if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
          network.reportServerReachable();
          try {
            const rawUrl = req.url.split('?')[0];
            let currentPath = rawUrl.replace(/\/+$/, '');
            const apiMarker = currentPath.includes('/api') ? '/api' : '';
            const minLength = apiMarker ? currentPath.indexOf(apiMarker) + apiMarker.length : 1;
            while (currentPath.length > minLength) {
              await syncService.invalidateCache(currentPath);
              const slash = currentPath.lastIndexOf('/');
              if (slash <= 0) break;
              currentPath = currentPath.substring(0, slash);
            }
          } catch (e) {
            console.warn('[OfflineInterceptor] Error invalidating cache on mutation:', e);
          }
        }
        return event;
      }),
      catchError((error: HttpErrorResponse) => {
        if (isServerUnreachable(error.status)) {
          network.reportServerUnreachable();
          console.warn(
            `[OfflineInterceptor] 🌐 خطای اتصال در متد تغییری (${error.status})! ذخیره در صف آفلاین: ${req.method} ${req.url}`
          );
          return handleOfflineMutation();
        }
        network.reportServerReachable();
        return throwError(() => error);
      })
    );
  }

  return handleOfflineMutation();
};
