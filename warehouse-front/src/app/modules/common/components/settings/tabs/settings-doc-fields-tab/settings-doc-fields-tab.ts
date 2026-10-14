import { Component, input, signal, computed, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldPermissionConfig, CATEGORY_LABELS } from '../../../../../../core/models/field-config.model';
import { SystemSettingsConfig } from '../../../../../../core/models/system-settings.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-settings-doc-fields-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './settings-doc-fields-tab.html'
})
export class SettingsDocFieldsTabComponent {
  settings = input.required<SystemSettingsConfig>();
  docFieldConfigs = input.required<FieldPermissionConfig[]>();
  dynamicFieldsList = input.required<any[]>();

  @Output() resetRequested = new EventEmitter<void>();

  categoryLabels = CATEGORY_LABELS;
  categoryKeys = Object.keys(CATEGORY_LABELS);

  selectedDocCategory = signal<string>('all');
  docFieldSearchTerm = signal<string>('');

  filteredDocFieldConfigs = computed(() => {
    const configs = this.docFieldConfigs();
    const cat = this.selectedDocCategory();
    const search = this.docFieldSearchTerm().trim().toLowerCase();

    return configs.filter(f => {
      const matchCat = cat === 'all' || f.category === cat;
      const matchSearch = !search || 
        f.default_label.toLowerCase().includes(search) || 
        (f.custom_label && f.custom_label.toLowerCase().includes(search)) ||
        f.key.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });
  });

  toggleDocFieldVisible(field: FieldPermissionConfig) {
    field.visible = !field.visible;
    if (!field.visible) {
      field.editable = false;
    }
  }

  toggleDocFieldEditable(field: FieldPermissionConfig) {
    field.editable = !field.editable;
    if (field.editable) {
      field.visible = true;
    }
  }

  resetDocFieldLabel(field: FieldPermissionConfig) {
    field.custom_label = '';
  }

  resetAllDocFieldsToDefault() {
    this.resetRequested.emit();
  }

  selectAllDocVisible(val: boolean) {
    this.filteredDocFieldConfigs().forEach(f => {
      f.visible = val;
      if (!val) f.editable = false;
    });
  }

  selectAllDocEditable(val: boolean) {
    this.filteredDocFieldConfigs().forEach(f => {
      f.editable = val;
      if (val) f.visible = true;
    });
  }
}
