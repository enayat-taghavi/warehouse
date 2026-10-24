import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { PermissionApiService } from '../api/permission-api.service';
import { OrgStructureApiService } from '../api/org-structure-api.service';
import { WebSocketService } from '../http/websocket.service';
import { isServerUnreachable } from './server-reachability';
import {
  PermissionCatalog,
  PermissionMap,
  PermissionSpec,
  PermissionsUpdatedEvent,
} from '../models/permission.model';
import { AuthUserProfile } from '../models/api-response.model';

/** پیوند بخش به پروژه و شرکتش (از «بخش‌های من») */
export interface SectionLink {
  project_id: number | null;
  company_id: number | null;
}

/** کلیدهای حافظهٔ محلی؛ هر کاربر جدا. هرگز پاک نمی‌شوند، فقط با دادهٔ تازهٔ سرور جایگزین می‌شوند (ق۳). */
export const PERMISSION_STORAGE_KEYS = {
  map: (userId: number) => `wh_perm_map_u${userId}`,
  sections: (userId: number) => `wh_perm_sections_u${userId}`,
  catalog: (userId: number) => `wh_perm_catalog_u${userId}`,
};

const SUPERUSER_MARKER = 'admin_all';

function readJson<T>(key: string): T | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function isPermissionMap(v: unknown): v is PermissionMap {
  const m = v as PermissionMap;
  return !!m && typeof m === 'object' && Array.isArray(m.all) && Array.isArray(m.system)
    && !!m.company && !!m.project && !!m.section;
}

