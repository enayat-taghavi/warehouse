import { Injectable, signal } from '@angular/core';
import { IS_WAREHOUSE_INSTALLED } from '../../modules/warehouse/warehouse-flags';
import { IS_ACCOUNTING_INSTALLED } from '../../modules/accounting/accounting-flags';

export interface FrontendModuleSpec {
  code: string;
  aliases?: string[];
  titleFa: string;
  titleShortFa: string;
  descriptionFa: string;
  icon: string;
  routePrefix: string;
  defaultRoute: string;
  scopeKind: 'warehouse' | 'finance' | 'operations';
  permissionMarkers: string[];
  roles: string[];
  isSuperuserOnly?: boolean;
}

export const KNOWN_MODULE_CATALOG: FrontendModuleSpec[] = [
  {
    code: 'warehouse',
    aliases: ['wh'],
    titleFa: 'سامانه انبارداری و ره‌گیری کالا',
    titleShortFa: 'انبارداری',
    descriptionFa: 'مدیریت فرآیند شمارش کور انبار، کارتابل سرپرست، تخصیص کالا و صدور MT26/49، ثبت مغایرت‌ها، داشبورد ره‌گیری و ممیزی موجودی کالا.',
    icon: '📦',
    routePrefix: '/app/warehouse',
    defaultRoute: '/app/warehouse/dashboard',
    scopeKind: 'warehouse',
    permissionMarkers: [
      'view_sys_dashboard', 'view_wh_dashboard', 'view_sys_counter',
      'view_sys_supervisor', 'view_sys_manager_review', 'view_wh_docs',
      'view_wh_dispatch', 'view_wh_customs', 'view_wh_doc_approvals',
      'view_wh_feeding', 'view_wh_feed_approvals', 'view_wh_labels',
      'view_wh_label_designer', 'view_wh_audit', 'view_wh_settings',
      'view_sys_recounts', 'view_sys_export', 'view_sys_reports',
      'perm_doc_approve_action', 'perm_feed_approve_action', 'perm_inventory_finalize',
      'perm_rec_import', 'perm_rec_recount', 'perm_rec_dispatch',
      'perm_wh_create', 'perm_wh_edit', 'perm_wh_freeze'
    ],
    roles: ['counter', 'warehouse_supervisor', 'docs_specialist', 'manager_review']
  },
  {
    code: 'accounting',
    aliases: ['personnel', 'finance'],
    titleFa: 'سامانه مالی، حقوق و کارکرد',
    titleShortFa: 'مالی و حقوق',
    descriptionFa: 'ثبت و کنترل کارکرد روزانه، کارتابل تاییدات ۵ سطحی، محاسبات فیش حقوقی، دیسکت‌های بیمه تامین اجتماعی و مالیات، خزانه‌داری و پرداخت پایا.',
    icon: '💳',
    routePrefix: '/app/finance',
    defaultRoute: '/app/finance',
    scopeKind: 'finance',
    permissionMarkers: [
      'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
      'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
      'perm_lock_work_period', 'perm_approve_personnel_supervisor', 'perm_approve_personnel_manager',
      'perm_approve_personnel_finance', 'perm_approve_fleet_supervisor', 'perm_approve_fleet_manager',
      'perm_approve_fleet_finance', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
      'can_act_as_accountant', 'can_act_as_operator', 'view_sys_projects', 'perm_manage_projects_sections'
    ],
    roles: ['operator', 'supervisor', 'accountant', 'manager', 'treasury', 'org_admin']
  },
  {
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
    isSuperuserOnly: true
  }
];

@Injectable({ providedIn: 'root' })
export class ModuleRegistryService {
  private static readonly STORAGE_KEY = 'wh_installed_modules';

  /** ماژول‌های نصب‌شده اعلام‌شده توسط سرور در public config (پیش‌فرض: خواندن از کش یا همه) */
  private installedModuleCodes = signal<string[]>(this.getInitialModuleCodes());

