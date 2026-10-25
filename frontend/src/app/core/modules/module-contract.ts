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
  /** permissionAliases: کدهای مجوز یک توانایی که ماژول‌های نصب‌شده اعلام کرده‌اند (گام ۸) */
  /** companySectionLevel: بالاترین سطح کاربر در یک بخش مجوز شرکت، در میان شرکت‌های قابل مدیریت او (مثلاً «پروژه‌ها و بخش‌ها») */
  resolveRoleCodes: (ctx: {
    perms: string[];
    userRoles: string[];
    permissionAliases?: (capability: string) => string[];
    companySectionLevel?: (section: string) => 'none' | 'read' | 'write';
  }) => string[];
  sodProhibitions?: Record<string, string[]>;
  isRouteDeniedForRole?: (role: string, cleanRoute: string) => boolean;
  defaultRouteForRole?: Record<string, string>;
  /** صفحهٔ خانهٔ این ماژول همان `defaultRoute` آن است: مقصد تعویض اپ به این ماژول، و مسیر پیش‌فرض نقشِ بی‌مسیر وقتی این ماژول فعال است */
  homeIsModuleDefault?: boolean;
  /** آخرین مقصد پیش‌فرض نقش، وقتی هیچ قاعدهٔ دیگری مسیری نداد */
  lastResortRoute?: string;
}

/**
 * نقش انتساب کاربر به بخش (تب «پروژه‌ها و بخش‌ها» استودیو)؛ هستهٔ پروژه و بخش نقش‌ها را نمی‌شناسد
 * و هر ماژول نقش‌های خودش را اعلام می‌کند (همتای contribute('section_roles') بک‌اند).
 */
export interface SectionRoleSpec {
  /** مقدار role در پروتکل سرور */
  key: string;
  labelFa: string;
  /** عنوان جمع کوتاه (ستون ماتریس و چیپ) */
  shortLabelFa: string;
  descriptionFa?: string;
  icon: IconName;
  tone: 'purple' | 'amber' | 'blue' | 'emerald' | 'slate';
  order: number;
  /** اگر بخش هیچ انتساب فعالی با این نقش نداشته باشد، این هشدار کنار بخش دیده می‌شود */
  missingWarningFa?: string;
}

/** تب مشارکتی استودیوی شرکت */
export interface CompanyStudioTab {
  /** شناسهٔ تب در query (`?tab=`)؛ نباید با تب‌های هسته یکی باشد */
  id: string;
  labelFa: string;
  shortLabelFa: string;
  icon: IconName;
  /** جای تب در میان تب‌های هسته (هویتی ۱۰، مدارک ۵۰، پروژه‌ها ۵۵، دسترسی ۶۰) */
  order: number;
  /** پیش از ذخیرهٔ شرکت به‌جای کامپوننت پیام «ابتدا ذخیره کنید» نمایش داده می‌شود */
  requiresSavedCompany: boolean;
  /** پیش از ذخیرهٔ شرکت تب اصلاً نمایش داده نمی‌شود */
  hiddenUntilSaved?: boolean;
  /**
   * کامپوننت فقط وقتی تب باز است ساخته می‌شود و با بستن تب از بین می‌رود
   * (برای تبی که شنود یا پرس‌وجوی دوره‌ای دارد). پیش‌فرض: یک بار ساخته و پنهان نگه داشته می‌شود.
   */
  renderOnlyWhenActive?: boolean;
  /**
   * کلید بخش مجوز شرکت (رجیستری company_permission_sections) که این تب را باز می‌کند. در حالت محدود
   * تبِ «هیچ» رندر نمی‌شود؛ کامپوننت برای «خواندن» از `CompanyStudioContextService.canWrite` کنترل‌های نوشتن را پنهان می‌کند.
   */
  permissionSection?: string;
  loadComponent: () => Promise<Type<unknown>>;
}

/** بخش مشارکتی داخل یک تب هستهٔ استودیو */
export interface CompanyStudioSection {
  slot: 'identity' | 'documents';
  order: number;
  /** کلید بخش مجوز شرکت؛ همان قاعدهٔ `CompanyStudioTab.permissionSection` */
  permissionSection?: string;
  loadComponent: () => Promise<Type<unknown>>;
}

/**
 * ستون مشارکتی فهرست شرکت‌ها. کامپوننت ورودی‌های `company` و `variant` را می‌گیرد:
 * `'table'` برای خانهٔ جدول دسکتاپ و `'card'` برای کارت موبایل.
 */
