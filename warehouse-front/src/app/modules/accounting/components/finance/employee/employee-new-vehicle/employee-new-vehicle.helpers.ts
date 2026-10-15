import { normalizeDigits } from '../../../../../../core/utils/date-utils';
import {
  VehicleDriverProfile,
  VehicleBankAccount
} from '../../../../../../core/models/personnel.model';

export const ROAD_VEHICLE_TYPES = ['pickup', 'nissan', 'khavar', 'sedan', 'truck', 'trailer'];

export function isRoadVehicleType(type?: string): boolean {
  if (!type) return false;
  return ROAD_VEHICLE_TYPES.includes(type);
}

export const PLATE_LETTERS = [
  'الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'د', 'ز', 'س', 'ش', 'ص', 'ط', 'ع', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'هـ', 'ی', 'معلولین'
];

export const DOC_TYPE_OPTIONS = [
  { value: 'car_card', label: 'کارت خودرو / سند مالکیت' },
  { value: 'insurance', label: 'بیمه‌نامه شخص ثالث' },
  { value: 'inspection', label: 'گواهی معاینه فنی' },
  { value: 'driver_license', label: 'گواهینامه راننده' },
  { value: 'contract', label: 'قرارداد استیجاری / پیمانکاری' },
  { value: 'other', label: 'سایر مدارک' }
];

export const VEHICLE_GROUPS = [
  {
    group: 'سبک و نیمه‌باری',
    types: [
      { value: 'pickup', label: 'وانت بار' },
      { value: 'nissan', label: 'وانت نیسان' },
      { value: 'sedan', label: 'سواری' }
    ]
  },
  {
    group: 'سنگین و تجاری',
    types: [
      { value: 'khavar', label: 'خاور / کامیونت' },
      { value: 'truck', label: 'کامیون تک / جفت' },
      { value: 'trailer', label: 'تریلی / کشنده' }
    ]
  },
  {
    group: 'ماشین‌آلات و تجهیزات انبار',
    types: [
      { value: 'forklift', label: 'لیفتراک' },
      { value: 'other', label: 'سایر ماشین‌آلات کارگاهی' }
    ]
  }
];

export const VEHICLE_TYPES_FLAT = [
  { value: 'pickup', label: 'وانت بار' },
  { value: 'nissan', label: 'وانت نیسان' },
  { value: 'sedan', label: 'سواری' },
  { value: 'khavar', label: 'خاور / کامیونت' },
  { value: 'truck', label: 'کامیون تک / جفت' },
  { value: 'trailer', label: 'تریلی / کشنده' },
  { value: 'forklift', label: 'لیفتراک' },
  { value: 'other', label: 'سایر ماشین‌آلات' }
];

export const OWNERSHIP_TYPES = [
  { value: 'contract', label: 'استیجاری / پیمانکاری سرویسی' },
  { value: 'company', label: 'خودرو شرکتی / ملکی پروژه' },
  { value: 'personal', label: 'خودرو ملکی راننده' }
];

export const FIELD_LABELS_MAP: Record<string, string> = {
  plate_number: 'شماره پلاک',
  driver_name: 'نام راننده',
  driver_national_code: 'کد ملی راننده',
  driver_phone: 'شماره همراه راننده',
  is_driver_owner: 'مالک شخص راننده است',
  owner_name: 'نام مالک',
  owner_national_code: 'کد ملی مالک',
  owner_phone: 'شماره تماس مالک',
  vehicle_type: 'نوع خودرو',
  ownership_type: 'نوع مالکیت',
  default_service_rate: 'نرخ پایه سرویس (ریال)',
  bank_name: 'نام بانک',
  account_number: 'شماره حساب',
  sheba_number: 'شماره شبا',
  insurance_expiry_date: 'انقضای بیمه شخص ثالث',
  inspection_expiry_date: 'انقضای معاینه فنی',
  license_expiry_date: 'انقضای گواهینامه راننده',
  valid_until_date: 'پایان اعتبار قرارداد',
  is_active: 'وضعیت فعال/غیرفعال',
  notes: 'توضیحات و یادداشت تکمیلی'
};

export function isValidPhone(phone?: string): boolean {
  if (!phone) return false;
  const clean = normalizeDigits(phone).replace(/\D/g, '');
  return /^09\d{9}$/.test(clean);
}

export function isValidNationalCode(code?: string): boolean {
  if (!code) return false;
  const clean = normalizeDigits(code).replace(/\D/g, '');
  if (clean.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(clean)) return false;
  const digits = clean.split('').map(Number);
  const checksum = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  const rem = sum % 11;
  return (rem < 2 && checksum === rem) || (rem >= 2 && checksum === 11 - rem);
}

