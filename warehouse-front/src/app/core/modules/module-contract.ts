import { Injector, Type } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, Routes } from '@angular/router';
import { IconName } from '../../shared/icons/icon-registry';

/** کد اپ (کد ماژول، نام مستعار آن یا operations) */
export type AppModuleType = string;

export interface RolePersona {
  code: string;
  title: string;
  app: AppModuleType;
  badgeColor: string;
  bgClass: string;
  icon: IconName;
  tierLevel: number;
}

export interface ModulePersonas {
  roles: RolePersona[];
  resolveRoleCodes: (ctx: { perms: string[]; userRoles: string[] }) => string[];
  sodProhibitions?: Record<string, string[]>;
  isRouteDeniedForRole?: (role: string, cleanRoute: string) => boolean;
  defaultRouteForRole?: Record<string, string>;
  /** صفحهٔ خانهٔ این ماژول همان `defaultRoute` آن است: مقصد تعویض اپ به این ماژول، و مسیر پیش‌فرض نقشِ بی‌مسیر وقتی این ماژول فعال است */
  homeIsModuleDefault?: boolean;
  /** آخرین مقصد پیش‌فرض نقش، وقتی هیچ قاعدهٔ دیگری مسیری نداد */
  lastResortRoute?: string;
}

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
  scopeKind: string;
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
  module?: string;
  isAccounting?: boolean;
  isPending?: boolean;
  route?: string;
}

/** قالب آمادهٔ نقش در صفحهٔ کاربران */
export interface ModuleRolePreset {
  id: string;
  title: string;
  /** کلید دستهٔ قالب (همان users.presetCategory.key ماژول یا 'system') */
  category: string;
  categoryTitle: string;
  color: string;
  icon: string;
  description: string;
  permissionCodenames: string[] | 'ALL';
}

/** رنگ‌های پایه‌ای که کلاس‌های کاملشان در کامپوننت‌های مشترک تعریف شده است */
export type ModuleAccent = 'indigo' | 'emerald';

/**
 * بخش یک ماژول در دیالوگ بروزرسانی عمیق؛ همهٔ متن‌ها فارسی و از خود ماژول است.
 * loadItems و بقیهٔ تابع‌ها سرویس‌ها را از injector می‌گیرند تا کد ماژول از shared ایمپورت نکند.
 */
