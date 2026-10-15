import { CountTask, CountTaskStatus } from '../../../../../core/models/count-task.model';

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

export function matchesOmniSearch(item: any, query: string): boolean {
  if (!query) return true;
  const cleanQuery = normalizeText(query);
  const enConvertedQuery = normalizeText(convertPersianKeyboardToEnglish(query));

  const checkMatch = (val: any) => {
    if (!val) return false;
    const cleanVal = normalizeText(val);
    return cleanVal.includes(cleanQuery) || (enConvertedQuery.length >= 2 && cleanVal.includes(enConvertedQuery));
  };

  return (
    checkMatch(item?.fa_unic_code) ||
    checkMatch(item?.item_no) ||
    checkMatch(item?.description) ||
    checkMatch(item?.po) ||
    checkMatch(item?.new_location) ||
    checkMatch(item?.old_location) ||
    checkMatch(item?.plpkitem) ||
    checkMatch(item?.pl) ||
    checkMatch(item?.pk_number)
  );
}

export function matchesCounterBarcode(
  task: CountTask,
  rawQ: string,
  convertedQ: string,
  normQ: string,
  normConvertedQ: string
): boolean {
  const item = task.item_details;
  const unic = (item?.fa_unic_code || '').trim().toLowerCase();
  const normUnic = normalizeDigits(unic).toLowerCase();
  const itemNo = (item?.item_no || '').trim().toLowerCase();
  const itemId = String(item?.id || task.item || '').trim();
  const po = (item?.po || '').trim().toLowerCase();
  const plpk = (item?.plpkitem || '').trim().toLowerCase();
  const pl = (item?.pl || '').trim().toLowerCase();
  const pk = (item?.pk_number || '').trim().toLowerCase();

  const matchesAny = (val: string) => {
    if (!val) return false;
    return val === rawQ || val === convertedQ || val === normQ || val === normConvertedQ;
  };

  return (
    matchesAny(unic) ||
    matchesAny(normUnic) ||
    matchesAny(itemNo) ||
    matchesAny(itemId) ||
    matchesAny(po) ||
    matchesAny(plpk) ||
    matchesAny(pl) ||
    matchesAny(pk)
  );
}

export function compareRecountFirst(a: CountTask, b: CountTask, sortDirection: 'asc' | 'desc'): number {
  const isRecountA = (a.status === 'SUPERVISOR_REJECTED' || a.status === 'MANAGER_REJECTED') ? 0 : 1;
  const isRecountB = (b.status === 'SUPERVISOR_REJECTED' || b.status === 'MANAGER_REJECTED') ? 0 : 1;
  if (isRecountA !== isRecountB) {
    return isRecountA - isRecountB;
  }
  const locA = a.item_details?.new_location || a.item_details?.old_location || '';
  const locB = b.item_details?.new_location || b.item_details?.old_location || '';
  const locCompare = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
  return sortDirection === 'asc' ? locCompare : -locCompare;
}