export interface CompanyListCell {
  id: string;
  labelFa: string;
  order: number;
  /** جای سلول در کارت موبایل: `grid` در جدول دوستونی مشخصات، `row` ردیف کامل زیر آن (پیش‌فرض) */
  cardPlacement?: 'grid' | 'row';
  loadComponent: () => Promise<Type<unknown>>;
}

/** دکمهٔ مشارکتی ردیف فهرست شرکت‌ها */
export interface CompanyRowAction {
  id: string;
  labelFa: string;
  icon: IconName;
  /** متن راهنمای دکمه (title)؛ بدون آن labelFa */
  hintFa?: string;
  /** شناسهٔ تب استودیو که باز می‌شود */
  tab: string;
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
  /** ماژول opt-in فقط با نام صریح در --modules / WH_MODULES نصب می‌شود (tools/gen-installed-modules.js) */
  optIn?: boolean;
}

/**
 * ساختار آیتم‌های منوی ناوبری سایدبار پوسته
 */
export interface ModuleNavItem {
  id: string;
  label: string;
  icon: string;
  permission: string;
  /** آیتم با داشتن هر یک از این مجوزها دیده می‌شود (به‌جای permission تنها) */
  anyPermissions?: string[];
  /**
   * کلید دستهٔ مجوز همین ماژول (`PERMISSION_CATEGORIES` بک‌اند، ت۵): آیتم با داشتن دست‌کم یک مجوز از آن دسته هم دیده می‌شود.
   * بدون آن، دسته‌ای که `menu`اش برابر `id` همین آیتم است به کار می‌رود (PermissionService.menuUnlocked).
   */
  permissionCategory?: string;
  module?: string;
  isAccounting?: boolean;
  isPending?: boolean;
  route?: string;
  /** کد بخش قابل خاموش شدن (بک‌اند `contribute('toggle_sections', ...)`)؛ تا بخش خاموش است آیتم پنهان می‌ماند */
  sectionKey?: string;
}

/**
 * قالب آمادهٔ نقش در صفحهٔ کاربران.
 * @deprecated قالب قدیم ماژول؛ ماژول قالب تازه (مجوزهای دسته‌دار بک‌اند، ت۶) بسته‌های نقش را از
 * `accounts/permission-catalog/` می‌گیرد و این را اعلام نمی‌کند. فقط برای ماژول‌های قدیمی (مثل انبار) می‌ماند.
 */
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

/**
 * گروه مجوزهای یک ماژول در صفحهٔ نقش‌ها.
 * @deprecated قالب قدیم ماژول؛ برای ماژول قالب تازه گروه و عنوان مجوزها از `accounts/permission-catalog/` می‌آید (ت۶).
 */
export interface ModulePermissionGroup {
  /** کلید پایدار گروه در صفحهٔ نقش‌ها */
  key: string;
  titleFa: string;
  /** ترتیب گروه میان گروه‌های ماژول‌ها (کوچک‌تر جلوتر) */
  order: number;
  /** کدهای مجوز ماژول؛ همان PERMISSION_CODENAMES مانیفست بک‌اند ماژول (نگهبان ۵۷ برابری را می‌سنجد) */
  codenames: string[];
}

/** برچسب‌های فارسی محدودهٔ تخصیص کاربران (مثلاً انبار یا پروژه) در صفحهٔ کاربران */
export interface AssignmentScopeLabels {
  /** مفرد و جمع: «انبار»، «انبارها» */
  singular: string;
  plural: string;
  /** صفت جمع پیش از اسم: «انبارهای …» */
  pluralAttributive: string;
  /** گزینهٔ «همه» در فیلتر */
  allOption: string;
  /** گزینهٔ «بدون …» در فیلتر */
  noneOption: string;
  /** پیشوند فهرست در کارت کاربر: «انبارها:» */
  listPrefix: string;
  /** سرستون جدول کاربران */
  column: string;
  /** نمونهٔ عنوان نقش */
  roleTitlePlaceholder: string;
  /** راهنمای پنل قالب‌های نقش */
  presetsHint: string;
  /** زبانهٔ «شرکت‌ها و …» مودال کاربر */
  companiesTab: string;
  /** متن «گام بعدی: …» */
  nextStep: string;
  /** عنوان «شرکت‌ها و …های مجاز» */
  allowedTitle: string;
  /** عنوان تخصیص */
  assignTitle: string;
  /** متن فهرست خالی */
  emptyText: string;
  /** نام رکوردها در هشدار مجوز حساس */
  sensitiveRecords: string;
}

