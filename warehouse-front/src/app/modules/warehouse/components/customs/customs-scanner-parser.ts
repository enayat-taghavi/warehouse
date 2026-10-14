import { FieldPermissionConfig } from '../../../../core/models/field-config.model';

export interface RawParsedTable {
  headers: string[];
  mappedKeys: (string | null)[];
  rows: Record<string, string>[];
  detectedRowSep: string;
  detectedColSep: string;
}

export class CustomsScannerParser {
  /**
   * نرمال‌سازی ارقام فارسی/عربی و حذف کاراکترهای نامرئی مخرب
   */
  static cleanString(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/[\uFEFF\u200B\u200E\u200F\u00A0]/g, '') // کاراکترهای با عرض صفر و فضاهای خاص
      .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .trim();
  }

  /**
   * حذف علائم گیومه احتمالی در ابتدا و انتها
   */
  static unwrapQuotes(text: string): string {
    let clean = text.trim();
    if (clean.startsWith('«') && clean.endsWith('»')) {
      clean = clean.substring(1, clean.length - 1).trim();
    }
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.substring(1, clean.length - 1).trim();
    }
    return clean;
  }

  /**
   * تشخیص اینکه آیا متن ورودی ساختار چندردیفه/جدولی دارد یا تک‌بارکد است
   */
  static isMultiRowOrStructured(rawText: string, customRowSep?: string, customColSep?: string): boolean {
    if (!rawText) return false;
    const text = this.unwrapQuotes(rawText);

    // ۱. بررسی کاراکترهای کنترلی اسکی سخت‌افزاری اسکنر (Chr 30 / Chr 31)
    if (text.includes('\x1E') || text.includes('\x1F')) return true;

    // ۲. فرمت TSV (کپی مستقیم از سلول‌های اکسل همراه با اینتر)
    if (text.includes('\t') && (text.includes('\n') || text.includes('\r'))) return true;

    // ۳. بررسی جداکننده‌های سفارشی تنظیم‌شده توسط کاربر (الزام به وجود همزمان سطر و ستون)
    const rSep = customRowSep ? customRowSep.trim() : '';
    const cSep = customColSep ? customColSep.trim() : '';
    if (rSep && cSep && text.includes(rSep) && text.includes(cSep)) return true;

    // ۴. بررسی جداکننده‌های استاندارد چندردیفه (سطر: سمی‌کالن یا اینتر + ستون: پایپ یا تب)
    const hasRowSep = text.includes(';') || text.includes('\n') || text.includes('\r');
    const hasColSep = text.includes('|') || text.includes('\t');
    if (hasRowSep && hasColSep) return true;

    // ۵. بررسی وجود چند ستون در یک خط (حداقل ۲ پایپ)
    const pipeCount = (text.match(/\|/g) || []).length;
    if (pipeCount >= 2) return true;

    return false;
  }

  /**
   * تشخیص هوشمند جداکننده‌های سطر و ستون
   */
  static detectSeparators(text: string, customRowSep?: string, customColSep?: string): { rowSep: RegExp | string; colSep: RegExp | string; rowName: string; colName: string } {
    // ۱. کاراکترهای کنترلی ترکیبی یا خالص
    if (text.includes('\x1E') || text.includes('\x1F')) {
      const rowSep = /\x1e;?|\x1e\r?\n?/g;
      const colSep = /\x1f\|?/g;
      return { rowSep, colSep, rowName: 'Chr(30)', colName: 'Chr(31)' };
    }

    // ۲. فرمت TSV (کپی مستقیم از سلول‌های اکسل)
    if (text.includes('\t') && (text.includes('\n') || text.includes('\r'))) {
      return { rowSep: /\r?\n/g, colSep: '\t', rowName: 'Enter (\\n)', colName: 'Tab (\\t)' };
    }

    // ۳. جداکننده‌های سفارشی تنظیم‌شده
    if (customRowSep && customColSep && text.includes(customRowSep) && text.includes(customColSep)) {
      return { rowSep: customRowSep, colSep: customColSep, rowName: customRowSep, colName: customColSep };
    }

    // ۴. استاندارد ترکیبی سمی‌کالن و خط عمودی (; و |)
    if (text.includes(';') && text.includes('|')) {
      return { rowSep: /;\r?\n?|;\s*/g, colSep: '|', rowName: ';', colName: '|' };
    }

    // ۵. خط عمودی و اینتر (| و \n)
    if ((text.includes('\n') || text.includes('\r')) && text.includes('|')) {
      return { rowSep: /\r?\n/g, colSep: '|', rowName: 'Enter', colName: '|' };
    }

    // ۶. کاما و اینتر (CSV)
    if ((text.includes('\n') || text.includes('\r')) && text.includes(',')) {
      return { rowSep: /\r?\n/g, colSep: ',', rowName: 'Enter', colName: ',' };
    }

    // ۷. فال‌بک پیش‌فرض
    const rowSep = customRowSep || ';';
    const colSep = customColSep || '|';
    return { rowSep, colSep, rowName: String(rowSep), colName: String(colSep) };
  }

  /**
   * نگاشت عنوان هدر به کلید استاندارد سیستم
   */
  static mapHeaderToKey(header: string, fieldConfigs: FieldPermissionConfig[] = []): string | null {
    const raw = this.cleanString(header).toLowerCase();
    const cleanNorm = raw.replace(/[-_\s\(\)\[\]«»]/g, '');

    if (!cleanNorm) return null;

    // ۱. تطبیق مستقیم با کلیدها و عناوین فیلدهای سیستم
    for (const f of fieldConfigs) {
      const fKey = (f.key || '').toLowerCase();
      const fKeyNorm = fKey.replace(/[-_\s]/g, '');
      const fLabel = (f.custom_label || f.default_label || '').toLowerCase();
      const fLabelNorm = fLabel.replace(/[-_\s\(\)\[\]]/g, '');

      if (raw === fKey || cleanNorm === fKeyNorm || raw === fLabel || cleanNorm === fLabelNorm) {
        return f.key;
      }
    }

    // ۲. مترادف‌های رایج ستون کد یکتا
    if (['fa_unic_code', 'fauniccode', 'uniccode', 'کدیکتا', 'کدکالا', 'شناسهکالا', 'شناسه', 'کد', 'code', 'itemcode'].includes(cleanNorm)) {
      return 'fa_unic_code';
    }

    // ۳. مترادف‌های فیلدهای مالی و مشخصات کالا
    const synonyms: Record<string, string[]> = {
      price_amount: ['price_amount', 'priceamount', 'unitprice', 'قیمتواحد', 'قیمت', 'مبلغواحد'],
      similar_unit_price: ['similar_unit_price', 'similarunitprice', 'قیمتکالایمشابه', 'قیمتمشابه', 'کالایمشابه'],
      total_value: ['total_value', 'totalvalue', 'ارزشکل', 'مبلغکل', 'جمعکل'],
      currency: ['currency', 'ارز', 'واحدپول', 'نوعارز'],
      invoice_type: ['invoice_type', 'invoicetype', 'نوعفاکتور', 'نوعسند', 'فاکتور'],
      invoice_date: ['invoice_date', 'invoicedate', 'تاریخفاکتور', 'تاریخسند', 'تاریخ'],
      inv_rti_number: ['inv_rti_number', 'invrtinumber', 'شمارهrtiفاکتور', 'شمارهrti', 'rtinumber', 'شمارهفاکتور'],
      added_rti_no: ['added_rti_no', 'addedrtino', 'شمارهrtiافزودهشده', 'rtiافزوده', 'rtino'],
      invoice_page: ['invoice_page', 'invoicepage', 'صفحهفاکتور', 'صفحه', 'شمارهصفحه'],
      page_row: ['page_row', 'pagerow', 'ردیففاکتور', 'ردیف', 'شمارهردیف'],
      doc_supplier: ['doc_supplier', 'docsupplier', 'تأمینکننده', 'تامینکننده', 'فروشنده', 'supplier'],
      folder_address: ['folder_address', 'folderaddress', 'مسیرپوشهاسناد', 'پوشهاسناد', 'پوشه', 'folder'],
      stamp: ['stamp', 'مهر', 'وضعیتمهر', 'ممهور'],
      signature: ['signature', 'امضا', 'وضعیتامضا', 'امضاء'],
      worker_note: ['worker_note', 'workernote', 'یادداشتکارشناس', 'یادداشتکارشناسمالی', 'یادداشت', 'توضیحات', 'note'],
      po: ['po', 'ponumber', 'شمارهسفارش', 'سفارشخرید', 'سفارش'],
      tag: ['tag', 'تگ', 'partnumber', 'partno', 'پارتنامبر', 'پارتنامبرکالا'],
      item_no: ['item_no', 'itemno', 'شمارهفنی', 'شمارهفنیکالا', 'پارتنامبرفنی', 'کدفنی', 'کدفنیکالا'],
      pk_number: ['pknumber', 'pk_number', 'پکینگ', 'شمارهپکینگ', 'بسته']
    };

    for (const [key, synList] of Object.entries(synonyms)) {
      if (synList.includes(cleanNorm) || synList.includes(raw)) {
        return key;
      }
    }

    return null;
  }

  /**
   * تبدیل رشته خام چندردیفه به ساختار جدولی
   */
  static parseRawText(rawText: string, fieldConfigs: FieldPermissionConfig[] = [], customRowSep?: string, customColSep?: string): RawParsedTable | null {
    if (!rawText) return null;
    const text = this.unwrapQuotes(rawText);

    const { rowSep, colSep, rowName, colName } = this.detectSeparators(text, customRowSep, customColSep);

    const rawRows = text
      .split(rowSep)
      .map(r => r.trim())
      .filter(r => r.length > 0);

    if (rawRows.length === 0) return null;

    // ردیف اول: هدر
    const headerCells = rawRows[0]
      .split(colSep)
      .map(h => this.cleanString(h));

    if (headerCells.length === 0) return null;

    const mappedKeys = headerCells.map(h => this.mapHeaderToKey(h, fieldConfigs));

    // اگر هیچ کلیدی حتی کد یکتا نگاشت نشد، ستون اول را به صورت پیش‌فرض کد یکتا فرض می‌کنیم
    if (!mappedKeys.includes('fa_unic_code') && mappedKeys.length > 0) {
      mappedKeys[0] = 'fa_unic_code';
    }

    const rows: Record<string, string>[] = [];

    for (let i = 1; i < rawRows.length; i++) {
      const line = rawRows[i];
      if (!line) continue;

      const cells = line.split(colSep).map(c => this.cleanString(c));
      const rowObj: Record<string, string> = {};

      headerCells.forEach((headerName, idx) => {
        const val = cells[idx] !== undefined ? cells[idx] : '';
        const key = mappedKeys[idx] || headerName || `col_${idx + 1}`;
        rowObj[key] = val;
      });

      rows.push(rowObj);
    }

    return {
      headers: headerCells,
      mappedKeys,
      rows,
      detectedRowSep: rowName,
      detectedColSep: colName
    };
  }

  /**
   * تبدیل مقادیر بولی از فارسی/رشته به boolean
   */
  static parseBoolean(val: any): boolean {
    if (val === true || val === 1) return true;
    if (!val) return false;
    const clean = String(val).trim().toLowerCase();
    return ['بله', 'دارد', 'true', '1', 'yes', 'y', 'ok', 'ممهور', 'امضا شده'].includes(clean);
  }

  /**
   * نرمال‌سازی نوع فاکتور به مقادیر معتبر سیستم
   */
  static normalizeInvoiceType(val: any): string | null {
    if (!val) return null;
    const clean = String(val).trim().toLowerCase().replace(/[\s\/_-]/g, '');
    if (['رسمی', 'رسمیمالیاتی', 'مالیاتی', 'formal'].includes(clean)) return 'formal';
    if (['خریدهایداخلی', 'داخلی', 'خریدداخلی', 'domestic'].includes(clean)) return 'domestic';
    if (['خریدهایخارجی', 'خارجی', 'خریدخارجی', 'foreign'].includes(clean)) return 'foreign';
    if (['امانی', 'consignment'].includes(clean)) return 'consignment';
    return String(val).trim();
  }

  /**
   * نرمال‌سازی واحد پول
   */
  static normalizeCurrency(val: any): string | null {
    if (!val) return null;
    const clean = String(val).trim().toLowerCase();
    if (['ریال', 'irr', 'rial', 'rials'].includes(clean)) return 'IRR';
    if (['دلار', 'usd', 'dollar', '$'].includes(clean)) return 'USD';
    if (['یورو', 'eur', 'euro', '€'].includes(clean)) return 'EUR';
    if (['سایر', 'other'].includes(clean)) return 'OTHER';
    return String(val).trim();
  }
}
