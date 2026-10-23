export interface FieldPermissionConfig {
  key: string;
  default_label: string;
  custom_label?: string;
  category: 'basic' | 'specs' | 'inventory' | 'location' | 'procurement' | 'financial' | 'dynamic';
  data_type: 'text' | 'number' | 'textarea' | 'date' | 'boolean';
  visible: boolean;
  editable: boolean;
  default_visible: boolean;
  default_editable: boolean;
  is_dynamic?: boolean;
}

export const CATEGORY_LABELS: Record<string, string> = {
  all: 'همه دسته‌ها',
  basic: 'شناسه‌ها و کدها',
  specs: 'مشخصات کالا',
  inventory: 'موجودی و شمارش',
  location: 'مکان و انبارداری',
  procurement: 'بازرگانی و خرید',
  financial: 'اسناد و مالی',
  dynamic: 'فیلدهای پویا (انبار)'
};

export const DEFAULT_ITEM_FIELD_PERMISSIONS: FieldPermissionConfig[] = [
  // ── 1. شناسه‌ها و کدها (Basic) ─────────────────────────────────────────────
  {
    key: 'fa_unic_code',
    default_label: 'کد یکتا (FA-UNIC)',
    category: 'basic',
    data_type: 'text',
    visible: true,
    editable: false,
    default_visible: true,
    default_editable: false
  },
  {
    key: 'tag',
    default_label: 'شماره تگ کالا',
    category: 'basic',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'pk_number',
    default_label: 'پکیج (PK)',
    category: 'basic',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'my_tag',
    default_label: 'تگ‌ها (برچسب‌های سفارشی)',
    category: 'basic',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },

  // ── 2. مشخصات کالا (Specs) ────────────────────────────────────────────────
  {
    key: 'description',
    default_label: 'شرح کالا',
    category: 'specs',
    data_type: 'textarea',
    visible: true,
    editable: false,
    default_visible: true,
    default_editable: false
  },
  {
    key: 'unit',
    default_label: 'واحد سنجش',
    category: 'specs',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'size',
    default_label: 'سایز اصلی',
    category: 'specs',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'scope_discipline',
    default_label: 'دیسیپلین کاری',
    category: 'specs',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'remark',
    default_label: 'ملاحظات',
    category: 'specs',
    data_type: 'textarea',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'desc_from_standard_system',
    default_label: 'شرح در سامانه یکنواخت',
    category: 'specs',
    data_type: 'textarea',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'unit_from_standard_system',
    default_label: 'واحد در سامانه یکنواخت',
    category: 'specs',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },

  // ── 3. موجودی و شمارش (Inventory) ──────────────────────────────────────────
  {
    key: 'counted_qty',
    default_label: 'تعداد شمارش شده',
    category: 'inventory',
    data_type: 'number',
    visible: true,
    editable: true,
    default_visible: true,
    default_editable: true
  },
  {
    key: 'counter_note',
    default_label: 'توضیحات انبارگردان',
    category: 'inventory',
    data_type: 'textarea',
    visible: true,
    editable: true,
    default_visible: true,
    default_editable: true
  },
  {
    key: 'inventory',
    default_label: 'موجودی فیزیکی (سیستمی)',
    category: 'inventory',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'bal4miv',
    default_label: 'موجودی مجاز MIV',
    category: 'inventory',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },

  // ── 4. مکان و انبارداری (Location) ─────────────────────────────────────────
  {
    key: 'new_location',
    default_label: 'لوکیشن انبار',
    category: 'location',
    data_type: 'text',
    visible: true,
    editable: false,
    default_visible: true,
    default_editable: false
  },
  {
    key: 'field_status',
    default_label: 'وضعیت میدانی',
    category: 'location',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'has_conflict',
    default_label: 'دارای مغایرت',
    category: 'location',
    data_type: 'boolean',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },

  // ── 5. بازرگانی و خرید (Procurement) ─────────────────────────────────────────
  {
    key: 'pl',
    default_label: 'پکینگ لیست (PL)',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'po',
    default_label: 'سفارش خرید (PO)',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'vendor',
    default_label: 'سازنده (Vendor)',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'supplier',
    default_label: 'تامین‌کننده (Supplier)',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'indent',
    default_label: 'تقاضای خرید (INDENT)',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'irn_no',
    default_label: 'شماره IRN',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'hov_no',
    default_label: 'شماره HOV',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'hov_date',
    default_label: 'تاریخ HOV',
    category: 'procurement',
    data_type: 'date',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'msr_status',
    default_label: 'وضعیت MSR',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'request_number_of_table',
    default_label: 'شماره درخواست جدول',
    category: 'procurement',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },

  // ── 6. اسناد و مالی (Financial) ───────────────────────────────────────────
  {
    key: 'price_amount',
    default_label: 'قیمت واحد (UnitPrice)',
    category: 'financial',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'similar_unit_price',
    default_label: 'قیمت کالای مشابه',
    category: 'financial',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'total_value',
    default_label: 'ارزش کل',
    category: 'financial',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'currency',
    default_label: 'ارز',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'invoice_type',
    default_label: 'نوع فاکتور',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'invoice_date',
    default_label: 'تاریخ فاکتور',
    category: 'financial',
    data_type: 'date',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'inv_rti_number',
    default_label: 'شماره RTI فاکتور',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'added_rti_no',
    default_label: 'شماره RTI افزوده‌شده',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'page_row',
    default_label: 'ردیف در فاکتور',
    category: 'financial',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'invoice_page',
    default_label: 'صفحه فاکتور',
    category: 'financial',
    data_type: 'number',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'doc_supplier',
    default_label: 'تامین‌کننده فاکتور (Supplier)',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'folder_address',
    default_label: 'مسیر پوشه اسناد',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'hyperlink',
    default_label: 'هایپرلینک اسناد',
    category: 'financial',
    data_type: 'text',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'stamp',
    default_label: 'وضعیت مهر اسناد',
    category: 'financial',
    data_type: 'boolean',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'signature',
    default_label: 'وضعیت امضای اسناد',
    category: 'financial',
    data_type: 'boolean',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  },
  {
    key: 'worker_note',
    default_label: 'یادداشت کارشناس مالی',
    category: 'financial',
    data_type: 'textarea',
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  }
];

