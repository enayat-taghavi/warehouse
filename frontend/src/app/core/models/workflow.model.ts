/**
 * شکل پاسخ‌های API موتور گردش کار (طرح ۲.۳، زیر `api/workflow/`).
 * مرجع: `backend/core/workflow/serializers.py` و `views.py`. تاریخ‌ها هم ISO و هم شمسی (`*_shamsi`) می‌آیند.
 */

export interface WorkflowRef {
  id: number;
  name: string;
}

/** person() سمت سرور: شناسه و نام نمایشی کاربر */
export interface WorkflowPerson {
  id: number;
  name: string;
}

/** اقدام‌های یک کار (ت۱۳): act = تأیید/بررسی/اجرا، return = عودت برای اصلاح، reject = رد قطعی */
export type WorkflowTaskAction = 'act' | 'return' | 'reject' | 'done' | 'seen';

/** کارت یک کار باز در «کارهای من» یا «کارهای بی‌دریافت‌کننده» (ت۱۱، ت۱۹) */
export interface WorkflowTaskCard {
  task_id: number;
  instance_id: number;
  /** نسخهٔ مرحله؛ با اقدام فرستاده می‌شود تا اقدام روی نسخهٔ کهنه 409 بگیرد */
  revision: number;
  workflow_key: string;
  workflow_title_fa: string;
  entity_kind: string;
  entity_id: number;
  step_key: string;
  step_title_fa: string;
  /** approve | review | execute */
  step_kind: string;
  /** برای کارت ارجاع: refer | inform (برابر step_kind) */
  kind?: string;
  actions: WorkflowTaskAction[];
  /** خلاصهٔ اعلام‌شدهٔ ماژول (عنوان، مبلغ و …) */
  summary: Record<string, unknown>;
  /** مسیر صفحهٔ سند که ماژول اعلام کرده (null اگر ماژول نصب نیست) */
  route: string | null;
  company: WorkflowRef | null;
  section: WorkflowRef | null;
  amount: string | null;
  opened_at: string | null;
  opened_at_shamsi: string;
  waiting_hours: number;
  has_recipients: boolean;
  /** «به جانشینی از …» وقتی همهٔ ردیف‌های کاربر از راه جانشینی است */
  on_behalf_of: WorkflowPerson | null;
  valid_from: string | null;
  valid_to: string | null;
  valid_from_shamsi: string;
  valid_to_shamsi: string;
  can_cancel: boolean;
  /** مسیر کار: مرحلهٔ گردش (step) یا ارجاع (referral)؛ نبودن یعنی step */
  track?: 'step' | 'referral';
  instruction?: string;
  due_at?: string | null;
  due_at_shamsi?: string;
  referred_by?: WorkflowPerson | null;
  parent_task_id?: number | null;
  /** زمان خواندن کارت ارجاع؛ null یعنی نخوانده */
  read_at?: string | null;
}

export interface WorkflowTaskPage {
  count: number;
  results: WorkflowTaskCard[];
  page: number;
  page_size: number;
}

export interface WorkflowSkippedStep {
  step: string;
  step_title_fa: string;
  /** threshold | creator_level | no_recipient | no_second_approval | version_removed | not_required */
  reason: string;
  reason_fa: string;
}

/** یک قدم سابقهٔ گردش (ت۱۴) */
export interface WorkflowHistoryStep {
  id: number;
  action: string;
  action_fa: string;
  actor: WorkflowPerson | null;
  /** «سامانه» برای قدم بی‌انجام‌دهنده */
  actor_name: string;
  on_behalf_of: WorkflowPerson | null;
  as_superuser: boolean;
  from_step: string | null;
  from_step_title_fa: string;
  to_step: string | null;
  to_step_title_fa: string;
  reason: string;
  skipped: WorkflowSkippedStep[];
  at: string | null;
  at_shamsi: string;
}

export interface WorkflowHistoryInstance {
  instance_id: number;
  workflow_key: string;
  workflow_title_fa: string;
  version: number;
  status: string;
  status_fa: string;
  current_step: string | null;
  current_step_title_fa: string;
  revision: number;
  created_by: WorkflowPerson | null;
  company: WorkflowRef | null;
  section: WorkflowRef | null;
  amount: string | null;
  submitted_at: string | null;
  submitted_at_shamsi: string;
  closed_at: string | null;
  closed_at_shamsi: string;
  /** ثبت‌کننده، گردش باز، و هنوز نفر دیگری اقدام نکرده */
  can_cancel: boolean;
  /** کار باز کسی را برای اقدام ندارد: no_holder = کسی این نقش را ندارد، creator_only = فقط ثبت‌کننده دارد؛ '' = منتظر نیست */
  wait_reason?: WorkflowWaitReason | '';
  steps: WorkflowHistoryStep[];
}