export interface DeepSyncSectionSpec {
  /** قلمرو آفلاین همین بخش؛ همان مقداری که به performDeepUpdate می‌رود */
  scope: string;
  /** ترتیب نمایش بخش و زبانه (کوچک‌تر بالاتر) */
  order: number;
  /** برچسب زبانهٔ بخش در زمینهٔ مرکز عملیات */
  tabLabel: string;
  /** آیکون زبانه و عنوان بخش */
  icon: IconName;
  /** عنوان بخش وقتی دیالوگ فقط همین قلمرو را نشان می‌دهد */
  sectionTitle: string;
  /** عنوان بخش در زمینهٔ مرکز عملیات */
  opsSectionTitle: string;
  /** عنوان و توضیح بنر بالای دیالوگ وقتی فقط همین قلمرو فعال است */
  bannerTitle: string;
  bannerDescription: string;
  /** متن وقتی فهرست هدف این بخش خالی است */
  emptyText: string;
  /** برچسب دکمهٔ انتخاب همه و لغو آن */
  selectAllLabel: string;
  clearAllLabel: string;
  /** برچسب ستون هدف در گزارش پایانی (مثلاً «انبار») */
  itemLabel: string;
  /** برچسب سامانه در گزارش یکپارچهٔ مرکز عملیات */
  summaryLabel: string;
  /** رنگ پایهٔ بخش */
  accent: ModuleAccent;
  /** فهرست فوری پیش از پاسخ سرور (اختیاری) */
  initialItems?: (injector: Injector) => { id: number; name: string }[];
  /** شناسهٔ پیش‌انتخاب هنگام باز شدن دیالوگ (اختیاری) */
  preselectId?: (injector: Injector) => number | null;
  /** فهرست زندهٔ هدف‌ها از سرور */
  loadItems: (injector: Injector) => Promise<{ id: number; name: string }[]>;
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
    themeColor: 'indigo' | 'emerald' | 'cyan' | 'amber' | 'rose' | 'sky' | 'violet' | string;
    tags: string[];
    appKey?: string;
    /** برچسب دکمهٔ ورود کارت غنی لانچر (کارت غنی فقط برای ماژول دارای این برچسب و رنگ indigo/emerald) */
    enterLabelFa?: string;
    /** عنوان کارت غنی لانچر اگر با titleFa ماژول فرق دارد */
    cardTitleFa?: string;
    /** گزینهٔ این ماژول در منوی تعویض سامانهٔ هدر (app-role-switcher) */
    switcher?: {
      /** ترتیب نمایش (کوچک‌تر بالاتر) */
      order: number;
      labelFa: string;
      descriptionFa: string;
      icon: IconName;
      accent: ModuleAccent;
      /** عنوان دکمهٔ سامانه وقتی کاربر فقط به همین سامانه دسترسی دارد */
      onlyAccessTitleFa: string;
      /** انتخابگر نقش فعال کنار دکمهٔ سامانه نشان داده شود */
      showRoleSelector?: boolean;
    };
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
    /** قلمرو بروزرسانی عمیق (سازگاری پیشین؛ منبع اصلی deepSync است) */
    deepSyncScope?: string;
    /** بخش این ماژول در دیالوگ بروزرسانی عمیق: عنوان‌ها، رنگ و بارگذار فهرست هدف‌ها */
    deepSync?: DeepSyncSectionSpec;
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
    /** عنوان هدر پوسته وقتی این ماژول اپ فعال است */
    appTitleFa?: string;
    /** شناسه‌های تب بیرون از منوها که مسیرشان زیر پیشوند همین ماژول است */
    extraRouteTabs?: string[];
    defaultExitRoute?: string;
    hasCompanyDocumentsArchive?: boolean;
    companyDocumentsRoute?: string;
  };

  /**
   * ۴. پیوندها و ویجت‌های مرکز عملیات و زیرساخت — مصرف در operations-cockpit و operations-layout
   */
  operations?: {
    quickLink?: { title: string; route: string; icon?: string };
    hasExpiringDocsWidget?: boolean;
    syncMonitorScope?: string;
    /** دکمهٔ ورود به این ماژول در پوستهٔ مرکز عملیات (کنار پیوندهای سریع) */
    shellLink?: { labelFa: string; mobileLabelFa: string; route: string; icon: IconName; accent: ModuleAccent };
    /** دکمهٔ تنظیمات منبع داده در اتاق فرماندهی */
    sourceSettings?: { labelFa: string; route: string };
    /** برچسب قلمرو تب‌های متصل این ماژول در پایش همگام‌سازی */
    monitorLabelFa?: string;
  };

  /**
   * ۵. پرچم‌های ماژول در مدیریت شرکت‌ها — مصرف در companies.ts، company-gdrive-tab.ts، first-boot-wizard.ts و active-company.service.ts
   */
  companies?: {
    hasWarehouseModuleToggle?: boolean;
    providesTreasury?: boolean;
  };

  /**
   * ۶. گروه‌های دسترسی و پیش‌تنظیم‌های نقش کاربران — مصرف در users.ts و operations-rbac-governance.ts
   */
  users?: {
    permissionGroupKeys?: string[];
    /** قالب‌های آمادهٔ نقش این ماژول و دستهٔ آن‌ها در پنل قالب‌ها */
    rolePresets?: ModuleRolePreset[];
    presetCategory?: { key: string; labelFa: string; icon: IconName; tone: 'sky' | 'emerald' };
    /** قلمرو نقش‌های این ماژول در مودال کاربر و نشان سامانه‌های مجاز */
    roleScope?: {
      key: string;
      order: number;
      tabLabelFa: string;
      badgeLabelFa: string;
      shortLabelFa: string;
      tinyLabelFa: string;
      icon: string;
      tone: 'sky' | 'emerald';
      /** نشان این قلمرو تعداد انبارهای تخصیص‌یافته را نشان می‌دهد */
      countsWarehouses?: boolean;
      /** حدس قلمرو نقش بی‌مجوز از نام و عنوان آن */
      nameHints: string[];
      titleHints: string[];
      /** نقش‌های دیگری که در زبانهٔ این قلمرو هم می‌آیند */
      extraRoleNames?: string[];
      extraTitleHints?: string[];
    };
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
    /** مقدار app_scope ممیزی همین ماژول (پروتکل سرور)؛ اولین مقدار قلمرو ماژول است */
    appScopes?: string[];
    /** ترتیب دکمهٔ قلمرو در انتخابگر (کوچک‌تر جلوتر) */
    order?: number;
    /** برچسب دکمهٔ قلمرو و رویداد جابه‌جایی قلمرو */
    scopeLabelFa?: string;
    /** برچسب تراشهٔ «قلمرو: …» */
    scopeChipLabelFa?: string;
    /** برچسب قلمرو مقصد مسدودشده در رویداد عبور غیرمجاز */
    blockedAppLabelFa?: string;
    /** انتخابگر انبار، اسکنر و ستون انبار در این قلمرو */
    hasWarehouseSelector?: boolean;
    /** مسیر ماژول قلمرو را قفل می‌کند و انتخابگر قلمرو پنهان می‌شود */
    lockScopeOnRoute?: boolean;
    /** عنوان، زیرعنوان و نشان سربرگ وقتی ممیزی روی همین قلمرو است (بدون آن متن عمومی) */
    headerTitleFa?: string;
    headerSubtitleFa?: string;
    headerBadgeFa?: string;
    /** ماژول‌های لاگ همین قلمرو: گزینه‌های فیلتر و فیلتر آفلاین */
    logModules?: { value: string; labelFa: string }[];
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
    /** اندپوینت فهرست انبارها (نسبت به apiUrl، مثل '/warehouses/')؛ صاحبش ماژول انبار است */
    warehouseDirectoryEndpoint?: string;
  };

  /**
   * ۱۱. آدرس‌های اختصاصی API شرکت‌ها — مصرف در company-api.service.ts و active-company.service.ts
   */
  companyApiEndpoints?: {
    companiesEndpoint?: string;
    accessEndpoint?: string;
    documentsEndpoint?: string;
    bankAccountsEndpoint?: string;
    boardMembersEndpoint?: string;
    fiscalPeriodsEndpoint?: string;
    companyGdriveBaseEndpoint?: (companyId: number | string) => string;
  };

  /**
   * ۱۲. بارگذار تنبل کامپوننت طراح لیبل — مصرف در settings-label-tab.ts
   * (تنبل تا کامپوننت از راه installed-modules.ts وارد باندل اولیه نشود)
   */
  loadLabelDesigner?: () => Promise<Type<unknown>>;

  /**
   * ۱۴. تنظیمات همگام‌سازی و دانلود دلتای داده‌ها (Sync Pull Config) — مصرف در sync-pull.service.ts
   */
  syncConfig?: {
    scopeKind: string;
    pullEndpoint: string;
    scopeParamKey: string;
    activeAppHeader?: string;
    defaultOfflineRole?: string;
    tokenScopeKey?: string;
    /** برچسب فارسی هدف در گزارش بروزرسانی عمیق وقتی نامش در دست نیست (مثلاً «انبار» → «انبار ۱۲») */
    targetLabelFa?: string;
    /** کرسر این قلمرو کلید قدیمی `${userId}:${scopeId}` هم دارد (سازگاری پیشین؛ خوانده و ارتقا داده می‌شود) */
    legacyCursorKey?: boolean;
    /** پاکسازی دادهٔ محلی یک هدف پیش از دانلود کامل در بروزرسانی عمیق (درخواست صریح کاربر) */
    purgeBeforeDeepUpdate?: (scopeId: number, userId: number | null) => Promise<void>;
    /** پاکسازی دادهٔ محلی یک هدف وقتی سرور دسترسی به آن را با ۴۰۳ ابطال کرد */
    purgeOnAccessRevoked?: (scopeId: number) => Promise<void>;
  };

  /**
   * ۱۴-ب. پیکربندی همگام‌سازی آفلاین، الگوهای URL صف و قلمرو پایگاه داده — مصرف در offline-db.ts
   */
  offlineSync?: {
    scopeKind: string;
    dbName: string;
    scopeAliases?: string[];
    queueUrlPatterns: string[];
    activePathPatterns: string[];
    appRoutePrefixes: string[];
    /** نوع موجودیت رکورد صف از روی بخشی از URL (به ترتیب؛ نخستین تطبیق) */
    entityTypeUrlPatterns?: { urlPart: string; entityType: string }[];
    /** تداخل همگام‌سازی این قلمرو حساس است: نقش‌های ثبت (operator/counter) حق حل آن را ندارند (تفکیک وظایف) */
    sensitiveConflicts?: boolean;
  };

  /**
   * ۱۵. جستجو و استعلام پروژه‌های مالی — مصرف در users.ts و user-menu.component.ts
   */
  projectLookup?: {
    financialProjectsEndpoint: string;
  };

  /**
   * ۱۶. فیلدهای پویای انبارداری — مصرف در settings.ts
   */
  dynamicFields?: {
    fieldsEndpoint: string;
  };

  /**
   * ۱۷. نقطه توسعه آپلود تصاویر کالا — مصرف در photo-upload-queue.service.ts
   */
  photoUpload?: {
    itemPhotosEndpoint: (itemId: number | string) => string;
  };

  /**
   * ۱۸. هندلرهای اختصاصی ناوبری اعلان‌ها — مصرف در notification-center.component.ts
   */
  notificationHandlers?: NotificationHandler[];
}

