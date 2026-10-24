import { WhFrontendModule } from '../../core/modules/module-contract';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import {
  ORG_ADMIN_NAV_ITEMS,
  EMPLOYEE_NAV_ITEMS,
  SUPERVISOR_NAV_ITEMS,
  ACCOUNTANT_NAV_ITEMS,
  MANAGER_NAV_ITEMS,
  TREASURER_NAV_ITEMS,
  ORG_ADMIN_ROLE_MARKERS,
  EMPLOYEE_ROLE_MARKERS,
  SUPERVISOR_ROLE_MARKERS,
  ACCOUNTANT_ROLE_MARKERS,
  MANAGER_ROLE_MARKERS,
  TREASURER_ROLE_MARKERS
} from './nav-items';
import { ACCOUNTING_ENTITY_ICONS } from './entity-icons';
import { ACCOUNTING_NOTIFICATION_HANDLERS } from './notification-handlers';
import { ACCOUNTING_PERSONAS } from './personas';
import { ACCOUNTING_ROUTE_ACCESS } from './route-access';
import { redirectToCompanyProjects } from '../../core/modules/documents-archive-route';
import { ROLE_ICONS } from '../../shared/icons/semantic-icons';

/** فهرست پروژه‌های فعال؛ پروژه در هسته است (هم projectLookup و هم بروزرسانی عمیق) */
const FINANCIAL_PROJECTS_ENDPOINT = '/org/projects';

/**
 * مانیفست رسمی و مستقل ماژول مالی، حقوق و کارکرد (Front-End Module Manifest)
 */
