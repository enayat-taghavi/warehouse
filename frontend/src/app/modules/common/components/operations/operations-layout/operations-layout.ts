import { IconName } from '../../../../../shared/icons/icon-registry';
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, RouterModule, NavigationEnd } from '@angular/router';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { SystemHealthService } from '../../../../../core/services/system-health.service';
import { NavigationHistoryService } from '../../../../../core/services/navigation-history.service';
import { CommunicationService } from '../../../../../core/services/communication.service';
import { AppRoleSwitcherComponent } from '../../../../../shared/components/app-role-switcher/app-role-switcher.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { ChatDrawerComponent } from '../../communications/chat-drawer/chat-drawer.component';
import { UserMenuComponent } from '../../../../../shared/components/user-menu/user-menu.component';
import { CompanySwitcherComponent } from '../../organization/company-switcher/company-switcher';
import { CompanySelectionModalComponent } from '../../organization/company-selection-modal/company-selection-modal';
import { FirstBootWizardComponent } from '../first-boot-wizard/first-boot-wizard';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { filter, Subscription } from 'rxjs';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ACTION_ICONS, PLATFORM_ENTITY_ICONS } from '../../../../../shared/icons/semantic-icons';

interface NavItem {
  id: string;
  label: string;
  route: string;
  icon: string;
  badge?: string;
  badgeClass?: string;
}

export interface OperationsQuickLink {
  code: string;
  title: string;
  route: string;
  icon?: string;
}

@Component({
  selector: 'app-operations-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    AppRoleSwitcherComponent,
    OfflinePendingBadgeComponent,
    ChatDrawerComponent,
    UserMenuComponent,
    CompanySwitcherComponent,
    CompanySelectionModalComponent,
    FirstBootWizardComponent,
    SvgIconDirective
  ],
  templateUrl: './operations-layout.html',
  styleUrl: './operations-layout.css'
})
export class OperationsLayoutComponent implements OnInit, OnDestroy {
  public auth = inject(AuthService);
  public persona = inject(AppPersonaService);
  public healthService = inject(SystemHealthService);
  public navHistory = inject(NavigationHistoryService);
  public commService = inject(CommunicationService);
  public activeCompanyService = inject(ActiveCompanyService, { optional: true });
  public moduleRegistry = inject(ModuleRegistryService);
  private router = inject(Router);

  /**
   * دکمه‌های ورود به ماژول‌ها در پوسته (operations.shellLink)؛ هر ماژول فقط وقتی برای شرکت فعال
   * روشن است (enabled_modules) نشان داده می‌شود.
   */
  get moduleShellLinks(): Array<{ code: string; labelFa: string; mobileLabelFa: string; route: string; icon: IconName; textClass: string; order: number }> {
    const textClass: Record<string, string> = { indigo: 'text-indigo-300', emerald: 'text-emerald-300' };
    return this.moduleRegistry.getExtensions('operations')
      .filter(e => !!e.extension.shellLink)
      .filter(e => this.activeCompanyService?.isModuleEnabled?.(e.moduleCode) ?? true)
      .map(e => {
        const l = e.extension.shellLink!;
        const order = e.module?.extensions?.launcherTile?.switcher?.order ?? 100;
        return { code: e.moduleCode, labelFa: l.labelFa, mobileLabelFa: l.mobileLabelFa, route: l.route, icon: l.icon, textClass: textClass[l.accent] || textClass['indigo'], order };
      })
      .sort((a, b) => a.order - b.order);
  }

  /**
   * پیوندهای سریع ماژول‌های نصب‌شده (بر پایه نقطه توسعه operations.quickLink)
   * پیوندهای اختصاصی انبار و مالی جداگانه مدیریت می‌شوند
   */
  get extraQuickLinks(): OperationsQuickLink[] {
    const exts = this.moduleRegistry.getExtensions('operations');
    const links: OperationsQuickLink[] = [];
    for (const e of exts) {
      const code = (e as any).moduleCode || e.module?.code;
      // ماژول دارای دکمهٔ اختصاصی پوسته اینجا تکرار نمی‌شود
      if (e.extension.shellLink) {
        continue;
      }
      const ql = e.extension.quickLink;
      if (ql && ql.route) {
        links.push({
          code: code || 'extra',
          title: ql.title || code || 'ماژول متصل',
          route: ql.route,
          icon: ql.icon || 'box'
        });
      }
    }
    return links;
  }

