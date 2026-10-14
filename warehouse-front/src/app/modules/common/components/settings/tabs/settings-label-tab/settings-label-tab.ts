import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelDesigner } from '../../../../../../components/label-designer/label-designer';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-settings-label-tab',
  standalone: true,
  imports: [CommonModule, LabelDesigner, SvgIconDirective],
  templateUrl: './settings-label-tab.html'
})
export class SettingsLabelTabComponent {}
