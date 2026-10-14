import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';

@Component({
  selector: 'app-settings-label-tab',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './settings-label-tab.html'
})
export class SettingsLabelTabComponent {
  private moduleRegistry = inject(ModuleRegistryService);

  get labelDesignerComponent() {
    return this.moduleRegistry.getSpec('warehouse')?.extensions?.labelDesignerComponent;
  }
}
