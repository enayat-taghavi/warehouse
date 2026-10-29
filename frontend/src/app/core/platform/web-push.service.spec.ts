// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { WebPushService, WEB_PUSH_LOGOUT_TIMEOUT_MS } from './web-push.service';
import { environment } from '../../../environments/environment';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const SUB_URL = `${environment.apiUrl}/notifications/webpush/subscriptions/`;
const KEY_URL = `${environment.apiUrl}/notifications/webpush/key/`;

function fakeSub(endpoint = 'https://fcm.googleapis.com/fcm/send/abc'): PushSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  } as unknown as PushSubscription;
}

describe('WebPushService', () => {
  let sub$: BehaviorSubject<PushSubscription | null>;
  let swPush: { isEnabled: boolean; subscription: any; requestSubscription: any; unsubscribe: any };
  let http: { get: any; post: any; delete: any };
  const origUA = navigator.userAgent;

  function setUA(ua: string) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  }

  function create(): WebPushService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: SwPush, useValue: swPush },
      ],
    });
    return TestBed.inject(WebPushService);
  }

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    (window as any).PushManager = function () {};
    (window as any).Notification = { permission: 'default' };
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any;
    sub$ = new BehaviorSubject<PushSubscription | null>(null);
    swPush = {
      isEnabled: true,
      subscription: sub$.asObservable(),
      requestSubscription: vi.fn(async () => {
        (window as any).Notification.permission = 'granted';
        const s = fakeSub();
        sub$.next(s);
        return s;
      }),
      unsubscribe: vi.fn(async () => {
        sub$.next(null);
      }),
    };
    http = {
      get: vi.fn().mockReturnValue(of({ public_key: 'BPUBKEY' })),
      post: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of(null)),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    delete (window as any).PushManager;
    delete (window as any).Notification;
    setUA(origUA);
  });

  it('native app: unsupported and every method is a no-op', async () => {
    (globalThis as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    const svc = create();
    expect(svc.state()).toBe('unsupported');
    expect(svc.permission()).toBeNull();
    const res = await svc.enable();
    expect(res.ok).toBe(false);
    await svc.disable();
    await svc.syncOnStart();
    await svc.unsubscribeOnLogout();
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
    expect(http.delete).not.toHaveBeenCalled();
    expect(swPush.requestSubscription).not.toHaveBeenCalled();
  });

  it('service worker disabled: unsupported', () => {
    swPush.isEnabled = false;
    expect(create().state()).toBe('unsupported');
  });

  it('iPhone outside standalone: ios-needs-install, enable does not request a subscription', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1');
    const svc = create();
    expect(svc.state()).toBe('ios-needs-install');
    const res = await svc.enable();
    expect(res.ok).toBe(false);
    expect(swPush.requestSubscription).not.toHaveBeenCalled();
  });

  it('iPadOS (Macintosh + touch) in standalone mode is supported (off)', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15');
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as any;
    try {
      expect(create().state()).toBe('off');
    } finally {
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    }
  });

  it('denied permission: blocked', () => {
    (window as any).Notification.permission = 'denied';
    expect(create().state()).toBe('blocked');
  });

  it('enable gets the key, requests a subscription and posts it', async () => {
    const svc = create();
    expect(svc.state()).toBe('off');
    const res = await svc.enable();
    expect(res.ok).toBe(true);
    expect(http.get).toHaveBeenCalledWith(KEY_URL, expect.anything());
    expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'BPUBKEY' });
    expect(http.post).toHaveBeenCalledWith(
      SUB_URL,
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } },
      expect.anything()
    );
    expect(svc.state()).toBe('on');
    expect(svc.busy()).toBe(false);
  });

  it('enable with an empty server key stays off and does not subscribe', async () => {
    http.get.mockReturnValue(of({ public_key: '' }));
    const svc = create();
    const res = await svc.enable();
    expect(res.ok).toBe(false);
    expect(res.messageFa).toBeTruthy();
    expect(swPush.requestSubscription).not.toHaveBeenCalled();
    expect(svc.state()).toBe('off');
  });

  it('enable: permission denied in the prompt sets blocked', async () => {
    swPush.requestSubscription.mockImplementation(async () => {
      (window as any).Notification.permission = 'denied';
      throw new DOMException('denied', 'NotAllowedError');
    });
    const svc = create();
    const res = await svc.enable();
    expect(res.ok).toBe(false);
    expect(svc.state()).toBe('blocked');
  });

  it('enable: POST failure unsubscribes locally and reports the server detail', async () => {
    http.post.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { detail: 'SERVER-DETAIL' } }))
    );
    const svc = create();
    const res = await svc.enable();
    expect(res).toEqual({ ok: false, messageFa: 'SERVER-DETAIL' });
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(svc.state()).toBe('off');
  });

  it('enable: unreachable server (Cloudflare 530) gives the offline message, not the raw detail', async () => {
    http.post.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 530, error: { detail: 'SERVER-DETAIL' } }))
    );
    const res = await create().enable();
    expect(res.ok).toBe(false);
    expect(res.messageFa).not.toBe('SERVER-DETAIL');
    expect(swPush.unsubscribe).toHaveBeenCalled();
  });

  it('disable deletes on the server and unsubscribes', async () => {
    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    const svc = create();
    expect(svc.state()).toBe('on');
    const res = await svc.disable();
    expect(res.ok).toBe(true);
    expect(http.delete).toHaveBeenCalledWith(SUB_URL, expect.objectContaining({ body: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' } }));
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(svc.state()).toBe('off');
  });

  it('disable still unsubscribes when DELETE fails (404)', async () => {
    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    http.delete.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const svc = create();
    const res = await svc.disable();
    expect(res.ok).toBe(true);
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(svc.state()).toBe('off');
  });

  it('syncOnStart posts the existing subscription when permission is granted', async () => {
    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    const svc = create();
    await svc.syncOnStart();
    expect(http.post).toHaveBeenCalledWith(SUB_URL, expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }), expect.anything());
  });

  it('syncOnStart does nothing without permission or subscription, and swallows errors', async () => {
    const svc = create();
    await svc.syncOnStart();
    expect(http.post).not.toHaveBeenCalled();

    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    http.post.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await expect(svc.syncOnStart()).resolves.toBeUndefined();
  });

  it('unsubscribeOnLogout starts DELETE synchronously, then unsubscribes', async () => {
    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    const svc = create();
    const p = svc.unsubscribeOnLogout();
    expect(http.delete).toHaveBeenCalledTimes(1);
    await p;
    expect(swPush.unsubscribe).toHaveBeenCalled();
  });

  it('unsubscribeOnLogout resolves on DELETE error', async () => {
    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    http.delete.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    swPush.unsubscribe.mockRejectedValue(new Error('x'));
    await expect(create().unsubscribeOnLogout()).resolves.toBeUndefined();
  });

  it('unsubscribeOnLogout resolves after the timeout when DELETE hangs', async () => {
    vi.useFakeTimers();
    (window as any).Notification.permission = 'granted';
    sub$.next(fakeSub());
    http.delete.mockReturnValue(NEVER);
    const svc = create();
    let done = false;
    svc.unsubscribeOnLogout().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(WEB_PUSH_LOGOUT_TIMEOUT_MS - 100);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
  });
});
