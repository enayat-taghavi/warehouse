export interface Item {
  id?: number;
  fa_unic_code: string;
  plpkitem?: string;
  pl?: string;
  po?: string;
  pk_number?: string;
  item_no?: string;
  modifier_tag?: string;
  warehouse: number;
  warehouse_name?: string;
  description?: string;
  unit?: string;
  scope_discipline?: string;
  inventory: number;
  bal4miv: number;
  old_location?: string;
  new_location?: string;
  hov_no?: string;
  hov_date?: string;
  msr_status?: string;
  vendor?: string;
  supplier?: string;
  irn_no?: string;
  item2?: string;
  inventory_status?: string;
  indent?: string;
  remark?: string;
  price_amount?: number;
  currency?: string;
  invoice_file?: string;
  invoice_page?: string;
  customs_field?: string;
  customs_file?: string;
  customs_file_page?: string;
  price_remark?: string;
  my_tag?: string;
  tag_status: string;
  field_status: string;
  doc_status: string;
  has_conflict: boolean;
  is_fragile: boolean;
  is_heavy: boolean;
  needs_qc: boolean;
  assigned_to?: string;
  field_assignee?: string;
  doc_assignee?: string;
  dynamic_data?: { [key: string]: any };
  photos_count?: number;
  primary_thumbnail?: string;
  photos?: ItemPhoto[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  modified_by?: number;
}

export interface ItemPhoto {
  id: number;
  sync_id?: string;
  item: number;
  image?: string;
  medium?: string;
  thumbnail?: string;
  image_url?: string;
  medium_url?: string;
  thumbnail_url?: string;
  caption?: string;
  is_primary: boolean;
  display_order: number;
  file_size?: number;
  width?: number;
  height?: number;
  source_type: 'camera' | 'gallery';
  count_task?: number;
  created_at: string;
  updated_at?: string;
  created_by?: number;
  created_by_name?: string;
  
  // Client-side UI fields
  _previewUrl?: string;
  _isUploading?: boolean;
  _uploadProgress?: number;
  _error?: string;
  /**
   * شناسه رکورد در صف آپلود عکس (photoQueue) — فقط برای عکسی که هنوز به سرور
   * نرسیده. وجودش یعنی این ردیف روی سرور نیست و تلاش مجدد/حذف باید از مسیر صف
   * انجام شود، نه از مسیر API.
   */
  _queueEntryId?: number;
}