  private getInitialModuleCodes(): string[] {
    const codes = ['operations'];
    if (IS_WAREHOUSE_INSTALLED) codes.push('warehouse');
    if (IS_ACCOUNTING_INSTALLED) codes.push('accounting');

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(ModuleRegistryService.STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.filter(c => {
              const norm = String(c).toLowerCase();
              if ((norm === 'warehouse' || norm === 'wh') && !IS_WAREHOUSE_INSTALLED) return false;
              if ((norm === 'accounting' || norm === 'finance') && !IS_ACCOUNTING_INSTALLED) return false;
              return true;
            });
          }
        }
      } catch {}
    }
    return codes;
  }

  /**
   * تنظیم ماژول‌های نصب‌شده از روی پاسخ سرور
   */
  public setInstalledModules(codes: string[]): void {
    if (!codes || !Array.isArray(codes) || codes.length === 0) return;
    const normalized = codes.map(c => c.toLowerCase()).filter(norm => {
      if ((norm === 'warehouse' || norm === 'wh') && !IS_WAREHOUSE_INSTALLED) return false;
      if ((norm === 'accounting' || norm === 'finance') && !IS_ACCOUNTING_INSTALLED) return false;
      return true;
    });
    // اگر پلتفرم یا حسابداری اعلام شده، به رسمیت بشناس
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
   * آیا ماژول مورد نظر در این نصب فعال است؟
   */
  public isModuleInstalled(code: string): boolean {
    const norm = code.toLowerCase();
    if ((norm === 'warehouse' || norm === 'wh') && !IS_WAREHOUSE_INSTALLED) return false;
    if ((norm === 'accounting' || norm === 'finance') && !IS_ACCOUNTING_INSTALLED) return false;

    const installed = this.installedModuleCodes();
    if (installed.includes(norm)) return true;
    const spec = this.getSpec(norm);
    if (spec?.aliases?.some(a => installed.includes(a))) return true;
    return false;
  }

  /**
   * دریافت مشخصات یک ماژول بر اساس کد یا نام مستعار
   */
  public getSpec(code: string): FrontendModuleSpec | undefined {
    const norm = code.toLowerCase();
    return KNOWN_MODULE_CATALOG.find(m => m.code === norm || m.aliases?.includes(norm));
  }

  /**
   * استخراج مارکرهای مجوز ماژول برای اعتبارسنجی روت‌ها — فاز ۶ (تسک ۵۳)
   */
  public permissionMarkers(code: string): string[] {
    const spec = this.getSpec(code);
    return spec ? [...spec.permissionMarkers] : [];
  }

  /**
   * دریافت مشخصات ماژول‌های نصب‌شده و فعال در کاتالوگ
   */
  public getInstalledSpecs(): FrontendModuleSpec[] {
    return KNOWN_MODULE_CATALOG.filter(m => this.isModuleInstalled(m.code));
  }

  /**
   * ارزیابی دسترسی کاربر به یک ماژول بر اساس مجوزها و نقش‌ها (وارونه‌سازی)
   */
  public userHasAccessToModule(
    moduleCode: string,
    userPerms: string[] = [],
    allowedApps?: string[],
    isSuperuser = false
  ): boolean {
    // قانون ۵: ماژول نصب‌نشده در این توزیع وجود ندارد و به هیچ کاربری (حتی مدیر ارشد) دسترسی داده نمی‌شود
    if (!this.isModuleInstalled(moduleCode)) return false;
    if (isSuperuser) return true;

    const spec = this.getSpec(moduleCode);
    if (!spec) return false;
    if (spec.isSuperuserOnly) return isSuperuser;

    // بررسی allowed_apps اعلامی از سمت توکن احراز هویت
    if (allowedApps && Array.isArray(allowedApps)) {
      const matchAllowed = allowedApps.some(a => {
        const normA = a.toLowerCase();
        return normA === spec.code || spec.aliases?.includes(normA);
      });
      if (matchAllowed) return true;
    }

    // بررسی تطابق با مارکرهای مجوز ماژول
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
