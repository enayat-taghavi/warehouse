import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef, ElementRef, ViewChild, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, switchMap, catchError } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelApiService, LabelTemplate, LabelElement, AvailableField } from '../../../../core/api/label-api.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-label-designer',
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './label-designer.html',
  styleUrl: './label-designer.css'
})
export class LabelDesigner implements OnInit, OnChanges, OnDestroy {
  /** null = Global context, number = warehouse-specific */
  @Input() warehouseId: number | null = null;

  /** 'settings' = design mode in settings page, 'print' = print modal from dispatch */
  @Input() mode: 'settings' | 'print' = 'settings';

  /** Items to print (only used in 'print' mode) */
  @Input() printItems: any[] = [];

  @Output() printComplete = new EventEmitter<void>();

  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('renameInput', { static: false }) renameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('copyInput', { static: false }) copyInput?: ElementRef<HTMLInputElement>;

  // Template state
  template: LabelTemplate = this.getDefaultTemplate();
  isLoading = true;
  isSaving = false;
  isPrinting = false;

  // Print Settings State
  itemsConfig: { id: number | string, name: string, quantity: number }[] = [];
  customRemark: string = '';
  pdfPreviewUrl: SafeResourceUrl | null = null;
  isGeneratingPreview = false;
  
  bulkQuantity: number = 1;
  tempPrintSettings: {
    paper_type: string;
    margin_mm: number;
    landscape: boolean;
    scale: number;
    collation: 'group' | 'collate';
  } = {
    paper_type: 'A4',
    margin_mm: 5,
    landscape: false,
    scale: 100,
    collation: 'group'
  };

  private previewSubject = new Subject<void>();
  private previewSub?: Subscription;
  private currentPreviewReq?: Subscription;
  private currentBlobUrl?: string;

  // ─── Multi-template management ───────────────────────────────
  templates: LabelTemplate[] = [];          // all templates for this scope
  isRenaming = false;                        // inline rename mode
  renameValue = '';                          // temp value for rename input
  isCopying = false;                         // inline copy mode
  copyValue = '';                            // temp value for copy input
  isCreatingNew = false;                     // inline new template name input
  newTemplateName = '';                      // temp value for new name input
  deleteConfirmId: number | null = null;     // id awaiting delete confirmation

  // Available fields
  availableFields: AvailableField[] = [];
  fieldGroups: { name: string; fields: AvailableField[] }[] = [];

  // Canvas interaction
  selectedElementId: string | null = null;
  isDragging = false;
  isResizing = false;
  dragStartX = 0;
  dragStartY = 0;
  dragStartElX = 0;
  dragStartElY = 0;
  resizeStartW = 0;
  resizeStartH = 0;

  // Scale: mm to px on screen
  scaleFactor = 4;

  // Field search in sidebar
  fieldSearch = '';

  // QR field selector
  qrFieldOptions: AvailableField[] = [];

  gridWarning: string = '';

