import { jalaliToGregorian, gregorianToJalali } from '../../../../../../core/utils/date-utils';
import {
  AttendanceMatrixRow,
  MonthlyGridRow,
  MonthlyGridDayMeta
} from '../../../../../../core/models/personnel.model';

export const PERSIAN_MONTHS = [
  { num: 1, name: 'فروردین' },
  { num: 2, name: 'اردیبهشت' },
  { num: 3, name: 'خرداد' },
  { num: 4, name: 'تیر' },
  { num: 5, name: 'مرداد' },
  { num: 6, name: 'شهریور' },
  { num: 7, name: 'مهر' },
  { num: 8, name: 'آبان' },
  { num: 9, name: 'آذر' },
  { num: 10, name: 'دی' },
  { num: 11, name: 'بهمن' },
  { num: 12, name: 'اسفند' }
];

export function shiftShamsiDay(dateStr: string, deltaDays: number): string {
  try {
    const parts = dateStr.split('/').map(p => parseInt(p, 10));
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return dateStr;
    const g = jalaliToGregorian(parts[0], parts[1], parts[2]);
    const d = new Date(g.gy, g.gm - 1, g.gd);
    d.setDate(d.getDate() + deltaDays);
    const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const pad = (n: number) => n < 10 ? '0' + n : String(n);
    return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
  } catch {
    return dateStr;
  }
}

export function getTodayShamsi(): string {
  const d = new Date();
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const pad = (n: number) => n < 10 ? '0' + n : String(n);
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

export function syncYearMonthFromDailyDate(dateStr: string): string {
  if (dateStr && dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }
  return '';
}

export function isZeroHourStatus(status?: string): boolean {
  return status === 'ABSENT' || status === 'LEAVE' || !status;
}

export function calculateHoursForStatus(status: string, isFriday: boolean): {
  effective_hours: number;
  overtime_hours?: number;
  is_friday_work: boolean;
  is_mission: boolean;
} {
  if (status === 'PRESENT_10H') {
    return { effective_hours: 10, is_friday_work: isFriday, is_mission: false };
  } else if (status === 'HALF_5H') {
    return { effective_hours: 5, is_friday_work: isFriday, is_mission: false };
  } else if (status === 'MISSION') {
    return { effective_hours: 10, overtime_hours: 0, is_friday_work: false, is_mission: true };
  } else if (status === 'ABSENT' || status === 'LEAVE') {
    return { effective_hours: 0, overtime_hours: 0, is_friday_work: false, is_mission: false };
  }
  return { effective_hours: 0, overtime_hours: 0, is_friday_work: false, is_mission: false };
}

export function parseExcelPasteToRows(
  text: string,
  attendanceRows: AttendanceMatrixRow[]
): any[] {
  if (!text.trim()) return [];
  const lines = text.trim().split('\n');
  const result: any[] = [];

  lines.forEach(line => {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length === 0 || !cols[0]) return;

    const codeOrName = cols[0];
    const matchedRow = attendanceRows.find(r =>
      r.national_code === codeOrName ||
      (r.full_name && r.full_name.includes(codeOrName))
    );

    let status = cols[1] || 'PRESENT_10H';
    if (status.includes('حاضر')) status = 'PRESENT_10H';
    else if (status.includes('غایب')) status = 'ABSENT';
    else if (status.includes('مرخصی')) status = 'LEAVE';
    else if (status.includes('ماموریت')) status = 'MISSION';
    else if (status.includes('جمعه')) status = 'FRIDAY_WORK';

    const isZeroHour = (status === 'ABSENT' || status === 'LEAVE');
    const defaultHours = isZeroHour ? 0 : 10;
    const effectiveHours = cols[2] ? parseFloat(cols[2]) : defaultHours;
    const overtimeHours = (cols[3] && !isZeroHour) ? parseFloat(cols[3]) : 0;
    const rawAdv = cols[4] ? parseFloat(cols[4].replace(/,/g, '')) : 0;
    const advancePayment = !isNaN(rawAdv) && rawAdv > 0 ? rawAdv : 0;
    const notes = cols[5] || (isNaN(rawAdv) ? cols[4] : '') || '';

    result.push({
      national_code: matchedRow?.national_code || (codeOrName.length === 10 ? codeOrName : ''),
      full_name: matchedRow?.full_name || codeOrName,
      status,
      effective_hours: isNaN(effectiveHours) ? defaultHours : (isZeroHour ? 0 : effectiveHours),
      overtime_hours: isNaN(overtimeHours) ? 0 : (isZeroHour ? 0 : overtimeHours),
      advance_payment: advancePayment,
      notes,
      matchedRow
    });
  });

  return result;
}