export function parsePlateString(plateStr?: string): {
  platePart1: string;
  platePart2: string;
  platePart3: string;
  platePart4: string;
  freePlateNumber: string;
} {
  if (!plateStr) {
    return {
      platePart1: '',
      platePart2: 'الف',
      platePart3: '',
      platePart4: '63',
      freePlateNumber: ''
    };
  }
  const clean = normalizeDigits(plateStr).trim();
  const match = clean.match(/^(\d{2})\s*([^\d\s]+)\s*(\d{3})\s*(?:ایران|-)?\s*(\d{2})$/);
  if (match) {
    return {
      platePart1: match[1],
      platePart2: match[2],
      platePart3: match[3],
      platePart4: match[4],
      freePlateNumber: clean
    };
  } else {
    return {
      platePart1: clean.slice(0, 2),
      platePart2: 'الف',
      platePart3: '',
      platePart4: '63',
      freePlateNumber: clean
    };
  }
}

export function buildPlateStringFromParts(
  isRoad: boolean,
  part1: string,
  part2: string,
  part3: string,
  part4: string,
  freePlateNumber?: string
): { plateNumber: string; p1: string; p3: string; p4: string } {
  if (!isRoad) {
    return {
      plateNumber: freePlateNumber ? freePlateNumber.trim() : '',
      p1: part1,
      p3: part3,
      p4: part4
    };
  }
  const p1 = normalizeDigits(part1).replace(/\D/g, '').slice(0, 2);
  const p2 = part2 || 'الف';
  const p3 = normalizeDigits(part3).replace(/\D/g, '').slice(0, 3);
  const p4 = normalizeDigits(part4).replace(/\D/g, '').slice(0, 2);

  let plateNumber = '';
  if (p1 && p3 && p4) {
    plateNumber = `${p1} ${p2} ${p3} ایران ${p4}`;
  } else if (p1 || p3) {
    plateNumber = `${p1 || ''} ${p2} ${p3 || ''} ایران ${p4 || ''}`.trim();
  }
  return { plateNumber, p1, p3, p4 };
}

export function checkServerMissingForTab(serverMissingFields: string[], tab: string): boolean {
  if (!serverMissingFields || serverMissingFields.length === 0) return false;
  const str = serverMissingFields.join(' ').toLowerCase();
  switch (tab) {
    case 'technical':
      return str.includes('plate') || str.includes('پلاک') || str.includes('vehicle_type') || str.includes('ownership_type');
    case 'driver':
      return str.includes('driver') || str.includes('راننده');
    case 'owner':
      return str.includes('owner') || str.includes('مالک');
    case 'banking':
      return str.includes('rate') || str.includes('نرخ') || str.includes('bank') || str.includes('sheba') || str.includes('حساب') || str.includes('شبا');
    case 'documents_expiry':
      return str.includes('insurance') || str.includes('بیمه') || str.includes('انقضا') || str.includes('doc');
    default:
      return false;
  }
}

export function formatMissingFieldsText(missing: any): string {
  if (!Array.isArray(missing) || missing.length === 0) return '';
  return missing.map((m: any) => {
    if (typeof m === 'object' && m !== null) {
      return m.label || m.field || JSON.stringify(m);
    }
    return String(m);
  }).filter(Boolean).join('، ');
}

export function computeVehicleMetrics(recentVehicles: VehicleDriverProfile[]) {
  const total = recentVehicles.length;
  const drafts = recentVehicles.filter(v => v.approval_status === 'draft').length;
  const pending = recentVehicles.filter(v => v.approval_status === 'pending_supervisor').length;
  const revision = recentVehicles.filter(v => v.approval_status === 'revision_required').length;
  const approved = recentVehicles.filter(v => v.approval_status === 'approved' || v.approval_status === 'manager_approved').length;
  const rejected = recentVehicles.filter(v => v.approval_status === 'rejected').length;
  const contractCount = recentVehicles.filter(v => v.ownership_type === 'contract').length;

  return {
    total,
    drafts,
    pending,
    revision,
    approved,
    rejected,
    contractCount
  };
}

export function getStatusBadgeClassHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'bg-surface-muted text-fg-muted border-line';
    case 'pending_supervisor':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'manager_approved':
    case 'pending_manager':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'revision_required':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-surface-alt text-fg-muted border-line';
  }
}

export function getStatusIconHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'edit-2';
    case 'pending_supervisor':
    case 'pending_manager':
    case 'pending_accountant':
      return 'clock';
    case 'manager_approved':
    case 'approved':
      return 'check';
    case 'revision_required':
      return 'undo';
    case 'rejected':
      return 'x';
    default:
      return 'circle';
  }
}

