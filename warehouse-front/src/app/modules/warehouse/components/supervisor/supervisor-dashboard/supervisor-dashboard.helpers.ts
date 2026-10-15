import { CountTask } from '../../../../../core/models/count-task.model';
import { DocTask } from '../../../../../core/models/doc-task.model';

export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[​-‍﻿]/g, '')
    .trim();
}

export function normalizeDigits(str: any): string {
  if (str === null || str === undefined) return '';
  const faToEn: { [key: string]: string } = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  return str.toString().split('').map((char: string) => faToEn[char] || faToEn[char.toLowerCase()] || char).join('');
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

export function matchesSupervisorSearch(
  itemDetails: any,
  rawQuery: string,
  query: string,
  normDigitsQuery: string,
  convertedQuery: string,
  workerOrCounterName?: string,
  taskData?: any
): boolean {
  if (!rawQuery) return true;
  const unic = normalizeText(itemDetails?.fa_unic_code || '');
  const enUnic = normalizeText(itemDetails?.en_unic_code || '');
  const desc = normalizeText(itemDetails?.description || '');
  const itemNo = normalizeText(itemDetails?.item_no || itemDetails?.part_no || '');
  const po = normalizeText(itemDetails?.po || '');
  const tag = normalizeText(itemDetails?.tag || itemDetails?.tag_number || '');
  const pkNumber = normalizeText(itemDetails?.pk_number || itemDetails?.plpkitem || '');
  const locNew = normalizeText(itemDetails?.new_location || '');
  const locOld = normalizeText(itemDetails?.old_location || '');
  const personName = normalizeText(workerOrCounterName || '');
  const rti = normalizeText(taskData?.inv_rti_number || taskData?.added_rti_no || '');
  const supplier = normalizeText(taskData?.doc_supplier || '');

  return (
    unic.includes(query) || unic.includes(normDigitsQuery) || unic.includes(convertedQuery) ||
    enUnic.includes(query) ||
    desc.includes(query) ||
    itemNo.includes(query) ||
    po.includes(query) ||
    tag.includes(query) ||
    pkNumber.includes(query) ||
    locNew.includes(query) || locOld.includes(query) ||
    personName.includes(query) ||
    rti.includes(query) ||
    supplier.includes(query)
  );
}

export interface SupervisorFilterOptions {
  searchQuery: string;
  locationFilter: string;
  dateFilter: 'all' | 'today' | 'yesterday' | 'week';
  statusFilter: 'all' | 'counted' | 'recount';
  sortField: 'created_at' | 'updated_at' | 'location' | 'code' | 'title' | 'recount_first';
  sortDirection: 'asc' | 'desc';
}

export function filterAndSortSupervisorCountTasks(
  tasks: CountTask[],
  opts: SupervisorFilterOptions
): CountTask[] {
  const rawQuery = (opts.searchQuery || '').trim();
  const query = normalizeText(rawQuery);
  const normDigitsQuery = normalizeDigits(rawQuery.toLowerCase());
  const convertedQuery = convertPersianKeyboardToEnglish(rawQuery).toLowerCase();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const matchesLocation = (itemDetails: any) => {
    if (!opts.locationFilter || opts.locationFilter === 'all') return true;
    const loc = (itemDetails?.new_location || itemDetails?.old_location || '').toLowerCase().trim();
    return loc.startsWith(opts.locationFilter.toLowerCase().trim());
  };

  const matchesDate = (t: any) => {
    if (opts.dateFilter === 'all') return true;
    const dateStr = t.updated_at || t.created_at;
    if (!dateStr) return true;
    const taskDate = new Date(dateStr).getTime();
    if (opts.dateFilter === 'today') return taskDate >= today;
    if (opts.dateFilter === 'yesterday') return taskDate >= yesterday && taskDate < today;
    if (opts.dateFilter === 'week') return taskDate >= week;
    return true;
  };

  const filtered = tasks.filter(t => {
    if (!matchesDate(t)) return false;
    if (opts.statusFilter === 'counted' && t.status !== 'COUNTED') return false;
    if (opts.statusFilter === 'recount' && t.status !== 'MANAGER_REJECTED') return false;
    if (!matchesLocation(t.item_details)) return false;
    return matchesSupervisorSearch(t.item_details, rawQuery, query, normDigitsQuery, convertedQuery, t.counter_name, t);
  });

  filtered.sort((a, b) => {
    let result = 0;
    if (opts.sortField === 'created_at') {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
      result = timeA - timeB;
    } else if (opts.sortField === 'updated_at') {
      const timeA = (a as any).updated_at ? new Date((a as any).updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : (a.id || 0));
      const timeB = (b as any).updated_at ? new Date((b as any).updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : (b.id || 0));
      result = timeA - timeB;
    } else if (opts.sortField === 'location') {
      const locA = a.item_details?.new_location || a.item_details?.old_location || '';
      const locB = b.item_details?.new_location || b.item_details?.old_location || '';
      result = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (opts.sortField === 'recount_first') {
      const isRecountA = (a.status === 'SUPERVISOR_REJECTED' || a.status === 'MANAGER_REJECTED') ? 0 : 1;
      const isRecountB = (b.status === 'SUPERVISOR_REJECTED' || b.status === 'MANAGER_REJECTED') ? 0 : 1;
      if (isRecountA !== isRecountB) {
        return isRecountA - isRecountB;
      }
      const locA = a.item_details?.new_location || a.item_details?.old_location || '';
      const locB = b.item_details?.new_location || b.item_details?.old_location || '';
      const locCompare = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      return opts.sortDirection === 'asc' ? locCompare : -locCompare;
    } else if (opts.sortField === 'code') {
      const codeA = a.item_details?.fa_unic_code || '';
      const codeB = b.item_details?.fa_unic_code || '';
      result = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (opts.sortField === 'title') {
      const titleA = a.item_details?.description || '';
      const titleB = b.item_details?.description || '';
      result = titleA.localeCompare(titleB, 'fa', { sensitivity: 'base' });
    }
    return opts.sortDirection === 'asc' ? result : -result;
  });

  return filtered;
}

export function filterAndSortSupervisorDocTasks(
  docTasks: DocTask[],
  opts: SupervisorFilterOptions
): DocTask[] {
  const rawQuery = (opts.searchQuery || '').trim();
  const query = normalizeText(rawQuery);
  const normDigitsQuery = normalizeDigits(rawQuery.toLowerCase());
  const convertedQuery = convertPersianKeyboardToEnglish(rawQuery).toLowerCase();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const matchesLocation = (itemDetails: any) => {
    if (!opts.locationFilter || opts.locationFilter === 'all') return true;
    const loc = (itemDetails?.new_location || itemDetails?.old_location || '').toLowerCase().trim();
    return loc.startsWith(opts.locationFilter.toLowerCase().trim());
  };

  const matchesDate = (t: any) => {
    if (opts.dateFilter === 'all') return true;
    const dateStr = t.updated_at || t.created_at;
    if (!dateStr) return true;
    const taskDate = new Date(dateStr).getTime();
    if (opts.dateFilter === 'today') return taskDate >= today;
    if (opts.dateFilter === 'yesterday') return taskDate >= yesterday && taskDate < today;
    if (opts.dateFilter === 'week') return taskDate >= week;
    return true;
  };

  const filtered = docTasks.filter(t => {
    if (!matchesDate(t)) return false;
    if (opts.statusFilter === 'counted' && t.status !== 'DOC_PROCESSED') return false;
    if (opts.statusFilter === 'recount' && t.status !== 'DOC_MANAGER_REJECTED') return false;
    if (!matchesLocation(t.item_details)) return false;
    return matchesSupervisorSearch(t.item_details, rawQuery, query, normDigitsQuery, convertedQuery, t.doc_worker_name, t);
  });

  filtered.sort((a, b) => {
    let result = 0;
    if (opts.sortField === 'created_at') {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
      result = timeA - timeB;
    } else if (opts.sortField === 'updated_at') {
      const timeA = (a as any).updated_at ? new Date((a as any).updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : (a.id || 0));
      const timeB = (b as any).updated_at ? new Date((b as any).updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : (b.id || 0));
      result = timeA - timeB;
    } else if (opts.sortField === 'location') {
      const locA = a.item_details?.new_location || a.item_details?.old_location || '';
      const locB = b.item_details?.new_location || b.item_details?.old_location || '';
      result = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (opts.sortField === 'recount_first') {
      const isRecountA = (a.status === 'DOC_SUPERVISOR_REJECTED' || a.status === 'DOC_MANAGER_REJECTED') ? 0 : 1;
      const isRecountB = (b.status === 'DOC_SUPERVISOR_REJECTED' || b.status === 'DOC_MANAGER_REJECTED') ? 0 : 1;
      if (isRecountA !== isRecountB) {
        return isRecountA - isRecountB;
      }
      const locA = a.item_details?.new_location || a.item_details?.old_location || '';
      const locB = b.item_details?.new_location || b.item_details?.old_location || '';
      const locCompare = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      return opts.sortDirection === 'asc' ? locCompare : -locCompare;
    } else if (opts.sortField === 'code') {
      const codeA = a.item_details?.fa_unic_code || '';
      const codeB = b.item_details?.fa_unic_code || '';
      result = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (opts.sortField === 'title') {
      const titleA = a.item_details?.description || '';
      const titleB = b.item_details?.description || '';
      result = titleA.localeCompare(titleB, 'fa', { sensitivity: 'base' });
    }
    return opts.sortDirection === 'asc' ? result : -result;
  });

  return filtered;
}

export function handleSupervisorKeydownEvent(event: KeyboardEvent, c: any): void {
  const target = event.target as HTMLElement;
  const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  if (event.key === 'Escape') {
    if (c.isSortMenuOpen) {
      event.preventDefault();
      c.isSortMenuOpen = false;
      c.cdr.detectChanges();
      return;
    }
    if (c.showApproveDialog) {
      c.cancelApprove();
    } else if (c.showRejectDialog) {
      c.closeRejectDialog();
    } else if (c.showBulkRejectDialog) {
      c.cancelBulkReject();
    } else if (c.showDocApproveDialog) {
      c.cancelDocApprove();
    } else if (c.showDocRejectDialog) {
      c.closeDocRejectDialog();
    } else if (c.isExportModalOpen) {
      c.closeExportModal();
    }
    return;
  }

  if (c.isSortMenuOpen && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    c.isSortMenuOpen = false;
    c.cdr.detectChanges();
  }

  if (event.ctrlKey || event.metaKey) {
    if (event.key === 'Enter') {
      if (c.showApproveDialog) {
        c.confirmApprove();
      } else if (c.showRejectDialog) {
        c.confirmReject();
      } else if (c.showBulkRejectDialog) {
        c.confirmBulkReject();
      } else if (c.showDocApproveDialog) {
        c.confirmDocApprove();
      } else if (c.showDocRejectDialog) {
        c.confirmDocReject();
      } else if (c.isExportModalOpen) {
        c.executeExport();
      }
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
  if (event.key === '3') {
    c.setTab('doc');
    return;
  }
  if (event.key === '4') {
    c.setTab('doc-pool');
    return;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
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

export function matchesSupervisorBarcode(
  t: any,
  rawQ: string,
  convertedQ: string,
  normQ: string,
  normConvertedQ: string
): boolean {
  const unic = (t.item_details?.fa_unic_code || '').trim().toLowerCase();
  const normUnic = normalizeDigits(unic).toLowerCase();
  const itemNo = (t.item_details?.item_no || '').trim().toLowerCase();
  const itemId = String(t.item_details?.id || t.item || '').trim();
  const po = (t.item_details?.po || '').trim().toLowerCase();

  const matchesAny = (val: string) => {
    if (!val) return false;
    return val === rawQ || val === convertedQ || val === normQ || val === normConvertedQ;
  };

  return matchesAny(unic) || matchesAny(normUnic) || matchesAny(itemNo) || matchesAny(itemId) || matchesAny(po);
}

export function parseSupervisorUrlParams(params: any): {
  tab: 'my-tasks' | 'pool' | 'doc' | 'doc-pool';
  statusFilter: 'all' | 'counted' | 'recount';
  dateFilter: 'all' | 'today' | 'yesterday' | 'week';
  locationFilter: string;
  sortField: 'created_at' | 'updated_at' | 'location' | 'code' | 'title' | 'recount_first';
  sortDirection: 'asc' | 'desc';
  searchQuery: string;
} {
  let tab = params['tab'];
  const validTabs = ['my-tasks', 'pool', 'doc', 'doc-pool'];
  if (!validTabs.includes(tab) && typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedTab = localStorage.getItem('supervisor_active_tab');
      if (validTabs.includes(savedTab || '')) {
        tab = savedTab;
      }
    } catch {}
  }
  const resolvedTab = validTabs.includes(tab) ? tab : 'my-tasks';

  const status = params['status'];
  const validStatuses = ['all', 'counted', 'recount'];
  const statusFilter = validStatuses.includes(status) ? status : 'counted';

  const date = params['date'];
  const validDates = ['all', 'today', 'yesterday', 'week'];
  const dateFilter = validDates.includes(date) ? date : 'all';

  const locationFilter = params['loc'] || 'all';

  const sort = params['sort'];
  const validSorts = ['created_at', 'updated_at', 'location', 'recount_first', 'code', 'title'];
  const sortField = validSorts.includes(sort) ? sort : 'created_at';

  const sortDir = params['sortDir'];
  const sortDirection = (sortDir === 'asc' || sortDir === 'desc') ? sortDir : (sortField === 'created_at' || sortField === 'updated_at' ? 'desc' : 'asc');

  const searchQuery = params['q'] || '';

  return { tab: resolvedTab, statusFilter, dateFilter, locationFilter, sortField, sortDirection, searchQuery };
}

export function getInvoiceTypeLabel(val: string | null | undefined): string {
  const map: Record<string, string> = {
    'formal': 'رسمی/مالیاتی',
    'domestic': 'داخلی',
    'foreign': 'خارجی',
    'consignment': 'امانی'
  };
  return val ? (map[val] || val) : '-';
}

export function getCurrencyLabel(val: string | null | undefined): string {
  const map: Record<string, string> = {
    'IRR': 'ریال',
    'USD': 'دلار',
    'EUR': 'یورو',
    'OTHER': 'سایر'
  };
  return val ? (map[val] || val) : '-';
}

export function formatNumberWithCommas(val: any): string {
  if (val === null || val === undefined || val === '') return '-';
  const parts = String(val).replace(/,/g, '').split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export function getActionTypeLabel(val: string | null | undefined): string {
  if (!val) return '-';
  const map: Record<string, string> = {
    'COUNTED': 'شمارش شده',
    'INITIAL_COUNT': 'ثبت اولیه شمارش',
    'MANAGER_REVIEW': 'ارسال به مدیر',
    'SUPERVISOR_REJECTED': 'بررسی مجدد (سرپرست)',
    'MANAGER_REJECTED': 'بررسی مجدد (مدیر)',
    'FINAL_APPROVED': 'تایید نهایی مدیر',
    'DOC_PROCESSED': 'ثبت اولیه سند',
    'DOC_SUPERVISOR_REJECTED': 'رد سرپرست مالی',
    'DOC_MANAGER_REVIEW': 'ارسال به مدیر مالی',
    'DOC_MANAGER_REJECTED': 'رد مدیر مالی',
    'DOC_FINAL_APPROVED': 'تایید نهایی مالی',
    'CLAIMED': 'به عهده گرفته شد',
  };
  return map[val] || val.replace(/_/g, ' ');
}

export class SupervisorLongPressController {
  private initialTouchY = 0;
  private initialTouchX = 0;
  private pressTimeout: any = null;
  justLongPressed = false;

  start(event: PointerEvent, onTrigger: () => void) {
    this.initialTouchY = event.clientY;
    this.initialTouchX = event.clientX;
    this.pressTimeout = setTimeout(() => {
      this.pressTimeout = null;
      this.justLongPressed = true;
      onTrigger();
      if (navigator.vibrate) navigator.vibrate(50);
    }, 450);
  }

  move(event: PointerEvent) {
    if (this.pressTimeout) {
      if (Math.abs(event.clientY - this.initialTouchY) > 10 || Math.abs(event.clientX - this.initialTouchX) > 10) {
        clearTimeout(this.pressTimeout);
        this.pressTimeout = null;
      }
    }
  }

  end() {
    if (this.pressTimeout) {
      clearTimeout(this.pressTimeout);
      this.pressTimeout = null;
    }
  }
}

export function handleSupervisorSwr(
  url: string,
  data: any,
  currentTab: string,
  state: {
    tasks: CountTask[];
    poolTasks: CountTask[];
    docTasks: DocTask[];
    docPoolTasks: DocTask[];
    trackUpdates: (oldList: any[], newList: any[]) => void;
    applyFilters: () => void;
    detectChanges: () => void;
  }
) {
  if (!data) return;
  const freshList = Array.isArray(data) ? data : data.results || [];
  const isPoolUrl = url.includes('/pool_tasks/');
  const isSupervisorCountTasks = url.includes('/inventory/count-tasks/') && (url.includes('as_role=supervisor') || (!url.includes('as_role=counter') && !url.includes('as_role=manager') && !url.includes('as_role=tracking')));
  const isSupervisorDocTasks = url.includes('/inventory/doc-tasks/') && (url.includes('as_role=doc_supervisor') || (!url.includes('as_role=doc_worker') && !url.includes('as_role=manager')));

  if (isSupervisorCountTasks) {
    if (isPoolUrl) {
      if (currentTab === 'pool') state.trackUpdates(state.poolTasks, freshList);
      state.poolTasks = freshList;
      state.applyFilters();
      state.detectChanges();
    } else {
      const filtered = freshList.filter((t: CountTask) => t.status === 'COUNTED' || t.status === 'MANAGER_REJECTED');
      if (filtered.length > 0 || freshList.length === 0) {
        if (currentTab === 'my-tasks') state.trackUpdates(state.tasks, filtered);
        state.tasks = filtered;
        state.applyFilters();
        state.detectChanges();
      }
    }
  } else if (isSupervisorDocTasks) {
    if (isPoolUrl) {
      if (currentTab === 'doc-pool') state.trackUpdates(state.docPoolTasks, freshList);
      state.docPoolTasks = freshList;
      state.applyFilters();
      state.detectChanges();
    } else {
      const filtered = freshList.filter((t: DocTask) => t.status === 'DOC_PROCESSED' || t.status === 'DOC_MANAGER_REJECTED');
      if (filtered.length > 0 || freshList.length === 0) {
        if (currentTab === 'doc') state.trackUpdates(state.docTasks, filtered);
        state.docTasks = filtered;
        state.applyFilters();
        state.detectChanges();
      }
    }
  }
}