export function handleAttendanceGridKeydown(
  event: KeyboardEvent,
  colType: 'status' | 'eff' | 'ot' | 'adv' | 'note' | 'wh',
  rowIndex: number,
  statusType?: string,
  row?: AttendanceMatrixRow,
  setAttendanceStatusFn?: (row: AttendanceMatrixRow, status: string) => void
): void {
  const key = event.key;

  if (colType === 'status') {
    const statuses = ['PRESENT_10H', 'HALF_5H', 'LEAVE', 'ABSENT', 'MISSION'];
    const currentIdx = statuses.indexOf(statusType || 'PRESENT_10H');

    if (key === 'ArrowLeft') {
      event.preventDefault();
      if (currentIdx < statuses.length - 1) {
        const nextStatus = statuses[currentIdx + 1];
        const el = document.getElementById(`btn-status-${nextStatus}-${rowIndex}`);
        if (el) el.focus();
      } else {
        const el = document.getElementById(`input-eff-${rowIndex}`);
        if (el) {
          (el as HTMLInputElement).focus();
          (el as HTMLInputElement).select?.();
        }
      }
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      if (currentIdx > 0) {
        const prevStatus = statuses[currentIdx - 1];
        const el = document.getElementById(`btn-status-${prevStatus}-${rowIndex}`);
        if (el) el.focus();
      } else {
        const el = document.getElementById(`chk-${rowIndex}`);
        if (el) el.focus();
      }
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      const nextEl = document.getElementById(`btn-status-${statusType}-${rowIndex + 1}`);
      if (nextEl) nextEl.focus();
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      const prevEl = document.getElementById(`btn-status-${statusType}-${rowIndex - 1}`);
      if (prevEl) prevEl.focus();
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (row && statusType && setAttendanceStatusFn) {
        setAttendanceStatusFn(row, statusType);
      }
    }
    return;
  }

  if (key === 'ArrowUp') {
    event.preventDefault();
    const prevEl = document.getElementById(colType === 'wh' ? `select-wh-${rowIndex - 1}` : `input-${colType}-${rowIndex - 1}`);
    if (prevEl) {
      (prevEl as HTMLElement).focus();
      (prevEl as HTMLInputElement).select?.();
    }
  } else if (key === 'ArrowDown' || key === 'Enter') {
    event.preventDefault();
    const nextEl = document.getElementById(colType === 'wh' ? `select-wh-${rowIndex + 1}` : `input-${colType}-${rowIndex + 1}`);
    if (nextEl) {
      (nextEl as HTMLElement).focus();
      (nextEl as HTMLInputElement).select?.();
    } else {
      (event.target as HTMLElement).blur();
    }
  } else if (key === 'ArrowLeft') {
    const target = event.target as HTMLInputElement;
    const isAtEnd = target.selectionStart === target.selectionEnd && target.selectionStart === (target.value || '').length;
    if (isAtEnd || target.type === 'number' || target.tagName === 'SELECT') {
      event.preventDefault();
      let nextColId = '';
      if (colType === 'eff') nextColId = `input-ot-${rowIndex}`;
      else if (colType === 'ot') nextColId = `input-adv-${rowIndex}`;
      else if (colType === 'adv') nextColId = `input-note-${rowIndex}`;
      else if (colType === 'note') nextColId = `select-wh-${rowIndex}`;
      if (nextColId) {
        const el = document.getElementById(nextColId);
        if (el) {
          (el as HTMLElement).focus();
          (el as HTMLInputElement).select?.();
        }
      }
    }
  } else if (key === 'ArrowRight') {
    const target = event.target as HTMLInputElement;
    const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
    if (isAtStart || target.type === 'number' || target.tagName === 'SELECT') {
      event.preventDefault();
      let prevColId = '';
      if (colType === 'wh') prevColId = `input-note-${rowIndex}`;
      else if (colType === 'note') prevColId = `input-adv-${rowIndex}`;
      else if (colType === 'adv') prevColId = `input-ot-${rowIndex}`;
      else if (colType === 'ot') prevColId = `input-eff-${rowIndex}`;
      else if (colType === 'eff') {
        const activeStatus = row?.status || 'MISSION';
        prevColId = `btn-status-${activeStatus}-${rowIndex}`;
        if (!document.getElementById(prevColId)) {
          prevColId = `btn-status-MISSION-${rowIndex}`;
        }
      }
      if (prevColId) {
        const el = document.getElementById(prevColId);
        if (el) {
          (el as HTMLElement).focus();
          (el as HTMLInputElement).select?.();
        }
      }
    }
  } else if (key === 'Escape') {
    event.preventDefault();
    (event.target as HTMLElement).blur();
  }
}

