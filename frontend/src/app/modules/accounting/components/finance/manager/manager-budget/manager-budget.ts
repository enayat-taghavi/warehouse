import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-manager-budget-hub',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './manager-budget.html',
  styleUrl: './manager-budget.css'
})
export class ManagerBudgetComponent {}
