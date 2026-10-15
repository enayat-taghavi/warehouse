import { DocTask, INVOICE_TYPE_LABELS, CURRENCY_LABELS } from '../../../../core/models/doc-task.model';
import { FieldPermissionConfig } from '../../../../core/models/field-config.model';
import { formatToStandardShamsi } from '../../../../core/utils/date-utils';

export const DOC_TASK_DIRECT_KEYS = new Set([
  'added_rti_no',
  'inv_rti_number',
  'invoice_type',
  'invoice_date',
  'invoice_page',
  'page_row',
  'doc_supplier',
  'total_value',
  'price_amount',
  'similar_unit_price',
  'currency',
  'folder_address',
  'stamp',
  'signature',
  'worker_note'
]);

export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function convertPersianKeyboardToEnglish(str: string): string {
  if (!str) return '';
  const faToEnMap: { [key: string]: string } = {
    'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'چ': ']',
    'ش': 'a', 'س': 's', 'ی': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ک': ';', 'گ': "'",
    'ظ': 'z', 'ط': 'x', 'ز': 'c', 'ر': 'v', 'ذ': 'b', 'د': 'n', 'پ': 'm', 'و': ','
  };
  return str.split('').map(char => faToEnMap[char] || char).join('');
}

export function normalizeDigits(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

export function isFinancialField(key: string): boolean {
  return ['price_amount', 'similar_unit_price', 'total_value'].includes(key);
}

export function formatNumberWithCommas(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  const parts = String(val).replace(/,/g, '').split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export function decodeDelimiter(val: string): string {
  if (!val) return val;
  if (val === 'Chr(30)') return '\x1E';
  if (val === 'Chr(31)') return '\x1F';
  if (val === 'Chr(30) & ";"') return '\x1E;';
  if (val === 'Chr(31) & "|"') return '\x1F|';
  if (val === '\\n') return '\n';
  if (val === '\\t') return '\t';
  return val;
}

export function isDateValid(val: string): boolean {
  if (!val) return true;
  const clean = String(val).trim();
  return /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(clean);
}

export function convertToShamsiDateString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(val.trim())) {
    return val.trim().replace(/-/g, '/');
  }
  return formatToStandardShamsi(val);
}

export function getFieldLabel(field: FieldPermissionConfig): string {
  return field.custom_label?.trim() || field.default_label;
}

export function getFieldDisplayValue(field: FieldPermissionConfig, item: any): string {
  if (!item) return '-';
  let val: any;
  if (field.is_dynamic) {
    const realKey = field.key.replace(/^dyn_/, '');
    val = item.dynamic_data?.[realKey];
  } else {
    val = item[field.key];
  }
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'boolean') return val ? 'بله' : 'خیر';
  return String(val);
}

export function hasDocData(task: DocTask | null): boolean {
  if (!task) return false;
  return Boolean(
    task.invoice_type ||
    task.invoice_date ||
    task.inv_rti_number ||
    task.added_rti_no ||
    task.doc_supplier ||
    task.total_value ||
    task.price_amount ||
    task.similar_unit_price ||
    task.currency ||
    task.folder_address ||
    task.stamp ||
    task.signature ||
    (task.worker_note && task.worker_note.trim())
  );
}

export function isTaskReady(task: DocTask, isReadOnlyFn: (t: DocTask | null) => boolean): boolean {
  if (isReadOnlyFn(task)) return false;
  return (task.status === 'PENDING_DOC' && hasDocData(task)) ||
         ((task.status === 'DOC_SUPERVISOR_REJECTED' || task.status === 'DOC_MANAGER_REJECTED') && hasDocData(task));
}

export function isTaskSelectable(task: DocTask, isReadOnlyFn: (t: DocTask | null) => boolean): boolean {
  if (isReadOnlyFn(task)) return false;
  return hasDocData(task) || task.status === 'DOC_SUPERVISOR_REJECTED' || task.status === 'DOC_MANAGER_REJECTED';
}

export function getStatusLabel(s: string): string {
  switch (s) {
    case 'PENDING_DOC': return 'در انتظار ثبت اسناد';
    case 'DOC_PROCESSED': return 'ثبت شده (در انتظار تایید سرپرست)';
    case 'DOC_SUPERVISOR_REJECTED': return 'رد سرپرست (نیاز به بازنگری)';
    case 'DOC_MANAGER_REVIEW': return 'در انتظار تایید مدیر مالی';
    case 'DOC_MANAGER_REJECTED': return 'رد مدیر مالی';
    case 'DOC_FINAL_APPROVED': return 'تایید نهایی شده';
    default: return s;
  }
}