export function getStatusLabelHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'پیش‌نویس';
    case 'pending_supervisor':
      return 'در انتظار سرپرست';
    case 'manager_approved':
      return 'تایید مدیر';
    case 'approved':
      return 'مصوب';
    case 'revision_required':
      return 'عودت جهت اصلاح';
    case 'rejected':
      return 'رد شده';
    default:
      return status || 'نامشخص';
  }
}

export function getFullStatusDescriptionHelper(status?: string): string {
  switch (status) {
    case 'draft':
      return 'پیش‌نویس ثبت شده توسط کارمند بخش ترابری';
    case 'pending_supervisor':
      return 'در انتظار بررسی و تایید سرپرست کارگاه';
    case 'manager_approved':
      return 'تایید اولیه مدیر / در انتظار نهایی‌سازی';
    case 'approved':
      return 'تصویب و فعال‌سازی نهایی شده در ناوگان رسمی';
    case 'revision_required':
      return 'نیازمند بازنگری و اصلاح توسط کارمند';
    case 'rejected':
      return 'رد شده و غیرقابل استفاده';
    default:
      return status || 'نامشخص';
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
      return 'bg-surface-muted text-fg-muted border-line';
    case 'auto_pass':
    case 'change_request_applied':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'reopen':
    case 'change_request_created':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    default:
      return 'bg-surface-alt text-fg-muted border-line';
  }
}

export function getWorkflowActionIconHelper(action?: string): string {
  switch (action) {
    case 'submit':
      return 'send';
    case 'approve_supervisor':
      return 'check';
    case 'approve_accountant':
    case 'approve_finance':
      return 'check';
    case 'approve_manager':
      return 'star';
    case 'batch_approve':
      return 'users';
    case 'revision':
    case 'request_revision':
      return 'undo';
    case 'reject':
    case 'purge':
    case 'delete':
    case 'change_request_rejected':
      return 'x';
    case 'cancel_change_request':
    case 'change_request_cancelled':
      return 'slash';
    case 'auto_pass':
      return 'zap';
    case 'reopen':
      return 'refresh-cw';
    case 'end_collaboration':
      return 'slash';
    case 'create':
    case 'change_request_created':
      return 'file-text';
    default:
      return 'file';
  }
}

export function formatDiffValueHelper(
  key: string,
  value: any,
  vehicleTypesFlat: { value: string; label: string }[],
  ownershipTypes: { value: string; label: string }[]
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (key === 'default_service_rate') {
    const n = Number(value);
    return (isNaN(n) ? String(value) : n.toLocaleString('fa-IR')) + ' ریال';
  }
  if (key === 'vehicle_type') {
    const found = vehicleTypesFlat.find(t => t.value === value);
    return found ? found.label : (value || '-');
  }
  if (key === 'ownership_type') {
    const found = ownershipTypes.find(t => t.value === value);
    return found ? found.label : (value || '-');
  }
  if (key === 'is_driver_owner') {
    return value ? 'بله (راننده)' : 'خیر (غیر راننده)';
  }
  if (key === 'is_active') {
    return value ? 'فعال' : 'غیرفعال';
  }
  return String(value);
}

