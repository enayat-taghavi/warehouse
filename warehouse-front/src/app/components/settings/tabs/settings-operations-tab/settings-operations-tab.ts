import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchComponent } from '../../../../shared/components/toggle-switch/toggle-switch.component';
import { SystemSettingsConfig } from '../../../../core/models/system-settings.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-settings-operations-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ToggleSwitchComponent, SvgIconDirective],
  templateUrl: './settings-operations-tab.html'
})
export class SettingsOperationsTabComponent {
  @Input({ required: true }) settings!: SystemSettingsConfig;
  @Input() scannerPreset: string = 'default';
  @Output() scannerPresetChange = new EventEmitter<string>();

  onScannerPresetChange(val: string) {
    this.scannerPresetChange.emit(val);
  }
}
