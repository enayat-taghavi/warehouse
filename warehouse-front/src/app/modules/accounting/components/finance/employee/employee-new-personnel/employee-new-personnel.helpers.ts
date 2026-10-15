import {
  PersonnelLocalDraft,
  savePersonnelLocalDraft,
  listPersonnelLocalDrafts,
  personnelLocalDraftKey,
  newPersonnelLocalDraftId
} from '../../../../../../core/services/offline-db';
import { normalizeDigits } from '../../../../../../core/utils/date-utils';
import {
  PersonnelProfile,
  PersonnelBankAccount,
  PersonnelDocument,
  ProjectSection
} from '../../../../../../core/models/personnel.model';
import {
  extractShebaDigits,
  validateSheba,
  cleanShebaInput,
  ShebaValidationResult,
  IRANIAN_BANKS,
  IranianBankInfo,
  generateShebaFromAccount
} from '../../../../../../core/utils/sheba-utils';

export const FIELD_LABELS_MAP: Record<string, string> = {
  first_name: 'نام',
  last_name: 'نام خانوادگی',
  national_code: 'کد ملی',
  father_name: 'نام پدر',
  gender: 'جنسیت',
  id_number: 'شماره شناسنامه',
  id_series: 'سری شناسنامه',
  id_serial: 'سریال شناسنامه',
  birth_date: 'تاریخ تولد',
  birth_place: 'محل تولد',
  issue_place: 'محل صدور',
  issue_date: 'تاریخ صدور',
  job_title: 'عنوان شغلی',
  job_code: 'کد ردیف شغلی',
  contract_type: 'نوع قرارداد',
  marital_status: 'وضعیت تاهل',
  children_count: 'تعداد فرزندان',
  phone_number: 'شماره همراه',
  address: 'نشانی سکونت',
  postal_code: 'کد پستی',
  notes: 'یادداشت و توضیحات',
  valid_until_date: 'پایان اعتبار مدرک احراز',
  recommender: 'معرف / معرفین',
  section: 'بخش / پروژه',
  bank_name: 'نام بانک',
  account_number: 'شماره حساب',
  sheba_number: 'شماره شبا',
  card_number: 'شماره کارت',
  is_active: 'وضعیت فعالیت'
};

export const DEFAULT_JOB_TITLES: string[] = [
  'کارگر ساده انبار',
  'اپراتور لیفتراک',
  'کمک انباردار',
  'راننده خودرو سبک/سنگین',
  'مسئول انبار',
  'کارشناس اداری و مالی',
  'نگهبان و انتظامات',
  'کارگر فنی و تاسیسات',
  'سایر'
];

export const DEFAULT_CONTRACT_TYPES = [
  { value: 'daily', label: 'روزمزد (مبنا ۱۰ ساعت)' }
];

export const CONTRACT_TYPE_OPTIONS = [
  { value: 'daily', label: 'روزمزد (۱۰ ساعت)' }
];

export const MARITAL_STATUS_OPTIONS = [
  { value: 'single', label: 'مجرد' },
  { value: 'married', label: 'متاهل' }
];

export const GENDER_OPTIONS = [
  { value: 'مرد', label: 'مرد' },
  { value: 'زن', label: 'زن' }
];

export const DOC_TYPE_OPTIONS = [
  { value: 'national_card', label: 'کارت ملی (پشت و رو)' },
  { value: 'birth_certificate', label: 'شناسنامه (صفحات اول و توضیحات)' },
  { value: 'contract', label: 'فرم قرارداد امضا شده' },
  { value: 'bank_card', label: 'تاییدیه حساب / کارت بانکی' },
  { value: 'insurance', label: 'سوابق بیمه تامین اجتماعی' },
  { value: 'other', label: 'سایر مدارک هویتی و پرسنلی' }
];

export const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'national_code', 'father_name', 'gender', 'id_number', 'id_series', 'id_serial',
  'birth_date', 'birth_place', 'issue_place', 'issue_date', 'job_title', 'job_code', 'contract_type',
  'marital_status', 'children_count', 'phone_number', 'address', 'postal_code', 'notes',
  'valid_until_date', 'recommender', 'section'
];

export const BANK_MIRROR_FIELDS = ['bank_name', 'account_number', 'sheba_number', 'card_number'];

export function getStatusBadgeClassHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'pending_supervisor':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'pending_accountant':
    case 'pending_manager':
    case 'manager_approved':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'revision_required':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export function getStatusIconHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return '📝';
    case 'pending_supervisor':
    case 'pending_accountant':
    case 'pending_manager':
      return '⏳';
    case 'manager_approved':
    case 'approved':
      return '✓';
    case 'revision_required':
      return '↩';
    case 'rejected':
      return '✕';
    default:
      return '•';
  }
}

export function getStatusLabelHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'پیش‌نویس';
    case 'pending_supervisor':
      return 'سرپرست';
    case 'pending_accountant':
      return 'حسابدار';
    case 'pending_manager':
      return 'مدیر';
    case 'manager_approved':
      return 'تایید مدیر';
    case 'approved':
      return 'مصوب';
    case 'revision_required':
      return 'عودت';
    case 'rejected':
      return 'رد شده';
    default:
      return status || 'نامشخص';
  }
}

