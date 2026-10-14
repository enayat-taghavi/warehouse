import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { ModuleRegistryService, FrontendModuleSpec } from '../../../../core/modules/module-registry.service';
import { ConfigApiService } from '../../../../core/api/config-api.service';

export interface AppLauncherCard {
  code: string;
  title: string;
  routePrefix: string;
  icon: string;
  description: string;
  hasAccess: boolean;
  tags: string[];
  themeColor: 'indigo' | 'emerald' | 'cyan';
}

import { FirstBootWizardComponent } from '../operations/first-boot-wizard/first-boot-wizard';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-launcher',
  standalone: true,
  imports: [CommonModule, FirstBootWizardComponent, SvgIconDirective],
  templateUrl: './app-launcher.html'
})
export class AppLauncherComponent implements OnInit {
  public auth = inject(AuthService);
  public persona = inject(AppPersonaService);
  public moduleRegistry = inject(ModuleRegistryService);
  private configApi = inject(ConfigApiService);
  private router = inject(Router);
  private store = inject(AuthStore);

  ngOnInit(): void {
    // استعلام بلادرنگ وضعیت ماژول‌های فعال سرور جهت بازتاب فوری در کارت‌ها
    this.configApi.getPublicConfig().subscribe({
      error: () => {}
    });
  }

  get userName(): string {
    return this.auth.userName() || this.auth.user()?.username || 'کاربر گرامی';
  }

  get userRoleTitles(): string[] {
    return this.auth.userRoleTitles();
  }

  get isSuperuser(): boolean {
    return this.persona.isSuperuser();
  }

  /**
   * ساخت پویا و ماژولار کارت‌های برنامه‌ها بر پایه نقطه توسعه launcherTile
   */
  public appCards = computed<AppLauncherCard[]>(() => {
    const installed = this.moduleRegistry.getInstalledModules();
    const allowed = this.auth.user()?.allowed_apps;

    return installed.map(mod => {
      const tile = mod.extensions?.launcherTile;
      const appKey = tile?.appKey || mod.code;
      const hasAccess = this.persona.canAccessApp(appKey);
      const themeColor = tile?.themeColor || 'indigo';
      const tags = tile?.tags || ['کارتابل', 'مدیریت'];

      return {
        code: appKey,
        title: mod.titleFa,
        routePrefix: mod.routePrefix,
        icon: mod.icon,
        description: mod.descriptionFa,
        hasAccess,
        tags,
        themeColor
      };
    }).filter(card => {
      const spec = this.moduleRegistry.getSpec(card.code);
      // عملیات (فقط سوپریوزر) در allowed_apps توکن نیست؛ همان شرط کاشی قالب (hasOperations) را می‌گیرد
      if (spec?.isSuperuserOnly) return this.hasOperations;

      // فیلتر بر اساس allowed_apps اعلامی در توکن کاربر
      if (allowed && Array.isArray(allowed) && allowed.length > 0) {
        const normAllowed = allowed.map(a => a.toLowerCase());
        const matches = normAllowed.includes(card.code.toLowerCase()) ||
          (spec?.code && normAllowed.includes(spec.code.toLowerCase())) ||
          spec?.aliases?.some(a => normAllowed.includes(a.toLowerCase()));
        if (!matches && (normAllowed.includes('warehouse') || normAllowed.includes('finance') || normAllowed.includes('personnel'))) {
          return false;
        }
      }

      return true;
    });
  });

  /**
   * تعداد کل کارت‌های قابل نمایش در این محیط
   */
  get visibleCardsCount(): number {
    return this.appCards().length;
  }

  get isSingleAppMode(): boolean {
    return this.visibleCardsCount === 1;
  }

  get gridContainerClass(): string {
    if (this.visibleCardsCount === 1) {
      return 'max-w-xl mx-auto';
    }
    if (this.visibleCardsCount === 2) {
      return 'md:grid-cols-2 max-w-4xl mx-auto';
    }
    return 'md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto';
  }

  get isWarehouseInstalled(): boolean {
    return this.appCards().some(c => c.code === 'warehouse');
  }

  get isFinanceInstalled(): boolean {
    return this.appCards().some(c => c.code === 'personnel' || c.code === 'accounting');
  }

  enterApp(code: string): void {
    if (!this.persona.canAccessApp(code)) return;
    this.store.setWarehouseContext(false);
    this.persona.switchApp(code);
  }

  // سازگاری رو به عقب (Backward-compatibility)
  get hasWarehouse(): boolean {
    return this.persona.hasWarehouseAccess();
  }

  get hasFinance(): boolean {
    return this.persona.hasPersonnelAccess();
  }

  get hasOperations(): boolean {
    return this.persona.hasOperationsAccess();
  }

  enterWarehouse(): void {
    this.enterApp('warehouse');
  }

  enterFinance(): void {
    this.enterApp('personnel');
  }

  enterOperations(): void {
    this.enterApp('operations');
  }

  logout(): void {
    this.auth.logout();
  }
}