/**
 * سیاق ناوبری اعلان
 */
export interface NotificationNavigationContext {
  item: any;
  http: HttpClient;
  router: Router;
  userPerms: string[];
  isSuperuser: boolean;
}

/**
 * هندلر ماژولار ناوبری اعلان
 */
export interface NotificationHandler {
  canHandle: (item: any) => boolean;
  navigate: (ctx: NotificationNavigationContext) => void;
}

/**
 * تعریف دسترسی روت‌ها، گارد و لاگین ماژول
 */
export interface ModuleRouteAccess {
  guardAccessPermissions: string[];
  pagePermissions: Record<string, string[]>;
  loginPermissions: string[];
  loginActiveAppModule: string;
  resolveLoginRoute: (perms: string[]) => string;
  deniedPageFallback?: 'roleHome' | 'otherModuleDefault';
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
  /** تعریف پرسوناها و قواعد احراز نقش‌های ماژول */
  personas?: ModulePersonas;
  /** دسترسی روت‌ها، گارد و ورود ماژول */
  routeAccess?: ModuleRouteAccess;
  /**
   * ریدایرکت‌های مسیرهای قدیمی ریشه (پیش از /app/...) که به صفحه‌های همین ماژول می‌روند.
   * پوسته آن‌ها را در جای ثابت خود در روت‌های ریشه پهن می‌کند؛ ماژول نصب‌نشده ریدایرکتی هم ندارد.
   */
  legacyRedirects?: Routes;
  /** مشارکت‌های ماژول در نقطه‌های توسعه پلتفرم */
  extensions?: ExtensionMap;
}