/**
 * سرویس مرکزی مجوزهای ریز در فرانت (ت۷). منبع: نقشهٔ سرور
 * (`user.permission_map` لاگین، سپس `accounts/my-permissions/`). فرانت فقط نتیجهٔ سرور را می‌خواند؛
 * سرور هر کار را دوباره می‌سنجد.
 *
 * `can(code, sectionId)` = اجتماع ساده: سامانه‌ای ∪ شرکتِ بخش ∪ پروژهٔ بخش ∪ خودِ بخش. superuser همیشه true.
 * پیوند بخش → پروژه → شرکت از «بخش‌های من» (`org/section-assignments/my-sections/`) می‌آید و
 * کنار نقشه برای کار آفلاین ذخیره می‌شود.
 *
 * `AuthService.userPermissions` / `hasPermission` همان فهرست `all` را دارند (با هر تازه‌سازی همگام می‌شوند)،
 * پس منوها و گاردهای فعلی بی‌تغییر کار می‌کنند: «دست‌کم در یک بخش دارد».
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(PermissionApiService);
  private readonly orgApi = inject(OrgStructureApiService);
  private readonly injector = inject(Injector);

  private readonly _map = signal<PermissionMap | null>(null);
  private readonly _sections = signal<Record<string, SectionLink>>({});
  private readonly _catalog = signal<PermissionCatalog | null>(null);
  private readonly _isStale = signal(false);

  /** نقشهٔ جاری (null پیش از ورود یا اگر هیچ نقشه‌ای در دست نیست) */
  readonly map = this._map.asReadonly();
  /** فهرست کامل مجوزها و دسته‌ها؛ فقط برای کسی که سرور اجازهٔ خواندنش را بدهد */
  readonly catalog = this._catalog.asReadonly();
  /** آخرین تلاش تازه‌سازی به سرور نرسید؛ نقشهٔ ذخیره‌شده در کار است */
  readonly isStale = this._isStale.asReadonly();
  readonly version = computed(() => this._map()?.version ?? null);
  readonly isSuperuser = computed(() => this._map()?.is_superuser === true || this.auth.isSuperuser());
  /** اجتماع همهٔ مجوزها؛ بدون نقشه، همان فهرست پروفایل لاگین */
  readonly all = computed<ReadonlySet<string>>(() => new Set(this._map()?.all ?? this.auth.userPermissions()));

  /** هر رویداد `permissions_updated` (کانال شخصی یا شرکت)؛ برای صفحهٔ کاربران (ج۲) */
  readonly permissionsChanged$ = new Subject<PermissionsUpdatedEvent>();
  /** هر رویداد `users_changed` (ساخت/ویرایش/حذف کاربر روی کانال شرکت)؛ برای تازه‌سازی صفحهٔ کاربران */
  readonly usersChanged$ = new Subject<PermissionsUpdatedEvent>();

  private userId: number | null = null;
  private catalogDenied = false;
  private inFlight: Promise<boolean> | null = null;
  private wsSub: Subscription | null = null;
  private onlineListener: (() => void) | null = null;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => this.syncFromAuth(user));
    });
  }

  /**
   * راه‌اندازی یک‌باره در پوسته: گوش دادن به وب‌سوکت و برگشت شبکه.
   * (جدا از سازنده تا وابستگی چرخه‌ای WebSocketService → AuthService پیش نیاید)
   */
  start(): void {
    if (!this.wsSub) {
      const ws = this.injector.get(WebSocketService, null);
      if (ws) this.wsSub = ws.notifications$.subscribe((msg) => this.handleSocketMessage(msg));
    }
    if (!this.onlineListener && typeof window !== 'undefined') {
      this.onlineListener = () => { void this.refresh(); };
      window.addEventListener('online', this.onlineListener);
    }
    void this.refresh();
  }

  // ────────── پرسش‌ها ──────────

  /**
   * آیا کاربر مجوز `code` را دارد؟ بدون `sectionId`: «دست‌کم در یک بخش» (یا سامانه‌ای).
   * با `sectionId`: مجوز سامانه‌ای، یا مجوز بخشی از انتساب همان بخش / پروژه‌اش / شرکتش.
   */
  can(code: string, sectionId?: number | null): boolean {
    if (!code) return false;
    if (this.isSuperuser()) return true;
    const m = this._map();
    if (!m) {
      const perms = this.auth.userPermissions();
      return perms.includes(SUPERUSER_MARKER) || perms.includes(code);
    }
    if (sectionId === undefined || sectionId === null) return this.all().has(code);
    if (m.system.includes(code)) return true;
    if (m.section[String(sectionId)]?.includes(code)) return true;
    const link = this._sections()[String(sectionId)];
    if (!link) return false;
    if (link.project_id != null && m.project[String(link.project_id)]?.includes(code)) return true;
    if (link.company_id != null && m.company[String(link.company_id)]?.includes(code)) return true;
    return false;
  }

  canAny(codes: readonly string[], sectionId?: number | null): boolean {
    return (codes || []).some((c) => this.can(c, sectionId));
  }

  /** شناسهٔ بخش‌هایی (از «بخش‌های من») که کاربر در آن‌ها `code` را دارد */
  sectionsWith(code: string): number[] {
    return Object.keys(this._sections()).map(Number).filter((sid) => this.can(code, sid));
  }

  /** کدهای یک دستهٔ ماژول (از فهرست کامل؛ بدون فهرست، تهی) */
  categoryCodes(module: string, categoryKey: string): string[] {
    const cat = this._catalog();
    if (!cat) return [];
    return cat.permissions.filter((p) => p.module === module && p.category === categoryKey).map((p) => p.code);
  }

  /** دست‌کم یکی از مجوزهای دستهٔ `categoryKey` ماژول `module` را دارد (ت۵) */
  hasInCategory(module: string, categoryKey: string): boolean {
    const codes = this.categoryCodes(module, categoryKey);
    if (codes.length === 0) return false;
    if (this.isSuperuser()) return true;
    const all = this.all();
    return codes.some((c) => all.has(c));
  }

  /** منوی `menuKey` ماژول `module` با داشتن دست‌کم یک مجوز از دسته‌ای که آن منو را باز می‌کند (ت۵) */
  menuUnlocked(module: string | undefined, menuKey: string): boolean {
    const cat = this._catalog();
    if (!cat || !menuKey) return false;
    return cat.categories
      .filter((c) => c.menu === menuKey && (!module || c.module === module))
      .some((c) => this.hasInCategory(c.module, c.key));
  }

  /** مشخصات یک مجوز از فهرست کامل (برای عنوان فارسی و دسته) */
  spec(code: string): PermissionSpec | undefined {
    return this._catalog()?.permissions.find((p) => p.code === code);
  }

  // ────────── بارگذاری و تازه‌سازی ──────────

  /**
   * نقشهٔ تازه را از سرور می‌گیرد و فقط در صورت موفقیت جایگزین می‌کند. خطا/آفلاین هیچ‌چیز را پاک نمی‌کند.
   * خروجی: true اگر نقشه عوض شد.
   */
  refresh(): Promise<boolean> {
    if (!this.userId) return Promise.resolve(false);
    if (this.inFlight) {
      // رویدادی وسط درخواست رسید؛ پس از پایان یک بار دیگر خوانده می‌شود
      this.refreshAgain = true;
      return this.inFlight;
    }
    const uid = this.userId;
    this.inFlight = (async () => {
      let changed = false;
      try {
        const fresh = await firstValueFrom(this.api.getMyPermissions(true));
        if (uid !== this.userId || !isPermissionMap(fresh)) return false;
        this._isStale.set(false);
        changed = this.applyMap(uid, fresh, true);
      } catch (err: any) {
        if (isServerUnreachable(err?.status ?? 0)) this._isStale.set(true);
        return false;
      }
      await this.refreshSections(uid, changed);
      void this.ensureCatalog();
      return changed;
    })().finally(() => {
      this.inFlight = null;
      if (this.refreshAgain) {
        this.refreshAgain = false;
        void this.refresh();
      }
    });
    return this.inFlight;
  }
  private refreshAgain = false;

  /**
   * فهرست کامل مجوزها را (یک بار در هر نشست، یا با `force`) می‌خواند. اگر سرور اجازه ندهد (403)،
   * دیگر تلاش نمی‌شود و نسخهٔ ذخیره‌شده (اگر هست) می‌ماند.
   */
  async ensureCatalog(force = false): Promise<PermissionCatalog | null> {
    const uid = this.userId;
    if (!uid) return this._catalog();
    if (!force && (this.catalogDenied || this.catalogFresh)) return this._catalog();
    try {
      const cat = await firstValueFrom(this.api.getCatalog(true));
      if (uid !== this.userId || !cat || !Array.isArray(cat.permissions)) return this._catalog();
      this.catalogFresh = true;
      this._catalog.set(cat);
      writeJson(PERMISSION_STORAGE_KEYS.catalog(uid), cat);
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (status === 401 || status === 403) this.catalogDenied = true;
    }
    return this._catalog();
  }
  private catalogFresh = false;

  // ────────── داخلی ──────────

  /** همگام با کاربر AuthService: تعویض کاربر → بارگذاری نقشهٔ ذخیره‌شدهٔ همان کاربر */
  syncFromAuth(user: AuthUserProfile | null): void {
    const uid = typeof user?.id === 'number' ? user.id : null;
    if (uid !== this.userId) {
      this.userId = uid;
      this.catalogDenied = false;
      this.catalogFresh = false;
      this._isStale.set(false);
      if (!uid) {
        // خروج: فقط حالت حافظه خالی می‌شود؛ حافظهٔ محلی کاربر دست نمی‌خورد
        this._map.set(null);
        this._sections.set({});
        this._catalog.set(null);
        return;
      }
      const stored = readJson<PermissionMap>(PERMISSION_STORAGE_KEYS.map(uid));
      this._map.set(isPermissionMap(stored) ? stored : null);
      this._sections.set(readJson<Record<string, SectionLink>>(PERMISSION_STORAGE_KEYS.sections(uid)) || {});
      this._catalog.set(readJson<PermissionCatalog>(PERMISSION_STORAGE_KEYS.catalog(uid)));
    }
    if (!uid) return;
    // نقشهٔ پروفایل (لاگین تازه، یا همگام‌شده با آخرین تازه‌سازی) اگر نسخه‌اش فرق دارد جایگزین می‌شود
    const fromProfile = user?.permission_map;
    if (isPermissionMap(fromProfile) && (!this._map() || fromProfile.version !== this._map()!.version)) {
      this.applyMap(uid, fromProfile, false);
    }
  }

  /** جایگزینی نقشه با دادهٔ معتبر سرور + ذخیره + همگام‌سازی فهرست AuthService */
  private applyMap(uid: number, fresh: PermissionMap, syncProfile: boolean): boolean {
    const prev = this._map();
    const changed = !prev || !fresh.version || prev.version !== fresh.version;
    if (changed) this._map.set(fresh);
    writeJson(PERMISSION_STORAGE_KEYS.map(uid), fresh);
    if (syncProfile && changed) {
      const permissions = fresh.is_superuser && !fresh.all.includes(SUPERUSER_MARKER)
        ? [...fresh.all, SUPERUSER_MARKER]
        : [...fresh.all];
      this.auth.updateUser({ permissions, permission_map: fresh });
    }
    return changed;
  }

  /** پیوند بخش → پروژه/شرکت؛ فقط وقتی انتساب سطح شرکت/پروژه هست یا نقشه عوض شده یا پیوندی نداریم */
  private async refreshSections(uid: number, mapChanged: boolean): Promise<void> {
    const m = this._map();
    if (!m || m.is_superuser) return;
    const needsLinks = Object.keys(m.company).length > 0 || Object.keys(m.project).length > 0;
    if (!needsLinks) return;
    if (!mapChanged && Object.keys(this._sections()).length > 0 && !this.sectionsStale) return;
    try {
      const rows = await firstValueFrom(this.orgApi.getMySections());
      if (uid !== this.userId || !Array.isArray(rows)) return;
      const links: Record<string, SectionLink> = {};
      for (const r of rows) {
        if (r?.id == null) continue;
        links[String(r.id)] = {
          project_id: r.project_id ?? r.project ?? null,
          company_id: r.company_id ?? null,
        };
      }
      this.sectionsStale = false;
      this._sections.set(links);
      writeJson(PERMISSION_STORAGE_KEYS.sections(uid), links);
    } catch {
      // نسخهٔ ذخیره‌شده می‌ماند
    }
  }
  private sectionsStale = true;

  private handleSocketMessage(msg: any): void {
    const type = msg?.type_str || msg?.type || msg?.event;
    if (type === 'users_changed') {
      const changedId = msg.user_id == null ? null : Number(msg.user_id);
      const changedCompany = msg.company_id == null ? null : Number(msg.company_id);
      this.usersChanged$.next({ user_id: changedId, reason: msg.reason, company_id: changedCompany, own: changedId !== null && changedId === this.userId });
      return;
    }
    if (type !== 'permissions_updated') return;
    const userId = msg.user_id == null ? null : Number(msg.user_id);
    const own = userId !== null && userId === this.userId;
    const companyId = msg.company_id == null ? null : Number(msg.company_id);
    this.permissionsChanged$.next({ user_id: userId, reason: msg.reason, company_id: companyId, own });
    if (own) {
      this.sectionsStale = msg.reason === 'assignment' || this.sectionsStale;
      void this.refresh();
    }
  }
}
