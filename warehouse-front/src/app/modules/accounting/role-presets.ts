import { ModuleRolePreset } from '../../core/modules/module-contract';

/** قالب‌های آمادهٔ نقش این ماژول در صفحهٔ کاربران (extension users.rolePresets) */
export const ACCOUNTING_ROLE_PRESETS: ModuleRolePreset[] = [
  // ─── دسته ۲: حسابداری، کارگاه و کارکرد (Accounting & Workshop) ───
  {
    id: 'workshop_operator',
    title: 'کارمند کارگاه',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#64748b',
    icon: '👤',
    description: 'ثبت روزانه کارت‌های تردد، حضور و غیاب پرسنل و ساعات کارکرد و سرویس ماشین‌آلات و ناوگان',
    permissionCodenames: [
      'can_act_as_operator', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance'
    ]
  },
  {
    id: 'workshop_supervisor',
    title: 'سرپرست کارگاه',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#3b82f6',
    icon: '🦺',
    description: 'کنترل کارکردها و تایید مرحله اول (عملیاتی و میدانی) کارکرد ماهانه پرسنل و ناوگان',
    permissionCodenames: [
      'can_act_as_workshop_supervisor', 'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
      'perm_lock_work_period', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance'
    ]
  },
  {
    id: 'accountant',
    title: 'حسابدار',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#10b981',
    icon: '💳',
    description: 'محاسبات حقوق و دستمزد ماهانه، کسر بیمه و مالیات، تسویه پیمانکاران ناوگان و تایید مرحله مالی',
    permissionCodenames: [
      'can_act_as_accountant', 'view_sys_payroll', 'view_sys_fleet_settlement',
      'perm_approve_personnel_finance', 'perm_approve_fleet_finance'
    ]
  },
  {
    id: 'company_manager',
    title: 'مدیر شرکت',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#8b5cf6',
    icon: '👑',
    description: 'بررسی گزارش‌های مالی و حقوق کارگاه‌ها، قفل دوره ماهانه، تصویب و صدور مجوز پرداخت بانکی',
    permissionCodenames: [
      'can_act_as_company_manager', 'perm_manager_payment_authorize',
      'perm_approve_personnel_manager', 'perm_approve_fleet_manager',
      'perm_lock_work_period', 'view_sys_payroll', 'view_sys_fleet_settlement',
      'perm_delete_personnel_nomovement', 'perm_delete_vehicle_nomovement'
    ]
  },
  {
    id: 'treasury',
    title: 'خزانه‌دار و پرداخت',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#d97706',
    icon: '🏦',
    description: 'کارتابل خزانه‌داری، صدور فایل پرداخت پایا/چک، ثبت واریز قطعی و صدور رسید تسویه',
    permissionCodenames: [
      'view_sys_treasury', 'perm_treasury_disburse_action'
    ]
  },
  {
    id: 'org_admin',
    title: 'راهبر تشکیلات و سیستم',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#0284c7',
    icon: '🏢',
    description: 'تعریف پروژه‌ها و بخش‌ها و انتساب کاربران به بخش‌ها؛ بدون تایید کارکرد، مجوز پرداخت یا ابزار زیرساخت',
    permissionCodenames: [
      'perm_manage_projects_sections'
    ]
  }
];
