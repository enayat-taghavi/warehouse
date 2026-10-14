import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-__MODULE_KEBAB__-sample-page',
  standalone: true,
  imports: [CommonModule, ActionButtonComponent, SvgIconDirective],
  templateUrl: './sample-page.html',
})
export class __MODULE_PASCAL__SamplePage {
  title = '__MODULE_TITLE_FA__';

  onRefresh(): void {
    // بازخوانی اطلاعات نمونه
  }

  onCreate(): void {
    // ثبت رکورد جدید نمونه
  }
}