/** GET history/?kind=&id= */
export interface WorkflowHistory {
  entity_kind: string;
  entity_id: number;
  instances: WorkflowHistoryInstance[];
}

/** پاسخ اقدام روی کار و لغو گردش */
export interface WorkflowInstanceState {
  instance_id: number;
  status: string;
  status_fa: string;
  current_step: string | null;
  current_step_title_fa: string;
  revision: number;
}

export interface WorkflowDefinitionStep {
  key: string;
  title_fa: string;
  kind: string;
  role: string;
  actions: WorkflowTaskAction[];
}

export interface WorkflowDefinition {
  key: string;
  version: number;
  entity_kind: string;
  title_fa: string;
  has_amount: boolean;
  steps: WorkflowDefinitionStep[];
}

/** سقف مبلغ یک مرحلهٔ «تأیید» در شرکت یا بخش */
export interface WorkflowThreshold {
  id: number;
  workflow_key: string;
  workflow_title_fa: string;
  step_key: string;
  step_title_fa: string;
  company_id: number | null;
  section: WorkflowRef | null;
  amount: string;
  updated_by: WorkflowPerson | null;
  updated_at: string | null;
  updated_at_shamsi: string;
}

/** POST thresholds/ (ایجاد یا جایگزینی سقف همان مرحله و هدف) */
export interface WorkflowThresholdInput {
  company: number;
  section?: number | null;
  workflow_key: string;
  step_key: string;
  amount: string | number;
}

/** مدت‌های یادآوری و «خبر به بالاتر» شرکت (ساعت؛ ۱ ≤ یادآوری < خبر به بالاتر ≤ ۷۲۰) */
export interface WorkflowCompanySettings {
  company_id: number;
  reminder_hours: number;
  escalation_hours: number;
  /** امکان تأیید رسید پرداخت توسط ایجادکننده */
  creator_may_approve_own: boolean;
  /** هنوز ذخیره نشده و پیش‌فرض است */
  is_default: boolean;
  updated_at: string | null;
}

// ─── سیاست «وقتی کسی برای مرحله نیست» (طرح نبودن نفر ۱۴۰۵-۰۸) ───

export type WorkflowWaitReason = 'no_holder' | 'creator_only';

/** skip = «رد شود»، wait = «منتظر بماند» */
export type WorkflowRoleAction = 'skip' | 'wait';

/** own = تنظیم جدای همین گردش، company = پیش‌فرض شرکت، default = پیش‌فرض سامانه، locked = قفل مرحله (س۱) */
export type WorkflowPolicySource = 'own' | 'company' | 'default' | 'locked';

/** گیرندهٔ خبر انتظار: role_assigners = تعیین‌کنندگان نقش، users = کاربران انتخاب‌شده */
export type WorkflowNotifyMode = 'role_assigners' | 'users';

export interface WorkflowPolicyRole {
  role: string;
  role_title_fa: string;
  /** مقدار ذخیره‌شده در همین سطح؛ null = از سطح بالاتر */
  value: WorkflowRoleAction | null;
  effective: WorkflowRoleAction;
  source: WorkflowPolicySource;
}

export interface WorkflowPolicyFlag {
  value: boolean | null;
  effective: boolean;
  source: WorkflowPolicySource;
}

export interface WorkflowPolicyNotify {
  mode: WorkflowNotifyMode | null;
  user_ids: number[] | null;
  effective_mode: WorkflowNotifyMode;
  effective_user_ids: number[];
  source: WorkflowPolicySource;
}

export interface WorkflowPolicyStep {
  key: string;
  title_fa: string;
  kind: string;
  role: string;
  role_title_fa: string;
  /** مرحلهٔ پرداخت: «رد شود» = تأییدشده، پرداخت بیرون از سامانه */
  payment: boolean;
  /** مرحلهٔ قفل (س۱): مقدار ثابت مرحله ('wait')، یا '' / null اگر قفل نیست؛ تنظیم آن را عوض نمی‌کند */
  locked: WorkflowRoleAction | '' | null;
  effective: WorkflowRoleAction;
  source: WorkflowPolicySource;
}

export interface WorkflowPolicyLevel {
  roles: WorkflowPolicyRole[];
  creator_may_approve_own: WorkflowPolicyFlag;
  notify: WorkflowPolicyNotify;
}

export interface WorkflowPolicyWorkflow extends WorkflowPolicyLevel {
  key: string;
  title_fa: string;
  /** true = «تنظیم جدا»، false = «پیش‌فرض شرکت» */
  has_own_row: boolean;
  steps: WorkflowPolicyStep[];
}

/** GET company-policies/<company>/ */
export interface WorkflowCompanyPolicies {
  company_id: number;
  role_defaults: Record<string, WorkflowRoleAction>;
  company_default: WorkflowPolicyLevel;
  workflows: WorkflowPolicyWorkflow[];
  /** گزینه‌های «کاربران انتخاب‌شده» برای خبر انتظار: کاربران فعال و عضو همین شرکت */
  notify_candidates: WorkflowPerson[];
}

