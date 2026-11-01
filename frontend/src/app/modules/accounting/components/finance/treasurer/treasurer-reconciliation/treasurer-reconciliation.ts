import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-treasurer-reconciliation-hub',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './treasurer-reconciliation.html',
  styleUrl: './treasurer-reconciliation.css'
})
export class TreasurerReconciliationComponent {}
