import { Injectable, signal } from '@angular/core';
import {
  FrontendModuleSpec,
  WhFrontendModule,
  ExtensionMap,
  ModuleNavItem
} from './module-contract';
import { INSTALLED_MODULES } from '../../modules/installed-modules';
import { Company, companyHasModule } from '../models/company.model';

export type { FrontendModuleSpec, WhFrontendModule, ExtensionMap, ModuleNavItem };

/**
 * مشخصات سامانه عملیات و پدافند زیرساخت پلتفرم (Platform Operations Shell)
 */
const OPERATIONS_SPEC: WhFrontendModule = {
  code: 'operations',
  aliases: ['ops', 'soc'],
  titleFa: 'مرکز عملیات و زیرساخت (SOC)',
  titleShortFa: 'پدافند و زیرساخت',
  descriptionFa: 'اتاق فرماندهی پدافند، پایش علائم حیاتی سرور، اسنپ‌شات‌ها و بازیابی سریع دیتابیس، ممیزی امنیتی و مانیتورینگ کلاینت‌های تبلت.',
  icon: '🛡️',
  routePrefix: '/app/operations',
  defaultRoute: '/app/operations/cockpit',
  scopeKind: 'operations',
  permissionMarkers: ['admin_all'],
  roles: ['ops_commander', 'superuser'],
  isSuperuserOnly: true,
  extensions: {
    launcherTile: {
      themeColor: 'cyan',
      tags: ['اسنپ‌شات‌ها', 'پایش سلامت', 'امنیت'],
      appKey: 'operations'
    }
  }
};

@Injectable({
  providedIn: 'root',
  useFactory: () => getModuleRegistry(),
})
export class ModuleRegistryService {
  private static readonly STORAGE_KEY = 'wh_installed_modules';

  /** فهرست کلیه ماژول‌های موجود در این بیلد (ماژول‌های نصب‌شده به علاوه پوسته عملیات) */
  private modules: WhFrontendModule[] = [...INSTALLED_MODULES, OPERATIONS_SPEC];

  /** ماژول‌های نصب‌شده اعلام‌شده توسط سرور در public config (پیش‌فرض: خواندن از کش یا همه) */
  private installedModuleCodes = signal<string[]>(this.getInitialModuleCodes());

