import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CustomRouteReuseStrategy } from '../strategies/custom-route-reuse-strategy';

/**
 * Auth Store — حالت مرکزی احراز هویت با Angular Signals
 * 
 * این store وضعیت UI مربوط به auth را نگه می‌دارد.
 * دیتای اصلی auth در AuthService مدیریت می‌شود.
 * 
 * مثال استفاده:
 *   readonly store = inject(AuthStore);
 *   // در template: {{ store.activeWarehouseId() }}
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  /** ID انبار فعال — 'ALL' برای نمایش تجمیعی */
  private readonly _activeWarehouseId = signal<number | string | null>(
    (() => {
      const val = localStorage.getItem('wh_active_id');
      if (!val || val === 'null' || val === 'undefined') return 'ALL';
      if (val === 'ALL') return 'ALL';
      return isNaN(+val) ? val : +val;
    })()
  );

  private readonly router = inject(Router);
  
  /** تب فعلی sidebar */
  private readonly _currentTab = signal<string>('dashboard');
  
  /** وضعیت sidebar موبایل */
  private readonly _isSidebarOpen = signal(false);

  /** آیا کاربر در محیط (Context) یک انبار خاص قرار دارد؟ */
  private readonly _isWarehouseContext = signal<boolean>(
    localStorage.getItem('wh_context') === 'true'
  );

  /** آخرین تب استفاده شده برای بازگشت هوشمند */
  private readonly _lastWarehouseTab = signal<string>(
    localStorage.getItem('wh_last_tab') || 'dashboard'
  );
  
  /** آیا در حال جابجایی بین انبارها از طریق سایدبار هستیم؟ */
  private readonly _isSwitchingWarehouse = signal<boolean>(false);

  // ── Computed ──
  readonly activeWarehouseId = this._activeWarehouseId.asReadonly();
  readonly currentTab = this._currentTab.asReadonly();
  readonly isSidebarOpen = this._isSidebarOpen.asReadonly();
  readonly isWarehouseContext = this._isWarehouseContext.asReadonly();
  readonly lastWarehouseTab = this._lastWarehouseTab.asReadonly();
  readonly isSwitchingWarehouse = this._isSwitchingWarehouse.asReadonly();
  readonly isAllWarehouses = computed(() => this._activeWarehouseId() === 'ALL');

  // ── Actions ──
  setActiveWarehouse(id: number | string | null): void {
    const currentId = this._activeWarehouseId();
    if (currentId !== id) {
      this._activeWarehouseId.set(id);
      if (id) {
        localStorage.setItem('wh_active_id', id.toString());
      } else {
        localStorage.removeItem('wh_active_id');
      }

      // Clear cached routes so tabs reload fresh data
      const strategy = this.router.routeReuseStrategy as CustomRouteReuseStrategy;
      if (strategy && typeof strategy.clear === 'function') {
        strategy.clear();
      }
    }
  }

  /**
   * خودترمیمی انبار فعال: بررسی معتبر بودن شناسه ذخیره‌شده در برابر لیست واقعی انبارها.
   * در صورتی که انبار انتخابی حذف شده باشد، خودکار به اولین انبار معتبر یا ALL سوئیچ می‌کند.
   */
  sanitizeActiveWarehouse(validWarehouses: { id: number | string }[]): number | string | null {
    const currentId = this._activeWarehouseId();
    if (!currentId || currentId === 'ALL') {
      return currentId;
    }

    const exists = Array.isArray(validWarehouses) && validWarehouses.some(w => String(w.id) === String(currentId));
    if (!exists) {
      const fallbackId = validWarehouses && validWarehouses.length > 0 ? validWarehouses[0].id : 'ALL';
      console.warn(`[AuthStore] 🔄 انبار با شناسه ${currentId} نامعتبر یا حذف‌شده است. خودترمیمی به ${fallbackId}`);
      this.setActiveWarehouse(fallbackId);
      return fallbackId;
    }
    return currentId;
  }

  setCurrentTab(tab: string): void {
    this._currentTab.set(tab);
  }

  setWarehouseContext(isContext: boolean): void {
    this._isWarehouseContext.set(isContext);
    localStorage.setItem('wh_context', isContext ? 'true' : 'false');
  }

  openSidebar(): void {
    this._isSidebarOpen.set(true);
  }

  closeSidebar(): void {
    this._isSidebarOpen.set(false);
  }

  setLastWarehouseTab(tab: string): void {
    this._lastWarehouseTab.set(tab);
    localStorage.setItem('wh_last_tab', tab);
  }

  setIsSwitchingWarehouse(isSwitching: boolean): void {
    this._isSwitchingWarehouse.set(isSwitching);
  }

  toggleSidebar(): void {
    this._isSidebarOpen.update((v) => !v);
  }
}