export function formatShebaDisplayHelper(sheba?: string): string {
  if (!sheba) return '—';
  const clean = sheba.replace(/\s+/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function formatNumberHelper(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '۰';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('fa-IR');
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

export function buildVehicleSavePayload(
  newVehicle: Partial<VehicleDriverProfile>,
  selectedSectionId?: number | null,
  selectedSection?: any,
  mySections: any[] = []
): Partial<VehicleDriverProfile> {
  const company = selectedSection?.company_id || (selectedSection as any)?.company || mySections.find(s => Number(s.id) === Number(selectedSectionId))?.company_id || undefined;
  const payload: Partial<VehicleDriverProfile> = {
    ...newVehicle,
    plate_number: newVehicle.plate_number ? newVehicle.plate_number.trim() : '',
    driver_name: newVehicle.driver_name ? newVehicle.driver_name.trim() : '',
    driver_national_code: newVehicle.driver_national_code?.trim() || undefined,
    driver_phone: newVehicle.driver_phone?.trim() || undefined,
    is_driver_owner: newVehicle.is_driver_owner ?? true,
    owner_name: !newVehicle.is_driver_owner ? (newVehicle.owner_name?.trim() || undefined) : undefined,
    owner_national_code: !newVehicle.is_driver_owner ? (newVehicle.owner_national_code?.trim() || undefined) : undefined,
    owner_phone: !newVehicle.is_driver_owner ? (newVehicle.owner_phone?.trim() || undefined) : undefined,
    sheba_number: newVehicle.sheba_number ? newVehicle.sheba_number.replace(/\\s+/g, '').toUpperCase() : undefined,
    insurance_expiry_date: newVehicle.insurance_expiry_date || undefined,
    inspection_expiry_date: newVehicle.inspection_expiry_date || undefined,
    license_expiry_date: newVehicle.license_expiry_date || undefined,
    valid_until_date: newVehicle.valid_until_date || undefined,
    notes: newVehicle.notes?.trim() || undefined,
    section: selectedSectionId,
    company,
    is_active: true
  };
  delete (payload as any).approval_status;
  return payload;
}

export function createDefaultVehicleForm(): Partial<VehicleDriverProfile> {
  return {
    plate_number: '',
    vehicle_type: 'nissan',
    ownership_type: 'contract',
    driver_name: '',
    driver_national_code: '',
    driver_phone: '',
    is_driver_owner: true,
    owner_name: '',
    owner_national_code: '',
    owner_phone: '',
    default_service_rate: 0,
    bank_name: '',
    account_number: '',
    sheba_number: '',
    notes: '',
    insurance_expiry_date: null,
    inspection_expiry_date: null,
    license_expiry_date: null,
    valid_until_date: null,
    is_active: true,
    approval_status: 'draft'
  };
}

export function checkIsTabComplete(
  tab: string,
  newVehicle: Partial<VehicleDriverProfile>,
  isRoadVehicle: boolean,
  serverMissingFields: string[],
  platePart1: string,
  platePart3: string,
  platePart4: string,
  hasValidPrimaryBankAccount: boolean
): boolean {
  if (checkServerMissingForTab(serverMissingFields, tab)) return false;
  switch (tab) {
    case 'technical':
      if (!newVehicle.vehicle_type || !newVehicle.ownership_type) return false;
      if (isRoadVehicle) {
        return !!(platePart1 && platePart3 && platePart4);
      }
      return !!(newVehicle.plate_number && newVehicle.plate_number.trim());

    case 'driver':
      if (!newVehicle.driver_name?.trim()) return false;
      if (newVehicle.driver_phone && !isValidPhone(newVehicle.driver_phone)) return false;
      if (newVehicle.ownership_type !== 'company') {
        if (!newVehicle.driver_national_code || !isValidNationalCode(newVehicle.driver_national_code)) return false;
      }
      return true;

    case 'owner':
      if (newVehicle.is_driver_owner) return true;
      if (!newVehicle.owner_name?.trim()) return false;
      if (!newVehicle.owner_national_code || !isValidNationalCode(newVehicle.owner_national_code)) return false;
      return true;

    case 'banking':
      if (newVehicle.ownership_type === 'company') return true;
      return hasValidPrimaryBankAccount;

    case 'documents_expiry':
      if (isRoadVehicle) {
        return !!(newVehicle.insurance_expiry_date && newVehicle.insurance_expiry_date.trim());
      }
      return true;

    default:
      return true;
  }
}

export function filterVehiclesHelper(
  recentVehicles: VehicleDriverProfile[],
  statusFilter: string,
  searchQuery: string
): VehicleDriverProfile[] {
  let list = recentVehicles;
  if (statusFilter !== 'all') {
    if (statusFilter === 'approved') {
      list = list.filter(v => v.approval_status === 'approved' || v.approval_status === 'manager_approved');
    } else {
      list = list.filter(v => v.approval_status === statusFilter);
    }
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(v =>
      (v.plate_number && v.plate_number.toLowerCase().includes(q)) ||
      (v.driver_name && v.driver_name.toLowerCase().includes(q)) ||
      (v.driver_phone && v.driver_phone.includes(q)) ||
      (v.driver_national_code && v.driver_national_code.includes(q)) ||
      (v.owner_name && v.owner_name.toLowerCase().includes(q)) ||
      (v.owner_national_code && v.owner_national_code.includes(q)) ||
      (v.bank_name && v.bank_name.toLowerCase().includes(q))
    );
  }
  return list;
}

export function getCleanTelUrlHelper(phone?: string): string {
  if (!phone) return '';
  const clean = normalizeDigits(phone).replace(/[^\d+]/g, '');
  return clean ? ("tel:" + clean) : '';
}

export function validateNationalCodeInput(code: string, isOwner = false): { error: string | null; cleanCode: string } {
  if (!code) return { error: null, cleanCode: '' };
  const clean = normalizeDigits(code).replace(/\D/g, '');
  const prefix = isOwner ? "کد ملی مالک " : "کد ملی ";
  if (clean.length !== 10) {
    return { error: prefix + "باید دقیقاً ۱۰ رقم عددی باشد.", cleanCode: clean };
  }
  if (/^(\d)\1{9}$/.test(clean)) {
    return { error: prefix + "نامعتبر است (ارقام تکراری).", cleanCode: clean };
  }
  if (!isValidNationalCode(clean)) {
    return { error: "ساختار نامعتبر است (خطای رقم کنترلی).", cleanCode: clean };
  }
  return { error: null, cleanCode: clean };
}

export function parseVehicleEditModalData(v: VehicleDriverProfile) {
  const form: Partial<VehicleDriverProfile> = {
    ...v,
    is_driver_owner: v.is_driver_owner ?? true,
    owner_name: v.owner_name || '',
    owner_national_code: v.owner_national_code || '',
    owner_phone: v.owner_phone || '',
    vehicle_type: v.vehicle_type || 'nissan',
    ownership_type: v.ownership_type || 'contract',
    default_service_rate: v.default_service_rate || 0,
    notes: v.notes || '',
    insurance_expiry_date: v.insurance_expiry_date || null,
    inspection_expiry_date: v.inspection_expiry_date || null,
    license_expiry_date: v.license_expiry_date || null,
    valid_until_date: v.valid_until_date || null
  };
  const rateFormattedDisplay = (v.default_service_rate && v.default_service_rate > 0)
    ? Number(v.default_service_rate).toLocaleString('fa-IR')
    : '';
  let shebaValidationResult: any = null;
  let shebaDigitsDisplay = '';
  if (v.sheba_number) {
    const digits = v.sheba_number.replace(/\D/g, '');
    shebaValidationResult = { isValid: true, formattedDigits: digits };
    shebaDigitsDisplay = digits;
  }
  const serverMissingFields = (v.missing_fields && Array.isArray(v.missing_fields))
    ? (v.missing_fields as any[]).map(m => typeof m === 'string' ? m : (m.field || m.label || JSON.stringify(m)))
    : [];
  return {
    form,
    rateFormattedDisplay,
    shebaValidationResult,
    shebaDigitsDisplay,
    serverMissingFields
  };
}

export function getModalHeaderTitleHelper(
  editingId: number | null,
  isReadOnly: boolean,
  isApproved: boolean,
  isRevision: boolean,
  plateNumber?: string
): string {
  if (!editingId) return 'ثبت مشخصات خودرو و راننده جدید';
  if (isReadOnly) return `مشاهده پرونده خودرو «${plateNumber}»`;
  if (isApproved) return `ویرایش مشخصات خودرو «${plateNumber}» (پیشنهاد تغییرات)`;
  if (isRevision) return `اصلاح مشخصات خودرو «${plateNumber}» (عودت سرپرست)`;
  return `ویرایش پیش‌نویس خودرو «${plateNumber}»`;
}

export function handleVehicleWsUpdateHelper(
  recentVehicles: VehicleDriverProfile[],
  msg: any,
  currentCompanyId?: number | null,
  selectedSectionId?: number | null,
  editingId?: number | null
): { ignore?: boolean; shouldReload?: boolean; isDeleted?: boolean; deletedId?: number; updatedList: VehicleDriverProfile[]; updatedVehicle?: VehicleDriverProfile } {
  if (!msg) return { ignore: true, updatedList: recentVehicles };
  const cId = msg.company_id || msg.metadata?.company_id;
  if (currentCompanyId && cId && Number(cId) !== Number(currentCompanyId)) {
    return { ignore: true, updatedList: recentVehicles };
  }
  const sId = msg.section_id || msg.metadata?.section_id;
  if (selectedSectionId && sId && Number(sId) !== Number(selectedSectionId)) {
    return { ignore: true, updatedList: recentVehicles };
  }
  const vehicleId = msg.vehicle_id || msg.id || msg.object_id || msg.metadata?.vehicle_id;
  if (!vehicleId) {
    return { shouldReload: true, updatedList: recentVehicles };
  }
  const hasInlineData = !!(msg.data || msg.approval_status || msg.to_status || msg.action || msg.driver_name || msg.plate_number || msg.vehicle_type);
  if (!hasInlineData) {
    return { shouldReload: true, updatedList: recentVehicles };
  }
  if (msg.action === 'deleted') {
    return {
      isDeleted: true,
      deletedId: vehicleId,
      updatedList: recentVehicles.filter(v => v.id !== vehicleId)
    };
  }
  const index = recentVehicles.findIndex(v => v.id === vehicleId);
  if (index !== -1) {
    const existing = recentVehicles[index];
    const updated: VehicleDriverProfile = {
      ...existing,
      ...msg.data,
      approval_status: msg.approval_status || msg.to_status || existing.approval_status,
      rejection_reason: msg.rejection_reason !== undefined ? msg.rejection_reason : (msg.reason || existing.rejection_reason),
      has_pending_changes: msg.has_pending_changes !== undefined ? msg.has_pending_changes : existing.has_pending_changes
    };
    if (msg.driver_name) updated.driver_name = msg.driver_name;
    if (msg.plate_number) updated.plate_number = msg.plate_number;
    if (msg.vehicle_type) updated.vehicle_type = msg.vehicle_type;

    const copy = [...recentVehicles];
    copy[index] = updated;
    return { updatedList: copy, updatedVehicle: updated };
  }
  return { shouldReload: true, updatedList: recentVehicles };
}

export function createBankAccountFromState(
  newVehicle: Partial<VehicleDriverProfile>,
  cleanSheba: string,
  shebaValidationResult: any,
  payeeType?: string,
  isFirst: boolean = false
): VehicleBankAccount {
  return {
    bank_name: newVehicle.bank_name || shebaValidationResult?.bank?.name || 'نامشخص',
    account_number: newVehicle.account_number || '',
    sheba_number: cleanSheba,
    payee_type: (payeeType as any) || (newVehicle.is_driver_owner ? 'driver' : 'owner'),
    is_primary: isFirst,
    is_active: true,
    account_owner_name: !newVehicle.is_driver_owner ? newVehicle.owner_name : newVehicle.driver_name,
    account_owner_national_code: !newVehicle.is_driver_owner ? newVehicle.owner_national_code : newVehicle.driver_national_code
  };
}

export function copyTextToClipboard(text: string, title: string, toastShow: (type: string, msg: string) => void): void {
  if (navigator?.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      toastShow('success', `${title} در کلیپ‌بورد کپی شد.`);
    }).catch(() => {
      fallbackCopyText(text, title, toastShow);
    });
  } else {
    fallbackCopyText(text, title, toastShow);
  }
}

function fallbackCopyText(text: string, title: string, toastShow: (type: string, msg: string) => void): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toastShow('success', `${title} در کلیپ‌بورد کپی شد.`);
  } catch {
    toastShow('warning', `امکان کپی خودکار وجود ندارد: ${text}`);
  }
}