export function getFullStatusDescriptionHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'پیش‌نویس ثبت شده توسط کارمند انبار';
    case 'pending_supervisor':
      return 'در انتظار بررسی و تایید سرپرست انبار';
    case 'pending_accountant':
      return 'تایید سرپرست / در انتظار بررسی حسابدار';
    case 'pending_manager':
      return 'تایید حسابدار / در انتظار تصویب مدیر';
    case 'manager_approved':
      return 'تایید اولیه مدیر';
    case 'approved':
      return 'تصویب و فعال‌سازی نهایی شده';
    case 'revision_required':
      return 'نیازمند بازنگری و اصلاح به دلیل اشکال';
    case 'rejected':
      return 'رد شده و باطل گردیده';
    default:
      return status || 'نامشخص';
  }
}

export function getContractTypeLabelHelper(type?: string): string {
  switch (type) {
    case 'daily':
      return 'روزمزد (۱۰ ساعت)';
    default:
      return 'روزمزد (۱۰ ساعت)';
  }
}

export function getWorkflowActionLabelHelper(action?: string): string {
  switch (action) {
    case 'submit':
      return 'ارسال به سرپرست';
    case 'approve_supervisor':
      return 'تایید سرپرست';
    case 'approve_accountant':
    case 'approve_finance':
      return 'تایید حسابدار';
    case 'approve_manager':
      return 'تصویب نهایی مدیر';
    case 'batch_approve':
      return 'تایید گروهی';
    case 'revision':
    case 'request_revision':
      return 'عودت جهت اصلاح';
    case 'reject':
      return 'رد پرونده';
    case 'cancel_change_request':
    case 'change_request_cancelled':
      return 'ابطال درخواست تغییرات';
    case 'change_request_created':
      return 'ثبت درخواست تغییرات';
    case 'change_request_approve_supervisor':
      return 'تایید سرپرست بر درخواست تغییرات';
    case 'change_request_approve_finance':
      return 'تایید حسابدار بر درخواست تغییرات';
    case 'change_request_applied':
      return 'تصویب و اعمال درخواست تغییرات';
    case 'change_request_rejected':
      return 'رد درخواست تغییرات';
    case 'auto_pass':
      return 'عبور هوشمند مراحل';
    case 'accountant_edit':
      return 'ویرایش حسابدار';
    case 'superuser_edit':
      return 'ویرایش مدیر سیستم';
    case 'bank_account_deleted':
      return 'حذف حساب بانکی';
    case 'document_deleted':
      return 'حذف مدرک';
    case 'excel_import_update':
      return 'به‌روزرسانی از درون‌ریزی اکسل';
    case 'reopen':
      return 'بازگشایی پرونده ردشده';
    case 'end_collaboration':
      return 'قطع همکاری';
    case 'purge':
      return 'پاک‌سازی پرونده';
    case 'delete':
      return 'حذف پرونده';
    case 'create':
      return 'تشکیل پرونده اولیه';
    case 'update':
    case 'edit':
      return 'ویرایش اطلاعات';
    default:
      return action || 'اقدام گردش کار';
  }
}

