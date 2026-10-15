import { ProjectSection, UserSectionAssignment } from '../../../../../core/models/personnel.model';
import { User } from '../../../../../core/http/accounts-http.service';
import { RoleDefinition, SectionGroupedAssignments } from './projects-and-sections';

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'manager',
    label: 'مدیران پروژه / شرکت (تایید نهایی)',
    shortLabel: 'مدیران',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    bgClass: 'bg-purple-50/50',
    borderClass: 'border-purple-200',
    textClass: 'text-purple-900',
    icon: '👑',
    description: 'تایید هر یک از مدیران، گردش‌کار و اسناد را مستقیماً به مرحله بعد منتقل می‌کند.'
  },
  {
    key: 'accountant',
    label: 'حسابداران پروژه (بررسی و تایید مالی)',
    shortLabel: 'حسابداران',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    bgClass: 'bg-amber-50/50',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-900',
    icon: '💼',
    description: 'بررسی هزینه‌ها و تطبیق صورت‌حساب‌ها.'
  },
  {
    key: 'supervisor',
    label: 'سرپرستان بخش (بررسی عملیاتی)',
    shortLabel: 'سرپرستان',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    bgClass: 'bg-blue-50/50',
    borderClass: 'border-blue-200',
    textClass: 'text-blue-900',
    icon: '🛡️',
    description: 'نظارت عملیاتی بر ترددها، کارکرد پرسنل و ناوگان.'
  },
  {
    key: 'treasury',
    label: 'خزانه‌داران کل (پرداخت و تسویه)',
    shortLabel: 'خزانه‌داران',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bgClass: 'bg-emerald-50/50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-900',
    icon: '💰',
    description: 'صدور حواله پرداخت و تسویه ریالی فاکتورها.'
  },
  {
    key: 'employee',
    label: 'کارمندان و اپراتورها (ثبت‌کنندگان)',
    shortLabel: 'کارمندان',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    bgClass: 'bg-slate-50/70',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-900',
    icon: '📝',
    description: 'ثبت اطلاعات خام، کارکرد و پیش‌نویس اسناد.'
  }
];

export function normalizeInput(val?: string | null): string {
  if (!val) return '';
  return val
    .toString()
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .trim();
}

export function extractApiErrorMessage(err: any, fallback: string): string {
  if (!err?.error) return fallback;
  if (typeof err.error === 'string') return err.error;
  if (err.error.error && typeof err.error.error === 'string') return err.error.error;
  if (err.error.message && typeof err.error.message === 'string') return err.error.message;
  if (err.error.detail && typeof err.error.detail === 'string') return err.error.detail;
  if (typeof err.error === 'object') {
    const messages: string[] = [];
    for (const [key, val] of Object.entries(err.error)) {
      if (key === 'success' || key === 'status') continue;
      const text = Array.isArray(val) ? val.join('، ') : String(val);
      messages.push(`${key}: ${text}`);
    }
    if (messages.length > 0) return messages.join(' | ');
  }
  return fallback;
}

export function getUserInitials(name?: string, username?: string): string {
  const clean = (name || username || '').trim();
  if (!clean) return '؟';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + ' ' + parts[1][0]);
  }
  return clean.slice(0, 2);
}

export function findRoleDef(key: string, roleDefinitions: RoleDefinition[]): RoleDefinition {
  return roleDefinitions.find(r => r.key === key) || roleDefinitions[4];
}

export function getExportTooltipForTab(activeSubTab: string): string {
  switch (activeSubTab) {
    case 'projects': return 'خروجی اکسل پروژه‌های مالی';
    case 'sections': return 'خروجی اکسل بخش‌ها و دپارتمان‌ها';
    case 'assignments': return 'خروجی اکسل ماتریس انتساب کاربران و نقش‌ها';
    default: return 'خروجی فایل اکسل';
  }
}

export function getImportTooltipForTab(activeSubTab: string): string {
  switch (activeSubTab) {
    case 'projects': return 'ورودی و ثبت پروژه‌ها از فایل اکسل';
    case 'sections': return 'ورودی و ثبت بخش‌ها از فایل اکسل';
    case 'assignments': return 'ورودی و ثبت انتساب پرسنل از فایل اکسل';
    default: return 'ورودی فایل اکسل';
  }
}

export function loadCollapsedSectionsFromStorage(): Set<number> {
  try {
    const stored = localStorage.getItem('warehouse_expanded_sections');
    if (stored) {
      const ids: number[] = JSON.parse(stored);
      return new Set<number>(ids);
    }
  } catch {
    // Ignore
  }
  return new Set<number>();
}

export function saveCollapsedSectionsToStorage(expandedSectionIds: Set<number>): void {
  try {
    localStorage.setItem('warehouse_expanded_sections', JSON.stringify(Array.from(expandedSectionIds)));
  } catch {
    // Ignore
  }
}

