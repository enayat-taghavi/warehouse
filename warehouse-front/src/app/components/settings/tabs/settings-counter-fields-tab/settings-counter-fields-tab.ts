import { Component, input, signal, computed, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldPermissionConfig, CATEGORY_LABELS } from '../../../../core/models/field-config.model';
import { SystemSettingsConfig } from '../../../../core/models/system-settings.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-settings-counter-fields-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './settings-counter-fields-tab.html'
})
export class SettingsCounterFieldsTabComponent {
  settings = input.required<SystemSettingsConfig>();
  fieldConfigs = input.required<FieldPermissionConfig[]>();
  dynamicFieldsList = input.required<any[]>();

  @Output() resetRequested = new EventEmitter<void>();

  categoryLabels = CATEGORY_LABELS;
  categoryKeys = Object.keys(CATEGORY_LABELS);

  selectedCategory = signal<string>('all');
  fieldSearchTerm = signal<string>('');

  filteredFieldConfigs = computed(() => {
    const configs = this.fieldConfigs();
    const cat = this.selectedCategory();
    const search = this.fieldSearchTerm().trim().toLowerCase();

    return configs.filter(f => {
      const matchCat = cat === 'all' || f.category === cat;
      const matchSearch = !search || 
        f.default_label.toLowerCase().includes(search) || 
        (f.custom_label && f.custom_label.toLowerCase().includes(search)) ||
        f.key.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });
  });

  toggleFieldVisible(field: FieldPermissionConfig) {
    field.visible = !field.visible;
    if (!field.visible) {
      field.editable = false;
    }
  }

  toggleFieldEditable(field: FieldPermissionConfig) {
    field.editable = !field.editable;
    if (field.editable) {
      field.visible = true;
    }
  }

  resetFieldLabel(field: FieldPermissionConfig) {
    field.custom_label = '';
  }

  resetAllFieldsToDefault() {
    this.resetRequested.emit();
  }

  selectAllVisible(val: boolean) {
    this.filteredFieldConfigs().forEach(f => {
      f.visible = val;
      if (!val) f.editable = false;
    });
  }

  selectAllEditable(val: boolean) {
    this.filteredFieldConfigs().forEach(f => {
      f.editable = val;
      if (val) f.visible = true;
    });
  }
}
