import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { CountTaskApiService } from '../../api/count-task-api.service';
import { ItemApiService } from '../../api/item-api.service';
import { DynamicFieldApiService } from '../../api/dynamic-field-api.service';
import { SettingsService } from '../../../../core/services/settings';
import { 
  FieldPermissionConfig, 
  DEFAULT_ITEM_FIELD_PERMISSIONS, 
  mergeFieldPermissions 
} from '../../../../core/models/field-config.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-field',
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './field.html',
  styleUrl: './field.css'
})
export class Field implements OnInit {
  tasks: any[] = [];
  isLoading = true;
  isSubmitting = false;
  
  selectedTask: any = null;
  countedQty: number | null = null;
  counterNote = '';
  isBlindCounting = false;

  // ── Dynamic Field Permissions State ────────────────────────────────────────
  fieldConfigs: FieldPermissionConfig[] = [];
  editableValues: Record<string, any> = {};
  dynamicFieldsList: any[] = [];

  constructor(
    public state: StateService, 
    private toast: ToastService,
    private countTaskApi: CountTaskApiService,
    private itemApi: ItemApiService,
    private dynamicFieldApi: DynamicFieldApiService,
    private cdr: ChangeDetectorRef,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadTasks();
    this.loadFieldPermissions();
  }

  loadFieldPermissions() {
    const whId = this.state.appState.activeWarehouseId;
    const numWhId = (whId && whId !== 'ALL') ? Number(whId) : undefined;

    this.dynamicFieldApi.getFields(numWhId).subscribe({
      next: (dfRes: any) => {
        this.dynamicFieldsList = Array.isArray(dfRes) ? dfRes : (dfRes?.results || []);
        this.fetchSettings(numWhId);
      },
      error: () => {
        this.dynamicFieldsList = [];
        this.fetchSettings(numWhId);
      }
    });
  }

  private fetchSettings(whId?: number) {
    if (whId) {
      this.settingsService.getWarehouseSettings(whId).subscribe({
        next: (res: any) => {
          this.isBlindCounting = res?.blind_counting?.value === 'blind';
          const savedPerms = res?.field_permissions_counter?.value;
          this.fieldConfigs = mergeFieldPermissions(savedPerms, this.dynamicFieldsList);
          this.cdr.detectChanges();
        },
        error: () => {
          this.fieldConfigs = mergeFieldPermissions(null, this.dynamicFieldsList);
          this.cdr.detectChanges();
        }
      });
    } else {
      this.settingsService.getGlobalSettings().subscribe({
        next: (res: any) => {
          this.isBlindCounting = res?.blind_counting === 'blind';
          const savedPerms = res?.field_permissions_counter;
          this.fieldConfigs = mergeFieldPermissions(savedPerms, this.dynamicFieldsList);
          this.cdr.detectChanges();
        },
        error: () => {
          this.fieldConfigs = mergeFieldPermissions(null, this.dynamicFieldsList);
          this.cdr.detectChanges();
        }
      });
    }
  }

  // ── Computed Field Lists ───────────────────────────────────────────────────
  get visibleInfoFields(): FieldPermissionConfig[] {
    // Fields that are visible, NOT editable, and not the primary count inputs
    return this.fieldConfigs.filter(f => 
      f.visible && 
      !f.editable && 
      f.key !== 'counted_qty' && 
      f.key !== 'counter_note' &&
      // If blind counting is active, exclude inventory/bal4miv
      (!this.isBlindCounting || (f.key !== 'inventory' && f.key !== 'bal4miv'))
    );
  }

  get editableFormFields(): FieldPermissionConfig[] {
    // Extra fields that are configured as editable (excluding primary counted_qty/counter_note)
    return this.fieldConfigs.filter(f => 
      f.visible && 
      f.editable && 
      f.key !== 'counted_qty' && 
      f.key !== 'counter_note'
    );
  }

  getFieldLabel(field: FieldPermissionConfig): string {
    return field.custom_label?.trim() || field.default_label;
  }

  getFieldDisplayValue(field: FieldPermissionConfig): string {
    if (!this.selectedTask?.item_details) return '-';
    const item = this.selectedTask.item_details;

    let val: any;
    if (field.is_dynamic) {
      const realKey = field.key.replace(/^dyn_/, '');
      val = item.dynamic_data?.[realKey];
    } else {
      val = item[field.key];
    }

    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'boolean') return val ? 'بله' : 'خیر';
    return String(val);
  }

  loadTasks() {
    this.isLoading = true;
    this.cdr.detectChanges();
    this.countTaskApi.getAll().subscribe({
      next: (res: any) => {
        this.tasks = Array.isArray(res) ? res : (res.results || []);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در دریافت لیست شمارش');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  selectTask(task: any) {
    this.selectedTask = task;
    this.countedQty = task.counted_balance !== null ? task.counted_balance : null;
    this.counterNote = task.counter_note || '';

    // Initialize editable values
    this.editableValues = {};
    const item = task.item_details || {};
    this.editableFormFields.forEach(f => {
      if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        this.editableValues[f.key] = item.dynamic_data?.[realKey] ?? '';
      } else {
        this.editableValues[f.key] = item[f.key] ?? '';
      }
    });
  }

  cancelCount() {
    this.selectedTask = null;
    this.countedQty = null;
    this.counterNote = '';
    this.editableValues = {};
  }

  submitCount() {
    if (this.countedQty === null || this.countedQty < 0) {
      return this.toast.show('error', 'لطفاً مقدار شمارش شده را به درستی وارد کنید.');
    }
    
    this.isSubmitting = true;
    this.cdr.detectChanges();

    // 1. Submit count task update
    this.countTaskApi.update(this.selectedTask.id, {
      counted_balance: this.countedQty?.toString() || null,
      counter_note: this.counterNote,
      status: 'COUNTED'
    }).subscribe({
      next: () => {
        // 2. If there are extra editable fields modified, save them to the item
        this.saveExtraEditedFields();
      },
      error: () => {
        this.isSubmitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  private saveExtraEditedFields() {
    if (this.editableFormFields.length === 0 || !this.selectedTask?.item) {
      this.finishSubmission();
      return;
    }

    const itemPayload: Record<string, any> = {};
    const dynamicDataUpdates: Record<string, any> = {};
    let hasChanges = false;

    this.editableFormFields.forEach(f => {
      const newVal = this.editableValues[f.key];
      if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        dynamicDataUpdates[realKey] = newVal;
        hasChanges = true;
      } else {
        itemPayload[f.key] = newVal;
        hasChanges = true;
      }
    });

    if (Object.keys(dynamicDataUpdates).length > 0) {
      const existingDyn = this.selectedTask.item_details?.dynamic_data || {};
      itemPayload['dynamic_data'] = { ...existingDyn, ...dynamicDataUpdates };
    }

    if (hasChanges && Object.keys(itemPayload).length > 0) {
      const itemId = String(this.selectedTask.item_details?.id || this.selectedTask.item);
      this.itemApi.update(itemId, itemPayload).subscribe({
        next: () => this.finishSubmission(),
        error: () => this.finishSubmission() // task count is already saved
      });
    } else {
      this.finishSubmission();
    }
  }

  private finishSubmission() {
    this.toast.show('success', 'اطلاعات شمارش با موفقیت در سیستم ثبت شد و به سرپرست ارجاع یافت.');
    this.selectedTask = null;
    this.isSubmitting = false;
    this.loadTasks();
  }
}