export function computeAttendanceCounts(rows: AttendanceMatrixRow[]) {
  let present = 0;
  let half = 0;
  let absent = 0;
  let leave = 0;
  let mission = 0;
  let other = 0;
  let totalEffectiveHours = 0;
  let totalOvertimeHours = 0;
  let totalAdvance = 0;

  for (const r of (rows || [])) {
    if (r.status === 'PRESENT_10H') present++;
    else if (r.status === 'HALF_5H') half++;
    else if (r.status === 'ABSENT') absent++;
    else if (r.status === 'LEAVE' || r.status === 'HOURLY_LEAVE') leave++;
    else if (r.status === 'MISSION') mission++;
    else if (r.status) other++;

    totalEffectiveHours += Number(r.effective_hours) || 0;
    totalOvertimeHours += Number(r.overtime_hours) || 0;
    totalAdvance += Number(r.advance_payment) || 0;
  }
  return {
    present,
    half,
    absent,
    leave,
    mission,
    other,
    total: rows.length,
    totalEffectiveHours,
    totalOvertimeHours,
    totalAdvance
  };
}

export function computeAttendanceRegistrationState(rows: AttendanceMatrixRow[]): {
  status: 'none' | 'partial' | 'full';
  savedCount: number;
  totalCount: number;
  label: string;
} {
  const total = rows.length;
  if (total === 0) {
    return { status: 'none', savedCount: 0, totalCount: 0, label: 'پیش‌نویس (بدون پرسنل)' };
  }
  const saved = rows.filter(r => !!r.is_existing || !!r.attendance_id).length;
  if (saved === 0) {
    return { status: 'none', savedCount: 0, totalCount: total, label: 'پیش‌نویس (ذخیره‌نشده)' };
  } else if (saved === total) {
    return { status: 'full', savedCount: saved, totalCount: total, label: `نهایی (${saved} از ${total})` };
  } else {
    return { status: 'partial', savedCount: saved, totalCount: total, label: `ثبت ناقص (${saved} از ${total})` };
  }
}

export function calculateDateRangeAttendance(
  monthlyGridRows: MonthlyGridRow[],
  monthlyGridDays: MonthlyGridDayMeta[],
  selectedPersonnelIds: Set<number>,
  rangeStartDay: number,
  rangeEndDay: number,
  rangeTargetScope: 'selected' | 'all',
  rangeStatus: string,
  rangeEffectiveHours: number,
  rangeOvertimeHours: number,
  rangeSkipFridays: boolean,
  rangeOnlyEmptyDays: boolean
): { affectedCount: number; targetRowsCount: number } {
  const targetRows = rangeTargetScope === 'selected' && selectedPersonnelIds.size > 0
    ? monthlyGridRows.filter(r => selectedPersonnelIds.has(r.personnel_id))
    : monthlyGridRows;

  if (targetRows.length === 0) {
    return { affectedCount: 0, targetRowsCount: 0 };
  }

  const fridayDays = new Set(monthlyGridDays.filter(m => m.is_friday).map(m => m.day));
  let affectedCount = 0;

  for (const row of targetRows) {
    for (const d of row.days) {
      if (d.day < rangeStartDay || d.day > rangeEndDay) {
        continue;
      }
      const isFriday = fridayDays.has(d.day);
      if (rangeSkipFridays && isFriday && rangeStatus !== 'FRIDAY_WORK') {
        continue;
      }

      if (rangeOnlyEmptyDays) {
        const hasExistingWork = d.status && d.status !== 'ABSENT' && Number(d.effective_hours) > 0;
        if (hasExistingWork) {
          continue;
        }
      }

      d.status = rangeStatus;
      d.effective_hours = rangeEffectiveHours;
      d.overtime_hours = rangeOvertimeHours;
      d.is_friday_work = isFriday && rangeEffectiveHours > 0;
      d.is_mission = rangeStatus === 'MISSION';
      affectedCount++;
    }
    row.total_hours = row.days.reduce((acc, d) => acc + (parseFloat(d.effective_hours as any) || 0), 0);
    row.total_overtime = row.days.reduce((acc, d) => acc + (parseFloat(d.overtime_hours as any) || 0), 0);
    row.present_days = row.days.filter(d => ['PRESENT_10H', 'HALF_5H', 'FRIDAY_WORK', 'MISSION', 'CUSTOM'].includes(d.status) && (parseFloat(d.effective_hours as any) || 0) > 0).length;
  }

  return { affectedCount, targetRowsCount: targetRows.length };
}