  constructor(
    private labelApi: LabelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loadAllTemplates();
    this.loadFields();

    this.previewSub = this.previewSubject.pipe(
      debounceTime(600),
      switchMap(() => {
        if (!this.template.id || this.itemsConfig.length === 0) {
          return of(null);
        }
        this.isGeneratingPreview = true;
        this.cdr.detectChanges();

        const configPayload = this.itemsConfig.map(c => ({ id: c.id, quantity: this.bulkQuantity }));
        return this.labelApi.generatePdf(this.template.id, configPayload, this.customRemark, this.tempPrintSettings).pipe(
          catchError(err => {
            this.isGeneratingPreview = false;
            if (err.status !== 0) {
              this.toast.show('error', 'خطا در بارگذاری پیش‌نمایش PDF');
            }
            this.cdr.detectChanges();
            return of(null);
          })
        );
      })
    ).subscribe((blob: Blob | null) => {
      if (blob) {
        if (this.currentBlobUrl) {
          window.URL.revokeObjectURL(this.currentBlobUrl);
        }
        this.currentBlobUrl = window.URL.createObjectURL(blob);
        this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentBlobUrl);
        this.isGeneratingPreview = false;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy() {
    if (this.previewSub) {
      this.previewSub.unsubscribe();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['printItems'] && this.printItems) {
      this.initItemsConfig();
    }
    if (changes['warehouseId'] && !changes['warehouseId'].firstChange) {
      this.loadAllTemplates();
      this.loadFields();
    }
  }

  initItemsConfig() {
    this.itemsConfig = this.printItems.map(item => ({
      id: item.id,
      name: item.fa_unic_code || item.plpkitem || `آیتم ${item.id}`,
      quantity: 1
    }));
    this.bulkQuantity = 1;
  }

  onPrintSettingChange() {
    // Sync bulk quantity to all items
    this.itemsConfig.forEach(item => item.quantity = this.bulkQuantity);
    this.previewSubject.next();
  }

  // ─── Global Template Helpers ─────────────────────────────────

  /** آیا این لیبل از نوع Global است (بدون انبار مشخص)؟ */
  isGlobalTemplate(t: LabelTemplate): boolean {
    return !t.warehouse;
  }

  /**
   * آیا لیبل فعلی در context انبار فقط‌خواندنی است؟
   * (وقتی در منوی انبار هستیم ولی لیبل انتخاب‌شده Global است)
   */
  get isCurrentTemplateReadOnly(): boolean {
    return this.warehouseId !== null && this.isGlobalTemplate(this.template);
  }

  /** کپی لیبل Global (یا هر لیبل دیگری) به انبار جاری */
  copyToThisWarehouse(t: LabelTemplate) {
    if (!this.warehouseId || !t.id) return;
    const name = `کپی ${t.name}`;
    this.labelApi.copyToWarehouse(t.id, this.warehouseId, name).subscribe({
      next: (saved) => {
        this.templates.push(saved);
        this.activateTemplate(saved);
        this.toast.show('success', `لیبل "${saved.name}" برای این انبار کپی شد. اکنون می‌توانید آن را ویرایش کنید.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در کپی لیبل. لطفاً دوباره تلاش کنید.');
        this.cdr.detectChanges();
      }
    });
  }

  getDefaultTemplate(): LabelTemplate {
    return {
      warehouse: null,
      name: 'پیش‌فرض',
      width_mm: 70,
      height_mm: 40,
      qr_source_field: 'fa_unic_code',
      elements: [],
      paper_type: 'A4',
      grid_rows: 7,
      grid_cols: 3,
      margin_mm: 5,
      is_active: true,
    };
  }

  get canvasWidth(): number {
    return this.template.width_mm * this.scaleFactor;
  }

  get canvasHeight(): number {
    return this.template.height_mm * this.scaleFactor;
  }

  getFontPx(fontSize: number): number {
    // Convert Point to mm (1pt = 0.3527mm), then to on-screen pixels.
    return fontSize * 0.3527 * this.scaleFactor;
  }

  // ─── Grid Calculations ───────────────────────────────────────

  onDimensionChange() {
    this.autoCalculateGrid();
    this.cdr.detectChanges();
  }

  onManualGridChange() {
    this.checkGridWarning();
    this.cdr.detectChanges();
  }

  private autoCalculateGrid() {
    if (this.template.paper_type === 'roll') {
      this.gridWarning = '';
      return;
    }
    const max = this.getMaxGrid();
    this.template.grid_cols = max.cols;
    this.template.grid_rows = max.rows;
    this.gridWarning = '';
  }

  private checkGridWarning() {
    if (this.template.paper_type === 'roll') {
      this.gridWarning = '';
      return;
    }
    const max = this.getMaxGrid();
    if (this.template.grid_cols > max.cols || this.template.grid_rows > max.rows) {
      this.gridWarning = `هشدار: حداکثر ظرفیت این کاغذ ${max.rows} سطر و ${max.cols} ستون است. خروجی PDF ممکن است از کادر خارج شود.`;
    } else {
      this.gridWarning = '';
    }
  }

  private getMaxGrid(): { cols: number, rows: number } {
    let paperW = 210;
    let paperH = 297;
    if (this.template.paper_type === 'A3') {
      paperW = 297;
      paperH = 420;
    }
    const w = Number(this.template.width_mm) || 1;
    const h = Number(this.template.height_mm) || 1;
    const m = Number(this.template.margin_mm) || 0;
    
    let maxCols = Math.floor((paperW + m) / (w + m));
    let maxRows = Math.floor((paperH + m) / (h + m));
    
    return {
      cols: Math.max(1, maxCols),
      rows: Math.max(1, maxRows)
    };
  }

  get selectedElement(): LabelElement | null {
    if (!this.selectedElementId) return null;
    return this.template.elements.find(e => e.id === this.selectedElementId) || null;
  }

  // ─── Data Loading ────────────────────────────────────────────

  /** Load all templates for this scope, then activate the first / active one */
  loadAllTemplates() {
    this.isLoading = true;
    this.labelApi.listTemplates(this.warehouseId ?? undefined).subscribe({
      next: (list) => {
        this.templates = list || [];
        const active = this.templates.find(t => t.is_active) || this.templates[0];
        if (active) {
          this.activateTemplate(active);
        } else {
          // No templates yet — show blank default
          this.template = this.getDefaultTemplate();
          this.template.warehouse = this.warehouseId;
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.template = this.getDefaultTemplate();
        this.template.warehouse = this.warehouseId;
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Set the given template object as the active editing template */
  activateTemplate(t: LabelTemplate) {
    this.template = { ...t };
    if (!Array.isArray(this.template.elements)) this.template.elements = [];
    this.template.elements.forEach(el => { if (!el.id) el.id = this.generateId(); });
    this.selectedElementId = null;
    this.isRenaming = false;
    this.isCopying = false;
    this.deleteConfirmId = null;
    this.checkGridWarning();

    this.tempPrintSettings = {
      paper_type: this.template.paper_type || 'A4',
      margin_mm: this.template.margin_mm ?? 5,
      landscape: false,
      scale: 100,
      collation: 'group'
    };

    // Auto-refresh preview when in print mode
    if (this.mode === 'print' && this.itemsConfig.length > 0) {
      setTimeout(() => this.refreshPreview(), 100);
    }
  }

  /** Switch to another template by id */
  switchTemplate(id: number) {
    const found = this.templates.find(t => t.id === id);
    if (found) {
      this.activateTemplate(found);
      if (this.mode === 'print') {
        this.refreshPreview();
      }
    }
    this.cdr.detectChanges();
  }

  // ─── Template CRUD (UI actions) ──────────────────────────────

  /** Open inline input to name a new template */
  startCreateNew() {
    this.isCreatingNew = true;
    this.newTemplateName = '';
    this.isRenaming = false;
    this.isCopying = false;
    this.deleteConfirmId = null;
    this.cdr.detectChanges();
  }

  /** Actually create the new empty template */
  confirmCreate() {
    const name = (this.newTemplateName || '').trim();
    if (!name) { this.isCreatingNew = false; return; }

    const blank: Partial<LabelTemplate> = {
      ...this.getDefaultTemplate(),
      name,
      warehouse: this.warehouseId,
    };

    this.labelApi.createTemplate(blank).subscribe({
      next: (saved) => {
        this.templates.push(saved);
        this.activateTemplate(saved);
        this.isCreatingNew = false;
        this.toast.show('success', `تمپلیت "${saved.name}" ایجاد شد.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.isCreatingNew = false;
        this.toast.show('error', 'خطا در ایجاد تمپلیت.');
        this.cdr.detectChanges();
      }
    });
  }

  cancelCreate() { this.isCreatingNew = false; this.cdr.detectChanges(); }

  /** Open inline rename for current template */
  startRename() {
    this.isRenaming = true;
    this.renameValue = this.template.name;
    this.isCreatingNew = false;
    this.isCopying = false;
    this.deleteConfirmId = null;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.renameInput?.nativeElement.select();
    });
  }

  /** Save the renamed template */
  confirmRename() {
    const name = (this.renameValue || '').trim();
    if (!name || !this.template.id) { this.isRenaming = false; return; }

    this.labelApi.updateTemplate(this.template.id, { ...this.template, name }).subscribe({
      next: (saved) => {
        this.template.name = saved.name;
        const idx = this.templates.findIndex(t => t.id === saved.id);
        if (idx >= 0) this.templates[idx].name = saved.name;
        this.isRenaming = false;
        this.toast.show('success', 'نام تمپلیت تغییر یافت.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isRenaming = false;
        this.toast.show('error', 'خطا در تغییر نام.');
        this.cdr.detectChanges();
      }
    });
  }

  cancelRename() { this.isRenaming = false; this.cdr.detectChanges(); }

  /** Initiate cloning current template */
  startCopy() {
    this.isCopying = true;
    this.copyValue = `کپی ${this.template.name}`;
    this.isRenaming = false;
    this.isCreatingNew = false;
    this.deleteConfirmId = null;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.copyInput?.nativeElement.select();
    });
  }

  /** Actually create the clone */
  confirmCopy() {
    const name = (this.copyValue || '').trim();
    if (!name) { this.isCopying = false; return; }

    const cloned: Partial<LabelTemplate> = {
      ...this.template,
      id: undefined,
      name,
      is_active: false,
      warehouse: this.warehouseId,
    };

    this.labelApi.createTemplate(cloned).subscribe({
      next: (saved) => {
        this.templates.push(saved);
        this.activateTemplate(saved);
        this.isCopying = false;
        this.toast.show('success', `تمپلیت "${saved.name}" ایجاد شد.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.isCopying = false;
        this.toast.show('error', 'خطا در کپی تمپلیت.');
        this.cdr.detectChanges();
      }
    });
  }

  cancelCopy() {
    this.isCopying = false;
    this.cdr.detectChanges();
  }

  /** Show delete confirm row */
  askDeleteConfirm(id: number) {
    this.deleteConfirmId = id;
    this.cdr.detectChanges();
  }

  cancelDelete() { this.deleteConfirmId = null; this.cdr.detectChanges(); }

  /** Actually delete template */
  confirmDelete(id: number) {
    // محافظت: لیبل‌های Global در context انبار قابل حذف نیستند
    const t = this.templates.find(x => x.id === id);
    if (t && this.warehouseId !== null && this.isGlobalTemplate(t)) {
      this.toast.show('warning', 'لیبل‌های Global از منوی انبار قابل حذف نیستند. از دکمه «کپی به این انبار» استفاده کنید.');
      this.deleteConfirmId = null;
      this.cdr.detectChanges();
      return;
    }

    this.labelApi.deleteTemplate(id, this.warehouseId).subscribe({
      next: () => {
        this.templates = this.templates.filter(t => t.id !== id);
        this.deleteConfirmId = null;
        // If we deleted the current template, switch to another
        if (this.template.id === id) {
          if (this.templates.length > 0) {
            this.activateTemplate(this.templates[0]);
          } else {
            this.template = this.getDefaultTemplate();
            this.template.warehouse = this.warehouseId;
          }
        }
        this.toast.show('success', 'تمپلیت حذف شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.deleteConfirmId = null;
        this.toast.show('error', 'خطا در حذف تمپلیت.');
        this.cdr.detectChanges();
      }
    });
  }

  loadFields() {
    this.labelApi.getAvailableFields(this.warehouseId ?? undefined).subscribe({
      next: (fields) => {
        this.availableFields = fields;
        this.qrFieldOptions = fields.filter(f => f.group === 'شناسه‌ها');
        this.buildFieldGroups();
        this.cdr.detectChanges();
      }
    });
  }

  buildFieldGroups() {
    const map = new Map<string, AvailableField[]>();
    this.availableFields.forEach(f => {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group)!.push(f);
    });
    this.fieldGroups = Array.from(map.entries()).map(([name, fields]) => ({ name, fields }));
  }

  get filteredFieldGroups() {
    if (!this.fieldSearch) return this.fieldGroups;
    const term = this.fieldSearch.toLowerCase();
    return this.fieldGroups
      .map(g => ({
        name: g.name,
        fields: g.fields.filter(f =>
          f.label.toLowerCase().includes(term) || f.key.toLowerCase().includes(term)
        )
      }))
      .filter(g => g.fields.length > 0);
  }

  isFieldOnCanvas(key: string): boolean {
    return this.template.elements.some(el => el.field === key);
  }

  // ─── Element Management ──────────────────────────────────────

  addElement(field: AvailableField) {
    if (this.isFieldOnCanvas(field.key) && field.key !== '__print_date__') {
      this.toast.show('warning', 'این فیلد قبلاً روی بوم قرار دارد.');
      return;
    }

    const isQr = field.key === this.template.qr_source_field;
    const newEl: LabelElement = {
      id: this.generateId(),
      type: isQr ? 'qrcode' : (field.group === 'ویژه' ? 'special' : 'text'),
      field: field.key,
      label: field.label,
      x: 5,
      y: 5 + this.template.elements.length * 12,
      width: isQr ? 25 : 40,
      height: isQr ? 25 : 8,
      fontSize: 9,
      fontWeight: field.key === 'fa_unic_code' ? 'bold' : 'normal',
      textAlign: 'right',
    };

    // Keep within canvas bounds
    if (newEl.y + newEl.height > this.template.height_mm) {
      newEl.y = 2;
    }

    this.template.elements.push(newEl);
    this.selectedElementId = newEl.id;
    this.cdr.detectChanges();
  }

  addQrElement() {
    // Remove existing QR if any
    this.template.elements = this.template.elements.filter(e => e.type !== 'qrcode');

    const qr: LabelElement = {
      id: this.generateId(),
      type: 'qrcode',
      field: this.template.qr_source_field,
      label: 'QR Code',
      x: this.template.width_mm - 28,
      y: 5,
      width: 25,
      height: 25,
      fontSize: 0,
      fontWeight: 'normal',
      textAlign: 'center',
    };
    this.template.elements.push(qr);
    this.selectedElementId = qr.id;
    this.cdr.detectChanges();
  }

  removeElement(el: LabelElement) {
    this.template.elements = this.template.elements.filter(e => e.id !== el.id);
    if (this.selectedElementId === el.id) {
      this.selectedElementId = null;
    }
    this.cdr.detectChanges();
  }

  selectElement(el: LabelElement, event?: MouseEvent) {
    if (this.mode === 'print') return;
    if (event) {
      event.stopPropagation();
    }
    this.selectedElementId = el.id;
    this.cdr.detectChanges();
  }

  deselectAll() {
    this.selectedElementId = null;
    this.cdr.detectChanges();
  }

  // ─── Drag & Drop (Mouse Events) ─────────────────────────────

  onMouseDown(event: MouseEvent, el: LabelElement, action: 'drag' | 'resize') {
    if (this.mode === 'print') return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedElementId = el.id;

    if (action === 'drag') {
      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragStartElX = el.x;
      this.dragStartElY = el.y;
    } else {
      this.isResizing = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.resizeStartW = el.width;
      this.resizeStartH = el.height;
    }

    // Bind global events
    const onMove = (e: MouseEvent) => this.onMouseMove(e);
    const onUp = () => {
      this.isDragging = false;
      this.isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onMouseMove(event: MouseEvent) {
    const el = this.selectedElement;
    if (!el) return;

    const dx = (event.clientX - this.dragStartX) / this.scaleFactor;
    const dy = (event.clientY - this.dragStartY) / this.scaleFactor;

    if (this.isDragging) {
      el.x = Math.max(0, Math.min(this.template.width_mm - el.width, this.dragStartElX + dx));
      el.y = Math.max(0, Math.min(this.template.height_mm - el.height, this.dragStartElY + dy));
    } else if (this.isResizing) {
      el.width = Math.max(8, this.resizeStartW + dx);
      el.height = Math.max(5, this.resizeStartH + dy);
      // Clamp to canvas
      if (el.x + el.width > this.template.width_mm) el.width = this.template.width_mm - el.x;
      if (el.y + el.height > this.template.height_mm) el.height = this.template.height_mm - el.y;
    }

    this.cdr.detectChanges();
  }

  // ─── Save & Print ────────────────────────────────────────────

  saveTemplate() {
    // محافظت: لیبل‌های Global در context انبار قابل ذخیره نیستند
    if (this.isCurrentTemplateReadOnly) {
      this.toast.show('warning', 'لیبل Global فقط‌خواندنی است. برای سفارشی‌سازی از دکمه «کپی به این انبار» استفاده کنید.');
      return;
    }
    this.isSaving = true;
    this.template.warehouse = this.warehouseId;

    this.labelApi.saveTemplate(this.template, this.warehouseId).subscribe({
      next: (saved) => {
        this.template = saved;
        if (!Array.isArray(this.template.elements)) this.template.elements = [];
        this.template.elements.forEach(el => {
          if (!el.id) el.id = this.generateId();
        });
        // Sync into templates list
        const idx = this.templates.findIndex(t => t.id === saved.id);
        if (idx >= 0) { this.templates[idx] = saved; }
        else { this.templates.push(saved); }
        this.isSaving = false;
        this.toast.show('success', `تمپلیت "${saved.name}" ذخیره شد.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ذخیره ساختار لیبل.');
        this.cdr.detectChanges();
      }
    });
  }

  refreshPreview() {
    if (!this.template.id || this.itemsConfig.length === 0) return;
    this.previewSubject.next();
  }

  directPrint() {
    if (!this.template.id || this.itemsConfig.length === 0) return;
    this.isPrinting = true;
    const configPayload = this.itemsConfig.map(c => ({ id: c.id, quantity: this.bulkQuantity }));
    
    this.labelApi.generatePdf(this.template.id, configPayload, this.customRemark, this.tempPrintSettings).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        
        this.isPrinting = false;
        this.printComplete.emit();
        this.cdr.detectChanges();
        
        setTimeout(() => window.URL.revokeObjectURL(url), 10000);
      },
      error: () => {
        this.isPrinting = false;
        this.toast.show('error', 'خطا در پرینت PDF.');
        this.cdr.detectChanges();
      }
    });
  }

  requestPrint() {
    if (!this.template.id) {
      this.toast.show('warning', 'ابتدا ساختار لیبل را ذخیره کنید.');
      return;
    }
    if (this.itemsConfig.length === 0) {
      this.toast.show('warning', 'رکوردی برای چاپ انتخاب نشده است.');
      return;
    }

    this.isPrinting = true;
    const configPayload = this.itemsConfig.map(c => ({ id: c.id, quantity: this.bulkQuantity }));

    this.labelApi.generatePdf(this.template.id, configPayload, this.customRemark, this.tempPrintSettings).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `labels_${new Date().getTime()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.isPrinting = false;
        this.toast.show('success', `فایل PDF لیبل‌ها دانلود شد.`);
        this.printComplete.emit();
        this.cdr.detectChanges();
      },
      error: () => {
        this.isPrinting = false;
        this.toast.show('error', 'خطا در تولید PDF.');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── Preview Helpers ─────────────────────────────────────────

  getPreviewValue(field: string): string {
    const previews: Record<string, string> = {
      'fa_unic_code': '85.12.34.567.8',
      'description': 'شیر فلکه کشویی فولادی ۸ اینچ',
      'plpkitem': 'PL01-PK03-005',
      'pl': 'PL-2024-001',
      'po': 'PO-4500123',
      'pk_number': 'PK-03',
      'item_no': '005',
      'unit': 'عدد',
      'scope_discipline': 'مکانیک',
      'inventory': '15',
      'bal4miv': '12',
      'old_location': 'WH-02-A-14',
      'new_location': 'WH-03-B-07',
      'hov_no': 'HOV-1403-0045',
      'vendor': 'شرکت آلفا',
      'supplier': 'تدارکات ایمن',
      'irn_no': 'IRN-2024-078',
      'my_tag': 'فوری، مهم',
      'remark': 'بررسی شود',
      '__print_date__': '۱۴۰۳/۰۵/۰۷ ۱۰:۳۰',
      '__warehouse_name__': 'انبار قطعات اصلی',
      '__project_name__': 'پالایشگاه ستاره',
      '__custom_remark__': this.customRemark || 'توضیحات ویژه...',
    };
    return previews[field] || field;
  }

  getElementPxStyle(el: LabelElement) {
    return {
      left: (el.x * this.scaleFactor) + 'px',
      top: (el.y * this.scaleFactor) + 'px',
      width: (el.width * this.scaleFactor) + 'px',
      height: (el.height * this.scaleFactor) + 'px',
      fontSize: el.fontSize + 'px',
      fontWeight: el.fontWeight,
      textAlign: el.textAlign,
    };
  }

  // ─── Utilities ───────────────────────────────────────────────

  private generateId(): string {
    return 'el_' + Math.random().toString(36).substr(2, 9);
  }

  /** Check if QR element exists */
  get hasQrElement(): boolean {
    return this.template.elements.some(e => e.type === 'qrcode');
  }

  /** Check if custom remark field exists on canvas */
  get hasCustomRemarkField(): boolean {
    return this.template.elements.some(e => e.field === '__custom_remark__');
  }

  copiedElement: LabelElement | null = null;

  /** Keyboard shortcuts for Label Designer Canvas */
  onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    // Escape: Deselect all
    if (event.key === 'Escape') {
      this.deselectAll();
      return;
    }

    // Ctrl+S to save template
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveTemplate();
      return;
    }

    // If user is editing text in an input, do not intercept other keys
    if (isInsideInput || this.mode === 'print') return;

    // Delete / Backspace: Remove selected element
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedElement) {
      event.preventDefault();
      this.removeElement(this.selectedElement);
      return;
    }

    // Ctrl+C: Copy selected element
    if ((event.ctrlKey || event.metaKey) && event.key === 'c' && this.selectedElement) {
      event.preventDefault();
      this.copiedElement = JSON.parse(JSON.stringify(this.selectedElement));
      this.toast.show('success', 'المان کپی شد');
      return;
    }

    // Ctrl+V: Paste copied element
    if ((event.ctrlKey || event.metaKey) && event.key === 'v' && this.copiedElement) {
      event.preventDefault();
      const newEl: LabelElement = {
        ...JSON.parse(JSON.stringify(this.copiedElement)),
        id: this.generateId(),
        x: Math.min(this.template.width_mm - 20, this.copiedElement.x + 5),
        y: Math.min(this.template.height_mm - 10, this.copiedElement.y + 5),
      };
      this.template.elements.push(newEl);
      this.selectElement(newEl);
      this.cdr.detectChanges();
      return;
    }

    // Nudge with Arrow Keys (1mm / 5mm with Shift)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && this.selectedElement) {
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowLeft') {
        this.selectedElement.x = Math.max(0, this.selectedElement.x - step);
      } else if (event.key === 'ArrowRight') {
        this.selectedElement.x = Math.min(this.template.width_mm - this.selectedElement.width, this.selectedElement.x + step);
      } else if (event.key === 'ArrowUp') {
        this.selectedElement.y = Math.max(0, this.selectedElement.y - step);
      } else if (event.key === 'ArrowDown') {
        this.selectedElement.y = Math.min(this.template.height_mm - this.selectedElement.height, this.selectedElement.y + step);
      }
      this.cdr.detectChanges();
    }
  }

  trackById(index: number, item: LabelElement): string {
    return item.id;
  }
}
