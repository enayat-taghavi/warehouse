import { Component, OnInit, ChangeDetectorRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared';
import { DynamicFieldApiService } from '../../api/dynamic-field-api.service';
import { DynamicFieldDefinition } from '../../../../core/models';
import { AuthStore } from '../../../../core/stores/auth.store';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-dynamic-fields',
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './dynamic-fields.html'
})
export class DynamicFields implements OnInit {
  fields: DynamicFieldDefinition[] = [];
  isLoading = false;
  
  newField: Partial<DynamicFieldDefinition> = {
    name: '',
    label: '',
    field_type: 'text',
    default_value: '',
    is_required: false,
    is_active: true
  };

  editingFieldId: number | null = null;
  editFieldData: Partial<DynamicFieldDefinition> = {};

  showCopyModal = false;
  sourceWarehouseId: number | null = null;
  isCopying = false;

  get currentWarehouseId(): number | null {
    const val = this.authStore.activeWarehouseId();
    return val && val !== 'ALL' ? Number(val) : null;
  }

  get otherWarehouses() {
    return this.state.appState.projects?.filter((w: any) => w.id !== this.currentWarehouseId) || [];
  }

  constructor(
    public state: StateService,
    private toast: ToastService,
    private authStore: AuthStore,
    private fieldApi: DynamicFieldApiService,
    private cdr: ChangeDetectorRef,
    private confirmDialog: ConfirmDialogService
  ) {
    effect(() => {
      const whId = this.authStore.activeWarehouseId();
      if (whId && whId !== 'ALL') {
        this.loadFields();
      } else {
        this.fields = [];
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnInit() {
    this.loadFields();
  }

  loadFields() {
    const whId = this.currentWarehouseId;
    if (!whId) return;
    
    this.isLoading = true;
    this.fieldApi.getFields(whId).subscribe({
      next: (res: any) => {
        this.fields = res.results || res;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.show('error', 'خطا در دریافت لیست فیلدها');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  addField() {
    if (!this.newField.name || !this.newField.label) {
      this.toast.show('error', 'نام و عنوان فیلد الزامی است');
      return;
    }

    const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    if (!nameRegex.test(this.newField.name)) {
      this.toast.show('error', 'نام سیستمی فقط باید شامل حروف انگلیسی، اعداد و خط تیره (_) باشد و با حرف شروع شود');
      return;
    }
    
    this.newField.warehouse = this.currentWarehouseId;
    
    this.isLoading = true;
    this.fieldApi.createField(this.newField).subscribe({
      next: (res) => {
        this.toast.show('success', 'فیلد با موفقیت اضافه شد');
        this.fields.push(res);
        this.newField = { name: '', label: '', field_type: 'text', default_value: '', is_required: false, is_active: true };
        this.isLoading = false;
      },
      error: (err) => {
        this.toast.show('error', 'خطا در ثبت فیلد (احتمالاً نام سیستمی تکراری است)');
        this.isLoading = false;
      }
    });
  }

  startEdit(field: DynamicFieldDefinition) {
    this.editingFieldId = field.id!;
    this.editFieldData = { ...field };
  }

  cancelEdit() {
    this.editingFieldId = null;
    this.editFieldData = {};
  }

  saveEdit() {
    if (!this.editFieldData.name || !this.editFieldData.label) {
      this.toast.show('error', 'نام و عنوان فیلد الزامی است');
      return;
    }

    const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    if (!nameRegex.test(this.editFieldData.name)) {
      this.toast.show('error', 'نام سیستمی فقط باید شامل حروف انگلیسی، اعداد و خط تیره (_) باشد و با حرف شروع شود');
      return;
    }

    this.isLoading = true;
    this.fieldApi.updateField(this.editingFieldId!, this.editFieldData).subscribe({
      next: (res) => {
        this.toast.show('success', 'فیلد با موفقیت ویرایش شد. در صورت تغییر نام سیستمی، دیتای کالاها نیز بروزرسانی می‌شود.');
        const index = this.fields.findIndex(f => f.id === this.editingFieldId);
        if (index > -1) {
          this.fields[index] = res;
        }
        this.cancelEdit();
        this.isLoading = false;
      },
      error: (err) => {
        this.toast.show('error', 'خطا در ویرایش فیلد');
        this.isLoading = false;
      }
    });
  }

  toggleFieldStatus(field: DynamicFieldDefinition) {
    this.fieldApi.updateField(field.id!, { is_active: !field.is_active }).subscribe({
      next: (res) => {
        field.is_active = res.is_active;
        this.toast.show('success', 'وضعیت فیلد بروزرسانی شد');
      },
      error: () => {
        field.is_active = !field.is_active; // revert
        this.toast.show('error', 'خطا در بروزرسانی');
      }
    });
  }

  async deleteField(field: DynamicFieldDefinition) {
    const confirmed = await this.confirmDialog.open({
      title: 'حذف فیلد داینامیک',
      message: `آیا از حذف فیلد "${field.label}" اطمینان دارید؟ داده‌های ثبت شده برای این فیلد در کالاها مخفی خواهند شد.`,
      confirmText: 'بله، حذف شود',
      cancelText: 'انصراف',
      type: 'danger'
    });

    if (confirmed) {
      this.fieldApi.deleteField(field.id!).subscribe({
        next: () => {
          this.fields = this.fields.filter(f => f.id !== field.id);
          this.toast.show('success', 'فیلد حذف شد');
        },
        // پیام خطا از errorInterceptor می‌آید؛ توست محلی روی آن سوار می‌شد.
        error: () => {}
      });
    }
  }

  openCopyModal() {
    if (this.otherWarehouses.length > 0) {
      this.sourceWarehouseId = this.otherWarehouses[0].id;
    }
    this.showCopyModal = true;
    this.cdr.detectChanges();
  }

  closeCopyModal() {
    this.showCopyModal = false;
    this.cdr.detectChanges();
  }

  confirmCopy() {
    if (!this.sourceWarehouseId) return;
    const targetId = this.currentWarehouseId;
    if (!targetId) return;

    this.isCopying = true;
    this.fieldApi.copyFields(this.sourceWarehouseId, targetId).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'فیلدها با موفقیت کپی شدند');
        this.isCopying = false;
        this.showCopyModal = false;
        this.loadFields(); // Reload fields to show the new ones
      },
      error: () => {
        this.toast.show('error', 'خطا در کپی فیلدها');
        this.isCopying = false;
        this.cdr.detectChanges();
      }
    });
  }
}
