import { Component, OnInit, Type, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';

@Component({
  selector: 'app-settings-label-tab',
  standalone: true,
  imports: [CommonModule, SvgIconDirective, LoadingSkeletonComponent, ActionButtonComponent],
  templateUrl: './settings-label-tab.html'
})
export class SettingsLabelTabComponent implements OnInit {
  private moduleRegistry = inject(ModuleRegistryService);

  /** بارگذار طراح لیبل از نخستین ماژول نصب‌شده‌ای که آن را ارائه می‌کند */
  private readonly loader = this.moduleRegistry.getExtensions('loadLabelDesigner')[0]?.extension;
  readonly hasLabelDesigner = !!this.loader;
  readonly labelDesignerComponent = signal<Type<unknown> | null>(null);
  readonly loadFailed = signal(false);

  ngOnInit(): void {
    this.loadDesigner();
  }

  loadDesigner(): void {
    if (!this.loader) return;
    this.loadFailed.set(false);
    this.loader()
      .then(component => this.labelDesignerComponent.set(component))
      .catch(() => this.loadFailed.set(true));
  }
}
