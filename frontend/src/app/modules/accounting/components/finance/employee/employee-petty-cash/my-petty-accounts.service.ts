import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { ApiService } from '../../../../../../core/api/api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { SKIP_OFFLINE } from '../../../../../../core/interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../../../../core/error/error.interceptor';

/** یک حساب «تن‌خواه من» (پاسخ کمینهٔ petty-cash-accounts/mine/) */
export interface MyPettyAccount {
  id: number;
  company: number | null;
  company_name: string | null;
  is_active: boolean;
  is_closed: boolean;
  role: 'custodian' | 'deputy';
}

export const MY_PETTY_ACCOUNTS_KEY = (uid: number) => `wh_my_petty_accounts:${uid}`;

function isRow(r: unknown): r is MyPettyAccount {
  const x = r as MyPettyAccount;
  return !!x && typeof x.id === 'number' && (x.role === 'custodian' || x.role === 'deputy');
}

/**
 * حساب‌های تن‌خواهی که کاربر صاحب یا جانشین فعال صاحب آن‌هاست (در همهٔ شرکت‌ها).
 * فهرست برای هر کاربر در localStorage می‌ماند تا منوی «تن‌خواه من» آفلاین هم دیده شود؛
 * فقط پاسخ موفق سرور جایگزینش می‌کند و هیچ خطایی آن را پاک نمی‌کند. خروج فقط حافظه را خالی می‌کند.
 */
@Injectable({ providedIn: 'root' })
export class MyPettyAccountsService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  /** فهرست تازه‌شده در همین نشست (برای همان کاربر) */
  private readonly fresh = signal<{ uid: number; rows: MyPettyAccount[] } | null>(null);
  private readonly userId = computed(() => {
    const id = this.auth.user()?.id;
    return typeof id === 'number' ? id : null;
  });

  /** همگام و بی‌انتظار: اگر هنوز تازه نشده از حافظهٔ محلی همان کاربر خوانده می‌شود (گارد مسیر هم به آن تکیه دارد) */
  readonly accounts = computed<MyPettyAccount[]>(() => {
    const uid = this.userId();
    if (uid === null) return [];
    const f = this.fresh();
    return f && f.uid === uid ? f.rows : this.readStored(uid);
  });
  readonly hasAccess = computed(() => this.accounts().length > 0);

  private inFlight = false;

  constructor() {
    effect(() => {
      const uid = this.userId();
      if (uid !== null) untracked(() => this.refresh());
    });
    if (typeof window !== 'undefined') {
      const onOnline = () => this.refresh();
      const onVisible = () => { if (document.visibilityState === 'visible') this.refresh(); };
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisible);
      inject(DestroyRef).onDestroy(() => {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisible);
      });
    }
  }

  /** دریافت از سرور؛ فقط پاسخ موفق فهرست و حافظهٔ محلی را جایگزین می‌کند. هرگز خطا پرتاب نمی‌کند. */
  refresh(): void {
    const uid = this.userId();
    if (uid === null || this.inFlight) return;
    this.inFlight = true;
    try {
      this.api.get<unknown>('personnel/petty-cash-accounts/mine/', undefined, {
        context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
      }).subscribe({
        next: (res) => {
          this.inFlight = false;
          if (!Array.isArray(res) || this.userId() !== uid) return;
          const rows = res.filter(isRow);
          this.fresh.set({ uid, rows });
          try { localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(uid), JSON.stringify(rows)); } catch { /* حافظهٔ پر: فهرست حافظه می‌ماند */ }
        },
        // خطا (آفلاین، ۵xx یا ۴xx): فهرست قبلی دست نمی‌خورد
        error: () => { this.inFlight = false; }
      });
    } catch {
      this.inFlight = false;
    }
  }

  private readStored(uid: number): MyPettyAccount[] {
    try {
      const raw = localStorage.getItem(MY_PETTY_ACCOUNTS_KEY(uid));
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter(isRow) : [];
    } catch {
      return [];
    }
  }
}
