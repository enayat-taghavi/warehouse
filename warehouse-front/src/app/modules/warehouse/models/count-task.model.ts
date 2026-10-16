import { Item } from '../../../core/models/item.model';

export type CountTaskStatus = 
  | 'PENDING_COUNT'
  | 'INITIAL_COUNT'
  | 'COUNTED'
  | 'SUPERVISOR_REJECTED'
  | 'MANAGER_REVIEW'
  | 'MANAGER_REJECTED'
  | 'FINAL_APPROVED';

export interface CountTaskHistory {
  id: number;
  task: number;
  action_by: number | null;
  action_type: string;
  counted_balance: string | null;
  note: string | null;
  created_at: string;
  action_by_name?: string;
}

export interface CountTask {
  id: number;
  item: number;
  counter: number;
  supervisor: number | null;
  assigned_manager?: number | null;
  status: CountTaskStatus;
  counted_balance: string | null;
  counter_note: string | null;
  supervisor_note: string | null;
  manager_note: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  modified_by: number | null;
  
  // Serializer method fields & nested objects
  counter_name?: string;
  supervisor_name?: string;
  assigned_manager_name?: string;
  item_details?: Item;
  history?: CountTaskHistory[];
  is_blind?: boolean;
  skip_supervisor?: boolean;
  new_location?: string;

  // ─── فیلدهای Local-First ───
  /** شناسه پایدار سینک (کلید upsert در Dexie) */
  sync_id?: string;
  /** tombstone سرور (فقط در جریان Pull دیده می‌شود) */
  is_deleted?: boolean;
  /** انبار (در Dexie برای پارتیشن ذخیره می‌شود) */
  warehouse_id?: number;
  /** سرور این رکورد را حذف کرده ولی تغییر ارسال‌نشده محلی دارد */
  _serverDeleted?: boolean;

  // توسط offlineInterceptor روی رکوردهای صف‌شده اضافه می‌شود
  _offlinePending?: boolean;
  _offlineId?: number;
}