export function getWorkflowActionBadgeClassHelper(action?: string): string {
  switch (action) {
    case 'submit':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'approve_supervisor':
    case 'approve_accountant':
    case 'approve_finance':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'approve_manager':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'batch_approve':
      return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'revision':
    case 'request_revision':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'reject':
    case 'purge':
    case 'delete':
    case 'change_request_rejected':
    case 'end_collaboration':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'cancel_change_request':
    case 'change_request_cancelled':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'auto_pass':
    case 'change_request_applied':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'reopen':
    case 'change_request_created':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export function getWorkflowActionIconHelper(action?: string): string {
  switch (action) {
    case 'submit':
      return '📤';
    case 'approve_supervisor':
    case 'approve_accountant':
    case 'approve_finance':
      return '✓';
    case 'approve_manager':
      return '🌟';
    case 'batch_approve':
      return '👥';
    case 'revision':
    case 'request_revision':
      return '↩';
    case 'reject':
    case 'purge':
    case 'delete':
    case 'change_request_rejected':
      return '✕';
    case 'cancel_change_request':
    case 'change_request_cancelled':
      return '🚫';
    case 'auto_pass':
      return '⚡';
    case 'reopen':
      return '🔄';
    case 'end_collaboration':
      return '⏹';
    case 'create':
    case 'change_request_created':
      return '📝';
    default:
      return '📋';
  }
}

export function formatWageNumberHelper(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '۰';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('fa-IR');
}

export function formatShebaDisplayHelper(sheba?: string): string {
  if (!sheba) return '—';
  const clean = sheba.replace(/\s+/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function formatDiffValueHelper(key: string, value: any): string {
  if (value === undefined || value === null || value === '') return '—';
  if (key === 'daily_base_wage') {
    return formatWageNumberHelper(value) + ' ریال';
  }
  if (key === 'gender') {
    return value === 'female' || value === 'زن' ? 'زن' : 'مرد';
  }
  if (key === 'marital_status') {
    return value === 'married' || value === 'متاهل' ? 'متاهل' : 'مجرد';
  }
  if (key === 'contract_type') {
    return getContractTypeLabelHelper(value);
  }
  if (key === 'is_active') {
    return value ? 'فعال' : 'غیرفعال';
  }
  return String(value);
}

export function downloadBlobHelper(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export function createDefaultPersonnelForm(): Partial<PersonnelProfile> {
  return {
    first_name: '',
    last_name: '',
    national_code: '',
    father_name: '',
    gender: 'مرد',
    id_number: '',
    id_series: '',
    id_serial: '',
    birth_date: '',
    birth_place: '',
    issue_place: '',
    issue_date: '',
    job_title: '',
    job_code: '',
    contract_type: 'daily',
    marital_status: 'single',
    children_count: 0,
    daily_base_wage: 0,
    phone_number: '',
    bank_name: '',
    account_number: '',
    sheba_number: '',
    card_number: '',
    address: '',
    postal_code: '',
    notes: '',
    is_active: true,
    approval_status: 'draft',
    valid_until_date: '',
    recommender: ''
  };
}

export function buildFormValuesHelper(newPersonnel: any): Record<string, any> {
  const text = (v: any): string => (typeof v === 'string' ? v.trim() : (v === null || v === undefined ? '' : String(v)));
  return {
    first_name: text(newPersonnel.first_name),
    last_name: text(newPersonnel.last_name),
    national_code: text(newPersonnel.national_code),
    father_name: text(newPersonnel.father_name),
    gender: newPersonnel.gender || 'مرد',
    id_number: text(newPersonnel.id_number),
    id_series: text(newPersonnel.id_series),
    id_serial: text(newPersonnel.id_serial),
    birth_date: text(newPersonnel.birth_date),
    birth_place: text(newPersonnel.birth_place),
    issue_place: text(newPersonnel.issue_place),
    issue_date: text(newPersonnel.issue_date),
    job_title: text(newPersonnel.job_title),
    job_code: text(newPersonnel.job_code),
    contract_type: newPersonnel.contract_type || 'daily',
    marital_status: newPersonnel.marital_status || 'single',
    children_count: Number(newPersonnel.children_count) || 0,
    phone_number: text(newPersonnel.phone_number),
    address: text(newPersonnel.address),
    postal_code: text(newPersonnel.postal_code),
    notes: text(newPersonnel.notes),
    valid_until_date: text(newPersonnel.valid_until_date),
    recommender: text(newPersonnel.recommender)
  };
}

export function filterPersonnelHelper(
  recentPersonnel: PersonnelProfile[],
  statusFilter: string,
  searchQuery: string
): PersonnelProfile[] {
  let list = recentPersonnel;
  if (statusFilter !== 'all') {
    if (statusFilter === 'approved') {
      list = list.filter(p => p.approval_status === 'approved' || p.approval_status === 'manager_approved');
    } else {
      list = list.filter(p => p.approval_status === statusFilter);
    }
  }
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(p =>
      (p.first_name && p.first_name.toLowerCase().includes(q)) ||
      (p.last_name && p.last_name.toLowerCase().includes(q)) ||
      (p.national_code && p.national_code.includes(q)) ||
      (p.phone_number && p.phone_number.includes(q)) ||
      (p.job_title && p.job_title.toLowerCase().includes(q)) ||
      (p.bank_name && p.bank_name.toLowerCase().includes(q))
    );
  }
  return list;
}

export function computePersonnelMetrics(recentPersonnel: PersonnelProfile[]) {
  const total = recentPersonnel.length;
  const drafts = recentPersonnel.filter(p => p.approval_status === 'draft').length;
  const pending = recentPersonnel.filter(p =>
    p.approval_status === 'pending_supervisor' ||
    p.approval_status === 'pending_accountant' ||
    p.approval_status === 'pending_manager'
  ).length;
  const approved = recentPersonnel.filter(p => p.approval_status === 'approved' || p.approval_status === 'manager_approved').length;
  const rejected = recentPersonnel.filter(p => p.approval_status === 'rejected').length;
  const revision_required = recentPersonnel.filter(p => p.approval_status === 'revision_required').length;
  const dailyCount = recentPersonnel.filter(p => p.contract_type === 'daily').length;
  return {
    total,
    drafts,
    pending,
    approved,
    rejected,
    revision_required,
    revision: revision_required,
    dailyCount
  };
}

export function buildPersonnelStatusFilterTabs(vm: any): any[] {
  return [
    { id: 'all', label: 'همه نیروها', icon: 'status-all', count: vm.total },
    { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft', count: vm.drafts },
    { id: 'pending_supervisor', label: 'در انتظار سرپرست', shortLabel: 'سرپرست', icon: 'status-pending', count: vm.pending },
    { id: 'revision_required', label: 'نیازمند اصلاح', shortLabel: 'اصلاح', icon: 'status-revision', count: vm.revision, tone: 'amber' },
    { id: 'approved', label: 'مصوب و فعال', shortLabel: 'مصوب', icon: 'status-approved', count: vm.approved, tone: 'emerald' },
    { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected', count: vm.rejected, tone: 'rose' }
  ];
}

export function buildPersonnelModalTabs(step: (tab: any, done?: string, todo?: string) => any): any[] {
  return [
    { id: 'identity', label: '۱. مشخصات هویتی و شناسنامه‌ای', shortLabel: 'هویتی', icon: 'user', indicator: step('identity') },
    { id: 'job', label: '۲. شغل و وضعیت همکاری', shortLabel: 'شغل', icon: 'briefcase', indicator: step('job') },
    { id: 'banking', label: '۳. اطلاعات بانکی و واریز حقوق', shortLabel: 'بانک', icon: 'credit-card', indicator: step('banking') },
    { id: 'address', label: '۴. نشانی و اطلاعات تماس', shortLabel: 'تماس', icon: 'map-pin', indicator: step('address') },
    { id: 'documents', label: '۵. مدارک و پیوست‌ها', shortLabel: 'مدارک', icon: 'file-text', indicator: step('documents') }
  ];
}

export function checkIsPersonnelTabComplete(
  tab: string,
  newPersonnel: Partial<PersonnelProfile>,
  bankAccounts: PersonnelBankAccount[],
  serverMissingFields: Array<{ field: string; label: string }>
): boolean {
  if (serverMissingFields.some(m => {
    const f = m.field.toLowerCase();
    switch (tab) {
      case 'identity':
        return f.includes('first_name') || f.includes('last_name') || f.includes('national_code') || f.includes('father_name') || f.includes('birth_date');
      case 'job':
        return f.includes('job_title') || f.includes('job_code') || f.includes('contract_type') || f.includes('wage');
      case 'banking':
        return f.includes('bank') || f.includes('account') || f.includes('sheba');
      case 'address':
        return f.includes('phone') || f.includes('address') || f.includes('postal');
      default:
        return false;
    }
  })) {
    return false;
  }

  switch (tab) {
    case 'identity':
      return !!(
        newPersonnel.first_name?.trim() &&
        newPersonnel.last_name?.trim() &&
        newPersonnel.national_code?.trim() &&
        newPersonnel.father_name?.trim() &&
        newPersonnel.birth_date?.trim()
      );
    case 'job':
      return !!(newPersonnel.job_title?.trim());
    case 'banking':
      if (bankAccounts && bankAccounts.length > 0) return true;
      return !!(newPersonnel.sheba_number?.trim());
    case 'address':
      return !!(newPersonnel.phone_number?.trim());
    case 'documents':
      return true;
    default:
      return true;
  }
}

export function checkIsFieldMissingHelper(field: string, serverMissingFields: Array<{ field: string; label: string }>): boolean {
  return serverMissingFields.some(m => m.field === field);
}

export function validatePersonnelBeforeSave(
  newPersonnel: Partial<PersonnelProfile>,
  selectedSectionId?: number | null,
  phoneError?: string | null,
  postalCodeError?: string | null,
  shebaValidationResult?: any
): { error?: string; tab?: 'identity' | 'job' | 'banking' | 'address' | 'documents' } {
  if (!selectedSectionId) return { error: 'لطفاً ابتدا یک بخش را انتخاب فرمایید.' };
  if (!newPersonnel.first_name?.trim()) return { error: 'نام پرسنل الزامی است.', tab: 'identity' };
  if (!newPersonnel.last_name?.trim()) return { error: 'نام خانوادگی الزامی است.', tab: 'identity' };
  if (!newPersonnel.national_code?.trim()) return { error: 'کد ملی الزامی است.', tab: 'identity' };
  if (!newPersonnel.father_name?.trim()) return { error: 'نام پدر الزامی است.', tab: 'identity' };
  if (!newPersonnel.birth_date?.trim()) return { error: 'تاریخ تولد الزامی است.', tab: 'identity' };
  if (phoneError) return { error: phoneError, tab: 'address' };
  if (postalCodeError) return { error: postalCodeError, tab: 'address' };
  if (shebaValidationResult && !shebaValidationResult.isValid) {
    return { error: shebaValidationResult.errorMessage || 'شماره شبا نامعتبر است.', tab: 'banking' };
  }
  return {};
}

export function parsePersonnelEditModalData(p: PersonnelProfile) {
  const form: Partial<PersonnelProfile> = {
    ...p,
    contract_type: p.contract_type || 'daily',
    marital_status: p.marital_status || 'single',
    children_count: p.children_count || 0,
    daily_base_wage: p.daily_base_wage || 0,
    gender: p.gender || 'مرد',
    id_number: p.id_number || '',
    id_series: p.id_series || '',
    id_serial: p.id_serial || '',
    birth_date: p.birth_date || '',
    birth_place: p.birth_place || '',
    issue_place: p.issue_place || '',
    phone_number: p.phone_number || '',
    address: p.address || '',
    postal_code: p.postal_code || '',
    job_title: p.job_title || 'کارگر انبار',
    job_code: p.job_code || '',
    notes: p.notes || ''
  };
  const wageFormattedDisplay = (p.daily_base_wage && p.daily_base_wage > 0)
    ? Number(p.daily_base_wage).toLocaleString('fa-IR')
    : '';
  let shebaValidationResult: any = null;
  let shebaDigitsDisplay = '';
  let bankAccounts: PersonnelBankAccount[] = [];

  if (p.bank_accounts && p.bank_accounts.length > 0) {
    bankAccounts = p.bank_accounts.map(a => ({ ...a }));
  } else if (p.sheba_number || p.account_number || p.bank_name) {
    bankAccounts = [{
      bank_name: p.bank_name || '',
      account_number: p.account_number || '',
      sheba_number: p.sheba_number || '',
      card_number: p.card_number || '',
      is_primary: true,
      is_active: true
    }];
    if (p.sheba_number) {
      const clean = cleanShebaInput(p.sheba_number);
      shebaValidationResult = validateSheba(clean);
      shebaDigitsDisplay = shebaValidationResult.formattedDigits || extractShebaDigits(clean);
    }
  }

  return {
    form,
    wageFormattedDisplay,
    shebaValidationResult,
    shebaDigitsDisplay,
    bankAccounts
  };
}

export function getModalHeaderTitleHelper(
  editingPersonnel: PersonnelProfile | null,
  isApprovedRecord: boolean,
  editingPersonnelStatus: string | null,
  isReadOnlyMode: boolean
): string {
  if (editingPersonnel) {
    if (isApprovedRecord) return 'ویرایش و پیشنهاد تغییرات پرونده مصوب';
    if (editingPersonnelStatus === 'revision_required') return 'اصلاح و بازنگری پرونده پرسنل';
    if (isReadOnlyMode) return 'مشاهده مشخصات پرسنل';
    return 'ویرایش پرونده پیش‌نویس پرسنل';
  }
  return 'تشکیل پرونده و معرفی پرسنل جدید';
}

export function getModalHeaderBadgeHelper(
  isApprovedRecord: boolean,
  editingPersonnelStatus: string | null,
  editingId: number | null
): { label: string; class: string } {
  if (isApprovedRecord) {
    return { label: 'پرونده مصوب', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  }
  if (editingPersonnelStatus === 'revision_required') {
    return { label: 'نیازمند اصلاح', class: 'bg-amber-100 text-amber-800 border-amber-300' };
  }
  if (editingPersonnelStatus === 'pending_supervisor') {
    return { label: 'در انتظار تایید سرپرست', class: 'bg-purple-100 text-purple-800 border-purple-300' };
  }
  if (editingPersonnelStatus === 'pending_accountant') {
    return { label: 'در انتظار بررسی حسابدار', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
  }
  if (editingPersonnelStatus === 'pending_manager') {
    return { label: 'در انتظار تصویب مدیر', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
  }
  if (editingPersonnelStatus === 'rejected') {
    return { label: 'رد شده', class: 'bg-rose-100 text-rose-800 border-rose-300' };
  }
  if (editingId) {
    return { label: 'پیش‌نویس کارمند', class: 'bg-slate-100 text-slate-700 border-slate-300' };
  }
  return { label: 'جدید', class: 'bg-white/20 text-white border-white/30' };
}

export function handlePersonnelWsUpdateHelper(
  recentPersonnel: PersonnelProfile[],
  msg: any,
  currentCompanyId?: number | null,
  selectedSectionId?: number | null,
  editingId?: number | null
): { ignore?: boolean; shouldReload?: boolean; isDeleted?: boolean; deletedId?: number; updatedList: PersonnelProfile[]; updatedPersonnel?: PersonnelProfile } {
  if (!msg) return { ignore: true, updatedList: recentPersonnel };
  const cId = msg.company_id || msg.metadata?.company_id;
  if (currentCompanyId && cId && Number(cId) !== Number(currentCompanyId)) return { ignore: true, updatedList: recentPersonnel };
  const sId = msg.section_id || msg.metadata?.section_id;
  if (selectedSectionId && sId && Number(sId) !== Number(selectedSectionId)) return { ignore: true, updatedList: recentPersonnel };
  const pId = msg.personnel_id || msg.id || msg.object_id || msg.metadata?.personnel_id;
  if (!pId) return { shouldReload: true, updatedList: recentPersonnel };

  const hasInline = !!(msg.data || msg.approval_status || msg.to_status || msg.action || msg.first_name || msg.last_name || msg.job_title);
  if (!hasInline) return { shouldReload: true, updatedList: recentPersonnel };

  if (msg.action === 'deleted') {
    return { isDeleted: true, deletedId: pId, updatedList: recentPersonnel.filter(p => p.id !== pId) };
  }
  const idx = recentPersonnel.findIndex(p => p.id === pId);
  if (idx !== -1) {
    const existing = recentPersonnel[idx];
    const updated: PersonnelProfile = {
      ...existing,
      ...msg.data,
      approval_status: msg.approval_status || msg.to_status || existing.approval_status,
      rejection_reason: msg.rejection_reason !== undefined ? msg.rejection_reason : (msg.reason || existing.rejection_reason),
      has_pending_changes: msg.has_pending_changes !== undefined ? msg.has_pending_changes : existing.has_pending_changes
    };
    if (msg.first_name) updated.first_name = msg.first_name;
    if (msg.last_name) updated.last_name = msg.last_name;
    if (msg.job_title) updated.job_title = msg.job_title;

    const copy = [...recentPersonnel];
    copy[idx] = updated;
    return { updatedList: copy, updatedPersonnel: updated };
  }
  return { shouldReload: true, updatedList: recentPersonnel };
}


export function normalizeForDiffHelper(v: any): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function buildChangedFieldsHelper(
  current: Record<string, any>,
  initial: Record<string, any>,
  includeBankMirror: boolean
): Record<string, any> {
  const init = initial || {};
  const keys = [
    ...EDITABLE_FIELDS,
    ...(includeBankMirror ? BANK_MIRROR_FIELDS : [])
  ];
  const changed: Record<string, any> = {};
  for (const key of keys) {
    if (normalizeForDiffHelper(current[key]) !== normalizeForDiffHelper(init[key])) {
      changed[key] = current[key];
    }
  }
  return changed;
}

export function desiredBankAccountsHelper(
  bankAccounts: PersonnelBankAccount[],
  newPersonnel: Partial<PersonnelProfile>
): PersonnelBankAccount[] {
  if (bankAccounts && bankAccounts.length > 0) return bankAccounts;
  const sheba = newPersonnel.sheba_number ? extractShebaDigits(newPersonnel.sheba_number) : '';
  if (sheba && validateSheba(sheba).isValid) {
    return [{
      bank_name: newPersonnel.bank_name || '',
      account_number: newPersonnel.account_number || '',
      sheba_number: newPersonnel.sheba_number || '',
      card_number: newPersonnel.card_number || '',
      is_primary: true,
      is_active: true
    }];
  }
  return [];
}

export function extractServerErrorHelper(err: any): string {
  const e = err?.error;
  if (!e) return err?.message || 'نامشخص';
  if (typeof e === 'string') return e;
  if (e.error) return e.error;
  if (e.detail) return e.detail;
  for (const [field, value] of Object.entries(e)) {
    const msg = Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : null);
    if (msg) return `${field}: ${msg}`;
  }
  return err?.message || 'نامشخص';
}

export function applyFoundPersonnelDataHelper(
  found: any,
  current: Partial<PersonnelProfile>
): {
  updatedForm: Partial<PersonnelProfile>;
  wageFormattedDisplay: string;
  shebaValidationResult: any;
  shebaDigitsDisplay: string;
} {
  const updatedForm: Partial<PersonnelProfile> = {
    ...current,
    first_name: found.first_name || current.first_name,
    last_name: found.last_name || current.last_name,
    father_name: found.father_name || current.father_name,
    gender: found.gender || current.gender,
    id_number: found.id_number || current.id_number,
    id_series: found.id_series || current.id_series,
    id_serial: found.id_serial || current.id_serial,
    birth_date: found.birth_date || current.birth_date,
    birth_place: found.birth_place || current.birth_place,
    issue_place: found.issue_place || current.issue_place,
    phone_number: found.phone_number || current.phone_number,
    address: found.address || current.address,
    postal_code: found.postal_code || current.postal_code,
    job_title: found.job_title || current.job_title,
    job_code: found.job_code || current.job_code,
    daily_base_wage: found.daily_base_wage !== undefined ? found.daily_base_wage : current.daily_base_wage,
    children_count: found.children_count !== undefined ? found.children_count : (current.children_count || 0),
    bank_name: found.bank_name || current.bank_name,
    account_number: found.account_number || current.account_number,
    sheba_number: found.sheba_number || current.sheba_number,
    card_number: found.card_number || current.card_number
  };

  const wageFormattedDisplay = (updatedForm.daily_base_wage && Number(updatedForm.daily_base_wage) > 0)
    ? Number(updatedForm.daily_base_wage).toLocaleString('fa-IR')
    : '';

  let shebaValidationResult: any = null;
  let shebaDigitsDisplay = '';
  if (updatedForm.sheba_number) {
    const digits = extractShebaDigits(updatedForm.sheba_number);
    shebaValidationResult = validateSheba(digits);
    shebaDigitsDisplay = shebaValidationResult.formattedDigits || digits;
  }

  return {
    updatedForm,
    wageFormattedDisplay,
    shebaValidationResult,
    shebaDigitsDisplay
  };
}

export function handleShebaInputHelper(
  rawVal: string,
  oldSel: number
): {
  digits: string;
  res: any;
  shebaDigitsDisplay: string;
  rawSheba: string;
  bankName?: string;
  accountNumber?: string;
  newCursorPos: number;
} {
  const digitsBeforeCursor = extractShebaDigits(rawVal.slice(0, oldSel)).length;
  const digits = extractShebaDigits(rawVal);
  const res = validateSheba(digits);
  const shebaDigitsDisplay = res.formattedDigits || digits;
  const rawSheba = res.rawSheba || digits;
  let newPos = 0;
  let countedDigits = 0;
  for (let i = 0; i < shebaDigitsDisplay.length; i++) {
    if (countedDigits >= digitsBeforeCursor) break;
    if (/\d/.test(shebaDigitsDisplay[i])) countedDigits++;
    newPos = i + 1;
  }
  return {
    digits,
    res,
    shebaDigitsDisplay,
    rawSheba,
    bankName: res.bank?.name,
    accountNumber: res.accountNumber,
    newCursorPos: newPos
  };
}

export function handleAccountNumberInputHelper(
  rawVal: string,
  bankName?: string
): {
  cleanAcc: string;
  generatedSheba?: string;
  shebaRes?: any;
} {
  const cleanAcc = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 18);
  let generatedSheba: string | undefined;
  let shebaRes: any;
  if (cleanAcc.length >= 8 && bankName) {
    const gen = generateShebaFromAccount(bankName, cleanAcc);
    if (gen) {
      generatedSheba = gen;
      shebaRes = validateSheba(gen);
    }
  }
  return { cleanAcc, generatedSheba, shebaRes };
}

export function handleWageInputHelper(
  rawVal: string,
  oldSel: number
): {
  num: number;
  wageFormattedDisplay: string;
  newCursorPos: number;
} {
  const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '');
  const num = Number(cleanDigits) || 0;
  const wageFormattedDisplay = num > 0 ? num.toLocaleString('fa-IR') : '';
  const digitsBeforeCursor = normalizeDigits(rawVal.slice(0, oldSel)).replace(/\D/g, '').length;
  let newPos = 0;
  let countedDigits = 0;
  for (let i = 0; i < wageFormattedDisplay.length; i++) {
    if (countedDigits >= digitsBeforeCursor) break;
    if (/\d/.test(normalizeDigits(wageFormattedDisplay[i]))) countedDigits++;
    newPos = i + 1;
  }
  return { num, wageFormattedDisplay, newCursorPos: newPos };
}

export function handleNationalCodeChangeHelper(rawVal: string): { cleanCode: string; error: string | null } {
  const cleanCode = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 10);
  let error: string | null = null;
  if (cleanCode.length > 0 && cleanCode.length < 10) {
    error = 'کد ملی باید ۱۰ رقم باشد.';
  }
  return { cleanCode, error };
}

export function handlePhoneInputHelper(rawVal: string): { cleanPhone: string; error: string | null } {
  const cleanPhone = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 11);
  let error: string | null = null;
  if (cleanPhone.length > 0 && (!cleanPhone.startsWith('09') || cleanPhone.length !== 11)) {
    error = 'شماره همراه باید ۱۱ رقم بوده و با ۰۹ آغاز شود.';
  }
  return { cleanPhone, error };
}

export function handlePostalCodeInputHelper(rawVal: string): { cleanPostal: string; error: string | null } {
  const cleanPostal = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 10);
  let error: string | null = null;
  if (!cleanPostal) {
    error = 'کد پستی ۱۰ رقمی الزامی است.';
  } else if (cleanPostal.length !== 10) {
    error = 'کد پستی باید دقیقاً ۱۰ رقم عددی باشد.';
  } else if (/^(\d)\1{9}$/.test(cleanPostal)) {
    error = 'کد پستی نامعتبر است (ارقام یکسان).';
  }
  return { cleanPostal, error };
}

export function handleBirthDateInputHelper(rawVal: string): string {
  const digits = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 8);
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
  } else if (digits.length >= 4) {
    return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  }
  return digits;
}

export function getMissingFieldsListHelper(
  newPersonnel: Partial<PersonnelProfile>,
  serverMissingFields: Array<{ field: string; label: string }>
): string[] {
  const missing: string[] = [];
  if (!newPersonnel.first_name?.trim()) missing.push('نام');
  if (!newPersonnel.last_name?.trim()) missing.push('نام خانوادگی');
  if (!newPersonnel.national_code?.trim()) missing.push('کد ملی ۱۰ رقمی');
  if (!newPersonnel.father_name?.trim()) missing.push('نام پدر');
  if (!newPersonnel.birth_date?.trim()) missing.push('تاریخ تولد');
  if (!newPersonnel.job_title?.trim()) missing.push('عنوان شغلی');
  if (!newPersonnel.phone_number?.trim()) missing.push('شماره همراه');
  for (const sf of serverMissingFields) {
    if (!missing.includes(sf.label)) missing.push(sf.label);
  }
  return missing;
}

export function validateNationalCodeMod11Helper(raw: string): { code: string; isValid: boolean; error: string | null } {
  const clean = normalizeDigits(raw || '').replace(/\D/g, '');
  if (!clean) return { code: '', isValid: false, error: null };
  if (clean.length !== 10) return { code: clean, isValid: false, error: 'کد ملی باید دقیقاً ۱۰ رقم عددی باشد.' };
  if (/^(\d)\1{9}$/.test(clean)) return { code: clean, isValid: false, error: 'کد ملی نامعتبر است (ارقام تکراری).' };
  const digits = clean.split('').map(Number);
  const checksum = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const rem = sum % 11;
  const isValid = (rem < 2 && checksum === rem) || (rem >= 2 && checksum === 11 - rem);
  return { code: clean, isValid, error: isValid ? null : 'ساختار کد ملی نامعتبر است (خطای رقم کنترلی).' };
}

export async function fetchLocalDraftCandidates(
  userId: number | null,
  sectionId: number,
  editingId: number | null,
  currentKey: string | null
): Promise<{ available: PersonnelLocalDraft | null; otherCount: number }> {
  const legacyKey = `draft_personnel_section_${sectionId}`;
  let legacy: string | null = null;
  try { legacy = typeof localStorage !== 'undefined' ? localStorage.getItem(legacyKey) : null; } catch {}
  if (legacy) {
    try {
      const legacyForm = JSON.parse(legacy);
      if (legacyForm) {
        await savePersonnelLocalDraft({
          key: personnelLocalDraftKey(userId, sectionId, newPersonnelLocalDraftId()),
          userId, sectionId, personnelId: null,
          savedAt: new Date().toISOString(), form: legacyForm, bankAccounts: []
        });
        localStorage.removeItem(legacyKey);
      }
    } catch {}
  }
  const drafts = await listPersonnelLocalDrafts(userId, sectionId);
  const candidates = editingId
    ? drafts.filter(d => d.personnelId === editingId)
    : drafts.filter(d => !d.personnelId && d.key !== currentKey);
  return {
    available: candidates.length ? candidates[0] : null,
    otherCount: candidates.length > 1 ? candidates.length - 1 : 0
  };
}

export function buildCreatePersonnelPayloadHelper(
  values: Record<string, any>,
  companyId: number | undefined,
  targetStatus: 'draft' | 'pending_supervisor',
  attachment: File | null,
  bankAccounts: PersonnelBankAccount[]
): Record<string, any> | FormData {
  if (attachment) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (value !== '' && value !== null && value !== undefined) formData.append(key, String(value));
    }
    if (companyId) formData.append('company', String(companyId));
    if (targetStatus === 'draft') formData.append('approval_status', 'draft');
    formData.append('attachment', attachment);
    return formData;
  }
  const body: Record<string, any> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && value !== null && value !== undefined) body[key] = value;
  }
  if (companyId) body['company'] = companyId;
  if (targetStatus === 'draft') body['approval_status'] = 'draft';
  if (bankAccounts.length > 0) {
    body['bank_accounts'] = bankAccounts.map(a => ({
      bank_name: a.bank_name,
      account_number: a.account_number || '',
      sheba_number: cleanShebaInput(String(a.sheba_number || '')),
      card_number: a.card_number || '',
      is_primary: !!a.is_primary,
      is_active: a.is_active !== false
    }));
  }
  return body;
}

