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
  /** کار باز کسی را برای اقدام ندارد (مثلاً ثبت‌کننده تنها دارندهٔ نقش مرحله است)؛ فقط مدیر کل اقدام می‌کند */
  waiting_for_superuser?: boolean;
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
  /** هنوز ذخیره نشده و پیش‌فرض است */
  is_default: boolean;
  updated_at: string | null;
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