export function serializeVehicleDraft(comp: any): string {
  return JSON.stringify({
    newVehicle: comp.newVehicle,
    platePart1: comp.platePart1,
    platePart2: comp.platePart2,
    platePart3: comp.platePart3,
    platePart4: comp.platePart4,
    freePlateNumber: comp.freePlateNumber,
    rateFormattedDisplay: comp.rateFormattedDisplay,
    bankAccounts: comp.bankAccounts,
    activeModalTab: comp.activeModalTab
  });
}

export function deserializeVehicleDraft(raw: string, comp: any): boolean {
  try {
    const draft = JSON.parse(raw);
    if (draft && draft.newVehicle) {
      comp.newVehicle = { ...comp.newVehicle, ...draft.newVehicle };
      comp.platePart1 = draft.platePart1 || '';
      comp.platePart2 = draft.platePart2 || 'الف';
      comp.platePart3 = draft.platePart3 || '';
      comp.platePart4 = draft.platePart4 || '63';
      comp.freePlateNumber = draft.freePlateNumber || '';
      comp.rateFormattedDisplay = draft.rateFormattedDisplay || '';
      comp.bankAccounts = Array.isArray(draft.bankAccounts) ? draft.bankAccounts : [];
      comp.insuranceDateControl.setValue(comp.newVehicle.insurance_expiry_date || '', { emitEvent: false });
      comp.inspectionDateControl.setValue(comp.newVehicle.inspection_expiry_date || '', { emitEvent: false });
      comp.licenseDateControl.setValue(comp.newVehicle.license_expiry_date || '', { emitEvent: false });
      comp.validUntilDateControl.setValue(comp.newVehicle.valid_until_date || '', { emitEvent: false });
      if (comp.newVehicle.sheba_number) comp.onShebaChange();
      return true;
    }
  } catch {}
  return false;
}

