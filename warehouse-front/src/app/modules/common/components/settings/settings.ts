import { Component, OnInit, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../core/services/settings';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { 
  FieldPermissionConfig, 
  mergeFieldPermissions,
  mergeDocFieldPermissions 
} from '../../../../core/models/field-config.model';
import { DynamicFieldApiService } from '../../../../core/api/dynamic-field-api.service';
import { finalize } from 'rxjs/operators';
import { SystemSettingsConfig } from '../../../../core/models/system-settings.model';
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SettingsOperationsTabComponent } from './tabs/settings-operations-tab/settings-operations-tab';
import { SettingsCounterFieldsTabComponent } from './tabs/settings-counter-fields-tab/settings-counter-fields-tab';
import { SettingsDocFieldsTabComponent } from './tabs/settings-doc-fields-tab/settings-doc-fields-tab';
import { SettingsLabelTabComponent } from './tabs/settings-label-tab/settings-label-tab';
import { SettingsBackupTabComponent } from './tabs/settings-backup-tab/settings-backup-tab';
import { ConfirmDialogService } from '../../../../shared';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { PLATFORM_ENTITY_ICONS } from '../../../../shared/icons/semantic-icons';

@Component({
  selector: 'app-settings',
  imports: [
    CommonModule, 
    FormsModule, 
    SettingsOperationsTabComponent, 
    SettingsCounterFieldsTabComponent, 
    SettingsDocFieldsTabComponent, 
    SettingsLabelTabComponent, 
    SettingsBackupTabComponent,
    SvgIconDirective,
    TabBarComponent,
    ActionButtonComponent
  ],
  templateUrl: './settings.html'
})
export class Settings implements OnInit {
  private destroyRef = inject(DestroyRef);
  isLoading = true;
  settings = {} as SystemSettingsConfig;
  activeTab: 'operations' | 'label' | 'counter_fields' | 'doc_fields' | 'backup' = 'operations';

  readonly tabs: TabDef[] = [
    { id: 'operations', label: 'قوانین عملیاتی', shortLabel: 'عملیات', icon: 'shield' },
    { id: 'counter_fields', label: 'فیلدهای انبارگردان', shortLabel: 'انبارگردان', icon: 'check-square-2' },
    { id: 'doc_fields', label: 'فیلدهای کارتابل مالی', shortLabel: 'مالی', icon: 'file-text' },
    { id: 'label', label: 'طراح لیبل', shortLabel: 'لیبل', icon: 'printer' },
    { id: 'backup', label: 'پشتیبان‌گیری و بازیابی', shortLabel: 'پشتیبان', icon: PLATFORM_ENTITY_ICONS.backup },
  ];

  // ── Field Permissions State ────────────────────────────────────────────────
  fieldConfigs: FieldPermissionConfig[] = [];
  docFieldConfigs: FieldPermissionConfig[] = [];
  dynamicFieldsList: any[] = [];
  dynamicFieldsLoadFailed = false;

  originalSettings: any = {};
  rawFieldPermsCounter: any = {};
  rawFieldPermsDoc: any = {};
  currentEtag: string | null = null;

  // ── Barcode Scanner Delimiters State ─────────────────────────────────────────
  scannerPreset: 'default' | 'control' | 'hybrid' | 'excel' | 'custom' = 'default';

  // ── Permissions State ───────────────────────────────────────────────────────
  canEditSettings = computed(() => !!(
    this.auth.user()?.is_superuser ||
    this.auth.user()?.permissions?.includes('perm_sys_settings')
  ));

  constructor(
    private settingsService: SettingsService,
    private dynamicFieldApi: DynamicFieldApiService,
    private toast: ToastService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private confirm: ConfirmDialogService
  ) {}

