/**
 * مدل‌های فرانت ماژول نامه‌ها (ل-و) — هم‌شکل خروجی API بک‌اند (`backend/modules/letters/letters/serializers.py`).
 */

export type LetterKind = 'internal' | 'outgoing' | 'incoming' | 'minutes' | 'circular';
export type LetterStatus = 'draft' | 'signing' | 'registered' | 'sent' | 'archived' | 'received' | 'void';
export type LetterConfidentiality = 'normal' | 'confidential' | 'secret';
export type LetterSignMode = 'electronic' | 'wet';

/** نوع سند در رویداد زندهٔ «سند تغییر کرد» و رجیستری پیوست */
export const LETTER_DOC_TYPE = 'letters_letter';

export const LETTER_KIND_LABELS: Record<LetterKind, string> = {
  internal: 'داخلی',
  outgoing: 'صادره',
  incoming: 'وارده',
  minutes: 'صورت‌جلسه',
  circular: 'بخشنامه',
};

export const LETTER_STATUS_LABELS: Record<LetterStatus, string> = {
  draft: 'پیش‌نویس',
  signing: 'در امضا',
  registered: 'ثبت‌شده',
  sent: 'ارسال‌شده',
  archived: 'بایگانی',
  received: 'دریافت‌شده',
  void: 'باطل',
};

/** رنگ نشان وضعیت نامه (برای app-status-badge) */
export const LETTER_STATUS_COLOR: Record<LetterStatus, 'green' | 'blue' | 'amber' | 'rose' | 'slate' | 'indigo'> = {
  draft: 'slate', signing: 'amber', registered: 'blue', sent: 'indigo', archived: 'slate', received: 'blue', void: 'rose',
};

export const LETTER_CONFIDENTIALITY_LABELS: Record<LetterConfidentiality, string> = {
  normal: 'عادی',
  confidential: 'محرمانه',
  secret: 'سری',
};

export const LETTER_SIGN_MODE_LABELS: Record<LetterSignMode, string> = {
  electronic: 'امضای الکترونیکی',
  wet: 'امضای زنده',
};

// ─── متن بلوکی (ن۱۴) ───────────────────────────────────────────────────────────────────
export const LETTER_MAX_BLOCKS = 200;
export const LETTER_MAX_CHARS = 100_000;

export type LetterAlign = 'right' | 'center' | 'justify';
export interface LetterRun { text: string; bold?: boolean }
export interface LetterParagraphBlock { type: 'paragraph'; align: LetterAlign; runs: LetterRun[] }
export interface LetterListBlock { type: 'list'; style: 'ordered' | 'bullet'; items: LetterRun[][] }
export interface LetterTableBlock { type: 'table'; header: boolean; rows: string[][] }
export type LetterBlock = LetterParagraphBlock | LetterListBlock | LetterTableBlock;

export function runsText(runs: LetterRun[] | undefined): string {
  return (runs || []).map(r => r.text || '').join('');
}

/** شمار نویسه‌های متن بلوکی، با همان قاعدهٔ سرور (همهٔ متن‌ها). */
export function countBlockChars(blocks: readonly LetterBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'paragraph') n += runsText(b.runs).length;
    else if (b.type === 'list') b.items.forEach(it => (n += runsText(it).length));
    else b.rows.forEach(row => row.forEach(cell => (n += (cell || '').length)));
  }
  return n;
}

// ─── API ────────────────────────────────────────────────────────────────────────────────
export interface UserBrief { id: number; name: string }

export interface LetterRow {
  id: number;
  company: number;
  kind: LetterKind;
  subject: string;
  status: LetterStatus;
  confidentiality: LetterConfidentiality;
  number_display: string;
  registered_at: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  response_due_at: string | null;
  project: number | null;
  project_title: string | null;
  author: UserBrief | null;
  /** ل-ز: نام گیرنده‌ها و رونوشت‌ها */
  recipients_brief?: { role: 'to' | 'cc'; name: string }[];
  edit_lock?: { locked: boolean; by: UserBrief | null; until: string | null };
}

export interface LetterRecipientRow {
  id?: number;
  role: 'to' | 'cc';
  target_type: 'user' | 'section' | 'party' | 'text';
  user?: number | null;
  section_id?: number | null;
  party?: number | null;
  party_name?: string;
  /** ل-ز: نام نمایشی گیرندهٔ کاربری */
  user_name?: string;
  name_text?: string;
  title_text?: string;
}

export interface LetterDraftCopy {
  id: number;
  subject: string;
  body: LetterBlock[];
  reason: string;
  created_at: string;
  created_by: number;
}

export interface LetterDetail extends LetterRow {
  body: LetterBlock[];
  sign_mode: LetterSignMode;
  recipients: LetterRecipientRow[];
  signers: { id: number; user: UserBrief; order: number; title_text: string; status: string }[];
  draft_copies: LetterDraftCopy[];
  can_edit: boolean;
  /** فقط در پاسخ ویرایش: سرور متن را به‌جای اعمال، در نسخهٔ ناهمگام نگه داشت (ن۱۱) */
  conflict?: boolean;
  conflict_reason?: string;
  draft_copy_id?: number | null;
  duplicate?: boolean;
  locked_by_other?: boolean;
}

export interface LetterPage { count: number; next: string | null; previous: string | null; results: LetterRow[] }

export interface LetterParty {
  id: number;
  company: number;
  kind: 'person' | 'legal';
  name: string;
  national_id: string | null;
}

export interface LetterProject { id: number; company: number; code: string; name: string; is_active: boolean; letter_count: number }

export interface LetterSignerInput { user: number; title_text?: string }

