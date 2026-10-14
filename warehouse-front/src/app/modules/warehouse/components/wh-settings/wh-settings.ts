import { Component, OnInit, ChangeDetectorRef, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings';
import { ToastService, ConfirmDialogService } from '../../../../shared';
import { AuthStore } from '../../../../core/stores/auth.store';
import { AuthService } from '../../../../core/auth/auth.service';
import { LabelDesigner } from '../label-designer/label-designer';
import { DynamicFields } from '../dynamic-fields/dynamic-fields';
import { ActivatedRoute, Router } from '@angular/router';
import { 
  FieldPermissionConfig, 
  CATEGORY_LABELS, 
  mergeFieldPermissions,
  mergeDocFieldPermissions 
} from '../../../../core/models/field-config.model';
import { DynamicFieldApiService } from '../../../../core/api/dynamic-field-api.service';
import { BackupApiService, DatabaseBackup, BackupVerifyResult } from '../../../../core/api/backup-api.service';

@Component({
  selector: 'app-wh-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './wh-settings.html',
  styleUrl: './wh-settings.css'
})
export class WhSettings implements OnInit {
  isLoading = true;
  settings: any = null;
  warehouseId: number | null = null;
  activeTab: 'operations' | 'label' | 'dynamic' | 'counter_fields' | 'doc_fields' | 'db_backup' = 'operations';

  // ── Counter Field Permissions State ────────────────────────────────────────
  fieldConfigs: FieldPermissionConfig[] = [];
  selectedCategory: string = 'all';
  fieldSearchTerm: string = '';
  categoryLabels = CATEGORY_LABELS;
  categoryKeys = Object.keys(CATEGORY_LABELS);
  dynamicFieldsList: any[] = [];

  // ── Customs / Financial Field Permissions State ─────────────────────────────
  docFieldConfigs: FieldPermissionConfig[] = [];
  selectedDocCategory: string = 'all';
  docFieldSearchTerm: string = '';

  // ── Barcode Scanner Delimiters State ─────────────────────────────────────────
  scannerPreset: 'default' | 'control' | 'hybrid' | 'excel' | 'custom' = 'default';

  // ── Database Backup & Restore State ─────────────────────────────────────────
  backupsList: DatabaseBackup[] = [];
  isLoadingBackups = false;
  isCreatingBackup = false;
  newBackupDescription = '';
  isRestoreModalOpen = false;
  selectedBackupForRestore: DatabaseBackup | null = null;
  restoreConfirmInput = '';
  isRestoringDatabase = false;
  isVerifyingBackup = false;
  verifyResult: BackupVerifyResult | null = null;
  isSuperuser = computed(() => !!(this.auth.user()?.is_superuser || this.auth.user()?.permissions?.includes('perm_sys_backup_restore') || this.auth.user()?.roles?.includes('admin') || this.auth.user()?.department === 'admin'));
  canManageBackups = computed(() => !!(
    this.auth.user()?.is_superuser ||
    this.auth.user()?.permissions?.includes('perm_sys_backup_manage') ||
    this.auth.user()?.permissions?.includes('perm_sys_backup_restore') ||
    this.auth.user()?.roles?.includes('admin') ||
    this.auth.user()?.department === 'admin'
  ));
  canRestoreDatabase = computed(() => !!(
    this.auth.user()?.is_superuser ||
    this.auth.user()?.permissions?.includes('perm_sys_backup_restore')
  ));

  constructor(
    private settingsService: SettingsService,
    private dynamicFieldApi: DynamicFieldApiService,
    private backupApi: BackupApiService,
    private toast: ToastService,
    public authStore: AuthStore,
    public auth: AuthService,
    private confirm: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {
    effect(() => {
      const activeId = this.authStore.activeWarehouseId();
      const numId = activeId && activeId !== 'ALL' ? Number(activeId) : null;
      if (numId !== this.warehouseId) {
        this.warehouseId = numId;
        if (this.warehouseId) {
          this.loadSettings();
        } else {
          this.settings = null;
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      }
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tab = params['tab'] as typeof this.activeTab;
        if (['operations', 'label', 'dynamic', 'counter_fields', 'doc_fields', 'db_backup'].includes(tab)) {
          this.activeTab = tab;
          if (tab === 'db_backup') {
            this.loadBackups();
          }
          this.cdr.detectChanges();
        }
      }
    });
    const currentActive = this.authStore.activeWarehouseId();
    this.warehouseId = currentActive && currentActive !== 'ALL' ? Number(currentActive) : null;
    if (this.warehouseId && !this.settings) {
      this.loadSettings();
    } else if (!this.warehouseId) {
      this.isLoading = false;
    }
  }

  setTab(tab: 'operations' | 'label' | 'dynamic' | 'counter_fields' | 'doc_fields' | 'db_backup') {
    this.activeTab = tab;
    if (tab === 'db_backup') {
      this.loadBackups();
    }
    this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
    this.cdr.detectChanges();
  }

  setCategory(cat: string) {
    this.selectedCategory = cat;
    this.cdr.detectChanges();
  }

  setDocCategory(cat: string) {
    this.selectedDocCategory = cat;
    this.cdr.detectChanges();
  }

  loadSettings() {
    this.isLoading = true;
    this.dynamicFieldApi.getFields(this.warehouseId!).subscribe({
      next: (dfRes: any) => {
        this.dynamicFieldsList = Array.isArray(dfRes) ? dfRes : (dfRes?.results || []);
        this.fetchWarehouseSettings();
      },
      error: () => {
        this.dynamicFieldsList = [];
        this.fetchWarehouseSettings();
      }
    });
  }

  private fetchWarehouseSettings() {
    this.settingsService.getWarehouseSettings(this.warehouseId!).subscribe({
      next: (res: any) => {
        this.settings = res;
        const savedCounter = res?.field_permissions_counter?.value;
        this.fieldConfigs = mergeFieldPermissions(savedCounter, this.dynamicFieldsList);
        const savedDoc = res?.field_permissions_doc?.value;
        this.docFieldConfigs = mergeDocFieldPermissions(savedDoc, this.dynamicFieldsList);
        const rowSep = res?.scanner_row_delimiter?.value ?? ';';
        const colSep = res?.scanner_col_delimiter?.value ?? '|';
        this.scannerPreset = this.detectScannerPreset(rowSep, colSep);

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در دریافت تنظیمات انبار.');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Scanner Separator Methods ───────────────────────────────────────────────
  onScannerPresetChange(val: string) {
    this.scannerPreset = val as any;
    if (!this.settings.scanner_row_delimiter) {
      this.settings.scanner_row_delimiter = { value: ';', is_override: true };
    }
    if (!this.settings.scanner_col_delimiter) {
      this.settings.scanner_col_delimiter = { value: '|', is_override: true };
    }
    this.settings.scanner_row_delimiter.is_override = true;
    this.settings.scanner_col_delimiter.is_override = true;

    if (val === 'default') {
      this.settings.scanner_row_delimiter.value = ';';
      this.settings.scanner_col_delimiter.value = '|';
    } else if (val === 'control') {
      this.settings.scanner_row_delimiter.value = '\x1E';
      this.settings.scanner_col_delimiter.value = '\x1F';
    } else if (val === 'hybrid') {
      this.settings.scanner_row_delimiter.value = '\x1E;';
      this.settings.scanner_col_delimiter.value = '\x1F|';
    } else if (val === 'excel') {
      this.settings.scanner_row_delimiter.value = '\n';
      this.settings.scanner_col_delimiter.value = '\t';
    }
    this.cdr.detectChanges();
  }

  detectScannerPreset(rowSep: string, colSep: string): 'default' | 'control' | 'hybrid' | 'excel' | 'custom' {
    if (rowSep === '\x1E' && colSep === '\x1F') return 'control';
    if (rowSep === '\x1E;' && colSep === '\x1F|') return 'hybrid';
    if (rowSep === '\n' && colSep === '\t') return 'excel';
    if (rowSep === ';' && colSep === '|') return 'default';
    return 'custom';
  }

  // ── Counter Field Methods ──────────────────────────────────────────────────
  get filteredFieldConfigs(): FieldPermissionConfig[] {
    return this.fieldConfigs.filter(f => {
      const matchCat = this.selectedCategory === 'all' || f.category === this.selectedCategory;
      const search = this.fieldSearchTerm.trim().toLowerCase();
      const matchSearch = !search || 
        f.default_label.toLowerCase().includes(search) || 
        (f.custom_label && f.custom_label.toLowerCase().includes(search)) ||
        f.key.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });
  }

  toggleFieldVisible(field: FieldPermissionConfig) {
    field.visible = !field.visible;
    if (!field.visible) {
      field.editable = false;
    }
    this.cdr.detectChanges();
  }

  toggleFieldEditable(field: FieldPermissionConfig) {
    field.editable = !field.editable;
    if (field.editable) {
      field.visible = true;
    }
    this.cdr.detectChanges();
  }

  resetFieldLabel(field: FieldPermissionConfig) {
    field.custom_label = '';
    this.cdr.detectChanges();
  }

  resetAllFieldsToDefault() {
    this.fieldConfigs = mergeFieldPermissions(null, this.dynamicFieldsList);
    this.toast.show('info', 'تنظیمات فیلدها به مقادیر اولیه بازنشانی شد.');
    this.cdr.detectChanges();
  }

  selectAllVisible(val: boolean) {
    this.filteredFieldConfigs.forEach(f => {
      f.visible = val;
      if (!val) f.editable = false;
    });
    this.cdr.detectChanges();
  }

  // ── Customs / Financial Field Methods ───────────────────────────────────────
  get filteredDocFieldConfigs(): FieldPermissionConfig[] {
    return this.docFieldConfigs.filter(f => {
      const matchCat = this.selectedDocCategory === 'all' || f.category === this.selectedDocCategory;
      const search = this.docFieldSearchTerm.trim().toLowerCase();
      const matchSearch = !search || 
        f.default_label.toLowerCase().includes(search) || 
        (f.custom_label && f.custom_label.toLowerCase().includes(search)) ||
        f.key.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });
  }

  toggleDocFieldVisible(field: FieldPermissionConfig) {
    field.visible = !field.visible;
    if (!field.visible) {
      field.editable = false;
    }
    this.cdr.detectChanges();
  }

  toggleDocFieldEditable(field: FieldPermissionConfig) {
    field.editable = !field.editable;
    if (field.editable) {
      field.visible = true;
    }
    this.cdr.detectChanges();
  }

  resetDocFieldLabel(field: FieldPermissionConfig) {
    field.custom_label = '';
    this.cdr.detectChanges();
  }

  resetAllDocFieldsToDefault() {
    this.docFieldConfigs = mergeDocFieldPermissions(null, this.dynamicFieldsList);
    this.toast.show('info', 'تنظیمات فیلدهای کارتابل مالی به مقادیر اولیه بازنشانی شد.');
    this.cdr.detectChanges();
  }

  selectAllDocVisible(val: boolean) {
    this.filteredDocFieldConfigs.forEach(f => {
      f.visible = val;
      if (!val) f.editable = false;
    });
    this.cdr.detectChanges();
  }

  saveSettings() {
    this.isLoading = true;
    
    // Convert current values to a simple dictionary for saving overrides
    const payload: any = {};
    for (const key of Object.keys(this.settings)) {
      payload[key] = this.settings[key].value;
    }

    // Serialize Counter fieldConfigs
    const configMap: Record<string, any> = {};
    this.fieldConfigs.forEach(f => {
      configMap[f.key] = {
        visible: f.visible,
        editable: f.editable,
        custom_label: f.custom_label?.trim() || ''
      };
    });
    payload['field_permissions_counter'] = configMap;

    // Serialize Customs/Doc fieldConfigs
    const docConfigMap: Record<string, any> = {};
    this.docFieldConfigs.forEach(f => {
      docConfigMap[f.key] = {
        visible: f.visible,
        editable: f.editable,
        custom_label: f.custom_label?.trim() || ''
      };
    });
    payload['field_permissions_doc'] = docConfigMap;
    
    this.settingsService.saveWarehouseSettings(this.warehouseId!, payload).subscribe({
      next: () => {
        this.toast.show('success', 'تنظیمات انبار و فیلدهای کارتابل‌ها با موفقیت ذخیره شد.');
        this.loadSettings();
      },
      error: () => {
        this.toast.show('error', 'خطا در ذخیره تنظیمات انبار.');
        this.isLoading = false;
      }
    });
  }


  get hasOperationsOverride(): boolean {
    if (!this.settings) return false;
    const opKeys = [
      'require_supervisor_approval',
      'require_doc_supervisor_approval',
      'blind_counting',
      'counter_can_view_history',
      'counter_can_view_previous_notes',
      'financial_can_view_history',
      'financial_can_view_previous_notes',
      'scanner_camera_preset',
      'scanner_custom_resolution',
      'scanner_custom_interval_ms',
      'scanner_custom_roi_size',
      'scanner_custom_try_harder',
      'default_conflict_strategy',
      'offline_sync_interval_minutes',
      'offline_cache_ttl_minutes'
    ];
    return opKeys.some(k => this.settings[k]?.is_override);
  }

  async resetOperationsSettings() {
    const confirmed = await this.confirm.open({
      title: 'حذف تنظیمات اختصاصی قوانین عملیاتی',
      message: 'آیا از حذف تمام تنظیمات اختصاصی این بخش و بازگشت به تنظیمات کلان سیستم اطمینان دارید؟',
      confirmText: 'بله، حذف شود',
      type: 'warning'
    });
    
    if (confirmed) {
      this.isLoading = true;
      const opKeys = [
        'require_supervisor_approval',
        'require_doc_supervisor_approval',
        'blind_counting',
        'counter_can_view_history',
        'counter_can_view_previous_notes',
        'financial_can_view_history',
        'financial_can_view_previous_notes',
        'scanner_camera_preset',
        'scanner_custom_resolution',
        'scanner_custom_interval_ms',
        'scanner_custom_roi_size',
        'scanner_custom_try_harder',
        'default_conflict_strategy',
        'offline_sync_interval_minutes',
        'offline_cache_ttl_minutes'
      ];
      this.settingsService.resetWarehouseSettings(this.warehouseId!, opKeys).subscribe({
        next: () => {
          this.toast.show('success', 'تنظیمات قوانین عملیاتی به مقادیر پیش‌فرض کلان بازگشت.');
          this.loadSettings();
        },
        error: () => {
          this.toast.show('error', 'خطا در بازنشانی تنظیمات.');
          this.isLoading = false;
        }
      });
    }
  }

  async resetSetting(key: string) {
    const confirmed = await this.confirm.open({
      title: 'حذف تنظیم اختصاصی',
      message: 'آیا از حذف این تنظیم اختصاصی و بازگشت به مقدار پیش‌فرض کلان اطمینان دارید؟',
      confirmText: 'بله، حذف شود',
      type: 'warning'
    });
    
    if (confirmed) {
      this.isLoading = true;
      this.settingsService.resetWarehouseSettings(this.warehouseId!, [key]).subscribe({
        next: () => {
          this.toast.show('success', 'تنظیم به مقدار پیش‌فرض بازگشت.');
          this.loadSettings();
        },
        error: () => {
          this.toast.show('error', 'خطا در بازنشانی تنظیم.');
          this.isLoading = false;
        }
      });
    }
  }

  // ─── Database Backup & Restore Methods ─────────────────────────────────────

  loadBackups() {
    this.isLoadingBackups = true;
    this.backupApi.getBackups().subscribe({
      next: (res) => {
        this.backupsList = res;
        this.isLoadingBackups = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingBackups = false;
        const msg = err.error?.detail || 'خطا در دریافت لیست نسخه‌های پشتیبان';
        this.toast.show('error', msg);
        this.cdr.detectChanges();
      }
    });
  }

  createBackup() {
    this.isCreatingBackup = true;
    this.backupApi.createBackup(this.newBackupDescription.trim() || undefined).subscribe({
      next: (res) => {
        this.isCreatingBackup = false;
        this.newBackupDescription = '';
        this.toast.show('success', `نسخه پشتیبان ${res.backup.filename} با موفقیت ایجاد شد.`);
        this.loadBackups();
      },
      error: (err) => {
        this.isCreatingBackup = false;
        const msg = err.error?.error || err.error?.detail || 'خطا در ایجاد فایل پشتیبان';
        this.toast.show('error', msg);
      }
    });
  }

  verifyBackup(backup: DatabaseBackup) {
    this.isVerifyingBackup = true;
    this.verifyResult = null;
    this.backupApi.verifyBackup(backup.filename).subscribe({
      next: (res) => {
        this.isVerifyingBackup = false;
        this.verifyResult = res;
        if (res.is_valid) {
          this.toast.show('success', `یکپارچگی و سلامت فایل ${backup.filename} با موفقیت تایید شد.`);
        } else {
          this.toast.show('error', `خطای سلامت فایل: ${res.error}`);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isVerifyingBackup = false;
        const msg = err.error?.error || 'خطا در بررسی فایل پشتیبان';
        this.toast.show('error', msg);
      }
    });
  }

  openRestoreModal(backup: DatabaseBackup) {
    this.selectedBackupForRestore = backup;
    this.restoreConfirmInput = '';
    this.isRestoreModalOpen = true;
  }

  closeRestoreModal() {
    this.isRestoreModalOpen = false;
    this.selectedBackupForRestore = null;
    this.restoreConfirmInput = '';
    this.isRestoringDatabase = false;
  }

  executeRestore() {
    if (!this.selectedBackupForRestore) return;
    if (this.restoreConfirmInput.trim() !== 'RESTORE_DATABASE_CONFIRM') {
      this.toast.show('error', 'لطفاً عبارت تاییدیه امنیتی RESTORE_DATABASE_CONFIRM را به صورت دقیق تایپ نمایید.');
      return;
    }

    this.isRestoringDatabase = true;
    this.backupApi.restoreBackup(this.selectedBackupForRestore.filename, this.restoreConfirmInput.trim()).subscribe({
      next: (res) => {
        this.isRestoringDatabase = false;
        this.toast.show('success', res.message || 'پایگاه داده با موفقیت بازیابی شد.');
        this.closeRestoreModal();
        this.loadBackups();
      },
      error: (err) => {
        this.isRestoringDatabase = false;
        const msg = err.error?.error || err.error?.detail || 'خطا در بازیابی پایگاه‌داده';
        this.toast.show('error', msg);
      }
    });
  }

  downloadBackup(backup: DatabaseBackup) {
    const url = this.backupApi.downloadBackupUrl(backup.filename);
    window.open(url, '_blank');
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDateTime(iso: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const datePart = d.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timePart = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${datePart} ${timePart}`;
    } catch {
      return iso;
    }
  }
}
