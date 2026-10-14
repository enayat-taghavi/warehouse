import { Type } from '@angular/core';
import { Routes } from '@angular/router';

/**
 * مشخصات پایه یک ماژول فرانت‌اند در پلتفرم انبارداری و مالی
 */
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

/**
 * ساختار آیتم‌های منوی ناوبری سایدبار پوسته
 */
export interface ModuleNavItem {
  id: string;
  label: string;
  icon: string;
  permission: string;
  module?: 'warehouse' | 'accounting' | 'platform' | string;
  isAccounting?: boolean;
  isPending?: boolean;
}

/**
 * نگاشت نقطه‌های توسعه (Extension Points) ماژول‌های فرانت‌اند
 * احصاشده از ۲۴ فایل مصرف‌کنندهٔ isModuleInstalled
 */
export interface ExtensionMap {
  /**
   * ۱. کاشی لانچر برنامه‌ها (App Launcher Tile) — مصرف در app-launcher.ts
   */
  launcherTile?: {
    themeColor: 'indigo' | 'emerald' | 'cyan';
    tags: string[];
    appKey?: string;
  };

  /**
   * ۲. قابلیت‌ها و دسته‌بندی‌های منوی کاربری و میانبرها — مصرف در user-menu.component.ts
   */
  userMenu?: {
    shortcutsCategory?: {
      id: string;
      label: string;
      count: number;
    };
    deepSyncScope?: 'warehouse' | 'finance';
  };

  /**
   * ۳. منوهای ناوبری و تعویض‌گر قلمرو در پوسته اصلی — مصرف در layout.ts و layout.html
   */
  layoutNav?: {
    primaryItems?: ModuleNavItem[];
    contextItems?: ModuleNavItem[];
    roleMenus?: Array<{
      role: string;
      items: ModuleNavItem[];
      roleMarkers: string[];
    }>;
    showWarehouseSwitcher?: boolean;
    defaultExitRoute?: string;
  };

  /**
   * ۴. پیوندها و ویجت‌های مرکز عملیات و زیرساخت — مصرف در operations-cockpit و operations-layout
   */
  operations?: {
    quickLink?: { title: string; route: string; icon?: string };
    hasExpiringDocsWidget?: boolean;
    syncMonitorScope?: string;
  };

  /**
   * ۵. پیکربندی‌ها، ستون‌ها و تب‌های ماژول در مدیریت شرکت‌ها — مصرف در companies.ts، company-gdrive-tab.ts و first-boot-wizard.ts
   */
  companies?: {
    tabs?: string[];
    tableColumns?: string[];
    hasWarehouseModuleToggle?: boolean;
    gdriveSupported?: boolean;
  };

  /**
   * ۶. گروه‌های دسترسی و پیش‌تنظیم‌های نقش کاربران — مصرف در users.ts و operations-rbac-governance.ts
   */
  users?: {
    permissionGroupKeys?: string[];
    rolePresetCategories?: string[];
  };

  /**
   * ۷. پنل‌ها و حوزه‌های پایش سلامت سامانه — مصرف در health-dashboard.ts
   */
  healthDashboard?: {
    panelScopes?: string[];
  };

  /**
   * ۸. قلمروهای لاگ و وقایع ممیزی امنیتی — مصرف در audit.ts
   */
  audit?: {
    appScopes?: string[];
  };

  /**
   * ۹. پشتیبانی و قالب‌های چاپ کارت شناسایی و پرسنلی — مصرف در id-cards.ts
   */
  idCards?: {
    supported?: boolean;
  };

  /**
   * ۱۰. فیلتر قلمرو بین‌ماژولی (مانند فیلتر انبار در دیسکت‌ها و حقوق پرسنل) — مصرف در accountant-payroll, accountant-fleet, accountant-diskettes
   */
  crossModuleFilters?: {
    warehouseScopeFilter?: boolean;
  };

  /**
   * ۱۱. آدرس‌های اختصاصی API شرکت‌ها — مصرف در company-api.service.ts و active-company.service.ts
   */
  companyApiEndpoints?: {
    companiesEndpoint?: string;
    accessEndpoint?: string;
  };

  /**
   * ۱۲. بارگذار تنبل کامپوننت طراح لیبل — مصرف در settings-label-tab.ts
   * (تنبل تا کامپوننت از راه installed-modules.ts وارد باندل اولیه نشود)
   */
  loadLabelDesigner?: () => Promise<Type<unknown>>;
}

/**
 * قرارداد ماژول فرانت‌اند پلتفرم
 */
export interface WhFrontendModule extends FrontendModuleSpec {
  /** تابع بارگذاری تنبل روت‌های ماژول */
  routes?: () => Promise<Routes>;
  /** آیتم‌های ناوبری ماژول */
  navItems?: Record<string, any>;
  /** فرهنگ آیکون‌های موجودیت‌های ماژول */
  entityIcons?: Record<string, string>;
  /** مشارکت‌های ماژول در نقطه‌های توسعه پلتفرم */
  extensions?: ExtensionMap;
}