/** کل ردیف پیشنهادی (جایگزین ردیف ذخیره‌شده)؛ کلید نبوده یا null = از سطح بالاتر */
export interface WorkflowPolicyValues {
  role_actions?: Record<string, WorkflowRoleAction | null>;
  creator_may_approve_own?: boolean | null;
  notify_mode?: WorkflowNotifyMode | null;
  notify_user_ids?: number[] | null;
}

/** بدنهٔ POST preview/؛ workflow_key '' = پیش‌فرض شرکت */
export type WorkflowPolicyPreviewInput =
  | { workflow_key: string; values: WorkflowPolicyValues }
  | { workflow_key: string; reset: true };

export interface WorkflowPolicyPreviewSample {
  instance_id: number;
  workflow_key: string;
  title: string;
  step_key: string;
  /** advance | recipients_changed | waiting */
  effect: string;
}

export interface WorkflowPolicyCounts {
  /** سندهایی که جلو می‌روند */
  advance: number;
  /** سندهایی که گیرنده‌شان عوض می‌شود */
  recipients_changed: number;
  /** سندهایی که منتظر می‌شوند */
  waiting: number;
}

export interface WorkflowPolicyPreview {
  counts: WorkflowPolicyCounts;
  per_workflow: Record<string, WorkflowPolicyCounts>;
  /** تا ۲۰ نمونه */
  samples: WorkflowPolicyPreviewSample[];
  /** برای confirm_token ذخیره */
  token: string;
}

/** بدنهٔ 409 preview_stale: شمارها عوض شد؛ پیش‌نمایش تازه دوباره نشان داده شود */
export interface WorkflowPolicyStaleError {
  code: 'preview_stale';
  detail?: string;
  preview: WorkflowPolicyPreview;
}

/** جانشین موقت (ت۱۰) */
export interface WorkflowSubstitute {
  id: number;
  principal: WorkflowPerson;
  substitute: WorkflowPerson;
  company: WorkflowRef | null;
  start_date: string;
  end_date: string;
  start_date_shamsi: string;
  end_date_shamsi: string;
  created_by: WorkflowPerson | null;
  created_at: string | null;
  revoked_at: string | null;
  revoked_by: WorkflowPerson | null;
  is_active: boolean;
  is_current: boolean;
  can_revoke: boolean;
}

/** POST substitutes/ ؛ تاریخ‌ها میلادی ISO (YYYY-MM-DD). principal_id فقط برای مدیر */
export interface WorkflowSubstituteInput {
  substitute_id: number;
  start_date: string;
  end_date: string;
  principal_id?: number | null;
  company_id?: number | null;
}

/** بدنهٔ خطای موتور: `{code, detail}` */
export interface WorkflowErrorBody {
  code?: string;
  detail?: string;
}

/** کد 409 «این کار را نفر دیگری انجام داده است» (ت۱۳) */
export const WORKFLOW_TASK_ALREADY_DONE = 'task_already_done';

/** رویداد وب‌سوکت کار (`type_str = workflow_task`، backend/core/workflow/realtime.py) */
export interface WorkflowTaskEvent {
  workflow_event: string;
  message: string;
  task_id: number | null;
  instance_id: number | null;
  workflow_key: string | null;
  entity_kind: string | null;
  entity_id: number | null;
  step_key: string | null;
  company_id: number | null;
  section_id: number | null;
  actor_id: number | null;
  to_superusers?: boolean;
}

/**
 * نتیجهٔ اقدام روی کار از سرویس «کارهای من»:
 * - done: سرور پذیرفت؛
 * - queued: سرور در دسترس نبود و اقدام در صف آفلاین ماند (بعد از اتصال فرستاده می‌شود)؛
 * - already-done: 409، نفر دیگری کار را انجام داده یا مرحله عوض شده است؛
 * - rejected: سرور رد کرد (400/403/404)؛ `code` مثلاً `reason_required` برای خطای کنار فیلد دلیل.
 */
export type WorkflowActionOutcome =
  | { status: 'done'; state: WorkflowInstanceState }
  | { status: 'queued' }
  | { status: 'already-done'; message: string }
  | { status: 'rejected'; httpStatus: number; code: string; message: string };

/** کاری که در همین دستگاه انجامش رد شد چون نفر دیگری زودتر انجامش داده بود (ت۱۳) */
export interface WorkflowTaskNotice {
  task_id: number;
  /** آخرین کارت شناخته‌شدهٔ همان کار (برای نمایش عنوان)؛ اگر در حافظه نبود null */
  card: WorkflowTaskCard | null;
  message: string;
  at: number;
}