  get hasAnyConnectedModule(): boolean {
    return this.moduleShellLinks.length > 0 || this.extraQuickLinks.length > 0;
  }

  get hasMultipleConnectedModules(): boolean {
    const count = this.moduleShellLinks.length + this.extraQuickLinks.length;
    return count > 1;
  }

  public trackShellLink(_index: number, link: { code: string }): string {
    return link.code;
  }

  /** getter هر بار شیء تازه می‌سازد؛ trackBy دکمه‌ها را در هر چرخهٔ بررسی تغییرات از نو نمی‌سازد */
  public trackQuickLink(_index: number, link: OperationsQuickLink): string {
    return link.code;
  }

  public navigateToQuickLink(route: string): void {
    this.router.navigate([route]);
    this.closeMobileMenu();
  }

  public isSidebarCollapsed = signal<boolean>(false);
  public isMobileMenuOpen = signal<boolean>(false);
  public activeRoute = signal<string>('cockpit');
  public currentTitle = signal<string>('مرکز عملیات و زیرساخت سازمان — اتاق فرماندهی کل');
  private routerSub?: Subscription;

  public navItems: NavItem[] = [
    {
      id: 'cockpit',
      label: 'اتاق فرماندهی کل',
      route: '/app/operations/cockpit',
      icon: PLATFORM_ENTITY_ICONS.dashboard,
      badge: 'زنده',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
    },
    {
      id: 'snapshots',
      label: 'پشتیبان‌گیری و اسنپ‌شات‌های سرور',
      route: '/app/operations/snapshots',
      icon: PLATFORM_ENTITY_ICONS.backup
    },
    {
      id: 'users',
      label: 'مدیریت کاربران و نقش‌ها',
      route: '/app/operations/users',
      icon: PLATFORM_ENTITY_ICONS.users
    },
    {
      id: 'companies',
      label: 'مدیریت شرکت‌ها و هلدینگ',
      route: '/app/operations/companies',
      icon: PLATFORM_ENTITY_ICONS.company
    },
    {
      id: 'health',
      label: 'ماتریس سلامت و تست همروندی',
      route: '/app/operations/health',
      icon: PLATFORM_ENTITY_ICONS.health
    },
    {
      id: 'audit',
      label: 'ممیزی امنیتی و ثبت رویدادها',
      route: '/app/operations/audit',
      icon: PLATFORM_ENTITY_ICONS.audit
    },
    {
      id: 'sync-monitor',
      label: 'مانیتورینگ کلاینت‌ها و تداخل',
      route: '/app/operations/sync-monitor',
      icon: ACTION_ICONS.sync
    }
  ];

  ngOnInit(): void {
    this.activeCompanyService?.loadAvailableCompanies().subscribe();
    this.updateActiveRoute(this.router.url);
    this.routerSub = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.updateActiveRoute(e.urlAfterRedirects || e.url);
    });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  private updateActiveRoute(url: string): void {
    const clean = url.split('?')[0];
    const match = this.navItems.find(item => clean.startsWith(item.route));
    if (match) {
      this.activeRoute.set(match.id);
      this.currentTitle.set(match.label);
    } else {
      this.activeRoute.set('cockpit');
      this.currentTitle.set('اتاق فرماندهی کل');
    }
  }

  public toggleSidebar(): void {
    this.isSidebarCollapsed.update(v => !v);
  }

  public toggleMobileMenu(): void {
    this.isMobileMenuOpen.update(v => !v);
  }

  public closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  public toggleChatDrawer(): void {
    const nextState = !this.commService.isChatDrawerOpen();
    this.commService.isChatDrawerOpen.set(nextState);
    if (nextState) {
      this.commService.hasNewIncomingPulse.set(false);
      const active = this.commService.activeConversation$.value;
      if (active) {
        this.commService.markAsRead(active.id);
      }
    } else {
      this.commService.closeActiveConversation();
    }
  }

  public navigateTo(route: string): void {
    this.router.navigate([route]);
    this.closeMobileMenu();
  }

  public goToModule(route: string): void {
    this.router.navigate([route]);
  }

  public goToLauncher(): void {
    this.router.navigate(['/app/launcher']);
  }

  public logout(): void {
    this.auth.logout();
  }
}