export function buildStatusFilterTabs(vm: any): any[] {
  return [
    { id: 'all', label: 'همه', icon: 'status-all', count: vm.total },
    { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft', count: vm.drafts },
    { id: 'pending_supervisor', label: 'در انتظار سرپرست', shortLabel: 'سرپرست', icon: 'status-pending', count: vm.pending },
    { id: 'revision_required', label: 'نیازمند اصلاح', shortLabel: 'اصلاح', icon: 'status-revision', count: vm.revision, tone: 'amber' },
    { id: 'approved', label: 'مصوب', icon: 'status-approved', count: vm.approved, tone: 'emerald' },
    { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected', count: vm.rejected, tone: 'rose' }
  ];
}

export function buildVehicleModalTabs(step: (tab: any, done?: string, todo?: string) => any): any[] {
  return [
    { id: 'technical', label: '۱. مشخصات فنی و پلاک', shortLabel: 'فنی', icon: 'truck', indicator: step('technical') },
    { id: 'driver', label: '۲. مشخصات راننده', shortLabel: 'راننده', icon: 'user', indicator: step('driver') },
    { id: 'owner', label: '۳. مشخصات مالک', shortLabel: 'مالک', icon: 'key', indicator: step('owner') },
    { id: 'banking', label: '۴. حساب‌های بانکی', shortLabel: 'بانک', icon: 'credit-card', indicator: step('banking', 'حساب اصلی ثبت شده', 'بدون حساب اصلی') },
    { id: 'documents_expiry', label: '۵. مدارک و انقضا', shortLabel: 'مدارک', icon: 'file-text', indicator: step('documents_expiry') }
  ];
}

export function validateVehicleFormBeforeSave(
  newVehicle: Partial<VehicleDriverProfile>,
  selectedSectionId: number | null | undefined,
  nationalCodeError: string | null,
  ownerNationalCodeError: string | null,
  shebaValidationResult: any
): { error?: string; tab?: 'technical' | 'driver' | 'owner' | 'banking' | 'documents_expiry' } {
  if (!selectedSectionId) return { error: 'لطفاً ابتدا یک بخش را انتخاب کنید.' };
  if (!newVehicle.plate_number?.trim()) return { error: 'شماره پلاک خودرو الزامی است.', tab: 'technical' };
  if (!newVehicle.driver_name?.trim()) return { error: 'نام و نام خانوادگی راننده الزامی است.', tab: 'driver' };
  if (nationalCodeError) return { error: nationalCodeError, tab: 'driver' };
  if (!newVehicle.is_driver_owner) {
    if (!newVehicle.owner_name?.trim()) return { error: 'نام و نام خانوادگی مالک خودرو الزامی است.', tab: 'owner' };
    if (ownerNationalCodeError) return { error: ownerNationalCodeError, tab: 'owner' };
  }
  if (shebaValidationResult && !shebaValidationResult.isValid) {
    return { error: shebaValidationResult.errorMessage || 'شماره شبا نامعتبر است.', tab: 'banking' };
  }
  return {};
}

export function applyVehicleEditModalSetup(comp: any, v: VehicleDriverProfile): void {
  if (!comp.selectedSectionId && v.section) {
    comp.selectedSectionId = v.section;
    comp.selectedSection = comp.mySections.find((s: any) => s.id === v.section) || null;
  }
  comp.editingVehicle = v;
  comp.editingId = v.id || null;
  const parsed = parseVehicleEditModalData(v);
  comp.newVehicle = parsed.form;
  comp.insuranceDateControl.setValue(v.insurance_expiry_date || '', { emitEvent: false });
  comp.inspectionDateControl.setValue(v.inspection_expiry_date || '', { emitEvent: false });
  comp.licenseDateControl.setValue(v.license_expiry_date || '', { emitEvent: false });
  comp.validUntilDateControl.setValue(v.valid_until_date || '', { emitEvent: false });
  comp.rateFormattedDisplay = parsed.rateFormattedDisplay;
  comp.parsePlateToParts(v.plate_number);
  comp.nationalCodeError = null;
  comp.ownerNationalCodeError = null;
  comp.matchedPersonnelNotice = null;
  comp.bankAccounts = (v.bank_accounts && v.bank_accounts.length > 0) ? [...v.bank_accounts] : [];
  if (!comp.bankAccounts.length && v.id) comp.loadVehicleBankAccounts(v.id);
  comp.vehicleDocuments = (v.documents && v.documents.length > 0) ? [...v.documents] : [];
  if (!comp.vehicleDocuments.length && v.id) comp.loadVehicleDocuments(v.id);
  comp.shebaValidationResult = parsed.shebaValidationResult;
  comp.shebaDigitsDisplay = parsed.shebaDigitsDisplay;
  comp.serverMissingFields = parsed.serverMissingFields;
  if (comp.serverMissingFields.length > 0) {
    comp.mapMissingFieldsToTab(comp.serverMissingFields);
  } else {
    comp.activeModalTab = 'technical';
  }
  comp.isNewVehicleModalOpen = true;
  comp.cdr.detectChanges();
}

export function resetVehicleFormState(comp: any): void {
  comp.newVehicle = createDefaultVehicleForm();
  comp.platePart1 = '';
  comp.platePart2 = 'الف';
  comp.platePart3 = '';
  comp.platePart4 = '63';
  comp.freePlateNumber = '';
  comp.rateFormattedDisplay = '';
  comp.shebaValidationResult = null;
  comp.shebaDigitsDisplay = '';
  comp.isShebaCopied = false;
  comp.isAccountCopied = false;
  comp.isBankDropdownOpen = false;
  comp.bankSearchQuery = '';
  comp.nationalCodeError = null;
  comp.ownerNationalCodeError = null;
  comp.matchedPersonnelNotice = null;

  comp.insuranceDateControl.setValue('', { emitEvent: false });
  comp.inspectionDateControl.setValue('', { emitEvent: false });
  comp.licenseDateControl.setValue('', { emitEvent: false });
  comp.validUntilDateControl.setValue('', { emitEvent: false });
  comp.docExpiryDateControl.setValue('', { emitEvent: false });

  comp.bankAccounts = [];
  comp.vehicleDocuments = [];
  comp.pendingUploadDocuments = [];
  comp.serverMissingFields = [];
  comp.activeModalTab = 'technical';
}

export function submitDraftVehicleHelper(comp: any, v?: VehicleDriverProfile): void {
  const target = v || comp.editingVehicle;
  if (!target && !comp.editingId) {
    if (comp.isSubmitDisabled) {
      comp.toast.show('warning', 'لطفاً ابتدا نواقص فرم را تکمیل فرمایید: ' + comp.missingFieldsList.join('، '));
      comp.switchToFirstIncompleteTab();
      return;
    }
    comp.saveVehicle('pending_supervisor');
    return;
  }
  const id = target?.id || comp.editingId;
  if (!id) return;
  comp.isSaving = true;
  (comp.facade?.submitVehicleProfile(id) || comp.personnelApi.submitVehicleProfile(id)).subscribe({
    next: () => {
      comp.isSaving = false;
      const plate = target?.plate_number || comp.newVehicle.plate_number;
      comp.toast.show('success', `پرونده خودرو «${plate}» به کارتابل سرپرست ارسال گردید.`);
      if (comp.isNewVehicleModalOpen) comp.closeNewVehicleModal();
      comp.loadRecentVehicles();
    },
    error: (err: any) => {
      comp.isSaving = false;
      const missing = err.error?.missing_fields;
      if (Array.isArray(missing) && missing.length > 0) {
        comp.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
        comp.toast.show('error', 'ارسال ناموفق؛ نواقص سروری: ' + comp.formatMissingFields(missing));
        if (!comp.isNewVehicleModalOpen && target) {
          comp.openEditModal({ ...target, missing_fields: missing });
        } else {
          comp.mapMissingFieldsToTab(comp.serverMissingFields);
        }
      } else {
        comp.toast.show('error', 'خطا در ارسال پرونده به سرپرست: ' + (err.error?.error || err.message || 'نامشخص'));
      }
      comp.cdr.detectChanges();
    }
  });
}

export function removeBankAccountHelper(comp: any, index: number): void {
  if (index < 0 || index >= comp.bankAccounts.length) return;
  const acc = comp.bankAccounts[index];
  const doRemove = () => {
    const wasPrimary = acc.is_primary;
    comp.bankAccounts.splice(index, 1);
    if (wasPrimary && comp.bankAccounts.length > 0) {
      comp.bankAccounts[0].is_primary = true;
      comp.syncPrimaryAccountFields(comp.bankAccounts[0]);
    } else if (comp.bankAccounts.length === 0) {
      comp.newVehicle.bank_name = '';
      comp.newVehicle.account_number = '';
      comp.newVehicle.sheba_number = '';
      comp.shebaDigitsDisplay = '';
      comp.shebaValidationResult = null;
    }
    comp.toast.show('success', 'حساب بانکی حذف شد.');
    comp.saveDraftToStorage();
    comp.cdr.detectChanges();
  };

  if (comp.editingId && acc.id) {
    (comp.facade?.deleteVehicleBankAccount(comp.editingId, acc.id) || comp.personnelApi.deleteVehicleBankAccount(comp.editingId, acc.id)).subscribe({
      next: () => doRemove(),
      error: (err: any) => comp.toast.show('error', 'خطا در حذف حساب: ' + (err.error?.error || err.message || 'نامشخص'))
    });
  } else {
    doRemove();
  }
}