  private getInitialModuleCodes(): string[] {
    const defaultCodes = this.modules.map(m => m.code);

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(ModuleRegistryService.STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = parsed.filter(c => {
              const norm = String(c).toLowerCase();
              return this.modules.some(m => m.code === norm || m.aliases?.includes(norm));
            });
            if (valid.length > 0) {
              if (!valid.includes('operations')) valid.push('operations');
              return valid;
            }
          }
        }
      } catch {}
    }
    return defaultCodes;
  }

  /**
   * تنظیم ماژول‌های نصب‌شده از روی پاسخ سرور
   */
  public setInstalledModules(codes: string[]): void {
    if (!codes || !Array.isArray(codes) || codes.length === 0) return;
    const normalized = codes.map(c => c.toLowerCase()).filter(norm => {
      return this.modules.some(m => m.code === norm || m.aliases?.includes(norm));
    });
    if (!normalized.includes('operations')) normalized.push('operations');
    this.installedModuleCodes.set(normalized);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ModuleRegistryService.STORAGE_KEY, JSON.stringify(normalized));
      } catch {}
    }
  }

  /**
   * دریافت کد ماژول‌های نصب‌شده
   */
  public getInstalledCodes(): string[] {
    return this.installedModuleCodes();
  }

  /**
   * آیا ماژول مورد نظر در این توزیع بیلد و در سرور نصب و فعال است؟
   */
  public isModuleInstalled(code: string): boolean {
    const norm = code.toLowerCase();
    const spec = this.getSpec(norm);
    if (!spec) return false;

    const installed = this.installedModuleCodes();
    if (installed.includes(spec.code)) return true;
    if (spec.aliases?.some(a => installed.includes(a))) return true;
    return false;
  }

  /**
   * آیا ماژول برای شرکت داده‌شده روشن است (فهرست `enabled_modules` شرکت)؟ پوستهٔ عملیات ماژول نیست و همیشه روشن است؛
   * کد ناشناخته هم چیزی را مسدود نمی‌کند (نصب بودن را `isModuleInstalled` می‌سنجد).
   */
  public isModuleEnabledForCompany(code: string, company: Pick<Company, 'enabled_modules'> | null | undefined): boolean {
    const spec = this.getSpec(code);
    if (!spec || spec === OPERATIONS_SPEC) return true;
    return companyHasModule(company, spec.code);
  }

  /**
   * دریافت مشخصات یک ماژول بر اساس کد یا نام مستعار
   */
  public getSpec(code: string): WhFrontendModule | undefined {
    const norm = code.toLowerCase();
    return this.modules.find(m => m.code === norm || m.aliases?.includes(norm));
  }

  /**
   * همهٔ ماژول‌های شناخته‌شده در این بیلد، نصب‌شده یا نه
   */
  public getAllModules(): WhFrontendModule[] {
    return [...this.modules];
  }

  /**
   * دریافت فهرست ماژول‌های فعال
   */
  public getInstalledModules(): WhFrontendModule[] {
    return this.modules.filter(m => this.isModuleInstalled(m.code));
  }

  /**
   * دریافت مشخصات ماژول‌های نصب‌شده و فعال در کاتالوگ
   */
  public getInstalledSpecs(): FrontendModuleSpec[] {
    return this.getInstalledModules();
  }

  /**
   * استخراج مارکرهای مجوز ماژول برای اعتبارسنجی روت‌ها
   */
  public permissionMarkers(code: string): string[] {
    const spec = this.getSpec(code);
    return spec ? [...spec.permissionMarkers] : [];
  }

  /**
   * دریافت همه مشارکت‌های ثبت‌شده در یک نقطه توسعه خاص
   */
  public getExtensions<K extends keyof ExtensionMap>(
    point: K
  ): Array<{ module: WhFrontendModule; moduleCode: string; extension: NonNullable<ExtensionMap[K]> }> {
    const results: Array<{ module: WhFrontendModule; moduleCode: string; extension: NonNullable<ExtensionMap[K]> }> = [];
    for (const mod of this.getInstalledModules()) {
      if (mod.extensions && mod.extensions[point]) {
        results.push({
          module: mod,
          moduleCode: mod.code,
          extension: mod.extensions[point]!
        });
      }
    }
    return results;
  }

  /**
   * ثبت ماژول در زمان اجرا (برای آزمون‌های ماژولار و سناریوهای پویا)
   */
  public registerModule(module: WhFrontendModule): void {
    const existingIdx = this.modules.findIndex(m => m.code === module.code);
    if (existingIdx >= 0) {
      this.modules[existingIdx] = module;
    } else {
      this.modules.push(module);
    }
    const current = this.installedModuleCodes();
    if (!current.includes(module.code)) {
      this.installedModuleCodes.set([...current, module.code]);
    }
  }

  /**
   * دریافت مشارکت یک ماژول خاص در یک نقطه توسعه
   */
  public getExtension<K extends keyof ExtensionMap>(
    moduleCode: string,
    point: K
  ): NonNullable<ExtensionMap[K]> | undefined {
    const mod = this.getSpec(moduleCode);
    if (!mod || !this.isModuleInstalled(mod.code)) return undefined;
    return mod.extensions?.[point] as NonNullable<ExtensionMap[K]> | undefined;
  }

  /**
   * ارزیابی دسترسی کاربر به یک ماژول بر اساس مجوزها و نقش‌ها
   */
  public userHasAccessToModule(
    moduleCode: string,
    userPerms: string[] = [],
    allowedApps?: string[],
    isSuperuser = false
  ): boolean {
    if (!this.isModuleInstalled(moduleCode)) return false;
    if (isSuperuser) return true;

    const spec = this.getSpec(moduleCode);
    if (!spec) return false;
    if (spec.isSuperuserOnly) return isSuperuser;

    if (allowedApps && Array.isArray(allowedApps)) {
      const matchAllowed = allowedApps.some(a => {
        const normA = a.toLowerCase();
        return normA === spec.code || spec.aliases?.includes(normA);
      });
      if (matchAllowed) return true;
    }

    return spec.permissionMarkers.some(p => userPerms.includes(p));
  }
}

/** دسترسی سریع تکین (Singleton) برای استفاده در توابع گارد و پیکربندی روت‌ها */
let _moduleRegistryInstance: ModuleRegistryService | null = null;
export function getModuleRegistry(): ModuleRegistryService {
  if (!_moduleRegistryInstance) {
    _moduleRegistryInstance = new ModuleRegistryService();
  }
  return _moduleRegistryInstance;
}