export function pruneCollapsedSections(expandedSectionIds: Set<number>, projectSections: ProjectSection[]): boolean {
  if (!projectSections || projectSections.length === 0) return false;
  const validIds = new Set(projectSections.map(s => s.id).filter((id): id is number => typeof id === 'number'));
  let changed = false;
  for (const id of Array.from(expandedSectionIds)) {
    if (!validIds.has(id)) {
      expandedSectionIds.delete(id);
      changed = true;
    }
  }
  return changed;
}

export function filterAssignmentsList(
  userAssignments: UserSectionAssignment[],
  projectSections: ProjectSection[],
  assignmentProjectFilter: number | null,
  assignmentRoleFilter: string,
  assignmentSearchQuery: string
): UserSectionAssignment[] {
  let list = userAssignments;
  const pFilter = assignmentProjectFilter ? Number(assignmentProjectFilter) : null;
  if (pFilter) {
    list = list.filter(a => {
      if (a.project_id) return Number(a.project_id) === pFilter;
      const sec = projectSections.find(s => s.id === a.section);
      return sec ? Number(sec.project) === pFilter : false;
    });
  }
  if (assignmentRoleFilter && assignmentRoleFilter !== 'all') {
    list = list.filter(a => a.role === assignmentRoleFilter);
  }
  if (assignmentSearchQuery?.trim()) {
    const q = assignmentSearchQuery.trim().toLowerCase();
    list = list.filter(a =>
      (a.user_full_name && a.user_full_name.toLowerCase().includes(q)) ||
      (a.username && a.username.toLowerCase().includes(q)) ||
      (a.section_name && a.section_name.toLowerCase().includes(q)) ||
      (a.project_name && a.project_name.toLowerCase().includes(q)) ||
      (a.role_display && a.role_display.toLowerCase().includes(q))
    );
  }
  return list;
}

export function groupAssignmentsBySectionList(
  projectSections: ProjectSection[],
  userAssignments: UserSectionAssignment[],
  roleDefinitions: RoleDefinition[],
  assignmentProjectFilter: number | null,
  assignmentRoleFilter: string,
  assignmentSearchQuery: string
): SectionGroupedAssignments[] {
  let sections = [...projectSections];
  const pFilter = assignmentProjectFilter ? Number(assignmentProjectFilter) : null;
  if (pFilter) {
    sections = sections.filter(s => Number(s.project) === pFilter);
  }

  const query = assignmentSearchQuery?.trim().toLowerCase();
  const result: SectionGroupedAssignments[] = [];

  for (const sec of sections) {
    const secAssignments = userAssignments.filter(a => {
      const secId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
      return Number(secId) === Number(sec.id) && a.is_active !== false;
    });

    let rolesData = roleDefinitions.map(roleDef => {
      const assigned = secAssignments.filter(a => a.role === roleDef.key);
      return {
        roleDef,
        assignments: assigned
      };
    });

    if (assignmentRoleFilter && assignmentRoleFilter !== 'all') {
      rolesData = rolesData.filter(r => r.roleDef.key === assignmentRoleFilter);
    }

    if (query) {
      const matchesSection = (sec.name && sec.name.toLowerCase().includes(query)) ||
                             (sec.code && sec.code.toLowerCase().includes(query)) ||
                             (sec.project_name && sec.project_name.toLowerCase().includes(query));
      const hasMatchingUser = secAssignments.some(a =>
        (a.user_full_name && a.user_full_name.toLowerCase().includes(query)) ||
        (a.username && a.username.toLowerCase().includes(query)) ||
        (a.role_display && a.role_display.toLowerCase().includes(query))
      );
      if (!matchesSection && !hasMatchingUser) {
        continue;
      }
    }

    result.push({
      section: sec,
      roles: rolesData,
      totalAssignedUsers: secAssignments.length
    });
  }

  return result;
}

export function computeAvailableUsersForQuickAssign(
  section: ProjectSection | null,
  role: string,
  query: string,
  systemUsers: User[],
  userAssignments: UserSectionAssignment[]
): User[] {
  if (!section) return systemUsers;
  const currentSectionId = Number(section.id);
  const currentRole = role;
  const q = query?.trim().toLowerCase() || '';

  const existingUserIds = new Set(
    userAssignments
      .filter(a => {
        const secId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
        return Number(secId) === currentSectionId && a.role === currentRole && a.is_active !== false;
      })
      .map(a => Number(typeof a.user === 'object' ? (a.user as any)?.id : a.user))
  );
  let users = systemUsers.filter(u => u.is_active !== false && !existingUserIds.has(Number(u.id)));
  if (q) {
    users = users.filter(u =>
      (u.first_name && u.first_name.toLowerCase().includes(q)) ||
      (u.last_name && u.last_name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q))
    );
  }
  return users;
}