export function extractCounterLocations(tasks: CountTask[]): string[] {
  const locSet = new Set<string>();
  tasks.forEach(t => {
    const loc = (t.item_details?.new_location || t.item_details?.old_location || '').trim();
    if (loc) locSet.add(loc);
  });
  return Array.from(locSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface CounterFilterOptions {
  searchQuery: string;
  statusFilter: 'all' | 'pending' | 'initial' | 'recount' | 'completed';
  dateFilter: 'all' | 'today' | 'yesterday' | 'week';
  locationFilter: string;
  sortField: 'created_at' | 'updated_at' | 'location' | 'code' | 'title' | 'recount_first';
  sortDirection: 'asc' | 'desc';
}

export function filterAndSortCounterTasks(
  tasks: CountTask[],
  opts: CounterFilterOptions
): {
  filteredTasks: CountTask[];
  statusCounts: { all: number; pending: number; initial: number; recount: number; completed: number };
  totalTasksCount: number;
  completedTasksCount: number;
  remainingTasksCount: number;
  readyToSubmitCount: number;
} {
  const hasCountedVal = (t: CountTask) => t.counted_balance !== null && t.counted_balance !== undefined;
  const isPending = (t: CountTask) => t.status === 'PENDING_COUNT' && !hasCountedVal(t);
  const isInitial = (t: CountTask) => t.status === 'INITIAL_COUNT' || (t.status === 'PENDING_COUNT' && hasCountedVal(t));
  const isRecount = (t: CountTask) => t.status === 'SUPERVISOR_REJECTED' || t.status === 'MANAGER_REJECTED';
  const isCompleted = (t: CountTask) => t.status !== 'PENDING_COUNT' && t.status !== 'INITIAL_COUNT' && t.status !== 'SUPERVISOR_REJECTED' && t.status !== 'MANAGER_REJECTED';
  const isRemaining = (t: CountTask) => !isCompleted(t);

  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(isCompleted).length;
  const remainingTasksCount = tasks.filter(isRemaining).length;
  const pendingList = tasks.filter(isRemaining);
  const readyToSubmitCount = pendingList.filter(t => t.status === 'INITIAL_COUNT' || (t.status === 'PENDING_COUNT' && hasCountedVal(t))).length;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const contextTasks = tasks.filter(t => {
    let matchDate = true;
    const dateStr = (t as any).updated_at || t.created_at;
    if (dateStr && opts.dateFilter !== 'all') {
      const taskDate = new Date(dateStr).getTime();
      if (opts.dateFilter === 'today') matchDate = taskDate >= today;
      else if (opts.dateFilter === 'yesterday') matchDate = taskDate >= yesterday && taskDate < today;
      else if (opts.dateFilter === 'week') matchDate = taskDate >= week;
    }
    if (!matchDate) return false;

    if (opts.locationFilter !== 'all') {
      const itemLoc = (t.item_details?.new_location || t.item_details?.old_location || '').trim();
      if (itemLoc !== opts.locationFilter) return false;
    }

    if (opts.searchQuery) {
      return matchesOmniSearch(t.item_details, opts.searchQuery);
    }
    return true;
  });

  const statusCounts = {
    all: contextTasks.length,
    pending: contextTasks.filter(isPending).length,
    initial: contextTasks.filter(isInitial).length,
    recount: contextTasks.filter(isRecount).length,
    completed: contextTasks.filter(isCompleted).length
  };

  const filteredTasks = contextTasks.filter(t => {
    if (opts.statusFilter === 'pending') return isPending(t);
    if (opts.statusFilter === 'initial') return isInitial(t);
    if (opts.statusFilter === 'recount') return isRecount(t);
    if (opts.statusFilter === 'completed') return isCompleted(t);
    return true;
  });

  filteredTasks.sort((a, b) => {
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
      return compareRecountFirst(a, b, opts.sortDirection);
    } else if (opts.sortField === 'code') {
      const codeA = a.item_details?.fa_unic_code || '';
      const codeB = b.item_details?.fa_unic_code || '';
      result = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (opts.sortField === 'title') {
      const titleA = (a.item_details?.description || '').replace(/^[آأإ]/, 'ا');
      const titleB = (b.item_details?.description || '').replace(/^[آأإ]/, 'ا');
      result = titleA.localeCompare(titleB, 'fa', { sensitivity: 'base' });
    }

    return opts.sortDirection === 'asc' ? result : -result;
  });

  return {
    filteredTasks,
    statusCounts,
    totalTasksCount,
    completedTasksCount,
    remainingTasksCount,
    readyToSubmitCount
  };
}

export function filterPoolCounterTasks(poolTasks: CountTask[], searchQuery: string): CountTask[] {
  if (!searchQuery) return [...poolTasks];
  return poolTasks.filter(t => matchesOmniSearch(t.item_details, searchQuery));
}

export function handleCounterKeydownEvent(event: KeyboardEvent, c: any): void {
  const target = event.target as HTMLElement;
  const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  if (event.key === 'Escape') {
    if (c.isSortMenuOpen) {
      event.preventDefault();
      c.isSortMenuOpen = false;
      c.cdr.detectChanges();
      return;
    }
    if (c.selectedTask) {
      event.preventDefault();
      c.closeDetailWithGuard();
      return;
    }
    if (c.isExportModalOpen) {
      event.preventDefault();
      c.closeExportModal();
      return;
    }
  }

  if (c.isSortMenuOpen && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    c.isSortMenuOpen = false;
    c.cdr.detectChanges();
  }

  if (c.isExportModalOpen) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
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

export function populateCounterDetail(
  task: CountTask,
  editableFormFields: any[]
): { countedBalanceStr: string; counterNote: string; editableValues: Record<string, any> } {
  if (task.history && task.history.length > 1) {
    task.history = task.history.slice().sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
      return timeB - timeA;
    });
  }
  const countedBalanceStr = (task.counted_balance !== null && task.counted_balance !== undefined) ? String(task.counted_balance) : '';
  const counterNote = task.counter_note || '';

  const editableValues: Record<string, any> = {};
  const item: any = task.item_details || {};
  editableFormFields.forEach(f => {
    if (f.is_dynamic) {
      const realKey = f.key.replace(/^dyn_/, '');
      const rawVal = item.dynamic_data?.[realKey];
      editableValues[f.key] = f.data_type === 'boolean' ? (rawVal === true || rawVal === 'true') : (rawVal ?? '');
    } else {
      const rawVal = item[f.key];
      editableValues[f.key] = f.data_type === 'boolean' ? (rawVal === true || rawVal === 'true') : (rawVal ?? '');
    }
  });

  return { countedBalanceStr, counterNote, editableValues };
}

export function parseCounterUrlParams(params: any) {
  const tab = params['tab'];
  const resolvedTab = (tab === 'pool') ? 'pool' : 'my-tasks';
  const status = params['status'];
  const validStatuses = ['all', 'pending', 'initial', 'recount', 'completed'];
  const statusFilter = validStatuses.includes(status) ? status : 'pending';
  const date = params['date'];
  const validDates = ['all', 'today', 'yesterday', 'week'];
  const dateFilter = validDates.includes(date) ? date : 'all';
  const locationFilter = params['loc'] || 'all';
  const sort = params['sort'];
  const validSorts = ['created_at', 'updated_at', 'location', 'recount_first', 'code', 'title'];
  const sortField = validSorts.includes(sort) ? sort : 'updated_at';
  const sortDir = params['sortDir'];
  const sortDirection = (sortDir === 'asc' || sortDir === 'desc') ? sortDir : ((sortField === 'created_at' || sortField === 'updated_at') ? 'desc' : 'asc');
  const searchQuery = params['q'] || '';

  return { resolvedTab, statusFilter, dateFilter, locationFilter, sortField, sortDirection, searchQuery };
}

export class CounterLongPressController {
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