export const DEFAULT_COUNTER_FIELD_PERMISSIONS = DEFAULT_ITEM_FIELD_PERMISSIONS;

export const DEFAULT_DOC_FIELD_PERMISSIONS: FieldPermissionConfig[] = DEFAULT_ITEM_FIELD_PERMISSIONS.map(f => {
  // فیلدهای اطلاعاتی پیش‌فرض (فقط خواندنی)
  if (['fa_unic_code', 'description', 'po', 'unit', 'new_location'].includes(f.key)) {
    return {
      ...f,
      visible: true,
      editable: false,
      default_visible: true,
      default_editable: false
    };
  }

  // فیلدهای فرم مالی پیش‌فرض (قابل ویرایش)
  if ([
    'added_rti_no',
    'inv_rti_number',
    'invoice_type',
    'invoice_date',
    'invoice_page',
    'page_row',
    'doc_supplier',
    'total_value',
    'price_amount',
    'similar_unit_price',
    'currency',
    'folder_address',
    'stamp',
    'signature',
    'worker_note'
  ].includes(f.key)) {
    return {
      ...f,
      visible: true,
      editable: true,
      default_visible: true,
      default_editable: true
    };
  }

  // سایر فیلدها در حالت پیش‌فرض مخفی هستند
  return {
    ...f,
    visible: false,
    editable: false,
    default_visible: false,
    default_editable: false
  };
});

/**
 * ادغام تنظیمات ذخیره‌شده با تعاریف پیش‌فرض و فیلدهای پویا
 */
export function mergeFieldPermissions(
  savedConfig: Record<string, { visible?: boolean; editable?: boolean; custom_label?: string }> | null | undefined,
  dynamicFields: any[] = [],
  defaultPermissions: FieldPermissionConfig[] = DEFAULT_ITEM_FIELD_PERMISSIONS
): FieldPermissionConfig[] {
  const result: FieldPermissionConfig[] = defaultPermissions.map(f => {
    const saved = savedConfig?.[f.key];
    return {
      ...f,
      custom_label: saved?.custom_label ?? '',
      visible: saved?.visible !== undefined ? saved.visible : f.default_visible,
      editable: saved?.editable !== undefined ? saved.editable : f.default_editable
    };
  });

  // ادغام فیلدهای پویای فعال
  if (Array.isArray(dynamicFields)) {
    dynamicFields.forEach(df => {
      const fieldKey = `dyn_${df.name}`;
      const saved = savedConfig?.[fieldKey];
      result.push({
        key: fieldKey,
        default_label: df.label || df.name,
        custom_label: saved?.custom_label ?? '',
        category: 'dynamic',
        data_type: df.field_type === 'number' ? 'number' : df.field_type === 'boolean' ? 'boolean' : df.field_type === 'date' ? 'date' : 'text',
        visible: saved?.visible !== undefined ? saved.visible : false,
        editable: saved?.editable !== undefined ? saved.editable : false,
        default_visible: false,
        default_editable: false,
        is_dynamic: true
      });
    });
  }

  return result;
}

/**
 * ادغام تنظیمات ذخیره‌شده کارتابل مالی
 */
export function mergeDocFieldPermissions(
  savedConfig: Record<string, { visible?: boolean; editable?: boolean; custom_label?: string }> | null | undefined,
  dynamicFields: any[] = []
): FieldPermissionConfig[] {
  return mergeFieldPermissions(savedConfig, dynamicFields, DEFAULT_DOC_FIELD_PERMISSIONS);
}

