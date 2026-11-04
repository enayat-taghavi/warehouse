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
  kind?: LetterKind;
  company?: number;
  client_temp_id?: string;
  revision?: number;
  subject: string;
  body: LetterBlock[];
  confidentiality: LetterConfidentiality;
  sign_mode: LetterSignMode;
  project: number | null;
  recipients: LetterRecipientRow[];
  signers: LetterSignerInput[];
}

// ─── فیلترهای فهرست (در آدرس صفحه) ─────────────────────────────────────────────────────
export type LetterTab = 'inbox' | 'sent' | 'drafts' | 'all' | 'projects';
export const LETTER_TABS: readonly LetterTab[] = ['inbox', 'sent', 'drafts', 'all', 'projects'];

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

/**
 * زیرزبانه ← وضعیت API. بک‌اند هنوز فیلتر «نویسنده/گیرنده» ندارد (مسئلهٔ باز برای ل-ز):
 * «کارتابل» نامه‌های ثبت‌شده، «فرستاده‌ها» ارسال‌شده‌ها و «پیش‌نویس‌ها» پیش‌نویس‌اند.
 */
export const TAB_STATUS: Record<LetterTab, LetterStatus | ''> = {
  inbox: 'registered', sent: 'sent', drafts: 'draft', all: '', projects: '',
};