export function markRowsAsOfficialHoliday(targets: AttendanceMatrixRow[]): void {
  targets.forEach(r => {
    r.status = 'LEAVE';
    r.effective_hours = 0;
    r.overtime_hours = 0;
    r.notes = r.notes ? `${r.notes} (تعطیل رسمی)` : 'تعطیل رسمی';
    r._isDirty = true;
  });
}

export function clearRowsAttendance(target: AttendanceMatrixRow[]): void {
  target.forEach(r => {
    r.status = '';
    r.effective_hours = 0;
    r.overtime_hours = 0;
    r.is_friday_work = false;
    r.is_mission = false;
    r.advance_payment = 0;
    r.notes = '';
    r._isDirty = true;
  });
}

export function applyBulkHoursToRows(
  targets: AttendanceMatrixRow[],
  bulkStatusOption: string,
  bulkEffectiveHours: number,
  bulkOvertimeHours: number,
  bulkAdvancePayment: number | null,
  bulkNotes: string
): void {
  targets.forEach(r => {
    const isAbsentOrLeave = r.status === 'ABSENT' || r.status === 'LEAVE';
    if (bulkStatusOption) {
      r.status = bulkStatusOption;
      r.effective_hours = bulkEffectiveHours;
      r.overtime_hours = bulkOvertimeHours;
    } else {
      if (!isAbsentOrLeave) {
        r.effective_hours = bulkEffectiveHours;
        r.overtime_hours = bulkOvertimeHours;
      }
    }
    if (bulkAdvancePayment !== null && bulkAdvancePayment !== undefined && bulkAdvancePayment >= 0) {
      r.advance_payment = Number(bulkAdvancePayment);
    }
    if (bulkNotes.trim()) {
      r.notes = bulkNotes.trim();
    }
    r._isDirty = true;
  });
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export function buildAttendanceBulkPayload(
  warehouseId: number | null,
  sectionId: number,
  dateShamsi: string,
  clientTabId: string,
  dirtyRows: AttendanceMatrixRow[]
) {
  return {
    warehouse_id: warehouseId,
    section_id: sectionId,
    date_shamsi: dateShamsi,
    client_tab_id: clientTabId,
    items: dirtyRows.map(r => ({
      personnel_id: r.personnel_id,
      warehouse_id: r.warehouse_id || warehouseId || null,
      status: r.status || '',
      effective_hours: Number(r.effective_hours) || 0,
      overtime_hours: Number(r.overtime_hours) || 0,
      is_friday_work: !!r.is_friday_work,
      is_mission: !!r.is_mission,
      advance_payment: Number(r.advance_payment) || 0,
      notes: r.notes || ''
    }))
  };
}

export function buildMonthlyGridBulkItems(monthlyGridRows: MonthlyGridRow[]) {
  const items: any[] = [];
  for (const row of monthlyGridRows) {
    for (const d of row.days) {
      if (d.status || d.effective_hours > 0 || d.is_existing) {
        items.push({
          personnel_id: row.personnel_id,
          day: d.day,
          status: d.status || 'PRESENT_10H',
          effective_hours: d.effective_hours,
          overtime_hours: d.overtime_hours,
          is_friday_work: d.is_friday_work,
          is_mission: d.is_mission,
          advance_payment: d.advance_payment || 0,
          notes: d.notes || ''
        });
      }
    }
  }
  return items;
}

