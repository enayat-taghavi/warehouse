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
   * آیا ماژول انبارداری در این توزیع سرور اجرا شده و فعال است؟
   */
  get isWarehouseInstalled(): boolean {
    const fromRegistry = this.moduleRegistry.isModuleInstalled('warehouse');
    if (!fromRegistry) return false;

    // بررسی گارد allowed_apps توکن کاربر
    const allowed = this.auth.user()?.allowed_apps;
    if (allowed && Array.isArray(allowed) && allowed.length > 0) {
      const hasWh = allowed.some(a => a.toLowerCase() === 'warehouse' || a.toLowerCase() === 'wh');
      if (!hasWh && (allowed.includes('finance') || allowed.includes('personnel'))) {
        return false;
      }
    }
    return true;
  }

  /**
   * آیا ماژول مالی و حسابداری در این توزیع سرور اجرا شده و فعال است؟
   */
  get isFinanceInstalled(): boolean {
    const fromRegistry = this.moduleRegistry.isModuleInstalled('accounting');
    if (!fromRegistry) return false;

    // بررسی گارد allowed_apps توکن کاربر
    const allowed = this.auth.user()?.allowed_apps;
    if (allowed && Array.isArray(allowed) && allowed.length > 0) {
      const hasFin = allowed.some(a => a.toLowerCase() === 'finance' || a.toLowerCase() === 'personnel' || a.toLowerCase() === 'accounting');
      if (!hasFin && allowed.includes('warehouse')) {
        return false;
      }
    }
    return true;
  }

  /**
   * تعداد کل کارت‌های قابل نمایش در این محیط
   */
  get visibleCardsCount(): number {
    return (this.isWarehouseInstalled ? 1 : 0) +
           (this.isFinanceInstalled ? 1 : 0) +
           (this.hasOperations ? 1 : 0);
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

  /**
   * ساخت پویا و ماژولار کارت‌های برنامه‌ها بر پایه رجیستری — فاز ۶ (تسک ۵۷)
   */
  public appCards = computed<AppLauncherCard[]>(() => {
    const installed = this.moduleRegistry.getInstalledSpecs();
    return installed.map(spec => {
      const isOps = spec.code === 'operations';
      const isAcct = spec.code === 'accounting';
      const appKey = isAcct ? 'personnel' : spec.code;
      const hasAccess = this.persona.canAccessApp(appKey);

      let themeColor: 'indigo' | 'emerald' | 'cyan' = 'indigo';
      let tags: string[] = ['کارتابل', 'مدیریت'];

      if (isOps) {
        themeColor = 'cyan';
        tags = ['اسنپ‌شات‌ها', 'پایش سلامت', 'امنیت'];
      } else if (isAcct) {
        themeColor = 'emerald';
        tags = ['کارتابل مالی', 'ثبت کارکرد', 'خزانه‌داری'];
      } else {
        themeColor = 'indigo';
        tags = ['کارتابل انبارگردان', 'مدیریت کالا'];
      }

      return {
        code: appKey,
        title: spec.titleFa,
        routePrefix: spec.routePrefix,
        icon: spec.icon,
        description: spec.descriptionFa,
        hasAccess,
        tags,
        themeColor
      };
    }).filter(card => {
      // عملیات فقط برای سوپریوزر نمایش داده می‌شود
      if (card.code === 'operations' && !this.persona.isSuperuser()) return false;
      return true;
    });
  });

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