  ngOnInit() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params['tab']) {
          const tab = params['tab'];
          if (['operations', 'label', 'counter_fields', 'doc_fields', 'backup'].includes(tab)) {
            this.activeTab = tab as any;
          }
        }
      });

    this.loadSettings();
  }

  setTab(tab: string) {
    if (['operations', 'label', 'counter_fields', 'doc_fields', 'backup'].includes(tab)) {
      this.activeTab = tab as any;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab },
        queryParamsHandling: 'merge'
      });
    }
  }

  loadSettings() {
    this.isLoading = true;
    this.dynamicFieldsLoadFailed = false;

    this.dynamicFieldApi.getFields()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.fetchGlobalSettings();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.dynamicFieldsList = Array.isArray(res) ? res : (res?.results || []);
          this.dynamicFieldsLoadFailed = false;
        },
        error: () => {
          this.dynamicFieldsList = [];
          this.dynamicFieldsLoadFailed = true;
          this.toast.show('error', 'خطا در بارگذاری لیست فیلدهای پویا. امکان ویرایش و ذخیره دسترسی فیلدها مسدود شد.');
        }
      });
  }

  fetchGlobalSettings() {
    this.settingsService.getGlobalSettingsWithMeta()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, etag }) => {
          this.currentEtag = etag;
          this.settings = data || {};
          this.originalSettings = structuredClone(this.settings);
          this.rawFieldPermsCounter = structuredClone(this.settings.field_permissions_counter || {});

          this.fieldConfigs = mergeFieldPermissions(
            this.settings.field_permissions_counter,
            this.dynamicFieldsList
          );
          this.docFieldConfigs = mergeDocFieldPermissions(
            this.settings.field_permissions_doc,
            this.dynamicFieldsList
          );

          const initCounterMap: Record<string, any> = structuredClone(this.settings.field_permissions_counter || {});
          this.fieldConfigs.forEach(f => {
            initCounterMap[f.key] = {
              visible: f.visible,
              editable: f.editable,
              custom_label: f.custom_label?.trim() || ''
            };
          });
          this.rawFieldPermsCounter = initCounterMap;

          const initDocMap: Record<string, any> = structuredClone(this.settings.field_permissions_doc || {});
          this.docFieldConfigs.forEach(f => {
            initDocMap[f.key] = {
              visible: f.visible,
              editable: f.editable,
              custom_label: f.custom_label?.trim() || ''
            };
          });
          this.rawFieldPermsDoc = initDocMap;

          const rowSep = this.settings.scanner_row_delimiter ?? ';';
          const colSep = this.settings.scanner_col_delimiter ?? '|';
          this.scannerPreset = this.detectScannerPreset(rowSep, colSep);

          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.toast.show('error', 'خطا در دریافت تنظیمات سیستم.');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  // ── Scanner Separator Methods ───────────────────────────────────────────────
  onScannerPresetChange(val: string) {
    this.scannerPreset = val as any;
    if (val === 'default') {
      this.settings.scanner_row_delimiter = ';';
      this.settings.scanner_col_delimiter = '|';
    } else if (val === 'control') {
      this.settings.scanner_row_delimiter = '\x1E';
      this.settings.scanner_col_delimiter = '\x1F';
    } else if (val === 'hybrid') {
      this.settings.scanner_row_delimiter = '\x1E;';
      this.settings.scanner_col_delimiter = '\x1F|';
    } else if (val === 'excel') {
      this.settings.scanner_row_delimiter = '\n';
      this.settings.scanner_col_delimiter = '\t';
    }
  }

  detectScannerPreset(rowSep: string, colSep: string): 'default' | 'control' | 'hybrid' | 'excel' | 'custom' {
    if (rowSep === '\x1E' && colSep === '\x1F') return 'control';
    if (rowSep === '\x1E;' && colSep === '\x1F|') return 'hybrid';
    if (rowSep === '\n' && colSep === '\t') return 'excel';
    if (rowSep === ';' && colSep === '|') return 'default';
    return 'custom';
  }

  async resetAllFieldsToDefault() {
    const res = await this.confirm.open({
      title: 'بازنشانی تنظیمات انبارگردان',
      message: 'آیا از بازنشانی تنظیمات به حالت اولیه اطمینان دارید؟ تمام برچسب‌های سفارشی حذف خواهند شد.',
      type: 'danger'
    });
    if (res === true) {
      this.fieldConfigs = mergeFieldPermissions(null, this.dynamicFieldsList);
      this.toast.show('info', 'تنظیمات فیلدهای انبارگردان بازنشانی شد (جهت اعمال نهایی روی دکمه ذخیره کلیک کنید).');
    }
  }

  resetAllDocFieldsToDefault() {
    this.docFieldConfigs = mergeDocFieldPermissions(null, this.dynamicFieldsList);
    this.toast.show('info', 'تنظیمات فیلدهای کارتابل مالی به حالت پیش‌فرض اولیه بازنشانی شد (جهت اعمال نهایی روی دکمه ذخیره کلیک کنید).');
  }

  hasChanges(): boolean {
    if (!this.settings || !this.originalSettings) return false;

    // Check basic settings delta
    for (const key of Object.keys(this.settings)) {
      if (key !== 'field_permissions_counter' && key !== 'field_permissions_doc') {
        if (JSON.stringify(this.settings[key]) !== JSON.stringify(this.originalSettings[key])) {
          return true;
        }
      }
    }

    // Check Counter fieldConfigs
    const configMap: Record<string, any> = structuredClone(this.rawFieldPermsCounter);
    this.fieldConfigs.forEach(f => {
      configMap[f.key] = {
        visible: f.visible,
        editable: f.editable,
        custom_label: f.custom_label?.trim() || ''
      };
    });
    if (JSON.stringify(configMap) !== JSON.stringify(this.rawFieldPermsCounter)) {
      return true;
    }

    // Check Customs/Doc fieldConfigs
    const docConfigMap: Record<string, any> = structuredClone(this.rawFieldPermsDoc);
    this.docFieldConfigs.forEach(f => {
      docConfigMap[f.key] = {
        visible: f.visible,
        editable: f.editable,
        custom_label: f.custom_label?.trim() || ''
      };
    });
    if (JSON.stringify(docConfigMap) !== JSON.stringify(this.rawFieldPermsDoc)) {
      return true;
    }

    return false;
  }

  saveGlobalSettings() {
    if (this.dynamicFieldsLoadFailed) return;
    this.isLoading = true;

    // Serialize Counter fieldConfigs
    const configMap: Record<string, any> = structuredClone(this.rawFieldPermsCounter);
    this.fieldConfigs.forEach(f => {
      configMap[f.key] = {
        visible: f.visible,
        editable: f.editable,
        custom_label: f.custom_label?.trim() || ''
      };
    });
    this.settings.field_permissions_counter = configMap;

    // Serialize Customs/Doc fieldConfigs
    const docConfigMap: Record<string, any> = structuredClone(this.rawFieldPermsDoc);
    this.docFieldConfigs.forEach(f => {
      docConfigMap[f.key] = {
        visible: f.visible,
        editable: f.editable,
        custom_label: f.custom_label?.trim() || ''
      };
    });
    this.settings.field_permissions_doc = docConfigMap;

    const delta: any = {};
    for (const key of Object.keys(this.settings)) {
      if (JSON.stringify(this.settings[key]) !== JSON.stringify(this.originalSettings[key])) {
        delta[key] = this.settings[key];
      }
    }

    if (Object.keys(delta).length === 0) {
      this.toast.show('info', 'هیچ تغییری برای ذخیره وجود ندارد.');
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    this.settingsService.saveGlobalSettings(delta, this.currentEtag).subscribe({
      next: (res: any) => {
        if (res?.etag) {
          this.currentEtag = res.etag;
        }
        this.toast.show('success', 'تنظیمات کلان سیستم و فیلدهای کارتابل‌ها با موفقیت ذخیره شد.');
        this.originalSettings = structuredClone(this.settings);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err?.status === 412 || err?.error?.code === 'CONCURRENT_MODIFICATION') {
          const msg = err?.error?.error || 'تنظیمات همزمان توسط کاربر یا تب دیگری تغییر کرده است. لطفاً صفحه را تازه‌سازی کنید.';
          this.toast.show('error', msg);
        } else {
          const msg = err?.error?.error || 'خطا در ذخیره تنظیمات سیستم.';
          this.toast.show('error', msg);
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