export function matchRestoredBankAccountsHelper(
  intended: PersonnelBankAccount[],
  serverAccounts: PersonnelBankAccount[]
): { initial: PersonnelBankAccount[]; matched: PersonnelBankAccount[] } {
  const server = (serverAccounts || []).map(a => ({ ...a }));
  const usedIds = new Set(intended.filter(a => a.id).map(a => a.id));
  const initial = server.map(a => ({ ...a }));
  const matched = intended.map(acc => {
    if (acc.id) return acc;
    const sheba = cleanShebaInput(String(acc.sheba_number || ''));
    const match = server.find(sa => !usedIds.has(sa.id) && cleanShebaInput(String(sa.sheba_number || '')) === sheba);
    if (!match) return acc;
    usedIds.add(match.id);
    return { ...match, is_primary: acc.is_primary };
  });
  return { initial, matched };
}

export function resetPersonnelFormStateHelper() {
  return {
    newPersonnel: createDefaultPersonnelForm(),
    activeModalTab: 'identity' as const,
    phoneError: null,
    postalCodeError: null,
    serverMissingFields: [] as Array<{ field: string; label: string }>,
    bankAccounts: [] as PersonnelBankAccount[],
    existingDocuments: [] as PersonnelDocument[],
    pendingUploadDocuments: [] as Array<{ file: File; doc_type: string; previewUrl: string; name: string; size: number }>,
    shebaValidationResult: null as ShebaValidationResult | null,
    shebaDigitsDisplay: '',
    wageFormattedDisplay: '',
    isShebaCopied: false,
    isAccountCopied: false,
    isPhoneCopied: false,
    foundExistingPersonnel: null as any,
    isFoundPersonnelRejected: false,
    existingPersonnelId: null as number | null,
    existingPersonnelSectionId: null as number | null,
    isLookingUpNationalCode: false,
    isBankDropdownOpen: false,
    bankSearchQuery: '',
    selectedDocumentAttachment: null as File | null,
    attachmentFileName: '',
    nationalCodeError: null as string | null
  };
}

export function addCurrentAsNewAccountHelper(
  bankAccounts: PersonnelBankAccount[],
  newPersonnel: Partial<PersonnelProfile>,
  shebaValidationResult: ShebaValidationResult | null
): { accounts: PersonnelBankAccount[]; error?: string; successName?: string } {
  if (!newPersonnel.bank_name) return { accounts: bankAccounts, error: 'لطفاً ابتدا بانک عامل را انتخاب نمایید.' };
  if (!newPersonnel.sheba_number || !shebaValidationResult?.isValid) {
    return { accounts: bankAccounts, error: shebaValidationResult?.errorMessage || 'شماره شبا معتبر نیست.' };
  }
  const clean = cleanShebaInput(newPersonnel.sheba_number);
  const newAcc: PersonnelBankAccount = {
    bank_name: newPersonnel.bank_name,
    account_number: newPersonnel.account_number || '',
    sheba_number: clean,
    card_number: newPersonnel.card_number || '',
    is_primary: bankAccounts.length === 0,
    is_active: true
  };
  return {
    accounts: [...bankAccounts, newAcc],
    successName: newAcc.bank_name
  };
}

