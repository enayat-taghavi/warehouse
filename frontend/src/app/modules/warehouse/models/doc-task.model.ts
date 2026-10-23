export type DocTaskStatus =
  | 'PENDING_DOC'
  | 'DOC_PROCESSED'
  | 'DOC_SUPERVISOR_REJECTED'
  | 'DOC_MANAGER_REVIEW'
  | 'DOC_MANAGER_REJECTED'
  | 'DOC_FINAL_APPROVED';

export type InvoiceType = 'formal' | 'domestic' | 'foreign' | 'consignment';
export type CurrencyCode = 'IRR' | 'USD' | 'EUR' | 'OTHER';

export interface DocTaskHistory {
  id: number;
  task: number;
  action_by: number | null;
  action_by_name?: string;
  action_type: string;
  note: string | null;
  created_at: string;
}

export interface DocTask {
  id: number;
  sync_id: string;
  item: number;
  item_details?: {
    id: number;
    fa_unic_code: string;
    en_unic_code?: string;
    description?: string;
    new_location?: string;
    old_location?: string;
    po?: string;
    unit?: string;
    warehouse_name?: string;
    name?: string;
    photos_count?: number;
    primary_thumbnail?: string | null;
  };
  doc_worker: number | null;
  doc_worker_name?: string;
  doc_supervisor: number | null;
  doc_supervisor_name?: string;
  assigned_manager: number | null;
  assigned_manager_name?: string;
  status: DocTaskStatus;
  skip_supervisor: boolean;
  worker_note: string | null;
  supervisor_note: string | null;
  manager_note: string | null;

  // ─── فیلدهای مالی ───
  added_rti_no: string | null;
  inv_rti_number: string | null;
  invoice_type: InvoiceType | null;
  invoice_date: string | null;
  invoice_page: number | null;
  page_row: number | null;
  doc_supplier: string | null;
  total_value: string | null;
  price_amount: string | null;
  similar_unit_price: string | null;
  currency: CurrencyCode | null;
  folder_address: string | null;
  stamp: boolean;
  signature: boolean;

  // ─── Audit ───
  created_at: string;
  updated_at: string;
  created_by: number | null;
  modified_by: number | null;

  // ─── Local-First ───
  warehouse_id?: number;
  is_deleted?: boolean;
  _offlinePending?: boolean;
  _offlineId?: number;

  history?: DocTaskHistory[];
}

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  formal:      'رسمی/مالیاتی',
  domestic:    'خریدهای داخلی',
  foreign:     'خریدهای خارجی',
  consignment: 'امانی',
};

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  IRR:   'ریال',
  USD:   'دلار',
  EUR:   'یورو',
  OTHER: 'سایر',
};