export function getActionTypeLabel(actionType: string): string {
  switch (actionType) {
    case 'DOC_SAVED': return 'ذخیره پیش‌نویس';
    case 'DOC_SUBMITTED': return 'ارسال به سرپرست';
    case 'DOC_REVERTED': return 'بازگشت وضعیت';
    case 'DOC_SUPERVISOR_APPROVED': return 'تایید سرپرست';
    case 'DOC_SUPERVISOR_REJECTED': return 'رد سرپرست';
    case 'DOC_MANAGER_APPROVED': return 'تایید نهایی مدیر';
    case 'DOC_MANAGER_REJECTED': return 'رد مدیر';
    case 'TASK_CLAIMED': return 'تخصیص تسک';
    default: return actionType;
  }
}

export function getStatusColor(s: string): string {
  switch (s) {
    case 'DOC_FINAL_APPROVED':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'DOC_MANAGER_REVIEW':
    case 'DOC_PROCESSED':
      return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
    case 'DOC_SUPERVISOR_REJECTED':
    case 'DOC_MANAGER_REJECTED':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'PENDING_DOC':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    default:
      return 'bg-slate-50 text-gray-600 border border-slate-200';
  }
}

export function filterCustomsTasks(
  tasks: DocTask[],
  searchQuery: string,
  statusFilter: string,
  dateFilter: string,
  locationFilter: string,
  sortBy: string,
  sortDirection: 'asc' | 'desc',
  isTaskReadyFn: (t: DocTask) => boolean,
  hasDocDataFn: (t: DocTask | null) => boolean
) {
  const rawQ = (searchQuery || '').trim();
  const q = normalizeText(rawQ);
  const convertedQ = normalizeText(convertPersianKeyboardToEnglish(rawQ));

  const totalCount = tasks.length;
  const completedCount = tasks.filter(t =>
    ['DOC_PROCESSED', 'DOC_MANAGER_REVIEW', 'DOC_FINAL_APPROVED'].includes(t.status)
  ).length;
  const remainingCount = tasks.filter(t =>
    ['PENDING_DOC', 'DOC_SUPERVISOR_REJECTED', 'DOC_MANAGER_REJECTED'].includes(t.status)
  ).length;

  const statusCounts = {
    untouched: tasks.filter(t => t.status === 'PENDING_DOC' && !hasDocDataFn(t)).length,
    rejected: tasks.filter(t => (t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED') && !hasDocDataFn(t)).length,
    ready: tasks.filter(t => isTaskReadyFn(t)).length,
    completed: completedCount,
    all: tasks.length
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const matchesDate = (t: DocTask) => {
    if (dateFilter === 'all') return true;
    const dateStr = (t as any).updated_at || t.created_at;
    if (!dateStr) return true;
    const taskTime = new Date(dateStr).getTime();
    if (dateFilter === 'today') return taskTime >= today;
    if (dateFilter === 'yesterday') return taskTime >= yesterday && taskTime < today;
    if (dateFilter === 'week') return taskTime >= week;
    return true;
  };

  const matchesLocation = (t: DocTask) => {
    if (locationFilter === 'all') return true;
    const loc = (t.item_details?.new_location || t.item_details?.old_location || '').trim().toLowerCase();
    return loc.includes(locationFilter.toLowerCase());
  };

  const matchesSearch = (t: DocTask) => {
    if (!q && !convertedQ) return true;
    const item = t.item_details as any;
    let dynMatch = false;
    if (item?.dynamic_data && typeof item.dynamic_data === 'object') {
      for (const val of Object.values(item.dynamic_data)) {
        if (val !== null && val !== undefined) {
          const normVal = normalizeText(String(val));
          if ((q && normVal.includes(q)) || (convertedQ && normVal.includes(convertedQ))) {
            dynMatch = true;
            break;
          }
        }
      }
    }
    return (
      dynMatch ||
      (q && normalizeText(item?.fa_unic_code).includes(q)) ||
      (convertedQ && normalizeText(item?.fa_unic_code).includes(convertedQ)) ||
      (q && normalizeText(item?.en_unic_code).includes(q)) ||
      (convertedQ && normalizeText(item?.en_unic_code).includes(convertedQ)) ||
      (q && normalizeText(item?.item_no).includes(q)) ||
      (convertedQ && normalizeText(item?.item_no).includes(convertedQ)) ||
      (q && normalizeText(item?.description).includes(q)) ||
      (convertedQ && normalizeText(item?.description).includes(convertedQ)) ||
      (q && normalizeText(item?.po).includes(q)) ||
      (convertedQ && normalizeText(item?.po).includes(convertedQ)) ||
      (q && normalizeText(item?.pk_number).includes(q)) ||
      (convertedQ && normalizeText(item?.pk_number).includes(convertedQ)) ||
      (q && normalizeText(item?.plpkitem).includes(q)) ||
      (convertedQ && normalizeText(item?.plpkitem).includes(convertedQ)) ||
      (q && normalizeText(item?.pl).includes(q)) ||
      (convertedQ && normalizeText(item?.pl).includes(convertedQ)) ||
      (q && normalizeText(item?.tag).includes(q)) ||
      (convertedQ && normalizeText(item?.tag).includes(convertedQ)) ||
      (q && normalizeText(item?.size).includes(q)) ||
      (convertedQ && normalizeText(item?.size).includes(convertedQ)) ||
      (q && normalizeText(item?.new_location).includes(q)) ||
      (convertedQ && normalizeText(item?.new_location).includes(convertedQ)) ||
      (q && normalizeText(item?.warehouse_name).includes(q)) ||
      (convertedQ && normalizeText(item?.warehouse_name).includes(convertedQ)) ||
      (q && normalizeText(t.doc_supplier).includes(q)) ||
      (convertedQ && normalizeText(t.doc_supplier).includes(convertedQ)) ||
      (q && normalizeText(t.inv_rti_number).includes(q)) ||
      (convertedQ && normalizeText(t.inv_rti_number).includes(convertedQ)) ||
      (q && normalizeText(t.added_rti_no).includes(q)) ||
      (convertedQ && normalizeText(t.added_rti_no).includes(convertedQ)) ||
      (q && normalizeText(t.worker_note).includes(q)) ||
      (convertedQ && normalizeText(t.worker_note).includes(convertedQ)) ||
      (q && normalizeText(t.supervisor_note).includes(q)) ||
      (convertedQ && normalizeText(t.supervisor_note).includes(convertedQ)) ||
      (q && normalizeText(t.manager_note).includes(q)) ||
      (convertedQ && normalizeText(t.manager_note).includes(convertedQ))
    );
  };

  const filteredTasks = tasks.filter(t => {
    let matchStatus = true;
    if (statusFilter === 'untouched') {
      matchStatus = t.status === 'PENDING_DOC' && !hasDocDataFn(t);
    } else if (statusFilter === 'rejected') {
      matchStatus = (t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED') && !hasDocDataFn(t);
    } else if (statusFilter === 'ready') {
      matchStatus = isTaskReadyFn(t);
    } else if (statusFilter === 'completed') {
      matchStatus = ['DOC_PROCESSED', 'DOC_MANAGER_REVIEW', 'DOC_FINAL_APPROVED'].includes(t.status);
    }
    return matchStatus && matchesDate(t) && matchesLocation(t) && matchesSearch(t);
  });

  const dir = sortDirection === 'asc' ? 1 : -1;
  filteredTasks.sort((a, b) => {
    if (sortBy === 'fa_unic_code') {
      return (a.item_details?.fa_unic_code || '').localeCompare(b.item_details?.fa_unic_code || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    if (sortBy === 'description') {
      return (a.item_details?.description || '').localeCompare(b.item_details?.description || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    if (sortBy === 'po') {
      return (a.item_details?.po || '').localeCompare(b.item_details?.po || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    if (sortBy === 'inv_rti_number') {
      return (a.inv_rti_number || '').localeCompare(b.inv_rti_number || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    const dateA = new Date((a as any).updated_at || a.created_at || 0).getTime();
    const dateB = new Date((b as any).updated_at || b.created_at || 0).getTime();
    return (dateA - dateB) * dir;
  });

  return {
    filteredTasks,
    totalCount,
    completedCount,
    remainingCount,
    statusCounts
  };
}

export function filterCustomsPoolTasks(
  poolTasks: DocTask[],
  searchQuery: string,
  locationFilter: string,
  sortBy: string,
  sortDirection: 'asc' | 'desc'
): DocTask[] {
  const rawQ = (searchQuery || '').trim();
  const q = normalizeText(rawQ);
  const convertedQ = normalizeText(convertPersianKeyboardToEnglish(rawQ));

  const filtered = poolTasks.filter(t => {
    if (locationFilter !== 'all') {
      const loc = (t.item_details?.new_location || t.item_details?.old_location || '').trim().toLowerCase();
      if (!loc.includes(locationFilter.toLowerCase())) return false;
    }
    if (!q && !convertedQ) return true;
    const item = t.item_details as any;
    return (
      (q && normalizeText(item?.fa_unic_code).includes(q)) ||
      (convertedQ && normalizeText(item?.fa_unic_code).includes(convertedQ)) ||
      (q && normalizeText(item?.en_unic_code).includes(q)) ||
      (convertedQ && normalizeText(item?.en_unic_code).includes(convertedQ)) ||
      (q && normalizeText(item?.item_no).includes(q)) ||
      (convertedQ && normalizeText(item?.item_no).includes(convertedQ)) ||
      (q && normalizeText(item?.description).includes(q)) ||
      (convertedQ && normalizeText(item?.description).includes(convertedQ)) ||
      (q && normalizeText(item?.po).includes(q)) ||
      (convertedQ && normalizeText(item?.po).includes(convertedQ))
    );
  });

  const dir = sortDirection === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortBy === 'fa_unic_code') {
      return (a.item_details?.fa_unic_code || '').localeCompare(b.item_details?.fa_unic_code || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    if (sortBy === 'description') {
      return (a.item_details?.description || '').localeCompare(b.item_details?.description || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    if (sortBy === 'po') {
      return (a.item_details?.po || '').localeCompare(b.item_details?.po || '', 'fa', { sensitivity: 'base' }) * dir;
    }
    const dateA = new Date((a as any).updated_at || a.created_at || 0).getTime();
    const dateB = new Date((b as any).updated_at || b.created_at || 0).getTime();
    return (dateA - dateB) * dir;
  });

  return filtered;
}

export function matchesDocTaskBarcode(task: DocTask, rawQ: string, convertedQ: string, normQ: string, normConvertedQ: string): boolean {
  const item = task.item_details as any;
  const unic = (item?.fa_unic_code || '').trim().toLowerCase();
  const normUnic = normalizeDigits(unic).toLowerCase();
  const enUnic = (item?.en_unic_code || '').trim().toLowerCase();
  const itemNo = (item?.item_no || '').trim().toLowerCase();
  const normItemNo = normalizeDigits(itemNo).toLowerCase();
  const itemId = String(item?.id || task.item || '').trim();
  const po = (item?.po || '').trim().toLowerCase();
  const invRti = (task.inv_rti_number || '').trim().toLowerCase();
  const tag = (item?.tag || '').trim().toLowerCase();
  const pk = (item?.pk_number || '').trim().toLowerCase();
  const plpk = (item?.plpkitem || '').trim().toLowerCase();
  const pl = (item?.pl || '').trim().toLowerCase();
  const lowerRaw = rawQ.toLowerCase();

  return (
    unic === lowerRaw ||
    unic === convertedQ ||
    normUnic === normQ ||
    normUnic === normConvertedQ ||
    enUnic === normQ ||
    enUnic === convertedQ ||
    enUnic === normConvertedQ ||
    itemNo === lowerRaw ||
    itemNo === convertedQ ||
    normItemNo === normQ ||
    normItemNo === normConvertedQ ||
    itemId === normQ ||
    itemId === normConvertedQ ||
    (po && (po === lowerRaw || po === convertedQ || po === normQ || po === normConvertedQ)) ||
    (invRti && (invRti === lowerRaw || invRti === convertedQ || invRti === normQ || invRti === normConvertedQ)) ||
    (tag && (tag === lowerRaw || tag === convertedQ || tag === normQ || tag === normConvertedQ)) ||
    (pk && (pk === lowerRaw || pk === convertedQ || pk === normQ || pk === normConvertedQ)) ||
    (plpk && (plpk === lowerRaw || plpk === convertedQ || plpk === normQ || plpk === normConvertedQ)) ||
    (pl && (pl === lowerRaw || pl === convertedQ || pl === normQ || pl === normConvertedQ))
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (e) {}
}

export function sortTaskHistory(task: DocTask) {
  if (task.history && task.history.length > 1) {
    task.history = task.history.slice().sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });
  }
}

export function populateTaskEditableValues(
  task: DocTask,
  editableFormFields: FieldPermissionConfig[]
): { editableValues: Record<string, any>; workerNote: string; snapshot: string } {
  const editableValues: Record<string, any> = {};
  const item: any = task.item_details || {};
  let workerNote = task.worker_note || '';

  editableFormFields.forEach(f => {
    if (DOC_TASK_DIRECT_KEYS.has(f.key)) {
      const val = (task as any)[f.key];
      if (f.key === 'invoice_date' && val) {
        editableValues[f.key] = convertToShamsiDateString(val);
      } else if (isFinancialField(f.key) && val !== undefined && val !== null && val !== '') {
        editableValues[f.key] = formatNumberWithCommas(val);
      } else {
        editableValues[f.key] = val !== undefined && val !== null ? val : '';
      }
    } else if (f.is_dynamic) {
      const realKey = f.key.replace(/^dyn_/, '');
      editableValues[f.key] = item.dynamic_data?.[realKey] ?? '';
    } else {
      editableValues[f.key] = item[f.key] ?? '';
    }
  });

  if (editableValues['worker_note'] !== undefined) {
    workerNote = editableValues['worker_note'];
  }

  const snapshot = JSON.stringify({ values: editableValues, note: workerNote });
  return { editableValues, workerNote, snapshot };
}

export function handleCustomsKeydownEvent(event: KeyboardEvent, c: any) {
  const target = event.target as HTMLElement;
  const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  if (event.key === 'Escape') {
    if (c.isSortMenuOpen) {
      event.preventDefault();
      c.isSortMenuOpen = false;
      c.cdr.detectChanges();
      return;
    }
    if (c.isScanBatchModalOpen) {
      event.preventDefault();
      c.closeScanBatchModal();
      return;
    }
    if (c.isExportModalOpen) {
      event.preventDefault();
      c.closeExportModal();
      return;
    }
    if (c.selectedTask) {
      event.preventDefault();
      c.closeDetail();
      return;
    }
  }

  if (c.isSortMenuOpen && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    c.isSortMenuOpen = false;
    c.cdr.detectChanges();
  }

  if (c.isScanBatchModalOpen || c.isExportModalOpen) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && c.isExportModalOpen && !c.isExporting) {
      event.preventDefault();
      c.executeExport();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    if (c.selectedTask) {
      event.preventDefault();
      c.saveDraft();
      return;
    }
    if (c.currentTab === 'my-tasks' && c.selectedTasks.size > 0 && !c.isSubmitting) {
      event.preventDefault();
      c.submitSelected();
      return;
    }
    if (c.currentTab === 'pool' && c.selectedPoolTasks.size > 0 && !c.isClaiming) {
      event.preventDefault();
      c.claimSelectedTasks();
      return;
    }
  }

  if (isInsideInput) return;

  if (event.key === 'f' || event.key === 'F' || event.key === 'ب') {
    event.preventDefault();
    c.focusSearch();
    return;
  }

  if (event.key === 'r' || event.key === 'R' || event.key === 'ق') {
    event.preventDefault();
    c.refreshCurrentTab();
    return;
  }

  if (event.key === 'e' || event.key === 'E' || event.key === 'ث') {
    event.preventDefault();
    c.openExportModal();
    return;
  }

  if (event.key === 's' || event.key === 'S' || event.key === 'س') {
    event.preventDefault();
    c.toggleSortMenu();
    return;
  }

  if (event.key === '1') {
    c.setTab('my-tasks');
    return;
  }
  if (event.key === '2') {
    c.setTab('pool');
    return;
  }
}

export function calculateCustomsTotalValue(editableValues: Record<string, any>, f: { formatNumberWithCommas: (n: any) => string }): void {
  const priceStr = (editableValues['price_amount'] || '').toString().replace(/,/g, '');
  const simPriceStr = (editableValues['similar_unit_price'] || '').toString().replace(/,/g, '');
  const val = priceStr || simPriceStr;
  if (!val || isNaN(Number(val))) {
    editableValues['total_value'] = '';
    return;
  }
  editableValues['total_value'] = f.formatNumberWithCommas(val);
}

export function getTodayShamsiDate(): string {
  const now = new Date();
  const raw = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'persian'
  }).format(now);
  return raw.replace(/[\/-]/g, '/');
}