/** محدودهٔ تخصیص کاربران که یک ماژول عرضه می‌کند */
export interface UsersAssignmentScope {
  /** کوچک‌تر یعنی ترجیح بیشتر؛ اولین ماژول در دسترس برچسب‌ها را می‌دهد و خطای بارگذاری به بعدی می‌رود */
  priority: number;
  labels: AssignmentScopeLabels;
  /** فهرست هدف‌های تخصیص برای state.appState.projects؛ سرویس‌ها از injector */
  loadItems: (injector: Injector) => Promise<{ id: number; name: string; code?: string | null }[]>;
}

/** سناریوی تست فشار هم‌زمانی یک ماژول (ابزار توسعه؛ مقدار همان پارامتر scenario سرور) */
export interface HealthStressScenario {
  value: string;
  /** ترتیب گزینه و برچسب در متن ترکیبی (کوچک‌تر جلوتر) */
  order: number;
  /** متن گزینهٔ «فقط همین سناریو» */
  optionLabelFa: string;
  /** نام کوتاه در «ترکیبی (… + …)» و توضیح آزمون */
  shortLabelFa: string;
  /** سطر نتیجهٔ آزمون: برچسب و مقدار */
  verdictLabelFa: string;
  verdictValueFa: string;
}

/** نمای یک ماژول در داشبورد سلامت سامانه */
export interface HealthPanelSpec {
  /** ترتیب قلمرو در فهرست‌ها (کوچک‌تر جلوتر) */
  order: number;
  /** برچسب «وضعیت قلمرو» */
  scopeLabelFa: string;
  /** رنگ نشان قلمرو */
  tone: 'blue' | 'purple';
  /** برچسب شمار رکوردهای کش و صف این قلمرو (مثلاً «انبار») */
  storageLabelFa: string;
  /** نام دیتابیس محلی وقتی فقط همین قلمرو دیده می‌شود، و نام کوتاه در فهرست چندتایی */
  dbLabelEn: string;
  dbShortEn: string;
  /** نمای کلی: وقتی داشبورد روی این قلمرو است، همهٔ قلمروهای نصب‌شده دیده می‌شوند */
  overview?: boolean;
  stressScenario?: HealthStressScenario;
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
      /** مجوزهای نشانگر نقش؛ فهرست تهی یعنی پرسونای فعال خودش نشانگر است (نقشی که از سطح بخش شرکت می‌آید) */
      roleMarkers: string[];
    }>;
    showWarehouseSwitcher?: boolean;
    /** عنوان هدر پوسته وقتی این ماژول اپ فعال است */
    appTitleFa?: string;
    /** شناسه‌های تب بیرون از منوها که مسیرشان زیر پیشوند همین ماژول است */
    extraRouteTabs?: string[];
    defaultExitRoute?: string;
    /** پیوند «بایگانی اسناد شرکت‌ها» در منوی این ماژول؛ مقصد تب مدارک استودیوی شرکت است (بخش مشارکتی همان تب) */
    hasCompanyDocumentsArchive?: boolean;
  };

  /**
   * ۴. پیوندها و ویجت‌های مرکز عملیات و زیرساخت — مصرف در operations-cockpit و operations-layout
   */
  operations?: {
    quickLink?: { title: string; route: string; icon?: string };
    hasExpiringDocsWidget?: boolean;
    syncMonitorScope?: string;
    /** برچسب صف همین قلمرو در خلاصهٔ صف پایش همگام‌سازی و ترتیب آن (کوچک‌تر جلوتر) */
    queueLabelFa?: string;
    queueOrder?: number;
    /** نمونهٔ تداخل ۴۰۹ برای آزمایشگاه تداخل پایش همگام‌سازی؛ در syncErrors دیتابیس syncMonitorScope ثبت می‌شود */
    conflictSimulation?: () => Record<string, any>;
    /** دکمهٔ ورود به این ماژول در پوستهٔ مرکز عملیات (کنار پیوندهای سریع) */
    shellLink?: { labelFa: string; mobileLabelFa: string; route: string; icon: IconName; accent: ModuleAccent };
    /** دکمهٔ تنظیمات منبع داده در اتاق فرماندهی */
    sourceSettings?: { labelFa: string; route: string };
    /** برچسب قلمرو تب‌های متصل این ماژول در پایش همگام‌سازی */
    monitorLabelFa?: string;
  };

  /**
   * ۵. مشارکت ماژول در مدیریت شرکت‌ها — مصرف در companies.ts، company-projects-tab.ts و active-company.service.ts.
   * روشن و خاموش بودن ماژول برای هر شرکت پرچم ماژول نیست: پوسته `code` ماژول را در `enabled_modules` شرکت می‌جوید.
   */
  companies?: {
    providesTreasury?: boolean;
    /** تب‌های تازهٔ استودیوی شرکت (کامپوننت تنبل؛ ورودی companyId و گفت‌وگو با CompanyStudioContextService) */
    studioTabs?: CompanyStudioTab[];
    /** بخش‌هایی که در انتهای یک تب هستهٔ استودیو نمایش داده می‌شوند */
    studioSections?: CompanyStudioSection[];
    /** ستون جدول و ردیف کارت موبایل فهرست شرکت‌ها (ورودی company) */
    listCells?: CompanyListCell[];
    /** دکمهٔ ردیف فهرست که یک تب استودیو را باز می‌کند */
    rowActions?: CompanyRowAction[];
    /** نقش‌های انتساب کاربر به بخش که این ماژول در تب «پروژه‌ها و بخش‌ها» اعلام می‌کند */
    sectionRoles?: SectionRoleSpec[];
  };

  /**
   * ۶. گروه‌های دسترسی و پیش‌تنظیم‌های نقش کاربران — مصرف در users.ts، layout.ts، auth.guard.ts
   */
  users?: {
    /** گروه مجوزهای این ماژول در صفحهٔ نقش‌ها. @deprecated فقط قالب قدیم ماژول (ت۶)؛ قالب تازه از فهرست کامل سرور */
    permissionGroup?: ModulePermissionGroup;
    /** نام کوتاه مجوزهای این ماژول در چیپ‌های دسترسی. @deprecated فقط قالب قدیم ماژول (ت۶)؛ قالب تازه `label_fa` فهرست سرور */
    shortPermissionNames?: Record<string, string>;
    /** راهنمای مجوز وقتی محدودهٔ تخصیص کاربران از همین ماژول است (ماژول دیگری پیش از آن در دسترس نیست) */
    standalonePermissionTooltips?: Record<string, string>;
    /** مجوزهایی که نوشتن ساختار سازمانی را باز می‌کنند (همتای org_structure_write_perms بک‌اند) */
    structureWritePermissions?: string[];
    /** محدودهٔ تخصیص کاربران (انبار، پروژه، …) و برچسب‌های آن */
    assignmentScope?: UsersAssignmentScope;
    /** قالب‌های آمادهٔ نقش این ماژول و دستهٔ آن‌ها در پنل قالب‌ها. @deprecated فقط قالب قدیم ماژول (ت۶)؛ قالب تازه بستهٔ نقش‌های انتساب سرور */
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
    /** نمای این ماژول (قلمرو نخست panelScopes) در داشبورد سلامت */
    panel?: HealthPanelSpec;
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
   * ۱۰. فهرست قلمرو عملیاتی (مثل فهرست انبارها) که پوسته و ماژول‌های دیگر فقط می‌خوانند — مصرف در ScopeDirectoryService
   * و فیلتر قلمرو بین‌ماژولی (accountant-payroll، accountant-fleet، accountant-diskettes)
   */
  scopeDirectory?: {
    /** اندپوینت فهرست (نسبت به apiUrl، مثل '/warehouses/') */
    endpoint: string;
    /** ماژول‌های دیگر می‌توانند فهرست خود را با این قلمرو فیلتر کنند */
    offersScopeFilter?: boolean;
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
    /**
     * پیش‌خوانی کش GET (ص۵ طرح ۲.۵): همان GETهای بار اول صفحه‌های کلیدی تا رهگیر آفلاین کش کند.
     * فقط کش را جایگزین می‌کند، هرگز پاک نمی‌کند. مصرف در cache-warmup.service.ts (فاصله‌دار، فقط آنلاین).
     */
    warmCache?: (injector: Injector) => Promise<void>;
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

  /**
   * ۱۹. alias مجوز (گام ۸): کد مجوزهای همین ماژول برای هر «توانایی» نام‌دار. ماژول دیگر فقط نام توانایی را
   * (با permissionAlias در route-access، یا getPermissionAliases) می‌شناسد، نه کد مجوز این ماژول را.
   */
  permissionAliases?: Record<string, string[]>;
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
  /** کدهای مجوز یک توانایی که ماژول‌های نصب‌شده اعلام کرده‌اند (گام ۸) */
  permissionAliases?: (capability: string) => string[];
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

