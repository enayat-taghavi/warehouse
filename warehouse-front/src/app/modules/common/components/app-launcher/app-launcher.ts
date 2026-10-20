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
  themeColor: 'indigo' | 'emerald' | 'cyan' | 'amber' | 'rose' | 'sky' | 'violet' | string;
  isRich?: boolean;
}

export interface LauncherThemeClasses {
  cardBorder: string;
  iconBg: string;
  iconBorder: string;
  glowBg: string;
  titleHover: string;
  routeColor: string;
  buttonBg: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  badgeDot: string;
}

export const LAUNCHER_THEMES: Record<string, LauncherThemeClasses> = {
  indigo: {
    cardBorder: 'border-indigo-500/30 hover:border-indigo-500/70 hover:shadow-indigo-500/10',
    iconBg: 'bg-indigo-500/15',
    iconBorder: 'border-indigo-500/30 text-indigo-400',
    glowBg: 'bg-indigo-500/10 group-hover:bg-indigo-500/20',
    titleHover: 'group-hover:text-indigo-300',
    routeColor: 'text-indigo-400/90',
    buttonBg: 'bg-indigo-700 hover:bg-indigo-800 text-white shadow-indigo-700/25',
    badgeBg: 'bg-indigo-500/15',
    badgeText: 'text-indigo-400',
    badgeBorder: 'border-indigo-500/30',
    badgeDot: 'bg-indigo-400'
  },
  emerald: {
    cardBorder: 'border-emerald-500/30 hover:border-emerald-500/70 hover:shadow-emerald-500/10',
    iconBg: 'bg-emerald-500/15',
    iconBorder: 'border-emerald-500/30 text-emerald-400',
    glowBg: 'bg-emerald-500/10 group-hover:bg-emerald-500/20',
    titleHover: 'group-hover:text-emerald-300',
    routeColor: 'text-emerald-400/90',
    buttonBg: 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/25',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
    badgeDot: 'bg-emerald-400'
  },
  cyan: {
    cardBorder: 'border-cyan-500/40 hover:border-cyan-400 hover:shadow-cyan-500/15',
    iconBg: 'bg-cyan-500/15',
    iconBorder: 'border-cyan-500/30 text-cyan-400',
    glowBg: 'bg-cyan-500/15 group-hover:bg-cyan-500/25',
    titleHover: 'group-hover:text-cyan-300',
    routeColor: 'text-cyan-400/90',
    buttonBg: 'bg-cyan-700 hover:bg-cyan-800 text-white shadow-cyan-700/25',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-300',
    badgeBorder: 'border-cyan-500/30',
    badgeDot: 'bg-cyan-400'
  },
  amber: {
    cardBorder: 'border-amber-500/30 hover:border-amber-500/70 hover:shadow-amber-500/10',
    iconBg: 'bg-amber-500/15',
    iconBorder: 'border-amber-500/30 text-amber-400',
    glowBg: 'bg-amber-500/10 group-hover:bg-amber-500/20',
    titleHover: 'group-hover:text-amber-300',
    routeColor: 'text-amber-400/90',
    buttonBg: 'bg-amber-700 hover:bg-amber-800 text-white shadow-amber-700/25',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
    badgeDot: 'bg-amber-400'
  },
  sky: {
    cardBorder: 'border-sky-500/30 hover:border-sky-500/70 hover:shadow-sky-500/10',
    iconBg: 'bg-sky-500/15',
    iconBorder: 'border-sky-500/30 text-sky-400',
    glowBg: 'bg-sky-500/10 group-hover:bg-sky-500/20',
    titleHover: 'group-hover:text-sky-300',
    routeColor: 'text-sky-400/90',
    buttonBg: 'bg-sky-700 hover:bg-sky-800 text-white shadow-sky-700/25',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-400',
    badgeBorder: 'border-sky-500/30',
    badgeDot: 'bg-sky-400'
  },
  violet: {
    cardBorder: 'border-violet-500/30 hover:border-violet-500/70 hover:shadow-violet-500/10',
    iconBg: 'bg-violet-500/15',
    iconBorder: 'border-violet-500/30 text-violet-400',
    glowBg: 'bg-violet-500/10 group-hover:bg-violet-500/20',
    titleHover: 'group-hover:text-violet-300',
    routeColor: 'text-violet-400/90',
    buttonBg: 'bg-violet-700 hover:bg-violet-800 text-white shadow-violet-700/25',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-400',
    badgeBorder: 'border-violet-500/30',
    badgeDot: 'bg-violet-400'
  },
  rose: {
    cardBorder: 'border-rose-500/30 hover:border-rose-500/70 hover:shadow-rose-500/10',
    iconBg: 'bg-rose-500/15',
    iconBorder: 'border-rose-500/30 text-rose-400',
    glowBg: 'bg-rose-500/10 group-hover:bg-rose-500/20',
    titleHover: 'group-hover:text-rose-300',
    routeColor: 'text-rose-400/90',
    buttonBg: 'bg-rose-700 hover:bg-rose-800 text-white shadow-rose-700/25',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-400',
    badgeBorder: 'border-rose-500/30',
    badgeDot: 'bg-rose-400'
  }
};

const RICH_CARD_CODES = new Set(['warehouse', 'personnel', 'accounting', 'operations']);

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
      const isRich = RICH_CARD_CODES.has(appKey);

      return {
        code: appKey,
        title: mod.titleFa,
        routePrefix: mod.routePrefix,
        icon: mod.icon,
        description: mod.descriptionFa,
        hasAccess,
        tags,
        themeColor,
        isRich
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
   * کارت‌های ماژول‌های دیگر که کاشی غنی اختصاصی ندارند
   */
  public extraCards = computed<AppLauncherCard[]>(() => {
    return this.appCards().filter(card => !card.isRich);
  });

  public getThemeClasses(color: string): LauncherThemeClasses {
    return LAUNCHER_THEMES[color] || LAUNCHER_THEMES['indigo'];
  }

  public getCardIcon(icon: string): string {
    if (!icon || icon.length > 20 || /[\u{1F300}-\u{1F9FF}]/u.test(icon)) {
      return 'box';
    }
    return icon;
  }

  /**
   * تعداد کل کارت‌های دقیقاً رندرشده در قالب
   */
  get visibleCardsCount(): number {
    const whCount = this.isWarehouseInstalled ? 1 : 0;
    const finCount = this.isFinanceInstalled ? 1 : 0;
    const opsCount = (this.hasOperations && this.appCards().some(c => c.code === 'operations')) ? 1 : 0;
    const extraCount = this.extraCards().length;
    return whCount + finCount + opsCount + extraCount;
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
    return this.persona.canAccessApp('warehouse');
  }

  get hasFinance(): boolean {
    return this.persona.canAccessApp('accounting');
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