export const MODULE: WhFrontendModule = {
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
    'can_act_as_accountant', 'can_act_as_operator', 'view_sys_projects'
  ],
  roles: ['operator', 'supervisor', 'accountant', 'manager', 'treasury', 'org_admin'],
  personas: ACCOUNTING_PERSONAS,
  routeAccess: ACCOUNTING_ROUTE_ACCESS,
  /** مسیرهای قدیمی ریشه که به صفحه‌های مالی می‌روند؛ صفحه‌های بازنشسته مستقیم به هاب جانشین می‌روند تا ریدایرکت زنجیره‌ای نسازند */
  legacyRedirects: [
    { path: 'finance-cartable', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
    { path: 'attendance', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' },
    { path: 'fleet', redirectTo: 'app/finance/employee-fleet', pathMatch: 'full' },
    { path: 'fleet-attendance', redirectTo: 'app/finance/employee-fleet', pathMatch: 'full' },
    { path: 'manager-approvals', redirectTo: 'app/finance/manager-approvals', pathMatch: 'full' },
    { path: 'treasury-cartable', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
    { path: 'treasury', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
    { path: 'profiles', redirectTo: 'app/finance/profiles', pathMatch: 'full' },
    { path: 'personnel-profiles', redirectTo: 'app/finance/personnel-profiles', pathMatch: 'full' },
    { path: 'base-settings', redirectTo: 'app/finance/base-settings', pathMatch: 'full' },
    { path: 'projects-and-sections', redirectTo: redirectToCompanyProjects, pathMatch: 'full' },
    { path: 'employee-portal', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' },
    { path: 'employee-attendance', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' },
    { path: 'employee-fleet', redirectTo: 'app/finance/employee-fleet', pathMatch: 'full' },
    { path: 'employee-invoices', redirectTo: 'app/finance/employee-invoices', pathMatch: 'full' },
    { path: 'employee-petty-cash', redirectTo: 'app/finance/employee-petty-cash', pathMatch: 'full' },
    { path: 'employee-new-vehicle', redirectTo: 'app/finance/employee-new-vehicle', pathMatch: 'full' },
    { path: 'employee-new-personnel', redirectTo: 'app/finance/employee-new-personnel', pathMatch: 'full' },
    { path: 'supervisor-personnel', redirectTo: 'app/finance/supervisor-personnel', pathMatch: 'full' },
    { path: 'supervisor-attendance', redirectTo: 'app/finance/supervisor-attendance', pathMatch: 'full' },
    { path: 'supervisor-fleet', redirectTo: 'app/finance/supervisor-fleet', pathMatch: 'full' },
    { path: 'supervisor-invoices', redirectTo: 'app/finance/supervisor-invoices', pathMatch: 'full' },
    { path: 'supervisor-petty-cash', redirectTo: 'app/finance/supervisor-petty-cash', pathMatch: 'full' },
    { path: 'supervisor-new-profiles', redirectTo: 'app/finance/supervisor-personnel', pathMatch: 'full' },
    { path: 'supervisor-period-lock', redirectTo: 'app/finance/supervisor-period-lock', pathMatch: 'full' },
    { path: 'accountant', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
    { path: 'accountant-personnel', redirectTo: 'app/finance/accountant-personnel', pathMatch: 'full' },
    { path: 'accountant-payroll', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
    { path: 'accountant-fleet', redirectTo: 'app/finance/accountant-fleet', pathMatch: 'full' },
    { path: 'accountant-invoices', redirectTo: 'app/finance/accountant-invoices', pathMatch: 'full' },
    { path: 'accountant-petty-cash', redirectTo: 'app/finance/accountant-petty-cash', pathMatch: 'full' },
    { path: 'accountant-new-profiles', redirectTo: 'app/finance/accountant-personnel', pathMatch: 'full' },
    { path: 'accountant-diskettes', redirectTo: 'app/finance/accountant-diskettes', pathMatch: 'full' },
    { path: 'accountant-counterparties', redirectTo: 'app/finance/accountant-counterparties', pathMatch: 'full' },
    { path: 'manager', redirectTo: 'app/finance/manager-dashboard', pathMatch: 'full' },
    { path: 'manager-personnel', redirectTo: 'app/finance/manager-personnel', pathMatch: 'full' },
    { path: 'manager-fleet', redirectTo: 'app/finance/manager-fleet', pathMatch: 'full' },
    { path: 'manager-dashboard', redirectTo: 'app/finance/manager-dashboard', pathMatch: 'full' },
    { path: 'manager-budget', redirectTo: 'app/finance/manager-budget', pathMatch: 'full' },
    { path: 'manager-contracts', redirectTo: 'app/finance/manager-contracts', pathMatch: 'full' },
    { path: 'manager-reports', redirectTo: 'app/finance/manager-reports', pathMatch: 'full' },
    { path: 'treasurer', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
    { path: 'treasurer-disbursements', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
    { path: 'treasurer-invoices', redirectTo: 'app/finance/treasurer-invoices', pathMatch: 'full' },
    { path: 'treasurer-bank-accounts', redirectTo: 'app/finance/treasurer-bank-accounts', pathMatch: 'full' },
    { path: 'treasurer-cheques', redirectTo: 'app/finance/treasurer-cheques', pathMatch: 'full' },
    { path: 'treasurer-reconciliation', redirectTo: 'app/finance/treasurer-reconciliation', pathMatch: 'full' },
    { path: 'personnel', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
    { path: 'payroll', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
    { path: 'fleet-settlement', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
    { path: 'finance-audit', redirectTo: 'app/finance/audit', pathMatch: 'full' },
    { path: 'app/warehouse/attendance', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' }
  ],
  routes: () => import('./accounting.routes').then(m => m.ACCOUNTING_ROUTES),
  navItems: {
    orgAdminNavItems: ORG_ADMIN_NAV_ITEMS,
    employeeNavItems: EMPLOYEE_NAV_ITEMS,
    supervisorNavItems: SUPERVISOR_NAV_ITEMS,
    accountantNavItems: ACCOUNTANT_NAV_ITEMS,
    managerNavItems: MANAGER_NAV_ITEMS,
    treasurerNavItems: TREASURER_NAV_ITEMS,
  },
  entityIcons: ACCOUNTING_ENTITY_ICONS,
  extensions: {
    launcherTile: {
      themeColor: 'emerald',
      tags: ['کارتابل مالی', 'ثبت کارکرد', 'خزانه‌داری'],
      appKey: 'personnel',
      enterLabelFa: 'ورود به سامانه مالی',
      switcher: {
        order: 20,
        labelFa: 'مالی و کارکرد',
        descriptionFa: 'حقوق، دستمزد و کارکرد پرسنل',
        icon: 'credit-card',
        accent: 'emerald',
        onlyAccessTitleFa: 'شما صرفاً به سامانه مالی و کارکرد دسترسی دارید',
        showRoleSelector: true
      }
    },
    userMenu: {
      deepSyncScope: 'finance',
      deepSync: {
        scope: 'finance',
        order: 20,
        tabLabel: 'مالی و پرسنلی',
        icon: 'credit-card',
        sectionTitle: 'لیست پروژه‌ها / کارگاه‌ها',
        opsSectionTitle: 'پروژه‌ها و کارگاه‌های مالی',
        bannerTitle: 'انتخاب پروژه‌ها و کارگاه‌های هدف',
        bannerDescription: 'با بروزرسانی عمیق، اطلاعات آفلاین ذخیره‌شده برای پروژه‌ها و کارگاه‌های انتخاب‌شده کاملاً پاک شده و از نو دریافت می‌شود.',
        emptyText: 'پروژه یا کارگاهی برای بروزرسانی یافت نشد.',
        selectAllLabel: 'انتخاب همه پروژه‌ها',
        clearAllLabel: 'لغو انتخاب پروژه‌ها',
        itemLabel: 'پروژه / کارگاه',
        summaryLabel: '💳 مالی',
        accent: 'emerald',
        loadItems: async (injector) => {
          const api = injector.get(ApiService, null);
          if (!api) return [];
          return (await firstValueFrom(api.get<any[]>(FINANCIAL_PROJECTS_ENDPOINT, { is_active: true }))) || [];
        }
      }
    },
    layoutNav: {
      appTitleFa: 'سامانه مالی و پرسنلی',
      extraRouteTabs: [
        'companies',
        'supervisor-attendance', 'supervisor-new-profiles', 'accountant-new-profiles', 'manager-contracts'
      ],
      hasCompanyDocumentsArchive: true,
      roleMenus: [
        { role: 'org_admin', items: ORG_ADMIN_NAV_ITEMS, roleMarkers: ORG_ADMIN_ROLE_MARKERS },
        { role: 'operator', items: EMPLOYEE_NAV_ITEMS, roleMarkers: EMPLOYEE_ROLE_MARKERS },
        { role: 'supervisor', items: SUPERVISOR_NAV_ITEMS, roleMarkers: SUPERVISOR_ROLE_MARKERS },
        { role: 'accountant', items: ACCOUNTANT_NAV_ITEMS, roleMarkers: ACCOUNTANT_ROLE_MARKERS },
        { role: 'manager', items: MANAGER_NAV_ITEMS, roleMarkers: MANAGER_ROLE_MARKERS },
        { role: 'treasury', items: TREASURER_NAV_ITEMS, roleMarkers: TREASURER_ROLE_MARKERS },
      ],
      defaultExitRoute: '/app/finance'
    },
    operations: {
      quickLink: { title: 'سامانه مالی و پرسنلی', route: '/app/finance' },
      shellLink: { labelFa: 'مالی', mobileLabelFa: 'ورود به سامانه مالی', route: '/app/finance', icon: 'credit-card', accent: 'emerald' },
      monitorLabelFa: 'مالی و خزانه‌داری',
      hasExpiringDocsWidget: true,
      syncMonitorScope: 'accounting',
      queueLabelFa: 'مالی',
      queueOrder: 20
    },
    companies: {
      providesTreasury: true,
      // تب‌های حسابداری استودیوی شرکت؛ کامپوننت‌ها تنبل‌اند تا وارد باندل اولیه نشوند
      studioTabs: [
        {
          // بیمه و مالیات برای دیسکت حقوق (ت۵ طرح ۲.۱)؛ شناسهٔ تب همان `studio` حوزهٔ insurance_tax در سرور است
          id: 'fiscal_insurance', labelFa: 'بیمه و مالیات', shortLabelFa: 'بیمه', icon: 'file-check', order: 20,
          requiresSavedCompany: true, permissionSection: 'insurance_tax',
          loadComponent: () => import('./components/companies-studio/company-insurance-tax-tab/company-insurance-tax-tab').then(m => m.CompanyInsuranceTaxTabComponent)
        },
        {
          id: 'treasury', labelFa: 'بانک و شبا', shortLabelFa: 'بانک', icon: 'database', order: 30,
          requiresSavedCompany: false, permissionSection: 'bank',
          loadComponent: () => import('./components/companies-studio/company-treasury-tab/company-treasury-tab').then(m => m.CompanyTreasuryTabComponent)
        },
        {
          id: 'governance', labelFa: 'هیئت‌مدیره و امضا', shortLabelFa: 'هیئت‌مدیره', icon: 'users', order: 40,
          requiresSavedCompany: false, permissionSection: 'board',
          loadComponent: () => import('./components/companies-studio/company-governance-tab/company-governance-tab').then(m => m.CompanyGovernanceTabComponent)
        },
        {
          // شنود OAuth و پرس‌وجوی دوره‌ای صف دارد؛ فقط وقتی تب باز است ساخته می‌شود
          id: 'gdrive', labelFa: 'همگام‌سازی گوگل‌درایو', shortLabelFa: 'گوگل‌درایو', icon: 'google-drive', order: 70,
          requiresSavedCompany: true, hiddenUntilSaved: true, renderOnlyWhenActive: true, permissionSection: 'gdrive',
          loadComponent: () => import('./components/companies-studio/company-gdrive-tab/company-gdrive-tab').then(m => m.CompanyGdriveTabComponent)
        }
      ],
      // بخش‌های حسابداری در انتهای تب‌های هسته
      studioSections: [
        {
          slot: 'identity', order: 10, permissionSection: 'fiscal',
          loadComponent: () => import('./components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section').then(m => m.CompanyFiscalPeriodsSectionComponent)
        },
        {
          slot: 'documents', order: 10, permissionSection: 'docs_archive',
          loadComponent: () => import('./components/companies-studio/company-archive-section/company-archive-section').then(m => m.CompanyArchiveSectionComponent)
        }
      ],
      listCells: [
        {
          id: 'projects', labelFa: 'پروژه‌ها', order: 10, cardPlacement: 'grid',
          loadComponent: () => import('./components/companies-studio/company-list-cells').then(m => m.CompanyProjectsCellComponent)
        },
        {
          id: 'documents_health', labelFa: 'سلامت مدارک', order: 20, cardPlacement: 'row',
          loadComponent: () => import('./components/companies-studio/company-list-cells').then(m => m.CompanyDocumentsHealthCellComponent)
        }
      ],
      rowActions: [
        { id: 'gdrive', labelFa: 'گوگل‌درایو', hintFa: 'تنظیمات همگام‌سازی گوگل‌درایو', icon: 'google-drive', tab: 'gdrive' }
      ],
      // نقش‌های گردش‌کار حسابداری در انتساب کاربر به بخش (همان SECTION_ROLES در personnel/company_access.py)؛
      // تایید هر یک از دارندگان هم‌نقش پرونده را به گام بعد می‌برد (انتساب موازی)
      sectionRoles: [
        {
          key: 'manager', labelFa: 'مدیران پروژه / شرکت (تایید نهایی)', shortLabelFa: 'مدیران', icon: ROLE_ICONS.manager, tone: 'purple', order: 10,
          descriptionFa: 'تایید هر یک از مدیران، گردش‌کار و اسناد را مستقیماً به مرحلهٔ بعد منتقل می‌کند.', missingWarningFa: 'فاقد مدیر'
        },
        {
          key: 'accountant', labelFa: 'حسابداران پروژه (بررسی و تایید مالی)', shortLabelFa: 'حسابداران', icon: ROLE_ICONS.accountant, tone: 'amber', order: 20,
          descriptionFa: 'بررسی هزینه‌ها و تطبیق صورت‌حساب‌ها.'
        },
        {
          key: 'supervisor', labelFa: 'سرپرستان بخش (بررسی عملیاتی)', shortLabelFa: 'سرپرستان', icon: ROLE_ICONS.supervisor, tone: 'blue', order: 30,
          descriptionFa: 'نظارت عملیاتی بر ترددها، کارکرد پرسنل و ناوگان.'
        },
        {
          key: 'treasury', labelFa: 'خزانه‌داران کل (پرداخت و تسویه)', shortLabelFa: 'خزانه‌داران', icon: ROLE_ICONS.treasury, tone: 'emerald', order: 40,
          descriptionFa: 'صدور حوالهٔ پرداخت و تسویهٔ ریالی فاکتورها.'
        },
        {
          key: 'employee', labelFa: 'کارمندان و اپراتورها (ثبت‌کنندگان)', shortLabelFa: 'کارمندان', icon: ROLE_ICONS.operator, tone: 'slate', order: 50,
          descriptionFa: 'ثبت اطلاعات خام، کارکرد و پیش‌نویس اسناد.'
        }
      ]
    },
    users: {
      // ت۶: گروه، عنوان کوتاه و بستهٔ نقش مجوزها از فهرست کامل سرور (accounts/permission-catalog/) می‌آیند
      standalonePermissionTooltips: {
        perm_approve_personnel_supervisor: 'تایید مرحله سرپرست برای پرسنل',
        perm_approve_fleet_supervisor: 'تایید مرحله سرپرست برای ناوگان'
      },
      structureWritePermissions: ['perm_approve_personnel_manager'],
      assignmentScope: {
        priority: 20,
        labels: {
          singular: 'پروژه',
          plural: 'پروژه‌ها',
          pluralAttributive: 'پروژه‌های',
          allOption: 'همه پروژه‌ها / کارگاه‌ها',
          noneOption: 'بدون پروژه',
          listPrefix: 'پروژه‌ها:',
          column: 'محدوده پروژه‌ها',
          roleTitlePlaceholder: 'مثال: کارشناس ارشد مالی',
          presetsHint: 'تخصیص یکپارچه نقش‌های استاندارد سازمانی با ۱ کلیک',
          companiesTab: 'شرکت‌ها و پروژه‌ها',
          nextStep: 'پروژه‌ها و کارگاه‌ها',
          allowedTitle: 'شرکت‌ها و پروژه‌های مجاز',
          assignTitle: 'تخصیص پروژه‌های عملیاتی مجاز',
          emptyText: 'هیچ پروژه‌ای برای شرکت‌های انتخاب‌شده یافت نشد.',
          sensitiveRecords: 'پایگاه داده'
        },
        loadItems: async (injector) => {
          const api = injector.get(ApiService, null);
          if (!api) return [];
          const projects = await firstValueFrom(api.get<any[]>(FINANCIAL_PROJECTS_ENDPOINT, { is_active: true }));
          return Array.isArray(projects)
            ? projects.map(p => ({ id: p.id, name: p.name || p.title || `پروژه ${p.id}`, code: p.code }))
            : [];
        }
      },
      roleScope: {
        key: 'finance', order: 20,
        tabLabelFa: '💳 سامانه مالی و پرسنلی', badgeLabelFa: 'سامانه مالی و پرسنلی', shortLabelFa: 'مالی', tinyLabelFa: 'مالی',
        icon: '💳', tone: 'emerald',
        nameHints: ['finance', 'payroll'], titleHints: ['مالی', 'حقوق'],
        extraRoleNames: ['workshop_supervisor', 'company_manager'], extraTitleHints: ['سرپرست کارگاه', 'مدیر شرکت']
      }
    },
    healthDashboard: {
      panelScopes: ['accounting'],
      panel: {
        order: 20,
        scopeLabelFa: 'امور مالی و حقوق',
        tone: 'purple',
        storageLabelFa: 'مالی',
        dbLabelEn: 'Finance & HR IndexedDB',
        dbShortEn: 'Finance',
        stressScenario: {
          value: 'treasury',
          order: 10,
          optionLabelFa: 'فقط خزانه‌داری (جلوگیری از پرداخت دوبل)',
          shortLabelFa: 'خزانه‌داری',
          verdictLabelFa: 'گارد خزانه‌داری (ممانعت از پرداخت دوبل):',
          verdictValueFa: 'تایید شد (۱ پرداخت نهایی)'
        }
      }
    },
    audit: {
      appScopes: ['finance'],
      order: 20,
      scopeLabelFa: 'مالی و اداری',
      scopeChipLabelFa: 'مالی و اداری',
      blockedAppLabelFa: 'سامانه مالی و اداری',
      lockScopeOnRoute: true,
      headerTitleFa: 'مرکز ممیزی و رهگیری رویدادهای مالی و اداری',
      headerSubtitleFa: 'مانیتورینگ بلادرنگ احکام پرسنل، کارکرد، تردد ناوگان، فیش‌های حقوقی و خزانه‌داری',
      headerBadgeFa: 'سامانه مالی و پرسنلی (سازمانی)',
      logModules: [
        { value: 'payroll', labelFa: 'حقوق و دستمزد' },
        { value: 'personnel', labelFa: 'پرونده پرسنل' },
        { value: 'attendance', labelFa: 'کارکرد و تردد' },
        { value: 'fleet', labelFa: 'ناوگان و لجستیک' },
        { value: 'treasury', labelFa: 'خزانه‌داری و پرداخت' },
        { value: 'finance', labelFa: 'عملیات حسابداری' }
      ]
    },
    companyApiEndpoints: {
      companiesEndpoint: '/personnel/companies',
      accessEndpoint: '/personnel/user-company-access',
      documentsEndpoint: '/personnel/company-documents',
      bankAccountsEndpoint: '/personnel/company-bank-accounts',
      boardMembersEndpoint: '/personnel/company-board-members',
      fiscalPeriodsEndpoint: '/personnel/company-fiscal-periods',
      companyGdriveBaseEndpoint: (cid) => '/personnel/companies/' + cid + '/gdrive'
    },
    syncConfig: {
      scopeKind: 'finance',
      pullEndpoint: '/personnel/sync/pull/',
      scopeParamKey: 'project_id',
      activeAppHeader: 'personnel',
      defaultOfflineRole: 'operator',
      tokenScopeKey: 'finance',
      targetLabelFa: 'پروژه',
      purgeBeforeDeepUpdate: async (id, userId) => {
        const { financeOfflineDb } = await import('../../core/services/offline-db');
        const { buildCursorKey } = await import('../../core/services/sync-pull.service');
        const deleteProjectAttendance = async () => {
          try {
            if (financeOfflineDb.attendanceRecords) {
              const hasIndex = (financeOfflineDb.attendanceRecords.schema as any)?.indexes?.some(
                (idx: any) => idx.name === 'project_id'
              );
              if (hasIndex) {
                await financeOfflineDb.attendanceRecords.where('project_id').equals(id).delete();
              } else {
                await financeOfflineDb.attendanceRecords.filter((entry: any) => entry?.project_id === id).delete();
              }
            }
          } catch (err) {
            try {
              await financeOfflineDb.attendanceRecords.filter((entry: any) => entry?.project_id === id).delete();
            } catch (fallbackErr) {
              console.warn('[OfflineSync] عدم امکان پاکسازی محلی attendanceRecords:', fallbackErr);
            }
          }
        };

        await Promise.all([
          deleteProjectAttendance(),
          financeOfflineDb.syncCursors.where('warehouseId').equals(id).delete(),
          userId ? financeOfflineDb.syncCursors.delete(buildCursorKey(userId, id, 'finance')) : Promise.resolve(),
          userId ? financeOfflineDb.syncCursors.delete(`${userId}:${id}`) : Promise.resolve()
        ]);
        try {
          await financeOfflineDb.apiCache.filter((entry) => entry.url.includes(`project_id=${id}`)).delete();
        } catch {}
      }
    },
    offlineSync: {
      scopeKind: 'finance',
      dbName: 'WarehouseOfflineDB_finance',
      scopeAliases: ['personnel', 'accounting'],
      queueUrlPatterns: [
        '/personnel',
        '/payroll',
        '/finance',
        '/treasury',
        '/attendance',
        '/paya',
        '/slips',
        '/fiscal'
      ],
      activePathPatterns: [
        '/app/finance',
        '/finance',
        '/personnel',
        '/payroll'
      ],
      entityTypeUrlPatterns: [
        { urlPart: '/attendance/', entityType: 'daily_attendance' },
        { urlPart: '/company-bank-accounts/', entityType: 'company_bank_account' },
        { urlPart: '/company-board-members/', entityType: 'company_board_member' },
        { urlPart: '/company-documents/', entityType: 'company_document' }
        // /companies/ و /user-company-access/ موجودیت پلتفرم‌اند و در هسته (resolveEntityTypeFromUrl) اعلام شده‌اند (E6)
      ],
      appRoutePrefixes: [
        '/app/finance',
        '/app/personnel',
        '/app/payroll',
        '/app/treasury',
        '/app/projects'
      ],
      sensitiveConflicts: true
    },
    projectLookup: {
      financialProjectsEndpoint: FINANCIAL_PROJECTS_ENDPOINT
    },
    notificationHandlers: ACCOUNTING_NOTIFICATION_HANDLERS,
    permissionAliases: {
      count_supervisor_exclusion: ['can_act_as_workshop_supervisor'],
      audit_viewer: ['view_sys_payroll']
    }
  }
};