/** بدنهٔ ساخت و ویرایش پیش‌نویس (`LetterWriteSerializer`) */
export interface LetterWritePayload {
  /** «جایگزین کن»: سرور متن فعلی خود را پیش از بازنویسی نسخهٔ ناهمگام می‌کند (ل-ط) */
  keep_server_copy?: boolean;
  kind?: LetterKind;
  company?: number;
  client_temp_id?: string;
  revision?: number;
  subject: string;
  body: LetterBlock[];
  confidentiality?: LetterConfidentiality;
  sign_mode?: LetterSignMode;
  project?: number | null;
  recipients?: LetterRecipientRow[];
  signers?: LetterSignerInput[];
  external_number?: string;
  external_date?: string | null;
  sender_party?: number | null;
}

// ─── فیلترهای فهرست (در آدرس صفحه) ─────────────────────────────────────────────────────
export type LetterTab = 'inbox' | 'sent' | 'drafts' | 'all' | 'projects' | 'circulars';
export const LETTER_TABS: readonly LetterTab[] = ['inbox', 'sent', 'drafts', 'all', 'projects', 'circulars'];

export interface LetterFilters {
  tab: LetterTab;
  kind: LetterKind | '';
  status: LetterStatus | '';
  confidentiality: LetterConfidentiality | '';
  q: string;
  project: number | null;
  due: '' | 'overdue' | 'today';
  page: number;
}

export const EMPTY_LETTER_FILTERS: LetterFilters = {
  tab: 'inbox', kind: '', status: '', confidentiality: '', q: '', project: null, due: '', page: 1,
};

/** زیرزبانه ← وضعیت API (فقط «پیش‌نویس‌ها» وضعیت ثابت دارد). */
export const TAB_STATUS: Record<LetterTab, LetterStatus | ''> = {
  inbox: '', sent: '', drafts: 'draft', all: '', projects: '', circulars: '',
};

/**
 * زیرزبانه ← فیلترهای شخصی API (ل-ز): «کارتابل» نامه‌هایی که به من رسیده یا به من ارجاع شده‌اند،
 * «فرستاده‌ها» و «پیش‌نویس‌ها» نامه‌هایی که نویسنده یا هم‌نویسنده‌شان هستم.
 */
export const TAB_PARAMS: Record<LetterTab, Record<string, string>> = {
  inbox: { to_me: '1' }, sent: { mine: '1' }, drafts: { mine: '1' }, all: {}, projects: {}, circulars: {},
};

// ─── ل-ز: نمایش نامه، درخت ارجاع، دبیرخانه و بخشنامه ─────────────────────────────────────
/** کنش‌هایی که سرور برای همین کاربر مجاز می‌داند (`actions` جزئیات نامه) */
export type LetterAction = 'edit' | 'submit' | 'sign' | 'return' | 'register' | 'send' | 'archive' | 'unarchive' | 'void' | 'refer' | 'print' | 'attach' | 'upload_scan';

export interface LetterViewDetail extends LetterDetail {
  actions?: LetterAction[];
  external_number?: string;
  external_date?: string | null;
  void_reason?: string;
}

export interface ReferralNode {
  task_id: number;
  parent_task_id: number | null;
  kind: string;
  kind_fa: string;
  target_user: UserBrief | null;
  referred_by: UserBrief | null;
  instruction: string;
  reply: string;
  due_at: string | null;
  is_open: boolean;
  outcome: string;
  outcome_fa: string;
  opened_at: string | null;
  closed_at: string | null;
  can_close?: boolean;
}

export interface ReferralTree { instance_id: number | null; referrals: ReferralNode[]; can_refer: boolean }

/** گره درخت ساخته‌شده در فرانت از فهرست تخت با والد */
export interface ReferralTreeNode { node: ReferralNode; children: ReferralTreeNode[]; depth: number }

export function buildReferralTree(rows: readonly ReferralNode[]): ReferralTreeNode[] {
  const byId = new Map<number, ReferralTreeNode>();
  rows.forEach(r => byId.set(r.task_id, { node: r, children: [], depth: 0 }));
  const roots: ReferralTreeNode[] = [];
  rows.forEach(r => {
    const item = byId.get(r.task_id)!;
    const parent = r.parent_task_id != null ? byId.get(r.parent_task_id) : undefined;
    // والد نادیدنی یا ریشه: در بالاترین سطح
    if (parent && parent !== item) parent.children.push(item);
    else roots.push(item);
  });
  const setDepth = (items: ReferralTreeNode[], depth: number): void =>
    items.forEach(i => { i.depth = depth; setDepth(i.children, depth + 1); });
  setDepth(roots, 0);
  return roots;
}

export interface ReferPayload {
  targets: number[];
  kind: 'refer' | 'inform';
  instruction: string;
  due_at: string | null;
  parent_task?: number | null;
}

export interface RegisterRow {
  id: number;
  kind: LetterKind;
  status: LetterStatus;
  number_display: string;
  registered_at: string | null;
  confidentiality: LetterConfidentiality;
  external_number: string;
  covered: boolean;
  subject: string;
  author: UserBrief | null;
}

export interface CircularRow extends LetterRow { is_read: boolean }
export interface AudienceEntry { scope: 'company' | 'section'; section_id?: number | null; section_name?: string }

/** ردیف تنظیم شرکت (`/settings/company/<id>/?module=letters`، ل-ح) */
export interface CompanySettingRow<T = unknown> {
  module: string;
  key: string;
  type: string;
  title_fa: string;
  default: T;
  value: T;
  is_default: boolean;
  can_edit: boolean;
}

/** پیام خطای API (detail، message یا نخستین خطای فیلد) */
export function errorText(body: any): string {
  if (!body) return '';
  if (typeof body === 'string') return body.length < 300 ? body : '';
  if (typeof body.detail === 'string') return body.detail;
  if (typeof body.message === 'string') return body.message;
  for (const value of Object.values(body)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return '';
}
